/**
 * webhooksUpdate.js
 * -----------------------------------------------------
 * Feeds every webhook change into the anti-nuke system to
 * catch mass webhook-creation attacks (a common nuke/spam
 * vector).
 * -----------------------------------------------------
 */

const { handleWebhooksUpdate } = require('../handlers/antiNuke');
const logger = require('../utils/logger');

module.exports = {
    name: 'webhooksUpdate',
    once: false,

    /**
     * @param {import('discord.js').GuildChannel} channel
     * @param {import('discord.js').Client} client
     */
    async execute(channel, client) {
        try {
            await handleWebhooksUpdate(channel, client);
        } catch (err) {
            logger.error('Error in webhooksUpdate anti-nuke handler.', err);
        }
    }
};
