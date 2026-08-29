/**
 * leakDetection.js
 * -----------------------------------------------------
 * Automatic License Leak Detection.
 *
 * Scans every message the bot can read (in guilds where it has
 * permission) for text matching the InterENL Store license key format
 * (INTERENL-XXXX-XXXX-XXXX-XXXX). If a match is found and it
 * corresponds to a real, valid license in licenses.json:
 *
 *   - The message is deleted (if the bot has permission).
 *   - The license status is changed to Suspended (or Revoked,
 *     depending on config.action).
 *   - The suspend reason is recorded as "Public License Exposure".
 *   - The incident is logged (username, ID, channel, server, time, key).
 *   - The license owner is DMed explaining what happened.
 *   - All InterENL Store administrators are notified with an incident embed.
 *
 * This system only ever inspects messages the bot's Discord
 * permissions actually allow it to see — it cannot and does not
 * claim to detect leaks anywhere outside Discord.
 * -----------------------------------------------------
 */

const { isValidKeyFormat } = require('../utils/licenseGenerator');
const licenseManager = require('../utils/licenseManager');
const permissions = require('../utils/permissions');
const logger = require('../utils/logger');
const config = require('../config');
const { errorEmbed, warningEmbed } = require('../embeds/embeds');

// Matches one or more InterENL Store-formatted keys anywhere in a message.
const LICENSE_KEY_REGEX = /INTERENL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/gi;

/**
 * Extracts all candidate InterENL Store license key strings from a message's content.
 * @param {string} content
 * @returns {string[]}
 */
function extractCandidateKeys(content) {
    if (!content) return [];
    const matches = content.match(LICENSE_KEY_REGEX);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.toUpperCase()))].filter((k) => isValidKeyFormat(k));
}

/**
 * Notifies all registered InterENL Store administrators (and the Owner)
 * about a license leak incident via an incident embed, either in
 * the configured admin alert channel, or by DM as a fallback.
 * @param {import('discord.js').Client} client
 * @param {object} incident
 */
async function notifyAdmins(client, incident) {
    if (!config.notifyAdmins) return;

    const embed = warningEmbed(
        'License Leak Detected',
        'A genuine InterENL Store license key was posted publicly and has been automatically actioned.'
    ).addFields(
        { name: '👤 Username', value: incident.username, inline: true },
        { name: '🆔 Discord ID', value: incident.discordID, inline: true },
        { name: '🔑 License', value: `\`${incident.license}\``, inline: false },
        { name: '💬 Channel', value: incident.channel, inline: true },
        { name: '🏠 Server', value: incident.guild, inline: true },
        { name: '🕒 Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: '⚙️ Action Taken', value: incident.actionTaken, inline: false }
    );

    // Prefer a dedicated admin alert channel if configured.
    if (config.adminAlertChannelId) {
        try {
            const channel = await client.channels.fetch(config.adminAlertChannelId);
            if (channel?.isTextBased()) {
                await channel.send({ embeds: [embed] });
                return;
            }
        } catch (err) {
            logger.warn('Could not send leak incident to configured admin alert channel; falling back to DMs.');
        }
    }

    // Fallback: DM the Owner + every registered Admin.
    const adminIds = new Set([config.ownerID, ...permissions.loadAdmins().map((a) => a.id)]);

    for (const adminId of adminIds) {
        try {
            const user = await client.users.fetch(adminId);
            await user.send({ embeds: [embed] });
        } catch (err) {
            // Non-fatal — admin may have DMs disabled.
        }
    }
}

/**
 * Handles a single detected license leak for one key found in one message.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} message
 * @param {string} key
 * @param {object} license
 */
async function handleLeak(client, message, key, license) {
    const reason = 'Public License Exposure';

    // 1. Delete the offending message, if we have permission.
    let messageDeleted = false;
    if (config.deleteMessage) {
        try {
            await message.delete();
            messageDeleted = true;
        } catch (err) {
            logger.warn(`Could not delete leaked-license message in #${message.channel?.name || message.channelId}.`);
        }
    }

    // 2. Suspend (or revoke) the license.
    let actionTaken;
    if (config.action === 'revoke') {
        licenseManager.revokeLicense(key);
        actionTaken = 'License permanently revoked.';
    } else {
        licenseManager.suspendLicense(key, reason);
        actionTaken = 'License suspended.';
    }
    if (messageDeleted) actionTaken += ' Message deleted.';

    // 3. Log the incident.
    const guildName = message.guild?.name || 'Direct Message';
    const channelName = message.channel?.name ? `#${message.channel.name}` : String(message.channelId);

    logger.logAction(client, {
        action: 'LEAK_DETECTED',
        admin: 'SYSTEM',
        target: `${license.username} (${license.discordID})`,
        license: key,
        details: `${reason} in ${guildName} / ${channelName}. ${actionTaken}`
    });

    // 4. DM the license owner.
    if (config.dmUser) {
        try {
            const owner = await client.users.fetch(license.discordID);
            await owner.send({
                embeds: [
                    errorEmbed(
                        'InterENL Store License Suspended',
                        `Your InterENL Store license \`${key}\` was posted publicly in a Discord server and has been automatically **${
                            config.action === 'revoke' ? 'revoked' : 'suspended'
                        }** to protect your account.\n\nIf you believe this was a mistake, please contact a InterENL Store administrator.`
                    )
                ]
            });
        } catch (err) {
            logger.warn(`Could not DM license owner ${license.discordID} about the leak incident.`);
        }
    }

    // 5. Notify admins.
    await notifyAdmins(client, {
        username: license.username,
        discordID: license.discordID,
        license: key,
        channel: channelName,
        guild: guildName,
        actionTaken
    });
}

/**
 * Main entry point: scans a single Discord message for leaked
 * InterENL Store license keys and actions any that are found.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} message
 */
async function scanMessageForLeaks(client, message) {
    if (!config.licenseLeakProtection) return;
    if (!message.content) return;
    if (message.author?.bot) return;

    // Skip messages from authorized InterENL Store administrators, if configured
    // to do so. Defaults to OFF (config.ignoreAdminsInLeakScan = false) — an
    // earlier default of `true` meant an admin's own test post of a real key
    // was silently exempted from ever being caught, which looks exactly like
    // "leak detection doesn't work" from the outside. Turn this back on only
    // if admins legitimately need to paste real keys in an admin-only channel
    // without triggering a suspension.
    if (config.ignoreAdminsInLeakScan && message.author && permissions.hasPermission(message.author.id)) {
        return;
    }

    const candidateKeys = extractCandidateKeys(message.content);
    if (candidateKeys.length === 0) return;

    for (const key of candidateKeys) {
        const license = licenseManager.findByKey(key);

        // Only act on keys that correspond to a real, currently-tracked license.
        if (!license) continue;

        try {
            await handleLeak(client, message, key, license);
        } catch (err) {
            logger.error(`Failed to handle license leak for key ${key}`, err);
        }
    }
}

module.exports = { scanMessageForLeaks, extractCandidateKeys };
