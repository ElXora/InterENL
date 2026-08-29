/**
 * economyGuard.js
 * -----------------------------------------------------
 * Shared guard used at the top of every economy command:
 * checks whether the user is blacklisted and, if so, replies
 * with the standard denial embed and returns false so the
 * command can bail out immediately.
 * -----------------------------------------------------
 */

const economyManager = require('./economyManager');
const { buildBlacklistedEmbed } = require('../embeds/economyEmbeds');

/**
 * @param {import('discord.js').ChatInputCommandInteraction|import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} True if allowed to proceed, false if blacklisted (already replied).
 */
async function checkNotBlacklisted(interaction) {
    if (!economyManager.isBlacklisted(interaction.user.id)) return true;

    const user = economyManager.getUser(interaction.user.id);
    const reason = user?.blacklistReason || 'You have been restricted by a InterENL Store Administrator.';

    const replyPayload = { embeds: [buildBlacklistedEmbed(interaction.guild, reason)], ephemeral: true };

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(replyPayload);
    } else {
        await interaction.reply(replyPayload);
    }

    return false;
}

module.exports = { checkNotBlacklisted };
