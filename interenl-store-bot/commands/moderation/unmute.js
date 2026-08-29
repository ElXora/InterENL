/**
 * /unmute command
 * -----------------------------------------------------
 * Removes the Muted role from a member. Requires
 * "Moderate Members", or bot Owner/Admin. Reply is
 * ephemeral (only visible to the moderator).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModPermission } = require('../../utils/modPermissions');
const { unmuteMember } = require('../../utils/muteManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove a mute from a member.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The member to unmute.').setRequired(true)),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.ModerateMembers)) return;

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({
                embeds: [errorEmbed('Member Not Found', 'That user is not currently in this server.')]
            });
        }

        try {
            await unmuteMember(targetMember, `Manually unmuted by ${interaction.user.tag}`);
        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed('Unmute Failed', `Could not unmute this user: ${err.message}`)]
            });
        }

        logger.logAction(client, {
            action: 'UNMUTE',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`
        });

        return interaction.editReply({
            embeds: [successEmbed('Member Unmuted', `${targetUser.tag} has been unmuted.`)]
        });
    }
};
