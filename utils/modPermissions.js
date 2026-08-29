/**
 * modPermissions.js
 * -----------------------------------------------------
 * Permission gate for moderation commands. A user may run
 * a moderation command if they hold the relevant native
 * Discord permission (e.g. BanMembers) OR are the bot Owner
 * / a registered bot Admin (full override).
 * -----------------------------------------------------
 */

const permissions = require('./permissions');
const { errorEmbed } = require('../embeds/embeds');

/**
 * Checks whether the interacting member has the given native
 * Discord permission, or is the bot Owner/Admin. Replies with
 * a denial embed and returns false if neither is true.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {bigint} discordPermissionFlag e.g. PermissionFlagsBits.BanMembers
 * @returns {boolean}
 */
function requireModPermission(interaction, discordPermissionFlag) {
    const isOverride = permissions.hasPermission(interaction.user.id);
    const hasNative = interaction.member?.permissions?.has(discordPermissionFlag);

    if (isOverride || hasNative) return true;

    interaction.reply({
        embeds: [errorEmbed('Access Denied', '❌ You do not have permission to use this command.')],
        ephemeral: true
    });
    return false;
}

module.exports = { requireModPermission };
