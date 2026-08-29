/**
 * /ban command
 * -----------------------------------------------------
 * Bans a member from the server. Requires the native
 * "Ban Members" Discord permission, or bot Owner/Admin.
 * Reply is ephemeral (only visible to the moderator).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModPermission } = require('../../utils/modPermissions');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The member to ban.').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the ban.').setRequired(false))
        .addIntegerOption((opt) =>
            opt
                .setName('delete_messages_days')
                .setDescription('Days of their message history to delete (0-7).')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        ),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.BanMembers)) return;

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const deleteDays = interaction.options.getInteger('delete_messages_days') || 0;

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (targetMember && !targetMember.bannable) {
            return interaction.editReply({
                embeds: [errorEmbed('Cannot Ban', 'I do not have permission to ban this member (role hierarchy).')]
            });
        }

        try {
            await interaction.guild.members.ban(targetUser.id, {
                reason: `${reason} — by ${interaction.user.tag}`,
                deleteMessageSeconds: deleteDays * 86400
            });
        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed('Ban Failed', `Could not ban this user: ${err.message}`)]
            });
        }

        logger.logAction(client, {
            action: 'BAN',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: reason
        });

        return interaction.editReply({
            embeds: [successEmbed('Member Banned', `${targetUser.tag} has been banned.\n**Reason:** ${reason}`)]
        });
    }
};
