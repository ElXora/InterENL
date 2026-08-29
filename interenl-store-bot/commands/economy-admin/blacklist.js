/**
 * /blacklist command
 * -----------------------------------------------------
 * Owner/Admin only. Permanently blacklists a user from the
 * InterENL Store Economy — they can no longer use /daily, /work,
 * claim loot drops, or send/receive VSC.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Permanently blacklist a user from the InterENL Store Economy. (Owner/Admin only)')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The user to blacklist.').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the blacklist.').setRequired(false)),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'You have been restricted by a InterENL Store Administrator.';

        economyManager.blacklistUser(targetUser.id, targetUser.tag, reason, interaction.user.tag);

        logger.logAction(client, {
            action: 'ECONOMY_BLACKLIST',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: reason
        });

        return interaction.editReply({
            embeds: [successEmbed('User Blacklisted', `${targetUser.tag} has been blacklisted from the InterENL Store Economy.\n**Reason:** ${reason}`)]
        });
    }
};
