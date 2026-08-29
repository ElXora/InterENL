/**
 * muteManager.js
 * -----------------------------------------------------
 * Handles everything related to muting members:
 *  - Finding or creating the configured "Muted" role
 *  - Applying per-channel overwrites so Muted can't send
 *    messages or speak, without needing Discord's native
 *    timeout system (works alongside it, or standalone)
 *  - Scheduling automatic unmute after a duration
 *  - Persisting active mutes to disk so they survive restarts
 *
 * IMPORTANT FIX: the previous version looked up the Muted role
 * by NAME every time (`guild.roles.cache.find(r => r.name === ...)`)
 * and silently swallowed any error when removing it
 * (`.catch(() => {})`). That combination meant that if the role
 * lookup ever resolved to the wrong role (e.g. a duplicate-named
 * role, or the role got renamed) — or if the bot simply lacked
 * permission/hierarchy to remove it — /unmute would report
 * success while the member stayed muted, with zero indication
 * anything went wrong.
 *
 * This version persists the exact role ID per guild (muteRoles.json)
 * so lookups are unambiguous, verifies the bot can actually manage
 * the role before attempting anything, and — critically — re-fetches
 * the member after removal to CONFIRM the role is actually gone
 * before reporting success. If it's not gone, it throws a clear,
 * actionable error instead of failing silently.
 * -----------------------------------------------------
 */

const { PermissionFlagsBits } = require('discord.js');
const { readJSONSync, writeJSONSync, ensureFileSync } = require('./storage');
const path = require('path');
const config = require('../config');
const logger = require('./logger');

const MUTES_FILE = path.join(__dirname, '..', 'mutes.json');
const MUTE_ROLES_FILE = path.join(__dirname, '..', 'muteRoles.json');
ensureFileSync(MUTES_FILE, []);
ensureFileSync(MUTE_ROLES_FILE, {});

const scheduledTimers = new Map(); // key: `${guildId}-${userId}` -> Timeout

/**
 * Loads all persisted active mutes.
 * @returns {Array<{guildId: string, userId: string, expiresAt: string|null, reason: string}>}
 */
function loadMutes() {
    return readJSONSync(MUTES_FILE, []);
}

/**
 * Persists the mutes array to disk.
 * @param {Array<object>} mutes
 */
function saveMutes(mutes) {
    writeJSONSync(MUTES_FILE, mutes);
}

/**
 * Loads the persisted guildId -> muteRoleId map.
 * @returns {Object<string, string>}
 */
function loadMuteRoleMap() {
    return readJSONSync(MUTE_ROLES_FILE, {});
}

/**
 * Persists the guildId -> muteRoleId map.
 * @param {Object<string, string>} map
 */
function saveMuteRoleMap(map) {
    writeJSONSync(MUTE_ROLES_FILE, map);
}

/**
 * Checks whether the bot can actually add/remove the given role —
 * i.e. it has Manage Roles AND the role sits below the bot's
 * highest role in the hierarchy. Throws a clear, actionable error
 * if not, instead of letting a Discord API call fail silently later.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Role} role
 */
function assertBotCanManageRole(guild, role) {
    const botMember = guild.members.me;

    if (!botMember) {
        throw new Error('Could not resolve the bot\'s own member object in this server.');
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error('I don\'t have the "Manage Roles" permission in this server.');
    }

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
        throw new Error(
            `My highest role is at or below the "${role.name}" role in the role list. ` +
                `Go to Server Settings → Roles and drag my bot's role ABOVE "${role.name}", then try again.`
        );
    }
}

/**
 * Finds the guild's Muted role using the persisted role-ID map
 * (unambiguous), falling back to a name search only if nothing
 * is persisted yet (e.g. upgrading from an older version of the
 * bot, or a role was created manually before /mute was ever used).
 * Does NOT create a role if none exists — use getOrCreateMuteRole
 * for that. Returns null if no mute role exists yet.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').Role|null>}
 */
async function getExistingMuteRole(guild) {
    const map = loadMuteRoleMap();
    const storedId = map[guild.id];

    if (storedId) {
        const role = await guild.roles.fetch(storedId).catch(() => null);
        if (role) return role;
        // Stored ID is stale (role was deleted) — fall through to name search.
    }

    const roleName = config.moderation?.muteRoleName || 'Muted';
    const role = guild.roles.cache.find((r) => r.name === roleName) || null;

    if (role) {
        // Persist it now so future lookups are unambiguous.
        map[guild.id] = role.id;
        saveMuteRoleMap(map);
    }

    return role;
}

/**
 * Finds the configured Muted role in a guild, creating it
 * (with sensible channel overwrites) if it doesn't exist yet.
 * The resulting role ID is persisted per-guild so every future
 * mute/unmute unambiguously targets the exact same role.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').Role>}
 */
async function getOrCreateMuteRole(guild) {
    const existing = await getExistingMuteRole(guild);
    if (existing) return existing;

    const roleName = config.moderation?.muteRoleName || 'Muted';

    const role = await guild.roles.create({
        name: roleName,
        color: 0x2c2f33,
        permissions: [],
        reason: 'InterENL Store Bot: auto-created mute role'
    });

    // Best-effort: position the new role just below the bot's own
    // highest role, so the bot can reliably add/remove it later.
    // Wrapped in try/catch — if this fails, assertBotCanManageRole()
    // will still catch and clearly report any resulting hierarchy
    // problem the next time the role is used.
    try {
        const botMember = guild.members.me;
        if (botMember) {
            const targetPosition = Math.max(1, botMember.roles.highest.position - 1);
            await role.setPosition(targetPosition);
        }
    } catch (err) {
        logger.warn(`Could not auto-position the new Muted role in ${guild.name}: ${err.message}`);
    }

    // Apply deny overwrites across all existing channels.
    const channels = guild.channels.cache;
    for (const [, channel] of channels) {
        try {
            if (channel.isTextBased()) {
                await channel.permissionOverwrites.edit(role, {
                    SendMessages: false,
                    AddReactions: false,
                    Speak: false
                });
            } else if (channel.isVoiceBased?.()) {
                await channel.permissionOverwrites.edit(role, { Speak: false, Connect: false });
            }
        } catch (err) {
            // Non-fatal — bot may lack permission in a specific channel.
        }
    }

    const map = loadMuteRoleMap();
    map[guild.id] = role.id;
    saveMuteRoleMap(map);

    return role;
}

/**
 * Mutes a guild member for a given duration (or indefinitely if
 * durationMinutes is null), applying the Muted role and scheduling
 * an automatic unmute. Throws a descriptive error if the role
 * couldn't actually be applied (permission/hierarchy issue) instead
 * of failing silently.
 * @param {import('discord.js').GuildMember} member
 * @param {number|null} durationMinutes Minutes until auto-unmute, or null for indefinite.
 * @param {string} reason
 * @param {import('discord.js').Client} client
 */
async function muteMember(member, durationMinutes, reason, client) {
    const role = await getOrCreateMuteRole(member.guild);
    assertBotCanManageRole(member.guild, role);

    await member.roles.add(role.id, reason);

    const expiresAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60000).toISOString() : null;

    const mutes = loadMutes();
    const filtered = mutes.filter((m) => !(m.guildId === member.guild.id && m.userId === member.id));
    filtered.push({ guildId: member.guild.id, userId: member.id, expiresAt, reason });
    saveMutes(filtered);

    if (durationMinutes) {
        scheduleUnmute(member.guild.id, member.id, durationMinutes * 60000, client);
    }
}

/**
 * Removes the Muted role from a member and clears any persisted
 * record. Verifies via a fresh member fetch that the role is
 * actually gone before reporting success — if it's still present
 * (e.g. a hierarchy/permission issue), throws a clear, actionable
 * error instead of pretending it worked.
 * @param {import('discord.js').GuildMember} member
 * @param {string} [reason]
 */
async function unmuteMember(member, reason = 'Mute duration expired') {
    const role = await getExistingMuteRole(member.guild);

    if (role) {
        assertBotCanManageRole(member.guild, role);

        // Always attempt removal — Discord's API is idempotent if the
        // member doesn't actually have the role, so there's no need
        // (and no benefit) to pre-check the member's cached roles first.
        await member.roles.remove(role.id, reason);

        // Verify it actually happened. member.roles.cache can be stale
        // immediately after a mutation in rare cases, so re-fetch fresh
        // from the API rather than trusting the local cache.
        const freshMember = await member.guild.members.fetch({ user: member.id, force: true });
        if (freshMember.roles.cache.has(role.id)) {
            throw new Error(
                `Discord still shows this member with the "${role.name}" role after attempting removal. ` +
                    `This usually means another role/permission is re-applying it, or there's a hierarchy issue. ` +
                    `Check Server Settings → Roles and any other bots that might be managing this role.`
            );
        }
    }

    const key = `${member.guild.id}-${member.id}`;
    if (scheduledTimers.has(key)) {
        clearTimeout(scheduledTimers.get(key));
        scheduledTimers.delete(key);
    }

    const mutes = loadMutes().filter((m) => !(m.guildId === member.guild.id && m.userId === member.id));
    saveMutes(mutes);
}

/**
 * Schedules an in-memory timer to auto-unmute a member after msDelay.
 * @param {string} guildId
 * @param {string} userId
 * @param {number} msDelay
 * @param {import('discord.js').Client} client
 */
function scheduleUnmute(guildId, userId, msDelay, client) {
    const key = `${guildId}-${userId}`;
    if (scheduledTimers.has(key)) clearTimeout(scheduledTimers.get(key));

    const timer = setTimeout(async () => {
        try {
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            await unmuteMember(member);
            logger.logAction(client, {
                action: 'AUTO_UNMUTE',
                admin: 'SYSTEM',
                target: `${member.user.tag} (${userId})`,
                details: 'Mute duration expired'
            });
        } catch (err) {
            // Member may have left the guild, or the role couldn't be
            // removed (permission/hierarchy) — log it so it's visible
            // instead of silently vanishing.
            logger.warn(`Auto-unmute failed for user ${userId} in guild ${guildId}: ${err.message}`);
        }
        scheduledTimers.delete(key);
    }, msDelay);

    scheduledTimers.set(key, timer);
}

/**
 * Rehydrates all scheduled unmutes from disk on bot startup —
 * ensures mutes still expire correctly even after a restart.
 * @param {import('discord.js').Client} client
 */
function rehydrateMutes(client) {
    const mutes = loadMutes();
    const now = Date.now();

    for (const mute of mutes) {
        if (!mute.expiresAt) continue; // indefinite mute, nothing to schedule

        const remaining = new Date(mute.expiresAt).getTime() - now;

        if (remaining <= 0) {
            // Already expired while bot was offline — unmute immediately.
            (async () => {
                try {
                    const guild = await client.guilds.fetch(mute.guildId);
                    const member = await guild.members.fetch(mute.userId);
                    await unmuteMember(member);
                } catch (err) {
                    logger.warn(`Startup catch-up unmute failed for user ${mute.userId} in guild ${mute.guildId}: ${err.message}`);
                }
            })();
        } else {
            scheduleUnmute(mute.guildId, mute.userId, remaining, client);
        }
    }

    logger.info(`Rehydrated ${mutes.length} persisted mute(s) from disk.`);
}

module.exports = {
    getOrCreateMuteRole,
    getExistingMuteRole,
    muteMember,
    unmuteMember,
    rehydrateMutes,
    loadMutes
};
