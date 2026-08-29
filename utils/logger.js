/**
 * logger.js
 * -----------------------------------------------------
 * Centralized logging utility.
 *  - info/success/warn/error -> console only, timestamped.
 *  - logAction -> console + persistent logs/actions.log file
 *    (and optionally a Discord log channel), used for the
 *    audit trail required by the bot spec (Generate, Suspend,
 *    Unsuspend, Renew, Revoke, Expiration, Admin Add/Remove).
 * -----------------------------------------------------
 */

const fs = require('fs');
const { ensureDirSync } = require('./storage');
const { LOGS_DIR, ACTION_LOG_FILE } = require('./paths');

ensureDirSync(LOGS_DIR);
if (!fs.existsSync(ACTION_LOG_FILE)) {
    fs.writeFileSync(ACTION_LOG_FILE, '', 'utf8');
}

function timestamp() {
    return new Date().toISOString();
}

function info(message) {
    console.log(`[INFO] [${timestamp()}] ${message}`);
}

function success(message) {
    console.log(`[OK] [${timestamp()}] ${message}`);
}

function warn(message) {
    console.warn(`[WARN] [${timestamp()}] ${message}`);
}

function error(message, err) {
    console.error(`[ERROR] [${timestamp()}] ${message}`);
    if (err && err.stack) {
        console.error(err.stack);
    }
}

/**
 * Logs a license/admin-related action to console + the persistent
 * action log file, and (if configured) a Discord log channel.
 *
 * @param {import('discord.js').Client|null} client Discord client, used to post to LOG_CHANNEL_ID. Pass null to skip.
 * @param {object} entry
 * @param {string} entry.action Action type, e.g. "GENERATE", "SUSPEND", "ADMIN_ADD".
 * @param {string} [entry.admin] Tag or ID of who performed the action (defaults to "SYSTEM").
 * @param {string} [entry.target] Description of the affected user/entity.
 * @param {string} [entry.license] License key involved, if applicable.
 * @param {string} [entry.details] Any extra free-form details.
 */
function logAction(client, { action, admin = 'SYSTEM', target = 'N/A', license = 'N/A', details = '' }) {
    const line = `[${timestamp()}] ACTION=${action} | ADMIN=${admin} | TARGET=${target} | LICENSE=${license}${
        details ? ` | DETAILS=${details}` : ''
    }`;

    console.log(`[ACTION] ${line}`);

    try {
        fs.appendFileSync(ACTION_LOG_FILE, line + '\n', 'utf8');
    } catch (err) {
        console.error('[Logger] Failed to write to action log file:', err.message);
    }

    // Best-effort: post to the configured Discord log channel, if any.
    if (client) {
        try {
            const config = require('../config');
            if (config.logChannelId) {
                const channel = client.channels.cache.get(config.logChannelId);
                if (channel && channel.isTextBased()) {
                    const { EmbedBuilder } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setColor(config.colors.black)
                        .setTitle(`📋 Action Logged: ${action}`)
                        .addFields(
                            { name: 'Admin', value: String(admin), inline: true },
                            { name: 'Target', value: String(target), inline: true },
                            { name: 'License', value: String(license), inline: true }
                        )
                        .setFooter({ text: config.footer })
                        .setTimestamp();

                    if (details) embed.addFields({ name: 'Details', value: String(details) });

                    channel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        } catch (err) {
            // Non-fatal: logging to Discord is best-effort only.
        }
    }
}

module.exports = {
    info,
    success,
    warn,
    error,
    logAction
};
