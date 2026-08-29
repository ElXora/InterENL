/**
 * /transfer command
 * -----------------------------------------------------
 * Same underlying transfer as /pay, but gated behind a
 * Confirm/Cancel button step for extra safety on larger
 * transfers. Only the command author can use the buttons.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const { checkNotBlacklisted } = require('../../utils/economyGuard');
const { errorEmbed, infoEmbed } = require('../../embeds/embeds');
const { buildTransferConfirmEmbed, buildTransferSuccessEmbed } = require('../../embeds/economyEmbeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Send VSC to another user, with a confirmation step.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('Who to send coins to.').setRequired(true))
        .addIntegerOption((opt) => opt.setName('coins').setDescription('How many VSC to send.').setMinValue(1).setRequired(true)),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', '❌ You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        if (!(await checkNotBlacklisted(interaction))) return;

        const receiver = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('coins', true);

        if (receiver.bot) {
            return interaction.reply({
                embeds: [errorEmbed('Invalid Recipient', 'You cannot send VSC to a bot.')],
                ephemeral: true
            });
        }
        if (receiver.id === interaction.user.id) {
            return interaction.reply({
                embeds: [errorEmbed('Invalid Recipient', 'You cannot transfer coins to yourself.')],
                ephemeral: true
            });
        }

        const sender = economyManager.getUser(interaction.user.id);
        if (!sender || sender.coins < amount) {
            return interaction.reply({
                embeds: [errorEmbed('Insufficient Balance', `You don't have enough VSC — your balance is ${sender?.coins ?? 0}.`)],
                ephemeral: true
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('transfer_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId('transfer_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );

        const message = await interaction.reply({
            embeds: [buildTransferConfirmEmbed(interaction.guild, amount, receiver)],
            components: [row],
            fetchReply: true
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30_000,
            filter: (i) => i.user.id === interaction.user.id
        });

        let resolved = false;

        collector.on('collect', async (btnInteraction) => {
            resolved = true;
            collector.stop('resolved');

            if (btnInteraction.customId === 'transfer_cancel') {
                return btnInteraction.update({
                    embeds: [infoEmbed('Transfer Cancelled', 'This transfer was cancelled.')],
                    components: []
                });
            }

            try {
                economyManager.transferCoins(interaction.user.id, interaction.user.tag, receiver.id, receiver.tag, amount);
            } catch (err) {
                return btnInteraction.update({
                    embeds: [errorEmbed('Transfer Failed', err.message)],
                    components: []
                });
            }

            logger.logAction(client, {
                action: 'TRANSFER',
                admin: interaction.user.tag,
                target: `${receiver.tag} (${receiver.id})`,
                details: `${amount} coins`
            });

            return btnInteraction.update({
                embeds: [buildTransferSuccessEmbed(interaction.guild, amount, receiver)],
                components: []
            });
        });

        collector.on('end', async () => {
            if (!resolved) {
                await interaction
                    .editReply({
                        embeds: [infoEmbed('Transfer Timed Out', 'You took too long to confirm — this transfer was cancelled.')],
                        components: []
                    })
                    .catch(() => {});
            }
        });
    }
};
