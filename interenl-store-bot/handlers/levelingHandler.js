/**
 * levelingHandler.js
 * -----------------------------------------------------
 * Called from messageCreate.js on every non-bot message.
 * Awards XP (subject to progressionManager's per-user cooldown),
 * tracks message count / activity streak, posts the level-up
 * announcement + any Battle Pass level-up announcement(s), and
 * runs the achievement check afterward.
 * -----------------------------------------------------
 */

const config = require('../config');
const logger = require('../utils/logger');
const progressionManager = require('../utils/progressionManager');
const achievementManager = require('../utils/achievementManager');
const { buildLevelUpEmbed, buildBattlePassLevelUpEmbed } = require('../embeds/progressionEmbeds');

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} message
 */
async function handleMessageXp(client, message) {
    if (!config.leveling?.enabled) return;
    if (message.author.bot) return;
    if (!message.guild) return; // no XP from DMs

    // Message count + activity streak are tracked on every message,
    // independent of the XP cooldown (see progressionManager.recordMessage).
    progressionManager.recordMessage(message.author.id, message.author.tag);

    const xpPerMessage = config.leveling?.xpPerMessage ?? 2;
    const result = progressionManager.addXp(message.author.id, message.author.tag, xpPerMessage);

    // null means the user is still on cooldown — not an error, just no XP this message.
    if (!result) return;

    if (result.leveledUp) {
        try {
            await message.channel.send({
                content: `${message.author}`,
                embeds: [buildLevelUpEmbed(message.guild, message.member || message.author, result.newLevel, result.levelUpCoins)]
            });
        } catch (err) {
            logger.warn(`Could not send level-up announcement for ${message.author.tag}: ${err.message}`);
        }
    }

    for (const gain of result.battlePassLevelsGained) {
        try {
            await message.channel.send({
                content: gain.reward.legendary ? `${message.author}` : undefined,
                embeds: [buildBattlePassLevelUpEmbed(message.guild, message.member || message.author, gain.level, gain.reward)]
            });
        } catch (err) {
            logger.warn(`Could not send Battle Pass level-up announcement for ${message.author.tag}: ${err.message}`);
        }
    }

    try {
        await achievementManager.checkAndAwardAchievements(message.author.id, client);
    } catch (err) {
        logger.error('Error checking achievements after message XP.', err);
    }
}

module.exports = { handleMessageXp };
