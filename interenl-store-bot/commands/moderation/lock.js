/**
 * /lock command
 * -----------------------------------------------------
 * Locks the current channel by denying @everyone the
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
        .setName('lock')
        .setDescription('Lock the current channel (prevents @everyone from sending messages).')
        .setDMPermission(false)
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for locking.').setRequired(false)),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.ManageChannels)) return;

        await interaction.deferReply({ ephemeral: true });

        const reason = interaction.options.getString('reason') || 'No reason provided.';

        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: false
            });
        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed('Lock Failed', `Could not lock this channel: ${err.message}`)]
            });
        }

        logger.logAction(client, {
            action: 'LOCK',
            admin: interaction.user.tag,
            target: `#${interaction.channel.name}`,
            details: reason
        });

        return interaction.editReply({
            embeds: [successEmbed('🔒 Channel Locked', `This channel has been locked.\n**Reason:** ${reason}`)]
        });
    }
};
