/**
 * welcomeEmbeds.js
 * -----------------------------------------------------
 * Builds the embed posted in the configured welcome channel
 * whenever a new member joins the server. Fully driven by
 * config.welcome (message/description templates support
 * %username% and {member} placeholders, plus ":shortcode:"
 * custom emoji from the InterENL Store emoji pack).
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { replaceEmojiShortcodes, getEmoji } = require('../utils/emojiResolver');

/**
 * Fills in the %username%/%tag%/%mention%/{member} placeholders
 * supported by the welcome message + description templates.
 * @param {string} template
 * @param {import('discord.js').GuildMember} member
 * @returns {string}
 */
function fillPlaceholders(template, member) {
    if (!template) return '';
    return template
        .replace(/%username%/g, member.user.username)
        .replace(/%tag%/g, member.user.tag)
        .replace(/%mention%/g, `${member}`)
        .replace(/\{member\}/g, `${member}`);
}

/**
 * Builds the welcome embed for a member who just joined.
 * @param {import('discord.js').GuildMember} member
 * @returns {EmbedBuilder}
 */
function buildWelcomeEmbed(member) {
    const guild = member.guild;
    const welcomeConfig = config.welcome || {};

    const rawTitle = welcomeConfig.message || 'Welcome %username% to **InterENL Store**!';
    const rawDescription = welcomeConfig.description || '';

    const title = replaceEmojiShortcodes(fillPlaceholders(rawTitle, member), guild);
    const description = replaceEmojiShortcodes(fillPlaceholders(rawDescription, member), guild);

    const embed = new EmbedBuilder()
        .setColor(config.colors?.primary || 0x2563EB)
        .setTitle(title)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();

    if (description) embed.setDescription(description);

    if (config.thumbnail) {
        embed.setImage(config.thumbnail);
    }

    const fields = [
        { name: `${getEmoji(guild, 'globe', '🌐')} Account Created`, value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
    ];

    if (welcomeConfig.showMemberCount !== false && guild.memberCount) {
        fields.push({ name: `${getEmoji(guild, 'admin', '👥')} Member Count`, value: `#${guild.memberCount}`, inline: true });
    }

    embed.addFields(fields);
    embed.setFooter({ text: config.footer || 'InterENL Store' });

    return embed;
}

module.exports = { buildWelcomeEmbed, fillPlaceholders };
