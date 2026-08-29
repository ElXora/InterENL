/**
 * economyEmbeds.js
 * -----------------------------------------------------
 * Embed builders for the InterENL Store Economy system.
 * Theme: Black / Red / White (distinct from the license
 * system's black/orange/white, per the economy spec).
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getBrandEmoji, getEmoji } = require('../utils/emojiResolver');

/**
 * Applies the Economy-specific footer + timestamp (separate
 * footer text from the license bot's embeds, per spec).
 * @param {EmbedBuilder} embed
 * @returns {EmbedBuilder}
 */
function applyEconomyBranding(embed) {
    return embed.setFooter({ text: config.economy?.footer || 'InterENL Store Economy' }).setTimestamp();
}

/**
 * Builds the Loot Drop announcement embed (posted when a drop appears).
 * @param {import('discord.js').Guild} guild
 * @param {number} expireSeconds
 * @returns {EmbedBuilder}
 */
function buildLootDropEmbed(guild, expireSeconds) {
    const emoji = getBrandEmoji(guild);
    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.primary || 0x3B82F6)
        .setTitle(`${emoji} Loot Drop!`)
        .setDescription(
            `🎁 A loot drop has appeared!\n\nBe the **FIRST** person to claim it before someone else does.\n\n⏳ Expires in ${Math.round(
                expireSeconds / 60
            )} minute(s).`
        );

    return applyEconomyBranding(embed);
}

/**
 * Builds the "claimed" embed shown after someone successfully
 * claims a loot drop.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} winner
 * @param {{label: string}} reward
 * @returns {EmbedBuilder}
 */
function buildLootClaimedEmbed(guild, winner, reward) {
    const emoji = getBrandEmoji(guild);
    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.primary || 0x3B82F6)
        .setTitle(`${emoji} Loot Claimed!`)
        .setDescription(`Congratulations ${winner}!\n\nYou were the fastest!\n\n**Reward:**\n${reward.label}`);

    return applyEconomyBranding(embed);
}

/**
 * Builds the expired embed shown when nobody claims a loot drop in time.
 * @param {import('discord.js').Guild} guild
 * @returns {EmbedBuilder}
 */
function buildLootExpiredEmbed(guild) {
    const emoji = getBrandEmoji(guild);
    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.black || 0x231B2A)
        .setTitle(`${emoji} Loot Drop Expired`)
        .setDescription('This Loot Drop expired.\n\nNobody claimed it.');

    return applyEconomyBranding(embed);
}

/**
 * Builds the winner announcement embed sent (as a ping, not just
 * an edit) after a loot drop is claimed.
 * @param {import('discord.js').Guild} guild
 * @param {{label: string}} reward
 * @returns {EmbedBuilder}
 */
function buildWinnerAnnouncementEmbed(guild, winner, reward) {
    const emoji = getBrandEmoji(guild);
    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.primary || 0x3B82F6)
        .setTitle(`${emoji} 🎉 Congratulations ${winner.username}`)
        .setDescription(`You claimed the Loot Drop first!\n\n**Reward:**\n${reward.label}`);

    return applyEconomyBranding(embed);
}

/**
 * Builds the /balance embed.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} targetUser
 * @param {import('../utils/economyManager').EconomyUser} record
 * @param {number} rank
 * @returns {EmbedBuilder}
 */
function buildBalanceEmbed(guild, targetUser, record, rank) {
    const emoji = getBrandEmoji(guild);
    const currency = config.economy?.currencyName || 'VSC';

    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.primary || 0x3B82F6)
        .setTitle(`${emoji} ${targetUser.username}'s Balance`)
        .addFields(
            { name: `${getEmoji(guild, 'bank', '🏦')} Coins`, value: `${emoji} ${record.coins.toLocaleString()} ${currency}`, inline: true },
            { name: 'Rank', value: `#${rank}`, inline: true },
            { name: 'Total Earned', value: `${record.totalCoinsEarned.toLocaleString()} ${currency}`, inline: true },
            { name: 'Loot Drops Claimed', value: `${record.lootDropsClaimed}`, inline: true },
            { name: 'License Wins', value: `${record.licenseWins}`, inline: true }
        )
        .setThumbnail(targetUser.displayAvatarURL());

    return applyEconomyBranding(embed);
}

/**
 * Builds the /profile embed.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} targetUser
 * @param {import('../utils/economyManager').EconomyUser} record
 * @returns {EmbedBuilder}
 */
function buildProfileEmbed(guild, targetUser, record) {
    const emoji = getBrandEmoji(guild);
    const currency = config.economy?.currencyName || 'VSC';

    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.primary || 0x3B82F6)
        .setTitle(`${emoji} ${targetUser.username}'s Profile`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: `${getEmoji(guild, 'bankcard', '💳')} Coins`, value: `${record.coins.toLocaleString()} ${currency}`, inline: true },
            { name: 'Daily Streak', value: `${getEmoji(guild, 'fire', '🔥')} ${record.dailyStreak} day(s)`, inline: true },
            { name: 'Loot Drops Claimed', value: `${record.lootDropsClaimed}`, inline: true },
            { name: 'License Wins', value: `${record.licenseWins}`, inline: true },
            { name: 'Total Earned', value: `${record.totalCoinsEarned.toLocaleString()} ${currency}`, inline: true },
            { name: 'Achievements', value: `${record.achievements.length}`, inline: true }
        );

    return applyEconomyBranding(embed);
}

/**
 * Builds the /leaderboard embed.
 * @param {import('discord.js').Guild} guild
 * @param {Array<import('../utils/economyManager').EconomyUser>} topUsers
 * @returns {EmbedBuilder}
 */
function buildLeaderboardEmbed(guild, topUsers) {
    const emoji = getBrandEmoji(guild);
    const currency = config.economy?.currencyName || 'VSC';
    const medals = ['🥇', '🥈', '🥉'];

    const description =
        topUsers.length > 0
            ? topUsers
                  .map((u, i) => `${medals[i] || `**${i + 1}.**`} <@${u.discordId}> — ${u.coins.toLocaleString()} ${currency}`)
                  .join('\n')
            : '_No one has earned any coins yet._';

    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.primary || 0x3B82F6)
        .setTitle(`${emoji} ${getEmoji(guild, 'crown', '👑')} InterENL Store Economy — Top 10`)
        .setDescription(description);

    return applyEconomyBranding(embed);
}

/**
 * Builds the transfer confirmation embed (used by both /pay's
 * quick path and /transfer's confirm/cancel flow).
 * @param {import('discord.js').Guild} guild
 * @param {number} amount
 * @param {import('discord.js').User} receiver
 * @returns {EmbedBuilder}
 */
function buildTransferConfirmEmbed(guild, amount, receiver) {
    const emoji = getBrandEmoji(guild);
    const currency = config.economy?.currencyName || 'VSC';

    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.primary || 0x3B82F6)
        .setTitle(`${getEmoji(guild, 'gpay', '💸')} Confirm Transfer`)
        .setDescription(`You are about to send **${amount.toLocaleString()} ${currency}** to **${receiver}**.\n\nAre you sure?`);

    return applyEconomyBranding(embed);
}

/**
 * Builds the transfer success embed.
 * @param {import('discord.js').Guild} guild
 * @param {number} amount
 * @param {import('discord.js').User} receiver
 * @returns {EmbedBuilder}
 */
function buildTransferSuccessEmbed(guild, amount, receiver) {
    const emoji = getBrandEmoji(guild);
    const currency = config.economy?.currencyName || 'VSC';

    const embed = new EmbedBuilder()
        .setColor(config.economy?.colors?.primary || 0x3B82F6)
        .setTitle(`${emoji} Transfer Successful`)
        .setDescription(`✅ Successfully transferred **${amount.toLocaleString()} ${currency}** to ${receiver}.`);

    return applyEconomyBranding(embed);
}

/**
 * Builds the blacklisted-user denial embed shown when a
 * blacklisted user tries to use any economy command.
 * @param {import('discord.js').Guild} guild
 * @param {string} reason
 * @returns {EmbedBuilder}
 */
function buildBlacklistedEmbed(guild, reason) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle(`${getEmoji(guild, 'dnd', '⛔')} You are permanently blacklisted from the InterENL Store Economy.`)
        .setDescription(`**Reason:**\n${reason}`);

    return applyEconomyBranding(embed);
}

module.exports = {
    applyEconomyBranding,
    buildLootDropEmbed,
    buildLootClaimedEmbed,
    buildLootExpiredEmbed,
    buildWinnerAnnouncementEmbed,
    buildBalanceEmbed,
    buildProfileEmbed,
    buildLeaderboardEmbed,
    buildTransferConfirmEmbed,
    buildTransferSuccessEmbed,
    buildBlacklistedEmbed
};
