// Firebase app + Firestore initialization. Loaded from the CDN as ES modules (no bundler/npm —
// deliberate Stage 1 choice so GitHub Pages hosting stays simple), matching the version the
// Firebase console generated when the web app was registered.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
