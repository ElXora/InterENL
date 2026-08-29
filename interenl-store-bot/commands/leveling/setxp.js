/**
 * /setxp, /setlevel, /addxp commands
 * -----------------------------------------------------
 * Owner/Admin only. Directly manage a member's XP/level —
 * the leveling-system equivalent of /setcoins, /addcoins, etc.
 *
 * /setxp and /setlevel are raw corrections (no level-up
 * announcement, no Battle Pass reward re-grant, no achievement
 * check) — for fixing/adjusting a user's state.
 * /addxp goes through the normal reward path (progressionManager.addXp)
 * so it DOES announce level-ups and grant Battle Pass rewards —
 * for admin-run events where the XP should feel like a real reward.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const permissions = require('../../utils/permissions');
const progressionManager = require('../../utils/progressionManager');
const achievementManager = require('../../utils/achievementManager');
const { successEmbed, errorEmbed } = require('../../embeds/embeds');
const { buildLevelUpEmbed, buildBattlePassLevelUpEmbed } = require('../../embeds/progressionEmbeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setxp')
        .setDescription('Directly set a member\'s lifetime XP. (Owner/Admin only)')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The member to update.').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('The exact XP amount to set.').setRequired(true).setMinValue(0)),

    async execute(interaction) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({ embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')], ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        const user = progressionManager.setXp(targetUser.id, targetUser.tag, amount);

        logger.logAction(null, {
            action: 'SETXP',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: `Set XP to ${amount.toLocaleString()} (now Level ${user.level})`
        });

        return interaction.reply({
            embeds: [successEmbed('XP Updated', `${targetUser} is now at **${amount.toLocaleString()} XP** (Level ${user.level}).`)],
            ephemeral: true
        });
    }
};
