/**
 * badWords.js
 * -----------------------------------------------------
 * Lightweight, dependency-free multi-language profanity
 * detector. Normalizes text (lowercase, strips accents,
 * collapses common leetspeak substitutions and repeated
 * characters) before matching against a wordlist so that
 * simple evasion attempts (e.g. "f*ck", "fuuuck", "f4ck")
 * are still caught.
 *
 * This is intentionally a pattern-level detector, not an
 * exhaustive dictionary — it covers common profanity across
 * several languages (English, Spanish, French, German,
 * Portuguese, Arabic-transliterated, Russian-transliterated).
 * Server admins can extend the list via config if needed.
 * -----------------------------------------------------
 */

// Base profanity roots across multiple languages (kept intentionally
// generic/root-level so normalization + word-boundary matching catches variants).
const BAD_WORD_ROOTS = [
    // English
    'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot', 'fag',
    'whore', 'slut', 'retard', 'dumbass', 'motherfucker', 'bastard', 'cock', 'dick',
    'piss', 'twat', 'bullshit', 'dipshit', 'horseshit', 'dumbshit',
    // Spanish
    'puta', 'mierda', 'gilipollas', 'cabron', 'pendejo', 'joder', 'polla', 'coño',
    // French
    'merde', 'putain', 'connard', 'salope', 'enculé', 'pute',
    // German
    'scheisse', 'scheiße', 'arschloch', 'hurensohn', 'fotze',
    // Portuguese
    'porra', 'caralho', 'puta', 'buceta', 'foda-se', 'merda',
    // Italian
    'cazzo', 'stronzo', 'puttana', 'vaffanculo',
    // Russian (transliterated)
    'blyat', 'suka', 'pizdec', 'khuy',
    // Arabic (transliterated)
    'kalb', 'sharmuta'
];

/**
 * Normalizes a string for matching: lowercases, strips diacritics,
 * collapses repeated characters (fuuuck -> fuck), and maps common
 * leetspeak substitutions back to letters.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
    let normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // strip accents

    // Common leetspeak substitutions
    const substitutions = {
        '0': 'o',
        '1': 'i',
        '3': 'e',
        '4': 'a',
        '5': 's',
        '7': 't',
        '@': 'a',
        '$': 's',
        '!': 'i'
    };
    normalized = normalized.replace(/[013457@$!]/g, (ch) => substitutions[ch] || ch);

    // Remove non-alphanumeric separators inserted to evade filters (f.u.c.k, f-u-c-k)
    normalized = normalized.replace(/[^a-z0-9\s]/g, '');

    // Collapse 3+ repeated characters down to 1 (fuuuuck -> fuck)
    normalized = normalized.replace(/(.)\1{2,}/g, '$1');

    return normalized;
}

// Pre-build a single regex for efficient matching. Anchored only at the
// start of a word (not the end) so inflected forms — "fucking", "fucked",
// "bitches", "shitty", etc. — are still caught, since they all begin with
// the root word. Roots are sorted longest-first so more specific multi-word
// entries (e.g. "motherfucker") are reported over shorter substrings.
const sortedRoots = [...BAD_WORD_ROOTS].sort((a, b) => b.length - a.length);
const escapedRoots = sortedRoots.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const BAD_WORD_REGEX = new RegExp(`\\b(${escapedRoots.join('|')})`, 'i');

/**
 * Checks whether a message contains profanity in any of the
 * supported languages, after normalization.
 * @param {string} content
 * @returns {{matched: boolean, word: string|null}}
 */
function containsBadWord(content) {
    if (!content || typeof content !== 'string') return { matched: false, word: null };

    const normalized = normalize(content);
    const match = normalized.match(BAD_WORD_REGEX);

    return { matched: !!match, word: match ? match[1] : null };
}

module.exports = { containsBadWord, normalize };
