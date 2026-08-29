/**
 * roleDelete.js
 * -----------------------------------------------------
 * Feeds every role deletion into the anti-nuke system.
 * -----------------------------------------------------
 */

const { handleRoleDelete } = require('../handlers/antiNuke');
const logger = require('../utils/logger');

module.exports = {
    name: 'roleDelete',
    once: false,

    /**
     * @param {import('discord.js').Role} role
     * @param {import('discord.js').Client} client
     */
    async execute(role, client) {
        try {
            await handleRoleDelete(role, client);
        } catch (err) {
            logger.error('Error in roleDelete anti-nuke handler.', err);
        }
    }
};
