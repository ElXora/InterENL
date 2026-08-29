/**
 * /guessnumber command
 * -----------------------------------------------------
 * Free-to-play (no bet) — guess the secret number in one
 * shot. Reward is fixed coins + XP on a correct guess.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const economyManager = require('../../utils/economyManager');
const progressionManager = require('../../utils/progressionManager');
const { settleGameRound } = require('../../utils/gameHelpers');
const { checkAndStartCooldown } = require('../../utils/gameCooldown');
const { buildGameResultEmbed } = require('../../embeds/gameEmbeds');
const { errorEmbed } = require('../../embeds/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guessnumber')
        .setDescription('Guess the secret number for a free reward.')
        .setDMPermission(false)
        .addIntegerOption((opt) => {
            const min = config.games?.guessnumber?.min ?? 1;
            const max = config.games?.guessnumber?.max ?? 50;
            return opt.setName('number').setDescription(`Your guess (${min}-${max}).`).setRequired(true).setMinValue(min).setMaxValue(max);
        }),

    async execute(interaction, client) {
        if (!config.games?.enabled) {
            return interaction.reply({ embeds: [errorEmbed('Games Disabled', 'Mini-games are currently disabled.')], ephemeral: true });
        }

        const cooldown = checkAndStartCooldown(interaction.user.id, 'guessnumber');
        if (!cooldown.allowed) {
            return interaction.reply({
                embeds: [errorEmbed('Slow Down!', `You can play again in **${cooldown.remainingSeconds}s**.`)],
                ephemeral: true
            });
        }

        const min = config.games?.guessnumber?.min ?? 1;
        const max = config.games?.guessnumber?.max ?? 50;
        const guess = interaction.options.getInteger('number');
        const secret = Math.floor(Math.random() * (max - min + 1)) + min;
        const won = guess === secret;

        const coinReward = config.games?.guessnumber?.rewardCoins ?? 300;
        const xpReward = config.games?.guessnumber?.rewardXp ?? 25;
        let netAmount = 0;

        if (won) {
            economyManager.addCoins(interaction.user.id, interaction.user.tag, coinReward);
            progressionManager.addXp(interaction.user.id, interaction.user.tag, xpReward, { bypassCooldown: true });
            netAmount = coinReward;
        }

        await settleGameRound(client, interaction.user.id, interaction.user.tag, 'guessnumber', { won, payout: netAmount });

        const description = won
            ? `You guessed **${guess}** — the secret number was **${secret}**!\n\n🎯 **Exact match!**`
            : `You guessed **${guess}** — the secret number was **${secret}**.\nSo close! Try again.`;

        return interaction.reply({
            embeds: [buildGameResultEmbed('🔢 Guess the Number', description, won, won ? netAmount : 0)]
        });
    }
};
