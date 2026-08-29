/**
 * config/index.js
 * -----------------------------------------------------
 * Loads config.json and merges in environment variables
 * so the rest of the codebase can just require('../config')
 * and get a single, ready-to-use configuration object.
 *
 * Anything that should be easy to change without touching
 * code — Owner ID, extra hardcoded Admin IDs, the announcement
 * channel — is read from .env (with config.json / sensible
 * defaults as a fallback), per your request.
 * -----------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const configPath = path.join(__dirname, 'config.json');
const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * Parses a comma-separated list of Discord IDs from an env var
 * into a clean array of strings (ignores blanks/whitespace).
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function parseIdList(raw) {
    if (!raw) return [];
    return raw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
}

/**
 * Reads a boolean feature-toggle from .env (ENABLE_X=true/false).
 * Leaving the var unset/blank keeps whatever config.json already says,
 * so nobody is forced to touch .env just to keep the defaults.
 * @param {string|undefined} raw
 * @param {boolean} fallback
 * @returns {boolean}
 */
function parseBool(raw, fallback) {
    if (raw === undefined || raw === null || raw.trim() === '') return fallback;
    return raw.trim().toLowerCase() === 'true';
}

module.exports = {
    ...rawConfig,

    // ------------------------------------------------
    // Feature toggles — every major system can be flipped
    // on/off from .env without touching config.json or code.
    // ------------------------------------------------
    moderation: {
        ...rawConfig.moderation,
        enabled: parseBool(process.env.ENABLE_MODERATION, rawConfig.moderation?.enabled ?? true)
    },
    antiNuke: {
        ...rawConfig.antiNuke,
        enabled: parseBool(process.env.ENABLE_ANTINUKE, rawConfig.antiNuke?.enabled ?? true)
    },
    licenseLeakProtection: parseBool(process.env.ENABLE_LEAK_PROTECTION, rawConfig.licenseLeakProtection ?? true),
    ignoreAdminsInLeakScan: parseBool(process.env.IGNORE_ADMINS_IN_LEAK_SCAN, rawConfig.ignoreAdminsInLeakScan ?? false),
    enableLicenseSystem: parseBool(process.env.ENABLE_LICENSE_SYSTEM, true),
    tickets: {
        ...rawConfig.tickets,
        enabled: parseBool(process.env.ENABLE_TICKETS, rawConfig.tickets?.enabled ?? true)
    },
    welcome: {
        ...rawConfig.welcome,
        enabled: parseBool(process.env.ENABLE_WELCOME, rawConfig.welcome?.enabled ?? true),
        channelId: process.env.WELCOME_CHANNEL_ID || rawConfig.welcome?.channelId || ''
    },
    economy: {
        ...rawConfig.economy,
        enabled: parseBool(process.env.ENABLE_ECONOMY, rawConfig.economy?.enabled ?? true),
        enableLootDrops: parseBool(process.env.ENABLE_LOOT_DROPS, rawConfig.economy?.enableLootDrops ?? true),
        enableDaily: parseBool(process.env.ENABLE_DAILY, rawConfig.economy?.enableDaily ?? true),
        enableWork: parseBool(process.env.ENABLE_WORK, rawConfig.economy?.enableWork ?? true),
        enableLicenses: parseBool(process.env.ENABLE_LICENSE_REWARDS, rawConfig.economy?.enableLicenses ?? true),
        currencyName: process.env.CURRENCY_NAME || rawConfig.economy?.currencyName || 'VSC',
        emojiName: process.env.CURRENCY_EMOJI_NAME || rawConfig.economy?.emojiName || 'interenlstorelogo'
    },
    leveling: {
        ...rawConfig.leveling,
        enabled: parseBool(process.env.ENABLE_LEVELING, rawConfig.leveling?.enabled ?? true),
        levelUpChannelId: process.env.LEVELUP_CHANNEL_ID || rawConfig.leveling?.levelUpChannelId || ''
    },
    battlePass: {
        ...rawConfig.battlePass,
        enabled: parseBool(process.env.ENABLE_BATTLEPASS, rawConfig.battlePass?.enabled ?? true)
    },
    games: {
        ...rawConfig.games,
        enabled: parseBool(process.env.ENABLE_GAMES, rawConfig.games?.enabled ?? true)
    },
    challenges: {
        ...rawConfig.challenges,
        enabled: parseBool(process.env.ENABLE_CHALLENGES, rawConfig.challenges?.enabled ?? true)
    },
    giveaways: {
        ...rawConfig.giveaways,
        enabled: parseBool(process.env.ENABLE_GIVEAWAYS, rawConfig.giveaways?.enabled ?? true),
        logChannelId: process.env.GIVEAWAY_LOG_CHANNEL_ID || rawConfig.giveaways?.logChannelId || ''
    },
    shop: {
        ...rawConfig.shop,
        enabled: parseBool(process.env.ENABLE_SHOP, rawConfig.shop?.enabled ?? true)
    },
    invites: {
        ...rawConfig.invites,
        enabled: parseBool(process.env.ENABLE_INVITE_TRACKING, rawConfig.invites?.enabled ?? true),
        fakeAccountAgeDays: process.env.FAKE_ACCOUNT_AGE_DAYS ? Number(process.env.FAKE_ACCOUNT_AGE_DAYS) : (rawConfig.invites?.fakeAccountAgeDays ?? 7)
    },
    verify: {
        ...rawConfig.verify,
        enabled: parseBool(process.env.ENABLE_VERIFY, rawConfig.verify?.enabled ?? true),
        roleId: process.env.VERIFIED_ROLE_ID || '',
        clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
        redirectUri: process.env.OAUTH_REDIRECT_URI || '',
        port: process.env.VERIFY_PORT ? Number(process.env.VERIFY_PORT) : 3000
    },

    // Secrets / environment-specific values (never hardcoded in config.json)
    token: process.env.BOT_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID || null,
    logChannelId: process.env.LOG_CHANNEL_ID || '',
    adminAlertChannelId: process.env.ADMIN_ALERT_CHANNEL_ID || '',

    // Owner ID: .env takes priority, falls back to config.json, then the
    // hardcoded InterENL Store default so the bot still boots if nothing is set.
    ownerID: process.env.OWNER_ID || rawConfig.ownerID || '1146698011641118761',

    // Extra Admin IDs configured directly via .env (ADMIN_IDS=id1,id2,id3).
    // These are ALWAYS treated as admins, in addition to anyone added at
    // runtime with /admin add (which is stored in admins.json). Useful as
    // a safety net / for IDs you don't want to depend on admins.json for.
    staticAdminIds: parseIdList(process.env.ADMIN_IDS),

    // Announcement channel: .env takes priority so you can fix/change it
    // without editing code or config.json.
    announceChannelId: process.env.ANNOUNCE_CHANNEL_ID || rawConfig.announceChannelId || '',

    // Ticket system: Staff/Owner role IDs. .env takes priority (most
    // reliable — role names can change or collide). Falls back to a
    // name search against config.tickets.staffRoleName/ownerRoleName
    // if left blank (handled in utils/roleResolver.js).
    ticketStaffRoleId: process.env.TICKET_STAFF_ROLE_ID || '',
    ticketOwnerRoleId: process.env.TICKET_OWNER_ROLE_ID || '',

    // Economy system: the channel Loot Drops get posted in.
    lootChannelId: process.env.LOOT_CHANNEL_ID || ''
};
