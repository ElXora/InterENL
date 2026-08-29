/**
 * helpEmbeds.js
 * -----------------------------------------------------
 * Embed builders for /help. Commands are grouped by their
 * folder under /commands (set as `command.category` in
 * commandHandler.js). Category display metadata (label +
 * emoji, preferring the InterENL Store server emoji pack where
 * one fits) lives in CATEGORY_META below.
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { applyBranding } = require('./embeds');
const { getEmoji, getBrandEmoji } = require('../utils/emojiResolver');

/**
 * Maps a commands/<folder> name to its /help display label +
 * how to resolve its emoji. `emojiKey` looks it up in
 * config.emojis (the InterENL Store server emoji pack) with a
 * unicode `fallback` for guilds that don't have that emoji.
 */
const CATEGORY_META = {
    license: { label: 'Licenses', fallback: '🔑' },
    economy: { label: 'Economy', emojiKey: 'bankcard', fallback: '💰' },
    'economy-admin': { label: 'Economy Admin', emojiKey: 'admin', fallback: '🛠️' },
    leveling: { label: 'Leveling', emojiKey: 'fire', fallback: '⭐' },
    achievements: { label: 'Achievements', fallback: '🏆' },
    battlepass: { label: 'Battle Pass', emojiKey: 'crown', fallback: '🎟️' },
    challenges: { label: 'Challenges', emojiKey: 'cooldown', fallback: '🎯' },
    games: { label: 'Mini-Games', fallback: '🎮' },
    giveaway: { label: 'Giveaways', fallback: '🎁' },
    tickets: { label: 'Tickets', emojiKey: 'cmd', fallback: '🎫' },
    moderation: { label: 'Moderation', emojiKey: 'shield', fallback: '🛡️' },
    admin: { label: 'Admin', emojiKey: 'admin', fallback: '👑' },
    announce: { label: 'Announcements', fallback: '📢' },
    general: { label: 'General', fallback: '📖' }
};

/**
 * @param {import('discord.js').Guild|null} guild
 * @param {string} categoryKey
 * @returns {string} A real custom emoji if configured + present in the guild, else the unicode fallback.
 */
function resolveCategoryEmoji(guild, categoryKey) {
    const meta = CATEGORY_META[categoryKey] || { fallback: '📁' };
    if (meta.emojiKey) return getEmoji(guild, meta.emojiKey, meta.fallback);
    return meta.fallback;
}

/**
 * @param {string} categoryKey
 * @returns {string}
 */
function resolveCategoryLabel(categoryKey) {
    return CATEGORY_META[categoryKey]?.label || categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
}

/**
 * Groups a Collection of loaded commands by their `.category`.
 * @param {import('discord.js').Collection} commands
 * @returns {Map<string, Array<object>>}
 */
function groupByCategory(commands) {
    const grouped = new Map();
    for (const command of commands.values()) {
        const category = command.category || 'general';
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push(command);
    }
    return grouped;
}

/**
 * The default /help view: every category with its command count,
 * plus the brand emoji up top.
 * @param {import('discord.js').Guild|null} guild
 * @param {Map<string, Array<object>>} grouped
 * @returns {EmbedBuilder}
 */
function buildHelpOverviewEmbed(guild, grouped) {
    const lines = [...grouped.entries()]
        .sort((a, b) => resolveCategoryLabel(a[0]).localeCompare(resolveCategoryLabel(b[0])))
        .map(([category, commands]) => `${resolveCategoryEmoji(guild, category)} **${resolveCategoryLabel(category)}** — ${commands.length} command${commands.length === 1 ? '' : 's'}`);

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`${getBrandEmoji(guild, '📖')} InterENL Store — Help`)
        .setDescription(`Use the menu below to browse commands by category.\n\n${lines.join('\n')}`);

    return applyBranding(embed);
}

/**
 * A single category's command list, with each command's
 * name/description and its options laid out.
 * @param {import('discord.js').Guild|null} guild
 * @param {string} categoryKey
 * @param {Array<object>} commands
 * @returns {EmbedBuilder}
 */
function buildHelpCategoryEmbed(guild, categoryKey, commands) {
    const lines = commands
        .sort((a, b) => a.data.name.localeCompare(b.data.name))
        .map((command) => {
            const json = command.data.toJSON();
            if (json.options && json.options.length > 0 && json.options.every((o) => o.type === 1)) {
                // Has subcommands — list each one.
                return json.options.map((sub) => `\`/${json.name} ${sub.name}\` — ${sub.description}`).join('\n');
            }
            return `\`/${json.name}\` — ${json.description}`;
        });

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`${resolveCategoryEmoji(guild, categoryKey)} ${resolveCategoryLabel(categoryKey)} Commands`)
        .setDescription(lines.join('\n\n') || 'No commands in this category.');

    return applyBranding(embed);
}

module.exports = { CATEGORY_META, resolveCategoryEmoji, resolveCategoryLabel, groupByCategory, buildHelpOverviewEmbed, buildHelpCategoryEmbed };
