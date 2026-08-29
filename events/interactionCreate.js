/**
 * interactionCreate.js
 * -----------------------------------------------------
 * Routes incoming interactions:
 *  - Slash commands -> matching command's execute()
 *  - The announcement modal submission -> posts the
 *    announcement embed to the configured channel
 * Gracefully handles unknown commands and unexpected errors.
 * -----------------------------------------------------
 */

const logger = require('../utils/logger');
const config = require('../config');
const { errorEmbed, successEmbed, applyBranding } = require('../embeds/embeds');
const { EmbedBuilder, ChannelType } = require('discord.js');
const ticketHandler = require('../handlers/ticketHandler');
const { replaceEmojiShortcodes } = require('../utils/emojiResolver');
const { extractMentions, ALLOW_ALL_MENTIONS } = require('../utils/mentionHelper');

/**
 * Sends an error reply for a failed interaction handler, replying
 * or editing depending on whether the interaction was already
 * acknowledged.
 * @param {import('discord.js').Interaction} interaction
 * @param {string} title
 * @param {string} message
 */
async function safeErrorReply(interaction, title, message) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed(title, message)] });
        } else {
            await interaction.reply({ embeds: [errorEmbed(title, message)], ephemeral: true });
        }
    } catch (err) {
        logger.error('Failed to send error reply to interaction.', err);
    }
}

/**
 * Handles the announcement modal submission: builds the embed
 * and posts it to config.announceChannelId.
 *
 * This defers immediately (ephemeral) so the confirmation/error
 * reply is only visible to the admin who submitted it, and so
 * the channel fetch + message send can't time out the interaction.
 * If the channel can't be reached, the error message explains
 * exactly why (wrong ID vs. missing permissions vs. not a text
 * channel) instead of a generic failure.
 *
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleAnnounceModal(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const title = replaceEmojiShortcodes(interaction.fields.getTextInputValue('announce_title'), interaction.guild);
    const message = replaceEmojiShortcodes(interaction.fields.getTextInputValue('announce_message'), interaction.guild);
    const imageUrl = interaction.fields.getTextInputValue('announce_image')?.trim();

    const channelId = config.announceChannelId;

    if (!channelId) {
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    'Announcement Channel Not Configured',
                    'No announcement channel is set. Add `ANNOUNCE_CHANNEL_ID=<channel id>` to your `.env` file and restart the bot.'
                )
            ]
        });
    }

    let channel;
    try {
        channel = await client.channels.fetch(channelId);
    } catch (err) {
        // Discord's REST API gives a specific, useful error code/message here —
        // surface it directly instead of a generic "not found".
        let reason = err.message || 'Unknown error.';
        if (err.code === 10003) {
            reason = `Discord says this channel doesn't exist (\`Unknown Channel\`). Double-check the ID \`${channelId}\` is correct — right-click the channel in Discord (with Developer Mode on) and "Copy Channel ID".`;
        } else if (err.code === 50001) {
            reason = `The bot doesn't have access to this channel (\`Missing Access\`). Make sure the bot's role can view channel \`${channelId}\`.`;
        }

        return interaction.editReply({
            embeds: [
                errorEmbed(
                    'Announcement Failed',
                    `Could not reach the configured announcement channel (\`${channelId}\`).\n\n**Reason:** ${reason}\n\nYou can fix this by updating \`ANNOUNCE_CHANNEL_ID\` in your \`.env\` file and restarting the bot.`
                )
            ]
        });
    }

    if (!channel) {
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    'Announcement Failed',
                    `Channel \`${channelId}\` could not be found. Update \`ANNOUNCE_CHANNEL_ID\` in your \`.env\` file and restart the bot.`
                )
            ]
        });
    }

    const textLikeTypes = [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread
    ];

    if (!textLikeTypes.includes(channel.type)) {
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    'Announcement Failed',
                    `Channel \`${channelId}\` (${channel.name || 'unknown'}) isn't a text channel the bot can post in. Point \`ANNOUNCE_CHANNEL_ID\` at a text/announcement channel.`
                )
            ]
        });
    }

    const permissionsForBot = channel.permissionsFor(client.user);
    if (permissionsForBot && !permissionsForBot.has('SendMessages')) {
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    'Announcement Failed',
                    `The bot doesn't have permission to send messages in <#${channelId}>. Grant it "Send Messages" in that channel and try again.`
                )
            ]
        });
    }

    const embed = applyBranding(
        new EmbedBuilder().setColor(config.colors.primary).setTitle(`📢 ${title}`).setDescription(message)
    );

    if (imageUrl) {
        try {
            embed.setImage(imageUrl);
        } catch (err) {
            // Invalid URL — ignore the image, still post the announcement.
        }
    }

    // Discord never turns @everyone/@here/@role/@user into a real,
    // notifying ping when it's only inside an embed — it just shows
    // as flat text. Pull any real mention tokens out of the title +
    // message and send them in the message `content` (outside the
    // embed) so they actually notify people, same visual announcement.
    const pingContent = extractMentions(`${title} ${message}`);

    try {
        await channel.send({
            content: pingContent || undefined,
            embeds: [embed],
            allowedMentions: pingContent ? ALLOW_ALL_MENTIONS : undefined
        });
    } catch (err) {
        return interaction.editReply({
            embeds: [errorEmbed('Announcement Failed', `Discord rejected the message: ${err.message}`)]
        });
    }

    logger.logAction(client, {
        action: 'ANNOUNCE',
        admin: interaction.user.tag,
        target: `#${channel.name || channel.id}`,
        details: title
    });

    return interaction.editReply({
        embeds: [successEmbed('Announcement Posted', `Your announcement has been posted in <#${channelId}>.`)]
    });
}

module.exports = {
    name: 'interactionCreate',
    once: false,

    /**
     * @param {import('discord.js').Interaction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, client) {
        // ---------------- Ticket system: category select menu ----------------
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
            try {
                await ticketHandler.handleCategorySelect(interaction, client);
            } catch (err) {
                logger.error('Error handling ticket category selection.', err);
                await safeErrorReply(interaction, 'Something Went Wrong', `Could not create your ticket: ${err.message}`);
            }
            return;
        }

        // ---------------- Ticket system: buttons ----------------
        if (interaction.isButton() && ['ticket_close', 'ticket_claim', 'ticket_adduser'].includes(interaction.customId)) {
            try {
                if (interaction.customId === 'ticket_close') await ticketHandler.handleCloseButton(interaction, client);
                if (interaction.customId === 'ticket_claim') await ticketHandler.handleClaimButton(interaction, client);
                if (interaction.customId === 'ticket_adduser') await ticketHandler.handleAddUserButton(interaction);
            } catch (err) {
                logger.error(`Error handling ticket button ${interaction.customId}.`, err);
                await safeErrorReply(interaction, 'Something Went Wrong', `Could not complete that action: ${err.message}`);
            }
            return;
        }

        // ---------------- Ticket system: "Add User" picker ----------------
        if (interaction.isUserSelectMenu() && interaction.customId === 'ticket_adduser_select') {
            try {
                await ticketHandler.handleAddUserSelect(interaction, client);
            } catch (err) {
                logger.error('Error handling ticket add-user selection.', err);
                await safeErrorReply(interaction, 'Something Went Wrong', `Could not add that user: ${err.message}`);
            }
            return;
        }

        // ---------------- Giveaway system: "Enter Giveaway" button ----------------
        // Global routing (unlike the short-lived mini-game button collectors)
        // because a giveaway panel can stay live for days and must keep
        // working across bot restarts.
        if (interaction.isButton() && interaction.customId === 'giveaway_enter') {
            try {
                const giveawayManager = require('../utils/giveawayManager');
                const progressionManager = require('../utils/progressionManager');
                const { computeLevel } = progressionManager;
                const { buildGiveawayPanelEmbed } = require('../embeds/giveawayEmbeds');

                const giveaway = giveawayManager.getGiveawayByMessageId(interaction.message.id);

                if (!giveaway || giveaway.status !== 'active') {
                    return interaction.reply({ content: '❌ This giveaway is no longer active.', ephemeral: true });
                }

                if (giveaway.minLevel) {
                    const progressionUser = progressionManager.getOrCreateUser(interaction.user.id, interaction.user.tag);
                    const { level } = computeLevel(progressionUser.xp);
                    if (level < giveaway.minLevel) {
                        return interaction.reply({ content: `❌ You need to be **Level ${giveaway.minLevel}+** to enter (you're Level ${level}).`, ephemeral: true });
                    }
                }

                if (giveaway.requiredRoleId && !interaction.member.roles.cache.has(giveaway.requiredRoleId)) {
                    return interaction.reply({ content: `❌ You need the <@&${giveaway.requiredRoleId}> role to enter.`, ephemeral: true });
                }

                const entered = giveawayManager.addEntry(giveaway.id, interaction.user.id);
                if (!entered) {
                    return interaction.reply({ content: '⚠️ You have already entered this giveaway.', ephemeral: true });
                }

                progressionManager.recordGiveawayEntry(interaction.user.id, interaction.user.tag);

                const refreshed = giveawayManager.getGiveaway(giveaway.id);
                await interaction.update({ embeds: [buildGiveawayPanelEmbed(refreshed)] });
                await interaction.followUp({ content: '🎉 You entered the giveaway! Good luck!', ephemeral: true });
            } catch (err) {
                logger.error('Error handling giveaway entry.', err);
                await safeErrorReply(interaction, 'Something Went Wrong', `Could not enter the giveaway: ${err.message}`);
            }
            return;
        }

        // ---------------- Modal submissions ----------------
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'announce_modal') {
                try {
                    await handleAnnounceModal(interaction, client);
                } catch (err) {
                    logger.error('Error handling announcement modal submission.', err);
                    await safeErrorReply(interaction, 'Something Went Wrong', `Could not post the announcement: ${err.message}`);
                }
            }
            return;
        }

        // ---------------- Slash commands ----------------
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            logger.warn(`Received interaction for unknown command: /${interaction.commandName}`);
            return interaction.reply({
                embeds: [errorEmbed('Unknown Command', 'This command no longer exists or failed to load.')],
                ephemeral: true
            });
        }

        try {
            await command.execute(interaction, client);
        } catch (err) {
            logger.error(`Error executing command /${interaction.commandName}`, err);
            await safeErrorReply(
                interaction,
                'Something Went Wrong',
                `An unexpected error occurred while running this command: ${err.message}`
            );
        }
    }
};
