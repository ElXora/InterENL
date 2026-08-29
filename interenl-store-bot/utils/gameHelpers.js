/**
 * gameHelpers.js
 * -----------------------------------------------------
 * Shared logic every mini-game command needs: blacklist +
 * cooldown + bet validation up front, and stat/achievement
 * bookkeeping after the round resolves. Keeps each individual
 * game file focused on just its own rules.
 * -----------------------------------------------------
 */

const config = require('../config');
const economyManager = require('../utils/economyManager');
const progressionManager = require('../utils/progressionManager');
const achievementManager = require('../utils/achievementManager');
const { checkAndStartCooldown } = require('../utils/gameCooldown');
const { errorEmbed } = require('../embeds/embeds');

/**
 * Runs the standard pre-flight checks for a betting mini-game:
 * feature enabled, not blacklisted, off cooldown, bet within
 * configured min/max, and the user can actually afford it.
 * Replies with an error embed itself if any check fails.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} gameId
 * @param {number} bet
 * @param {{minBet: number, maxBet: number}} limits
 * @returns {Promise<boolean>} true if the game may proceed.
 */
async function preflightBettingGame(interaction, gameId, bet, limits) {
    if (!config.games?.enabled) {
        await interaction.reply({ embeds: [errorEmbed('Games Disabled', 'Mini-games are currently disabled.')], ephemeral: true });
        return false;
    }

    if (economyManager.isBlacklisted(interaction.user.id)) {
        const user = economyManager.getUser(interaction.user.id);
        await interaction.reply({
            embeds: [errorEmbed('Access Denied', user?.blacklistReason || 'You are restricted from the InterENL Store Economy.')],
            ephemeral: true
        });
        return false;
    }

    const cooldown = checkAndStartCooldown(interaction.user.id, gameId);
    if (!cooldown.allowed) {
        await interaction.reply({
            embeds: [errorEmbed('Slow Down!', `You can play again in **${cooldown.remainingSeconds}s**.`)],
            ephemeral: true
        });
        return false;
    }

    if (bet < limits.minBet || bet > limits.maxBet) {
        await interaction.reply({
            embeds: [errorEmbed('Invalid Bet', `Bet must be between **${limits.minBet.toLocaleString()}** and **${limits.maxBet.toLocaleString()}** ${config.economy?.currencyName || 'VSC'}.`)],
            ephemeral: true
        });
        return false;
    }

    const user = economyManager.getOrCreateUser(interaction.user.id, interaction.user.tag);
    if (user.coins < bet) {
        await interaction.reply({
            embeds: [errorEmbed('Insufficient Balance', `You only have **${user.coins.toLocaleString()}** ${config.economy?.currencyName || 'VSC'}.`)],
            ephemeral: true
        });
        return false;
    }

    return true;
}

/**
 * Records the result of a finished mini-game round (stats +
 * challenge progress + achievement check). Call this AFTER
 * you've already applied the coin change via economyManager.
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @param {string} username
 * @param {string} gameId
 * @param {{won: boolean, payout?: number}} result payout = gross coins WON this round (0 for a loss).
 */
async function settleGameRound(client, discordId, username, gameId, result) {
    progressionManager.recordGameResult(discordId, username, gameId, result);
    try {
        await achievementManager.checkAndAwardAchievements(discordId, client);
    } catch (err) {
        // Non-fatal — the game result itself already resolved successfully.
    }
}

module.exports = { preflightBettingGame, settleGameRound };
