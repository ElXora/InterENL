/**
 * storage.js
 * -----------------------------------------------------
 * Low-level JSON file storage helpers.
 * Handles creating, reading, and writing JSON files safely,
 * including automatic directory/file creation on first run.
 * -----------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

/**
 * Ensures a directory exists. Creates it (recursively) if missing.
 * @param {string} dirPath
 */
function ensureDirSync(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Ensures a JSON file exists. Creates it with the given default
 * content if missing. Does nothing if the file already exists.
 * @param {string} filePath
 * @param {any} defaultData
 */
function ensureFileSync(filePath, defaultData) {
    ensureDirSync(path.dirname(filePath));

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf8');
    }
}

/**
 * Reads and parses a JSON file synchronously.
 * Returns the fallback value if the file doesn't exist or is corrupted.
 * @param {string} filePath
 * @param {any} fallback
 * @returns {any}
 */
function readJSONSync(filePath, fallback = null) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || raw.trim().length === 0) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.error(`[Storage] Failed to read JSON file at ${filePath}:`, err.message);
        return fallback;
    }
}

/**
 * Writes data to a JSON file synchronously (pretty-printed).
 * Uses an atomic write pattern (write to temp file, then rename)
 * to reduce the risk of data corruption on crash.
 * @param {string} filePath
 * @param {any} data
 */
function writeJSONSync(filePath, data) {
    ensureDirSync(path.dirname(filePath));

    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
}

module.exports = {
    ensureDirSync,
    ensureFileSync,
    readJSONSync,
    writeJSONSync
};
