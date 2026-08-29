/**
 * progressionEmbeds.js
 * -----------------------------------------------------
 * Embed builders for the XP/Leveling, Battle Pass, and
 * Challenges systems, plus the central /profile hub and the
 * multi-type /leaderboard.
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { applyBranding, buildProgressBar } = require('./embeds');
const { getEmoji, getBrandEmoji } = require('../utils/emojiResolver');
const { computeLevel, xpForLevel } = require('../utils/progressionManager');
const { computeBattlePassLevel, xpForBattlePassLevel, getBattlePassReward } = require('../utils/battlePassRewards');

/**
 * The polished /rank card: level, XP progress, Battle Pass level,
 * achievement count, and economy balance if available.
 * @param {import('discord.js').Guild|null} guild
 * @param {import('discord.js').User} targetUser
 * @param {import('../utils/progressionManager').ProgressionUser} progressionUser
 * @param {import('../utils/economyManager').EconomyUser|null} economyUser
 * @param {number} achievementCount
 * @param {number} totalAchievements
 * @returns {EmbedBuilder}
 */
function buildRankEmbed(guild, targetUser, progressionUser, economyUser, achievementCount, totalAchievements) {
    const { level, currentLevelXp, xpForNext } = computeLevel(progressionUser.xp);
    const bp = computeBattlePassLevel(progressionUser.xp);
    const maxBpLevel = config.battlePass?.maxLevel || 50;

    const fields = [
        { name: `${getEmoji(guild, 'fire', '⭐')} Level`, value: `**${level}**`, inline: true },
        { name: '📊 XP', value: `${currentLevelXp.toLocaleString()} / ${xpForNext.toLocaleString()}`, inline: true },
        { name: '🎟️ Battle Pass', value: `Level ${bp.level} / ${maxBpLevel}`, inline: true },
        { name: '🏆 Achievements', value: `${achievementCount} / ${totalAchievements}`, inline: true }
    ];

    if (economyUser) {
        fields.push({
            name: `${getBrandEmoji(guild)} Balance`,
            value: `${economyUser.coins.toLocaleString()} ${config.economy?.currencyName || 'VSC'}`,
            inline: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`⭐ ${targetUser.username}'s Rank`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setDescription(buildProgressBar(currentLevelXp, xpForNext, 20))
        .addFields(fields);

    return applyBranding(embed);
}

/**
 * The "🎉 LEVEL UP!" announcement embed.
 * @param {import('discord.js').Guild|null} guild
 * @param {import('discord.js').GuildMember|import('discord.js').User} member
 * @param {number} newLevel
 * @param {number} coinsReward
 * @returns {EmbedBuilder}
 */
function buildLevelUpEmbed(guild, member, newLevel, coinsReward) {
    const currency = config.economy?.currencyName || 'VSC';
    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🎉 LEVEL UP!')
        .setThumbnail(member.displayAvatarURL ? member.displayAvatarURL({ size: 256 }) : member.user?.displayAvatarURL({ size: 256 }))
        .setDescription(
            `Congratulations ${member}!\n\nYou reached **Level ${newLevel}!**` +
                (coinsReward > 0 ? `\n\nReward: **+${coinsReward.toLocaleString()} ${currency}**` : '')
        );

    return applyBranding(embed);
}

/**
 * The Battle Pass level-up announcement — level 50 gets a
 * visibly bigger, "legendary" treatment per the spec.
 * @param {import('discord.js').Guild|null} guild
 * @param {import('discord.js').GuildMember|import('discord.js').User} member
 * @param {number} level
 * @param {{coins: number, title: string|null, label: string, legendary: boolean}} reward
 * @returns {EmbedBuilder}
 */
function buildBattlePassLevelUpEmbed(guild, member, level, reward) {
    if (reward.legendary) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('👑 BATTLE PASS CHAMPION')
            .setThumbnail(member.displayAvatarURL ? member.displayAvatarURL({ size: 256 }) : member.user?.displayAvatarURL({ size: 256 }))
            .setDescription(
                `${member} just reached the **maximum Battle Pass level (${level})** — the legendary final reward!\n\n**${reward.label}**`
            );
        if (config.thumbnail) embed.setImage(config.thumbnail);
        return applyBranding(embed);
    }

    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🎟️ Battle Pass Level Up!')
        .setDescription(`${member} reached **Battle Pass Level ${level}**!\n\n**Reward:** ${reward.label}`);

    return applyBranding(embed);
}

const LEADERBOARD_TYPES = {
    coins: { label: 'Richest', unit: 'coins', emojiKey: 'bank', fallbackEmoji: '💰' },
    xp: { label: 'Top XP', unit: 'xp', emojiKey: 'fire', fallbackEmoji: '⭐' },
    battlepass: { label: 'Battle Pass', unit: 'battlepass', emojiKey: 'crown', fallbackEmoji: '🎟️' },
    games: { label: 'Top Gamers', unit: 'games', emojiKey: 'load', fallbackEmoji: '🎮' }
};

/**
 * Shared leaderboard renderer for /leaderboard's `type` option —
 * handles coins (existing economy leaderboard), xp, battlepass
 * level, and mini-game wins, all in one consistent layout.
 * @param {import('discord.js').Guild|null} guild
 * @param {'coins'|'xp'|'battlepass'|'games'} type
 * @param {Array<object>} rows Pre-sorted user records (economy or progression, matching `type`).
 * @returns {EmbedBuilder}
 */
function buildProgressionLeaderboardEmbed(guild, type, rows) {
    const meta = LEADERBOARD_TYPES[type] || LEADERBOARD_TYPES.coins;
    const medals = ['🥇', '🥈', '🥉'];

    const lines = rows.map((row, i) => {
        const rank = medals[i] || `**#${i + 1}**`;
        let valueText;

        if (type === 'coins') valueText = `${row.coins.toLocaleString()} ${config.economy?.currencyName || 'VSC'}`;
        else if (type === 'xp') valueText = `Level ${computeLevel(row.xp).level} — ${row.xp.toLocaleString()} XP`;
        else if (type === 'battlepass') valueText = `Battle Pass Level ${computeBattlePassLevel(row.xp).level}`;
        else valueText = `${row.gamesWonTotal.toLocaleString()} wins`;

        return `${rank} <@${row.discordId}> — ${valueText}`;
    });

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`${meta.fallbackEmoji} InterENL Store — ${meta.label} Leaderboard`)
        .setDescription(lines.length > 0 ? lines.join('\n') : 'No data yet — be the first!');

    return applyBranding(embed);
}

/**
 * The central /profile hub embed — the "front page" that the
 * Achievements/Battle Pass/Games/Economy buttons expand on.
 * @param {import('discord.js').Guild|null} guild
 * @param {import('discord.js').User} targetUser
 * @param {import('../utils/progressionManager').ProgressionUser} progressionUser
 * @param {import('../utils/economyManager').EconomyUser|null} economyUser
 * @param {number} achievementCount
 * @param {number} totalAchievements
 * @returns {EmbedBuilder}
 */
function buildProfileHubEmbed(guild, targetUser, progressionUser, economyUser, achievementCount, totalAchievements) {
    const { level, currentLevelXp, xpForNext } = computeLevel(progressionUser.xp);
    const bp = computeBattlePassLevel(progressionUser.xp);
    const maxBpLevel = config.battlePass?.maxLevel || 50;
    const currency = config.economy?.currencyName || 'VSC';

    const winRate = progressionUser.gamesPlayedTotal > 0 ? ((progressionUser.gamesWonTotal / progressionUser.gamesPlayedTotal) * 100).toFixed(1) : '0.0';

    const description = [
        `⭐ **Level ${level}**`,
        buildProgressBar(currentLevelXp, xpForNext, 18),
        `**XP:** ${currentLevelXp.toLocaleString()} / ${xpForNext.toLocaleString()}`,
        '',
        `🎟️ **Battle Pass**`,
        `**Level ${bp.level} / ${maxBpLevel}**`,
        buildProgressBar(bp.currentLevelXp, bp.xpForNext || 1, 18),
        '',
        `🏆 **Achievements**`,
        `**${achievementCount} / ${totalAchievements}**`,
        '',
        `🎮 **Games**`,
        `Played: ${progressionUser.gamesPlayedTotal.toLocaleString()}`,
        `Wins: ${progressionUser.gamesWonTotal.toLocaleString()}`,
        `Win Rate: ${winRate}%`
    ];

    if (economyUser) {
        description.push('', `${getBrandEmoji(guild)} **Balance**`, `${economyUser.coins.toLocaleString()} ${currency}`);
    }

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`👤 ${targetUser.username}'s Profile`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setDescription(description.join('\n'));

    return applyBranding(embed);
}

/**
 * The /battlepass view embed — current progress plus a preview
 * of the next few reward tiers on the track.
 * @param {import('discord.js').Guild|null} guild
 * @param {import('discord.js').User} targetUser
 * @param {import('../utils/progressionManager').ProgressionUser} progressionUser
 * @returns {EmbedBuilder}
 */
function buildBattlePassEmbed(guild, targetUser, progressionUser) {
    const bp = computeBattlePassLevel(progressionUser.xp);
    const maxLevel = config.battlePass?.maxLevel || 50;

    const upcoming = [];
    for (let lvl = bp.level; lvl <= Math.min(maxLevel, bp.level + 4); lvl++) {
        const reward = getBattlePassReward(lvl);
        const claimed = progressionUser.claimedBattlePassLevels.includes(lvl);
        const marker = claimed ? '✅' : lvl === bp.level ? '▶️' : '🔒';
        upcoming.push(`${marker} **Level ${lvl}** — ${reward.label}${reward.legendary ? ' 👑' : ''}`);
    }

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`${getEmoji(guild, 'crown', '🎟️')} ${targetUser.username}'s Battle Pass`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setDescription(
            `**Level ${bp.level} / ${maxLevel}**\n${buildProgressBar(bp.currentLevelXp, bp.xpForNext || 1, 20)}\n` +
                (bp.level >= maxLevel ? '\n👑 **Maximum level reached — Battle Pass Champion!**' : `\n${(bp.xpForNext - bp.currentLevelXp).toLocaleString()} XP to next level`)
        )
        .addFields({ name: 'Reward Track', value: upcoming.join('\n') || 'Maxed out!' });

    return applyBranding(embed);
}

/**
 * The /challenges embed — daily + weekly progress.
 * @param {import('discord.js').Guild|null} guild
 * @param {import('discord.js').User} targetUser
 * @param {import('../utils/progressionManager').ProgressionUser} progressionUser
 * @returns {EmbedBuilder}
 */
function buildChallengesEmbed(guild, targetUser, progressionUser) {
    const renderList = (list) =>
        list
            .map((c) => {
                const status = c.completed ? '✅' : `${c.progress} / ${c.target}`;
                return `${c.emoji} **${c.label}**\n${status}${!c.completed ? `\n${buildProgressBar(c.progress, c.target, 14)}` : ''}\nReward: +${c.xpReward} XP, +${c.coinReward.toLocaleString()} ${config.economy?.currencyName || 'VSC'}`;
            })
            .join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`${getEmoji(guild, 'cooldown', '🎯')} ${targetUser.username}'s Challenges`)
        .addFields(
            { name: '📅 Daily', value: renderList(progressionUser.challengeState.daily) || 'None active.' },
            { name: '🗓️ Weekly', value: renderList(progressionUser.challengeState.weekly) || 'None active.' }
        );

    return applyBranding(embed);
}

module.exports = {
    buildRankEmbed,
    buildLevelUpEmbed,
    buildBattlePassLevelUpEmbed,
    buildProgressionLeaderboardEmbed,
    buildProfileHubEmbed,
    buildBattlePassEmbed,
    buildChallengesEmbed
};
