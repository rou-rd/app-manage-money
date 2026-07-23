// Petite couche générique au-dessus de Firestore pour les sous-collections
// `users/{uid}/<name>` utilisées par le module Tâches (tasks, routines, goals, ...).
// Isolée du document racine users/{uid} (champ `state`) utilisé par la Finance.
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, onSnapshot, query, orderBy, serverTimestamp
} from "../firebase/firebase-config.js";

function col(uid, name) {
  return collection(db, "users", uid, name);
}

export async function addItem(uid, name, data) {
  const ref = await addDoc(col(uid, name), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function setItem(uid, name, id, data) {
  await updateDoc(doc(db, "users", uid, name, id), { ...data, updatedAt: serverTimestamp() });
}

export async function removeItem(uid, name, id) {
  await deleteDoc(doc(db, "users", uid, name, id));
}

export async function listItems(uid, name, sortField = "createdAt") {
  const snap = await getDocs(query(col(uid, name), orderBy(sortField)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Écoute en temps réel une sous-collection ; callback(items[]). Retourne unsubscribe. */
export function watchCollection(uid, name, callback, sortField = "createdAt") {
  return onSnapshot(query(col(uid, name), orderBy(sortField)), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error(`[Firestore] watch(${name}) error:`, err);
    callback([]);
  });
}
