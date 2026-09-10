import { renderGrid } from "./grid.js";
import { renderCollectiblesIndex } from "./collectiblesIndex.js";
import {
  createMatch,
  makePlayers,
  placeBid,
  resolveRound,
  currentEstimate,
  eligiblePlayerIds,
  allEligiblePlayersActed,
  useDevice,
} from "./auctionEngine.js";
import { botDecideBid } from "./bots.js";
import {
  STARTING_BALANCE,
  STARTING_SESSION_BALANCE,
  STARTING_MATCH_FEE,
  ROUND_THRESHOLDS,
  ROUND_MS,
  TRANSITION_OVERLAY_MS,
  LOT_MIN_ITEMS,
  LOT_MAX_ITEMS,
} from "./config.js";
import { ASSISTANTS, findAssistant, randomAssistant } from "./assistantCatalog.js";
import { DEVICE_SETS, DEVICE_DEFINITIONS, instantiateDevices } from "./deviceCatalog.js";
import { getClientId, getStoredName, setStoredName } from "./clientIdentity.js";
import { generateRoomCode, normalizeRoomCode } from "./roomCode.js";
import {
  createRoom,
  roomExists,
  subscribeToRoom,
  updateRoomFields,
  submitAction as submitRoomAction,
  subscribeToActions,
  deleteAction,
} from "./roomSync.js";

const state = {
  pool: [],
  clientId: getClientId(),
  playerName: getStoredName() || "",
  roomCode: null,
  room: null, // live-synced room doc {roomCode, hostClientId, phase, seats, match}
  match: null, // mirror of room.match, kept for the existing render code
  isHost: false,
  myPlayerId: null, // which seat (p1..p4) I occupy in the current match, if any
  unsubRoom: null,
  unsubActions: null,
  tickInterval: null, // one shared 500ms tick: updates the countdown display for everyone, and (host only) force-resolves on timeout
  botsActedForRound: -1, // host-only guard against re-scheduling bot decisions for a round already handled
  debug: false,
  viewingPlayerId: null, // whose grid/estimate/private-log is currently displayed (§8: reveals are per-player)
  lastAutoSyncedRound: null, // last match.round we auto-synced viewingPlayerId back to myself for — see syncViewingPlayer()
  lobbyPreview: { assistant: undefined, deviceSet: undefined }, // which assistant/device-set the info panel is currently showing (undefined = "not initialized yet", distinct from null = "(random)")
  lastOverlayRound: null, // last match.round we've shown the "ROUND N" transition overlay for — see maybeShowRoundTransition()
  soldOverlayShown: false, // whether we've shown the "SOLD TO ..." overlay for the current match yet — see maybeShowSoldTransition()
  transitionOverlayHideTimer: null,
};

let hostProcessingLock = false; // serializes processActionsAsHost so overlapping snapshots don't double-apply

async function loadPool() {
  const res = await fetch("data/collectibles.json");
  if (!res.ok) throw new Error(`Failed to load collectibles.json: ${res.status}`);
  return res.json();
}

// ---------- Screen gating (landing -> lobby -> match) ----------

function showLandingScreen() {
  document.getElementById("landing-screen").classList.remove("hidden");
  document.getElementById("lobby-screen").classList.add("hidden");
  document.getElementById("match-screen").classList.add("hidden");
  hideTransitionOverlay();
}

function showLobbyScreen() {
  document.getElementById("landing-screen").classList.add("hidden");
  document.getElementById("lobby-screen").classList.remove("hidden");
  document.getElementById("match-screen").classList.add("hidden");
  hideTransitionOverlay();
}

/** Force-clears any pending transition overlay ("ROUND N" or "SOLD TO ...") — used when
 * navigating away from the match screen so a stray timer firing later can't leave it showing
 * over the lobby/landing screen. */
function hideTransitionOverlay() {
  clearTimeout(state.transitionOverlayHideTimer);
  document.getElementById("match-transition-overlay")?.classList.remove("visible");
}

function showMatchScreen() {
  document.getElementById("landing-screen").classList.add("hidden");
  document.getElementById("lobby-screen").classList.add("hidden");
  document.getElementById("match-screen").classList.remove("hidden");
}

// ---------- Landing: create/join a room ----------

function showLandingError(msg) {
  document.getElementById("landing-error").textContent = msg || "";
}

async function handleCreateRoom() {
  const name = document.getElementById("landing-name").value.trim() || "Player";
  setStoredName(name);
  state.playerName = name;

  const code = generateRoomCode();
  await createRoom(code, state.clientId);
  enterRoom(code);
  await claimSeat(0); // whoever creates the room (and is therefore host) takes seat 1 by default
}

async function handleJoinRoom() {
  const name = document.getElementById("landing-name").value.trim() || "Player";
  setStoredName(name);
  state.playerName = name;

  const code = normalizeRoomCode(document.getElementById("landing-join-code").value);
  if (!code) {
    showLandingError("Enter a room code.");
    return;
  }
  if (!(await roomExists(code))) {
    showLandingError("No room with that code.");
    return;
  }
  showLandingError("");
  enterRoom(code);
}

function enterRoom(code) {
  state.roomCode = code;
  state.unsubRoom = subscribeToRoom(code, onRoomSnapshot);
}

function leaveRoom() {
  state.unsubRoom?.();
  state.unsubRoom = null;
  unsubscribeHostFromActions();
  stopTick();
  Object.assign(state, { roomCode: null, room: null, match: null, isHost: false, myPlayerId: null });
  state.lobbyPreview = { assistant: undefined, deviceSet: undefined };
  showLandingScreen();
}

// ---------- Room snapshot dispatch ----------

function onRoomSnapshot(room) {
  state.room = room;
  state.isHost = room.hostClientId === state.clientId;

  if (room.phase === "lobby") {
    const cameFromMatch = state.match !== null;
    unsubscribeHostFromActions();
    stopTick();
    state.match = null;
    if (cameFromMatch) {
      // The device set purchase doesn't carry over into the next match (see hostStartMatch) —
      // re-sync the lobby's device preview to the seat's now-reset selection instead of still
      // showing whatever was equipped for the match that just ended.
      state.lobbyPreview.deviceSet = undefined;
    }
    showLobbyScreen();
    renderLobby();
    return;
  }

  if (room.phase === "match" && room.match) {
    const isFreshMatch = state.match === null;
    showMatchScreen();
    document.getElementById("match-room-code").textContent = state.roomCode;
    document.getElementById("btn-end-match").style.display = state.isHost ? "inline-block" : "none";

    state.match = room.match;
    if (isFreshMatch) {
      // A new match always restarts round numbering at 1 and hasn't been sold yet.
      state.lastOverlayRound = null;
      state.soldOverlayShown = false;
    }
    determineMyPlayerId();
    if (!state.viewingPlayerId || !state.match.players.some((p) => p.id === state.viewingPlayerId)) {
      state.viewingPlayerId = state.myPlayerId ?? state.match.players.find((p) => p.isBot)?.id ?? state.match.players[0].id;
      state.lastAutoSyncedRound = null;
    }

    if (state.isHost) subscribeHostToActions();
    startTick();
    render();
  }
}

function determineMyPlayerId() {
  const mine = state.match?.players.find((p) => p.clientId === state.clientId);
  state.myPlayerId = mine ? mine.id : null;
}

// ---------- Lobby ----------

function findMySeatIndex() {
  const seats = state.room?.seats || {};
  for (let i = 0; i < 4; i++) {
    if (seats[String(i)]?.clientId === state.clientId) return i;
  }
  return -1;
}

async function claimSeat(i) {
  await updateRoomFields(state.roomCode, {
    [`seats.${i}`]: {
      clientId: state.clientId,
      name: state.playerName,
      isBot: false,
      assistantName: null,
      deviceSetNames: [],
      balance: STARTING_SESSION_BALANCE,
    },
  });
}

function getMySeat() {
  const i = findMySeatIndex();
  return i >= 0 ? state.room?.seats[String(i)] : null;
}

function renderLobby() {
  const room = state.room;
  document.getElementById("lobby-room-code").textContent = state.roomCode;
  const container = document.getElementById("lobby-seats");
  container.innerHTML = "";

  const mySeatIndex = findMySeatIndex();

  if (mySeatIndex >= 0) {
    const seat = room.seats[String(mySeatIndex)];
    if (state.lobbyPreview.assistant === undefined) state.lobbyPreview.assistant = seat.assistantName || null;
    if (state.lobbyPreview.deviceSet === undefined) state.lobbyPreview.deviceSet = seat.deviceSetNames[0] || null;

    const mineBlock = document.createElement("div");
    mineBlock.className = "lobby-my-seat tint-blue";
    mineBlock.innerHTML = `
      <h3>Seat ${mySeatIndex + 1} (you)</h3>
      <p class="seat-readonly-info">${seat.name}</p>
      <p class="wallet-line">Wallet: <strong>${(seat.balance ?? 0).toLocaleString()}</strong></p>
      <div class="picker-block">
        <h4 class="picker-heading">Auction Assistant</h4>
        <div class="picker-layout">
          <div class="picker-list" id="assistant-list">${assistantListHtml(seat)}</div>
          <div class="picker-detail" id="assistant-detail">${assistantDetailHtml()}</div>
        </div>
        <div class="picker-confirm-row" id="assistant-confirm-row">${assistantConfirmHtml(seat)}</div>
      </div>
      <div class="picker-block">
        <h4 class="picker-heading">Device Set</h4>
        <div class="picker-layout">
          <div class="picker-list device-set-list" id="deviceset-list">${deviceSetListHtml(seat)}</div>
          <div class="picker-detail" id="deviceset-detail">${deviceSetDetailHtml()}</div>
        </div>
        <div class="picker-confirm-row" id="deviceset-confirm-row">${deviceBuyHtml(seat)}</div>
      </div>
    `;
    container.appendChild(mineBlock);
    wireMineSeat(mineBlock, mySeatIndex);
  }

  const othersWrap = document.createElement("div");
  othersWrap.className = "lobby-other-seats";
  for (let i = 0; i < 4; i++) {
    if (i === mySeatIndex) continue;
    const seat = room.seats[String(i)];
    const block = document.createElement("div");
    block.className = "setup-seat seat-compact";
    if (!seat) {
      block.innerHTML = `
        <h3>Seat ${i + 1}</h3>
        <p class="seat-empty">Empty — auto-filled with a bot if unclaimed.</p>
        <button type="button" data-join-seat="${i}">Join this seat</button>
      `;
    } else {
      block.innerHTML = `
        <h3>Seat ${i + 1}</h3>
        <p class="seat-readonly-info">${seat.name} &middot; ${seat.assistantName || "random"} &middot; ${seat.deviceSetNames[0] || "no devices"}</p>
      `;
    }
    othersWrap.appendChild(block);
  }
  container.appendChild(othersWrap);

  othersWrap.querySelectorAll("[data-join-seat]").forEach((btn) => {
    btn.addEventListener("click", () => claimSeat(Number(btn.dataset.joinSeat)));
  });

  document.getElementById("btn-start-match").style.display = state.isHost ? "inline-block" : "none";
  document.getElementById("lobby-status").textContent = state.isHost
    ? ""
    : "Waiting for the host to start the match...";
  document.getElementById("match-fee-hint").textContent =
    `Starting a match costs ${STARTING_MATCH_FEE.toLocaleString()} from each seated player's wallet (bots don't pay).`;
}

function assistantListHtml(seat) {
  const previewed = state.lobbyPreview.assistant || "";
  const equipped = seat.assistantName || "";
  const items = [{ name: "", skillName: "assigned at match start", label: "(random)" }, ...ASSISTANTS];
  return items
    .map((a) => {
      const value = a.name;
      const cls = ["picker-item", value === previewed && "previewing", value === equipped && "selected"]
        .filter(Boolean)
        .join(" ");
      return `<button type="button" class="${cls}" data-assistant-choice="${value}">${a.label || a.name}<span class="picker-item-sub">${a.skillName}</span></button>`;
    })
    .join("");
}

function assistantDetailHtml() {
  const name = state.lobbyPreview.assistant;
  const a = name ? findAssistant(name) : null;
  if (!a) {
    return `<p class="picker-detail-empty">A random assistant will be assigned to this seat when the match starts.</p>`;
  }
  return `
    <h5 class="picker-detail-name">${a.name}</h5>
    <p class="picker-detail-quote">&ldquo;${a.flavorQuote}&rdquo;</p>
    <p class="picker-detail-skill-label">Skill: <strong>${a.skillName}</strong></p>
    <p class="picker-detail-body">${a.ability || ""}</p>
  `;
}

function assistantConfirmHtml(seat) {
  const previewed = state.lobbyPreview.assistant || null;
  const equipped = seat.assistantName || null;
  const noChange = previewed === equipped;
  return `<button type="button" id="btn-confirm-assistant" ${noChange ? "disabled" : ""}>
    ${noChange ? "Confirmed" : `Confirm ${previewed ? previewed : "(random)"}`}
  </button>`;
}

function deviceSetListHtml(seat) {
  const previewed = state.lobbyPreview.deviceSet || "";
  const equipped = seat.deviceSetNames[0] || "";
  const items = [{ name: "", price: null, label: "(none)", sub: "no device set this match" }, ...DEVICE_SETS];
  return items
    .map((s) => {
      const value = s.name;
      const cls = ["picker-item", value === previewed && "previewing", value === equipped && "selected"]
        .filter(Boolean)
        .join(" ");
      const sub = s.sub || s.price.toLocaleString();
      return `<button type="button" class="${cls}" data-deviceset-choice="${value}">${s.label || s.name}<span class="picker-item-sub">${sub}</span></button>`;
    })
    .join("");
}

function deviceSetDetailHtml() {
  const s = DEVICE_SETS.find((d) => d.name === state.lobbyPreview.deviceSet);
  if (!s) return `<p class="picker-detail-empty">No device set selected for this match.</p>`;
  const rows = s.devices
    .map((devName) => {
      const def = DEVICE_DEFINITIONS[devName];
      return `<div class="device-detail-row"><span class="device-detail-name">${devName}</span><span class="device-detail-effect">${def?.effect || ""}</span></div>`;
    })
    .join("");
  return `
    <h5 class="picker-detail-name">${s.name} <span class="picker-detail-price">${s.price.toLocaleString()}</span></h5>
    <p class="picker-detail-quote">${s.description || ""}</p>
    <p class="picker-detail-skill-label">Contains the following devices:</p>
    <div class="device-detail-list">${rows}</div>
  `;
}

/** Buying a device set in the lobby refunds whatever's currently equipped (nothing has been
 * spent for real yet — the match hasn't started) and charges the newly-picked one, so freely
 * changing your mind before Start Match never costs more than the one set you land on. */
function computeDeviceBuyState(seat) {
  const previewedName = state.lobbyPreview.deviceSet || null;
  const equippedName = seat.deviceSetNames[0] || null;
  const previewedSet = previewedName ? DEVICE_SETS.find((d) => d.name === previewedName) : null;
  const equippedSet = equippedName ? DEVICE_SETS.find((d) => d.name === equippedName) : null;
  const cost = previewedSet?.price || 0;
  const refund = equippedSet?.price || 0;
  const netCost = cost - refund;
  const noChange = previewedName === equippedName;
  const balance = seat.balance ?? 0;
  const canAfford = balance - netCost >= 0;
  return { previewedName, previewedSet, equippedSet, cost, refund, netCost, noChange, canAfford, balance };
}

function deviceBuyHtml(seat) {
  const { previewedSet, equippedSet, cost, refund, noChange, canAfford } = computeDeviceBuyState(seat);
  let label;
  if (noChange) label = previewedSet ? "Equipped" : "No device set equipped";
  else if (previewedSet && equippedSet) label = `Switch — buy for ${cost.toLocaleString()} (refunds ${refund.toLocaleString()})`;
  else if (previewedSet) label = `Buy for ${cost.toLocaleString()}`;
  else label = `Remove (refund ${refund.toLocaleString()})`;

  const disabled = noChange || !canAfford;
  const errorText = !noChange && !canAfford ? "Not enough balance in your wallet for this." : "";
  return `
    <button type="button" id="btn-buy-deviceset" ${disabled ? "disabled" : ""}>${label}</button>
    <span class="picker-buy-error">${errorText}</span>
  `;
}

function refreshAssistantUI(el, seat) {
  el.querySelectorAll("[data-assistant-choice]").forEach((btn) => {
    const value = btn.dataset.assistantChoice;
    btn.classList.toggle("previewing", value === (state.lobbyPreview.assistant || ""));
    btn.classList.toggle("selected", value === (seat.assistantName || ""));
  });
  const detail = el.querySelector("#assistant-detail");
  if (detail) detail.innerHTML = assistantDetailHtml();
  const confirmRow = el.querySelector("#assistant-confirm-row");
  if (confirmRow) confirmRow.innerHTML = assistantConfirmHtml(seat);
  wireAssistantConfirm(el, findMySeatIndex());
}

function refreshDeviceSetUI(el, seat) {
  el.querySelectorAll("[data-deviceset-choice]").forEach((btn) => {
    const value = btn.dataset.devicesetChoice;
    btn.classList.toggle("previewing", value === (state.lobbyPreview.deviceSet || ""));
    btn.classList.toggle("selected", value === (seat.deviceSetNames[0] || ""));
  });
  const detail = el.querySelector("#deviceset-detail");
  if (detail) detail.innerHTML = deviceSetDetailHtml();
  const confirmRow = el.querySelector("#deviceset-confirm-row");
  if (confirmRow) confirmRow.innerHTML = deviceBuyHtml(seat);
  wireDeviceBuy(el, findMySeatIndex());
}

function wireAssistantConfirm(el, i) {
  el.querySelector("#btn-confirm-assistant")?.addEventListener("click", () => {
    const value = state.lobbyPreview.assistant || null;
    updateRoomFields(state.roomCode, { [`seats.${i}.assistantName`]: value });
  });
}

function wireDeviceBuy(el, i) {
  el.querySelector("#btn-buy-deviceset")?.addEventListener("click", () => {
    const seat = state.room.seats[String(i)];
    const { previewedName, netCost, canAfford, noChange } = computeDeviceBuyState(seat);
    if (noChange || !canAfford) return;
    updateRoomFields(state.roomCode, {
      [`seats.${i}.balance`]: seat.balance - netCost,
      [`seats.${i}.deviceSetNames`]: previewedName ? [previewedName] : [],
    });
  });
}

function wireMineSeat(el, i) {
  el.querySelectorAll("[data-assistant-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lobbyPreview.assistant = btn.dataset.assistantChoice || null;
      refreshAssistantUI(el, state.room.seats[String(i)]);
    });
  });

  el.querySelectorAll("[data-deviceset-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lobbyPreview.deviceSet = btn.dataset.devicesetChoice || null;
      refreshDeviceSetUI(el, state.room.seats[String(i)]);
    });
  });

  wireAssistantConfirm(el, i);
  wireDeviceBuy(el, i);
}

async function hostStartMatch() {
  const room = state.room;
  const players = makePlayers(4, STARTING_BALANCE);
  const feeFields = {};
  for (let i = 0; i < 4; i++) {
    const seat = room.seats[String(i)];
    const player = players[i];
    if (seat) {
      player.name = seat.name;
      player.clientId = seat.clientId;
      player.isBot = false;
      player.assistant = seat.assistantName ? findAssistant(seat.assistantName) : randomAssistant();
      player.devices = instantiateDevices(seat.deviceSetNames);
      // A real player bids with their actual wallet, not a fresh fixed amount — same currency
      // used to buy devices in the lobby, per the reference game's single "My Assets" pool.
      // Entry fee is floored at 0 rather than blocking match start over an underfunded seat.
      player.balance = Math.max(0, (seat.balance ?? 0) - STARTING_MATCH_FEE);
      feeFields[`seats.${i}.balance`] = player.balance;
      // The device set purchase is consumed by this match — a seat starts each new match with no
      // device set equipped (and must buy again in the lobby), even if it just used one, so this
      // can't be reused for free. The assistant stays as-is: it's free, no purchase to consume.
      feeFields[`seats.${i}.deviceSetNames`] = [];
    } else {
      player.name = `Bot ${i + 1}`;
      player.clientId = null;
      player.isBot = true;
      player.assistant = randomAssistant();
      player.devices = [];
    }
  }
  const match = createMatch(state.pool, players, { minSize: LOT_MIN_ITEMS, maxSize: LOT_MAX_ITEMS });
  // + TRANSITION_OVERLAY_MS so the "ROUND 1" overlay's screen time doesn't eat into real bidding time.
  match.roundDeadline = Date.now() + ROUND_MS + TRANSITION_OVERLAY_MS;
  state.botsActedForRound = -1;
  await updateRoomFields(state.roomCode, { ...feeFields, phase: "match", match });
}

/** Real (non-bot) players' match balance IS their session wallet (see hostStartMatch) — so
 * whenever we stop tracking live match state (the match concludes, or the host ends it early),
 * whatever's left in player.balance needs to be written back to seats.N.balance or the result
 * of this match (earnings, spillover, device/entry spend) would simply vanish next match. */
function computeWalletSyncFields(match) {
  const fields = {};
  const seats = state.room?.seats || {};
  for (let i = 0; i < 4; i++) {
    const seat = seats[String(i)];
    const player = match.players[i];
    if (!seat || !player) continue;
    fields[`seats.${i}.balance`] = Math.round(player.balance);
  }
  return fields;
}

async function hostEndMatch() {
  if (!state.isHost) return;
  unsubscribeHostFromActions();
  const walletFields = state.match ? computeWalletSyncFields(state.match) : {};
  await updateRoomFields(state.roomCode, { ...walletFields, phase: "lobby", match: null });
}

// ---------- Host-only: process the action queue + own the round clock ----------

function subscribeHostToActions() {
  if (state.unsubActions) return;
  state.unsubActions = subscribeToActions(state.roomCode, (actions) => {
    processActionsAsHost(actions).catch((err) => console.error("processActionsAsHost failed:", err));
  });
}

function unsubscribeHostFromActions() {
  state.unsubActions?.();
  state.unsubActions = null;
}

async function processActionsAsHost(actions) {
  if (!state.isHost || hostProcessingLock || actions.length === 0) return;
  const match = state.match;
  if (!match) return;

  if (match.status !== "bidding") {
    // Match already ended — just drain stale actions so they don't pile up in Firestore.
    for (const a of actions) await deleteAction(state.roomCode, a.id).catch(() => {});
    return;
  }

  hostProcessingLock = true;
  try {
    const sorted = [...actions].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    for (const action of sorted) {
      try {
        if (action.type === "placeBid") placeBid(match, action.playerId, action.amount);
        else if (action.type === "useDevice") useDevice(match, action.playerId, action.deviceId);
      } catch (err) {
        console.warn("Dropping invalid action:", action, err.message);
      }
      await deleteAction(state.roomCode, action.id).catch(() => {});
    }
    await hostResolveIfReadyAndSync(match);
  } finally {
    hostProcessingLock = false;
  }
}

/** Host-only: resolve the round if everyone's acted, schedule bots/timer for whatever round is now current, and push to Firestore. */
async function hostResolveIfReadyAndSync(match) {
  if (match.status === "bidding" && allEligiblePlayersActed(match)) {
    resolveRound(match);
    if (match.status === "bidding") {
      // + TRANSITION_OVERLAY_MS so the "ROUND N" overlay's screen time doesn't eat into real bidding time.
      match.roundDeadline = Date.now() + ROUND_MS + TRANSITION_OVERLAY_MS;
    }
  }
  if (match.status === "bidding") hostScheduleBotsForCurrentRound(match);
  // Bank real players' balances back into their session wallet the moment the match concludes
  // (sold/unsold) — not every round, just once there's actually a final number to save.
  const walletFields = match.status !== "bidding" ? computeWalletSyncFields(match) : {};
  await updateRoomFields(state.roomCode, { ...walletFields, match });
}

function hostScheduleBotsForCurrentRound(match) {
  if (match.status !== "bidding") return;
  if (state.botsActedForRound === match.round) return;
  state.botsActedForRound = match.round;

  const roundThisWasScheduledFor = match.round;
  const roomCodeThisWasScheduledFor = state.roomCode;
  const botIds = eligiblePlayerIds(match).filter((id) => match.players.find((p) => p.id === id).isBot);
  for (const id of botIds) {
    const delay = 300 + Math.random() * 1500;
    setTimeout(async () => {
      // NOTE: deliberately re-reads state.match instead of using the closed-over `match` — unlike
      // the local-only build, `state.match` gets reassigned to a brand-new object on every
      // Firestore snapshot (not mutated in place), so an object-identity check here would go
      // stale almost immediately after any write and silently drop every scheduled bot decision
      // (this was a real bug, caught by the two-tab networked test — bots never acted).
      if (!state.isHost || state.roomCode !== roomCodeThisWasScheduledFor) return; // left the room / no longer host
      const current = state.match;
      if (!current || current.status !== "bidding" || current.round !== roundThisWasScheduledFor) return; // round moved on
      if (Object.hasOwn(current.bids[current.round] || {}, id)) return; // already acted somehow
      placeBid(current, id, botDecideBid(current, id));
      await hostResolveIfReadyAndSync(current);
    }, delay);
  }
}

// ---------- Shared per-second tick: countdown display for everyone, host-only forced resolve ----------

function startTick() {
  if (state.tickInterval) return;
  state.tickInterval = setInterval(onTick, 500);
}

function stopTick() {
  if (state.tickInterval) clearInterval(state.tickInterval);
  state.tickInterval = null;
}

async function onTick() {
  const match = state.match;
  if (!match || match.status !== "bidding" || !match.roundDeadline) return;

  const el = document.getElementById("round-timer");
  if (el) el.textContent = `${Math.ceil(Math.max(0, match.roundDeadline - Date.now()) / 1000)} s`;

  if (state.isHost && Date.now() >= match.roundDeadline) {
    for (const id of eligiblePlayerIds(match)) {
      if (!Object.hasOwn(match.bids[match.round] || {}, id)) placeBid(match, id, 0);
    }
    await hostResolveIfReadyAndSync(match);
  }
}

// ---------- Match rendering (mostly unchanged from the local-only build) ----------

function render() {
  const { match, debug } = state;
  if (!match) return;

  maybeShowRoundTransition(match);
  maybeShowSoldTransition(match);
  syncViewingPlayer();
  renderViewingAsSelect();
  renderPlayers();
  renderRoundPanel();
  renderBidEntry();
  renderResult();

  const gridEl = document.getElementById("grid");
  renderGrid(gridEl, match.lot, {
    debug,
    revealAll: match.status !== "bidding",
    viewerPlayerId: state.viewingPlayerId,
    onChange: render,
    onCellPeek: openCollectiblesIndex,
  });
}

/**
 * Show a brief full-screen "ROUND N" transition once per round (including the match's very
 * first round) — purely a local visual/audio effect, not part of the synced match state, so it
 * fires independently on every client the moment they observe match.round change rather than
 * needing the host to coordinate a pause. The round's own deadline already has
 * TRANSITION_OVERLAY_MS built in (see hostStartMatch/hostResolveIfReadyAndSync) so this doesn't
 * eat into anyone's real bidding time.
 */
function maybeShowRoundTransition(match) {
  if (state.lastOverlayRound === match.round) return;
  state.lastOverlayRound = match.round;
  showTransitionOverlay(`ROUND ${match.round}`, "audio/round-change.mp3");
}

/**
 * Show a brief full-screen "SOLD TO ..." transition once, the moment a match concludes with a
 * winner (not for an unsold lot — the user only asked for the "someone wins" case). Same
 * per-match-once guard pattern as the round overlay, reset alongside it whenever a fresh match
 * starts (see onRoomSnapshot's isFreshMatch block).
 */
function maybeShowSoldTransition(match) {
  if (match.status !== "sold" || state.soldOverlayShown) return;
  state.soldOverlayShown = true;
  const winner = match.players.find((p) => p.id === match.result.winnerId);
  showTransitionOverlay(`SOLD TO ${winner?.name ?? "?"}`, "audio/match-sold.mp3");
}

/** Shared full-screen overlay used for both the "ROUND N" and "SOLD TO ..." effects above —
 * shows `text` for TRANSITION_OVERLAY_MS and (best-effort) plays `audioSrc` alongside it. */
function showTransitionOverlay(text, audioSrc) {
  const overlay = document.getElementById("match-transition-overlay");
  const textEl = document.getElementById("match-transition-text");
  if (!overlay || !textEl) return;
  textEl.textContent = text;
  overlay.classList.add("visible");

  // Optional ~2s audio cue — drop a file at this path to add sound later; if it's missing (or
  // the browser blocks autoplay) this just silently does nothing, the visual still works either way.
  new Audio(audioSrc).play().catch(() => {});

  clearTimeout(state.transitionOverlayHideTimer);
  state.transitionOverlayHideTimer = setTimeout(() => {
    overlay.classList.remove("visible");
  }, TRANSITION_OVERLAY_MS);
}

/**
 * Open (or re-filter, if already open) the Collectibles Index. With no filters this is the
 * plain "browse everything" view (the sidebar button); grid.js's onCellPeek calls this with
 * whichever of rarity/shape a partially-revealed cell has actually granted, so a player can see
 * every item matching what they currently know about it without ever being shown an exact price
 * for something that isn't fully revealed.
 */
function openCollectiblesIndex(filters = {}) {
  document.getElementById("collectibles-index-panel").classList.add("visible");
  renderCollectiblesIndex(document.getElementById("collectibles-index-content"), state.pool, {
    initialRarity: filters.rarity || "",
    initialShape: filters.shape || "",
  });
}

/**
 * Keep "Viewing as" following my own view whenever a new round starts and I still need to act,
 * so I naturally see my own view again if I'd been peeking at a bot's view while waiting for the
 * previous round to resolve. Bidding is simultaneous (§4) — there's no single "whose turn is it"
 * anymore, so this only resets once per round, not tied to any particular player's turn.
 */
function syncViewingPlayer() {
  const { match, myPlayerId } = state;
  if (!myPlayerId) return;
  const iNeedToAct = !haveIActedThisRound(match, myPlayerId);
  if (iNeedToAct && match.round !== state.lastAutoSyncedRound) {
    state.viewingPlayerId = myPlayerId;
    state.lastAutoSyncedRound = match.round;
  }
}

function renderViewingAsSelect() {
  const { match, myPlayerId } = state;
  const select = document.getElementById("viewing-as-select");
  // Only my own seat + bot seats — peeking at another live player's private view would defeat §8.
  const allowed = match.players.filter((p) => p.id === myPlayerId || p.isBot);
  select.innerHTML = allowed.map((p) => `<option value="${p.id}">${p.name}${p.isBot ? " (bot)" : ""}</option>`).join("");
  if (!allowed.some((p) => p.id === state.viewingPlayerId)) {
    state.viewingPlayerId = myPlayerId ?? allowed[0]?.id ?? null;
  }
  select.value = state.viewingPlayerId;
  if (!select.dataset.wired) {
    select.dataset.wired = "1";
    select.addEventListener("change", () => {
      state.viewingPlayerId = select.value;
      render();
    });
  }
}

function renderPlayers() {
  const { match, myPlayerId, debug, viewingPlayerId } = state;
  const container = document.getElementById("players-list");

  container.innerHTML = "";
  for (const player of match.players) {
    const acted = Object.hasOwn(match.bids[match.round] || {}, player.id) || match.status !== "bidding";
    const card = document.createElement("div");
    card.className = `player-card${acted && match.status === "bidding" ? " acted" : ""}`;

    const slots = [];
    for (let r = 1; r <= 6; r++) {
      const bid = match.bids[r]?.[player.id];
      let label = "-";
      let cls = "bid-slot";
      const isCurrentInProgressRound = r === match.round && match.status === "bidding";
      if (isCurrentInProgressRound) cls += " current-round";

      if (isCurrentInProgressRound && player.id !== myPlayerId) {
        // Bidding is simultaneous and blind (§4) — everyone's amount for the round still in
        // progress stays hidden from everyone else until the round resolves, even though the
        // data already exists in the synced match (same client-side-only privacy model as §8's
        // reveal split, not enforced by security rules).
        if (bid !== undefined) {
          label = "locked in";
          cls += " locked";
        }
      } else if (bid !== undefined) {
        label = bid > 0 ? bid.toLocaleString() : "pass";
        if (bid === 0) cls += " passed";
      }
      if (match.status === "sold" && match.result.winnerId === player.id && match.result.finalSalePrice === bid) {
        cls += " winner";
      }
      slots.push(`<div class="${cls}">${label}</div>`);
    }

    const deviceCount = player.devices?.length || 0;
    const deviceUsed = player.devices?.filter((d) => d.used).length || 0;
    const isMe = player.id === state.myPlayerId;
    // Balances are private, same as bid amounts (§8) — only your own (or, in debug/god-view,
    // whichever player the "Viewing grid as" selector is currently pointed at) is shown.
    const balanceVisible = debug || player.id === viewingPlayerId;
    const balanceText = balanceVisible ? Math.round(player.balance).toLocaleString() : "hidden";

    card.innerHTML = `
      <div class="player-card-head">
        <span class="player-name">${player.name}${player.isBot ? " (bot)" : ""}${isMe ? " (you)" : ""}</span>
        <span class="player-balance${balanceVisible ? "" : " balance-hidden"}">${balanceText}</span>
      </div>
      <div class="hint" style="margin:0.3rem 0 0;">
        Assistant: ${player.assistant ? `${player.assistant.name} (${player.assistant.skillName})` : "none"}<br/>
        Devices: ${deviceUsed}/${deviceCount} used
      </div>
      <div class="bid-slots">${slots.join("")}</div>
    `;
    container.appendChild(card);
  }
}

function renderRoundPanel() {
  const { match, viewingPlayerId } = state;
  document.getElementById("round-number").textContent = match.status === "bidding" ? match.round : `${match.round} (ended)`;
  document.getElementById("current-estimate").textContent = currentEstimate(match, viewingPlayerId).toLocaleString();

  renderLog(document.getElementById("public-log"), match.log);
  renderLog(document.getElementById("private-log"), match.privateLogs[viewingPlayerId] || []);
}

function renderLog(container, entries) {
  container.innerHTML = "";
  for (const entry of entries) {
    const div = document.createElement("div");
    div.className = `intel-entry kind-${entry.kind}`;
    div.innerHTML = `<span class="round-tag">Round ${entry.round} — ${logEntryLabel(entry)}</span>${entry.text}`;
    container.appendChild(div);
  }
}

function logEntryLabel(entry) {
  if (entry.kind === "assistantReveal") return `Assistant — ${entry.assistantName} (${entry.skillName})`;
  if (entry.kind === "deviceUse") return `Device — ${entry.deviceName}`;
  return "Auctioneer Public Intel";
}

function haveIActedThisRound(match, playerId) {
  if (!playerId) return true;
  return Object.hasOwn(match.bids[match.round] || {}, playerId);
}

function renderBidEntry() {
  const panel = document.getElementById("bid-entry-panel");
  const devicesPanel = document.getElementById("devices-panel");
  const { match, myPlayerId } = state;
  if (match.status !== "bidding") {
    panel.innerHTML = "";
    panel.style.display = "none";
    devicesPanel.style.display = "none";
    return;
  }
  panel.style.display = "block";

  if (!myPlayerId) {
    panel.innerHTML = `<p class="waiting-note">You're not seated in this match.</p>`;
    devicesPanel.style.display = "none";
    return;
  }
  if (!eligiblePlayerIds(match).includes(myPlayerId)) {
    panel.innerHTML = `<p class="waiting-note">You're not one of the tied players in this Round 6 tiebreak.</p>`;
    devicesPanel.style.display = "none";
    return;
  }
  if (haveIActedThisRound(match, myPlayerId)) {
    const eligible = eligiblePlayerIds(match);
    const actedCount = eligible.filter((id) => Object.hasOwn(match.bids[match.round] || {}, id)).length;
    panel.innerHTML = `<p class="waiting-note">You've acted this round — amounts stay hidden until everyone has (${actedCount}/${eligible.length} submitted). Waiting on the rest...</p>`;
    devicesPanel.style.display = "none";
    return;
  }

  const playerId = myPlayerId;
  const player = match.players.find((p) => p.id === playerId);

  // Bidding is simultaneous and blind (§4) — no other player's current-round amount is knowable
  // while deciding, so the quick-fill target is based on Current Estimate (info I legitimately
  // have) rather than "current top bid so far," which would leak someone else's hidden bid.
  const estimate = currentEstimate(match, myPlayerId);
  const threshold = ROUND_THRESHOLDS[match.round];
  const quickTarget = threshold ? Math.ceil(threshold * estimate) : null;

  const prevBid = match.bids[match.round - 1]?.[playerId];

  // render() re-runs on every match-state change, including other players' actions that don't
  // affect me at all (their bid, a device use, etc.) — rebuilding the form's HTML would otherwise
  // wipe out whatever I'm still mid-typing. Carry the existing value forward when the form was
  // already showing (i.e. this isn't a fresh round or a transition from a different panel state).
  const previousAmount = document.getElementById("bid-amount")?.value ?? "";

  const deviceRows = (player.devices || [])
    .map((d) => {
      const effect = DEVICE_DEFINITIONS[d.name]?.effect || "";
      return `
      <div class="device-row${d.used ? " used" : ""}" title="${effect}">
        <span class="device-name">${d.name}</span>
        ${d.used ? "used" : `<button type="button" data-use-device="${d.id}">Use</button>`}
      </div>`;
    })
    .join("");

  panel.innerHTML = `
    <h2>${player.name} — Round ${match.round} action${match.round === 6 ? " (tiebreak)" : ""}</h2>
    <div class="bid-form">
      <input type="number" id="bid-amount" min="0" max="${Math.floor(player.balance)}" placeholder="Bid amount (max ${Math.floor(player.balance).toLocaleString()})" value="${previousAmount}" />
      <div class="bid-quick-row">
        ${quickTarget !== null ? `<button type="button" id="btn-quick-threshold">${threshold}x Current Estimate &rarr; ${quickTarget.toLocaleString()}</button>` : ""}
        ${prevBid ? `<button type="button" id="btn-quick-prev">Previous round bid (${prevBid.toLocaleString()})</button>` : ""}
      </div>
      <p class="hint" style="margin:-0.2rem 0 0.6rem;">This round needs ≥${threshold ?? "1.0"}x the second-highest bid to win outright — that's hidden until reveal, so the button above is only a rough guide off your own estimate, not a guaranteed-clearing amount.</p>
      <div class="bid-action-row">
        <button type="button" class="btn-bid" id="btn-submit-bid">Bid</button>
        <button type="button" class="btn-pass" id="btn-submit-pass">Pass</button>
      </div>
      <div class="bid-error" id="bid-error"></div>
    </div>
  `;

  if ((player.devices || []).length) {
    devicesPanel.style.display = "block";
    devicesPanel.innerHTML = `
      <h2>Devices</h2>
      <p class="hint" style="margin:0 0 0.5rem;">Usable any round, one-time use each. Reveals are private to you only.</p>
      ${deviceRows}
    `;
  } else {
    devicesPanel.style.display = "none";
    devicesPanel.innerHTML = "";
  }

  const amountInput = document.getElementById("bid-amount");
  document.getElementById("btn-quick-threshold")?.addEventListener("click", () => {
    amountInput.value = quickTarget;
  });
  document.getElementById("btn-quick-prev")?.addEventListener("click", () => {
    amountInput.value = prevBid;
  });
  document.getElementById("btn-submit-bid").addEventListener("click", (e) => {
    const amount = Number(amountInput.value) || 0;
    if (amount <= 0) {
      document.getElementById("bid-error").textContent = "Enter a positive amount to bid, or use Pass.";
      return;
    }
    disableBidButtons();
    submitBidAction(amount);
  });
  document.getElementById("btn-submit-pass").addEventListener("click", () => {
    disableBidButtons();
    submitBidAction(0);
  });
  amountInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("btn-submit-bid").click();
    }
  });
  devicesPanel.querySelectorAll("[data-use-device]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.disabled = true;
      submitDeviceAction(btn.dataset.useDevice);
    });
  });
}

function disableBidButtons() {
  document.getElementById("btn-submit-bid").disabled = true;
  document.getElementById("btn-submit-pass").disabled = true;
}

async function submitBidAction(amount) {
  try {
    await submitRoomAction(state.roomCode, { type: "placeBid", playerId: state.myPlayerId, amount });
    document.getElementById("bid-error").textContent = "";
  } catch (err) {
    document.getElementById("bid-error").textContent = err.message;
  }
}

async function submitDeviceAction(deviceId) {
  try {
    await submitRoomAction(state.roomCode, { type: "useDevice", playerId: state.myPlayerId, deviceId });
    document.getElementById("bid-error").textContent = "";
  } catch (err) {
    document.getElementById("bid-error").textContent = err.message;
  }
}

function renderResult() {
  const panel = document.getElementById("result-panel");
  const { match } = state;
  if (match.status === "bidding") {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";

  if (match.status === "unsold") {
    panel.innerHTML = `<h2>Lot unsold</h2><p class="hint">Nobody won this lot (all rounds passed, or Round 6 tiebreak stayed tied).</p>`;
    return;
  }

  const { winnerId, finalSalePrice, actualValue, earnings, spillover } = match.result;
  const winner = match.players.find((p) => p.id === winnerId);
  const earnClass = earnings >= 0 ? "positive" : "negative";

  const spilloverLines = Object.entries(spillover)
    .map(([id, amt]) => `${match.players.find((p) => p.id === id).name}: +${amt.toLocaleString()}`)
    .join(", ");

  panel.innerHTML = `
    <h2>Lot sold — ${winner.name}</h2>
    <div class="result-line"><span>Final Sale Price</span><span>${finalSalePrice.toLocaleString()}</span></div>
    <div class="result-line"><span>Actual Value</span><span>${actualValue.toLocaleString()}</span></div>
    <div class="result-line"><span>Earnings</span><span class="value ${earnClass}">${earnings >= 0 ? "+" : ""}${earnings.toLocaleString()}</span></div>
    ${spilloverLines ? `<div class="spillover-list">Overpay spillover (10% each): ${spilloverLines}</div>` : ""}
  `;
}

// ---------- Init ----------

async function init() {
  state.pool = await loadPool();
  document.getElementById("landing-name").value = state.playerName;

  document.getElementById("btn-create-room").addEventListener("click", () => {
    showLandingError("");
    handleCreateRoom().catch((err) => showLandingError(err.message));
  });
  document.getElementById("btn-join-room").addEventListener("click", () => {
    handleJoinRoom().catch((err) => showLandingError(err.message));
  });
  document.getElementById("btn-leave-room").addEventListener("click", leaveRoom);
  document.getElementById("btn-start-match").addEventListener("click", () => {
    hostStartMatch().catch((err) => console.error("hostStartMatch failed:", err));
  });
  document.getElementById("btn-end-match").addEventListener("click", () => {
    hostEndMatch().catch((err) => console.error("hostEndMatch failed:", err));
  });

  const debugToggle = document.getElementById("toggle-debug");
  debugToggle.checked = state.debug;
  debugToggle.addEventListener("change", () => {
    state.debug = debugToggle.checked;
    render();
  });

  document.getElementById("btn-collectibles-index").addEventListener("click", () => {
    const indexPanel = document.getElementById("collectibles-index-panel");
    if (indexPanel.classList.contains("visible")) {
      indexPanel.classList.remove("visible");
    } else {
      openCollectiblesIndex();
    }
  });
  document.getElementById("btn-close-collectibles-index").addEventListener("click", () => {
    document.getElementById("collectibles-index-panel").classList.remove("visible");
  });

  showLandingScreen();
}

init().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#e05a4e;padding:2rem;">${err.message}\n\nDid you run this over http:// (not file://)? See implementation-plan.md.</pre>`;
});
