/**
 * emojiResolver.js
 * -----------------------------------------------------
 * Discord's modal text inputs (and plain strings typed into
 * slash command options) don't auto-convert emoji shortcodes
 * like ":interenlstorelogo:" the way the normal chat box does —
 * that autocomplete only happens in Discord's own message
 * composer. If you type ":interenlstorelogo:" into a modal, it's
 * sent to the bot as the literal text ":interenlstorelogo:", and
 * the bot has to convert it into Discord's real custom-emoji
 * tag format itself (<:interenlstorelogo:123456789012345678>)
 * before it will render.
 *
 * This module does that conversion, and also provides a single
 * source of truth for the InterENL Store brand emoji + the wider
 * set of server emoji used throughout the bot's embeds
 * (config.emojis).
 * -----------------------------------------------------
 */

const config = require('../config');

/**
 * Looks up a custom emoji by name (case-insensitive) in a guild
 * and returns its full mention tag, or null if not found.
 * @param {import('discord.js').Guild|null} guild
 * @param {string} name Emoji name, without colons.
 * @returns {string|null}
 */
function resolveCustomEmoji(guild, name) {
    if (!guild || !name) return null;
    const emoji = guild.emojis.cache.find((e) => e.name && e.name.toLowerCase() === name.toLowerCase());
    return emoji ? emoji.toString() : null;
}

/**
 * Looks up a custom emoji by name and returns the raw {id, name}
 * shape Discord component builders (select menu options, buttons)
 * expect for setEmoji() — as opposed to resolveCustomEmoji(), which
 * returns the <:name:id> mention string used inside embed text.
 * @param {import('discord.js').Guild|null} guild
 * @param {string} name Emoji name, without colons.
 * @returns {{id: string, name: string}|null}
 */
function resolveCustomEmojiObject(guild, name) {
    if (!guild || !name) return null;
    const emoji = guild.emojis.cache.find((e) => e.name && e.name.toLowerCase() === name.toLowerCase());
    return emoji ? { id: emoji.id, name: emoji.name } : null;
}

/**
 * Scans a string for ":shortcode:" patterns and replaces any that
 * match a real custom emoji in the given guild with its proper
 * mention tag. Shortcodes that don't match any emoji in the guild
 * are left untouched (so normal text containing a colon-wrapped
 * word, or a typo, doesn't get silently mangled).
 * @param {string} text
 * @param {import('discord.js').Guild|null} guild
 * @returns {string}
 */
function replaceEmojiShortcodes(text, guild) {
    if (!text || !guild) return text;
    return text.replace(/:([a-zA-Z0-9_]+):/g, (match, name) => {
        const resolved = resolveCustomEmoji(guild, name);
        return resolved || match;
    });
}

/**
 * Returns the InterENL Store brand emoji for a guild — the real
 * custom emoji tag if the guild has one matching config.economy.emojiName
 * (defaults to "interenlstorelogo"), otherwise a sensible fallback so
 * embeds still look right if it's missing.
 * @param {import('discord.js').Guild|null} guild
 * @param {string} [fallback='🪙']
 * @returns {string}
 */
function getBrandEmoji(guild, fallback = '🪙') {
    const name = config.economy?.emojiName || 'interenlstorelogo';
    return resolveCustomEmoji(guild, name) || fallback;
}

/**
 * Looks up a named entry from config.emojis (e.g. "cart", "admin",
 * "verify") and resolves it against the guild's real custom emoji,
 * falling back to a unicode default if the server emoji isn't found
 * (e.g. in a test guild that doesn't have InterENL Store's emoji pack).
 * @param {import('discord.js').Guild|null} guild
 * @param {string} key A key from config.emojis.
 * @param {string} [fallback='✨']
 * @returns {string}
 */
function getEmoji(guild, key, fallback = '✨') {
    const name = config.emojis?.[key];
    if (!name) return fallback;
    return resolveCustomEmoji(guild, name) || fallback;
}

module.exports = {
    resolveCustomEmoji,
    resolveCustomEmojiObject,
    replaceEmojiShortcodes,
    getBrandEmoji,
    getEmoji
};
