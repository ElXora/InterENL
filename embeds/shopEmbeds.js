/**
 * shopEmbeds.js
 * -----------------------------------------------------
 * Embed builders for the VSC license shop.
 * -----------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { applyBranding } = require('./embeds');
const { getBrandEmoji } = require('../utils/emojiResolver');

/**
 * The shop catalog embed shown alongside the plan select menu.
 * @param {import('discord.js').Guild|null} guild
 * @returns {EmbedBuilder}
 */
function buildShopCatalogEmbed(guild) {
    const currency = config.economy?.currencyName || 'VSC';
    const plans = config.shop?.plans || {};

    const lines = Object.entries(plans).map(([plan, price]) => `${getBrandEmoji(guild)} **${plan}** — ${price.toLocaleString()} ${currency}`);

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🛒 InterENL Store Shop')
        .setDescription(`Buy a genuine InterENL Store license directly with your ${currency} balance.\n\n${lines.join('\n')}\n\nPick a plan below to purchase.`);

    return applyBranding(embed);
}

/**
 * The "confirm this purchase?" embed.
 * @param {string} plan
 * @param {number} price
 * @param {number} balance
 * @returns {EmbedBuilder}
 */
function buildShopConfirmEmbed(plan, price, balance) {
    const currency = config.economy?.currencyName || 'VSC';
    const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('🛒 Confirm Purchase')
        .setDescription(
            `Buy a **${plan}** InterENL Store license for **${price.toLocaleString()} ${currency}**?\n\nYour balance: ${balance.toLocaleString()} ${currency} → ${(balance - price).toLocaleString()} ${currency} after purchase.`
        );

    return applyBranding(embed);
}

module.exports = { buildShopCatalogEmbed, buildShopConfirmEmbed };
