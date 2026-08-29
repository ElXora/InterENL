/**
 * guildBanAdd.js
 * -----------------------------------------------------
 * Feeds every ban into the anti-nuke system to catch
 * mass-banning attacks.
 * -----------------------------------------------------
 */

const { handleBanAdd } = require('../handlers/antiNuke');
const logger = require('../utils/logger');

module.exports = {
    name: 'guildBanAdd',
    once: false,

    /**
     * @param {import('discord.js').GuildBan} ban
     * @param {import('discord.js').Client} client
     */
    async execute(ban, client) {
        try {
            await handleBanAdd(ban, client);
        } catch (err) {
            logger.error('Error in guildBanAdd anti-nuke handler.', err);
        }
    }
};
