/**
 * inviteCreate.js
 * -----------------------------------------------------
 * Keeps the invite-tracker's in-memory cache in sync the
 * instant a new invite is created, so it's accurate even
 * before anyone joins with it.
 * -----------------------------------------------------
 */

const inviteTracker = require('../handlers/inviteTracker');
const config = require('../config');
const logger = require('../utils/logger');

module.exports = {
    name: 'inviteCreate',
    once: false,

    /**
     * @param {import('discord.js').Invite} invite
     */
    async execute(invite) {
        try {
            if (config.invites?.enabled === false) return;
            inviteTracker.handleInviteCreate(invite);
        } catch (err) {
            logger.error('Error updating invite cache on inviteCreate.', err);
        }
    }
};
