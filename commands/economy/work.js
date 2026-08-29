/**
 * /work command
 * -----------------------------------------------------
 * 2-hour cooldown. Random job flavor text, random reward
 * between workMinReward and workMaxReward.
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work a job to earn VSC.')
        .setDMPermission(false),

    async execute(interaction, client) {
        if (!config.economy?.enabled || !config.economy?.enableWork) {
            return interaction.reply({
                embeds: [errorEmbed('Unavailable', 'The work command is currently disabled.')],
                ephemeral: true
            });
        }

        if (!(await checkNotBlacklisted(interaction))) return;

        const user = economyManager.getOrCreateUser(interaction.user.id, interaction.user.tag);
        const cooldownMs = (config.economy?.workCooldownHours ?? 2) * 60 * 60 * 1000;
        const now = Date.now();

        if (user.lastWork) {
            const elapsed = now - new Date(user.lastWork).getTime();
            if (elapsed < cooldownMs) {
                const remaining = cooldownMs - elapsed;
                const minutes = Math.ceil(remaining / 60000);
                return interaction.reply({
                    embeds: [errorEmbed('Still On Cooldown', `You need to rest! You can work again in **${minutes} minute(s)**.`)],
                    ephemeral: true
                });
            }
        }

        const jobs = config.economy?.jobs || ['Developer'];
        const job = jobs[Math.floor(Math.random() * jobs.length)];

        const min = config.economy?.workMinReward ?? 50;
        const max = config.economy?.workMaxReward ?? 175;
        const reward = Math.floor(Math.random() * (max - min + 1)) + min;

        user.lastWork = new Date(now).toISOString();
        user.coins += reward;
        user.totalCoinsEarned += reward;
        economyManager.saveUser(user);

        logger.logAction(client, {
            action: 'WORK_CLAIM',
            admin: 'SYSTEM',
            target: `${interaction.user.tag} (${interaction.user.id})`,
            details: `Job: ${job}, +${reward} coins`
        });

        await achievementManager.checkAndAwardAchievements(interaction.user.id, client);

        const emoji = getBrandEmoji(interaction.guild);
        const currency = config.economy?.currencyName || 'VSC';

        return interaction.reply({
            embeds: [
                successEmbed(
                    `${emoji} Work Complete!`,
                    `You worked as a **${job}**.\n\n**Earned:**\n${reward} ${currency}`
                )
            ]
        });
    }
};
