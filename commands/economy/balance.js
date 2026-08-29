/**
 * /balance command
 * -----------------------------------------------------
 * Shows a user's VSC balance, rank, total earned,
 * loot drops claimed, and license wins. See also /bal
 * (identical — Discord doesn't support command aliases).
 * -----------------------------------------------------
 */

const { SlashCommandBuilder } = require('discord.js');
const { showBalance } = require('../../utils/balanceDisplay');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your (or someone else\'s) VSC balance.')
        .setDMPermission(false)
        .addUserOption((opt) => opt.setName('user').setDescription('Whose balance to check (defaults to you).').setRequired(false)),

    async execute(interaction) {
        return showBalance(interaction);
    }
};
