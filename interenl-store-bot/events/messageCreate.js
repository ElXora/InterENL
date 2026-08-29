/**
 * messageCreate.js
 * -----------------------------------------------------
 * Fires on every message the bot can see. Runs the message
 * through both the auto-moderation system (profanity, spam,
 * links) and the License Leak Detection system.
 * -----------------------------------------------------
 */

const { scanMessageForLeaks } = require('../handlers/leakDetection');
const { runAutoMod } = require('../handlers/autoMod');
const { handleMessageXp } = require('../handlers/levelingHandler');
const logger = require('../utils/logger');

module.exports = {
    name: 'messageCreate',
    once: false,

    /**
     * @param {import('discord.js').Message} message
     * @param {import('discord.js').Client} client
     */
    async execute(message, client) {
        try {
            await runAutoMod(client, message);
        } catch (err) {
            logger.error('Error while running automod on message.', err);
        }

        try {
            await scanMessageForLeaks(client, message);
        } catch (err) {
            logger.error('Error while scanning message for license leaks.', err);
        }

        try {
            await handleMessageXp(client, message);
        } catch (err) {
            logger.error('Error while awarding message XP.', err);
        }
    }
};

