/**
 * /daily command
 * -----------------------------------------------------
 * 24-hour cooldown. Reward grows with consecutive-day streak
 * (Day 1: 100, Day 2: 125, Day 3: 150, ... capped, per spec),
 * with a small random variance layered on top. Missing a day
 * (more than 48h since last claim) resets the streak to 1.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const achievementManager = require('../../utils/achievementManager');
const { checkNotBlacklisted } = require('../../utils/economyGuard');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const { getBrandEmoji } = require('../../utils/emojiResolver');
const config = require('../../config');
const logger = require('../../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily VSC reward.')
        .setDMPermission(false),

    async execute(interaction, client) {
        if (!config.economy?.enabled || !config.economy?.enableDaily) {
            return interaction.reply({
                embeds: [errorEmbed('Unavailable', 'Daily rewards are currently disabled.')],
                ephemeral: true
            });
        }

        if (!(await checkNotBlacklisted(interaction))) return;

        const user = economyManager.getOrCreateUser(interaction.user.id, interaction.user.tag);
        const now = Date.now();

        if (user.lastDaily) {
            const elapsed = now - new Date(user.lastDaily).getTime();
            if (elapsed < DAY_MS) {
                const remaining = DAY_MS - elapsed;
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.floor((remaining % 3600000) / 60000);
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            'Daily Already Claimed',
                            `You can claim your next daily reward in **${hours}h ${minutes}m**.`
                        )
                    ],
                    ephemeral: true
                });
            }

            // Continue the streak if claimed within the "next day" window,
            // otherwise it resets — missing a day breaks the streak.
            if (elapsed <= 2 * DAY_MS) {
                user.dailyStreak += 1;
            } else {
                user.dailyStreak = 1;
            }
        } else {
            user.dailyStreak = 1;
        }

        const base = config.economy?.dailyBaseReward ?? 100;
        const increment = config.economy?.dailyStreakIncrement ?? 25;
        const cap = config.economy?.dailyStreakRewardCap ?? 300;
        const variance = config.economy?.dailyRewardVariance ?? 10;

        const streakReward = Math.min(base + (user.dailyStreak - 1) * increment, cap);
        const finalReward = Math.max(1, streakReward + Math.floor(Math.random() * (variance * 2 + 1)) - variance);

        user.lastDaily = new Date(now).toISOString();
        user.coins += finalReward;
        user.totalCoinsEarned += finalReward;
        economyManager.saveUser(user);

        logger.logAction(client, {
            action: 'DAILY_CLAIM',
            admin: 'SYSTEM',
            target: `${interaction.user.tag} (${interaction.user.id})`,
            details: `+${finalReward} coins, streak ${user.dailyStreak}`
        });

        await achievementManager.checkAndAwardAchievements(interaction.user.id, client);

        const emoji = getBrandEmoji(interaction.guild);
        const currency = config.economy?.currencyName || 'VSC';

        return interaction.reply({
            embeds: [
                successEmbed(
                    `${emoji} Daily Reward Claimed!`,
                    `You earned **${finalReward} ${currency}**!\n\n🔥 Current streak: **${user.dailyStreak} day(s)**`
                )
            ]
        });
    }
};
