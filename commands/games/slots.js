/**
 * /slots command
 * -----------------------------------------------------
 * Classic 3-reel slot machine. Payout scales with how
 * rare the matched symbol is.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const economyManager = require('../../utils/economyManager');
const { preflightBettingGame, settleGameRound } = require('../../utils/gameHelpers');
const { buildGameResultEmbed } = require('../../embeds/gameEmbeds');

// Weighted so 💎 (jackpot symbol) is rarest, 🍒 most common.
const REEL = [
    { symbol: '🍒', weight: 40, multiplier: 2 },
    { symbol: '🍋', weight: 28, multiplier: 3 },
    { symbol: '🍇', weight: 18, multiplier: 5 },
    { symbol: '🔔', weight: 10, multiplier: 10 },
    { symbol: '💎', weight: 4, multiplier: 25 }
];

function spinReel() {
    const totalWeight = REEL.reduce((sum, s) => sum + s.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const s of REEL) {
        if (roll < s.weight) return s;
        roll -= s.weight;
    }
    return REEL[0];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Spin the InterENL Store slot machine.')
        .setDMPermission(false)
        .addIntegerOption((opt) => opt.setName('bet').setDescription('How many coins to bet.').setRequired(true).setMinValue(1)),

    async execute(interaction, client) {
        const bet = interaction.options.getInteger('bet');
        const limits = config.games?.slots || { minBet: 10, maxBet: 5000 };

        if (!(await preflightBettingGame(interaction, 'slots', bet, limits))) return;

        const reels = [spinReel(), spinReel(), spinReel()];
        const [a, b, c] = reels;

        let won = false;
        let netAmount = -bet;

        if (a.symbol === b.symbol && b.symbol === c.symbol) {
            won = true;
            netAmount = Math.round(bet * a.multiplier) - bet;
        } else if (a.symbol === b.symbol || b.symbol === c.symbol || a.symbol === c.symbol) {
            // A partial 2-of-3 match gives a small consolation payout at half the matched symbol's multiplier.
            const matched = a.symbol === b.symbol ? a : b.symbol === c.symbol ? b : a;
            won = true;
            netAmount = Math.max(0, Math.round((bet * matched.multiplier) / 4) - bet);
            if (netAmount <= 0) won = false;
        }

        if (won) economyManager.addCoins(interaction.user.id, interaction.user.tag, netAmount);
        else economyManager.removeCoins(interaction.user.id, interaction.user.tag, bet);

        await settleGameRound(client, interaction.user.id, interaction.user.tag, 'slots', {
            won,
            payout: won ? netAmount : 0
        });

        const reelDisplay = `[${a.symbol}] [${b.symbol}] [${c.symbol}]`;
        return interaction.reply({
            embeds: [buildGameResultEmbed('🎰 SLOTS', `${reelDisplay}\n\n${a.symbol === b.symbol && b.symbol === c.symbol ? '**JACKPOT MATCH!** 🎉' : won ? 'Partial match!' : 'No match — better luck next time!'}`, won, netAmount)]
        });
    }
};
