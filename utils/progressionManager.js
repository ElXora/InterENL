/**
 * progressionManager.js
 * -----------------------------------------------------
 * Core data layer for everything in the "engagement loop"
 * that ISN'T the coin economy itself: XP, rank levels, message/
 * activity-streak tracking, Battle Pass progress, mini-game
 * stats, and daily/weekly challenge progress.
 *
 * Deliberately one JSON file (progression.json) and one manager
 * for all of this — it's all "how active/engaged is this user"
 * data that gets touched together, and splitting it into five
 * separate JSON files would just mean five separate places that
 * could get out of sync. The coin balance itself stays in
 * economy.json / economyManager.js exactly as it already was;
 * this module calls INTO economyManager for reward payouts
 * rather than duplicating any coin logic.
 * -----------------------------------------------------
 */

const path = require('path');
const config = require('../config');
const logger = require('./logger');
const { readJSONSync, writeJSONSync, ensureFileSync } = require('./storage');
const { PROGRESSION_FILE } = require('./paths');
const economyManager = require('./economyManager');
const { computeBattlePassLevel, getBattlePassReward } = require('./battlePassRewards');
const challengeManager = require('./challengeManager');

ensureFileSync(PROGRESSION_FILE, []);

/**
 * @typedef {object} ProgressionUser
 * @property {string} discordId
 * @property {string} username
 * @property {number} xp Lifetime XP — drives BOTH the rank level and the Battle Pass level.
 * @property {number} level Cached rank level (recomputed from xp on every change).
 * @property {string|null} lastXpAt ISO timestamp of the last XP grant, for the per-user cooldown.
 * @property {number} messagesSent Lifetime message count (NOT cooldown-limited — see recordMessage).
 * @property {number} activityStreak Consecutive-day activity streak.
 * @property {string|null} lastActiveDate YYYY-MM-DD, for streak bookkeeping.
 * @property {number[]} claimedBattlePassLevels Battle Pass levels already auto-granted (prevents double-grant).
 * @property {object} games Per-game stats keyed by game id: {played, won, lost, biggestWin}.
 * @property {number} gamesPlayedTotal
 * @property {number} gamesWonTotal
 * @property {number} biggestSingleWin Biggest single mini-game payout ever (for the hidden "High Roller" achievement).
 * @property {number} blackjackNaturals Times won Blackjack with a natural 21.
 * @property {number} giveawaysEntered
 * @property {number} giveawaysWon
 * @property {object} challengeState See challengeManager.js.
 */

function loadAll() {
    return readJSONSync(PROGRESSION_FILE, []);
}

function saveAll(users) {
    writeJSONSync(PROGRESSION_FILE, users);
}

/**
 * @param {string} discordId
 * @param {string} username
 * @returns {ProgressionUser}
 */
function buildDefaultUser(discordId, username) {
    return {
        discordId,
        username,
        xp: 0,
        level: 1,
        lastXpAt: null,
        messagesSent: 0,
        activityStreak: 0,
        lastActiveDate: null,
        claimedBattlePassLevels: [],
        games: {},
        gamesPlayedTotal: 0,
        gamesWonTotal: 0,
        biggestSingleWin: 0,
        blackjackNaturals: 0,
        giveawaysEntered: 0,
        giveawaysWon: 0,
        challengeState: challengeManager.buildDefaultChallengeState(),
        triviaPlaysToday: 0,
        triviaPlayDate: null,
        triviaSeenIndexes: []
    };
}

/**
 * Gets (creating if necessary) a user's progression record, and
 * freshens their daily/weekly challenge state if a period rolled
 * over since it was last touched. Always saves if anything changed.
 * @param {string} discordId
 * @param {string} [username]
 * @returns {ProgressionUser}
 */
function getOrCreateUser(discordId, username = 'Unknown User') {
    const users = loadAll();
    let user = users.find((u) => u.discordId === discordId);
    let dirty = false;

    if (!user) {
        user = buildDefaultUser(discordId, username);
        users.push(user);
        dirty = true;
    } else {
        // Backfill any fields added by a later version of the bot so old
        // records don't crash on undefined access.
        const defaults = buildDefaultUser(discordId, username);
        for (const key of Object.keys(defaults)) {
            if (user[key] === undefined) {
                user[key] = defaults[key];
                dirty = true;
            }
        }
        if (username && user.username !== username) {
            user.username = username;
            dirty = true;
        }
    }

    const beforeState = JSON.stringify(user.challengeState);
    user.challengeState = challengeManager.ensureFreshChallengeState(user.challengeState);
    if (JSON.stringify(user.challengeState) !== beforeState) dirty = true;

    if (dirty) saveAll(users);
    return user;
}

/**
 * @param {string} discordId
 * @returns {ProgressionUser|null}
 */
function getUser(discordId) {
    return loadAll().find((u) => u.discordId === discordId) || null;
}

/**
 * @param {ProgressionUser} updatedUser
 */
function saveUser(updatedUser) {
    const users = loadAll();
    const index = users.findIndex((u) => u.discordId === updatedUser.discordId);
    if (index === -1) users.push(updatedUser);
    else users[index] = updatedUser;
    saveAll(users);
}

/**
 * XP required to go from rank level N to N+1.
 * @param {number} level
 * @returns {number}
 */
function xpForLevel(level) {
    const formula = config.leveling?.xpFormula || { base: 100, growth: 1.12 };
    return Math.round(formula.base * Math.pow(formula.growth, level - 1));
}

/**
 * Computes rank level + progress from a lifetime XP total.
 * @param {number} totalXp
 * @returns {{level: number, currentLevelXp: number, xpForNext: number}}
 */
function computeLevel(totalXp) {
    let level = 1;
    let remaining = totalXp;
    let guard = 0;

    while (remaining >= xpForLevel(level) && guard < 10000) {
        remaining -= xpForLevel(level);
        level += 1;
        guard += 1;
    }

    return { level, currentLevelXp: remaining, xpForNext: xpForLevel(level) };
}

/**
 * Grants XP to a user, subject to the per-user cooldown (pass
 * `bypassCooldown: true` for non-message XP sources like games/
 * challenges, which aren't spam vectors the cooldown needs to guard).
 * Detects and applies BOTH a rank level-up (coin reward) and any
 * Battle Pass level-up(s) (auto-granted milestone/tier rewards,
 * each level only ever granted once via claimedBattlePassLevels).
 * @param {string} discordId
 * @param {string} username
 * @param {number} amount
 * @param {object} [options]
 * @param {boolean} [options.bypassCooldown=false]
 * @returns {{user: ProgressionUser, xpGranted: number, leveledUp: boolean, oldLevel: number, newLevel: number, levelUpCoins: number, battlePassLevelsGained: Array<{level:number, reward: object}>}|null} null if on cooldown.
 */
function addXp(discordId, username, amount, { bypassCooldown = false } = {}) {
    const user = getOrCreateUser(discordId, username);

    if (!bypassCooldown) {
        const cooldownSeconds = config.leveling?.xpCooldownSeconds ?? 5;
        if (user.lastXpAt) {
            const elapsedMs = Date.now() - new Date(user.lastXpAt).getTime();
            if (elapsedMs < cooldownSeconds * 1000) {
                return null; // Still on cooldown — no XP granted, caller should not treat this as an error.
            }
        }
        user.lastXpAt = new Date().toISOString();
    }

    const oldXp = user.xp;
    const { level: oldLevel } = computeLevel(oldXp);
    user.xp += amount;
    const { level: newLevel } = computeLevel(user.xp);
    user.level = newLevel;

    let levelUpCoins = 0;
    const leveledUp = newLevel > oldLevel;
    if (leveledUp) {
        const perLevel = config.leveling?.levelUpCoins ?? 25;
        const milestoneEvery = config.leveling?.milestoneEveryLevels ?? 25;
        const milestoneBonus = config.leveling?.milestoneBonusCoins ?? 500;

        for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
            levelUpCoins += perLevel;
            if (milestoneEvery > 0 && lvl % milestoneEvery === 0) {
                levelUpCoins += milestoneBonus;
            }
        }

        economyManager.addCoins(discordId, username, levelUpCoins);
    }

    // Battle Pass progress rides the same XP pool. Grant any newly
    // reached level(s)' reward exactly once each (claimedBattlePassLevels
    // is the permanent ledger this checks against).
    const battlePassLevelsGained = [];
    if (config.battlePass?.enabled) {
        const { level: bpLevel } = computeBattlePassLevel(user.xp);
        for (let lvl = 1; lvl <= bpLevel; lvl++) {
            if (user.claimedBattlePassLevels.includes(lvl)) continue;
            const reward = getBattlePassReward(lvl);
            if (reward.coins > 0) economyManager.addCoins(discordId, username, reward.coins);
            user.claimedBattlePassLevels.push(lvl);
            battlePassLevelsGained.push({ level: lvl, reward });
        }
    }

    // Challenge progress: "Earn X XP" challenges.
    const newlyCompletedChallenges = challengeManager.recordProgress(user.challengeState, 'xpEarned', amount);
    grantChallengeRewards(discordId, username, newlyCompletedChallenges);

    saveUser(user);

    return { user, xpGranted: amount, leveledUp, oldLevel, newLevel, levelUpCoins, battlePassLevelsGained };
}

/**
 * Grants the XP/coin reward for each newly completed challenge.
 * Shared by every recordX() function below since any of them can
 * complete a challenge.
 * @param {string} discordId
 * @param {string} username
 * @param {Array<object>} newlyCompleted
 */
function grantChallengeRewards(discordId, username, newlyCompleted) {
    if (!newlyCompleted || newlyCompleted.length === 0) return;
    for (const challenge of newlyCompleted) {
        if (challenge.coinReward > 0) economyManager.addCoins(discordId, username, challenge.coinReward);
        // XP reward is granted as raw XP directly on the user record (bypassing
        // addXp's own cooldown/recursion — challenge XP isn't a spam vector).
        if (challenge.xpReward > 0) {
            const users = loadAll();
            const u = users.find((x) => x.discordId === discordId);
            if (u) {
                u.xp += challenge.xpReward;
                u.level = computeLevel(u.xp).level;
                saveAll(users);
            }
        }
    }
}

/**
 * Records a message for streak/message-count purposes. Called on
 * EVERY non-bot message (not cooldown-limited like XP) — message
 * count and activity streak are meant to reflect genuine presence,
 * not to be a second reward channel, so there's no farming
 * incentive in leaving this uncapped.
 * @param {string} discordId
 * @param {string} username
 * @returns {{user: ProgressionUser, streakIncreased: boolean}}
 */
function recordMessage(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    user.messagesSent += 1;

    const today = new Date().toISOString().slice(0, 10);
    let streakIncreased = false;

    if (user.lastActiveDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        user.activityStreak = user.lastActiveDate === yesterday ? user.activityStreak + 1 : 1;
        user.lastActiveDate = today;
        streakIncreased = true;
    }

    const newlyCompleted = challengeManager.recordProgress(user.challengeState, 'messages', 1);
    grantChallengeRewards(discordId, username, newlyCompleted);

    saveUser(user);
    return { user, streakIncreased };
}

/**
 * Records the result of a mini-game round: updates per-game +
 * total stats, biggest-win tracking, and challenge/coin progress.
 * Does NOT touch the coin balance itself — callers add/remove
 * coins via economyManager directly; pass the net payout here
 * purely for stat tracking (0 or negative for a loss).
 * @param {string} discordId
 * @param {string} username
 * @param {string} gameId e.g. 'coinflip', 'dice', 'slots', 'blackjack', 'trivia', 'guessnumber'.
 * @param {{won: boolean, payout?: number}} result payout: net coins WON this round (omit/0 for a loss or no-bet game).
 * @returns {{user: ProgressionUser, newlyCompletedChallenges: Array<object>}}
 */
function recordGameResult(discordId, username, gameId, { won, payout = 0 }) {
    const user = getOrCreateUser(discordId, username);

    if (!user.games[gameId]) user.games[gameId] = { played: 0, won: 0, lost: 0, biggestWin: 0 };
    const stats = user.games[gameId];
    stats.played += 1;
    user.gamesPlayedTotal += 1;

    if (won) {
        stats.won += 1;
        user.gamesWonTotal += 1;
        if (payout > stats.biggestWin) stats.biggestWin = payout;
        if (payout > user.biggestSingleWin) user.biggestSingleWin = payout;
    } else {
        stats.lost += 1;
    }

    let newlyCompletedChallenges = [];
    if (won) {
        newlyCompletedChallenges = newlyCompletedChallenges.concat(
            challengeManager.recordProgress(user.challengeState, 'gamesWon', 1)
        );
    }
    if (payout > 0) {
        newlyCompletedChallenges = newlyCompletedChallenges.concat(
            challengeManager.recordProgress(user.challengeState, 'coinsEarned', payout)
        );
    }
    grantChallengeRewards(discordId, username, newlyCompletedChallenges);

    saveUser(user);
    return { user, newlyCompletedChallenges };
}

/**
 * Records winning a Blackjack hand with a natural 21 (for the
 * hidden "Natural Talent" achievement).
 * @param {string} discordId
 * @param {string} username
 */
function recordBlackjackNatural(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    user.blackjackNaturals += 1;
    saveUser(user);
    return user;
}

/**
 * Records a giveaway entry — feeds the "enter a giveaway" challenge.
 * @param {string} discordId
 * @param {string} username
 */
function recordGiveawayEntry(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    user.giveawaysEntered += 1;
    const newlyCompleted = challengeManager.recordProgress(user.challengeState, 'giveawayEntries', 1);
    grantChallengeRewards(discordId, username, newlyCompleted);
    saveUser(user);
    return user;
}

/**
 * Records winning a giveaway (for the hidden "Giveaway Champion" achievement).
 * @param {string} discordId
 * @param {string} username
 */
function recordGiveawayWin(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    user.giveawaysWon += 1;
    saveUser(user);
    return user;
}

/**
 * Records that an achievement was just unlocked — feeds the
 * "unlock an achievement" weekly challenge. Called by
 * achievementManager AFTER it awards an achievement (so this
 * itself never causes infinite recursion between the two systems).
 * @param {string} discordId
 * @param {string} username
 */
function recordAchievementUnlocked(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    const newlyCompleted = challengeManager.recordProgress(user.challengeState, 'achievementsUnlocked', 1);
    grantChallengeRewards(discordId, username, newlyCompleted);
    saveUser(user);
    return user;
}

/**
 * Returns the top N users sorted by a given progression stat.
 * @param {'xp'|'battlePassLevel'|'gamesWonTotal'} type
 * @param {number} [limit=10]
 * @returns {ProgressionUser[]}
 */
function getLeaderboard(type = 'xp', limit = 10) {
    const users = loadAll();

    if (type === 'battlePassLevel') {
        return users
            .slice()
            .sort((a, b) => computeBattlePassLevel(b.xp).level - computeBattlePassLevel(a.xp).level || b.xp - a.xp)
            .slice(0, limit);
    }

    if (type === 'gamesWonTotal') {
        return users
            .slice()
            .sort((a, b) => b.gamesWonTotal - a.gamesWonTotal)
            .slice(0, limit);
    }

    return users
        .slice()
        .sort((a, b) => b.xp - a.xp)
        .slice(0, limit);
}

/**
 * Checks whether a user still has trivia plays left today
 * (config.games.trivia.dailyLimit, default 5), resetting their
 * counter if the date has rolled over since their last play.
 * @param {string} discordId
 * @param {string} username
 * @returns {{allowed: boolean, playsToday: number, limit: number}}
 */
function canPlayTriviaToday(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    const limit = config.games?.trivia?.dailyLimit ?? 5;
    const today = new Date().toISOString().slice(0, 10);

    if (user.triviaPlayDate !== today) {
        user.triviaPlayDate = today;
        user.triviaPlaysToday = 0;
        saveUser(user);
    }

    return { allowed: user.triviaPlaysToday < limit, playsToday: user.triviaPlaysToday, limit };
}

/**
 * Records that a user just played a trivia round (call this once
 * they're actually shown a question, after canPlayTriviaToday
 * confirmed they have plays left).
 * @param {string} discordId
 * @param {string} username
 * @returns {number} Their new plays-today count.
 */
function recordTriviaPlay(discordId, username) {
    const user = getOrCreateUser(discordId, username);
    const today = new Date().toISOString().slice(0, 10);
    if (user.triviaPlayDate !== today) {
        user.triviaPlayDate = today;
        user.triviaPlaysToday = 0;
    }
    user.triviaPlaysToday += 1;
    saveUser(user);
    return user.triviaPlaysToday;
}

/**
 * Picks a trivia question index for a user using a "shuffle bag":
 * never repeats a question until every question in the bank has
 * been shown once, at which point the bag resets. This is what
 * actually fixes "questions keep repeating" — a plain
 * Math.random() pick against a small-ish bank repeats constantly,
 * a shuffle bag mathematically cannot repeat until exhausted.
 * @param {string} discordId
 * @param {string} username
 * @param {number} totalQuestions
 * @returns {number} The chosen question index.
 */
function pickTriviaQuestionIndex(discordId, username, totalQuestions) {
    const user = getOrCreateUser(discordId, username);

    if (!Array.isArray(user.triviaSeenIndexes) || user.triviaSeenIndexes.length >= totalQuestions) {
        user.triviaSeenIndexes = [];
    }

    const remaining = [];
    for (let i = 0; i < totalQuestions; i++) {
        if (!user.triviaSeenIndexes.includes(i)) remaining.push(i);
    }

    const chosen = remaining[Math.floor(Math.random() * remaining.length)];
    user.triviaSeenIndexes.push(chosen);
    saveUser(user);
    return chosen;
}

/**
 * Admin correction tool: directly sets a user's lifetime XP,
 * recomputing their cached level. Deliberately raw — does NOT
 * trigger level-up announcements, Battle Pass reward grants, or
 * achievement checks, since this is for fixing/adjusting state,
 * not "playing". Use addXp() (e.g. via /addxp) for an admin grant
 * that should feel like a real, rewarded XP gain.
 * @param {string} discordId
 * @param {string} username
 * @param {number} newXp
 * @returns {ProgressionUser}
 */
function setXp(discordId, username, newXp) {
    const user = getOrCreateUser(discordId, username);
    user.xp = Math.max(0, Math.round(newXp));
    user.level = computeLevel(user.xp).level;
    saveUser(user);
    return user;
}

/**
 * Admin correction tool: directly sets a user's level by
 * computing the exact cumulative XP that level starts at. Same
 * "raw correction, no side effects" behavior as setXp() above.
 * @param {string} discordId
 * @param {string} username
 * @param {number} targetLevel
 * @returns {ProgressionUser}
 */
function setLevel(discordId, username, targetLevel) {
    const level = Math.max(1, Math.round(targetLevel));
    let cumulativeXp = 0;
    for (let lvl = 1; lvl < level; lvl++) {
        cumulativeXp += xpForLevel(lvl);
    }
    return setXp(discordId, username, cumulativeXp);
}

module.exports = {
    loadAll,
    saveAll,
    getOrCreateUser,
    getUser,
    saveUser,
    xpForLevel,
    computeLevel,
    addXp,
    setXp,
    setLevel,
    recordMessage,
    recordGameResult,
    recordBlackjackNatural,
    recordGiveawayEntry,
    recordGiveawayWin,
    recordAchievementUnlocked,
    getLeaderboard,
    canPlayTriviaToday,
    recordTriviaPlay,
    pickTriviaQuestionIndex
};
