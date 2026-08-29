/**
 * /mute command
 * -----------------------------------------------------
 * Applies the Muted role to a member for a given duration
 * (or indefinitely). Requires "Moderate Members", or bot
 * Owner/Admin. Reply is ephemeral (only visible to the
 * moderator).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModPermission } = require('../../utils/modPermissions');
const { muteMember } = require('../../utils/muteManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a member for a set duration (or indefinitely).')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The member to mute.').setRequired(true))
        .addIntegerOption((opt) =>
            opt
                .setName('minutes')
                .setDescription('Mute duration in minutes. Leave blank / 0 for indefinite.')
                .setMinValue(0)
                .setRequired(false)
        )
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the mute.').setRequired(false)),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.ModerateMembers)) return;

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const minutes = interaction.options.getInteger('minutes');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({
                embeds: [errorEmbed('Member Not Found', 'That user is not currently in this server.')]
            });
        }

        try {
            await muteMember(targetMember, minutes && minutes > 0 ? minutes : null, `${reason} — by ${interaction.user.tag}`, client);
        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed('Mute Failed', `Could not mute this user: ${err.message}`)]
            });
        }

        logger.logAction(client, {
            action: 'MUTE',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: `${reason} | Duration: ${minutes && minutes > 0 ? `${minutes} minute(s)` : 'Indefinite'}`
        });

        return interaction.editReply({
            embeds: [
                successEmbed(
                    'Member Muted',
                    `${targetUser.tag} has been muted${minutes && minutes > 0 ? ` for **${minutes} minute(s)**` : ' indefinitely'}.\n**Reason:** ${reason}`
                )
            ]
        });
    }
};
