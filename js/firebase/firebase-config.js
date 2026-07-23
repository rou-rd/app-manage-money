// Configuration Firebase partagée avec index.html (même projet, même compte utilisateur).
// Le module Tâches n'écrit JAMAIS dans le document users/{uid} racine utilisé par la
// finance (champs `state` / `updatedAt`) : il utilise uniquement des sous-collections
// (users/{uid}/tasks, /routines, /goals, ...) pour rester totalement isolé et ne jamais
// entrer en collision avec les données financières.

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, onSnapshot, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCrYOyadkNjuX3dSoX49ExSDzFuURd5NNM",
  authDomain:        "fintrack-7965e.firebaseapp.com",
  projectId:         "fintrack-7965e",
  storageBucket:     "fintrack-7965e.firebasestorage.app",
  messagingSenderId: "1024694573498",
  appId:             "1:1024694573498:web:f4eb2fc4378669b6872583"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

export {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged,
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, onSnapshot, query, where, orderBy, serverTimestamp
};
