/**
 * /rank command
 * -----------------------------------------------------
 * Polished rank card: level, XP progress, Battle Pass level,
 * achievement count, and economy balance if available.
 * Open to everyone — leveling is a community engagement system,
 * not an admin tool.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const progressionManager = require('../../utils/progressionManager');
const economyManager = require('../../utils/economyManager');
const achievementManager = require('../../utils/achievementManager');
const { buildRankEmbed } = require('../../embeds/progressionEmbeds');
const { errorEmbed } = require('../../embeds/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('View your (or someone else\'s) level, XP, and Battle Pass rank.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('Whose rank to view (defaults to you).').setRequired(false)),

    async execute(interaction) {
        if (!config.leveling?.enabled) {
            return interaction.reply({
                embeds: [errorEmbed('Leveling Disabled', 'The XP/leveling system is currently disabled.')],
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const progressionUser = progressionManager.getOrCreateUser(targetUser.id, targetUser.tag);
        const economyUser = config.economy?.enabled ? economyManager.getOrCreateUser(targetUser.id, targetUser.tag) : null;
        const defs = achievementManager.getAchievementDefs();
        const economyRecord = economyManager.getUser(targetUser.id);
        const achievementCount = economyRecord ? economyRecord.achievements.length : 0;

        return interaction.reply({
            embeds: [buildRankEmbed(interaction.guild, targetUser, progressionUser, economyUser, achievementCount, defs.length)]
        });
    }
};
