/**
 * /giveaway command
 * -----------------------------------------------------
 * create/end/reroll/cancel subcommands. Gated on the same
 * Owner/Admin permission system as every other staff command
 * in the bot (utils/permissions.js) — "authorized staff" per
 * the spec means whoever already has bot Admin access.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { randomUUID } = require('crypto');
const config = require('../../config');
const permissions = require('../../utils/permissions');
const giveawayManager = require('../../utils/giveawayManager');
const economyManager = require('../../utils/economyManager');
const { parseDuration } = require('../../utils/duration');
const { resolveGiveaway } = require('../../handlers/giveawayScheduler');
const { buildGiveawayPanelEmbed, buildGiveawayEndedEmbed, buildGiveawayCancelledEmbed } = require('../../embeds/giveawayEmbeds');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');

function buildEnterRow(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('giveaway_enter').setLabel('Enter Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success).setDisabled(disabled)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Create and manage giveaways.')
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('create')
                .setDescription('Start a new giveaway.')
                .addStringOption((opt) => opt.setName('prize').setDescription('What the winner(s) receive.').setRequired(true))
                .addStringOption((opt) => opt.setName('duration').setDescription('How long it runs, e.g. "2h", "30m", "1d12h".').setRequired(true))
                .addIntegerOption((opt) => opt.setName('winners').setDescription('Number of winners (default 1).').setRequired(false).setMinValue(1))
                .addIntegerOption((opt) => opt.setName('min_level').setDescription('Minimum /rank level required to enter.').setRequired(false).setMinValue(1))
                .addRoleOption((opt) => opt.setName('required_role').setDescription('Role required to enter.').setRequired(false))
                .addIntegerOption((opt) => opt.setName('coin_amount').setDescription('If set, auto-pays each winner this many VSC on top of the prize text.').setRequired(false).setMinValue(1))
        )
        .addSubcommand((sub) =>
            sub.setName('end').setDescription('End a giveaway immediately and draw winner(s).').addStringOption((opt) => opt.setName('message_id').setDescription('The giveaway panel message ID.').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub.setName('reroll').setDescription('Re-draw new winner(s) for an already-ended giveaway.').addStringOption((opt) => opt.setName('message_id').setDescription('The giveaway panel message ID.').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub.setName('cancel').setDescription('Cancel an active giveaway with no winner drawn.').addStringOption((opt) => opt.setName('message_id').setDescription('The giveaway panel message ID.').setRequired(true))
        ),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({ embeds: [errorEmbed('Access Denied', 'You do not have permission to manage giveaways.')], ephemeral: true });
        }

        if (config.giveaways?.enabled === false) {
            return interaction.reply({ embeds: [errorEmbed('Giveaways Disabled', 'The giveaway system is currently disabled.')], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const prize = interaction.options.getString('prize');
            const durationInput = interaction.options.getString('duration');
            const winnerCount = interaction.options.getInteger('winners') || config.giveaways?.defaultWinnerCount || 1;
            const minLevel = interaction.options.getInteger('min_level');
            const requiredRole = interaction.options.getRole('required_role');
            const coinAmount = interaction.options.getInteger('coin_amount');

            const durationMs = parseDuration(durationInput);
            if (!durationMs) {
                return interaction.reply({
                    embeds: [errorEmbed('Invalid Duration', 'Use a format like `30m`, `2h`, or `1d12h`.')],
                    ephemeral: true
                });
            }

            const giveaway = {
                id: randomUUID(),
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                messageId: null,
                prize: coinAmount ? `${prize} (+${coinAmount.toLocaleString()} ${config.economy?.currencyName || 'VSC'} per winner)` : prize,
                hostId: interaction.user.id,
                winnerCount,
                minLevel: minLevel || null,
                requiredRoleId: requiredRole ? requiredRole.id : null,
                coinAmount: coinAmount || 0,
                endsAt: Date.now() + durationMs,
                entries: [],
                status: 'active',
                winners: [],
                createdAt: Date.now()
            };

            await interaction.reply({ content: '🎁 Starting giveaway...', ephemeral: true });
            const panelMessage = await interaction.channel.send({ embeds: [buildGiveawayPanelEmbed(giveaway)], components: [buildEnterRow()] });

            giveaway.messageId = panelMessage.id;
            giveawayManager.createGiveaway(giveaway);

            return interaction.editReply({ content: `✅ Giveaway started! It will end <t:${Math.floor(giveaway.endsAt / 1000)}:R>.` });
        }

        const messageId = interaction.options.getString('message_id');
        const giveaway = giveawayManager.getGiveawayByMessageId(messageId);

        if (!giveaway) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', "No giveaway found with that message ID.")], ephemeral: true });
        }

        if (subcommand === 'end') {
            if (giveaway.status !== 'active') {
                return interaction.reply({ embeds: [errorEmbed('Already Ended', 'That giveaway has already ended or been cancelled.')], ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });
            const winners = await resolveGiveaway(client, giveaway);
            if (giveaway.coinAmount > 0) {
                for (const winnerId of winners) economyManager.addCoins(winnerId, winnerId, giveaway.coinAmount);
            }
            return interaction.editReply({ embeds: [successEmbed('Giveaway Ended', `Drew ${winners.length} winner(s).`)] });
        }

        if (subcommand === 'reroll') {
            if (giveaway.status !== 'ended') {
                return interaction.reply({ embeds: [errorEmbed('Not Ended', 'Only an already-ended giveaway can be rerolled.')], ephemeral: true });
            }

            const remainingEntries = giveaway.entries.filter((id) => !giveaway.winners.includes(id));
            const pool = remainingEntries.length > 0 ? remainingEntries : giveaway.entries;
            const newWinners = giveawayManager.drawWinners(pool, giveaway.winnerCount);
            giveaway.winners = newWinners;
            giveawayManager.saveGiveaway(giveaway);

            if (giveaway.coinAmount > 0) {
                for (const winnerId of newWinners) economyManager.addCoins(winnerId, winnerId, giveaway.coinAmount);
            }

            try {
                const channel = await client.channels.fetch(giveaway.channelId);
                await channel.send({
                    content: newWinners.length > 0 ? newWinners.map((id) => `<@${id}>`).join(' ') : undefined,
                    embeds: [buildGiveawayEndedEmbed(giveaway, newWinners)]
                });
            } catch (err) {
                // Non-fatal — reroll is still recorded even if announcement fails.
            }

            return interaction.reply({ embeds: [successEmbed('Rerolled', `Drew ${newWinners.length} new winner(s).`)], ephemeral: true });
        }

        if (subcommand === 'cancel') {
            if (giveaway.status !== 'active') {
                return interaction.reply({ embeds: [errorEmbed('Cannot Cancel', 'Only an active giveaway can be cancelled.')], ephemeral: true });
            }

            giveaway.status = 'cancelled';
            giveawayManager.saveGiveaway(giveaway);

            try {
                const channel = await client.channels.fetch(giveaway.channelId);
                const panelMessage = await channel.messages.fetch(giveaway.messageId);
                await panelMessage.edit({ embeds: [buildGiveawayCancelledEmbed(giveaway)], components: [] });
            } catch (err) {
                // Non-fatal.
            }

            return interaction.reply({ embeds: [successEmbed('Cancelled', 'The giveaway was cancelled.')], ephemeral: true });
        }
    }
};
