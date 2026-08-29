/**
 * guildMemberAdd.js
 * -----------------------------------------------------
 * Posts a branded welcome embed in the configured channel
 * whenever a new member joins the server.
 *
 * Controlled entirely via .env / config.json — no code
 * changes needed to reconfigure:
 *   ENABLE_WELCOME=true|false   (config.welcome.enabled)
 *   WELCOME_CHANNEL_ID=...      (config.welcome.channelId)
 *
 * The message text (config.welcome.message) supports
 * %username%, %tag%, %mention% and {member} placeholders,
 * plus ":shortcode:" custom emoji from the server's emoji pack.
 * -----------------------------------------------------
 */

const config = require('../config');
const logger = require('../utils/logger');
const { buildWelcomeEmbed } = require('../embeds/welcomeEmbeds');
const inviteTracker = require('../handlers/inviteTracker');

module.exports = {
    name: 'guildMemberAdd',
    once: false,

    /**
     * @param {import('discord.js').GuildMember} member
     * @param {import('discord.js').Client} client
     */
    async execute(member, client) {
        // Invite tracking runs for every join, bots included (a bot being
        // added still uses up an invite/OAuth flow) — only the welcome
        // MESSAGE skips bots below.
        try {
            if (config.invites?.enabled !== false) {
                await inviteTracker.handleMemberAdd(member);
            }
        } catch (err) {
            logger.error('Error tracking invite for new member.', err);
        }

        try {
            if (!config.welcome?.enabled) return;
            if (member.user?.bot) return; // don't welcome bots joining the server

            const channelId = config.welcome?.channelId;
            if (!channelId) {
                logger.warn('ENABLE_WELCOME is on but WELCOME_CHANNEL_ID is not set in .env — skipping welcome message.');
                return;
            }

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                logger.warn(`Could not reach welcome channel ${channelId} — check WELCOME_CHANNEL_ID in .env.`);
                return;
            }

            const embed = buildWelcomeEmbed(member);
            await channel.send({ content: `${member}`, embeds: [embed] });
        } catch (err) {
            logger.error('Error in guildMemberAdd welcome handler.', err);
        }
    }
};
