/**
 * /leaderboard command
 * -----------------------------------------------------
 * Shows the top 10 users by coins (default, unchanged from
 * before), XP/level, Battle Pass level, or mini-game wins —
 * one command, one place to look, instead of four separate
 * leaderboard commands.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const progressionManager = require('../../utils/progressionManager');
const { buildLeaderboardEmbed } = require('../../embeds/economyEmbeds');
const { buildProgressionLeaderboardEmbed } = require('../../embeds/progressionEmbeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the top 10 InterENL Store members by coins, XP, Battle Pass, or games won.')
        .setDMPermission(false)
        .addStringOption((opt) =>
            opt
                .setName('type')
                .setDescription('Which leaderboard to view (defaults to coins).')
                .setRequired(false)
                .addChoices(
                    { name: 'Coins', value: 'coins' },
                    { name: 'XP / Level', value: 'xp' },
                    { name: 'Battle Pass', value: 'battlepass' },
                    { name: 'Mini-Games Won', value: 'games' }
                )
        ),

    async execute(interaction) {
        const type = interaction.options.getString('type') || 'coins';

        if (type === 'coins') {
            const topUsers = economyManager.getLeaderboard(10);
            return interaction.reply({ embeds: [buildLeaderboardEmbed(interaction.guild, topUsers)] });
        }

        const progressionType = type === 'games' ? 'gamesWonTotal' : type === 'battlepass' ? 'battlePassLevel' : 'xp';
        const rows = progressionManager.getLeaderboard(progressionType, 10);
        return interaction.reply({ embeds: [buildProgressionLeaderboardEmbed(interaction.guild, type, rows)] });
    }
};
