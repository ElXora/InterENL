/**
 * /economy command
 * -----------------------------------------------------
 * Subcommands:
 *   /economy reset - WIPES THE ENTIRE ECONOMY (every user's
 *   data, permanently). Gated behind a Confirm/Cancel step
 *   given how destructive this is. Owner/Admin only.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const { successEmbed, errorEmbed, warningEmbed, infoEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Manage the InterENL Store Economy system. (Owner/Admin only)')
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub.setName('reset').setDescription('Permanently wipe the ENTIRE economy — every user, every balance.')
        ),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'reset') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('economy_reset_confirm').setLabel('Confirm Wipe').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
                new ButtonBuilder().setCustomId('economy_reset_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );

            const message = await interaction.reply({
                embeds: [
                    warningEmbed(
                        '⚠️ Confirm Full Economy Reset',
                        'This will **permanently delete every user\'s** VSC, streaks, and stats across the entire server. This cannot be undone.\n\nAre you absolutely sure?'
                    )
                ],
                components: [row],
                ephemeral: true,
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 30_000,
                filter: (i) => i.user.id === interaction.user.id
            });

            let resolved = false;

            collector.on('collect', async (btnInteraction) => {
                resolved = true;
                collector.stop('resolved');

                if (btnInteraction.customId === 'economy_reset_cancel') {
                    return btnInteraction.update({
                        embeds: [infoEmbed('Cancelled', 'The economy was not reset.')],
                        components: []
                    });
                }

                economyManager.resetEntireEconomy();

                logger.logAction(client, {
                    action: 'ECONOMY_RESET',
                    admin: interaction.user.tag,
                    target: 'ENTIRE ECONOMY',
                    details: 'All user economy data wiped.'
                });

                return btnInteraction.update({
                    embeds: [successEmbed('Economy Reset', 'The entire InterENL Store Economy has been wiped.')],
                    components: []
                });
            });

            collector.on('end', async () => {
                if (!resolved) {
                    await interaction
                        .editReply({ embeds: [infoEmbed('Timed Out', 'No response received — the economy was not reset.')], components: [] })
                        .catch(() => {});
                }
            });
        }
    }
};
