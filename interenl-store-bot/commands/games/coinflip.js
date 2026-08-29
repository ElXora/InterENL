/**
 * /coinflip command
 * -----------------------------------------------------
 * Bet coins on heads or tails. Uses the existing economy
 * currency — no second currency.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const economyManager = require('../../utils/economyManager');
const { preflightBettingGame, settleGameRound } = require('../../utils/gameHelpers');
const { buildGameResultEmbed } = require('../../embeds/gameEmbeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Bet coins on a coinflip.')
        .setDMPermission(false)
        .addIntegerOption((opt) => opt.setName('bet').setDescription('How many coins to bet.').setRequired(true).setMinValue(1))
        .addStringOption((opt) =>
            opt
                .setName('choice')
                .setDescription('Heads or tails.')
                .setRequired(true)
                .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
        ),

    async execute(interaction, client) {
        const bet = interaction.options.getInteger('bet');
        const choice = interaction.options.getString('choice');
        const limits = config.games?.coinflip || { minBet: 10, maxBet: 10000 };

        if (!(await preflightBettingGame(interaction, 'coinflip', bet, limits))) return;

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = result === choice;
        const multiplier = config.games?.coinflip?.winMultiplier ?? 1.95;
        const netAmount = won ? Math.round(bet * (multiplier - 1)) : -bet;

        if (won) economyManager.addCoins(interaction.user.id, interaction.user.tag, netAmount);
        else economyManager.removeCoins(interaction.user.id, interaction.user.tag, bet);

        await settleGameRound(client, interaction.user.id, interaction.user.tag, 'coinflip', {
            won,
            payout: won ? netAmount : 0
        });

        const resultEmoji = result === 'heads' ? '🪙' : '🥈';
        return interaction.reply({
            embeds: [
                buildGameResultEmbed(
                    '🪙 Coinflip',
                    `The coin landed on **${result.charAt(0).toUpperCase() + result.slice(1)}** ${resultEmoji}!\nYou chose **${choice}**.`,
                    won,
                    netAmount
                )
            ]
        });
    }
};
