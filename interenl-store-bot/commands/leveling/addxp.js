/**
 * /addxp command
 * -----------------------------------------------------
 * Owner/Admin only. Grants XP through the normal reward path —
 * unlike /setxp, this DOES trigger level-up announcements and
 * Battle Pass reward grants, since it's meant to feel like a
 * real reward (e.g. for admin-run events).
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
        .setName('addxp')
        .setDescription('Grant a member bonus XP as a reward. (Owner/Admin only)')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('The member to reward.').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('How much XP to grant.').setRequired(true).setMinValue(1)),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({ embeds: [errorEmbed('Access Denied', 'You do not have permission to use this command.')], ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        const result = progressionManager.addXp(targetUser.id, targetUser.tag, amount, { bypassCooldown: true });

        logger.logAction(client, {
            action: 'ADDXP',
            admin: interaction.user.tag,
            target: `${targetUser.tag} (${targetUser.id})`,
            details: `Granted ${amount.toLocaleString()} XP`
        });

        await interaction.reply({
            embeds: [successEmbed('XP Granted', `${targetUser} received **+${amount.toLocaleString()} XP** (now Level ${result.newLevel}).`)],
            ephemeral: true
        });

        // Announce level-up(s)/Battle Pass reward(s) publicly in this
        // channel, same as a normal message-earned level-up would.
        if (result.leveledUp) {
            try {
                await interaction.channel.send({
                    content: `${targetUser}`,
                    embeds: [buildLevelUpEmbed(interaction.guild, targetUser, result.newLevel, result.levelUpCoins)]
                });
            } catch (err) {
                // Non-fatal.
            }
        }

        for (const gain of result.battlePassLevelsGained) {
            try {
                await interaction.channel.send({
                    content: gain.reward.legendary ? `${targetUser}` : undefined,
                    embeds: [buildBattlePassLevelUpEmbed(interaction.guild, targetUser, gain.level, gain.reward)]
                });
            } catch (err) {
                // Non-fatal.
            }
        }

        try {
            await achievementManager.checkAndAwardAchievements(targetUser.id, client);
        } catch (err) {
            // Non-fatal.
        }
    }
};
