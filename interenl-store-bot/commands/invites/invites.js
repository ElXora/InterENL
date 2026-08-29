/**
 * /invites command
 * -----------------------------------------------------
 * Shows a member's tracked invite stats (regular/bonus/left/
 * fake/rejoins + the computed effective total). A `leaderboard`
 * subcommand shows the top inviters server-wide.
 *
 * Discord requires every option to live under a subcommand once
 * any subcommand exists on a command, so this is `/invites view
 * [user]` + `/invites leaderboard` rather than a bare `/invites`.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const inviteManager = require('../../utils/inviteManager');
const { buildInvitesEmbed, buildInviteLeaderboardEmbed } = require('../../embeds/inviteEmbeds');
const { errorEmbed } = require('../../embeds/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invites')
        .setDescription('Check invite stats.')
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('view')
                .setDescription("View your (or someone else's) invite stats.")
                .addUserOption((opt) => opt.setName('user').setDescription('Whose invites to view (defaults to you).').setRequired(false))
        )
        .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the top inviters in the server.')),

    async execute(interaction) {
        if (config.invites?.enabled === false) {
            return interaction.reply({ embeds: [errorEmbed('Invite Tracking Disabled', 'Invite tracking is currently disabled.')], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'leaderboard') {
            const rows = inviteManager.getLeaderboard(10);
            return interaction.reply({ embeds: [buildInviteLeaderboardEmbed(rows)] });
        }

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const stats = inviteManager.getInviterStats(targetUser.id);
        const effective = inviteManager.getEffectiveInvites(stats);

        return interaction.reply({ embeds: [buildInvitesEmbed(targetUser, stats, effective)] });
    }
};
