# Going, Going, Gone! — Game Mechanics Reference

Source game: *Neverness to Everness* (NTE), event added in v1.2.
Purpose of this doc: capture **only core gameplay functionality** needed to recreate the mode locally for friends. Reward tables (Gold Shells payout amounts, cosmetic prizes, Annulith, currency conversion rates, entry fee/asset numbers) are intentionally omitted — those are tunable economy numbers, not mechanics, and can be redesigned freely for a homebrew version.

Sources: initial pass cross-referenced NTE Fandom wiki, GameWith, Game8, AllThings.How, Kaiden.gg, Icy Veins, GamerAnt, EnjoyGM, Genshin-Builds NTE blog (some early cross-source conflicts on assistant naming, since resolved). Assistant and Device data below was later replaced entirely with ground truth extracted from the user's own in-game screenshots — see §5 and the companion data files noted there. Live-match UI/flow details (§3, §4, §5a, §5b, §5e, §7) were confirmed from a further batch of gameplay screenshots (`images/general info`) showing actual auction rounds and end-of-auction results screens.

**Companion data files (same folder):**
- `assistants-and-devices.json` — full, user-verified list of all 8 Auction Assistants and all 17 Device Sets with exact ability/effect text and prices. This is the source of truth for that content; this doc only summarizes it (see §5).
- `collectibles-template.xlsx` — spreadsheet of the Collectibles item pool (name, price, rarity, grid size, etc.), populated with all ~200 items extracted from the game's in-match Collectibles Index screenshots; category, shape/grid-size, and chance-to-appear columns are still being filled in by the user.

---

## 1. High-Level Concept

A **4-player** competitive auction mini-game. Each match, players bid against each other on "lots" of hidden **Collectibles** using the player's persistent currency balance ("Gold Shells"/"My Assets" in the source game — call it whatever you like locally; confirmed via screenshots to carry over and deplete across consecutive matches, **not** reset per match — see §2/§8). You don't know the exact contents/value of a lot up front — you only get partial information via reveals — and you're trying to:

1. Estimate what the lot is actually worth.
2. Win the auction for **less** than that value (profit), or at least not badly overpay.
3. Avoid being baited into overpaying by opponents who already know (or have guessed) the lot is low value.

Winning a bid is **not** the win condition by itself — profitability is the real scoreboard. You can "win" an auction and still net-lose currency if you overpaid.

---

## 2. Pre-Match Setup

1. **Venue/tier select** — the source game has 3 tiers (Shell Hall / Coral Hall / Pearl Hall) gating entry by a currency/asset threshold, with higher tiers containing higher-value lots and presumably higher variance. **Decision for this recreation: skipped for now** — run one flat set of stakes instead of a 3-tier system. (Documented here only so the option exists if we revisit it later.)
2. **Pick an Auction Assistant** — a character whose passive ability reveals certain information about the lot at certain points during the match (see §5). Any unlocked character can be slotted as assistant regardless of whether you "own" them as a playable character. There are exactly **8 assistants**, full ability text in `assistants-and-devices.json`.
3. **Buy Device Set(s)** — spend currency to buy a Device Set; doing so grants you *all* the individual one-time-use devices bundled inside that set (typically 3–5 per set) into your persistent inventory. Unlike the assistant (passive/automatic), devices are player-triggered and each is consumed only at the moment it's activated. There are **17 Device Sets** (2,000 to 200,000 currency), full contents in `assistants-and-devices.json`.
4. **Matchmake** — 4 players joined into one match/lobby.

There is no "game session"/"game night" container concept — a player can start a match at any time, any number of times, and their currency balance and device inventory persist indefinitely across matches (not reset per session).

---

## 3. Match Structure

A match = **one single lot** (one bundle of Collectibles), auctioned over up to **6 sequential bidding rounds** (§4). It is not a series of separate lots — the same item bundle persists across all rounds, bids carry over/accumulate round to round, and information revealed in earlier rounds stays revealed and stacks in a visible log for later rounds (confirmed: the Round 3 info panel in one captured match still showed the Round 1 reveal alongside new Round 3 reveals). The match ends the moment the lot sells, or goes unsold if Round 6 also ends in a tie.

Note: the captured screenshots' bid-slot UI only showed 5 numbered slots per player — this discrepancy is now resolved. In the source game, the main 4-player bid UI (5 slots) only ever covers Rounds 1–5; if Round 5 ends tied, the game swaps to a **separate, second UI** for Round 6, showing only the 2 (or more) tied players bidding head-to-head. **Decision for this recreation: skip that separate tiebreak UI entirely.** We use a single main bid UI with **6 slots** for all players from the start — everyone just has an unused 6th slot unless a Round 6 tiebreak actually happens, which is functionally simpler to build and behaves identically from the players' side.

To play again, players start an entirely new match/matchmaking cycle with a fresh lot — that's the unit you'd loop for a game night, not something nested inside one match.

### Per-round timer
**Decision for this recreation: 60 seconds per round**, hard cap. Each round, players have that window to review revealed info and either **Bid**, **Pass**, or trigger an owned **Device** before the round auto-advances. (Screenshots showed the source game's own timer running shorter, roughly 23–45s observed — the local recreation uses a flat 60s instead.) All 4 players act simultaneously/independently within the timer window (not turn-based).

---

## 4. Bidding Rounds & Win Conditions (per lot)

Each lot auction plays out over up to **6 rounds** (see §3). The condition required to *close* the auction changes every round — the required margin over the field shrinks as rounds progress, so it gets progressively easier to lock in a win the longer the auction drags on:

| Round | Condition to win the lot outright |
|-------|-----------------------------------|
| 1 | Your bid must be **≥ 2.0×** the current second-highest bid |
| 2 | Your bid must be **≥ 1.6×** the current second-highest bid |
| 3 | Your bid must be **≥ 1.3×** the current second-highest bid |
| 4 | Your bid must be **≥ 1.1×** the current second-highest bid |
| 5 | **Highest bidder simply wins** (no multiplier requirement) |
| 6 | **Tiebreaker only** — triggers if Round 5 ends with 2+ players tied for highest bid. Those tied players continue bidding; highest bid wins. If Round 6 also ties, the lot goes unsold. |

Since Round 1 has no bids yet from any previous round, "second-highest bid" almost certainly means the second-highest bid **among that same round's simultaneous bids** (all 4 players act within the same countdown window, see §3), not a bid carried over from an earlier round — the same reading applies to every round's threshold, not just Round 1.

Confirmed from the in-game bid-entry screen:
- The numeric bid keypad shows a **quick-multiplier button matching that round's exact threshold** (e.g. a "1.3×" button appears during Round 3) so you don't have to compute it yourself, plus a **"Previous Round Bid"** quick-fill button and a separately-labeled **"Suggested Bid"** figure (basis unclear — didn't cleanly match either the current estimate or the previous round's bid in the captured example, so treat it as a rough hint rather than a formula-backed number).
- Your bid is **hard-capped at your current currency balance** — the input range shown is explicitly `0` to your exact "My Assets" total. There's no bidding on credit/debt.

Mechanically:
- Each round, players choose one of: **Bid** (raise/set this round's bid), **Pass** (sit this round out), or **Device** (activate an owned device instead of/alongside bidding — see §5c).
- If nobody meets a round's multiplier condition, the auction simply advances to the next round (thresholds relax).
- Players are free to bid low or skip/pass on a lot they've judged not worth pursuing, to conserve currency for a later lot.
- Because the threshold shrinks each round, a player who is confident of the true value can deliberately let rounds pass to force a cheaper eventual win — but risks a rival closing it out early in Round 1–2 if the rival is willing to pay the steep multiplier.

---

## 5. Information / Reveal System

The core tension of the mode is **imperfect information about lot value**, resolved via four parallel channels:

**Information privacy — confirmed by the user, important:** only **Auctioneer Public Intel** (§5b) is shared identically with all 4 players. **Everything an Assistant (§5c) or a Device (§5d) reveals is private to the player who owns it** — the other 3 players never see it, don't get it added to their own knowledge, and don't see a log entry for it. This is what makes the mode a real information-asymmetry competition: each player is quietly building their own private picture of the lot's value from their own assistant + devices, while only the auctioneer's baseline facts are common knowledge. (Earlier drafts of this doc incorrectly assumed all reveals were shared/global — corrected here.)

### 5a. The grid, shape reveals, and the live value estimate
- Collectibles in the lot are laid out on a **grid** (confirmed from screenshots: a wide multi-column/multi-row grid, scrollable, shown on the right side of the auction screen, with the grid's own lattice/boundary lines visible from the start regardless of what's been revealed). Each item occupies some rectangular footprint of grid cells (1×1 up to multi-cell blocks like 1×2, 2×2, 1×3, etc.), assigned at lot-generation time (packing all the lot's item shapes into the grid without overlap is a separate implementation task, not yet solved here).
- **Rarity and silhouette (shape) are two independent boolean reveal flags per item, not a combined state** — this is the important correction from earlier drafts of this doc, confirmed directly from a zoomed screenshot (`images/general info/Screenshot (1829).png`) plus exact in-game ability text. **"Silhouette" is simply the in-game name for the shape reveal** (equivalent to "shape reveal"/"grid shape" — use whichever term reads clearer in code/docs, they mean the same thing) — it is *not* a term for "rarity + shape both known." Confirmed from `assistants-and-devices.json`: Haniel's ability text is *"Reveals the rarity **and** silhouettes of 5 random collectibles..."* — phrased as two separate things being granted together, not one combined reveal type.
  - `rarity_known` (bool): if true, that item's rarity tier is known.
  - `shape_known` (bool, = "silhouette revealed"): if true, that item's exact grid footprint (size + shape) is known.
  - **These flags are per-player, not global** (see the information-privacy note above) — concretely: a `public` copy set only by Auctioneer Intel (same for every player), and a private copy per player set only by their own Assistant/Devices. What a given player actually sees for an item is the merge of the public copy and their own private copy — never anyone else's private copy. The grid a player looks at during a live match is *their own* view; two players can (and usually will) see a given lot differently.
  - An item can have either flag true independently of the other, both, or neither. Rendering is just a function of these two flags plus a separate `fully_revealed` flag:
    1. **Neither known:** the item's cell(s) render as empty/black — nothing about it is known, not even that an item occupies that space.
    2. **`rarity_known` only:** exactly **one** of the item's grid cells (not its whole footprint) is filled in with its rarity color, with **no outline/border**. E.g. a 3×2 item can have just 1 of its 6 cells colored — that tells you a rarity exists there, but nothing about the item's true size or full footprint. Confirmed visually: the isolated single green square and single grey squares in the reference screenshot, sitting alone with plain black cells around them.
    3. **`shape_known` only (silhouette revealed, rarity not):** the item's full multi-cell footprint is traced/outlined (with the same glowing border as case 4 below) so its exact size and shape are visible, but filled in a neutral/grey since rarity isn't known yet. (Inferred from the mechanic, not yet directly seen in a screenshot — every shape-revealed item captured so far also happened to have its rarity known.)
    4. **Both known:** the item's full multi-cell footprint is shown with the glowing outline (same as case 3) but now filled with its true rarity color instead of grey. Confirmed visually: the multi-cell purple and gold blocks in the reference screenshot.
    5. **Fully revealed** (Appraisal-type devices, or automatically once the auction ends — implies both flags true): the cell(s) swap from the color block to the item's actual icon + name, still with a colored border showing rarity.
  - Maps directly onto the device glossary (§5d): **Size Device → sets `shape_known`**, **Evaluation Device → sets `rarity_known`**, **Appraisal Device → sets everything (case 5)**. An Assistant/Intel line that says "reveals rarity and silhouettes of N items" sets **both** flags for those N items at once (case 4), while one that says "reveals the rarity of N items" sets only `rarity_known` (case 2).
- A **"Current Estimate"** figure is shown on-screen throughout the auction (labeled exactly that in-game) and increases over the rounds as more info is revealed and factored in. Since reveals are per-player (see above), **Current Estimate is a per-player number too** — each player's screen shows their own estimate, computed from their own merged public+private knowledge, not one shared "true" figure. Confirmed from two captured matches: the Current Estimate while bidding was still in progress ran dramatically **lower** than the lot's final true value (`Actual Value`, see §7) revealed at the end — e.g. one match's estimate was still only ~182K in Round 2 versus a final Actual Value of ~1.05M; another was ~51K by Round 3 versus a final ~726K. Treat it as a floor/lower-bound anchor that updates as evidence comes in, not a fair-value prediction — trusting it at face value is a losing strategy.
- The **Collectibles Index** (see §5e) is the player-driven deduction tool for turning a silhouette (`shape_known`, case 3 or 4) block into a real guess at what item it is and what it's worth.

### 5b. Auctioneer Public Intel (baseline, automatic, free)
- Separate from the Auction Assistant, the auctioneer itself pushes out at least one **free, automatic "Auctioneer Public Intel"** fact on certain rounds (Rounds 1/3/5 by default — see §8/`config.js`), visible identically to all 4 players — confirmed examples seen in-game: *"Total number of collectibles this round: 47"* (the lot's total item count), *"Total number of Gold-rarity collectibles this round: 6"* (a per-rarity item count), and *"Average value of all Blue-rarity collectibles this round: 0"* (a per-rarity average value — the `0` here confirms a lot can legitimately contain **zero** items of a given rarity tier).
- **Two more Auctioneer Public Intel card types exist, confirmed by the user**, and unlike the three above, these actually grant item-level reveals rather than just aggregate stats: one reveals the **rarity of 2 random collectibles**, the other the **silhouette (shape) of 2 random collectibles** — the exact same effect as an Evaluation/Size device or an assistant's rarity/shape grant, just issued for free from the Auctioneer channel instead. All 5 card types (3 aggregate-stat, 2 item-reveal) are equally likely each time Auctioneer Intel fires.
- These read like free, baseline instances of the same stat categories the paid Count/Valuation/Average Value/Evaluation/Size Devices provide (§5d/§6) — i.e. devices are how you buy *more* of what the auctioneer already partially hands out for free.
- Auctioneer Public Intel accumulates in a shared log/feed visible to all 4 players (confirmed: a Round 3 info panel still showed the Round 1 reveal above the new Round 3 ones), matching the "info persists across rounds" rule in §3. Assistant (§5c) and Device (§5d) reveals also persist for the rest of the match, but each in that *specific player's own private log* — see the "information privacy" note above §5a.

### 5c. Auction Assistant (passive, automatic, chosen pre-match)
Each of the 8 assistants has exactly one ability that fires automatically on a fixed schedule tied to the round number — no player input required, and it's free (no currency cost). **Its reveals are private to the player who picked that assistant** (see the privacy note above §5a) — a "Draw!" firing doesn't tell the other 3 players anything. Full exact text for all 8 (Adler, Haniel, Jiuyuan, Chiz, Hathor, Edgar, Daffodill, Hotori) is in `assistants-and-devices.json` under `auctionAssistants`; don't duplicate it here, just know the shape of it: schedules vary between "reveal a batch of silhouettes/rarities up front then trickle more each round," "reveal one thing per round on a timer," "reveal counts/totals instead of specific items," and "reveal nothing until Round 5, then dump a lot of info at once" (high-risk pick, useless if the auction ends before Round 5). In-game, each assistant reveal appears in the round log as a **"Draw!"** entry with the owning player's assistant portrait attached — confirmed examples: *"Reveals the rarity and silhouettes of 5 random collectibles"* and *"Reveals the rarity of 2 unknown collectibles."*

### 5d. Device Sets (active, player-triggered, currency-bought)
- Bought with currency before/between matches — buying a **Device Set** grants *all* the individual devices bundled inside it (3–5 devices per set) into the player's persistent inventory. **A device's reveal is private to the player who triggered it** (see the privacy note above §5a) — same rule as Assistants.
- During any round, the player can hit a UI button (source: bottom-left of the auction screen) to activate one owned device and get an immediate, one-shot reveal about the **current lot only**. Each individual device is single-use — once triggered it's consumed — but a set with N devices gives N separate activations usable across the match (not N per round).
- Full exact list of all 17 Device Sets, their prices, and every individual device's exact effect is in `assistants-and-devices.json` under `deviceSets`. The reveal-type naming is consistent enough to treat as a glossary:
  - **Evaluation Device** → reveals the *rarity* of N random collectibles.
  - **Size Device** → reveals the *silhouette/shape* of N random collectibles.
  - **Appraisal Device** → *fully* reveals N random collectibles (identity + rarity + price all at once).
  - **Count Device** → reveals the *total number* of collectibles at a given rarity (no identities).
  - **Valuation Device** → reveals the *combined value* of all collectibles at a given rarity.
  - **Average Value Device** → reveals the *average value* of collectibles at a given rarity, or occupying N grid slots.
  - **Slot Device** → reveals *total grid slots occupied* by all collectibles at a given rarity.
  - Category-flavored variants (Antique/Gem/Tech/Food/Daily Goods/Anomaly Evaluation Devices) work like a normal Evaluation Device but restricted to — and only useful when the lot contains — that specific category.
- Devices are tiered by power (Basic → Medium → Advanced → Premium → Super → Supreme), general-purpose sets mix reveal types broadly, category-specific and rarity-specific sets are narrower but stronger when applicable.
- Unused devices roll over indefinitely — they're a persistent inventory, not consumed by being owned, and don't reset between matches or "sessions" (there is no session concept, see §2).

Design takeaway: assistants are a free, automatic, fixed-schedule read; devices are a paid, spendable, player-timed, sharper read. Both exist so players always have a guaranteed baseline plus an optional deeper dig.

### 5e. Collectibles Index (player-driven deduction tool)
Confirmed from screenshots — this is the mechanic that ties §5a's silhouettes together with the full item pool (`collectibles-template.xlsx`), and wasn't previously documented:
- A **"Collectibles Index"** button (bottom-right of the auction screen) opens the full master catalog of every possible Collectible in the game — the same browsable list captured for `collectibles-template.xlsx` — with **Rarity** and **Type/Category** filters, plus a **Shape filter**: a palette of ~25 distinct footprint shapes (1×1, 1×2, 2×2, L-shapes, etc.) that map to how items appear on the auction grid.
- During a live auction, once a grid cell shows a colored silhouette block (a known rarity + a known shape, but no identity yet — see §5a), the player can open the Index, apply that exact **Rarity + Shape** filter combo, and see every catalog item that matches — narrowing an anonymous block down to a short list of real candidate items and their known prices. More filters (rarity, revealed category, etc.) narrow it further as more info comes in.
- This is the primary tool for converting raw reveals into an actual value estimate beyond just trusting the on-screen "Current Estimate" (§5a) — i.e. the intended skill expression of the mode is manual deduction against the catalog, not just reading a number.

---

## 6. Collectible Value Model

- Collectibles have a **rarity/color tier** that correlates with value. Colors cited (ascending): **white → green → blue → purple → gold → red**. (Common/low-value items may not even bother distinguishing rarity, per one source — "the item is common enough that its rarity doesn't matter much.")
- Each distinct Collectible has a fixed, known-to-the-game (but hidden-to-player-until-revealed) value, presumably from a master price index/table — this is exactly what `collectibles-template.xlsx` is for.
- A lot = a bundle of collectibles whose combined value is the number players are trying to estimate. **Decision for this recreation:** lot size is random, roughly **30–60 items** per lot (not a fixed count). Confirmed example from a real match: a 47-item lot.
- **Rarity composition varies per lot and can hit zero.** Confirmed in-game: an Auctioneer Public Intel reveal read *"Average value of all Blue-rarity collectibles this round: 0"* — meaning that particular lot simply contained no Blue-rarity items at all. Don't assume every lot has at least one item of every rarity tier.
- Collectibles also have a **Category**, confirmed exhaustive list (from the Device Set names): **Antique, Gem, Tech, Food, Daily Goods, Anomaly (Anomaly Residual)** — plus items can apparently fall outside any specialized category (covered by "general-purpose" devices instead). Category is orthogonal to rarity.
- Collectibles occupy a **grid footprint** (see §5a) — each item has a size/shape distinct from its rarity, tracked separately by devices as "silhouette/shape" (Size Devices), "slots occupied" (Slot Devices), and there's a callout for whichever single item "occupies the most slots" in a lot (Special/Supreme-tier devices target that item specifically). This implies size is itself a value-relevant axis, independent of rarity — bigger items are apparently notable enough to have dedicated reveal tools. The in-game Collectibles Index exposes a filterable palette of ~25 distinct footprint shapes (see §5e) — the palette's existence is confirmed, but the exact cell-pattern for each of the 25 shapes (and which catalog item uses which) is still not transcribed anywhere.

---

## 7. Resolution / Payout Logic (mechanics, not amounts)

Confirmed in-game terminology (from "Auction Ended" results screens):

| Field (as labeled in-game) | Meaning |
|---|---|
| **Final Sale Price** | The winner's winning bid — what they paid. |
| **Actual Value** | The lot's true total combined value, only revealed once the auction ends. |
| **Earnings** | `Actual Value − Final Sale Price`. Shown directly, in green when positive and red when negative — **confirmed negative in a captured example** (a player paid 800,001 for a lot with Actual Value 726,326, i.e. Earnings of **−73,675**), so overpaying is a real, visible loss, not just a design implication. |

- **Winner of a lot** pays their Final Sale Price, receives the lot's items, and only *then* sees Actual Value / Earnings.
- **Negative-profit spillover rule (confirmed, permanent):** if the winner's Earnings are negative, each of the *other three* players receives a payout equal to **10% of that negative amount** — overpaying doesn't just hurt the winner, it directly benefits everyone who declined to win.
- **No performance grade in this recreation.** The source game shows a letter grade (S/A/B/etc.) plus flavor text scoring the winning bid — **dropped entirely for the local build**, not needed.
- **No cash-out-vs-hold choice.** The source game lets the winner individually checkbox items to sell vs. keep in inventory — **not used here**. In this recreation, winning a lot **instantly cashes out the entire lot**: Earnings (Actual Value − Final Sale Price, positive or negative) is applied directly to the winner's account balance, and the other three players get their 10% spillover if Earnings was negative. There's no separate item inventory to manage after a match.
- A **low-balance safety net** exists in the source game (claim a flat currency top-up a limited number of times per day if your balance drops below a floor) — purely an anti-softlock mechanic so a bad run doesn't end your ability to keep playing; worth keeping some version of this for a home game so one bad auction doesn't eliminate a player from the rest of the session.

---

## 8. Design Decisions for the Local Recreation

Things the sources didn't nail down precisely, and the calls made for this build:
- **Lot size:** random, roughly **30–60 items** per lot (not a fixed count).
- **Sessions:** no "game night"/session concept exists — players can start a match anytime, as many times as they want; no per-session reset.
- **Collectible pool:** still needs a full value table — this is what `collectibles-template.xlsx` is for (user's own curated item list, real or joke items).
- **Venue tiers:** skipped for now — one flat set of stakes, no 3-tier Shell/Coral/Pearl Hall system.
- **Persistence:** currency and device inventory persist indefinitely per player, across all matches, forever (not reset per session — see above, same answer).
- **Currency name:** call it **"money"** for now.
- **Per-round bid timer:** fixed at **60 seconds**, regardless of what the source game itself used (§3).
- **Round count:** 6 rounds, Round 6 being tiebreak-only if Round 5 ties (§4) — going with the original web-research finding over the 5-slot UI seen in screenshots.
- **One bid UI, not two:** the source game swaps to a separate 2-player tiebreak UI for Round 6. This recreation skips that — the main bid UI just has **6 slots** for everyone from the start (§3), and only fills the 6th if a tiebreak actually happens.
- **Negative-profit spillover:** confirmed permanent — losing bidders each get 10% of the winner's overpay (§7).
- **No performance grading:** the source game's S/A/B letter-grade + flavor text after each auction is dropped entirely (§7).
- **No cash-out-vs-hold / item inventory:** winning a lot instantly cashes out the whole thing — Earnings go straight to the winner's balance, no per-item keep/sell choice and no persistent item inventory (§7).
- **Lot randomization algorithm:** to build a lot, (1) pick lot size `N` uniformly at random in **30–60**; (2) treat every collectible's `Chance to Appear` value as a **relative weight** (not an independent probability) and build one cumulative-sum array over the full pool; (3) draw `N` items by picking a random point on that cumulative sum (binary search) each time — this is standard **weighted random sampling with replacement**. Duplicates are allowed (an item can appear more than once in a lot; nothing is removed from the pool after being drawn). Chosen over a shuffle-and-Bernoulli-trial-per-item approach because it's simpler (no wraparound/loop-back bookkeeping), guarantees exactly `N` draws with no open-ended retry loop, and produces the identical statistical result: each item's appearance frequency ends up proportional to its `Chance to Appear` weight.
- **`Chance to Appear` values are currently placeholder data**, not sourced from the real game (unknown/unobtainable): every item in `collectibles-template.xlsx` was assigned a random integer weight in **5–10**, except the top 2 highest-priced items (Golden Koi Statue, Pendragon Model — both extreme outliers, see their Notes), which were pinned to a weight of **1** so they stay very rare. These are meant to be tuned/replaced later, not treated as authoritative.
- **Grid packing:** random skyline/"bottom-left" packing (items in shuffled order, each placed wherever it lands lowest), not sorted by size — so large and small items scatter across the grid instead of clustering top-to-bottom by size. ~87% space utilization measured in practice, which is an acceptable amount of leftover blank space.
- **Rarity-only reveal dot position:** the single visible cell for a `rarityKnown`-but-not-`shapeKnown` item is a random cell within that item's true footprint (chosen once at lot generation, stable across re-renders) — not always the top-left/anchor cell, so the dot's position can't itself hint at where the item's boundary starts.
- **"Second-highest bid" (§4) is scoped to that same round's simultaneous bids**, defaulting to **0** if fewer than 2 players bid that round. Concretely: if exactly one player bids in a Round 1–4 and everyone else passes, that lone bid trivially clears the threshold (anything ≥ threshold × 0) and wins immediately at that bid amount — nobody contested it. An exact tie for highest never clears a Round 1–4 threshold (ratio = 1.0x, below every threshold ≥ 1.1x), so the round simply advances.
- **"Current Estimate" formula (§5a)** — not specified by the source game, invented for this recreation: sum over all lot items of — exact price if fully revealed; the pool-wide average price for that rarity tier if only `rarityKnown`; the flat pool-wide average price if only `shapeKnown`; **0** if neither is known. This is why it runs low early (most items still contribute 0) and climbs as reveals accumulate, matching the confirmed in-game behavior without needing an artificial discount. "Pool-wide" (not lot-specific) averages are used because a player could plausibly know general item-value statistics from the always-browsable Collectibles Index, but not this specific lot's makeup.
- **Auctioneer Public Intel generation:** fires only on **Rounds 1, 3, 5** (confirmed in-game screenshots show it's sparse, not every round — configurable via `AUCTIONEER_INTEL_ROUNDS` in `app/js/config.js`), never on Round 6 (tiebreak, a special case). On a firing round, one of the 5 card types (§5b) is picked at random, computed against the actual lot, and pushed to the shared log.
- **Local hotseat bidding is not truly blind/simultaneous yet.** Until Stage 4 networking exists, multiple human-controlled seats on one screen act sequentially (one at a time), so a later-acting human can technically see an earlier human's bid for the same round before deciding — a real limitation of single-screen local play, not a mechanics decision. Bots always decide blind (only from their own balance + Current Estimate, never from other players' same-round bids), matching the intended simultaneity.
- **Starting balance / bot bidding are placeholders.** Each player starts a match with a flat amount from `STARTING_BALANCE` in `config.js` (currently 10,000,000; not persisted between matches yet — that's a Stage 4+/persistence concern). The 3 non-human seats default to a simple placeholder bot (random pass chance, otherwise bids a random 0.5–3.5× the live Current Estimate, or a more cautious blind guess off the pool-wide average when Current Estimate is still 0, capped at balance) — good enough to exercise the round/threshold/payout logic, not intended to be a good player.
- **Assistants and devices are structured as data, not one function each (§5c/§5d):** every assistant's free-text ability and every device's free-text effect were hand-translated into `{ effectType, params }` referencing one of ~7 shared effect handlers (`app/js/effects.js`) plus a small set of reusable item-selection strategies (`app/js/itemSelection.js` — random / by-rarity / largest-footprint / highest-rarity / etc). Adding a new device later is pure data entry in `app/js/deviceCatalog.js`; the same is true of `app/js/assistantCatalog.js` for assistants. A few ability texts needed an interpretive call since the source wording was ambiguous:
  - **Adler/Edgar** ("reveals silhouettes by rarity" / "reveals rarity and silhouettes of White/Green/Blue") grant **both** `rarityKnown` and `shapeKnown` together for every item of the named rarity tier — read as one combined grant per tier, not silhouette-only.
  - **Jiuyuan**'s start-of-match "reveals the silhouette of 1 highest-rarity collectible" was read literally as **shape only** (no rarity) — the assistant picks internally from the highest tier, but the player only learns the shape, not that it came from that tier.
  - **Chiz**'s "reveals the identities of those same 8 collectibles from Round 1" needed a remember/recall mechanism — the exact instanceIds chosen by Chiz's Round 1 effect are stored in per-player match memory and replayed for the Round 3 full-reveal, rather than picking a fresh random 8.
  - **Daffodill**'s "reveals the total number of Purple-, Gold-, and Red-rarity collectibles" is implemented as one combined log line with all three counts, not three separate Count-Device-style reveals.
  - **"Special Valuation Device"** ("reveals the value of 1 random collectible that occupies the most slots") has no equivalent in our reveal-state model (there's no "price known, identity unknown" flag) — implemented as text-only output naming the price without touching any item's reveal flags, consistent with how the aggregate Count/Valuation/Average Value/Slot devices already work.
  - **Category-restricted devices** (Antique/Gem/Tech/Food/Daily Goods/Anomaly Evaluation Devices) filter by an item's `category` field, which is **currently always `null`** — the collectibles spreadsheet's Category column hasn't been filled in yet (a known, already-documented gap). These devices are functional but are no-ops (reveal 0 items) until that data exists; they don't error.
  - **Every reveal-granting effect avoids re-revealing already-known items** where it can (e.g. an Evaluation-type effect only targets items that don't already have `rarityKnown`) — not explicitly stated in the source text for most devices, but consistent with Haniel's explicit "2 *unknown* collectibles" wording and the Supreme Appraisal Device's explicit "no information revealed about them yet" requirement, generalized as a default rather than a one-off.
  - **Pre-match setup is per-seat, not global:** each of the 4 seats independently picks 1 assistant (or leaves it to a random pick) and any number of Device Sets, applied on the next "New match" — bots get a random assistant by default and no devices unless the human explicitly assigns them (bots don't have any device-usage strategy yet, a known scope limitation, not a mechanics decision).

---

## 9. Summary of the Core Loop (for quick reference)

```
Setup (persists across all matches, no session reset): buy Device Sets with money, pick 1 of 8 assistants (fixed reveal schedule, free)
One match = one lot (30-60 items, e.g. a real 47-item example), bid persists and info accumulates across rounds:
      Each round (timed, 60s): Bid / Pass / use a Device — grid shows per-item reveal state (hidden / rarity-only cell / shape-only outline / full silhouette / fully revealed), from THIS player's own point of view
      Auctioneer Public Intel (shared by everyone) stacks in a public log; Assistant "Draw!" + Device reveals stack in each player's OWN private log only — "Current Estimate" is per-player too, and climbs from a low anchor as that player's own knowledge grows
      Round 1 (need ≥2.0x 2nd-highest bid to win outright)
      Round 2 (need ≥1.6x)
      Round 3 (need ≥1.3x)
      Round 4 (need ≥1.1x)
      Round 5 (highest bid simply wins)
      Round 6 (tiebreak only, if Round 5 tied)
      → Winner pays Final Sale Price, Actual Value + Earnings (can be negative) are revealed
      → Lot instantly cashes out: Earnings applied straight to winner's balance
      → If winner overpaid: other 3 players each get 10% of the overpay, permanently
  → Start a new match (new lot) to play again
```
