/**
 * inviteTracker.js
 * -----------------------------------------------------
 * Maintains an in-memory cache of every invite code's use
 * count per guild, and diffs it against the latest state on
 * every member join to work out which invite (and therefore
 * which inviter) brought them in — the same technique every
 * "invite tracker" bot uses, since Discord doesn't tell you
 * directly which invite a new member used.
 *
 * The cache itself is rebuilt from the live Discord API on
 * every boot (primeInviteCache, called from ready.js) rather
 * than persisted — invite use-counts can change while the bot
 * is offline, so a fresh fetch is more reliable than a stale
 * cache. What DOES persist is the result of each join/leave
 * (utils/inviteManager.js) — that's the actual stats.
 * -----------------------------------------------------
 */

const config = require('../config');
const logger = require('../utils/logger');
const inviteManager = require('../utils/inviteManager');

/** @type {Map<string, Map<string, {uses: number, inviterId: string|null, inviterTag: string|null}>>} guildId -> code -> info */
const guildInviteCaches = new Map();

/**
 * Fetches and caches every invite's current use count for a guild.
 * Call once on boot (per guild) and again after any join, so the
 * cache always reflects reality even if fetching mid-diff races
 * with another join.
 * @param {import('discord.js').Guild} guild
 */
async function primeInviteCache(guild) {
    try {
        const invites = await guild.invites.fetch();
        const cache = new Map();
        for (const invite of invites.values()) {
            cache.set(invite.code, {
                uses: invite.uses || 0,
                inviterId: invite.inviter?.id || null,
                inviterTag: invite.inviter?.tag || null
            });
        }
        guildInviteCaches.set(guild.id, cache);
        logger.info(`Invite tracker: cached ${cache.size} invite(s) for ${guild.name}.`);
    } catch (err) {
        logger.warn(`Invite tracker: could not fetch invites for ${guild.name} (needs Manage Server permission): ${err.message}`);
    }
}

/**
 * @param {import('discord.js').Invite} invite
 */
function handleInviteCreate(invite) {
    const cache = guildInviteCaches.get(invite.guild?.id);
    if (!cache) return;
    cache.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null,
        inviterTag: invite.inviter?.tag || null
    });
}

/**
 * @param {import('discord.js').Invite} invite
 */
function handleInviteDelete(invite) {
    const cache = guildInviteCaches.get(invite.guild?.id);
    if (!cache) return;
    cache.delete(invite.code);
}

/**
 * Diffs the current invite states against the cache to find which
 * code's use count went up (that's the invite the new member used),
 * updates the cache, and records the join via inviteManager.
 * @param {import('discord.js').GuildMember} member
 */
async function handleMemberAdd(member) {
    const guild = member.guild;
    const cache = guildInviteCaches.get(guild.id) || new Map();

    let usedCode = null;
    let inviterId = null;
    let inviterTag = null;

    try {
        const freshInvites = await guild.invites.fetch();

        for (const invite of freshInvites.values()) {
            const cached = cache.get(invite.code);
            const previousUses = cached ? cached.uses : 0;
            if ((invite.uses || 0) > previousUses) {
                usedCode = invite.code;
                inviterId = invite.inviter?.id || null;
                inviterTag = invite.inviter?.tag || null;
                break;
            }
        }

        // Rebuild the cache from this fresh fetch regardless of whether we
        // found the match, so it's accurate for the next join.
        const newCache = new Map();
        for (const invite of freshInvites.values()) {
            newCache.set(invite.code, { uses: invite.uses || 0, inviterId: invite.inviter?.id || null, inviterTag: invite.inviter?.tag || null });
        }
        guildInviteCaches.set(guild.id, newCache);
    } catch (err) {
        logger.warn(`Invite tracker: could not diff invites on join for ${guild.name}: ${err.message}`);
    }

    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86400000;
    const fakeThresholdDays = config.invites?.fakeAccountAgeDays ?? 7;

    const { isFake, isRejoin } = inviteManager.recordJoin({
        memberId: member.id,
        memberTag: member.user.tag,
        inviterId,
        inviterTag,
        code: usedCode,
        accountAgeDays,
        fakeThresholdDays
    });

    return { usedCode, inviterId, inviterTag, isFake, isRejoin };
}

/**
 * @param {import('discord.js').GuildMember} member
 */
function handleMemberRemove(member) {
    inviteManager.recordLeave(member.id);
}

module.exports = { primeInviteCache, handleInviteCreate, handleInviteDelete, handleMemberAdd, handleMemberRemove };
