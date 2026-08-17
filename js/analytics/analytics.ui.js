import { el, clear } from "../utils/dom.js";
import { subscribe } from "../store.js";
import { onAuthChange } from "../auth/auth.js";
import { watchFinanceState, summarizeFinance } from "../finance/finance-reader.js";
import { taskAnalytics, routineAnalytics, goalAnalytics } from "./analytics.service.js";

let latestState = { tasks: [], routines: [], goals: [] };
let financeSummary = null;
let rootContainer = null;
let unsubFinance = null;

export function initAnalyticsView(container) {
  rootContainer = container;
  subscribe((state) => { latestState = state; render(container); });
  onAuthChange((user) => {
    if (unsubFinance) unsubFinance();
    if (user) {
      unsubFinance = watchFinanceState(user.uid, (fs) => { financeSummary = summarizeFinance(fs); render(rootContainer); });
    } else {
      financeSummary = null;
    }
  });
}

function render(container) {
  clear(container);
  container.appendChild(el("div", { class: "topbar" }, [el("h1", {}, "Analyses")]));

  container.appendChild(sectionTitle("📋 Tâches"));
  container.appendChild(taskSection());

  container.appendChild(sectionTitle("🔁 Routines"));
  container.appendChild(routineSection());

  container.appendChild(sectionTitle("🎯 Objectifs"));
  container.appendChild(goalSection());

  if (financeSummary) {
    container.appendChild(sectionTitle("💰 Finances"));
    container.appendChild(financeSection());
  }
}

function sectionTitle(label) {
  return el("h3", { style: "margin:22px 0 10px;" }, label);
}

function statTile(label, value, sub) {
  return el("div", { class: "card stat-card" }, [
    el("div", { class: "stat-label" }, label),
    el("div", { class: "stat-value" }, String(value)),
    sub ? el("div", { class: "stat-sub" }, sub) : null
  ]);
}

function taskSection() {
  const a = taskAnalytics(latestState.tasks || []);
  return el("div", { class: "grid grid--4" }, [
    statTile("Terminées cette semaine", a.completedThisWeek),
    statTile("Manquées cette semaine", a.missedThisWeek),
    statTile("Durée moyenne", a.avgDuration ? `${a.avgDuration} min` : "—"),
    statTile("Jour le plus productif", a.mostProductiveDay, `Catégorie phare : ${a.topCategory}`)
  ]);
}

function routineSection() {
  const routines = latestState.routines || [];
  if (routines.length === 0) return el("div", { class: "empty-state" }, [el("div", { class: "icon" }, "🔁"), el("div", {}, "Aucune routine à analyser pour le moment.")]);

  const grid = el("div", { class: "grid grid--3" });
  routines.forEach((r) => {
    const a = routineAnalytics(r, latestState.tasks || []);
    grid.appendChild(el("div", { class: "card" }, [
      el("h3", {}, r.title),
      el("div", { style: "display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;" }, [
        el("span", { class: "streak-chip" }, `🔥 ${a.currentStreak}`),
        el("span", { class: "badge badge--info" }, `Record : ${a.bestStreak}`)
      ]),
      el("div", { class: "progress-bar", style: "margin-bottom:6px;" }, [el("div", { style: `width:${a.successRate}%` })]),
      el("div", { style: "font-size:12px;color:var(--muted);" }, `${a.successRate}% de réussite · ${a.success} réussi(s) / ${a.missed} manqué(s)`)
    ]));
  });
  return grid;
}

function goalSection() {
  const goals = latestState.goals || [];
  if (goals.length === 0) return el("div", { class: "empty-state" }, [el("div", { class: "icon" }, "🎯"), el("div", {}, "Aucun objectif à analyser pour le moment.")]);

  const rows = goalAnalytics(goals);
  const grid = el("div", { class: "grid grid--3" });
  rows.forEach(({ goal, progress, remainingDays, stepsDone, stepsTotal }) => {
    grid.appendChild(el("div", { class: "card" }, [
      el("h3", {}, goal.title),
      el("div", { class: "progress-bar", style: "margin-bottom:6px;" }, [el("div", { style: `width:${progress}%` })]),
      el("div", { style: "font-size:12px;color:var(--muted);" },
        `${progress}% · ${stepsDone}/${stepsTotal} étapes` + (remainingDays !== null ? ` · ${remainingDays >= 0 ? remainingDays + " j restants" : "échéance dépassée"}` : ""))
    ]));
  });
  return grid;
}

function financeSection() {
  const f = financeSummary;
  const grid = el("div", { class: "grid grid--3", style: "margin-bottom:14px;" }, [
    statTile("Dépenses mensuelles", formatMoney(f.totalDepensesMois)),
    statTile("Budget restant", f.budgetRestant !== null ? formatMoney(f.budgetRestant) : "—"),
    statTile("Solde actuel", formatMoney(f.soldeTotal))
  ]);
  const catCard = el("div", { class: "card" }, [el("h3", {}, "Dépenses par catégorie (ce mois)")]);
  if (f.topCategories.length === 0) {
    catCard.appendChild(el("div", { style: "color:var(--muted);font-size:13px;" }, "Aucune dépense ce mois-ci."));
  } else {
    const max = Math.max(...f.topCategories.map((c) => c.total));
    f.topCategories.forEach((c) => {
      catCard.appendChild(el("div", { style: "margin-bottom:10px;" }, [
        el("div", { style: "display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;" }, [
          el("span", {}, c.nom), el("span", { style: "color:var(--muted);" }, formatMoney(c.total))
        ]),
        el("div", { class: "progress-bar" }, [el("div", { style: `width:${Math.round((c.total / max) * 100)}%;background:var(--blue);` })])
      ]));
    });
  }
  const wrap = el("div", {});
  wrap.append(grid, catCard);
  return wrap;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(amount || 0);
}
