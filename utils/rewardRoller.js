/**
 * rewardRoller.js
 * -----------------------------------------------------
 * Rolls a single loot drop reward. Tiers are checked from
 * rarest to most common, each with its own independent
 * chance (randomized within its configured min/max range
 * every roll). The first tier that hits wins; if none hit,
 * the guaranteed fallback (10 coins) is always given, so
 * every claim gets *something*.
 * -----------------------------------------------------
 */

const config = require('../config');

/**
 * Returns a random float between min and max (inclusive-ish).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Rolls a loot drop reward.
 * @returns {{type: 'coins'|'license', amount?: number, plan?: string, label: string}}
 */
function rollReward() {
    const tiers = config.economy?.rewardTiers || [];

    for (const tier of tiers) {
        const chance = randomBetween(tier.minChancePercent, tier.maxChancePercent); // percent, e.g. 0.01 = 0.01%
        const roll = Math.random() * 100;
        if (roll <= chance) {
            return tier;
        }
    }

    return config.economy?.guaranteedFallback || { type: 'coins', amount: 10, label: '10 VSC' };
}

module.exports = { rollReward, randomBetween };
