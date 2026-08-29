/**
 * /resetcoins command
 * -----------------------------------------------------
 * Owner/Admin only. Fully resets a single user's economy
 * profile: coins, daily streak, cooldowns, loot drops
 * claimed, total earned, and license wins. Blacklist status
 * and achievements are intentionally left untouched.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const economyManager = require('../../utils/economyManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetcoins')
        .setDescription("Fully reset a user's economy profile. (Owner/Admin only)")
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The user to reset.').setRequired(true)),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        economyManager.resetUser(targetUser.id, targetUser.tag);

        logger.logAction(client, {
            action: 'RESETCOINS',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`
        });

        return interaction.editReply({
            embeds: [successEmbed('Profile Reset', `${targetUser.tag}'s economy profile has been fully reset.`)]
        });
    }
};
