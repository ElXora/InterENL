/**
 * /pay command
 * -----------------------------------------------------
 * Instant coin transfer (no confirmation step) — the quick
 * path. For a confirm/cancel-gated transfer, see /transfer.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const { checkNotBlacklisted } = require('../../utils/economyGuard');
const { errorEmbed } = require('../../embeds/embeds');
const { buildTransferSuccessEmbed } = require('../../embeds/economyEmbeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Instantly send VSC to another user.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('Who to pay.').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('How many VSC to send.').setMinValue(1).setRequired(true)),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', '❌ You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        if (!(await checkNotBlacklisted(interaction))) return;

        const receiver = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        if (receiver.bot) {
            return interaction.reply({
                embeds: [errorEmbed('Invalid Recipient', 'You cannot send VSC to a bot.')],
                ephemeral: true
            });
        }

        try {
            economyManager.transferCoins(interaction.user.id, interaction.user.tag, receiver.id, receiver.tag, amount);
        } catch (err) {
            return interaction.reply({ embeds: [errorEmbed('Transfer Failed', err.message)], ephemeral: true });
        }

        logger.logAction(client, {
            action: 'PAY',
            admin: interaction.user.tag,
            target: `${receiver.tag} (${receiver.id})`,
            details: `${amount} coins`
        });

        return interaction.reply({ embeds: [buildTransferSuccessEmbed(interaction.guild, amount, receiver)] });
    }
};
