/**
 * achievementManager.js
 * -----------------------------------------------------
 * Defines every achievement (economy, leveling, mini-games,
 * Battle Pass) and checks a user's current stats against all
 * of them after any stat-affecting action, awarding (persisting +
 * DMing) any newly-earned ones. This is the ONE unlocked-achievements
 * ledger (economyManager user.achievements array) regardless of
 * which subsystem (economy/progression) triggered the check —
 * achievements read from both, but are recorded in one place.
 *
 * "1000 Coins" uses totalCoinsEarned (a lifetime cumulative
 * milestone that can't be lost by spending/transferring).
 * "Rich" and "Millionaire" use the CURRENT coins balance
 * (a wealth-status milestone) — that distinction is deliberate.
 *
 * Hidden achievements (config `hidden: true`) don't show their
 * name/description in /achievements until unlocked — see
 * embeds/achievementEmbeds.js.
 * -----------------------------------------------------
 */

const config = require('../config');
const economyManager = require('./economyManager');
const progressionManager = require('./progressionManager');
const { computeBattlePassLevel } = require('./battlePassRewards');
const logger = require('./logger');

/**
 * @typedef {object} AchievementDef
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 * @property {string} description
 * @property {boolean} hidden
 * @property {number} rewardCoins
 * @property {number} rewardXp
 * @property {(ctx: {economy: object, progression: object}) => boolean} isMet
 */

/** @type {Array<{id: string, isMet: (ctx: object) => boolean}>} */
const ACHIEVEMENT_CHECKS = [
    { id: 'first_loot', isMet: (ctx) => ctx.economy.lootDropsClaimed >= 1 },
    { id: 'ten_loot', isMet: (ctx) => ctx.economy.lootDropsClaimed >= 10 },
    { id: 'thousand_coins', isMet: (ctx) => ctx.economy.totalCoinsEarned >= 1000 },
    { id: 'first_license', isMet: (ctx) => ctx.economy.licenseWins >= 1 },
    { id: 'ten_streak', isMet: (ctx) => ctx.economy.dailyStreak >= 10 },
    { id: 'rich', isMet: (ctx) => ctx.economy.coins >= 10000 },
    { id: 'millionaire', isMet: (ctx) => ctx.economy.coins >= 1000000 },
    { id: 'chatterbox', isMet: (ctx) => ctx.progression.messagesSent >= 1000 },
    { id: 'dedicated', isMet: (ctx) => ctx.progression.activityStreak >= 7 },
    { id: 'gamer', isMet: (ctx) => ctx.progression.gamesWonTotal >= 50 },
    { id: 'grinder', isMet: (ctx) => computeBattlePassLevel(ctx.progression.xp).level >= 50 },
    { id: 'high_roller', isMet: (ctx) => ctx.progression.biggestSingleWin >= 1000 },
    { id: 'giveaway_champion', isMet: (ctx) => ctx.progression.giveawaysWon >= 1 },
    { id: 'blackjack_natural', isMet: (ctx) => ctx.progression.blackjackNaturals >= 1 },
    {
        id: 'completionist',
        // Met once every OTHER achievement is unlocked.
        isMet: (ctx) => {
            const otherIds = getAchievementDefs()
                .map((d) => d.id)
                .filter((id) => id !== 'completionist');
            return otherIds.every((id) => ctx.economy.achievements.includes(id));
        }
    }
];

/**
 * Merges the static check functions above with their display
 * metadata (name/emoji/description/rewards/hidden) from config.json.
 * @returns {AchievementDef[]}
 */
function getAchievementDefs() {
    const configAchievements = config.achievements || config.economy?.achievements || [];
    return ACHIEVEMENT_CHECKS.map((check) => {
        const meta = configAchievements.find((a) => a.id === check.id) || {};
        return {
            id: check.id,
            name: meta.name || check.id,
            emoji: meta.emoji || '🏆',
            description: meta.description || '',
            hidden: Boolean(meta.hidden),
            rewardCoins: meta.rewardCoins || 0,
            rewardXp: meta.rewardXp || 0,
            isMet: check.isMet
        };
    });
}

/**
 * Checks a user's current stats (economy + progression) against
 * every achievement and awards (persists + DMs + rewards) any that
 * are newly met. Safe to call after ANY economy or progression
 * action — already-earned achievements are skipped automatically.
 * @param {string} discordId
 * @param {import('discord.js').Client} client Used to DM the user; pass null to skip DMing.
 * @returns {Promise<AchievementDef[]>} Any achievements newly awarded this call.
 */
async function checkAndAwardAchievements(discordId, client) {
    const economyUser = economyManager.getUser(discordId);
    if (!economyUser) return [];
    const progressionUser =
        progressionManager.getUser(discordId) || progressionManager.getOrCreateUser(discordId, economyUser.username);

    const ctx = { economy: economyUser, progression: progressionUser };
    const defs = getAchievementDefs();
    const newlyAwarded = [];

    // Completionist is checked AFTER every other achievement in this
    // same pass could have just been unlocked below.
    for (const def of defs) {
        if (def.id === 'completionist') continue;
        if (economyUser.achievements.includes(def.id)) continue;
        if (def.isMet(ctx)) {
            economyUser.achievements.push(def.id);
            newlyAwarded.push(def);
        }
    }

    const completionistDef = defs.find((d) => d.id === 'completionist');
    if (completionistDef && !economyUser.achievements.includes('completionist') && completionistDef.isMet(ctx)) {
        economyUser.achievements.push('completionist');
        newlyAwarded.push(completionistDef);
    }

    if (newlyAwarded.length === 0) return [];

    economyManager.saveUser(economyUser);

    for (const achievement of newlyAwarded) {
        if (achievement.rewardCoins > 0) {
            economyManager.addCoins(discordId, economyUser.username, achievement.rewardCoins);
        }
        if (achievement.rewardXp > 0) {
            progressionManager.addXp(discordId, economyUser.username, achievement.rewardXp, { bypassCooldown: true });
        }
        // Feeds the "unlock an achievement" weekly challenge. Does NOT
        // recurse back into achievement checking, so this is safe.
        progressionManager.recordAchievementUnlocked(discordId, economyUser.username);
    }

    if (client) {
        const { buildAchievementUnlockedEmbed } = require('../embeds/achievementEmbeds');
        for (const achievement of newlyAwarded) {
            try {
                const discordUser = await client.users.fetch(discordId);
                await discordUser.send({ embeds: [buildAchievementUnlockedEmbed(discordUser, achievement)] });
            } catch (err) {
                // Non-fatal — user may have DMs disabled.
            }
        }
    }

    logger.logAction(client, {
        action: 'ACHIEVEMENT_UNLOCK',
        admin: 'SYSTEM',
        target: discordId,
        details: newlyAwarded.map((a) => a.name).join(', ')
    });

    return newlyAwarded;
}

module.exports = { getAchievementDefs, checkAndAwardAchievements };
