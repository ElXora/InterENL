/**
 * roleUpdate.js
 * -----------------------------------------------------
 * Feeds every role update into the anti-nuke system to
 * catch unauthorized Administrator permission grants.
 * -----------------------------------------------------
 */

const { handleRoleUpdate } = require('../handlers/antiNuke');
const logger = require('../utils/logger');

module.exports = {
    name: 'roleUpdate',
    once: false,

    /**
     * @param {import('discord.js').Role} oldRole
     * @param {import('discord.js').Role} newRole
     * @param {import('discord.js').Client} client
     */
    async execute(oldRole, newRole, client) {
        try {
            await handleRoleUpdate(oldRole, newRole, client);
        } catch (err) {
            logger.error('Error in roleUpdate anti-nuke handler.', err);
        }
    }
};
