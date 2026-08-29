/**
 * blackjackEngine.js
 * -----------------------------------------------------
 * Minimal single-deck Blackjack rules engine: deal, score
 * (with Ace-as-1-or-11 handling), and dealer auto-play
 * (hits until 17+). No UI/Discord code here — the command
 * file owns rendering + the button collector.
 * -----------------------------------------------------
 */

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * @returns {Array<{rank: string, suit: string}>} A fresh shuffled deck.
 */
function buildShuffledDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) deck.push({ rank, suit });
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

/**
 * Scores a hand, treating Aces as 11 unless that would bust,
 * in which case they count as 1 (standard Blackjack rules).
 * @param {Array<{rank: string, suit: string}>} hand
 * @returns {number}
 */
function scoreHand(hand) {
    let total = 0;
    let aces = 0;

    for (const card of hand) {
        if (card.rank === 'A') {
            aces += 1;
            total += 11;
        } else if (['J', 'Q', 'K'].includes(card.rank)) {
            total += 10;
        } else {
            total += Number(card.rank);
        }
    }

    while (total > 21 && aces > 0) {
        total -= 10;
        aces -= 1;
    }

    return total;
}

/**
 * @param {Array<{rank: string, suit: string}>} hand
 * @returns {boolean} True if this is a natural 21 (2-card Blackjack).
 */
function isNatural21(hand) {
    return hand.length === 2 && scoreHand(hand) === 21;
}

/**
 * @param {{rank: string, suit: string}} card
 * @returns {string} e.g. "A♠️"
 */
function formatCard(card) {
    return `${card.rank}${card.suit}`;
}

/**
 * @param {Array<{rank: string, suit: string}>} hand
 * @returns {string}
 */
function formatHand(hand) {
    return hand.map(formatCard).join(' ');
}

/**
 * Plays the dealer's turn per standard rules: hit until 17+.
 * Mutates and returns the same deck/hand references.
 * @param {Array<{rank: string, suit: string}>} deck
 * @param {Array<{rank: string, suit: string}>} dealerHand
 */
function playDealerTurn(deck, dealerHand) {
    while (scoreHand(dealerHand) < 17) {
        dealerHand.push(deck.pop());
    }
}

module.exports = { buildShuffledDeck, scoreHand, isNatural21, formatCard, formatHand, playDealerTurn };
