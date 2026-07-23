// Authentification partagée (module Tâches) — même compte Google que la Finance.
import {
  auth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged
} from "../firebase/firebase-config.js";

let currentUser = null;
const listeners = new Set();

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  listeners.forEach(cb => cb(user));
});

getRedirectResult(auth).catch(() => {});

export function getCurrentUser() {
  return currentUser;
}

/** S'abonne aux changements d'état d'authentification. Retourne une fonction de désinscription. */
export function onAuthChange(callback) {
  listeners.add(callback);
  if (currentUser !== null) callback(currentUser);
  return () => listeners.delete(callback);
}

export async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== "auth/cancelled-popup-request" && e.code !== "auth/popup-closed-by-user") {
      throw e;
    }
  }
}

export async function logout() {
  await signOut(auth);
}
