/**
 * lootDropHandler.js
 * -----------------------------------------------------
 * The core Loot Drop feature:
 *  - Posts a loot drop in the configured channel at a random
 *    interval (config.economy.lootMinIntervalMinutes to
 *    lootMaxIntervalMinutes), then schedules the next one.
 *  - Uses a per-message MessageComponentCollector (rather than
 *    a global interaction router) so each drop's claim window
 *    is entirely self-contained and expires exactly on schedule.
 *  - The FIRST click wins: a synchronous "claimed" flag is set
 *    before any `await`, which — since Node runs one event
 *    handler at a time — makes this race-condition-proof even
 *    under simultaneous clicks.
 *  - On claim: rolls a reward (coins or a real InterENL Store license,
 *    generated + DMed via the existing license system), updates
 *    the winner's economy profile, checks achievements, edits
 *    the drop message, and sends a separate ping message so the
 *    winner actually gets notified (embed edits don't ping).
 *  - On expiry with no claim: edits the message to the expired state.
 * -----------------------------------------------------
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const economyManager = require('../utils/economyManager');
const licenseManager = require('../utils/licenseManager');
const achievementManager = require('../utils/achievementManager');
const { rollReward } = require('../utils/rewardRoller');
const { buildLicenseEmbed } = require('../embeds/embeds');
const {
    buildLootDropEmbed,
    buildLootClaimedEmbed,
    buildLootExpiredEmbed,
    buildWinnerAnnouncementEmbed
} = require('../embeds/economyEmbeds');

/**
 * Picks a random delay (ms) between the configured min/max loot
 * interval, in minutes.
 * @returns {number}
 */
function randomIntervalMs() {
    const minMinutes = config.economy?.lootMinIntervalMinutes ?? 20;
    const maxMinutes = config.economy?.lootMaxIntervalMinutes ?? 60;
    const minutes = Math.random() * (maxMinutes - minMinutes) + minMinutes;
    return Math.round(minutes * 60 * 1000);
}

/**
 * Applies a rolled reward to the winner: adds coins, or generates
 * + DMs a real license and records the win. Always increments
 * lootDropsClaimed and runs the achievement check.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').User} winnerUser
 * @param {{type: string, amount?: number, plan?: string, label: string}} reward
 */
async function applyReward(client, winnerUser, reward) {
    economyManager.getOrCreateUser(winnerUser.id, winnerUser.tag);

    if (reward.type === 'coins') {
        economyManager.addCoins(winnerUser.id, winnerUser.tag, reward.amount);
    } else if (reward.type === 'license' && config.economy?.enableLicenses) {
        try {
            const license = licenseManager.generateLicense({
                username: winnerUser.tag,
                discordID: winnerUser.id,
                email: `loot-drop-${winnerUser.id}@interenlstore.internal`,
                plan: reward.plan,
                generatedBy: client.user.id
            });

            const user = economyManager.getUser(winnerUser.id);
            user.licenseWins += 1;
            economyManager.saveUser(user);

            try {
                await winnerUser.send({
                    embeds: [
                        buildLicenseEmbed(license)
                            .setTitle('🎉 You Won a InterENL Store License!')
                            .setDescription('Congratulations — you were the fastest to claim a Loot Drop and won a real InterENL Store license!')
                    ]
                });
            } catch (err) {
                logger.warn(`Could not DM loot-drop license win to ${winnerUser.tag}: ${err.message}`);
            }

            logger.logAction(client, {
                action: 'LOOT_LICENSE_WIN',
                admin: 'SYSTEM',
                target: `${winnerUser.tag} (${winnerUser.id})`,
                license: license.license,
                details: `Plan: ${reward.plan}`
            });
        } catch (err) {
            logger.error('Failed to generate loot-drop license reward.', err);
        }
    }

    const user = economyManager.getUser(winnerUser.id);
    user.lootDropsClaimed += 1;
    economyManager.saveUser(user);

    await achievementManager.checkAndAwardAchievements(winnerUser.id, client);

    logger.logAction(client, {
        action: 'LOOT_CLAIM',
        admin: 'SYSTEM',
        target: `${winnerUser.tag} (${winnerUser.id})`,
        details: reward.label
    });
}

/**
 * Posts a single loot drop in the configured channel and wires up
 * its claim collector. Always schedules the next drop afterward
 * (on claim, expiry, or failure) so the cycle continues indefinitely.
 * @param {import('discord.js').Client} client
 */
async function postLootDrop(client) {
    if (!config.economy?.enabled || !config.economy?.enableLootDrops) {
        scheduleNextDrop(client);
        return;
    }

    if (!config.lootChannelId) {
        logger.warn('Loot Drops are enabled but LOOT_CHANNEL_ID is not set in .env — skipping this drop.');
        scheduleNextDrop(client);
        return;
    }

    const channel = await client.channels.fetch(config.lootChannelId).catch((err) => {
        logger.warn(`Could not reach the configured loot channel (${config.lootChannelId}): ${err.message}`);
        return null;
    });

    if (!channel || !channel.isTextBased()) {
        scheduleNextDrop(client);
        return;
    }

    const expireSeconds = config.economy?.lootExpireSeconds || 60;
    const button = new ButtonBuilder()
        .setCustomId('loot_claim')
        .setLabel('Claim Loot')
        .setEmoji('🎁')
        .setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(button);

    let message;
    try {
        message = await channel.send({ embeds: [buildLootDropEmbed(channel.guild, expireSeconds)], components: [row] });
    } catch (err) {
        logger.error('Failed to post loot drop message.', err);
        scheduleNextDrop(client);
        return;
    }

    let claimed = false;
    let winnerId = null;

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: expireSeconds * 1000
    });

    collector.on('collect', async (btnInteraction) => {
        // Already claimed by someone else — everyone after the winner lands here.
        if (claimed) {
            return btnInteraction
                .reply({ content: `❌ Already claimed by <@${winnerId}>`, ephemeral: true })
                .catch(() => {});
        }

        // Synchronous lock BEFORE any await — this is what makes it
        // race-condition-safe even if multiple clicks arrive at once.
        claimed = true;
        winnerId = btnInteraction.user.id;
        collector.stop('claimed');

        const reward = rollReward();

        try {
            await btnInteraction.deferUpdate();
        } catch (err) {
            // Interaction may have already expired client-side — the reward
            // still gets applied and the message still gets updated below.
        }

        try {
            await applyReward(client, btnInteraction.user, reward);
        } catch (err) {
            logger.error('Failed to apply loot drop reward.', err);
        }

        const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(button).setDisabled(true));

        try {
            await message.edit({
                embeds: [buildLootClaimedEmbed(channel.guild, btnInteraction.user, reward)],
                components: [disabledRow]
            });
        } catch (err) {
            logger.warn(`Could not edit claimed loot drop message: ${err.message}`);
        }

        // Separate ping message — editing the embed above does NOT notify
        // the winner, so we send a fresh message with a real mention.
        try {
            await channel.send({
                content: `${btnInteraction.user}`,
                embeds: [buildWinnerAnnouncementEmbed(channel.guild, btnInteraction.user, reward)]
            });
        } catch (err) {
            logger.warn(`Could not send loot drop winner announcement: ${err.message}`);
        }
    });

    collector.on('end', async () => {
        if (!claimed) {
            const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(button).setDisabled(true));
            try {
                await message.edit({ embeds: [buildLootExpiredEmbed(channel.guild)], components: [disabledRow] });
            } catch (err) {
                // Non-fatal — message may have been deleted manually.
            }
        }
        scheduleNextDrop(client);
    });
}

/**
 * Schedules the next loot drop after a random interval.
 * @param {import('discord.js').Client} client
 */
function scheduleNextDrop(client) {
    const delay = randomIntervalMs();
    logger.info(`Next loot drop scheduled in ${Math.round(delay / 60000)} minute(s).`);
    setTimeout(() => postLootDrop(client), delay);
}

/**
 * Starts the loot drop cycle. Call once on bot startup.
 * @param {import('discord.js').Client} client
 */
function startLootDropScheduler(client) {
    if (!config.economy?.enabled || !config.economy?.enableLootDrops) {
        logger.info('Loot Drops are disabled in config — scheduler not started.');
        return;
    }
    scheduleNextDrop(client);
    logger.success('Loot Drop scheduler started.');
}

module.exports = { startLootDropScheduler, postLootDrop };
