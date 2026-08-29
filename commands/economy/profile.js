/**
 * /profile command
 * -----------------------------------------------------
 * The central profile hub: level/XP, Battle Pass, achievement
 * count, game stats, and economy balance in one place, with
 * buttons to drill into each system's full view. Open to
 * everyone — this is the main "engagement loop" screen, not
 * an admin tool.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../../config');
const economyManager = require('../../utils/economyManager');
const progressionManager = require('../../utils/progressionManager');
const achievementManager = require('../../utils/achievementManager');
const { buildProfileEmbed } = require('../../embeds/economyEmbeds');
const { buildProfileHubEmbed, buildBattlePassEmbed } = require('../../embeds/progressionEmbeds');
const { buildAchievementsListEmbed } = require('../../embeds/achievementEmbeds');
const { buildGameStatsEmbed } = require('../../embeds/gameEmbeds');

function buildButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('profile_hub').setLabel('Overview').setEmoji('👤').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('profile_achievements').setLabel('Achievements').setEmoji('🏆').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('profile_battlepass').setLabel('Battle Pass').setEmoji('🎟️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('profile_games').setLabel('Games').setEmoji('🎮').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('profile_economy').setLabel('Economy').setEmoji('💰').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your (or someone else\'s) full InterENL Store profile.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('Whose profile to view (defaults to you).').setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guild = interaction.guild;

        const progressionUser = progressionManager.getOrCreateUser(targetUser.id, targetUser.tag);
        const economyUser = config.economy?.enabled ? economyManager.getOrCreateUser(targetUser.id, targetUser.tag) : null;
        const defs = achievementManager.getAchievementDefs();
        const achievementCount = economyUser ? economyUser.achievements.length : 0;

        const message = await interaction.reply({
            embeds: [buildProfileHubEmbed(guild, targetUser, progressionUser, economyUser, achievementCount, defs.length)],
            components: [buildButtons()],
            fetchReply: true
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async (btnInteraction) => {
            if (btnInteraction.user.id !== interaction.user.id) {
                return btnInteraction.reply({ content: "This isn't your profile view — run `/profile` yourself to browse it.", ephemeral: true });
            }

            const freshProgression = progressionManager.getOrCreateUser(targetUser.id, targetUser.tag);
            const freshEconomy = config.economy?.enabled ? economyManager.getOrCreateUser(targetUser.id, targetUser.tag) : null;

            let embed;
            if (btnInteraction.customId === 'profile_achievements') {
                embed = buildAchievementsListEmbed(guild, targetUser, defs, freshEconomy ? freshEconomy.achievements : []);
            } else if (btnInteraction.customId === 'profile_battlepass') {
                embed = buildBattlePassEmbed(guild, targetUser, freshProgression);
            } else if (btnInteraction.customId === 'profile_games') {
                embed = buildGameStatsEmbed(guild, targetUser, freshProgression);
            } else if (btnInteraction.customId === 'profile_economy' && freshEconomy) {
                embed = buildProfileEmbed(guild, targetUser, freshEconomy);
            } else {
                embed = buildProfileHubEmbed(guild, targetUser, freshProgression, freshEconomy, freshEconomy ? freshEconomy.achievements.length : 0, defs.length);
            }

            await btnInteraction.update({ embeds: [embed], components: [buildButtons()] });
        });

        collector.on('end', async () => {
            try {
                await message.edit({ components: [buildButtons(true)] });
            } catch (err) {
                // Message may have been deleted — non-fatal.
            }
        });
    }
};
