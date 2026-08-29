/**
 * warnManager.js
 * -----------------------------------------------------
 * Stores and retrieves moderation warnings per guild member
 * in a flat JSON file (warnings.json).
 * -----------------------------------------------------
 */

const path = require('path');
const { readJSONSync, writeJSONSync, ensureFileSync } = require('./storage');

const WARNINGS_FILE = path.join(__dirname, '..', 'warnings.json');
ensureFileSync(WARNINGS_FILE, []);

/**
 * Loads all warnings from disk.
 * @returns {Array<{id: string, guildId: string, userId: string, moderator: string, reason: string, timestamp: string}>}
 */
function loadWarnings() {
    return readJSONSync(WARNINGS_FILE, []);
}

/**
 * Persists the warnings array to disk.
 * @param {Array<object>} warnings
 */
function saveWarnings(warnings) {
    writeJSONSync(WARNINGS_FILE, warnings);
}

/**
 * Adds a new warning for a member.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} moderator Tag/ID of the moderator issuing the warning.
 * @param {string} reason
 * @returns {object} The created warning record.
 */
function addWarning(guildId, userId, moderator, reason) {
    const warnings = loadWarnings();
    const record = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        guildId,
        userId,
        moderator,
        reason,
        timestamp: new Date().toISOString()
    };
    warnings.push(record);
    saveWarnings(warnings);
    return record;
}

/**
 * Returns all warnings for a specific member in a specific guild.
 * @param {string} guildId
 * @param {string} userId
 * @returns {Array<object>}
 */
function getWarnings(guildId, userId) {
    return loadWarnings().filter((w) => w.guildId === guildId && w.userId === userId);
}

/**
 * Clears all warnings for a specific member in a specific guild.
 * @param {string} guildId
 * @param {string} userId
 * @returns {number} Number of warnings removed.
 */
function clearWarnings(guildId, userId) {
    const warnings = loadWarnings();
    const remaining = warnings.filter((w) => !(w.guildId === guildId && w.userId === userId));
    const removedCount = warnings.length - remaining.length;
    saveWarnings(remaining);
    return removedCount;
}

module.exports = { loadWarnings, saveWarnings, addWarning, getWarnings, clearWarnings };
