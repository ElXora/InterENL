/**
 * commandHandler.js
 * -----------------------------------------------------
 * Recursively loads every command file under /commands,
 * attaches them to client.commands, and returns their
 * SlashCommandBuilder JSON data for registration.
 * -----------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../utils/logger');

/**
 * Recursively walks a directory and returns all .js file paths.
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }

    return results;
}

/**
 * Loads all commands into client.commands and returns their
 * JSON data (for slash command registration).
 * @param {import('discord.js').Client} client
 * @returns {Array<object>} Array of SlashCommandBuilder#toJSON() output.
 */
function loadCommands(client) {
    client.commands = new Collection();

    const commandsDir = path.join(__dirname, '..', 'commands');
    const commandFiles = walk(commandsDir);
    const commandsData = [];

    for (const filePath of commandFiles) {
        try {
            delete require.cache[require.resolve(filePath)];
            const command = require(filePath);

            if (!command?.data || !command?.execute) {
                logger.warn(`Skipping invalid command file (missing data/execute): ${filePath}`);
                continue;
            }

            // The immediate parent folder under /commands doubles as its
            // category for /help (e.g. commands/games/slots.js -> "games").
            command.category = path.basename(path.dirname(filePath));

            client.commands.set(command.data.name, command);
            commandsData.push(command.data.toJSON());
            logger.info(`Loaded command: /${command.data.name}`);
        } catch (err) {
            logger.error(`Failed to load command file: ${filePath}`, err);
        }
    }

    logger.success(`Loaded ${client.commands.size} command(s) total.`);
    return commandsData;
}

module.exports = { loadCommands };
