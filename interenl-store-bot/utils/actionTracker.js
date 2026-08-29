/**
 * actionTracker.js
 * -----------------------------------------------------
 * Simple in-memory rolling-window counter.
 * Used by the anti-nuke system to detect bursts of
 * destructive actions (channel deletes, mass bans, etc.)
 * performed by the same user in a short time frame.
 * -----------------------------------------------------
 */

const buckets = new Map(); // key -> array of timestamps (ms)

/**
 * Records one occurrence of an action for a given key and
 * returns how many occurrences happened within the trailing
 * windowMs milliseconds (including this one).
 * @param {string} key Unique key, e.g. `${guildId}-${userId}-channelDelete`.
 * @param {number} windowMs Rolling window size in milliseconds.
 * @returns {number} Count of occurrences within the window.
 */
function recordAndCount(key, windowMs) {
    const now = Date.now();
    const existing = buckets.get(key) || [];
    const filtered = existing.filter((ts) => now - ts <= windowMs);
    filtered.push(now);
    buckets.set(key, filtered);
    return filtered.length;
}

/**
 * Clears all tracked occurrences for a given key.
 * Useful after punishing a user, to reset their count.
 * @param {string} key
 */
function reset(key) {
    buckets.delete(key);
}

module.exports = { recordAndCount, reset };
