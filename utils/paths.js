/**
 * paths.js
 * -----------------------------------------------------
 * Centralized file path constants used across the bot.
 * Keeping these in one place avoids typos and makes it
 * easy to relocate storage files later if needed.
 * -----------------------------------------------------
 */

const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

module.exports = {
    ROOT_DIR,
    LICENSES_DIR: path.join(ROOT_DIR, 'licenses'),
    LICENSES_FILE: path.join(ROOT_DIR, 'licenses', 'licenses.json'),
    ADMINS_FILE: path.join(ROOT_DIR, 'admins.json'),
    LOGS_DIR: path.join(ROOT_DIR, 'logs'),
    ACTION_LOG_FILE: path.join(ROOT_DIR, 'logs', 'actions.log'),
    PROGRESSION_FILE: path.join(ROOT_DIR, 'progression.json'),
    GIVEAWAYS_FILE: path.join(ROOT_DIR, 'giveaways.json')
};
