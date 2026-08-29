/**
 * ticketEmbeds.js
 * -----------------------------------------------------
 * Embed builders specific to the ticket system: the
 * public panel embed, and the per-ticket welcome embed
 * (with a live Status field that gets edited on claim/close).
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { applyBranding } = require('./embeds');
const { replaceEmojiShortcodes } = require('../utils/emojiResolver');

/**
 * Builds the public ticket panel embed (posted alongside the
 * category select menu by /ticketpanel).
 * @param {import('discord.js').Guild|null} [guild] Used to resolve
 * ":shortcode:" emoji in the title/description to real custom emoji.
 * @returns {EmbedBuilder}
 */
function buildPanelEmbed(guild = null) {
    const title = replaceEmojiShortcodes(config.tickets?.panelTitle || '🎫 Support', guild);
    const description = replaceEmojiShortcodes(
        config.tickets?.panelDescription || 'Select a category below to open a ticket.',
        guild
    );

    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle(title).setDescription(description);

    return applyBranding(embed);
}

/**
 * Builds the status line for a ticket's welcome embed.
 * @param {import('../utils/ticketManager').TicketRecord} ticket
 * @returns {string}
 */
function buildStatusText(ticket) {
    if (ticket.status === 'closed') {
        return `🔴 Closed${ticket.closedBy ? ` by <@${ticket.closedBy}>` : ''}`;
    }
    if (ticket.claimedBy) {
        return `🟢 Open — Claimed by <@${ticket.claimedBy}>`;
    }
    return '🟢 Open — Unclaimed';
}

/**
 * Builds the welcome embed posted inside a newly created ticket
 * thread, and reused (rebuilt) whenever the ticket's Status field
 * needs to be refreshed (claim / close).
 * @param {import('../utils/ticketManager').TicketRecord} ticket
 * @returns {EmbedBuilder}
 */
function buildTicketWelcomeEmbed(ticket) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🎫 Welcome to your ticket!')
        .setDescription(
            `**Ticket #${ticket.ticketNumber}**\n\nThank you for contacting support! A staff member will be with you shortly.`
        )
        .addFields(
            { name: 'Created By', value: `<@${ticket.createdBy}>`, inline: true },
            { name: 'Category', value: ticket.categoryLabel, inline: true },
            { name: 'Status', value: buildStatusText(ticket), inline: true }
        );

    return applyBranding(embed);
}

module.exports = { buildPanelEmbed, buildTicketWelcomeEmbed, buildStatusText };
