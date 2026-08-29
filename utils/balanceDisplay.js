/**
 * balanceDisplay.js
 * -----------------------------------------------------
 * Shared handler for /balance and /bal. Discord slash
 * commands don't support true aliases — each name needs
 * its own registration — so both command files import and
 * call this same function to avoid duplicating logic.
 *
 * Restricted to Owner/Admin at runtime — the command itself
 * stays visible to everyone in Discord's command list (no
 * setDefaultMemberPermissions), it's just gated on use.
 * -----------------------------------------------------
 */

const permissions = require('./permissions');
const economyManager = require('./economyManager');
const { checkNotBlacklisted } = require('./economyGuard');
const { buildBalanceEmbed } = require('../embeds/economyEmbeds');
const { errorEmbed } = require('../embeds/embeds');

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function showBalance(interaction) {
    if (!permissions.hasPermission(interaction.user.id)) {
        return interaction.reply({
            embeds: [errorEmbed('Access Denied', '❌ You do not have permission to use this command.')],
            ephemeral: true
        });
    }

    if (!(await checkNotBlacklisted(interaction))) return;

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const record = economyManager.getOrCreateUser(targetUser.id, targetUser.tag);
    const rank = economyManager.getUserRank(targetUser.id);

    return interaction.reply({ embeds: [buildBalanceEmbed(interaction.guild, targetUser, record, rank)] });
}

module.exports = { showBalance };
