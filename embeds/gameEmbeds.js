/**
 * gameEmbeds.js
 * -----------------------------------------------------
 * Embed builders for the mini-game system: the aggregate
 * stats view (used by /profile's Games button) and each
 * individual game's result embed.
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { applyBranding } = require('./embeds');

const GAME_LABELS = {
    coinflip: { label: 'Coinflip', emoji: '🪙' },
    dice: { label: 'Dice', emoji: '🎲' },
    slots: { label: 'Slots', emoji: '🎰' },
    blackjack: { label: 'Blackjack', emoji: '🃏' },
    trivia: { label: 'Trivia', emoji: '🧠' },
    guessnumber: { label: 'Guess the Number', emoji: '🔢' }
};

/**
 * The aggregate mini-game stats embed (games played/won/lost,
 * win rate, biggest win, favorite game, and a per-game breakdown).
 * @param {import('discord.js').Guild|null} guild
 * @param {import('discord.js').User} targetUser
 * @param {import('../utils/progressionManager').ProgressionUser} progressionUser
 * @returns {EmbedBuilder}
 */
function buildGameStatsEmbed(guild, targetUser, progressionUser) {
    const winRate = progressionUser.gamesPlayedTotal > 0 ? ((progressionUser.gamesWonTotal / progressionUser.gamesPlayedTotal) * 100).toFixed(1) : '0.0';

    let favoriteGame = null;
    let favoriteWins = 0;
    for (const [gameId, stats] of Object.entries(progressionUser.games || {})) {
        if (stats.won > favoriteWins) {
            favoriteWins = stats.won;
            favoriteGame = gameId;
        }
    }

    const breakdown = Object.entries(progressionUser.games || {})
        .filter(([, stats]) => stats.played > 0)
        .map(([gameId, stats]) => {
            const meta = GAME_LABELS[gameId] || { label: gameId, emoji: '🎮' };
            return `${meta.emoji} **${meta.label}** — ${stats.won}W / ${stats.lost}L (played ${stats.played}, biggest win: ${stats.biggestWin.toLocaleString()})`;
        });

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`🎮 ${targetUser.username}'s Game Stats`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: 'Games Played', value: `${progressionUser.gamesPlayedTotal.toLocaleString()}`, inline: true },
            { name: 'Games Won', value: `${progressionUser.gamesWonTotal.toLocaleString()}`, inline: true },
            { name: 'Win Rate', value: `${winRate}%`, inline: true },
            { name: 'Biggest Win', value: `${progressionUser.biggestSingleWin.toLocaleString()} ${config.economy?.currencyName || 'VSC'}`, inline: true },
            { name: 'Favorite Game', value: favoriteGame ? `${GAME_LABELS[favoriteGame]?.emoji || '🎮'} ${GAME_LABELS[favoriteGame]?.label || favoriteGame}` : 'None yet', inline: true }
        );

    if (breakdown.length > 0) {
        embed.addFields({ name: 'Breakdown', value: breakdown.join('\n') });
    }

    return applyBranding(embed);
}

/**
 * Generic mini-game result embed — win/loss color + net payout line.
 * @param {string} title e.g. "🪙 Coinflip"
 * @param {string} description Game-specific result text (e.g. "It landed on **Heads**!").
 * @param {boolean} won
 * @param {number} netAmount Positive for a win, negative for a loss, 0 for a push/no-bet game.
 * @returns {EmbedBuilder}
 */
function buildGameResultEmbed(title, description, won, netAmount) {
    const currency = config.economy?.currencyName || 'VSC';
    const color = won ? config.colors.success : netAmount < 0 ? config.colors.error : config.colors.primary;

    let resultLine = '';
    if (netAmount > 0) resultLine = `\n\n**You won +${netAmount.toLocaleString()} ${currency}!**`;
    else if (netAmount < 0) resultLine = `\n\n**You lost ${Math.abs(netAmount).toLocaleString()} ${currency}.**`;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`${description}${resultLine}`);

    return applyBranding(embed);
}

module.exports = { GAME_LABELS, buildGameStatsEmbed, buildGameResultEmbed };
