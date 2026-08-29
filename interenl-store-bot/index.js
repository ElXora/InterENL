/**
 * index.js
 * -----------------------------------------------------
 * InterENL Store License Bot — Main Entry Point
 *
 * Boot sequence:
 *   1. Load environment variables.
 *   2. Initialize storage (licenses/, licenses.json, admins.json).
 *   3. Create the Discord client with required intents.
 *   4. Load command & event handlers.
 *   5. Log in to Discord.
 *
 * Slash command registration happens inside the "ready" event,
 * once the client is authenticated (client.user is available).
 * -----------------------------------------------------
 */

require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const logger = require('./utils/logger');
const permissions = require('./utils/permissions');
const licenseManager = require('./utils/licenseManager');
const config = require('./config');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

// ------------------------------------------------
// Startup validation
// ------------------------------------------------
if (!process.env.BOT_TOKEN) {
    logger.error('BOT_TOKEN is missing from your .env file. Please copy .env.example to .env and configure it.');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    logger.error('CLIENT_ID is missing from your .env file. Please copy .env.example to .env and configure it.');
    process.exit(1);
}

// ------------------------------------------------
// Initialize storage (creates folders/files if missing)
// ------------------------------------------------
logger.info('Initializing storage...');
licenseManager.initStorage(); // creates /licenses and licenses.json
permissions.initAdminsFile(); // creates admins.json
require('./utils/muteManager'); // creates mutes.json
require('./utils/warnManager'); // creates warnings.json
logger.success('Storage initialized (licenses.json, admins.json, mutes.json, warnings.json ready).');

const existingLicenses = licenseManager.loadLicenses();
const existingAdmins = permissions.loadAdmins();
logger.info(`Loaded ${existingLicenses.length} existing license(s).`);
logger.info(`Loaded ${existingAdmins.length} existing admin(s) from admins.json.`);

// ------------------------------------------------
// Startup config diagnostics — printed every boot so
// misconfiguration (wrong owner ID, missing announce
// channel, etc.) is obvious immediately instead of only
// showing up as a confusing in-Discord error later.
// ------------------------------------------------
logger.info(`Owner ID: ${config.ownerID}`);
logger.info(
    `Static admin ID(s) from .env: ${config.staticAdminIds.length > 0 ? config.staticAdminIds.join(', ') : 'none set'}`
);
if (config.announceChannelId) {
    logger.info(`Announce channel ID: ${config.announceChannelId}`);
} else {
    logger.warn('No ANNOUNCE_CHANNEL_ID set in .env — /announce will not work until this is configured.');
}

// ------------------------------------------------
// Create Discord client
// ------------------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // member fetch/role management for mod + anti-nuke + invite tracking
        GatewayIntentBits.GuildModeration, // ban add/remove events for anti-nuke mass-ban detection
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // required for automod + license leak detection
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildInvites // inviteCreate/inviteDelete events for invite tracking
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

// ------------------------------------------------
// Load commands & events
// ------------------------------------------------
logger.info('Loading commands...');
const commandsData = loadCommands(client);
client.pendingCommandData = commandsData; // consumed by the ready event for registration

logger.info('Loading events...');
loadEvents(client);

// ------------------------------------------------
// Global error safety nets
// ------------------------------------------------
process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled promise rejection: ${err?.message || err}`, err);
});

process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err?.message || err}`, err);
});

// ------------------------------------------------
// Log in
// ------------------------------------------------
logger.info('Logging in to Discord...');
client.login(process.env.BOT_TOKEN).catch((err) => {
    logger.error(`Failed to log in: ${err.message}`, err);
    process.exit(1);
});
