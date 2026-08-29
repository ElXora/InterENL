/**
 * autoMod.js
 * -----------------------------------------------------
 * Real-time chat moderation. Scans every message (from
 * every server the bot can read) for:
 *
 *   1. Profanity in any supported language -> delete message
 *      + mute the author for the configured duration.
 *   2. Spam (too many messages in a short window) -> delete
 *      the flooding messages + mute the author.
 *   3. Links/invites not on the allowed-domain list -> delete
 *      the message + mute the author.
 *
 * Staff (bot Owner/Admin) are exempt when configured to be.
 * -----------------------------------------------------
 */

const { containsBadWord } = require('../utils/badWords');
const { recordAndCount, reset } = require('../utils/actionTracker');
const { muteMember } = require('../utils/muteManager');
const permissions = require('../utils/permissions');
const logger = require('../utils/logger');
const config = require('../config');
const { warningEmbed } = require('../embeds/embeds');

const LINK_REGEX = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+)/gi;

/**
 * Extracts the hostname from a URL-like string for allow-list checking.
 * @param {string} urlLike
 * @returns {string|null}
 */
function extractHostname(urlLike) {
    try {
        const withProtocol = urlLike.startsWith('http') ? urlLike : `https://${urlLike}`;
        return new URL(withProtocol).hostname.replace(/^www\./, '');
    } catch (err) {
        return null;
    }
}

/**
 * Sends a short-lived warning notice in-channel, then deletes it
 * after a few seconds so chat doesn't get cluttered.
 * @param {import('discord.js').Message} message
 * @param {string} title
 * @param {string} description
 */
async function notifyChannel(message, title, description) {
    try {
        const notice = await message.channel.send({ embeds: [warningEmbed(title, description)] });
        setTimeout(() => notice.delete().catch(() => {}), 8000);
    } catch (err) {
        // Non-fatal — bot may lack Send Messages permission.
    }
}

/**
 * Applies the standard "delete + mute + log + notify" moderation
 * action for an automod violation.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} message
 * @param {string} violationType e.g. "Profanity", "Spam", "Unauthorized Link"
 * @param {number} muteMinutes
 * @param {boolean} deleteMsg
 */
async function actionViolation(client, message, violationType, muteMinutes, deleteMsg) {
    if (deleteMsg) {
        await message.delete().catch(() => {});
    }

    const member = message.member;
    if (member) {
        try {
            await muteMember(member, muteMinutes, `Automod: ${violationType}`, client);
        } catch (err) {
            logger.warn(`Automod could not mute ${message.author.tag} in ${message.guild?.name}: ${err.message}`);
        }
    }

    logger.logAction(client, {
        action: 'AUTOMOD',
        admin: 'SYSTEM',
        target: `${message.author.tag} (${message.author.id})`,
        details: `${violationType} in #${message.channel.name || message.channelId} (${message.guild?.name || 'DM'}) — muted ${muteMinutes} min.`
    });

    await notifyChannel(
        message,
        `⛔ ${violationType} Detected`,
        `${message.author} has been muted for **${muteMinutes} minute(s)** for violating server rules.`
    );
}

/**
 * Main entry point: runs all automod checks against a single message.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} message
 */
async function runAutoMod(client, message) {
    const modConfig = config.moderation;
    if (!modConfig?.enabled) return;
    if (!message.guild) return; // automod only applies in guild text channels
    if (!message.content) return;
    if (message.author?.bot) return;

    if (modConfig.ignoreStaffInAutomod && permissions.hasPermission(message.author.id)) return;

    // ---------------- Profanity filter ----------------
    const { matched } = containsBadWord(message.content);
    if (matched) {
        await actionViolation(client, message, 'Prohibited Language', modConfig.badWordMuteMinutes || 60, true);
        return; // one violation per message is enough
    }

    // ---------------- Link filter ----------------
    if (modConfig.links?.enabled) {
        const linkMatches = message.content.match(LINK_REGEX);
        if (linkMatches) {
            const allowed = modConfig.links.allowedDomains || [];
            const hasDisallowedLink = linkMatches.some((url) => {
                const host = extractHostname(url);
                if (!host) return true; // couldn't parse -> treat as disallowed
                return !allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
            });

            if (hasDisallowedLink) {
                await actionViolation(
                    client,
                    message,
                    'Unauthorized Link',
                    modConfig.links.muteMinutes || 60,
                    modConfig.links.deleteMessage
                );
                return;
            }
        }
    }

    // ---------------- Spam filter ----------------
    if (modConfig.spam?.enabled) {
        const key = `${message.guild.id}-${message.author.id}-spam`;
        const windowMs = (modConfig.spam.intervalSeconds || 5) * 1000;
        const count = recordAndCount(key, windowMs);

        if (count >= (modConfig.spam.messageThreshold || 5)) {
            reset(key);
            await actionViolation(client, message, 'Spam', modConfig.spam.muteMinutes || 60, modConfig.spam.deleteMessages);
        }
    }
}

module.exports = { runAutoMod };
