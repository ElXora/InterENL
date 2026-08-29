/**
 * /removecoins command
 * -----------------------------------------------------
 * Owner/Admin only. Removes VSC from a user's balance
 * (clamped at 0 — never goes negative).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removecoins')
        .setDescription('Remove VSC from a user. (Owner/Admin only)')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The user to remove coins from.').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('How many coins to remove.').setMinValue(1).setRequired(true)),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        const updated = economyManager.removeCoins(targetUser.id, targetUser.tag, amount);

        logger.logAction(client, {
            action: 'REMOVECOINS',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: `-${amount} coins (new balance: ${updated.coins})`
        });

        return interaction.editReply({
            embeds: [successEmbed('Coins Removed', `Removed **${amount}** VSC from ${targetUser.tag}.\nNew balance: **${updated.coins}**`)]
        });
    }
};
