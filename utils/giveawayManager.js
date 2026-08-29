/**
 * giveawayManager.js
 * -----------------------------------------------------
 * Storage + winner-selection logic for the giveaway system.
 * One JSON file (giveaways.json), same synchronous-write
 * pattern as economyManager/progressionManager. Giveaways
 * persist across restarts — giveawayScheduler.js rehydrates
 * and re-checks end times on boot.
 * -----------------------------------------------------
 */

const { readJSONSync, writeJSONSync, ensureFileSync } = require('./storage');
const { GIVEAWAYS_FILE } = require('./paths');

ensureFileSync(GIVEAWAYS_FILE, []);

/**
 * @typedef {object} Giveaway
 * @property {string} id
 * @property {string} guildId
 * @property {string} channelId
 * @property {string} messageId
 * @property {string} prize
 * @property {string} hostId
 * @property {number} winnerCount
 * @property {number|null} minLevel
 * @property {string|null} requiredRoleId
 * @property {number} endsAt Unix ms timestamp.
 * @property {string[]} entries Discord user IDs.
 * @property {'active'|'ended'|'cancelled'} status
 * @property {string[]} winners Discord user IDs of the most recent draw.
 * @property {number} createdAt
 */

function loadAll() {
    return readJSONSync(GIVEAWAYS_FILE, []);
}

function saveAll(giveaways) {
    writeJSONSync(GIVEAWAYS_FILE, giveaways);
}

/**
 * @param {string} id
 * @returns {Giveaway|null}
 */
function getGiveaway(id) {
    return loadAll().find((g) => g.id === id) || null;
}

/**
 * @param {string} messageId
 * @returns {Giveaway|null}
 */
function getGiveawayByMessageId(messageId) {
    return loadAll().find((g) => g.messageId === messageId) || null;
}

/**
 * @param {Giveaway} giveaway
 */
function createGiveaway(giveaway) {
    const giveaways = loadAll();
    giveaways.push(giveaway);
    saveAll(giveaways);
    return giveaway;
}

/**
 * @param {Giveaway} updated
 */
function saveGiveaway(updated) {
    const giveaways = loadAll();
    const index = giveaways.findIndex((g) => g.id === updated.id);
    if (index === -1) giveaways.push(updated);
    else giveaways[index] = updated;
    saveAll(giveaways);
}

/**
 * @returns {Giveaway[]} Every giveaway still marked active, regardless of endsAt.
 */
function getActiveGiveaways() {
    return loadAll().filter((g) => g.status === 'active');
}

/**
 * Adds an entrant if they haven't already entered. Returns false
 * if they were already in (duplicate-entry guard).
 * @param {string} giveawayId
 * @param {string} discordId
 * @returns {boolean} true if newly entered.
 */
function addEntry(giveawayId, discordId) {
    const giveaways = loadAll();
    const giveaway = giveaways.find((g) => g.id === giveawayId);
    if (!giveaway) return false;
    if (giveaway.entries.includes(discordId)) return false;
    giveaway.entries.push(discordId);
    saveAll(giveaways);
    return true;
}

/**
 * Randomly draws up to `winnerCount` unique winners from entries.
 * @param {string[]} entries
 * @param {number} winnerCount
 * @returns {string[]}
 */
function drawWinners(entries, winnerCount) {
    const pool = [...entries];
    const winners = [];
    while (pool.length > 0 && winners.length < winnerCount) {
        const index = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(index, 1)[0]);
    }
    return winners;
}

module.exports = { loadAll, saveAll, getGiveaway, getGiveawayByMessageId, createGiveaway, saveGiveaway, getActiveGiveaways, addEntry, drawWinners };
