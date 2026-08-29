/**
 * ready.js
 * -----------------------------------------------------
 * Fires once when the bot successfully logs in.
 * Registers slash commands (guild-scoped if GUILD_ID is set,
 * otherwise globally) and starts the expiration checker.
 * -----------------------------------------------------
 */

const { REST, Routes, ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const config = require('../config');
const { startExpirationChecker } = require('../handlers/expirationChecker');
const { rehydrateMutes } = require('../utils/muteManager');
const { startLootDropScheduler } = require('../handlers/lootDropHandler');
const { startGiveawayScheduler } = require('../handlers/giveawayScheduler');
const { primeInviteCache } = require('../handlers/inviteTracker');
const { startVerifyServer } = require('../handlers/verifyServer');

const ACTIVITY_TYPE_MAP = {
    playing: ActivityType.Playing,
    watching: ActivityType.Watching,
    listening: ActivityType.Listening,
    competing: ActivityType.Competing
};

/**
 * Starts cycling through config.presence.activities (or a single
 * legacy config.presence.text) every config.presence.rotateSeconds,
 * so the bot's status stays lively instead of one static line forever.
 * @param {import('discord.js').Client} client
 */
function startPresenceRotation(client) {
    const activities =
        config.presence?.activities && config.presence.activities.length > 0
            ? config.presence.activities
            : [{ type: 'watching', text: 'InterENL Store | /help' }];

    let index = 0;
    const apply = () => {
        const entry = activities[index % activities.length];
        client.user.setPresence({
            activities: [{ name: entry.text, type: ACTIVITY_TYPE_MAP[entry.type?.toLowerCase()] ?? ActivityType.Watching }],
            status: config.presence?.status || 'online'
        });
        index += 1;
    };

    apply();
    if (activities.length > 1) {
        setInterval(apply, (config.presence?.rotateSeconds ?? 20) * 1000);
    }
}

module.exports = {
    name: 'ready',
    once: true,

    /**
     * @param {import('discord.js').Client} client
     */
    async execute(client) {
        logger.success(`Logged in as ${client.user.tag}!`);

        startPresenceRotation(client);

        // ------------------------------------------------
        // Register slash commands
        // ------------------------------------------------
        try {
            const rest = new REST({ version: '10' }).setToken(config.token);
            const commandsData = client.pendingCommandData || [];

            if (config.guildId) {
                await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
                    body: commandsData
                });
                logger.success(`Registered ${commandsData.length} slash command(s) to guild ${config.guildId}.`);
            } else {
                await rest.put(Routes.applicationCommands(config.clientId), { body: commandsData });
                logger.success(
                    `Registered ${commandsData.length} slash command(s) globally (may take up to 1 hour to propagate).`
                );
            }
        } catch (err) {
            logger.error('Failed to register slash commands.', err);
        }

        // ------------------------------------------------
        // Start the automatic license expiration checker
        // ------------------------------------------------
        startExpirationChecker(client);

        // ------------------------------------------------
        // Restore any active mutes that were scheduled before
        // the bot last restarted, so they still auto-expire.
        // ------------------------------------------------
        rehydrateMutes(client);

        // ------------------------------------------------
        // Start the Loot Drop economy scheduler.
        // ------------------------------------------------
        startLootDropScheduler(client);

        // ------------------------------------------------
        // Start the Giveaway auto-end scheduler (also catches
        // up on any giveaway that expired while offline).
        // ------------------------------------------------
        startGiveawayScheduler(client);

        // ------------------------------------------------
        // Prime the invite-tracker cache for every guild so the
        // very first join after a restart can still be diffed
        // correctly.
        // ------------------------------------------------
        if (config.invites?.enabled !== false) {
            for (const guild of client.guilds.cache.values()) {
                await primeInviteCache(guild);
            }
        }

        // ------------------------------------------------
        // Start the /setverify OAuth2 web server, if configured.
        // ------------------------------------------------
        if (config.verify?.enabled !== false) {
            startVerifyServer(client);
        }

        // ------------------------------------------------
        // Verify the announce channel is actually reachable —
        // catches a bad ANNOUNCE_CHANNEL_ID at startup instead
        // of only when someone runs /announce.
        // ------------------------------------------------
        if (config.announceChannelId) {
            try {
                const channel = await client.channels.fetch(config.announceChannelId);
                if (channel) {
                    logger.success(`Announce channel verified: #${channel.name || channel.id}`);
                }
            } catch (err) {
                logger.warn(
                    `Could not reach announce channel ${config.announceChannelId} (${err.message}). ` +
                        `/announce will show this same error until ANNOUNCE_CHANNEL_ID is fixed in .env and the bot is restarted.`
                );
            }
        }

        logger.success('InterENL Store License Bot is fully online and operational.');
    }
};
