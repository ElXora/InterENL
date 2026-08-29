/**
 * /help command
 * -----------------------------------------------------
 * Lists every loaded command, grouped by category, browsable
 * via a select menu. Self-contained message-scoped collector
 * (like /profile) — no global interactionCreate routing needed.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const {
    resolveCategoryEmoji,
    resolveCategoryLabel,
    groupByCategory,
    buildHelpOverviewEmbed,
    buildHelpCategoryEmbed
} = require('../../embeds/helpEmbeds');

function buildCategorySelect(guild, grouped, disabled = false) {
    const options = [{ label: 'Overview', value: '__overview', emoji: '📖' }].concat(
        [...grouped.keys()].sort((a, b) => resolveCategoryLabel(a).localeCompare(resolveCategoryLabel(b))).map((category) => ({
            label: resolveCategoryLabel(category),
            value: category,
            emoji: resolveCategoryEmoji(guild, category)
        }))
    );

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_category_select')
            .setPlaceholder('Browse a category...')
            .setDisabled(disabled)
            .addOptions(options)
    );
}

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('Browse every InterENL Store bot command by category.').setDMPermission(false),

    async execute(interaction, client) {
        const grouped = groupByCategory(client.commands);
        const guild = interaction.guild;

        const message = await interaction.reply({
            embeds: [buildHelpOverviewEmbed(guild, grouped)],
            components: [buildCategorySelect(guild, grouped)],
            fetchReply: true
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 180000,
            filter: (select) => select.user.id === interaction.user.id
        });

        collector.on('collect', async (selectInteraction) => {
            const choice = selectInteraction.values[0];
            const embed =
                choice === '__overview'
                    ? buildHelpOverviewEmbed(guild, grouped)
                    : buildHelpCategoryEmbed(guild, choice, grouped.get(choice) || []);

            await selectInteraction.update({ embeds: [embed], components: [buildCategorySelect(guild, grouped)] });
        });

        collector.on('end', async () => {
            try {
                await message.edit({ components: [buildCategorySelect(guild, grouped, true)] });
            } catch (err) {
                // Non-fatal — message may have been deleted.
            }
        });
    }
};
