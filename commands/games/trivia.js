/**
 * /trivia command
 * -----------------------------------------------------
 * Free-to-play — answer a random question via buttons
 * within the time limit. Self-contained message-scoped
 * button collector (no global interactionCreate routing
 * needed, since each trivia round is short-lived).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const economyManager = require('../../utils/economyManager');
const progressionManager = require('../../utils/progressionManager');
const { settleGameRound } = require('../../utils/gameHelpers');
const { checkAndStartCooldown } = require('../../utils/gameCooldown');
const { applyBranding } = require('../../embeds/embeds');
const { buildGameResultEmbed } = require('../../embeds/gameEmbeds');
const { errorEmbed } = require('../../embeds/embeds');
const QUESTIONS = require('../../utils/triviaQuestions');

const LETTERS = ['A', 'B', 'C', 'D'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trivia')
        .setDescription('Answer a trivia question for a free reward.')
        .setDMPermission(false),

    async execute(interaction, client) {
        if (!config.games?.enabled) {
            return interaction.reply({ embeds: [errorEmbed('Games Disabled', 'Mini-games are currently disabled.')], ephemeral: true });
        }

        const cooldown = checkAndStartCooldown(interaction.user.id, 'trivia');
        if (!cooldown.allowed) {
            return interaction.reply({
                embeds: [errorEmbed('Slow Down!', `You can play again in **${cooldown.remainingSeconds}s**.`)],
                ephemeral: true
            });
        }

        const daily = progressionManager.canPlayTriviaToday(interaction.user.id, interaction.user.tag);
        if (!daily.allowed) {
            return interaction.reply({
                embeds: [errorEmbed('Daily Limit Reached', `You've used all **${daily.limit}** of your trivia questions for today. Come back tomorrow!`)],
                ephemeral: true
            });
        }
        progressionManager.recordTriviaPlay(interaction.user.id, interaction.user.tag);

        const questionIndex = progressionManager.pickTriviaQuestionIndex(interaction.user.id, interaction.user.tag, QUESTIONS.length);
        const q = QUESTIONS[questionIndex];
        const timeSeconds = config.games?.trivia?.timeSeconds ?? 20;

        const row = new ActionRowBuilder().addComponents(
            q.options.map((opt, i) =>
                new ButtonBuilder().setCustomId(`trivia_${i}`).setLabel(`${LETTERS[i]}. ${opt}`).setStyle(ButtonStyle.Secondary)
            )
        );

        const questionEmbed = applyBranding(
            new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle('🧠 Trivia')
                .setDescription(`${q.question}\n\n*You have ${timeSeconds} seconds to answer.*\n\n📋 Question ${daily.playsToday + 1} of ${daily.limit} today`)
        );

        const message = await interaction.reply({ embeds: [questionEmbed], components: [row], fetchReply: true });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: timeSeconds * 1000,
            filter: (btn) => btn.user.id === interaction.user.id,
            max: 1
        });

        let answered = false;

        collector.on('collect', async (btnInteraction) => {
            answered = true;
            const chosenIndex = Number(btnInteraction.customId.split('_')[1]);
            const won = chosenIndex === q.correctIndex;

            const coinReward = config.games?.trivia?.rewardCoins ?? 150;
            const xpReward = config.games?.trivia?.rewardXp ?? 20;
            let netAmount = 0;

            if (won) {
                economyManager.addCoins(interaction.user.id, interaction.user.tag, coinReward);
                progressionManager.addXp(interaction.user.id, interaction.user.tag, xpReward, { bypassCooldown: true });
                netAmount = coinReward;
            }

            await settleGameRound(client, interaction.user.id, interaction.user.tag, 'trivia', { won, payout: netAmount });

            const description = won
                ? `**Correct!** The answer was **${LETTERS[q.correctIndex]}. ${q.options[q.correctIndex]}**.`
                : `**Not quite.** You picked **${LETTERS[chosenIndex]}**, the correct answer was **${LETTERS[q.correctIndex]}. ${q.options[q.correctIndex]}**.`;

            await btnInteraction.update({
                embeds: [buildGameResultEmbed('🧠 Trivia', description, won, won ? netAmount : 0)],
                components: []
            });
        });

        collector.on('end', async () => {
            if (answered) return;
            try {
                await interaction.editReply({
                    embeds: [
                        buildGameResultEmbed(
                            '🧠 Trivia',
                            `**Time's up!** The correct answer was **${LETTERS[q.correctIndex]}. ${q.options[q.correctIndex]}**.`,
                            false,
                            0
                        )
                    ],
                    components: []
                });
            } catch (err) {
                // Non-fatal.
            }
        });
    }
};
