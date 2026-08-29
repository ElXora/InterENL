/**
 * /ticketpanel command
 * -----------------------------------------------------
 * Posts the public ticket panel (embed + category dropdown)
 * in the current channel, and best-effort configures the
 * channel's permission overwrites so the Staff and Owner
 * roles can see and manage every private ticket thread
 * created here (see the privacy note in ticketHandler.js
 * for why this specific permission — "Manage Threads" — is
 * what actually grants that visibility in Discord).
 *
 * Owner/Admin only.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const permissions = require('../../utils/permissions');
const config = require('../../config');
const logger = require('../../utils/logger');
const { resolveTicketRoles } = require('../../utils/roleResolver');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const { buildPanelEmbed } = require('../../embeds/ticketEmbeds');
const { resolveCustomEmojiObject } = require('../../utils/emojiResolver');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticketpanel')
        .setDescription('Post the ticket panel in this channel.')
        .setDMPermission(false),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', '❌ You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        if (config.tickets?.enabled === false) {
            return interaction.reply({
                embeds: [errorEmbed('Tickets Disabled', 'The ticket system is currently disabled (`ENABLE_TICKETS=false` in `.env`).')],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const { staffRole, ownerRole } = await resolveTicketRoles(interaction.guild);
        const warnings = [];

        if (!staffRole) warnings.push('Could not find the Staff role — set `TICKET_STAFF_ROLE_ID` in `.env`.');
        if (!ownerRole) warnings.push('Could not find the Owner role — set `TICKET_OWNER_ROLE_ID` in `.env`.');

        // Best-effort: grant Staff/Owner "Manage Threads" in this channel so
        // they can see every private ticket thread created here.
        const rolesToGrant = [staffRole, ownerRole].filter(Boolean);
        for (const role of rolesToGrant) {
            try {
                await interaction.channel.permissionOverwrites.edit(role, {
                    ViewChannel: true,
                    ManageThreads: true,
                    SendMessagesInThreads: true,
                    ReadMessageHistory: true
                });
            } catch (err) {
                warnings.push(`Could not grant "${role.name}" thread-management access in this channel: ${err.message}`);
            }
        }

        const categories = config.tickets?.categories || [];
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_category_select')
            .setPlaceholder('Select a category to open a ticket...')
            .addOptions(
                categories.map((c) => ({
                    label: c.label,
                    value: c.id,
                    description: c.description || undefined,
                    // Prefer the real InterENL Store server emoji if it exists in
                    // this guild; fall back to the plain unicode emoji so the
                    // panel still looks right anywhere else.
                    emoji: (c.customEmoji && resolveCustomEmojiObject(interaction.guild, c.customEmoji)) || c.emoji || undefined
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        try {
            await interaction.channel.send({
                embeds: [buildPanelEmbed(interaction.guild)],
                components: [row]
            });
        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed('Could Not Post Panel', `Failed to send the panel message: ${err.message}`)]
            });
        }

        logger.logAction(client, {
            action: 'TICKET_PANEL_SETUP',
            admin: interaction.user.tag,
            target: `#${interaction.channel.name}`
        });

        const description =
            warnings.length > 0
                ? `Panel posted, but with some warnings:\n${warnings.map((w) => `⚠️ ${w}`).join('\n')}`
                : 'Panel posted successfully. Staff and Owner roles can now see and manage tickets created here.';

        return interaction.editReply({
            embeds: [successEmbed('Ticket Panel Posted', description)]
        });
    }
};
