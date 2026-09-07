// Short shareable room codes — one player creates a room and gets a code, others type it in to
// join (§2 recreation decision: a simple room code instead of full lobby/matchmaking, since this
// is for a private friend group, not public matchmaking).

// Excludes visually-ambiguous characters (0/O, 1/I/L) since this gets read aloud/typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 5) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(input) {
  return (input || "").trim().toUpperCase();
}
