/**
 * channelDelete.js
 * -----------------------------------------------------
 * Feeds every channel deletion into the anti-nuke system.
 * -----------------------------------------------------
 */

const { handleChannelDelete } = require('../handlers/antiNuke');
const logger = require('../utils/logger');

module.exports = {
    name: 'channelDelete',
    once: false,

    /**
     * @param {import('discord.js').GuildChannel} channel
     * @param {import('discord.js').Client} client
     */
    async execute(channel, client) {
        try {
            await handleChannelDelete(channel, client);
        } catch (err) {
            logger.error('Error in channelDelete anti-nuke handler.', err);
        }
    }
};
