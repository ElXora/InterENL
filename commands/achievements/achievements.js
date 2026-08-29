/**
 * /achievements command
 * -----------------------------------------------------
 * Shows the full achievement list with unlock progress.
 * Hidden achievements stay masked ("???") until earned.
 * Open to everyone.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const achievementManager = require('../../utils/achievementManager');
const { buildAchievementsListEmbed } = require('../../embeds/achievementEmbeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription('View your (or someone else\'s) achievement progress.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('Whose achievements to view (defaults to you).').setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const economyUser = economyManager.getOrCreateUser(targetUser.id, targetUser.tag);
        const defs = achievementManager.getAchievementDefs();

        return interaction.reply({
            embeds: [buildAchievementsListEmbed(interaction.guild, targetUser, defs, economyUser.achievements)]
        });
    }
};
