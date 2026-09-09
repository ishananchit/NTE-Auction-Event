// Central place for tunable numbers we expect to keep adjusting during development/testing.
// Game-rule *accuracy* (what the source game actually does) lives in going-going-gone-mechanics.md —
// these are just the knobs for this recreation's balance/testing, kept in one file so they're easy
// to find and change without hunting through auctionEngine.js/main.js.

// Per-player starting money each match. Also doubles as each player's max bid cap for that
// match, since a bid can never exceed current balance (§4).
export const STARTING_BALANCE = 5_000_000;

// Session-level "wallet" — separate from the per-match auction balance above. Granted once
// when a player claims a seat in a room, and persists across matches within that room (there's
// no backend/auth, so it does NOT persist across browser sessions/rooms — see clientIdentity.js).
// Spent on the pre-match entry fee and device set purchases (see STARTING_MATCH_FEE below and
// the lobby's "Buy" flow in main.js).
export const STARTING_SESSION_BALANCE = 5_000_000;

// Flat fee deducted from every seated (non-bot) player's session wallet when the host starts a
// match. Floored at 0 rather than going negative if a player can't fully cover it.
export const STARTING_MATCH_FEE = 5_000;

// Which rounds get a new Auctioneer Public Intel log entry (§5b). Confirmed in-game: NOT every
// round gets one — screenshots showed Round 1 and Round 3 each with their own entry, so a
// sparser schedule is more accurate than "every round."
export const AUCTIONEER_INTEL_ROUNDS = [1, 3, 5];

// Fraction of the winner's overpay (when Earnings is negative) each of the other 3 players
// receives (§7 negative-profit spillover rule).
export const OVERPAY_SPILLOVER_RATE = 0.2;

// Round 1-4 win condition: highest bid must be >= this multiple of the round's second-highest
// bid (§4). Round 5 is highest-bid-wins (no multiplier, not listed here); Round 6 is tiebreak-only.
export const ROUND_THRESHOLDS = { 1: 2.0, 2: 1.6, 3: 1.3, 4: 1.1 };

// How long players get to act each round, in milliseconds (§3 says 60s in the real design;
// bumped way up here while we're still testing by hand).
export const ROUND_MS = 120_000;

// How long the "ROUND N" transition overlay covers the screen between rounds, in milliseconds
// (see main.js's showRoundTransition()). Added on top of ROUND_MS when setting each round's
// deadline so the overlay doesn't eat into anyone's actual bidding time.
export const ROUND_TRANSITION_MS = 2_000;

// Number of columns in the lot grid (§5a). Computed once per lot at generation time (see
// lotGenerator.js) and synced as part of the lot so every player sees the identical layout.
export const GRID_WIDTH = 10;

// A lot's item count is randomized in [LOT_MIN_ITEMS, LOT_MAX_ITEMS] each match (§8 "Lot
// randomization algorithm") — see lotGenerator.js's generateLot().
export const LOT_MIN_ITEMS = 30;
export const LOT_MAX_ITEMS = 60;

// The rendered grid's row count is held constant at every lot, regardless of how many rows that
// lot's items actually pack into — otherwise a cheap/small lot renders as a visibly shorter grid
// than an expensive/large one, leaking size info before anything's been revealed. Extra rows
// beyond what's needed just render as empty dark background (see grid.js).
//
// Value derivation: the largest collectible in the pool is 5x5 (25 cells — see
// app/data/collectibles.json); two 5x5 items pack perfectly side-by-side across the 10-wide grid
// with zero wasted space, so the worst case at LOT_MAX_ITEMS items is exactly
// ceil(LOT_MAX_ITEMS / 2) * 5 rows. Empirically confirmed against gridPacker.js with that exact
// pathological all-5x5 input (and several other adversarial size mixes) before adding a margin
// on top for safety.
export const GRID_FIXED_HEIGHT = Math.ceil(LOT_MAX_ITEMS / 2) * 5 + 20;
