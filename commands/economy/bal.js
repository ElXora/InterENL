/**
 * /bal command
 * -----------------------------------------------------
 * Shortcut for /balance — identical behavior. Discord
 * slash commands don't support true aliases, so this is
 * registered as its own command sharing the same handler.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const { showBalance } = require('../../utils/balanceDisplay');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bal')
        .setDescription('Check your (or someone else\'s) VSC balance. Shortcut for /balance.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('Whose balance to check (defaults to you).').setRequired(false)),

    async execute(interaction) {
        return showBalance(interaction);
    }
};
