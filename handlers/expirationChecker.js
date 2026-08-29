/**
 * expirationChecker.js
 * -----------------------------------------------------
 * Runs on an interval (default: every 60 seconds) and:
 *   1. Scans all licenses for ones past their expiration date.
 *   2. Flips their status from Active -> Expired.
 *   3. Logs the expiration action.
 *   4. DMs the affected user that their license has expired.
 * -----------------------------------------------------
 */

const licenseManager = require('../utils/licenseManager');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Runs a single expiration sweep.
 * @param {import('discord.js').Client} client
 */
async function runExpirationSweep(client) {
    let justExpired;

    try {
        justExpired = licenseManager.processExpirations();
    } catch (err) {
        logger.error('Failed to process license expirations', err);
        return;
    }

    for (const license of justExpired) {
        logger.logAction(client, {
            action: 'EXPIRATION',
            admin: 'SYSTEM',
            target: `${license.username} (${license.discordID})`,
            license: license.license,
            details: `Plan "${license.plan}" expired automatically.`
        });

        // Best-effort DM to the license owner.
        try {
            const user = await client.users.fetch(license.discordID);
            await user.send('Your InterENL Store license has expired.');
        } catch (err) {
            // User may have DMs disabled or no longer share a server with the bot — non-fatal.
            logger.warn(`Could not DM user ${license.discordID} about license expiration.`);
        }
    }

    if (justExpired.length > 0) {
        logger.info(`Expiration sweep complete: ${justExpired.length} license(s) expired.`);
    }
}

/**
 * Starts the recurring expiration checker on the interval
 * configured in config.expirationCheckIntervalMs (default 60s).
 * @param {import('discord.js').Client} client
 */
function startExpirationChecker(client) {
    const intervalMs = config.expirationCheckIntervalMs || 60000;

    // Run once immediately on startup, then on the configured interval.
    runExpirationSweep(client);
    setInterval(() => runExpirationSweep(client), intervalMs);

    logger.success(`Expiration checker started (interval: ${intervalMs}ms).`);
}

module.exports = { startExpirationChecker, runExpirationSweep };
