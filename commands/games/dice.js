/**
 * /dice command
 * -----------------------------------------------------
 * Bet coins that a rolled die (1-6) will be higher than
 * the house's roll. Ties refund the bet (push).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const economyManager = require('../../utils/economyManager');
const { preflightBettingGame, settleGameRound } = require('../../utils/gameHelpers');
const { buildGameResultEmbed } = require('../../embeds/gameEmbeds');

function rollDie() {
    return Math.floor(Math.random() * 6) + 1;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Bet coins and roll against the house.')
        .setDMPermission(false)
        .addIntegerOption((opt) => opt.setName('bet').setDescription('How many coins to bet.').setRequired(true).setMinValue(1)),

    async execute(interaction, client) {
        const bet = interaction.options.getInteger('bet');
        const limits = config.games?.dice || { minBet: 10, maxBet: 10000 };

        if (!(await preflightBettingGame(interaction, 'dice', bet, limits))) return;

        const playerRoll = rollDie();
        const houseRoll = rollDie();
        const won = playerRoll > houseRoll;
        const push = playerRoll === houseRoll;
        const multiplier = config.games?.dice?.winMultiplier ?? 1.9;
        const netAmount = won ? Math.round(bet * (multiplier - 1)) : push ? 0 : -bet;

        if (won) economyManager.addCoins(interaction.user.id, interaction.user.tag, netAmount);
        else if (!push) economyManager.removeCoins(interaction.user.id, interaction.user.tag, bet);

        await settleGameRound(client, interaction.user.id, interaction.user.tag, 'dice', {
            won,
            payout: won ? netAmount : 0
        });

        return interaction.reply({
            embeds: [
                buildGameResultEmbed(
                    '🎲 Dice',
                    `You rolled 🎲 **${playerRoll}**\nThe house rolled 🎲 **${houseRoll}**\n\n${push ? "**It's a push!** Your bet was refunded." : ''}`,
                    won,
                    netAmount
                )
            ]
        });
    }
};
