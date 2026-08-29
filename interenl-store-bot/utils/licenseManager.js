/**
 * licenseManager.js
 * -----------------------------------------------------
 * Core data layer for InterENL Store licenses.
 * Handles loading/saving licenses.json and all license
 * lifecycle operations: generate, check, renew, suspend,
 * unsuspend, revoke, search, list, and expiration handling.
 * -----------------------------------------------------
 */

const { ensureDirSync, ensureFileSync, readJSONSync, writeJSONSync } = require('./storage');
const { LICENSES_DIR, LICENSES_FILE } = require('./paths');
const { generateUniqueLicenseKey } = require('./licenseGenerator');
const config = require('../config');

const STATUS = {
    ACTIVE: 'Active',
    EXPIRED: 'Expired',
    SUSPENDED: 'Suspended',
    REVOKED: 'Revoked'
};

/**
 * Ensures the /licenses/ directory and licenses.json file exist.
 * Called once on bot startup. If the folder/file already exist,
 * this does nothing (per spec).
 */
function initStorage() {
    ensureDirSync(LICENSES_DIR);
    ensureFileSync(LICENSES_FILE, []);
}

/**
 * Loads all licenses from disk.
 * @returns {Array<object>}
 */
function loadLicenses() {
    return readJSONSync(LICENSES_FILE, []);
}

/**
 * Persists the full license array to disk.
 * @param {Array<object>} licenses
 */
function saveLicenses(licenses) {
    writeJSONSync(LICENSES_FILE, licenses);
}

/**
 * Calculates an ISO expiration date string based on a plan name.
 * Returns null for "Lifetime" plans (never expires).
 * @param {string} plan One of the configured license plan names.
 * @returns {string|null} ISO date string, or null for Lifetime.
 */
function calculateExpiration(plan) {
    const days = config.licensePlans[plan];

    if (days === null || days === undefined) {
        return null; // Lifetime or unrecognized -> never expires
    }

    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + Number(days));
    return expireDate.toISOString();
}

/**
 * Generates and stores a brand new license.
 * @param {object} params
 * @param {string} params.username Discord username of the license owner.
 * @param {string} params.discordID Discord user ID of the license owner.
 * @param {string} params.email Email address tied to the license.
 * @param {string} params.plan Plan name (must exist in config.licensePlans).
 * @param {string} params.generatedBy Discord ID of the admin/owner who generated it.
 * @returns {object} The newly created license record.
 */
function generateLicense({ username, discordID, email, plan, generatedBy }) {
    const licenses = loadLicenses();
    const existingKeys = licenses.map((lic) => lic.license);

    const licenseKey = generateUniqueLicenseKey(existingKeys);
    const createdDate = new Date().toISOString();
    const expireDate = calculateExpiration(plan);

    const licenseRecord = {
        username: String(username),
        discordID: String(discordID),
        email: String(email),
        license: licenseKey,
        plan: String(plan),
        created: createdDate,
        expires: expireDate, // null = Lifetime
        status: STATUS.ACTIVE,
        generatedBy: String(generatedBy),
        generatedAt: createdDate,
        suspendReason: null
    };

    licenses.push(licenseRecord);
    saveLicenses(licenses);

    return licenseRecord;
}

/**
 * Finds a license by its exact key (case-insensitive).
 * @param {string} key
 * @returns {object|null}
 */
function findByKey(key) {
    if (!key) return null;
    const licenses = loadLicenses();
    const normalized = key.trim().toUpperCase();
    return licenses.find((lic) => lic.license.toUpperCase() === normalized) || null;
}

/**
 * Searches licenses by username, Discord ID, email, or license key.
 * Case-insensitive partial match on username/email/license key,
 * substring match on Discord ID.
 * @param {string} query
 * @returns {Array<object>}
 */
function search(query) {
    if (!query) return [];
    const licenses = loadLicenses();
    const normalized = query.trim().toLowerCase();

    return licenses.filter((lic) => {
        return (
            lic.username.toLowerCase().includes(normalized) ||
            lic.discordID.includes(query.trim()) ||
            lic.email.toLowerCase().includes(normalized) ||
            lic.license.toLowerCase().includes(normalized)
        );
    });
}

/**
 * Returns all stored licenses.
 * @returns {Array<object>}
 */
function listAll() {
    return loadLicenses();
}

/**
 * Renews a license: updates its plan and recalculates expiration
 * from the current moment. Also reactivates it if it was expired
 * or suspended.
 * @param {string} key License key to renew.
 * @param {string} plan New plan name.
 * @returns {object|null} The updated license, or null if not found.
 */
function renewLicense(key, plan) {
    const licenses = loadLicenses();
    const license = licenses.find((lic) => lic.license.toUpperCase() === key.trim().toUpperCase());

    if (!license) return null;

    license.plan = plan;
    license.expires = calculateExpiration(plan);

    if (license.status === STATUS.EXPIRED || license.status === STATUS.SUSPENDED) {
        license.status = STATUS.ACTIVE;
        license.suspendReason = null;
    }

    saveLicenses(licenses);
    return license;
}

/**
 * Suspends a license immediately.
 * @param {string} key License key to suspend.
 * @param {string} [reason] Optional reason for suspension.
 * @returns {object|null} The updated license, or null if not found.
 */
function suspendLicense(key, reason = 'Manually suspended by administrator') {
    const licenses = loadLicenses();
    const license = licenses.find((lic) => lic.license.toUpperCase() === key.trim().toUpperCase());

    if (!license) return null;

    license.status = STATUS.SUSPENDED;
    license.suspendReason = reason;

    saveLicenses(licenses);
    return license;
}

/**
 * Reactivates a suspended license back to Active status.
 * @param {string} key License key to unsuspend.
 * @returns {object|null} The updated license, or null if not found.
 */
function unsuspendLicense(key) {
    const licenses = loadLicenses();
    const license = licenses.find((lic) => lic.license.toUpperCase() === key.trim().toUpperCase());

    if (!license) return null;

    license.status = STATUS.ACTIVE;
    license.suspendReason = null;

    saveLicenses(licenses);
    return license;
}

/**
 * Permanently deletes a license from storage.
 * @param {string} key License key to revoke/delete.
 * @returns {object|null} The removed license record, or null if not found.
 */
function revokeLicense(key) {
    const licenses = loadLicenses();
    const normalized = key.trim().toUpperCase();
    const index = licenses.findIndex((lic) => lic.license.toUpperCase() === normalized);

    if (index === -1) return null;

    const [removed] = licenses.splice(index, 1);
    saveLicenses(licenses);
    return removed;
}

/**
 * Scans all licenses for ones that have passed their expiration
 * date but are still marked Active, and flips them to Expired.
 * @returns {Array<object>} Array of licenses that were just expired.
 */
function processExpirations() {
    const licenses = loadLicenses();
    const now = new Date();
    const justExpired = [];

    for (const license of licenses) {
        if (license.status === STATUS.ACTIVE && license.expires !== null && new Date(license.expires) <= now) {
            license.status = STATUS.EXPIRED;
            justExpired.push(license);
        }
    }

    if (justExpired.length > 0) {
        saveLicenses(licenses);
    }

    return justExpired;
}

module.exports = {
    STATUS,
    initStorage,
    loadLicenses,
    saveLicenses,
    calculateExpiration,
    generateLicense,
    findByKey,
    search,
    listAll,
    renewLicense,
    suspendLicense,
    unsuspendLicense,
    revokeLicense,
    processExpirations
};
