// Firebase project config for "NTE auction event" — this is NOT a secret (Firebase's actual
// security boundary is the Firestore Rules, not hiding this object), so it's fine for it to be
// plain, committed, client-side code. No .env file — this app has no build step (deliberate
// Stage 1 choice so GitHub Pages hosting stays simple), so there's nowhere for a build-time
// environment variable to be injected from anyway.
export const firebaseConfig = {
  apiKey: "AIzaSyA_x6rQBnYMQ17UcvMzsjw5MiG0vT7jO-A",
  authDomain: "nte-auction-event.firebaseapp.com",
  projectId: "nte-auction-event",
  storageBucket: "nte-auction-event.firebasestorage.app",
  messagingSenderId: "621085381733",
  appId: "1:621085381733:web:5812824f42d24ba279a28c",
};
