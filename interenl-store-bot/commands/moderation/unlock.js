/**
 * /unlock command
 * -----------------------------------------------------
 * Unlocks the current channel by restoring @everyone's
 * Send Messages permission. Requires "Manage Channels",
 * or bot Owner/Admin. Reply is ephemeral (only visible
 * to the moderator).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModPermission } = require('../../utils/modPermissions');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel.')
        .setDMPermission(false),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.ManageChannels)) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: null
            });
        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed('Unlock Failed', `Could not unlock this channel: ${err.message}`)]
            });
        }

        logger.logAction(client, {
            action: 'UNLOCK',
            admin: interaction.user.tag,
            target: `#${interaction.channel.name}`
        });

        return interaction.editReply({
            embeds: [successEmbed('🔓 Channel Unlocked', 'This channel has been unlocked.')]
        });
    }
};
