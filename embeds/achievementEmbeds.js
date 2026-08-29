/**
 * achievementEmbeds.js
 * -----------------------------------------------------
 * Embed builders for the achievement system: the "unlocked"
 * announcement, and the /achievements progress list (which
 * masks hidden achievements' name/description until earned).
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { applyBranding, buildProgressBar } = require('./embeds');
const { getEmoji } = require('../utils/emojiResolver');

/**
 * The polished "Achievement Unlocked!" embed (posted publicly
 * after a level-up-style trigger, and DMed by achievementManager).
 * @param {import('discord.js').User} user
 * @param {import('../utils/achievementManager').AchievementDef} achievement
 * @returns {EmbedBuilder}
 */
function buildAchievementUnlockedEmbed(user, achievement) {
    const rewardLines = [];
    if (achievement.rewardCoins > 0) rewardLines.push(`+${achievement.rewardCoins.toLocaleString()} ${config.economy?.currencyName || 'VSC'}`);
    if (achievement.rewardXp > 0) rewardLines.push(`+${achievement.rewardXp.toLocaleString()} XP`);

    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🏆 ACHIEVEMENT UNLOCKED!')
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setDescription(
            `👤 ${user}\n\n${achievement.emoji} **${achievement.name}**\n${achievement.description}` +
                (rewardLines.length > 0 ? `\n\n**Reward:** ${rewardLines.join(' + ')}` : '')
        );

    return applyBranding(embed);
}

/**
 * The /achievements progress-list embed. Hidden, not-yet-unlocked
 * achievements show only "???" — their name/description/reward
 * stay masked until the user earns them.
 * @param {import('discord.js').Guild|null} guild
 * @param {import('discord.js').User} targetUser
 * @param {Array<import('../utils/achievementManager').AchievementDef>} defs
 * @param {string[]} unlockedIds
 * @returns {EmbedBuilder}
 */
function buildAchievementsListEmbed(guild, targetUser, defs, unlockedIds) {
    const unlockedCount = defs.filter((d) => unlockedIds.includes(d.id)).length;

    const lines = defs.map((def) => {
        const unlocked = unlockedIds.includes(def.id);

        if (unlocked) {
            return `${def.emoji} **${def.name}** ${getEmoji(guild, 'verify', '✅')}\n${def.description}`;
        }

        if (def.hidden) {
            return `❔ **???** (Secret Achievement)\nKeep playing to discover this one.`;
        }

        return `🔒 **${def.name}**\n${def.description}`;
    });

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`🏆 ${targetUser.username}'s Achievements`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setDescription(`**${unlockedCount} / ${defs.length} achievements unlocked**\n${buildProgressBar(unlockedCount, defs.length)}\n\n${lines.join('\n\n')}`);

    return applyBranding(embed);
}

module.exports = { buildAchievementUnlockedEmbed, buildAchievementsListEmbed };
