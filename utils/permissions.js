/**
 * permissions.js
 * -----------------------------------------------------
 * Handles the bot's owner/admin permission system:
 *  - Loading/saving admins.json
 *  - Checking whether a user is the Owner, an Admin, or neither
 *  - Shared "requirePermission" gate for slash commands
 * -----------------------------------------------------
 */

const { ensureFileSync, readJSONSync, writeJSONSync } = require('./storage');
const { ADMINS_FILE } = require('./paths');
const config = require('../config');

const ADMINS_PATH = ADMINS_FILE;

/**
 * Ensures admins.json exists on disk (empty array by default).
 * Called once on startup.
 */
function initAdminsFile() {
    ensureFileSync(ADMINS_FILE, []);
}

/**
 * Loads the list of admins from disk.
 * @returns {Array<{id: string, tag: string, addedBy: string, addedAt: string}>}
 */
function loadAdmins() {
    return readJSONSync(ADMINS_FILE, []);
}

/**
 * Persists the list of admins to disk.
 * @param {Array<object>} admins
 */
function saveAdmins(admins) {
    writeJSONSync(ADMINS_FILE, admins);
}

/**
 * Checks if a Discord user ID is the hardcoded bot Owner.
 * @param {string} userId
 * @returns {boolean}
 */
function isOwner(userId) {
    return String(userId) === String(config.ownerID);
}

/**
 * Checks if a Discord user ID is a registered Admin — either
 * added dynamically via /admin add (stored in admins.json), or
 * configured statically via the ADMIN_IDS env variable.
 * @param {string} userId
 * @returns {boolean}
 */
function isAdmin(userId) {
    if (isStaticAdmin(userId)) return true;
    const admins = loadAdmins();
    return admins.some((a) => a.id === String(userId));
}

/**
 * Checks if a Discord user ID was configured as an admin via the
 * ADMIN_IDS environment variable (not removable with /admin remove —
 * must be edited in .env).
 * @param {string} userId
 * @returns {boolean}
 */
function isStaticAdmin(userId) {
    return (config.staticAdminIds || []).includes(String(userId));
}

/**
 * Checks if a user is allowed to run license-management commands
 * (true for Owner OR registered Admin).
 * @param {string} userId
 * @returns {boolean}
 */
function hasPermission(userId) {
    return isOwner(userId) || isAdmin(userId);
}

module.exports = {
    ADMINS_PATH,
    initAdminsFile,
    loadAdmins,
    saveAdmins,
    isOwner,
    isAdmin,
    isStaticAdmin,
    hasPermission
};
