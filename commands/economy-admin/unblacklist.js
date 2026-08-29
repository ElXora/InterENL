/**
 * /unblacklist command
 * -----------------------------------------------------
 * Owner/Admin only. Restores a user's full economy access.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unblacklist')
        .setDescription("Remove a user's InterENL Store Economy blacklist. (Owner/Admin only)")
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The user to unblacklist.').setRequired(true)),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        economyManager.unblacklistUser(targetUser.id, targetUser.tag);

        logger.logAction(client, {
            action: 'ECONOMY_UNBLACKLIST',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`
        });

        return interaction.editReply({
            embeds: [successEmbed('User Unblacklisted', `${targetUser.tag}'s InterENL Store Economy access has been restored.`)]
        });
    }
};
