/**
 * /blackjack command
 * -----------------------------------------------------
 * Single-hand Blackjack vs the dealer, with Hit/Stand
 * buttons. Self-contained message-scoped collector — each
 * round is short-lived so no global interactionCreate
 * routing is needed.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const economyManager = require('../../utils/economyManager');
const progressionManager = require('../../utils/progressionManager');
const { preflightBettingGame, settleGameRound } = require('../../utils/gameHelpers');
const { applyBranding } = require('../../embeds/embeds');
const { buildGameResultEmbed } = require('../../embeds/gameEmbeds');
const { buildShuffledDeck, scoreHand, isNatural21, formatHand, playDealerTurn } = require('../../utils/blackjackEngine');

function buildHandEmbed(playerHand, dealerHand, { revealDealer = false, statusLine = '' } = {}) {
    const dealerDisplay = revealDealer ? `${formatHand(dealerHand)} (${scoreHand(dealerHand)})` : `${formatHand([dealerHand[0]])} ??`;

    return applyBranding(
        new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🃏 Blackjack')
            .addFields(
                { name: 'Your Hand', value: `${formatHand(playerHand)} (${scoreHand(playerHand)})` },
                { name: "Dealer's Hand", value: dealerDisplay }
            )
            .setDescription(statusLine || 'Hit to draw another card, or Stand to hold.')
    );
}

function buildButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setEmoji('➕').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setEmoji('✋').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play a hand of Blackjack against the dealer.')
        .setDMPermission(false)
        .addIntegerOption((opt) => opt.setName('bet').setDescription('How many coins to bet.').setRequired(true).setMinValue(1)),

    async execute(interaction, client) {
        const bet = interaction.options.getInteger('bet');
        const limits = config.games?.blackjack || { minBet: 10, maxBet: 5000 };

        if (!(await preflightBettingGame(interaction, 'blackjack', bet, limits))) return;

        // Bet is held up front; resolved (refunded/paid out) once the round ends.
        economyManager.removeCoins(interaction.user.id, interaction.user.tag, bet);

        const deck = buildShuffledDeck();
        const playerHand = [deck.pop(), deck.pop()];
        const dealerHand = [deck.pop(), deck.pop()];

        const finalize = async (respond, statusExtra) => {
            const playerBust = scoreHand(playerHand) > 21;
            if (!playerBust) playDealerTurn(deck, dealerHand);

            const playerScore = scoreHand(playerHand);
            const dealerScore = scoreHand(dealerHand);
            const playerNatural = isNatural21(playerHand);
            const dealerNatural = isNatural21(dealerHand);

            let won = false;
            let push = false;
            let netAmount;

            if (playerBust) {
                netAmount = -bet;
            } else if (playerNatural && !dealerNatural) {
                won = true;
                const multiplier = config.games?.blackjack?.blackjackMultiplier ?? 2.5;
                netAmount = Math.round(bet * (multiplier - 1));
                progressionManager.recordBlackjackNatural(interaction.user.id, interaction.user.tag);
            } else if (dealerNatural && !playerNatural) {
                netAmount = -bet;
            } else if (playerNatural && dealerNatural) {
                push = true;
                netAmount = 0;
            } else if (dealerScore > 21 || playerScore > dealerScore) {
                won = true;
                const multiplier = config.games?.blackjack?.winMultiplier ?? 2;
                netAmount = Math.round(bet * (multiplier - 1));
            } else if (playerScore === dealerScore) {
                push = true;
                netAmount = 0;
            } else {
                netAmount = -bet;
            }

            // The bet was already removed above. Now settle: winners get their
            // bet back plus profit, pushes get just their bet back, losers get nothing back.
            if (won) economyManager.addCoins(interaction.user.id, interaction.user.tag, bet + netAmount);
            else if (push) economyManager.addCoins(interaction.user.id, interaction.user.tag, bet);

            await settleGameRound(client, interaction.user.id, interaction.user.tag, 'blackjack', {
                won,
                payout: won ? netAmount : 0
            });

            const outcomeLine = playerBust
                ? '💥 **Bust!** You went over 21.'
                : playerNatural && !dealerNatural
                  ? '🃏 **Natural Blackjack!**'
                  : push
                    ? "**Push!** It's a tie — your bet was refunded."
                    : won
                      ? '🎉 **You win!**'
                      : '**Dealer wins.**';

            const embed = buildHandEmbed(playerHand, dealerHand, { revealDealer: true, statusLine: outcomeLine });
            const resultEmbed = buildGameResultEmbed('🃏 Blackjack Result', `${formatHand(playerHand)} (${playerScore}) vs ${formatHand(dealerHand)} (${dealerScore})\n\n${outcomeLine}`, won, won ? netAmount : push ? 0 : -bet);

            await respond({ embeds: [resultEmbed], components: [] });
        };

        if (isNatural21(playerHand)) {
            const message = await interaction.reply({ embeds: [buildHandEmbed(playerHand, dealerHand)], components: [], fetchReply: true });
            await finalize((payload) => message.edit(payload));
            return;
        }

        const message = await interaction.reply({ embeds: [buildHandEmbed(playerHand, dealerHand)], components: [buildButtons()], fetchReply: true });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000,
            filter: (btn) => btn.user.id === interaction.user.id
        });

        collector.on('collect', async (btnInteraction) => {
            if (btnInteraction.customId === 'bj_hit') {
                playerHand.push(deck.pop());
                const score = scoreHand(playerHand);

                if (score >= 21) {
                    collector.stop('resolved');
                    await finalize((payload) => btnInteraction.update(payload));
                    return;
                }

                await btnInteraction.update({ embeds: [buildHandEmbed(playerHand, dealerHand)], components: [buildButtons()] });
                return;
            }

            if (btnInteraction.customId === 'bj_stand') {
                collector.stop('resolved');
                await finalize((payload) => btnInteraction.update(payload));
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'resolved') return;
            // Timed out without the player acting — treat as a stand.
            try {
                await finalize((payload) => message.edit(payload));
            } catch (err) {
                // Non-fatal.
            }
        });
    }
};
