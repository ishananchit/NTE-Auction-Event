# Handoff — start here

Quick-orientation doc for picking this project back up in a new session. For the full blow-by-blow
history (every stage, every fix, every "why" decision was made a certain way), see
`implementation-plan.md` — that file is a detailed changelog, this one is a map.

## What this is

A locally-hosted, real-multiplayer web recreation of the "Going, Going, Gone!" auction minigame
from *Neverness to Everness*. 4 players (any mix of real people + bots) join a room via a short
code, each picks an Auction Assistant (free) and one Device Set (costs currency), then bid blind/
simultaneous across up to 6 rounds on a randomly-generated lot of collectibles laid out on a grid,
with partial info revealed over time via Assistants/Devices/Auctioneer Intel. Game rules/mechanics
are specced in `going-going-gone-mechanics.md` (treat that as source-of-truth for "what should this
do," separate from `implementation-plan.md`'s "what did we build and when").

**Status: fully working and deployed.** All 4 build stages are done (see `implementation-plan.md`),
plus a long tail of post-launch fixes/features from real playtesting. No known blocking bugs.

## Live deployment

- **Play it:** https://ishananchit.github.io/NTE-Auction-Event/
- **Repo:** https://github.com/ishananchit/NTE-Auction-Event (branch `main`)
- Auto-deploys via `.github/workflows/deploy-pages.yml` on every push to `main` — publishes just
  the `app/` folder. No build step, nothing to compile; pushing *is* deploying.
- Backend is a real Firebase/Firestore project (`nte-auction-event`) — not an emulator, not mocked.
  Config lives in `app/js/firebaseConfig.js` and is **not a secret** (Firebase's real security
  boundary is Firestore Rules, not hiding this object) — safe to commit, which it is.
- Firestore Rules are tightened (structural validation only, no per-player auth — see
  `firestore.rules` and the "Firestore rules tightened" entry in `implementation-plan.md`). They're
  managed by hand via the Firebase Console's Rules tab, **not** deployed from this repo — if you
  change `firestore.rules`, you must also paste it into the Console yourself.

## Run it locally

```
cd app
python -m http.server 8642
# open http://localhost:8642/index.html
```

Must be served over `http://`, not opened as a `file://` path (ES modules + `fetch` need it).
Multiple browser tabs = multiple players automatically (client identity is per-tab
`sessionStorage`, deliberately not `localStorage` — see `clientIdentity.js`). No deploy needed to
test multiplayer; every tab talks to the same real Firestore project regardless of where it's
served from.

**Regression tests** (pure logic, no browser, run before/after any engine change):
```
node scripts/test_auction_engine.mjs       # 36 checks — bidding/rounds/payout math
node scripts/test_devices_assistants.mjs   # 37 checks — devices/assistants/reveal privacy
```
Both currently pass. There is no automated UI/integration test suite — all UI/networking
verification in this project has been done via one-off headless-Chrome (CDP) scripts, written,
run, and **deleted** after confirming the behavior (see "Testing convention" below).

## Architecture at a glance

No build step, no framework, no bundler — plain ES modules loaded directly by the browser,
vanilla JS + HTML + CSS. This was a deliberate Stage-1 choice to keep GitHub Pages hosting trivial.

- **Game engine** (pure logic, framework-agnostic, unit-tested): `auctionEngine.js` (rounds/
  bidding/resolution), `poolStats.js` (Current Estimate math), `auctioneerIntel.js`, `effects.js` +
  `itemSelection.js` (the ~7 generic reveal-effect handlers everything shares), `lotGenerator.js` +
  `gridPacker.js` (lot generation, grid layout), `revealState.js` + `revealAccess.js` (the public-
  vs-private-per-player reveal-flag model that underlies all privacy in this game).
- **Static data**: `assistantCatalog.js` (8 assistants), `deviceCatalog.js` (17 device sets, ~38
  unique devices), `app/data/collectibles.json` (200 items — regenerate from
  `collectibles-template.xlsx` via `scripts/convert_collectibles.py` if the spreadsheet changes).
- **Networking**: `firebaseClient.js`/`firebaseConfig.js` (Firestore init), `roomSync.js` (all
  Firestore reads/writes), `roomCode.js`, `clientIdentity.js`. Architecture is **host-authoritative**:
  whoever created the room runs the actual engine; everyone else (including the host, for uniform
  code) submits intents into an `actions` Firestore subcollection that only the host drains and
  applies. One document per room at `rooms/{code}` holds the entire match state (~28KB, well under
  Firestore's 1MiB doc limit).
- **UI/orchestration**: `main.js` (by far the largest file — screen state machine, all rendering,
  all Firestore read/write call sites, the host-only round-resolution loop, bot scheduling) +
  `grid.js` (grid rendering) + `collectiblesIndex.js` (the browsable item catalog, also reused as a
  mid-match "what could this be" lookup — see `onCellPeek` in `grid.js`) + `bots.js` (placeholder
  bot bidding heuristic) + `style.css` + `index.html`.
- **Tunables**: `config.js` is the one place for numbers meant to be hand-tuned (balances, fees,
  thresholds, timers, lot size range) — check there before hunting for a magic number elsewhere.

## Known gaps / accepted tradeoffs (not bugs — deliberate, revisit if priorities change)

- **No real per-player access control.** No Firebase Auth; Firestore Rules only validate *shape*,
  not *identity* — anyone with a room's code can technically write any seat in that room. Privacy
  (hidden bids/balances/reveals) is enforced by what the client chooses to render, not by security
  rules. Fine for a private friend-group game; would need Anonymous Auth to actually harden.
- **Host-dependent.** If the host's browser tab closes mid-match, the match just stalls — no
  failover/migration. Accepted for a casual friend game.
- **Bots don't use devices**, even if a bot's seat happens to have some assigned (bots never get
  seats with devices anyway currently, since device sets are bought only by real seated players).
- **Session wallet is per-room, not cross-session.** No backend/auth means currency persists across
  matches *within one room* but resets if you reload into a new room. This is intentional scope,
  not a bug — see the "session wallet" entry in `implementation-plan.md`.
- **Two optional sound effects have no audio file yet** — see "In-flight / just landed" below.

## Devices — category filter removed (no longer a gap, see below)

The 6 devices that used to filter by collectible category (`"Antique Evaluation Device"`, `"Gem
Evaluation Device"`, `"Tech Evaluation Device"`, `"Food Evaluation Device"`, `"Daily Goods
Evaluation Device"`, `"Anomaly Evaluation Device"` in `deviceCatalog.js`) were dead weight — since
category data was never filled into the collectibles spreadsheet (every item's `category` is
`null` in `app/data/collectibles.json`), the category filter in `itemSelection.js`'s
`selectRandom()` always matched zero items, so these devices fired and consumed their one use but
revealed nothing. Fixed by dropping the category param and switching their `effectType` from
`"evaluation"` to `"rarityAndSize"` — they now all read "Reveals the rarity and silhouette of 3
random collectibles." and actually work, unrestricted (each Device Set still keeps its own
themed-named copy — e.g. "Antique Device Set" still has its own "Antique Evaluation Device" — they
just all now do the identical unrestricted reveal rather than a category-specific one). If real
category data is ever added to the spreadsheet, these could be reverted to category-filtered
`"evaluation"` devices instead — but as of now there's no plan to fill that column in.

Also added: **only one device use per round** (previously a player could fire every device they
owned in the same round). Enforced in `auctionEngine.js`'s `useDevice()` by checking whether
`match.privateLogs[playerId]` already has a `deviceUse` entry for `match.round`; the UI
(`renderBidEntry()` in `main.js`) mirrors this by showing "locked this round" instead of a "Use"
button on a player's other devices once one's been used that round. This is purely a per-round
throttle — each individual device is still separately one-time-use for the whole match, same as
before.

## In-flight / just landed this session (verify these if picking up immediately after)

Two new full-screen transition effects were just added and pushed (or about to be — check
`git log`/`git status` if unsure what's committed):

1. **"ROUND N" overlay** — 2-second full-screen darken + big text at the start of every round,
   including the match's first. Verified live for round 1; the round-2+ path was **not** directly
   re-confirmed via a clean live screenshot (bot matches kept resolving in round 1 before reaching
   round 2 during testing) — though the code has zero round-number-specific branching, so there's
   no plausible reason it would work for round 1 and not later ones. If something looks off with
   later-round transitions, start here.
2. **"SOLD TO <name>" overlay** — same mechanism, fires once when a match concludes with a winner
   (not for an unsold lot). This one **was** verified live end-to-end.

Both share one generalized overlay (`showTransitionOverlay(text, audioSrc)` in `main.js`, DOM ids
`match-transition-overlay`/`match-transition-text`) and both try to play an optional ~2s audio clip
that doesn't exist yet — silently no-ops if missing, so this isn't blocking anything:
- `app/audio/round-change.mp3` (round transitions)
- `app/audio/match-sold.mp3` (sold transition)

See `app/audio/README.md` for the exact expected filenames/format. No code changes needed once the
user drops real files in.

Also since this doc was first written: the "— Stage 4: networking" subtitle next to the page title
(both the `<h1>` and the `<title>` tag in `app/index.html`) was removed — the game is presentable
now and didn't need a visible build-stage label. If you see references to "Stage 4" elsewhere,
that's just this project's internal stage-numbering in `implementation-plan.md`, unrelated to the
old on-page text.

## Editing collectible data (values, weights, etc.)

`collectibles-template.xlsx` (repo root) is the single source of truth — `app/data/collectibles.json`
is a **generated** file, never hand-edit it. Workflow:

1. Edit the spreadsheet directly (price, rarity, size, or the "Chance to Appear" column).
2. Regenerate the JSON: `python scripts/convert_collectibles.py`.
3. Commit both the `.xlsx` and the regenerated `.json`.

Notes on "Chance to Appear" (the per-item weight used by `lotGenerator.js`'s weighted random draw):
- It's a **relative weight**, not a percentage — items are drawn proportionally to
  `weight / sum(all weights)`. It does not need to sum to 100.
- **Decimals are fine.** The draw is pure cumulative-sum + binary-search over floats
  (`buildCumulativeWeights`/`pickIndex` in `lotGenerator.js`), no integer assumption anywhere.
- These weights are currently **placeholder data**, not sourced from the real game (unknown/
  unobtainable) — every item was originally assigned a random integer weight in 5–10, except the
  2 highest-priced items which were pinned to 1 (see `going-going-gone-mechanics.md` §8). There is
  no script that auto-assigns or re-randomizes weights — `convert_collectibles.py` only does a
  straight passthrough of whatever's in the spreadsheet's "Chance to Appear" column, so editing a
  cell and re-running the script will not change any other item's weight.

## Testing convention (important if you write any verification code)

This project has **no persistent browser/integration test suite**. All UI and multiplayer
verification is done by writing a throwaway Node script under `scripts/` that drives headless
Chrome via the raw Chrome DevTools Protocol (CDP) — `fetch`-based `/json/new`, `/json/close`, and a
manual `Runtime.evaluate` JSON-RPC helper, no Puppeteer/Playwright dependency (keeps the "no build
step" philosophy). Pattern used repeatedly (search recent `implementation-plan.md` entries for
concrete examples):

1. Start a plain `python -m http.server <port>` from `app/` on a port the user isn't already using.
2. Launch `chrome.exe --headless=new --disable-gpu --remote-debugging-port=<port> --user-data-dir=<scratchpad>`.
3. Write a one-off `.mjs` script in `scripts/` that connects over the CDP WebSocket and drives the
   page (click buttons, read `textContent`/computed styles, take screenshots).
4. **Delete the script after confirming the behavior.** Only `test_auction_engine.mjs`,
   `test_devices_assistants.mjs`, and `convert_collectibles.py` are meant to be kept permanently.
5. **Always clean up processes afterward** — kill only the exact PIDs matching your test's
   `--headless`/port (via PowerShell `Get-CimInstance Win32_Process | Where-Object {...}`), never a
   blanket `pkill`, since the user's own real browser/servers may be running at the same time.
   `pkill -f` has been unreliable in this Windows/Git-Bash environment in the past — PID-targeted
   `Stop-Process` is the pattern that's worked reliably throughout this project.

## Git / attribution

Commit messages in this repo so far end with:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_<...>
```
The user is comfortable committing/pushing directly themselves too (confirmed explicitly) — don't
assume every change came through an AI session.
