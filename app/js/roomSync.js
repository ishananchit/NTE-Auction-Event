// Firestore read/write layer for a room. One document per room at rooms/{code} holds the whole
// match state (confirmed comfortably under Firestore's 1MiB doc limit — see implementation-plan.md
// Stage 4 notes), plus an `actions` subcollection used as an intent queue: any client can add an
// action (place a bid, use a device); only the host client (see auctionEngine.js orchestration in
// main.js) actually applies actions to the authoritative match state and writes it back.
//
// No Firebase Auth (see clientIdentity.js) — these Firestore Rules are open test-mode rules, so
// nothing here is actually access-controlled server-side yet. That's an accepted limitation for a
// private friends game, not an oversight.

import { db } from "./firebaseClient.js";
import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  deleteDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

function roomDocRef(code) {
  return doc(db, "rooms", code);
}

function actionsCollectionRef(code) {
  return collection(db, "rooms", code, "actions");
}

export async function roomExists(code) {
  const snap = await getDoc(roomDocRef(code));
  return snap.exists();
}

export async function createRoom(code, hostClientId) {
  await setDoc(roomDocRef(code), {
    roomCode: code,
    hostClientId,
    phase: "lobby", // "lobby" | "match"
    seats: { 0: null, 1: null, 2: null, 3: null }, // each: {clientId, name, isBot, assistantName, deviceSetNames, balance} | null
    match: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Live subscription to the room document. Returns an unsubscribe function. */
export function subscribeToRoom(code, onChange) {
  return onSnapshot(roomDocRef(code), (snap) => {
    if (snap.exists()) onChange(snap.data());
  });
}

/** Arbitrary dot-path field updates, e.g. {"seats.0": {...}} or {"seats.2.assistantName": "Adler"}. */
export async function updateRoomFields(code, fields) {
  await updateDoc(roomDocRef(code), { ...fields, updatedAt: serverTimestamp() });
}

/** Any client (host included) submits an intent this way; only the host applies it. */
export async function submitAction(code, action) {
  await addDoc(actionsCollectionRef(code), { ...action, createdAt: serverTimestamp() });
}

/** Host-only: live subscription to the pending action queue. Returns an unsubscribe function. */
export function subscribeToActions(code, onChange) {
  return onSnapshot(actionsCollectionRef(code), (snap) => {
    const actions = [];
    snap.forEach((d) => actions.push({ id: d.id, ...d.data() }));
    onChange(actions);
  });
}

/** Host-only: remove an action once it's been applied. */
export async function deleteAction(code, actionId) {
  await deleteDoc(doc(db, "rooms", code, "actions", actionId));
}
