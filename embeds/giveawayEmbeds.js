/**
 * giveawayEmbeds.js
 * -----------------------------------------------------
 * Embed builders for the giveaway system: the live panel
 * (with entry count, requirements, countdown) and the
 * ended/rerolled result announcements.
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { applyBranding } = require('./embeds');

/**
 * The live giveaway panel embed, shown alongside the Enter button.
 * @param {import('../utils/giveawayManager').Giveaway} giveaway
 * @returns {EmbedBuilder}
 */
function buildGiveawayPanelEmbed(giveaway) {
    const requirementLines = [];
    if (giveaway.minLevel) requirementLines.push(`⭐ Level ${giveaway.minLevel}+`);
    if (giveaway.requiredRoleId) requirementLines.push(`<@&${giveaway.requiredRoleId}> role`);

    const description = [
        `**Prize:** ${giveaway.prize}`,
        '',
        `👑 Hosted by: <@${giveaway.hostId}>`,
        `👥 Entries: **${giveaway.entries.length}**`,
        `🏆 Winners: **${giveaway.winnerCount}**`,
        `⏰ Ends: <t:${Math.floor(giveaway.endsAt / 1000)}:R>`
    ];

    if (requirementLines.length > 0) {
        description.push('', '**Requirements**', requirementLines.join('\n'));
    }

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🎁 GIVEAWAY')
        .setDescription(description.join('\n'));

    return applyBranding(embed);
}

/**
 * The "giveaway ended" result embed.
 * @param {import('../utils/giveawayManager').Giveaway} giveaway
 * @param {string[]} winnerIds
 * @returns {EmbedBuilder}
 */
function buildGiveawayEndedEmbed(giveaway, winnerIds) {
    const embed = new EmbedBuilder().setColor(config.colors.success).setTitle('🎊 GIVEAWAY ENDED!');

    if (winnerIds.length === 0) {
        embed.setDescription(`**Prize:** ${giveaway.prize}\n\nNo valid entries — no winner could be drawn.`);
    } else {
        const winnerMentions = winnerIds.map((id) => `<@${id}>`).join(', ');
        embed.setDescription(`🏆 Winner${winnerIds.length > 1 ? 's' : ''}: ${winnerMentions}\n\n🎁 Prize: **${giveaway.prize}**\n\nCongratulations! 🎉`);
    }

    return applyBranding(embed);
}

/**
 * The "cancelled" embed, replacing a giveaway panel that was pulled early.
 * @param {import('../utils/giveawayManager').Giveaway} giveaway
 * @returns {EmbedBuilder}
 */
function buildGiveawayCancelledEmbed(giveaway) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('🚫 Giveaway Cancelled')
        .setDescription(`**Prize:** ${giveaway.prize}\n\nThis giveaway was cancelled by staff.`);

    return applyBranding(embed);
}

module.exports = { buildGiveawayPanelEmbed, buildGiveawayEndedEmbed, buildGiveawayCancelledEmbed };
