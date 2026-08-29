/**
 * roleResolver.js
 * -----------------------------------------------------
 * Resolves the Staff and Owner roles used by the ticket
 * system. Prefers the role IDs configured via .env
 * (TICKET_STAFF_ROLE_ID / TICKET_OWNER_ROLE_ID) since IDs
 * are unambiguous; falls back to searching by the exact
 * role name configured in config.tickets if no ID is set
 * or the ID no longer resolves to a real role.
 * -----------------------------------------------------
 */

const config = require('../config');
const logger = require('./logger');

/**
 * Resolves a single role by ID (preferred) or name (fallback).
 * @param {import('discord.js').Guild} guild
 * @param {string} roleId Configured role ID, may be empty string.
 * @param {string} roleName Fallback role name to search for.
 * @returns {Promise<import('discord.js').Role|null>}
 */
async function resolveRole(guild, roleId, roleName) {
    if (roleId) {
        const byId = await guild.roles.fetch(roleId).catch(() => null);
        if (byId) return byId;
    }

    const byName = guild.roles.cache.find((r) => r.name === roleName) || null;
    return byName;
}

/**
 * Resolves both the Staff and Owner roles for the ticket system
 * in a given guild. Either may come back null if neither an ID
 * nor a matching name could be found — callers should handle
 * that gracefully (e.g. skip the mention, warn the admin).
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{staffRole: import('discord.js').Role|null, ownerRole: import('discord.js').Role|null}>}
 */
async function resolveTicketRoles(guild) {
    const staffRole = await resolveRole(guild, config.ticketStaffRoleId, config.tickets?.staffRoleName || '🌟┃Staff');
    const ownerRole = await resolveRole(guild, config.ticketOwnerRoleId, config.tickets?.ownerRoleName || '🌟┃Owner');

    if (!staffRole) {
        logger.warn(
            `Ticket system: could not resolve the Staff role in ${guild.name} (tried TICKET_STAFF_ROLE_ID and name "${config.tickets?.staffRoleName}"). Staff won't be pinged on new tickets.`
        );
    }
    if (!ownerRole) {
        logger.warn(
            `Ticket system: could not resolve the Owner role in ${guild.name} (tried TICKET_OWNER_ROLE_ID and name "${config.tickets?.ownerRoleName}"). Owner won't be pinged on new tickets.`
        );
    }

    return { staffRole, ownerRole };
}

/**
 * Checks whether a guild member holds the Staff or Owner ticket
 * role (or is the bot Owner/Admin via the license-bot permission
 * system, which always overrides).
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Role|null} staffRole
 * @param {import('discord.js').Role|null} ownerRole
 * @returns {boolean}
 */
function isTicketStaff(member, staffRole, ownerRole) {
    if (!member) return false;
    if (staffRole && member.roles.cache.has(staffRole.id)) return true;
    if (ownerRole && member.roles.cache.has(ownerRole.id)) return true;
    return false;
}

module.exports = { resolveTicketRoles, isTicketStaff };
