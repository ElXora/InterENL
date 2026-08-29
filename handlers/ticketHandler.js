/**
 * ticketHandler.js
 * -----------------------------------------------------
 * Core ticket system logic:
 *  - Category select menu -> creates a private CHANNEL ticket
 *  - "Close Ticket" button -> closes + deletes the channel
 *  - "Claim Ticket" button -> assigns a staff member (optional)
 *  - "Add User" button -> shows a user-picker, adds them to the channel
 *
 * WHY CHANNELS, NOT THREADS: Discord private threads have no
 * per-member permission system — "can view" is controlled by
 * thread membership, but "can SEND messages" is controlled by
 * the PARENT channel's Send-Messages-in-Threads permission, which
 * thread membership cannot override. If that permission is denied
 * for @everyone on the parent channel (common for a locked-down
 * ticket-panel channel), even a thread member who was successfully
 * added is silently unable to type — indistinguishable from a bug.
 * A real private channel with its own permissionOverwrites gives
 * exact, reliable control over exactly who can view/type: the
 * creator, Staff, Owner, and nobody else.
 * -----------------------------------------------------
 */

const {
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    UserSelectMenuBuilder,
    PermissionFlagsBits
} = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const permissions = require('../utils/permissions');
const ticketManager = require('../utils/ticketManager');
const { resolveTicketRoles, isTicketStaff } = require('../utils/roleResolver');
const { successEmbed, errorEmbed } = require('../embeds/embeds');
const { buildTicketWelcomeEmbed } = require('../embeds/ticketEmbeds');

/**
 * Builds the Close / Claim / Add User button row shown in every
 * ticket channel's welcome message.
 * @returns {ActionRowBuilder}
 */
function buildTicketButtonsRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('🙋'),
        new ButtonBuilder().setCustomId('ticket_adduser').setLabel('Add User').setStyle(ButtonStyle.Secondary).setEmoji('➕')
    );
}

/**
 * Checks whether the interacting member is allowed to manage a
 * ticket (claim / add users): Staff role, Owner role, or the bot's
 * own Owner/Admin permission system.
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Role|null} staffRole
 * @param {import('discord.js').Role|null} ownerRole
 * @returns {boolean}
 */
function canManageTicket(member, staffRole, ownerRole) {
    return isTicketStaff(member, staffRole, ownerRole) || permissions.hasPermission(member.id);
}

/**
 * The exact permission overwrites for a fresh ticket channel:
 * @everyone denied View entirely; the creator, Staff role, and
 * Owner role each explicitly granted View + Send + Read History
 * (+ Manage Messages for Staff/Owner so they can moderate the ticket).
 * @param {import('discord.js').Guild} guild
 * @param {string} creatorId
 * @param {import('discord.js').Role|null} staffRole
 * @param {import('discord.js').Role|null} ownerRole
 * @returns {Array<object>}
 */
function buildTicketPermissionOverwrites(guild, creatorId, staffRole, ownerRole) {
    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: creatorId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        },
        {
            id: guild.members.me.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages
            ]
        }
    ];

    for (const role of [staffRole, ownerRole]) {
        if (!role) continue;
        overwrites.push({
            id: role.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages
            ]
        });
    }

    return overwrites;
}

/**
 * Handles a category selection from the ticket panel: creates a
 * new private channel, grants the creator + Staff/Owner explicit
 * permissions, pings them, and posts the welcome message with
 * the ticket control buttons.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleCategorySelect(interaction, client) {
    if (config.tickets?.enabled === false) {
        return interaction.reply({
            embeds: [errorEmbed('Tickets Disabled', 'The ticket system is currently disabled.')],
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const categoryId = interaction.values[0];
    const categories = config.tickets?.categories || [];
    const category = categories.find((c) => c.id === categoryId);

    if (!category) {
        return interaction.editReply({
            embeds: [errorEmbed('Unknown Category', 'That ticket category no longer exists.')]
        });
    }

    // Prevent duplicate open tickets from the same user.
    const existing = ticketManager.findOpenTicketForUser(interaction.guild.id, interaction.user.id);
    if (existing) {
        const stillExists = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
        if (stillExists) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        'Ticket Already Open',
                        `You already have an open ticket: <#${existing.channelId}>. Please use that one, or close it before opening a new ticket.`
                    )
                ]
            });
        }
    }

    const { staffRole, ownerRole } = await resolveTicketRoles(interaction.guild);
    const ticketNumber = ticketManager.nextTicketNumber();
    const channelName = `ticket-${ticketNumber}-${category.id}`;

    let channel;
    try {
        channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: interaction.channel.parentId || undefined,
            topic: `Ticket #${ticketNumber} — ${category.label} — opened by ${interaction.user.tag} (${interaction.user.id})`,
            permissionOverwrites: buildTicketPermissionOverwrites(interaction.guild, interaction.user.id, staffRole, ownerRole),
            reason: `Ticket #${ticketNumber} opened by ${interaction.user.tag}`
        });
    } catch (err) {
        logger.error('Failed to create ticket channel.', err);
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    'Could Not Create Ticket',
                    `Discord wouldn't let me create the ticket channel: ${err.message}\n\nThis usually means the bot is missing the "Manage Channels" permission, or the panel's category already has the maximum 50 channels.`
                )
            ]
        });
    }

    const ticket = ticketManager.createTicket({
        channelId: channel.id,
        messageId: null,
        guildId: interaction.guild.id,
        panelChannelId: interaction.channel.id,
        ticketNumber,
        category: category.id,
        categoryLabel: category.label,
        createdBy: interaction.user.id,
        createdByTag: interaction.user.tag
    });

    const mentions = [`<@${interaction.user.id}>`];
    if (staffRole) mentions.push(`<@&${staffRole.id}>`);
    if (ownerRole) mentions.push(`<@&${ownerRole.id}>`);

    let welcomeMessage;
    try {
        welcomeMessage = await channel.send({
            content: mentions.join(' '),
            embeds: [buildTicketWelcomeEmbed(ticket)],
            components: [buildTicketButtonsRow()]
        });
    } catch (err) {
        logger.error(`Failed to send welcome message in ticket channel ${channel.id}.`, err);
    }

    if (welcomeMessage) {
        const tickets = ticketManager.loadTickets();
        const record = tickets.find((t) => t.channelId === channel.id);
        if (record) {
            record.messageId = welcomeMessage.id;
            ticketManager.saveTickets(tickets);
        }
    }

    logger.logAction(client, {
        action: 'TICKET_OPEN',
        admin: interaction.user.tag,
        target: `Ticket #${ticketNumber}`,
        details: `Category: ${category.label}`
    });

    return interaction.editReply({
        embeds: [successEmbed('Ticket Created', `Your ticket has been created: <#${channel.id}>`)]
    });
}

/**
 * Re-fetches a ticket's welcome message and edits it to reflect
 * the current Status field (used after claim/close).
 * @param {import('discord.js').Client} client
 * @param {import('../utils/ticketManager').TicketRecord} ticket
 */
async function refreshWelcomeEmbed(client, ticket) {
    if (!ticket.messageId) return;

    try {
        const channel = await client.channels.fetch(ticket.channelId);
        const message = await channel.messages.fetch(ticket.messageId);
        await message.edit({ embeds: [buildTicketWelcomeEmbed(ticket)] });
    } catch (err) {
        // Non-fatal — the welcome message or channel may have been deleted manually.
    }
}

/**
 * Handles the "Close Ticket" button: allowed for the ticket
 * creator, Staff/Owner, or bot Owner/Admin. Marks the ticket
 * closed, then deletes the channel after a short delay.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleCloseButton(interaction, client) {
    const ticket = ticketManager.getTicketByChannelId(interaction.channel.id);

    if (!ticket) {
        return interaction.reply({
            embeds: [errorEmbed('Not a Ticket', "This doesn't look like a recognized ticket channel.")],
            ephemeral: true
        });
    }

    const { staffRole, ownerRole } = await resolveTicketRoles(interaction.guild);
    const isCreator = interaction.user.id === ticket.createdBy;
    const isManager = canManageTicket(interaction.member, staffRole, ownerRole);

    if (!isCreator && !isManager) {
        return interaction.reply({
            embeds: [errorEmbed('Access Denied', 'Only the ticket creator or staff can close this ticket.')],
            ephemeral: true
        });
    }

    ticketManager.closeTicket(ticket.channelId, interaction.user.id, interaction.user.tag);

    logger.logAction(client, {
        action: 'TICKET_CLOSE',
        admin: interaction.user.tag,
        target: `Ticket #${ticket.ticketNumber}`,
        details: `Created by ${ticket.createdByTag}`
    });

    const closeDelaySeconds = config.tickets?.closeDelaySeconds ?? 5;

    await interaction.reply({
        embeds: [
            successEmbed(
                '🔒 Ticket Closing',
                `This ticket was closed by ${interaction.user}. Deleting this channel in ${closeDelaySeconds} second(s)...`
            )
        ]
    });

    setTimeout(async () => {
        try {
            const channel = await client.channels.fetch(ticket.channelId);
            await channel.delete(`Ticket #${ticket.ticketNumber} closed by ${interaction.user.tag}`);
        } catch (err) {
            logger.warn(`Could not delete ticket channel ${ticket.channelId}: ${err.message}`);
        }
    }, closeDelaySeconds * 1000);
}

/**
 * Handles the "Claim Ticket" button: Staff/Owner/bot Admin only.
 * Optional — nothing requires a ticket to be claimed.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleClaimButton(interaction, client) {
    const ticket = ticketManager.getTicketByChannelId(interaction.channel.id);

    if (!ticket) {
        return interaction.reply({
            embeds: [errorEmbed('Not a Ticket', "This doesn't look like a recognized ticket channel.")],
            ephemeral: true
        });
    }

    const { staffRole, ownerRole } = await resolveTicketRoles(interaction.guild);

    if (!canManageTicket(interaction.member, staffRole, ownerRole)) {
        return interaction.reply({
            embeds: [errorEmbed('Access Denied', 'Only staff can claim tickets.')],
            ephemeral: true
        });
    }

    if (ticket.claimedBy) {
        return interaction.reply({
            embeds: [errorEmbed('Already Claimed', `This ticket is already claimed by <@${ticket.claimedBy}>.`)],
            ephemeral: true
        });
    }

    const updated = ticketManager.claimTicket(ticket.channelId, interaction.user.id, interaction.user.tag);
    await refreshWelcomeEmbed(client, updated);

    logger.logAction(client, {
        action: 'TICKET_CLAIM',
        admin: interaction.user.tag,
        target: `Ticket #${ticket.ticketNumber}`
    });

    return interaction.reply({
        embeds: [successEmbed('🙋 Ticket Claimed', `${interaction.user} is now handling this ticket.`)]
    });
}

/**
 * Handles the "Add User" button: Staff/Owner/bot Admin only.
 * Replies with an ephemeral user-picker; the actual addition
 * happens in handleAddUserSelect once they pick someone.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleAddUserButton(interaction) {
    const ticket = ticketManager.getTicketByChannelId(interaction.channel.id);

    if (!ticket) {
        return interaction.reply({
            embeds: [errorEmbed('Not a Ticket', "This doesn't look like a recognized ticket channel.")],
            ephemeral: true
        });
    }

    const { staffRole, ownerRole } = await resolveTicketRoles(interaction.guild);

    if (!canManageTicket(interaction.member, staffRole, ownerRole)) {
        return interaction.reply({
            embeds: [errorEmbed('Access Denied', 'Only staff can add users to a ticket.')],
            ephemeral: true
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId('ticket_adduser_select')
            .setPlaceholder('Select a user to add to this ticket')
            .setMinValues(1)
            .setMaxValues(1)
    );

    return interaction.reply({
        content: 'Who would you like to add to this ticket?',
        components: [row],
        ephemeral: true
    });
}

/**
 * Handles the user-select follow-up from "Add User": grants the
 * chosen member View + Send permission on the channel and posts
 * a confirmation.
 * @param {import('discord.js').UserSelectMenuInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleAddUserSelect(interaction, client) {
    const ticket = ticketManager.getTicketByChannelId(interaction.channel.id);

    if (!ticket) {
        return interaction.update({
            content: "This doesn't look like a recognized ticket channel anymore.",
            components: []
        });
    }

    const selectedUserId = interaction.values[0];

    try {
        const channel = await client.channels.fetch(ticket.channelId);
        await channel.permissionOverwrites.edit(selectedUserId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        });
        await channel.send({ content: `➕ <@${selectedUserId}> was added to this ticket by ${interaction.user}.` });
    } catch (err) {
        return interaction.update({
            content: `Could not add that user: ${err.message}`,
            components: []
        });
    }

    logger.logAction(client, {
        action: 'TICKET_ADD_USER',
        admin: interaction.user.tag,
        target: `Ticket #${ticket.ticketNumber}`,
        details: `Added user ${selectedUserId}`
    });

    return interaction.update({
        content: `✅ Added <@${selectedUserId}> to the ticket.`,
        components: []
    });
}

module.exports = {
    buildTicketButtonsRow,
    handleCategorySelect,
    handleCloseButton,
    handleClaimButton,
    handleAddUserButton,
    handleAddUserSelect
};
