/**
 * /battlepass command
 * -----------------------------------------------------
 * Shows Battle Pass progress + a preview of the next few
 * reward tiers. Levels are auto-granted the instant they're
 * reached (see progressionManager.addXp) — this is a viewer,
 * not a claim command, so there's nothing to double-claim.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const progressionManager = require('../../utils/progressionManager');
const { buildBattlePassEmbed } = require('../../embeds/progressionEmbeds');
const { errorEmbed } = require('../../embeds/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('battlepass')
        .setDescription('View your (or someone else\'s) Battle Pass progress and reward track.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('Whose Battle Pass to view (defaults to you).').setRequired(false)),

    async execute(interaction) {
        if (!config.battlePass?.enabled) {
            return interaction.reply({
                embeds: [errorEmbed('Battle Pass Disabled', 'The Battle Pass system is currently disabled.')],
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const progressionUser = progressionManager.getOrCreateUser(targetUser.id, targetUser.tag);

        return interaction.reply({ embeds: [buildBattlePassEmbed(interaction.guild, targetUser, progressionUser)] });
    }
};
