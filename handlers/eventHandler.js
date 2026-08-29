/**
 * eventHandler.js
 * -----------------------------------------------------
 * Loads every event file under /events and binds it to
 * the Discord client via client.on / client.once.
 * -----------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Loads all event handlers and binds them to the client.
 * Each event file must export { name, once (optional), execute }.
 * @param {import('discord.js').Client} client
 */
function loadEvents(client) {
    const eventsDir = path.join(__dirname, '..', 'events');
    const eventFiles = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsDir, file);

        try {
            delete require.cache[require.resolve(filePath)];
            const event = require(filePath);

            if (!event?.name || !event?.execute) {
                logger.warn(`Skipping invalid event file (missing name/execute): ${filePath}`);
                continue;
            }

            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }

            logger.info(`Loaded event: ${event.name}`);
        } catch (err) {
            logger.error(`Failed to load event file: ${filePath}`, err);
        }
    }

    logger.success(`Loaded ${eventFiles.length} event(s) total.`);
}

module.exports = { loadEvents };
