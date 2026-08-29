/**
 * /purge command
 * -----------------------------------------------------
 * Bulk-deletes recent messages in the current channel,
 * optionally filtered to a specific user. Requires
 * "Manage Messages", or bot Owner/Admin.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireModPermission } = require('../../utils/modPermissions');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Bulk-delete recent messages in this channel.')
        .setDMPermission(false)
        .addIntegerOption((opt) =>
            opt
                .setName('amount')
                .setDescription('Number of messages to delete (1-100).')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        )
        .addUserOption((opt) =>
            opt.setName('user').setDescription('Only delete messages from this user.').setRequired(false)
        ),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        if (!requireModPermission(interaction, PermissionFlagsBits.ManageMessages)) return;

        const amount = interaction.options.getInteger('amount', true);
        const filterUser = interaction.options.getUser('user');

        await interaction.deferReply({ ephemeral: true });

        try {
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const targetMessages = filterUser
                ? messages.filter((m) => m.author.id === filterUser.id).first(amount)
                : messages.first(amount);

            const deleted = await interaction.channel.bulkDelete(targetMessages, true);

            logger.logAction(client, {
                action: 'PURGE',
                admin: interaction.user.tag,
                target: filterUser ? `${filterUser.tag} (${filterUser.id})` : `#${interaction.channel.name}`,
                details: `Deleted ${deleted.size} message(s)`
            });

            return interaction.editReply({
                embeds: [successEmbed('Messages Purged', `Deleted **${deleted.size}** message(s).`)]
            });
        } catch (err) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        'Purge Failed',
                        'Could not delete messages (they may be older than 14 days, which Discord does not allow bulk-deleting).'
                    )
                ]
            });
        }
    }
};
