/**
 * /addcoins command
 * -----------------------------------------------------
 * Owner/Admin only. Adds VSC to a user's balance.
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
        .setName('addcoins')
        .setDescription('Add VSC to a user. (Owner/Admin only)')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The user to give coins to.').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('How many coins to add.').setMinValue(1).setRequired(true)),

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

        const updated = economyManager.addCoins(targetUser.id, targetUser.tag, amount);

        logger.logAction(client, {
            action: 'ADDCOINS',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: `+${amount} coins (new balance: ${updated.coins})`
        });

        await achievementManager.checkAndAwardAchievements(targetUser.id, client);

        return interaction.editReply({
            embeds: [successEmbed('Coins Added', `Added **${amount}** VSC to ${targetUser.tag}.\nNew balance: **${updated.coins}**`)]
        });
    }
};
