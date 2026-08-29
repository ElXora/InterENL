/**
 * /announce command
 * -----------------------------------------------------
 * Opens a Discord modal (popup form) for the admin to type
 * an announcement title, message, and optional image URL.
 * On submit, posts a branded embed to the configured
 * announcement channel (config.announceChannelId).
 *
 * Restricted to the bot Owner/Admin.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const { errorEmbed } = require('../../embeds/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Open the announcement composer and post to the announcements channel.')
        .setDMPermission(false),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', '❌ You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        const modal = new ModalBuilder().setCustomId('announce_modal').setTitle('📢 New Announcement');

        const titleInput = new TextInputBuilder()
            .setCustomId('announce_title')
            .setLabel('Announcement Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Scheduled Maintenance')
            .setMaxLength(256)
            .setRequired(true);

        const messageInput = new TextInputBuilder()
            .setCustomId('announce_message')
            .setLabel('Announcement Message')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Write your full announcement here...')
            .setMaxLength(4000)
            .setRequired(true);

        const imageInput = new TextInputBuilder()
            .setCustomId('announce_image')
            .setLabel('Image URL (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://...')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(messageInput),
            new ActionRowBuilder().addComponents(imageInput)
        );

        await interaction.showModal(modal);
    }
};
