import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyC2b4uadBUyzIgWOfMDMNRQArmonZryz2s",
  authDomain: "exam-9f830.firebaseapp.com",
  projectId: "exam-9f830",
  storageBucket: "exam-9f830.firebasestorage.app",
  messagingSenderId: "487411053541",
  appId: "1:487411053541:web:bfc8e4a1d13969a707f50c",
  measurementId: "G-6W3K2J6G76"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
