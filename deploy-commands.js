/**
 * deploy-commands.js
 * -----------------------------------------------------
 * Standalone script to manually (re-)register slash commands
 * without starting the full bot. Useful if you've added/changed
 * commands and don't want to restart the bot to pick them up.
 *
 * Usage: npm run register
 * -----------------------------------------------------
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const logger = require('./utils/logger');
const config = require('./config');

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

async function main() {
    if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
        logger.error('BOT_TOKEN and CLIENT_ID must be set in your .env file.');
        process.exit(1);
    }

    const commandsDir = path.join(__dirname, 'commands');
    const commandFiles = walk(commandsDir);
    const commandsData = [];

    for (const filePath of commandFiles) {
        const command = require(filePath);
        if (command?.data) {
            commandsData.push(command.data.toJSON());
            logger.info(`Prepared command: /${command.data.name}`);
        }
    }

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    try {
        if (config.guildId) {
            await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commandsData });
            logger.success(`Registered ${commandsData.length} slash command(s) to guild ${config.guildId}.`);
        } else {
            await rest.put(Routes.applicationCommands(config.clientId), { body: commandsData });
            logger.success(`Registered ${commandsData.length} slash command(s) globally.`);
        }
    } catch (err) {
        logger.error('Failed to register slash commands.', err);
        process.exit(1);
    }
}

main();
