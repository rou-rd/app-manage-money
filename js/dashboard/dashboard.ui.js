import { el, clear } from "../utils/dom.js";
import { subscribe } from "../store.js";
import { onAuthChange } from "../auth/auth.js";
import { watchFinanceState, summarizeFinance } from "../finance/finance-reader.js";
import { todayStr, formatHuman, isPast } from "../utils/date.js";
import { goalProgress } from "../goals/goals.model.js";

let latestState = { tasks: [], routines: [], goals: [] };
let financeSummary = null;
let rootContainer = null;
let unsubFinance = null;

export function initDashboardView(container) {
  rootContainer = container;
  subscribe((state) => { latestState = state; render(container); });
  onAuthChange((user) => {
    if (unsubFinance) unsubFinance();
    if (user) {
      unsubFinance = watchFinanceState(user.uid, (financeState) => {
        financeSummary = summarizeFinance(financeState);
        render(rootContainer);
      });
    } else {
      financeSummary = null;
    }
  });
}

function render(container) {
  clear(container);
  const today = todayStr();
  const tasks = latestState.tasks || [];
  const goals = latestState.goals || [];

  const todayTasks = tasks.filter((t) => t.date === today);
  const overdueTasks = tasks.filter((t) => t.date && isPast(t.date) && t.status !== "done");
  const remainingTasks = tasks.filter((t) => t.status !== "done");
  const goalsInProgress = goals.filter((g) => g.status !== "completed");
  const estimatedMinutes = remainingTasks.reduce((s, t) => s + (t.duration || 0), 0);

  container.appendChild(el("div", { class: "topbar" }, [el("h1", {}, "Dashboard")]));

  const stats = el("div", { class: "grid grid--4", style: "margin-bottom:20px;" }, [
    statCard("Tâches aujourd'hui", todayTasks.length, `${todayTasks.filter(t => t.status === "done").length} terminées`),
    statCard("En retard", overdueTasks.length, overdueTasks.length ? "à traiter" : "tout est à jour 🎉"),
    statCard("Objectifs en cours", goalsInProgress.length, `${goals.length} au total`),
    statCard("Temps restant estimé", formatMinutes(estimatedMinutes), `${remainingTasks.length} tâche(s) restante(s)`)
  ]);
  container.appendChild(stats);

  if (financeSummary) {
    container.appendChild(financeCard());
  }

  const columns = el("div", { class: "grid grid--2" }, [
    listCard("📋 Aujourd'hui", todayTasks, "Rien de prévu aujourd'hui."),
    listCard("⏰ En retard", overdueTasks, "Aucune tâche en retard.")
  ]);
  container.appendChild(columns);

  container.appendChild(el("div", { class: "card", style: "margin-top:16px;" }, [
    el("h3", {}, "🎯 Objectifs en cours"),
    goalsInProgress.length === 0
      ? el("div", { style: "color:var(--muted);font-size:13px;" }, "Aucun objectif en cours.")
      : el("div", {}, goalsInProgress.map((g) => goalRow(g)))
  ]));
}

function statCard(label, value, sub) {
  return el("div", { class: "card stat-card" }, [
    el("div", { class: "stat-label" }, label),
    el("div", { class: "stat-value" }, String(value)),
    el("div", { class: "stat-sub" }, sub)
  ]);
}

function formatMinutes(min) {
  if (min <= 0) return "0 min";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}

function listCard(title, items, emptyLabel) {
  const card = el("div", { class: "card" }, [el("h3", {}, title)]);
  if (items.length === 0) {
    card.appendChild(el("div", { style: "color:var(--muted);font-size:13px;" }, emptyLabel));
    return card;
  }
  items.slice(0, 6).forEach((t) => {
    card.appendChild(el("div", { style: "display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13.5px;" }, [
      el("div", { style: `width:8px;height:8px;border-radius:50%;background:${t.color || "#3d72d8"};flex-shrink:0;` }),
      el("div", { style: "flex:1;" }, t.title),
      t.time ? el("span", { style: "font-size:11.5px;color:var(--muted2);" }, t.time) : null
    ]));
  });
  return card;
}

function goalRow(goal) {
  const progress = goalProgress(goal);
  return el("div", { style: "margin-bottom:12px;" }, [
    el("div", { style: "display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;" }, [
      el("span", {}, goal.title), el("span", { style: "color:var(--muted);" }, `${progress}%`)
    ]),
    el("div", { class: "progress-bar" }, [el("div", { style: `width:${progress}%` })])
  ]);
}

function financeCard() {
  const f = financeSummary;
  return el("div", { class: "grid grid--3", style: "margin-bottom:20px;" }, [
    statCard("Solde actuel", formatMoney(f.soldeTotal), `${f.nbComptes} compte(s)`),
    statCard("Dépenses ce mois", formatMoney(f.totalDepensesMois), "Finances"),
    statCard("Budget restant", f.budgetRestant !== null ? formatMoney(f.budgetRestant) : "—", f.budgetGlobal > 0 ? "sur le mois" : "Aucun budget défini")
  ]);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount || 0);
}
