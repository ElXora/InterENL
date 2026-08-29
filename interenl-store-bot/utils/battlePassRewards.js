/**
 * battlePassRewards.js
 * -----------------------------------------------------
 * Pure, stateless helpers for the Battle Pass reward track.
 * No storage here — this just answers "what does level N
 * give?" and "how much XP does level N need?" from config,
 * so both progressionManager (granting) and /battlepass
 * (displaying the track) share one source of truth.
 * -----------------------------------------------------
 */

const config = require('../config');

/**
 * XP required to go from Battle Pass level N to N+1.
 * Grows exponentially per config.battlePass.xpFormula so later
 * levels take meaningfully longer, per the spec's "progressively
 * increasing XP requirements".
 * @param {number} level Current level (1-indexed).
 * @returns {number}
 */
function xpForBattlePassLevel(level) {
    const formula = config.battlePass?.xpFormula || { base: 150, growth: 1.055 };
    return Math.round(formula.base * Math.pow(formula.growth, level - 1));
}

/**
 * Computes a user's Battle Pass level + progress from their
 * lifetime XP total (the same XP pool that drives /rank leveling —
 * the Battle Pass and the leveling system are deliberately fed by
 * the same stat so every source of XP feeds both progression bars).
 * Caps at config.battlePass.maxLevel (default 50) — once maxed,
 * currentLevelXp/xpForNext just reflect the final level as "full".
 * @param {number} totalXp
 * @returns {{level: number, currentLevelXp: number, xpForNext: number}}
 */
function computeBattlePassLevel(totalXp) {
    const maxLevel = config.battlePass?.maxLevel || 50;
    let level = 1;
    let remaining = totalXp;

    while (level < maxLevel) {
        const needed = xpForBattlePassLevel(level);
        if (remaining < needed) break;
        remaining -= needed;
        level += 1;
    }

    const xpForNext = level >= maxLevel ? 0 : xpForBattlePassLevel(level);
    return { level, currentLevelXp: remaining, xpForNext };
}

/**
 * Looks up the reward for a specific Battle Pass level — an
 * explicit config.battlePass.milestoneRewards override if one
 * exists for that exact level, otherwise a reward randomly rolled
 * (deterministically, seeded by level so it's stable across calls)
 * within the range defined by whichever config.battlePass.tiers
 * bucket that level falls into.
 * @param {number} level
 * @returns {{coins: number, title: string|null, label: string, legendary: boolean}}
 */
function getBattlePassReward(level) {
    const milestone = config.battlePass?.milestoneRewards?.[String(level)];
    if (milestone) {
        return {
            coins: milestone.coins || 0,
            title: milestone.title || null,
            label: milestone.label || `${milestone.coins || 0} VSC`,
            legendary: Boolean(milestone.legendary)
        };
    }

    const tiers = config.battlePass?.tiers || [];
    const tier = tiers.find((t) => level >= t.minLevel && level <= t.maxLevel);

    if (!tier) {
        return { coins: 50, title: null, label: '50 VSC', legendary: false };
    }

    // Deterministic "random" within the tier's range, seeded by level,
    // so the same level always shows/grants the same amount rather than
    // rolling differently every time it's displayed vs. actually granted.
    const spread = tier.coinsMax - tier.coinsMin;
    const seededFraction = ((level * 2654435761) % 1000) / 1000; // cheap deterministic pseudo-random, 0..1
    const coins = Math.round(tier.coinsMin + spread * seededFraction);

    return { coins, title: null, label: `${coins.toLocaleString()} VSC`, legendary: false };
}

module.exports = { xpForBattlePassLevel, computeBattlePassLevel, getBattlePassReward };
