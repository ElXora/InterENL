/**
 * /setcoins command
 * -----------------------------------------------------
 * Owner/Admin only. Sets a user's balance to an exact value.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const achievementManager = require('../../utils/achievementManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setcoins')
        .setDescription("Set a user's VSC balance to an exact amount. (Owner/Admin only)")
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The user to update.').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('The exact balance to set.').setMinValue(0).setRequired(true)),

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

        const updated = economyManager.setCoins(targetUser.id, targetUser.tag, amount);

        logger.logAction(client, {
            action: 'SETCOINS',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: `Set to ${amount} coins`
        });

        await achievementManager.checkAndAwardAchievements(targetUser.id, client);

        return interaction.editReply({
            embeds: [successEmbed('Coins Set', `${targetUser.tag}'s balance is now **${updated.coins}** VSC.`)]
        });
    }
};
