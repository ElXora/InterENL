/**
 * /challenges command
 * -----------------------------------------------------
 * Shows active daily + weekly challenge progress. Challenges
 * auto-complete and auto-reward the instant their target is
 * hit (see challengeManager.recordProgress) — this is a
 * progress viewer, not a claim command.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const progressionManager = require('../../utils/progressionManager');
const { buildChallengesEmbed } = require('../../embeds/progressionEmbeds');
const { errorEmbed } = require('../../embeds/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('challenges')
        .setDescription('View your active daily and weekly challenges.')
        .setDMPermission(false),

    async execute(interaction) {
        if (!config.challenges?.enabled) {
            return interaction.reply({
                embeds: [errorEmbed('Challenges Disabled', 'The Daily/Weekly Challenges system is currently disabled.')],
                ephemeral: true
            });
        }

        const progressionUser = progressionManager.getOrCreateUser(interaction.user.id, interaction.user.tag);
        return interaction.reply({ embeds: [buildChallengesEmbed(interaction.guild, interaction.user, progressionUser)] });
    }
};
