// Lecture SEULE des données de la Finance (document users/{uid}, champ `state`,
// écrit par index.html). Le module Tâches ne modifie jamais ce document : il ne fait
// que le lire pour afficher un résumé synthétique (solde, dépenses du mois) dans son
// propre dashboard/analyses — voir index.html pour la logique d'écriture d'origine.
import { db, doc, onSnapshot } from "../firebase/firebase-config.js";
import { todayStr } from "../utils/date.js";

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

  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const totalDepensesMoisPrecedent = (state.depenses || [])
    .filter((d) => (d.date || "").startsWith(prevMonthKey))
    .reduce((s, d) => s + (Number(d.montant) || 0), 0);
  const evolutionDepensesPct = totalDepensesMoisPrecedent > 0
    ? Math.round(((totalDepensesMois - totalDepensesMoisPrecedent) / totalDepensesMoisPrecedent) * 100)
    : null;

  return {
    soldeTotal,
    totalDepensesMois,
    totalDepensesMoisPrecedent,
    evolutionDepensesPct,
    topCategories,
    budgetGlobal,
    budgetRestant,
    nbComptes: (state.comptes || []).length
  };
}

/**
 * Convertit les factures Finance (lecture seule) en tâches virtuelles pour la vue
 * Tâches. Jamais écrites dans Firestore : calculées à l'affichage uniquement, le
 * statut de paiement (Finance) pilote le statut de la tâche, jamais l'inverse.
 */
export function financeInvoicesToTasks(state) {
  if (!state || !Array.isArray(state.factures)) return [];
  const today = todayStr();
  return state.factures.map((f) => {
    const overdue = f.statut !== "payee" && f.dateEcheance && f.dateEcheance < today;
    return {
      id: `facture-${f.id}`,
      title: f.description || "Facture",
      category: "Facture",
      priority: overdue ? "high" : "medium",
      date: f.dateEcheance || "",
      time: "",
      duration: null,
      color: "#f59e0b",
      status: f.statut === "payee" ? "done" : "todo",
      subtasks: [],
      notes: "",
      routineId: null,
      goalId: null,
      notified: {},
      isFacture: true,
      montant: f.montant || 0
    };
  });
}
