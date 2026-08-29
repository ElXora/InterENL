/**
 * /warnings command
 * -----------------------------------------------------
 * Subcommands:
 *   /warnings list user:@user   - view a member's warning history
 *   /warnings clear user:@user  - wipe a member's warning history
 * Requires "Moderate Members", or bot Owner/Admin. Reply is
 * ephemeral (only visible to the moderator).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModPermission } = require('../../utils/modPermissions');
const { getWarnings, clearWarnings } = require('../../utils/warnManager');
const { successEmbed, infoEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription("Manage a member's warning history.")
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription("View a member's warnings.")
                .addUserOption((opt) => opt.setName('user').setDescription('The member to check.').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('clear')
                .setDescription("Clear a member's warnings.")
                .addUserOption((opt) => opt.setName('user').setDescription('The member to clear.').setRequired(true))
        ),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.ModerateMembers)) return;

        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user', true);

        if (subcommand === 'list') {
            const warnings = getWarnings(interaction.guild.id, targetUser.id);

            if (warnings.length === 0) {
                return interaction.editReply({
                    embeds: [infoEmbed(`Warnings for ${targetUser.tag}`, 'This member has no warnings.')]
                });
            }

            const description = warnings
                .map(
                    (w, i) =>
                        `**${i + 1}.** ${w.reason}\n└ By ${w.moderator} • <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:R>`
                )
                .join('\n\n');

            return interaction.editReply({
                embeds: [infoEmbed(`⚠️ Warnings for ${targetUser.tag} (${warnings.length})`, description)]
            });
        }

        if (subcommand === 'clear') {
            const removedCount = clearWarnings(interaction.guild.id, targetUser.id);

            logger.logAction(client, {
                action: 'WARNINGS_CLEAR',
                admin: interaction.user.tag,
                target: `${targetUser.tag} (${targetUser.id})`,
                details: `Cleared ${removedCount} warning(s)`
            });

            return interaction.editReply({
                embeds: [successEmbed('Warnings Cleared', `Removed ${removedCount} warning(s) from ${targetUser.tag}.`)]
            });
        }
    }
};
