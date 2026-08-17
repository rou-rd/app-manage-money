// Vues personnalisées (filtres sauvegardés) — sous-collection users/{uid}/taskViews,
// isolée comme le reste du module Tâches (voir firebase-config.js).
import { addItem, removeItem, watchCollection } from "../utils/firestore.js";

const COL = "taskViews";

export function watchViews(uid, callback) {
  return watchCollection(uid, COL, callback, "createdAt");
}

export async function createView(uid, data) {
  return addItem(uid, COL, data);
}

export async function deleteView(uid, id) {
  return removeItem(uid, COL, id);
}
