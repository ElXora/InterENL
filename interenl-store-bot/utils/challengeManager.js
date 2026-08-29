/**
 * challengeManager.js
 * -----------------------------------------------------
 * Pure state-transition logic for Daily/Weekly Challenges.
 * No storage of its own — operates on the `challengeState`
 * object embedded in a progressionManager user record, so
 * there's exactly one data file for all progression-related
 * stats (see progressionManager.js).
 *
 * Challenges are picked deterministically from config.challenges.pool,
 * seeded by the current day/week, so every member sees the SAME
 * set of active challenges on a given day — simpler to reason
 * about and balance than per-user random assignment, and means
 * a screenshot of "today's challenges" is meaningful to compare.
 * Rewards are granted automatically the instant a challenge's
 * target is reached (no separate "claim" step) — that's both
 * simpler and inherently prevents any double-claim exploit, since
 * `completed` flips to true in the same update that grants it.
 * -----------------------------------------------------
 */

const config = require('../config');

/**
 * Returns today's UTC date as YYYY-MM-DD — the "daily" period key.
 * @returns {string}
 */
function getDailyPeriodId() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Returns the current ISO week as YYYY-Www — the "weekly" period key.
 * @returns {string}
 */
function getWeeklyPeriodId() {
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Cheap deterministic pseudo-random integer generator seeded by a
 * string, used to rotate which pool challenges are active each
 * period without needing a real RNG (which wouldn't be reproducible
 * across users/restarts anyway).
 * @param {string} seed
 * @returns {number} 0..1
 */
function seededFraction(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) % 1000) / 1000;
}

/**
 * Deterministically picks `count` challenges of the given scope
 * from config.challenges.pool, seeded by the period ID so the
 * selection rotates day-to-day/week-to-week but is identical for
 * every member within the same period.
 * @param {'daily'|'weekly'} scope
 * @param {string} periodId
 * @param {number} count
 * @returns {Array<object>} Fresh challenge instances: {id, scope, statKey, target, progress: 0, completed: false, label, emoji, xpReward, coinReward}
 */
function pickChallenges(scope, periodId, count) {
    const pool = (config.challenges?.pool || []).filter((c) => c.scope === scope);
    if (pool.length === 0) return [];

    const startIndex = Math.floor(seededFraction(periodId + scope) * pool.length);
    const picked = [];
    for (let i = 0; i < Math.min(count, pool.length); i++) {
        picked.push(pool[(startIndex + i) % pool.length]);
    }

    return picked.map((def) => ({
        id: def.id,
        scope: def.scope,
        statKey: def.statKey,
        target: def.target,
        label: def.label,
        emoji: def.emoji || '🎯',
        xpReward: def.xpReward || 0,
        coinReward: def.coinReward || 0,
        progress: 0,
        completed: false
    }));
}

/**
 * Builds a brand new, empty challenge state.
 * @returns {object}
 */
function buildDefaultChallengeState() {
    return { dailyPeriod: null, daily: [], weeklyPeriod: null, weekly: [] };
}

/**
 * Regenerates the active daily/weekly challenge lists if the
 * current period has rolled over since they were last picked.
 * Mutates and returns the same challengeState object.
 * @param {object} challengeState
 * @returns {object}
 */
function ensureFreshChallengeState(challengeState) {
    const state = challengeState || buildDefaultChallengeState();
    const dailyCount = config.challenges?.dailyCount ?? 3;
    const weeklyCount = config.challenges?.weeklyCount ?? 2;

    const currentDaily = getDailyPeriodId();
    if (state.dailyPeriod !== currentDaily) {
        state.dailyPeriod = currentDaily;
        state.daily = pickChallenges('daily', currentDaily, dailyCount);
    }

    const currentWeekly = getWeeklyPeriodId();
    if (state.weeklyPeriod !== currentWeekly) {
        state.weeklyPeriod = currentWeekly;
        state.weekly = pickChallenges('weekly', currentWeekly, weeklyCount);
    }

    return state;
}

/**
 * Adds progress toward every active (not-yet-completed) challenge
 * whose statKey matches, in both the daily and weekly lists.
 * Mutates challengeState in place. Returns any challenges that
 * just crossed their target for the first time this call, so the
 * caller can grant their reward + notify the user.
 * @param {object} challengeState Already-freshened via ensureFreshChallengeState.
 * @param {string} statKey e.g. 'messages', 'gamesWon', 'coinsEarned', 'giveawayEntries', 'xpEarned', 'achievementsUnlocked'.
 * @param {number} amount
 * @returns {Array<object>} Newly completed challenge instances.
 */
function recordProgress(challengeState, statKey, amount) {
    const newlyCompleted = [];

    for (const list of [challengeState.daily, challengeState.weekly]) {
        for (const challenge of list) {
            if (challenge.completed || challenge.statKey !== statKey) continue;
            challenge.progress = Math.min(challenge.target, challenge.progress + amount);
            if (challenge.progress >= challenge.target) {
                challenge.completed = true;
                newlyCompleted.push(challenge);
            }
        }
    }

    return newlyCompleted;
}

module.exports = {
    getDailyPeriodId,
    getWeeklyPeriodId,
    buildDefaultChallengeState,
    ensureFreshChallengeState,
    recordProgress
};
