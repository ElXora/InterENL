/**
 * gameCooldown.js
 * -----------------------------------------------------
 * Lightweight in-memory cooldown for mini-games. Deliberately
 * NOT persisted to disk — game cooldowns are short (a few
 * seconds) and resetting on a bot restart is a non-issue,
 * unlike XP or daily/work cooldowns which matter enough to
 * survive restarts.
 * -----------------------------------------------------
 */

const config = require('../config');

/** @type {Map<string, number>} key: `${discordId}:${gameId}` -> timestamp ms of last play */
const lastPlayed = new Map();

/**
 * Checks whether a user can play a game right now, and if so,
 * marks them as having just played (starting their cooldown).
 * @param {string} discordId
 * @param {string} gameId
 * @returns {{allowed: boolean, remainingSeconds: number}}
 */
function checkAndStartCooldown(discordId, gameId) {
    const cooldownMs = (config.games?.cooldownSeconds ?? 5) * 1000;
    const key = `${discordId}:${gameId}`;
    const last = lastPlayed.get(key);
    const now = Date.now();

    if (last) {
        const elapsed = now - last;
        if (elapsed < cooldownMs) {
            return { allowed: false, remainingSeconds: Math.ceil((cooldownMs - elapsed) / 1000) };
        }
    }

    lastPlayed.set(key, now);
    return { allowed: true, remainingSeconds: 0 };
}

module.exports = { checkAndStartCooldown };
