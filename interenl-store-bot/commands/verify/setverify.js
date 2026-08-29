/**
 * /setverify command
 * -----------------------------------------------------
 * Posts a verification panel with a button that links
 * straight to Discord's own OAuth2 authorize page (this is
 * the real discord.com login/consent screen — the bot never
 * shows its own login form). Approving it redirects to this
 * bot's verify server (handlers/verifyServer.js), which grants
 * VERIFIED_ROLE_ID (from .env) via the bot's own permissions.
 * -----------------------------------------------------
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const permissions = require('../../utils/permissions');
const { applyBranding } = require('../../embeds/embeds');
const { errorEmbed, successEmbed } = require('../../embeds/embeds');
const { getEmoji } = require('../../utils/emojiResolver');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setverify')
        .setDescription('Post the member verification panel in a channel.')
        .setDMPermission(false)
        .addChannelOption((opt) => opt.setName('channel').setDescription('Where to post the verify panel.').setRequired(true)),

    async execute(interaction, client) {
        if (!permissions.hasPermission(interaction.user.id)) {
            return interaction.reply({ embeds: [errorEmbed('Access Denied', 'You do not have permission to set up verification.')], ephemeral: true });
        }

        if (!config.verify?.clientSecret || !config.verify?.redirectUri || !config.verify?.roleId) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        'Verify System Not Configured',
                        'Set `DISCORD_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, and `VERIFIED_ROLE_ID` in `.env` (and restart the bot) before using `/setverify`. See `.env.example` for details.'
                    )
                ],
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('channel');
        if (!channel.isTextBased()) {
            return interaction.reply({ embeds: [errorEmbed('Invalid Channel', 'Please choose a text channel.')], ephemeral: true });
        }

        const authorizeUrl =
            `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(config.clientId)}` +
            `&redirect_uri=${encodeURIComponent(config.verify.redirectUri)}` +
            `&response_type=code&scope=identify&state=${encodeURIComponent(interaction.guild.id)}`;

        const embed = applyBranding(
            new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle(`${getEmoji(interaction.guild, 'verify', '✅')} Verify Your Account`)
                .setDescription(
                    "Click **Verify with Discord** below and approve the request on Discord's own authorization page. " +
                        "You'll be given access to the rest of the server as soon as it's approved."
                )
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Verify with Discord').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(authorizeUrl)
        );

        await channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ embeds: [successEmbed('Verify Panel Posted', `The verification panel is live in ${channel}.`)], ephemeral: true });
    }
};
