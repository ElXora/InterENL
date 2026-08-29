/**
 * inviteDelete.js
 * -----------------------------------------------------
 * Keeps the invite-tracker's in-memory cache in sync when an
 * invite is deleted/expires, so a future join diff doesn't
 * mistakenly compare against a code that no longer exists.
 * -----------------------------------------------------
 */

const inviteTracker = require('../handlers/inviteTracker');
const config = require('../config');
const logger = require('../utils/logger');

module.exports = {
    name: 'inviteDelete',
    once: false,

    /**
     * @param {import('discord.js').Invite} invite
     */
    async execute(invite) {
        try {
            if (config.invites?.enabled === false) return;
            inviteTracker.handleInviteDelete(invite);
        } catch (err) {
            logger.error('Error updating invite cache on inviteDelete.', err);
        }
    }
};
