/**
 * guildMemberRemove.js
 * -----------------------------------------------------
 * Feeds every member departure into the anti-nuke system,
 * which distinguishes voluntary leaves from kicks via the
 * audit log and watches for mass-kicking attacks.
 * -----------------------------------------------------
 */

const { handleMemberRemove } = require('../handlers/antiNuke');
const inviteTracker = require('../handlers/inviteTracker');
const config = require('../config');
const logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberRemove',
    once: false,

    /**
     * @param {import('discord.js').GuildMember} member
     * @param {import('discord.js').Client} client
     */
    async execute(member, client) {
        try {
            await handleMemberRemove(member, client);
        } catch (err) {
            logger.error('Error in guildMemberRemove anti-nuke handler.', err);
        }

        try {
            if (config.invites?.enabled !== false) {
                inviteTracker.handleMemberRemove(member);
            }
        } catch (err) {
            logger.error('Error tracking invite leave.', err);
        }
    }
};
