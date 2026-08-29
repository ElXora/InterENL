/**
 * inviteEmbeds.js
 * -----------------------------------------------------
 * Embed builder for /invites.
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { applyBranding } = require('./embeds');

/**
 * @param {import('discord.js').User} targetUser
 * @param {import('../utils/inviteManager').InviterStats} stats
 * @param {number} effective
 * @returns {EmbedBuilder}
 */
function buildInvitesEmbed(targetUser, stats, effective) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`💌 ${targetUser.username}'s Invites`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: '✅ Effective Invites', value: `**${effective}**`, inline: false },
            { name: 'Regular', value: `${stats.regular}`, inline: true },
            { name: 'Bonus', value: `${stats.bonus}`, inline: true },
            { name: 'Left', value: `${stats.left}`, inline: true },
            { name: 'Fake', value: `${stats.fake}`, inline: true },
            { name: 'Rejoins', value: `${stats.rejoins}`, inline: true }
        )
        .setDescription('*Fake invites are joins from accounts younger than the configured threshold — they don\'t count toward your effective total.*');

    return applyBranding(embed);
}

/**
 * @param {Array<import('../utils/inviteManager').InviterStats>} rows
 * @returns {EmbedBuilder}
 */
function buildInviteLeaderboardEmbed(rows) {
    const { getEffectiveInvites } = require('../utils/inviteManager');
    const medals = ['🥇', '🥈', '🥉'];

    const lines = rows.map((stats, i) => {
        const rank = medals[i] || `**#${i + 1}**`;
        return `${rank} <@${stats.discordId}> — **${getEffectiveInvites(stats)}** invites`;
    });

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('💌 InterENL Store — Invite Leaderboard')
        .setDescription(lines.length > 0 ? lines.join('\n') : 'No tracked invites yet.');

    return applyBranding(embed);
}

module.exports = { buildInvitesEmbed, buildInviteLeaderboardEmbed };
