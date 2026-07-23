// Lecture SEULE des données de la Finance (document users/{uid}, champ `state`,
// écrit par index.html). Le module Tâches ne modifie jamais ce document : il ne fait
// que le lire pour afficher un résumé synthétique (solde, dépenses du mois) dans son
// propre dashboard/analyses — voir index.html pour la logique d'écriture d'origine.
import { db, doc, onSnapshot } from "../firebase/firebase-config.js";

export function watchFinanceState(uid, callback) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    callback(snap.exists() ? (snap.data().state || null) : null);
  }, () => callback(null));
}

function soldeCompte(state, compte) {
  const depensesCompte = (state.depenses || [])
    .filter((d) => d.compteId === compte.id)
    .reduce((s, d) => s + (Number(d.montant) || 0), 0);
  const ops = (state.operations || []).filter((o) => o.compteId === compte.id && !o.factureId);
  const opsBalance = ops.reduce((s, o) => s + (o.type === "credit" ? o.montant : -o.montant), 0);
  const transferBalance = (state.transfers || []).reduce((s, t) => {
    if (t.fromCompteId === compte.id) return s - t.montant;
    if (t.toCompteId === compte.id) return s + t.montant;
    return s;
  }, 0);
  return (compte.soldeInitial || 0) - depensesCompte + opsBalance + transferBalance;
}

/** Résumé synthétique, en lecture seule, des données financières du tenant courant. */
export function summarizeFinance(state) {
  if (!state) return null;
  const soldeTotal = (state.comptes || []).reduce((sum, c) => sum + soldeCompte(state, c), 0);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const depensesMois = (state.depenses || []).filter((d) => (d.date || "").startsWith(monthKey));
  const totalDepensesMois = depensesMois.reduce((s, d) => s + (Number(d.montant) || 0), 0);

  const parCategorie = {};
  depensesMois.forEach((d) => {
    parCategorie[d.categorieId] = (parCategorie[d.categorieId] || 0) + (Number(d.montant) || 0);
  });
  const categoriesNames = Object.fromEntries((state.categories || []).map((c) => [c.id, c.nom]));
  const topCategories = Object.entries(parCategorie)
    .map(([id, total]) => ({ nom: categoriesNames[id] || "Autre", total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const budgetGlobal = state.budgetMensuelGlobal || 0;
  const budgetRestant = budgetGlobal > 0 ? budgetGlobal - totalDepensesMois : null;

  return {
    soldeTotal,
    totalDepensesMois,
    topCategories,
    budgetGlobal,
    budgetRestant,
    nbComptes: (state.comptes || []).length
  };
}
