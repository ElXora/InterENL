/**
 * antiNuke.js
 * -----------------------------------------------------
 * Detects bursts of destructive actions that typically
 * indicate a compromised account or malicious admin trying
 * to "nuke" the server, and automatically punishes the
 * responsible user:
 *
 *   - Mass channel deletion
 *   - Mass role deletion
 *   - Mass banning of members
 *   - Mass kicking of members
 *   - Mass webhook creation (used to spam-flood channels)
 *   - Granting Administrator permission to a role
 *
 * Whitelisted IDs (config.antiNuke.whitelistedIds) and the
 * bot's own actions are always ignored.
 * -----------------------------------------------------
 */

const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { recordAndCount, reset } = require('../utils/actionTracker');
const logger = require('../utils/logger');
const config = require('../config');
const { errorEmbed } = require('../embeds/embeds');

const WINDOW_MS = 60_000; // rolling 1-minute window for all anti-nuke thresholds

/**
 * Checks if a user ID should be exempt from anti-nuke punishment
 * (server owner, configured whitelist, or the bot itself).
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {import('discord.js').Client} client
 * @returns {boolean}
 */
function isExempt(guild, userId, client) {
    if (!userId) return true;
    if (userId === client.user.id) return true;
    if (userId === guild.ownerId) return true;
    const whitelist = config.antiNuke?.whitelistedIds || [];
    return whitelist.includes(userId);
}

/**
 * Fetches the most recent audit log entry for a given action type
 * that targeted a specific ID, returning the executor's user ID.
 * @param {import('discord.js').Guild} guild
 * @param {number} auditLogEventType One of AuditLogEvent.*
 * @param {string} [targetId] Optional target ID to match against.
 * @returns {Promise<string|null>}
 */
async function getExecutorId(guild, auditLogEventType, targetId = null) {
    try {
        const logs = await guild.fetchAuditLogs({ type: auditLogEventType, limit: 5 });
        const entry = targetId
            ? logs.entries.find((e) => e.targetId === targetId)
            : logs.entries.first();

        // Only trust reasonably fresh entries (within the last 10 seconds)
        if (entry && Date.now() - entry.createdTimestamp < 10_000) {
            return entry.executorId;
        }
        return entry ? entry.executorId : null;
    } catch (err) {
        logger.warn(`Anti-nuke: could not fetch audit logs in ${guild.name} (missing View Audit Log permission?).`);
        return null;
    }
}

/**
 * Punishes a user for triggering an anti-nuke threshold.
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {string} reason
 * @param {import('discord.js').Client} client
 */
async function punish(guild, userId, reason, client) {
    const punishment = config.antiNuke?.punishment || 'ban';

    try {
        const member = await guild.members.fetch(userId).catch(() => null);

        if (punishment === 'ban') {
            await guild.members.ban(userId, { reason: `Anti-Nuke: ${reason}` });
        } else if (member) {
            await member.kick(`Anti-Nuke: ${reason}`);
        }

        logger.logAction(client, {
            action: 'ANTI_NUKE',
            admin: 'SYSTEM',
            target: userId,
            details: `${reason} — punishment: ${punishment}`
        });

        // Alert admins/owner
        const alertChannelId = config.adminAlertChannelId;
        if (alertChannelId) {
            const channel = await client.channels.fetch(alertChannelId).catch(() => null);
            if (channel?.isTextBased()) {
                await channel.send({
                    embeds: [
                        errorEmbed(
                            '🚨 Anti-Nuke Triggered',
                            `**User:** <@${userId}> (\`${userId}\`)\n**Server:** ${guild.name}\n**Reason:** ${reason}\n**Action Taken:** ${punishment === 'ban' ? 'Banned' : 'Kicked'}`
                        )
                    ]
                });
            }
        }
    } catch (err) {
        logger.error(`Anti-nuke: failed to punish user ${userId} in ${guild.name}`, err);
    }
}

/**
 * Generic guard: records an occurrence for (guild, executor, actionType)
 * and punishes the executor if the configured threshold is exceeded.
 * @param {import('discord.js').Guild} guild
 * @param {string} executorId
 * @param {string} actionType Human-readable action name, also used as the tracking key suffix.
 * @param {number} threshold
 * @param {import('discord.js').Client} client
 */
async function guardThreshold(guild, executorId, actionType, threshold, client) {
    if (!config.antiNuke?.enabled) return;
    if (isExempt(guild, executorId, client)) return;

    const key = `${guild.id}-${executorId}-${actionType}`;
    const count = recordAndCount(key, WINDOW_MS);

    if (count >= threshold) {
        reset(key);
        await punish(guild, executorId, `Exceeded ${actionType} threshold (${threshold}/min)`, client);
    }
}

/**
 * Handles a channelDelete event.
 * @param {import('discord.js').GuildChannel} channel
 * @param {import('discord.js').Client} client
 */
async function handleChannelDelete(channel, client) {
    if (!channel.guild) return;
    const executorId = await getExecutorId(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    await guardThreshold(channel.guild, executorId, 'Channel Deletion', config.antiNuke?.maxChannelDeletesPerMinute || 3, client);
}

/**
 * Handles a roleDelete event.
 * @param {import('discord.js').Role} role
 * @param {import('discord.js').Client} client
 */
async function handleRoleDelete(role, client) {
    const executorId = await getExecutorId(role.guild, AuditLogEvent.RoleDelete, role.id);
    await guardThreshold(role.guild, executorId, 'Role Deletion', config.antiNuke?.maxRoleDeletesPerMinute || 3, client);
}

/**
 * Handles a guildBanAdd event.
 * @param {import('discord.js').GuildBan} ban
 * @param {import('discord.js').Client} client
 */
async function handleBanAdd(ban, client) {
    const executorId = await getExecutorId(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await guardThreshold(ban.guild, executorId, 'Mass Ban', config.antiNuke?.maxBansPerMinute || 3, client);
}

/**
 * Handles a guildMemberRemove event, distinguishing kicks via audit log.
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Client} client
 */
async function handleMemberRemove(member, client) {
    try {
        const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 5 });
        const entry = logs.entries.find((e) => e.targetId === member.id && Date.now() - e.createdTimestamp < 10_000);
        if (!entry) return; // was a voluntary leave, not a kick

        await guardThreshold(member.guild, entry.executorId, 'Mass Kick', config.antiNuke?.maxKicksPerMinute || 3, client);
    } catch (err) {
        // Missing audit log permission — non-fatal, anti-nuke just can't cover kicks here.
    }
}

/**
 * Handles a webhooksUpdate event (fired when a webhook is created/deleted/updated in a channel).
 * @param {import('discord.js').GuildChannel} channel
 * @param {import('discord.js').Client} client
 */
async function handleWebhooksUpdate(channel, client) {
    if (!channel.guild) return;
    const executorId = await getExecutorId(channel.guild, AuditLogEvent.WebhookCreate);
    await guardThreshold(channel.guild, executorId, 'Webhook Creation', config.antiNuke?.maxWebhookCreatesPerMinute || 3, client);
}

/**
 * Handles a roleUpdate event, specifically watching for dangerous
 * Administrator permission grants.
 * @param {import('discord.js').Role} oldRole
 * @param {import('discord.js').Role} newRole
 * @param {import('discord.js').Client} client
 */
async function handleRoleUpdate(oldRole, newRole, client) {
    if (!config.antiNuke?.blockDangerousPermissionGrants) return;

    const gainedAdmin =
        !oldRole.permissions.has(PermissionFlagsBits.Administrator) &&
        newRole.permissions.has(PermissionFlagsBits.Administrator);

    if (!gainedAdmin) return;

    const executorId = await getExecutorId(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    if (isExempt(newRole.guild, executorId, client)) return;

    // Immediately strip the dangerous permission back off the role.
    try {
        await newRole.setPermissions(oldRole.permissions, 'Anti-Nuke: reverted unauthorized Administrator grant');
    } catch (err) {
        logger.warn(`Anti-nuke: could not revert Administrator grant on role ${newRole.name}.`);
    }

    await punish(newRole.guild, executorId, `Granted Administrator permission to role "${newRole.name}" without authorization`, client);
}

module.exports = {
    handleChannelDelete,
    handleRoleDelete,
    handleBanAdd,
    handleMemberRemove,
    handleWebhooksUpdate,
    handleRoleUpdate
};
