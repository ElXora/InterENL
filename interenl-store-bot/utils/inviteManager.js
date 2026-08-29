/**
 * inviteManager.js
 * -----------------------------------------------------
 * Storage + business logic for invite tracking: per-inviter
 * stats (regular/left/fake/bonus) and per-member join records
 * (who invited them, whether it looked fake, whether they've
 * left before). The live guild invite-code cache used to figure
 * out WHICH invite a new member used lives in-memory in
 * handlers/inviteTracker.js — this file only stores the
 * results of that lookup.
 * -----------------------------------------------------
 */

const path = require('path');
const { readJSONSync, writeJSONSync, ensureFileSync } = require('./storage');

const INVITES_FILE = path.join(__dirname, '..', 'invites.json');

ensureFileSync(INVITES_FILE, { inviterStats: [], joinRecords: [] });

/**
 * @typedef {object} InviterStats
 * @property {string} discordId
 * @property {string} tag
 * @property {number} regular Genuine joins credited to this inviter.
 * @property {number} left How many of their invited members have since left.
 * @property {number} fake Joins flagged as likely fake/alt accounts (new account age).
 * @property {number} bonus Manually granted bonus invites (admin-adjustable).
 * @property {number} rejoins Times a previously-left invitee rejoined (informational only).
 */

/**
 * @typedef {object} JoinRecord
 * @property {string} memberId
 * @property {string} memberTag
 * @property {string|null} inviterId Null if the invite source couldn't be determined (e.g. vanity URL).
 * @property {string|null} inviterTag
 * @property {string|null} code The invite code used, if known.
 * @property {boolean} isFake
 * @property {string} joinedAt ISO timestamp of the most recent join.
 * @property {string|null} leftAt ISO timestamp of their most recent departure, or null if currently in the server.
 */

function loadData() {
    return readJSONSync(INVITES_FILE, { inviterStats: [], joinRecords: [] });
}

function saveData(data) {
    writeJSONSync(INVITES_FILE, data);
}

/**
 * @param {object} data
 * @param {string} discordId
 * @param {string} tag
 * @returns {InviterStats}
 */
function getOrCreateInviterStats(data, discordId, tag) {
    let stats = data.inviterStats.find((s) => s.discordId === discordId);
    if (!stats) {
        stats = { discordId, tag, regular: 0, left: 0, fake: 0, bonus: 0, rejoins: 0 };
        data.inviterStats.push(stats);
    } else if (tag) {
        stats.tag = tag;
    }
    return stats;
}

/**
 * @param {string} discordId
 * @returns {InviterStats}
 */
function getInviterStats(discordId) {
    const data = loadData();
    return data.inviterStats.find((s) => s.discordId === discordId) || { discordId, tag: 'Unknown', regular: 0, left: 0, fake: 0, bonus: 0, rejoins: 0 };
}

/**
 * Computed "effective" invite count the way invite-tracker bots
 * typically display it: regular + bonus - left. Fake joins were
 * never added to `regular` in the first place, so they don't need
 * subtracting again here — they're already excluded.
 * @param {InviterStats} stats
 * @returns {number}
 */
function getEffectiveInvites(stats) {
    return Math.max(0, stats.regular + stats.bonus - stats.left);
}

/**
 * Records a new member join, crediting (or not) whichever inviter
 * the invite-code diff in inviteTracker.js determined. Handles the
 * fake-account check and the rejoin case (a member who left before
 * and came back doesn't get double-counted as a fresh "regular" join).
 * @param {object} params
 * @param {string} params.memberId
 * @param {string} params.memberTag
 * @param {string|null} params.inviterId
 * @param {string|null} params.inviterTag
 * @param {string|null} params.code
 * @param {number} params.accountAgeDays How old the joining account is, in days.
 * @param {number} params.fakeThresholdDays Below this account age, a join is flagged fake.
 * @returns {{isFake: boolean, isRejoin: boolean}}
 */
function recordJoin({ memberId, memberTag, inviterId, inviterTag, code, accountAgeDays, fakeThresholdDays }) {
    const data = loadData();
    const isFake = accountAgeDays < fakeThresholdDays;
    const existingRecord = data.joinRecords.find((r) => r.memberId === memberId);
    const isRejoin = Boolean(existingRecord);

    if (inviterId) {
        const stats = getOrCreateInviterStats(data, inviterId, inviterTag);
        if (isRejoin) {
            stats.rejoins += 1;
        } else if (isFake) {
            stats.fake += 1;
        } else {
            stats.regular += 1;
        }
    }

    if (existingRecord) {
        existingRecord.memberTag = memberTag;
        existingRecord.inviterId = inviterId;
        existingRecord.inviterTag = inviterTag;
        existingRecord.code = code;
        existingRecord.joinedAt = new Date().toISOString();
        existingRecord.leftAt = null;
        // isFake / original inviter credit intentionally preserved from the first join.
    } else {
        data.joinRecords.push({
            memberId,
            memberTag,
            inviterId,
            inviterTag,
            code,
            isFake,
            joinedAt: new Date().toISOString(),
            leftAt: null
        });
    }

    saveData(data);
    return { isFake, isRejoin };
}

/**
 * Records a member leaving: marks their join record inactive and
 * credits their inviter's "left" count, if they were tracked.
 * @param {string} memberId
 */
function recordLeave(memberId) {
    const data = loadData();
    const record = data.joinRecords.find((r) => r.memberId === memberId && r.leftAt === null);
    if (!record) return;

    record.leftAt = new Date().toISOString();

    if (record.inviterId) {
        const stats = getOrCreateInviterStats(data, record.inviterId, record.inviterTag);
        stats.left += 1;
    }

    saveData(data);
}

/**
 * Admin tool: manually adjusts someone's bonus invite count.
 * @param {string} discordId
 * @param {string} tag
 * @param {number} amount Can be negative to remove bonus invites.
 * @returns {InviterStats}
 */
function adjustBonusInvites(discordId, tag, amount) {
    const data = loadData();
    const stats = getOrCreateInviterStats(data, discordId, tag);
    stats.bonus = Math.max(0, stats.bonus + amount);
    saveData(data);
    return stats;
}

/**
 * @param {string} memberId
 * @returns {JoinRecord|null}
 */
function getJoinRecord(memberId) {
    return loadData().joinRecords.find((r) => r.memberId === memberId) || null;
}

/**
 * Everyone a given inviter has brought in (their join records).
 * @param {string} inviterId
 * @returns {JoinRecord[]}
 */
function getInvitedMembers(inviterId) {
    return loadData().joinRecords.filter((r) => r.inviterId === inviterId);
}

/**
 * @param {number} [limit=10]
 * @returns {InviterStats[]} Sorted by effective invites, descending.
 */
function getLeaderboard(limit = 10) {
    const data = loadData();
    return data.inviterStats
        .slice()
        .sort((a, b) => getEffectiveInvites(b) - getEffectiveInvites(a))
        .slice(0, limit);
}

module.exports = {
    loadData,
    saveData,
    getInviterStats,
    getEffectiveInvites,
    recordJoin,
    recordLeave,
    adjustBonusInvites,
    getJoinRecord,
    getInvitedMembers,
    getLeaderboard
};
