/**
 * /setlevel command
 * -----------------------------------------------------
 * Owner/Admin only. Directly sets a member's rank level
 * (computes the exact cumulative XP that level starts at).
 * A raw correction — no level-up announcement or reward grant.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const progressionManager = require('../../utils/progressionManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlevel')
        .setDescription("Directly set a member's rank level. (Owner/Admin only)")
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The member to update.').setRequired(true))
        .addIntegerOption((opt) => opt.setName('level').setDescription('The level to set them to.').setRequired(true).setMinValue(1)),

    async execute(interaction) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({ embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')], ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user', true);
        const level = interaction.options.getInteger('level', true);

        const user = progressionManager.setLevel(targetUser.id, targetUser.tag, level);

        logger.logAction(null, {
            action: 'SETLEVEL',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: `Set level to ${level} (${user.xp.toLocaleString()} XP)`
        });

        return interaction.reply({
            embeds: [successEmbed('Level Updated', `${targetUser} is now **Level ${user.level}** (${user.xp.toLocaleString()} XP).`)],
            ephemeral: true
        });
    }
};
