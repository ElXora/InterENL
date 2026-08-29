/**
 * economyManager.js
 * -----------------------------------------------------
 * Core data layer for the InterENL Store Economy system.
 * Handles economy.json: user records, coin math, blacklist
 * status, and streak/cooldown bookkeeping. Every mutation
 * writes to disk immediately (writeJSONSync is already
 * synchronous/atomic — see utils/storage.js) per the spec's
 * "save immediately" requirement.
 * -----------------------------------------------------
 */

const path = require('path');
const { readJSONSync, writeJSONSync, ensureFileSync } = require('./storage');

const ECONOMY_FILE = path.join(__dirname, '..', 'economy.json');
ensureFileSync(ECONOMY_FILE, []);

/**
 * @typedef {object} EconomyUser
 * @property {string} discordId
 * @property {string} username
 * @property {number} coins
 * @property {number} dailyStreak
 * @property {string|null} lastDaily ISO timestamp or null.
 * @property {string|null} lastWork ISO timestamp or null.
 * @property {number} lootDropsClaimed
 * @property {number} totalCoinsEarned
 * @property {number} licenseWins
 * @property {string} createdDate ISO timestamp.
 * @property {boolean} blacklisted
 * @property {string|null} blacklistReason
 * @property {string|null} blacklistedBy
 * @property {string|null} blacklistedDate
 * @property {string[]} achievements Array of achievement IDs already awarded.
 */

/**
 * Loads the full economy user list.
 * @returns {EconomyUser[]}
 */
function loadAll() {
    return readJSONSync(ECONOMY_FILE, []);
}

/**
 * Persists the full economy user list.
 * @param {EconomyUser[]} users
 */
function saveAll(users) {
    writeJSONSync(ECONOMY_FILE, users);
}

/**
 * Builds a brand new default economy record for a user.
 * @param {string} discordId
 * @param {string} username
 * @returns {EconomyUser}
 */
function buildDefaultUser(discordId, username) {
    return {
        discordId,
        username,
        coins: 0,
        dailyStreak: 0,
        lastDaily: null,
        lastWork: null,
        lootDropsClaimed: 0,
        totalCoinsEarned: 0,
        licenseWins: 0,
        createdDate: new Date().toISOString(),
        blacklisted: false,
        blacklistReason: null,
        blacklistedBy: null,
        blacklistedDate: null,
        achievements: []
    };
}

/**
 * Gets (creating if necessary) a user's economy record. Always
 * keeps `username` fresh so display names stay current.
 * @param {string} discordId
 * @param {string} [username] Current username/tag, used to create/refresh the record.
 * @returns {EconomyUser}
 */
function getOrCreateUser(discordId, username = 'Unknown User') {
    const users = loadAll();
    let user = users.find((u) => u.discordId === discordId);

    if (!user) {
        user = buildDefaultUser(discordId, username);
        users.push(user);
        saveAll(users);
        return user;
    }

    if (username && user.username !== username) {
        user.username = username;
        saveAll(users);
    }

    return user;
}

/**
 * Fetches a user's record without creating one if it doesn't exist.
 * @param {string} discordId
 * @returns {EconomyUser|null}
 */
function getUser(discordId) {
    return loadAll().find((u) => u.discordId === discordId) || null;
}

/**
 * Persists a single (already-mutated) user record back to disk.
 * Internal helper — most callers should use the higher-level
 * mutators below instead of mutating a record directly.
 * @param {EconomyUser} updatedUser
 */
function saveUser(updatedUser) {
    const users = loadAll();
    const index = users.findIndex((u) => u.discordId === updatedUser.discordId);
    if (index === -1) {
        users.push(updatedUser);
    } else {
        users[index] = updatedUser;
    }
    saveAll(users);
}

/**
 * Adds coins to a user's balance. Never lets the balance go
 * negative (clamped at 0 as a defensive floor, though this
 * function only ever adds positive amounts in practice).
 * @param {string} discordId
 * @param {string} username
 * @param {number} amount Must be positive.
 * @param {object} [options]
 * @param {boolean} [options.countAsEarned=true] Whether this counts toward totalCoinsEarned (used for the "1000 Coins" achievement). Transfers received should pass false.
 * @returns {EconomyUser}
 */
function addCoins(discordId, username, amount, { countAsEarned = true } = {}) {
    if (amount < 0) throw new Error('addCoins amount must be positive — use removeCoins for deductions.');

    const user = getOrCreateUser(discordId, username);
    user.coins = Math.max(0, user.coins + amount);
    if (countAsEarned) user.totalCoinsEarned += amount;
    saveUser(user);
    return user;
}

/**
 * Removes coins from a user's balance, clamped at 0 (never negative).
 * @param {string} discordId
 * @param {string} username
 * @param {number} amount Must be positive.
 * @returns {EconomyUser}
 */
function removeCoins(discordId, username, amount) {
    if (amount < 0) throw new Error('removeCoins amount must be positive.');

    const user = getOrCreateUser(discordId, username);
    user.coins = Math.max(0, user.coins - amount);
    saveUser(user);
    return user;
}

/**
 * Sets a user's balance to an exact value (admin use). Clamped at 0.
 * @param {string} discordId
 * @param {string} username
 * @param {number} amount
 * @returns {EconomyUser}
 */
function setCoins(discordId, username, amount) {
    const user = getOrCreateUser(discordId, username);
    user.coins = Math.max(0, amount);
    saveUser(user);
    return user;
}

/**
 * Fully resets a single user's economy profile back to defaults,
 * per the /resetcoins spec (coins, streak, cooldowns, loot count,
 * total earned, license wins — everything except blacklist status
 * and achievements, which are left untouched intentionally).
 * @param {string} discordId
 * @param {string} username
 * @returns {EconomyUser}
 */
function resetUser(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    user.coins = 0;
    user.dailyStreak = 0;
    user.lastDaily = null;
    user.lastWork = null;
    user.lootDropsClaimed = 0;
    user.totalCoinsEarned = 0;
    user.licenseWins = 0;
    saveUser(user);
    return user;
}

/**
 * Wipes the ENTIRE economy — every user's data, permanently.
 * Used by /economy reset (global reset, behind a confirmation step
 * in the command itself since this is highly destructive).
 */
function resetEntireEconomy() {
    saveAll([]);
}

/**
 * Atomically transfers coins from one user to another. Throws a
 * descriptive error (caught by the calling command) if the
 * transfer is invalid for any reason, so nothing is partially
 * applied — either both sides update, or neither does.
 * @param {string} senderId
 * @param {string} senderUsername
 * @param {string} receiverId
 * @param {string} receiverUsername
 * @param {number} amount
 * @returns {{sender: EconomyUser, receiver: EconomyUser}}
 */
function transferCoins(senderId, senderUsername, receiverId, receiverUsername, amount) {
    if (senderId === receiverId) throw new Error('You cannot transfer coins to yourself.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transfer amount must be a positive number.');

    const users = loadAll();
    let sender = users.find((u) => u.discordId === senderId);
    let receiver = users.find((u) => u.discordId === receiverId);

    if (!sender) {
        sender = buildDefaultUser(senderId, senderUsername);
        users.push(sender);
    }
    if (!receiver) {
        receiver = buildDefaultUser(receiverId, receiverUsername);
        users.push(receiver);
    }

    if (sender.blacklisted) throw new Error('You are blacklisted from the InterENL Store Economy and cannot send coins.');
    if (receiver.blacklisted) throw new Error('That user is blacklisted from the InterENL Store Economy and cannot receive coins.');
    if (sender.coins < amount) throw new Error(`You don't have enough VSC — your balance is ${sender.coins}.`);

    sender.coins -= amount;
    receiver.coins += amount;
    // Transfers are a wealth transfer, not new value created — deliberately
    // NOT counted toward totalCoinsEarned, so it can't be farmed via
    // back-and-forth transfers between alt accounts for achievements.

    saveAll(users);
    return { sender, receiver };
}

/**
 * Checks whether a user is blacklisted from the economy.
 * @param {string} discordId
 * @returns {boolean}
 */
function isBlacklisted(discordId) {
    const user = getUser(discordId);
    return user ? Boolean(user.blacklisted) : false;
}

/**
 * Blacklists a user from the economy.
 * @param {string} discordId
 * @param {string} username
 * @param {string} reason
 * @param {string} blacklistedBy Tag of the admin who blacklisted them.
 * @returns {EconomyUser}
 */
function blacklistUser(discordId, username, reason, blacklistedBy) {
    const user = getOrCreateUser(discordId, username);
    user.blacklisted = true;
    user.blacklistReason = reason || 'You have been restricted by a InterENL Store Administrator.';
    user.blacklistedBy = blacklistedBy;
    user.blacklistedDate = new Date().toISOString();
    saveUser(user);
    return user;
}

/**
 * Removes a user's blacklist status.
 * @param {string} discordId
 * @param {string} username
 * @returns {EconomyUser}
 */
function unblacklistUser(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    user.blacklisted = false;
    user.blacklistReason = null;
    user.blacklistedBy = null;
    user.blacklistedDate = null;
    saveUser(user);
    return user;
}

/**
 * Returns the top N users sorted by coin balance, descending.
 * @param {number} [limit=10]
 * @returns {EconomyUser[]}
 */
function getLeaderboard(limit = 10) {
    return loadAll()
        .slice()
        .sort((a, b) => b.coins - a.coins)
        .slice(0, limit);
}

/**
 * Computes a user's 1-indexed rank on the leaderboard (by coins).
 * @param {string} discordId
 * @returns {number} Rank, or the total user count + 1 if not found.
 */
function getUserRank(discordId) {
    const sorted = loadAll()
        .slice()
        .sort((a, b) => b.coins - a.coins);
    const index = sorted.findIndex((u) => u.discordId === discordId);
    return index === -1 ? sorted.length + 1 : index + 1;
}

module.exports = {
    loadAll,
    saveAll,
    getOrCreateUser,
    getUser,
    saveUser,
    addCoins,
    removeCoins,
    setCoins,
    resetUser,
    resetEntireEconomy,
    transferCoins,
    isBlacklisted,
    blacklistUser,
    unblacklistUser,
    getLeaderboard,
    getUserRank
};
