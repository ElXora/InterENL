/**
 * giveawayScheduler.js
 * -----------------------------------------------------
 * Polls giveaways.json every 15s for active giveaways whose
 * endsAt has passed and ends them automatically — same pattern
 * as expirationChecker.js for licenses. Also runs once
 * immediately on boot so giveaways that expired while the bot
 * was offline get resolved right away (persistent across restarts).
 * -----------------------------------------------------
 */

const config = require('../config');
const logger = require('../utils/logger');
const giveawayManager = require('../utils/giveawayManager');
const progressionManager = require('../utils/progressionManager');
const { buildGiveawayPanelEmbed, buildGiveawayEndedEmbed } = require('../embeds/giveawayEmbeds');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CHECK_INTERVAL_MS = 15000;

function buildDisabledEnterRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('giveaway_enter').setLabel('Giveaway Ended').setEmoji('🎉').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
}

/**
 * Draws winners, updates the panel message, posts the real
 * (pinging) winner announcement, records stats, and marks the
 * giveaway ended. Shared by both the automatic scheduler and
 * `/giveaway end` (manual early end).
 * @param {import('discord.js').Client} client
 * @param {import('../utils/giveawayManager').Giveaway} giveaway
 * @returns {Promise<string[]>} The drawn winner IDs.
 */
async function resolveGiveaway(client, giveaway) {
    const winners = giveawayManager.drawWinners(giveaway.entries, giveaway.winnerCount);
    giveaway.status = 'ended';
    giveaway.winners = winners;
    giveawayManager.saveGiveaway(giveaway);

    for (const winnerId of winners) {
        let tag = winnerId;
        try {
            const winnerUser = await client.users.fetch(winnerId);
            tag = winnerUser.tag;
        } catch (err) {
            // Fall back to the raw ID if the user can't be fetched (e.g. left the server).
        }
        progressionManager.recordGiveawayWin(winnerId, tag);
    }

    try {
        const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
            const panelMessage = await channel.messages.fetch(giveaway.messageId).catch(() => null);
            if (panelMessage) {
                await panelMessage.edit({ embeds: [buildGiveawayPanelEmbed(giveaway)], components: [buildDisabledEnterRow()] });
            }

            // Real pings only work from message `content`, never from inside
            // an embed (see utils/mentionHelper.js) — send winners there.
            await channel.send({
                content: winners.length > 0 ? winners.map((id) => `<@${id}>`).join(' ') : undefined,
                embeds: [buildGiveawayEndedEmbed(giveaway, winners)]
            });
        }

        if (config.giveaways?.logChannelId) {
            const logChannel = await client.channels.fetch(config.giveaways.logChannelId).catch(() => null);
            if (logChannel && logChannel.isTextBased()) {
                await logChannel.send({ embeds: [buildGiveawayEndedEmbed(giveaway, winners)] });
            }
        }
    } catch (err) {
        logger.error(`Error announcing results for giveaway ${giveaway.id}.`, err);
    }

    return winners;
}

/**
 * Starts the interval that automatically ends giveaways whose
 * time is up, and immediately catches up on any that expired
 * while the bot was offline.
 * @param {import('discord.js').Client} client
 */
function startGiveawayScheduler(client) {
    const tick = async () => {
        if (config.giveaways?.enabled === false) return;

        const now = Date.now();
        const dueGiveaways = giveawayManager.getActiveGiveaways().filter((g) => g.endsAt <= now);

        for (const giveaway of dueGiveaways) {
            try {
                await resolveGiveaway(client, giveaway);
            } catch (err) {
                logger.error(`Error auto-ending giveaway ${giveaway.id}.`, err);
            }
        }
    };

    tick(); // Catch up immediately on boot.
    setInterval(tick, CHECK_INTERVAL_MS);
    logger.info('Giveaway scheduler started (checking every 15s).');
}

module.exports = { startGiveawayScheduler, resolveGiveaway };
