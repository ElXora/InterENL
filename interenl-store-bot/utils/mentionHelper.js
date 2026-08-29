/**
 * mentionHelper.js
 * -----------------------------------------------------
 * Discord ONLY sends a real ping/notification for mentions
 * that appear in a message's `content` field. A mention typed
 * or pasted inside an embed (title/description/fields/footer)
 * renders as flat, non-clickable text and never notifies
 * anyone — that's a hard Discord platform limitation, not a
 * bug in this bot's embed code.
 *
 * Anywhere admins type free text that might contain @everyone,
 * @here, or a raw <@id> / <@&id> mention (e.g. the /announce
 * modal), pull the real mention tokens out with extractMentions()
 * and send them in the message's `content` alongside the embed —
 * that's the only way Discord will actually notify anyone.
 * -----------------------------------------------------
 */

const MENTION_REGEX = /@everyone|@here|<@!?\d+>|<@&\d+>/g;

/**
 * Finds every real mention token in a string (@everyone, @here,
 * <@userId>, <@&roleId>) and returns them deduped, space-joined,
 * ready to drop straight into a message's `content`.
 * Plain "@SomeUsername" typed by hand (not a real Discord mention
 * token) is intentionally ignored — Discord's mention autocomplete
 * doesn't work inside modals, so there's no reliable way to turn
 * hand-typed text into a real ping without the actual ID.
 * @param {string} text
 * @returns {string} e.g. "@everyone <@&123456789012345678>", or '' if none found.
 */
function extractMentions(text) {
    if (!text) return '';
    const matches = text.match(MENTION_REGEX);
    if (!matches) return '';
    return [...new Set(matches)].join(' ');
}

/**
 * The allowedMentions payload to pass alongside extracted mentions
 * so Discord is explicitly told it's OK to actually ping — relying
 * on library defaults isn't guaranteed to survive a discord.js
 * upgrade, so this is set explicitly wherever extractMentions() is used.
 */
const ALLOW_ALL_MENTIONS = { parse: ['everyone', 'users', 'roles'] };

module.exports = { extractMentions, ALLOW_ALL_MENTIONS };
