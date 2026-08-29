/**
 * /warn command
 * -----------------------------------------------------
 * Issues a persistent warning to a member and DMs them.
 * Requires "Moderate Members", or bot Owner/Admin. Reply
 * is ephemeral (only visible to the moderator).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModPermission } = require('../../utils/modPermissions');
const { addWarning, getWarnings } = require('../../utils/warnManager');
const { successEmbed, warningEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a member.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The member to warn.').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the warning.').setRequired(true)),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.ModerateMembers)) return;

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason', true);

        addWarning(interaction.guild.id, targetUser.id, interaction.user.tag, reason);
        const totalWarnings = getWarnings(interaction.guild.id, targetUser.id).length;

        logger.logAction(client, {
            action: 'WARN',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: `${reason} (warning #${totalWarnings})`
        });

        // Best-effort DM to the warned user — safe to await now that we've
        // already deferred the reply.
        try {
            await targetUser.send({
                embeds: [
                    warningEmbed(
                        `You've Been Warned in ${interaction.guild.name}`,
                        `**Reason:** ${reason}\n**Total Warnings:** ${totalWarnings}`
                    )
                ]
            });
        } catch (err) {
            // Non-fatal — user may have DMs disabled.
        }

        return interaction.editReply({
            embeds: [
                successEmbed(
                    'Warning Issued',
                    `${targetUser.tag} has been warned.\n**Reason:** ${reason}\n**Total Warnings:** ${totalWarnings}`
                )
            ]
        });
    }
};
