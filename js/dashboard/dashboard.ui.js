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
    goalsSummaryRow(goals),
    goalsInProgress.length === 0
      ? el("div", { style: "color:var(--muted);font-size:13px;" }, "Aucun objectif en cours.")
      : el("div", {}, goalsInProgress.map((g) => goalRow(g)))
  ]));
}

function statCard(label, value, sub, trend) {
  const children = [
    el("div", { class: "stat-label" }, label),
    el("div", { class: "stat-value" }, String(value)),
    el("div", { class: "stat-sub" }, sub)
  ];
  if (trend) {
    const color = trend.direction === "flat" ? "var(--muted2)"
      : (trend.direction === "up") === trend.badIsUp ? "var(--red)" : "var(--green)";
    const arrow = trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "→";
    children.push(el("div", { style: `font-size:11.5px;font-weight:700;color:${color};margin-top:2px;` },
      `${arrow} ${trend.pct > 0 ? "+" : ""}${trend.pct}% vs mois dernier`));
  }
  return el("div", { class: "card stat-card" }, children);
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

function goalsSummaryRow(goals) {
  if (!goals.length) return el("div", {});
  const done = goals.filter((g) => g.status === "completed").length;
  const late = goals.filter((g) => g.status !== "completed" && g.deadline && isPast(g.deadline)).length;
  const active = goals.length - done - late;
  return el("div", { style: "display:flex;gap:14px;font-size:12px;color:var(--muted2);margin-bottom:10px;flex-wrap:wrap;" }, [
    el("span", {}, `🏆 ${done} atteint(s)`),
    el("span", {}, `🔵 ${active} en cours`),
    el("span", { style: late ? "color:var(--red);font-weight:700;" : "" }, `🔴 ${late} en retard`)
  ]);
}

function goalRow(goal) {
  const progress = goalProgress(goal);
  const overdue = goal.deadline && isPast(goal.deadline) && goal.status !== "completed";
  const statusColor = goal.status === "completed" ? "var(--green)" : overdue ? "var(--red)" : progress >= 50 ? "var(--blue)" : "var(--orange)";
  const statusLabel = goal.status === "completed" ? "Atteint" : overdue ? "En retard" : "En cours";
  return el("div", { style: "margin-bottom:12px;" }, [
    el("div", { style: "display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:4px;" }, [
      el("span", { style: "display:flex;align-items:center;gap:6px;" }, [
        el("span", { style: `width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;display:inline-block;` }),
        goal.title
      ]),
      el("span", { style: "color:var(--muted);" }, `${progress}% · ${statusLabel}`)
    ]),
    el("div", { class: "progress-bar" }, [el("div", { style: `width:${progress}%;background:${statusColor};` })])
  ]);
}

function financeCard() {
  const f = financeSummary;
  const trend = f.evolutionDepensesPct !== null
    ? { pct: f.evolutionDepensesPct, direction: f.evolutionDepensesPct > 0 ? "up" : f.evolutionDepensesPct < 0 ? "down" : "flat", badIsUp: true }
    : null;
  return el("div", { class: "grid grid--3", style: "margin-bottom:20px;" }, [
    statCard("Solde actuel", formatMoney(f.soldeTotal), `${f.nbComptes} compte(s)`),
    statCard("Dépenses ce mois", formatMoney(f.totalDepensesMois), "Finances", trend),
    statCard("Budget restant", f.budgetRestant !== null ? formatMoney(f.budgetRestant) : "—", f.budgetGlobal > 0 ? "sur le mois" : "Aucun budget défini")
  ]);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(amount || 0);
}
