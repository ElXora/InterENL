/**
 * licenseGenerator.js
 * -----------------------------------------------------
 * Generates cryptographically secure, unique InterENL Store
 * license keys in the format:
 *
 *   INTERENL-XXXX-XXXX-XXXX-XXXX
 *
 * Characters are uppercase alphanumeric (excluding visually
 * ambiguous characters like 0/O and 1/I/L) to reduce user
 * confusion when manually typing keys.
 * -----------------------------------------------------
 */

const crypto = require('crypto');

// Ambiguity-safe character set (no 0, O, 1, I, L)
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SEGMENT_COUNT = 4;
const SEGMENT_LENGTH = 4;
const PREFIX = 'INTERENL';

/**
 * Generates a single random segment using crypto-secure randomness.
 * @returns {string} A 4-character uppercase alphanumeric segment.
 */
function generateSegment() {
    let segment = '';
    const bytes = crypto.randomBytes(SEGMENT_LENGTH);

    for (let i = 0; i < SEGMENT_LENGTH; i++) {
        segment += CHARSET[bytes[i] % CHARSET.length];
    }

    return segment;
}

/**
 * Generates a single InterENL Store-formatted license key.
 * NOTE: Uniqueness against existing keys is NOT checked here —
 * use generateUniqueLicenseKey() for that.
 * @returns {string} e.g. "INTERENL-AB7X-KQ2L-P8TZ-7NQM"
 */
function generateLicenseKey() {
    const segments = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) {
        segments.push(generateSegment());
    }
    return `${PREFIX}-${segments.join('-')}`;
}

/**
 * Generates a license key guaranteed to be unique against a
 * provided list of existing keys. Retries on collision
 * (astronomically unlikely, but handled for absolute safety).
 * @param {string[]} existingKeys Array of already-issued license keys.
 * @param {number} [maxAttempts=25] Max generation attempts before throwing.
 * @returns {string} A guaranteed-unique license key.
 */
function generateUniqueLicenseKey(existingKeys = [], maxAttempts = 25) {
    const existingSet = new Set(existingKeys.map((k) => k.toUpperCase()));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const key = generateLicenseKey();
        if (!existingSet.has(key)) {
            return key;
        }
    }

    throw new Error('Failed to generate a unique license key after multiple attempts.');
}

/**
 * Validates that a string matches the InterENL Store license key format.
 * Does NOT check whether the key actually exists in storage.
 * @param {string} key
 * @returns {boolean}
 */
function isValidKeyFormat(key) {
    if (typeof key !== 'string') return false;
    const pattern = /^INTERENL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return pattern.test(key.trim().toUpperCase());
}

module.exports = {
    generateLicenseKey,
    generateUniqueLicenseKey,
    isValidKeyFormat
};
