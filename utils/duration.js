/**
 * duration.js
 * -----------------------------------------------------
 * Parses short human-friendly duration strings like "30m",
 * "2h", "1d12h" into milliseconds. Used by /giveaway create.
 * -----------------------------------------------------
 */

const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

/**
 * @param {string} input e.g. "2h", "30m", "1d12h", "45s"
 * @returns {number|null} Milliseconds, or null if unparseable.
 */
function parseDuration(input) {
    if (!input) return null;
    const matches = [...input.matchAll(/(\d+)\s*(s|m|h|d)/gi)];
    if (matches.length === 0) return null;

    let totalMs = 0;
    for (const match of matches) {
        const value = Number(match[1]);
        const unit = match[2].toLowerCase();
        totalMs += value * UNIT_MS[unit];
    }

    return totalMs > 0 ? totalMs : null;
}

module.exports = { parseDuration };
