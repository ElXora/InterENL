/**
 * ticketManager.js
 * -----------------------------------------------------
 * Handles all ticket data persistence:
 *  - tickets.json: one record per ticket channel ever created
 *  - ticketCounter.json: a monotonically increasing ticket number
 *    (never reused, even if old tickets are removed from the list)
 * -----------------------------------------------------
 */

const path = require('path');
const { readJSONSync, writeJSONSync, ensureFileSync } = require('./storage');

const TICKETS_FILE = path.join(__dirname, '..', 'tickets.json');
const COUNTER_FILE = path.join(__dirname, '..', 'ticketCounter.json');

ensureFileSync(TICKETS_FILE, []);
ensureFileSync(COUNTER_FILE, { count: 0 });

/**
 * @typedef {object} TicketRecord
 * @property {string} channelId The ticket's own private channel.
 * @property {string} messageId Welcome message ID, used to edit the Status field later.
 * @property {string} guildId
 * @property {string} panelChannelId Channel the /ticketpanel select menu was posted in.
 * @property {number} ticketNumber
 * @property {string} category Category id (support/partnership/shop).
 * @property {string} categoryLabel Display label.
 * @property {string} createdBy User ID of the ticket creator.
 * @property {string} createdByTag
 * @property {string} createdAt ISO timestamp.
 * @property {'open'|'closed'} status
 * @property {string|null} claimedBy User ID, or null if unclaimed.
 * @property {string|null} claimedByTag
 * @property {string|null} closedBy
 * @property {string|null} closedAt
 */

/**
 * Loads all ticket records.
 * @returns {TicketRecord[]}
 */
function loadTickets() {
    return readJSONSync(TICKETS_FILE, []);
}

/**
 * Persists the full tickets array.
 * @param {TicketRecord[]} tickets
 */
function saveTickets(tickets) {
    writeJSONSync(TICKETS_FILE, tickets);
}

/**
 * Atomically reserves and returns the next ticket number.
 * @returns {number}
 */
function nextTicketNumber() {
    const data = readJSONSync(COUNTER_FILE, { count: 0 });
    const next = (data.count || 0) + 1;
    writeJSONSync(COUNTER_FILE, { count: next });
    return next;
}

/**
 * Creates and persists a new ticket record.
 * @param {Partial<TicketRecord>} fields
 * @returns {TicketRecord}
 */
function createTicket(fields) {
    const tickets = loadTickets();
    const record = {
        channelId: fields.channelId,
        messageId: fields.messageId,
        guildId: fields.guildId,
        panelChannelId: fields.panelChannelId,
        ticketNumber: fields.ticketNumber,
        category: fields.category,
        categoryLabel: fields.categoryLabel,
        createdBy: fields.createdBy,
        createdByTag: fields.createdByTag,
        createdAt: new Date().toISOString(),
        status: 'open',
        claimedBy: null,
        claimedByTag: null,
        closedBy: null,
        closedAt: null
    };

    tickets.push(record);
    saveTickets(tickets);
    return record;
}

/**
 * Finds a ticket record by its channel ID.
 * @param {string} channelId
 * @returns {TicketRecord|null}
 */
function getTicketByChannelId(channelId) {
    return loadTickets().find((t) => t.channelId === channelId) || null;
}

/**
 * Finds an open ticket a user already has in a guild, if any.
 * @param {string} guildId
 * @param {string} userId
 * @returns {TicketRecord|null}
 */
function findOpenTicketForUser(guildId, userId) {
    return loadTickets().find((t) => t.guildId === guildId && t.createdBy === userId && t.status === 'open') || null;
}

/**
 * Marks a ticket as claimed by a staff member.
 * @param {string} channelId
 * @param {string} userId
 * @param {string} userTag
 * @returns {TicketRecord|null}
 */
function claimTicket(channelId, userId, userTag) {
    const tickets = loadTickets();
    const ticket = tickets.find((t) => t.channelId === channelId);
    if (!ticket) return null;

    ticket.claimedBy = userId;
    ticket.claimedByTag = userTag;
    saveTickets(tickets);
    return ticket;
}

/**
 * Marks a ticket as closed.
 * @param {string} channelId
 * @param {string} userId
 * @param {string} userTag
 * @returns {TicketRecord|null}
 */
function closeTicket(channelId, userId, userTag) {
    const tickets = loadTickets();
    const ticket = tickets.find((t) => t.channelId === channelId);
    if (!ticket) return null;

    ticket.status = 'closed';
    ticket.closedBy = userId;
    ticket.closedByTag = userTag;
    ticket.closedAt = new Date().toISOString();
    saveTickets(tickets);
    return ticket;
}

module.exports = {
    loadTickets,
    saveTickets,
    nextTicketNumber,
    createTicket,
    getTicketByChannelId,
    findOpenTicketForUser,
    claimTicket,
    closeTicket
};
