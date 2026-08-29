/**
 * /kick command
 * -----------------------------------------------------
 * Kicks a member from the server. Requires the native
 * "Kick Members" Discord permission, or bot Owner/Admin.
 * Reply is ephemeral (only visible to the moderator).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModPermission } = require('../../utils/modPermissions');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The member to kick.').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the kick.').setRequired(false)),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.KickMembers)) return;

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({
                embeds: [errorEmbed('Member Not Found', 'That user is not currently in this server.')]
            });
        }

        if (!targetMember.kickable) {
            return interaction.editReply({
                embeds: [errorEmbed('Cannot Kick', 'I do not have permission to kick this member (role hierarchy).')]
            });
        }

        try {
            await targetMember.kick(`${reason} — by ${interaction.user.tag}`);
        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed('Kick Failed', `Could not kick this user: ${err.message}`)]
            });
        }

        logger.logAction(client, {
            action: 'KICK',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: reason
        });

        return interaction.editReply({
            embeds: [successEmbed('Member Kicked', `${targetUser.tag} has been kicked.\n**Reason:** ${reason}`)]
        });
    }
};
