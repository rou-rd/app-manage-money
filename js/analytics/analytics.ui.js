import { el, clear } from "../utils/dom.js";
import { subscribe } from "../store.js";
import { onAuthChange } from "../auth/auth.js";
import { watchFinanceState, summarizeFinance } from "../finance/finance-reader.js";
import { taskAnalytics, routineAnalytics, goalAnalytics, tasksPerDayThisWeek, tasksPerWeekHistory, tasksByCategory, routineHeatmap } from "./analytics.service.js";

let latestState = { tasks: [], routines: [], goals: [] };
let financeSummary = null;
let rootContainer = null;
let unsubFinance = null;
let activeTab = "tasks";

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

  const header = el("div", { class: "view-header" }, [el("h1", {}, "Analyses")]);
  container.appendChild(header);

  const tabs = [
    { key: "tasks", label: "Tâches" },
    { key: "habits", label: "Habitudes" },
    { key: "goals", label: "Objectifs" },
    { key: "finance", label: "Finances" }
  ];
  const chipBar = el("div", { class: "chip-bar" },
    tabs.map((t) => el("button", {
      class: `chip ${activeTab === t.key ? "active" : ""}`,
      onclick: () => { activeTab = t.key; render(container); }
    }, t.label))
  );
  container.appendChild(chipBar);

  if (activeTab === "tasks") renderTasksTab(container);
  else if (activeTab === "habits") renderHabitsTab(container);
  else if (activeTab === "goals") renderGoalsTab(container);
  else if (activeTab === "finance") renderFinanceTab(container);
}

function statTile(label, value, sub) {
  return el("div", { class: "card stat-card" }, [
    el("div", { class: "stat-label" }, label),
    el("div", { class: "stat-value" }, String(value)),
    sub ? el("div", { class: "stat-sub" }, sub) : null
  ]);
}

/* ── Tasks tab ── */
function renderTasksTab(container) {
  const a = taskAnalytics(latestState.tasks || []);
  container.appendChild(el("div", { class: "grid grid--4 mb-md" }, [
    statTile("Terminées", a.completedThisWeek, "cette semaine"),
    statTile("Manquées", a.missedThisWeek, "cette semaine"),
    statTile("Durée moy.", a.avgDuration ? `${a.avgDuration} min` : "—"),
    statTile("Top jour", a.mostProductiveDay, a.topCategory)
  ]));
  container.appendChild(el("div", { class: "grid grid--2 mb-md" }, [weeklyBarChart(), categoryDonutChart()].filter(Boolean)));
  container.appendChild(monthlyTrendChart());
}

/* ── Habits tab ── */
function renderHabitsTab(container) {
  const routines = latestState.routines || [];
  if (routines.length === 0) {
    container.appendChild(el("div", { class: "empty" }, [el("div", { class: "empty__icon" }, "🔁"), el("div", { class: "empty__text" }, "Aucune habitude à analyser.")]));
    return;
  }

  const grid = el("div", { class: "grid grid--3 mb-md" });
  routines.forEach((r) => {
    const a = routineAnalytics(r, latestState.tasks || []);
    grid.appendChild(el("div", { class: "card" }, [
      el("h4", { class: "mb-sm" }, r.title),
      el("div", { class: "flex gap-sm items-center mb-sm" }, [
        el("span", { class: "badge badge--orange" }, `🔥 ${a.currentStreak}`),
        el("span", { class: "badge badge--blue" }, `Record : ${a.bestStreak}`)
      ]),
      el("div", { class: "progress mb-sm" }, [el("div", { class: "progress__fill", style: `width:${a.successRate}%` })]),
      el("div", { class: "text-xs text-muted" }, `${a.successRate}% · ${a.success} réussi(s) / ${a.missed} manqué(s)`)
    ]));
  });
  container.appendChild(grid);

  const heatmap = routineHeatmapChart();
  if (heatmap) container.appendChild(heatmap);
}

/* ── Goals tab ── */
function renderGoalsTab(container) {
  const goals = latestState.goals || [];
  if (goals.length === 0) {
    container.appendChild(el("div", { class: "empty" }, [el("div", { class: "empty__icon" }, "🎯"), el("div", { class: "empty__text" }, "Aucun objectif à analyser.")]));
    return;
  }

  const rows = goalAnalytics(goals);
  const grid = el("div", { class: "grid grid--3" });
  rows.forEach(({ goal, progress, remainingDays, stepsDone, stepsTotal }) => {
    const overdue = remainingDays !== null && remainingDays < 0;
    grid.appendChild(el("div", { class: "card" }, [
      el("div", { class: "flex justify-between items-center mb-sm" }, [
        el("h4", {}, goal.title),
        el("span", { class: `badge ${overdue ? "badge--red" : "badge--primary"}` }, `${progress}%`)
      ]),
      el("div", { class: "progress mb-sm" }, [el("div", { class: "progress__fill", style: `width:${progress}%` })]),
      el("div", { class: "text-xs text-muted" },
        `${stepsDone}/${stepsTotal} étapes` + (remainingDays !== null ? ` · ${overdue ? "échéance dépassée" : remainingDays + " j restants"}` : ""))
    ]));
  });
  container.appendChild(grid);
}

/* ── Finance tab ── */
function renderFinanceTab(container) {
  if (!financeSummary) {
    container.appendChild(el("div", { class: "empty" }, [el("div", { class: "empty__icon" }, "💰"), el("div", { class: "empty__text" }, "Données financières non disponibles.")]));
    return;
  }
  const f = financeSummary;
  container.appendChild(el("div", { class: "grid grid--3 mb-md" }, [
    statTile("Dépenses", formatMoney(f.totalDepensesMois), "ce mois"),
    statTile("Budget restant", f.budgetRestant !== null ? formatMoney(f.budgetRestant) : "—"),
    statTile("Solde", formatMoney(f.soldeTotal))
  ]));

  const catCard = el("div", { class: "card" }, [el("h4", { class: "mb-md" }, "Dépenses par catégorie")]);
  if (f.topCategories.length === 0) {
    catCard.appendChild(el("div", { class: "text-sm text-muted" }, "Aucune dépense ce mois-ci."));
  } else {
    const max = Math.max(...f.topCategories.map((c) => c.total));
    f.topCategories.forEach((c) => {
      const pct = Math.round((c.total / max) * 100);
      catCard.appendChild(el("div", { class: "mb-sm" }, [
        el("div", { class: "flex justify-between text-sm mb-sm" }, [
          el("span", {}, c.nom),
          el("span", { class: "text-muted" }, formatMoney(c.total))
        ]),
        el("div", { class: "progress" }, [el("div", { class: "progress__fill", style: `width:${pct}%;background:var(--blue);` })])
      ]));
    });
  }
  container.appendChild(catCard);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(amount || 0);
}

/* ═══ SVG Charts (preserved) ═══ */

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (!c) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
  }
  return node;
}

const CHART_COLORS = ["#3d72d8", "#1d9e75", "#e24b4a", "#f6a623", "#8a5cf6", "#e06098"];

function weeklyBarChart() {
  const data = tasksPerDayThisWeek(latestState.tasks || []);
  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const W = 320, H = 180, barH = 18, gap = 6, labelW = 40, chartW = W - labelW - 10;

  const bars = data.map((d, i) => {
    const y = i * (barH + gap);
    const doneW = Math.round((d.done / maxVal) * chartW);
    const totalW = Math.round((d.total / maxVal) * chartW);
    return svgEl("g", {}, [
      svgEl("text", { x: "0", y: String(y + barH - 4), fill: "var(--muted)", "font-size": "11", "font-weight": "600" }, d.day.slice(0, 3)),
      svgEl("rect", { x: String(labelW), y: String(y), width: String(totalW || 1), height: String(barH), rx: "4", fill: "var(--border)" }),
      doneW > 0 ? svgEl("rect", { x: String(labelW), y: String(y), width: String(doneW), height: String(barH), rx: "4", fill: "var(--blue)" }) : null,
      d.total > 0 ? svgEl("text", { x: String(labelW + totalW + 6), y: String(y + barH - 4), fill: "var(--text)", "font-size": "10" }, `${d.done}/${d.total}`) : null
    ]);
  });

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: "max-width:360px;" }, bars);
  const card = el("div", { class: "card" }, [el("h4", { class: "mb-sm" }, "Tâches cette semaine")]);
  card.appendChild(svg);
  const legend = el("div", { class: "flex gap-md mt-sm", style: "font-size:11px;" }, [
    el("span", { class: "flex items-center gap-xs" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--blue);display:inline-block;" }), "Terminées"]),
    el("span", { class: "flex items-center gap-xs" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--border);display:inline-block;" }), "Total"])
  ]);
  card.appendChild(legend);
  return card;
}

function categoryDonutChart() {
  const data = tasksByCategory(latestState.tasks || []);
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.count, 0);
  const R = 60, cx = 80, cy = 80, strokeW = 20;
  const circumference = 2 * Math.PI * R;

  let offset = 0;
  const slices = data.map((d, i) => {
    const pct = d.count / total;
    const dash = pct * circumference;
    const slice = svgEl("circle", {
      cx: String(cx), cy: String(cy), r: String(R), fill: "none",
      stroke: CHART_COLORS[i % CHART_COLORS.length], "stroke-width": String(strokeW),
      "stroke-dasharray": `${dash} ${circumference - dash}`,
      "stroke-dashoffset": String(-offset),
      transform: `rotate(-90 ${cx} ${cy})`
    });
    offset += dash;
    return slice;
  });

  const svg = svgEl("svg", { viewBox: "0 0 160 160", width: "130", height: "130" }, [
    ...slices,
    svgEl("text", { x: String(cx), y: String(cy - 4), "text-anchor": "middle", fill: "var(--text)", "font-size": "18", "font-weight": "800" }, String(total)),
    svgEl("text", { x: String(cx), y: String(cy + 12), "text-anchor": "middle", fill: "var(--muted)", "font-size": "10" }, "tâches")
  ]);

  const legendItems = data.map((d, i) =>
    el("div", { class: "flex items-center gap-xs text-xs" }, [
      el("span", { style: `width:10px;height:10px;border-radius:2px;background:${CHART_COLORS[i % CHART_COLORS.length]};flex-shrink:0;display:inline-block;` }),
      el("span", {}, `${d.category} (${d.count})`)
    ])
  );

  const card = el("div", { class: "card" }, [
    el("h4", { class: "mb-sm" }, "Par catégorie"),
    el("div", { class: "flex items-center gap-lg", style: "flex-wrap:wrap;" }, [svg, el("div", { class: "flex flex-col gap-xs" }, legendItems)])
  ]);
  return card;
}

function monthlyTrendChart() {
  const data = tasksPerWeekHistory(latestState.tasks || []);
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const W = 320, H = 140, padL = 30, padR = 10, padT = 10, padB = 30;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const points = data.map((d, i) => {
    const x = padL + (i / (data.length - 1 || 1)) * chartW;
    const y = padT + chartH - (d.count / maxVal) * chartH;
    return { x, y, ...d };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M${points[0].x},${padT + chartH} ${points.map((p) => `L${p.x},${p.y}`).join(" ")} L${points[points.length - 1].x},${padT + chartH} Z`;

  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * chartH;
    const val = Math.round(maxVal * (1 - i / 4));
    gridLines.push(svgEl("line", { x1: String(padL), y1: String(y), x2: String(W - padR), y2: String(y), stroke: "var(--border)", "stroke-width": "1" }));
    gridLines.push(svgEl("text", { x: String(padL - 6), y: String(y + 3), "text-anchor": "end", fill: "var(--muted)", "font-size": "9" }, String(val)));
  }

  const labels = points.map((p) =>
    svgEl("text", { x: String(p.x), y: String(H - 6), "text-anchor": "middle", fill: "var(--muted)", "font-size": "9" }, p.weekLabel)
  );

  const dots = points.map((p) => svgEl("circle", { cx: String(p.x), cy: String(p.y), r: "3.5", fill: "var(--green)" }));

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: "max-width:400px;" }, [
    ...gridLines,
    svgEl("path", { d: areaPath, fill: "var(--green)", opacity: "0.12" }),
    svgEl("polyline", { points: polyline, fill: "none", stroke: "var(--green)", "stroke-width": "2.5", "stroke-linecap": "round", "stroke-linejoin": "round" }),
    ...dots,
    ...labels
  ]);

  const card = el("div", { class: "card" }, [el("h4", { class: "mb-sm" }, "Tendance mensuelle (terminées)"), svg]);
  return card;
}

function routineHeatmapChart() {
  const routines = latestState.routines || [];
  if (routines.length === 0) return null;

  const container = el("div", {});
  routines.forEach((r) => {
    const data = routineHeatmap(r, latestState.tasks || []);
    const cols = data.length;
    const size = 14, gap = 3, totalW = cols * (size + gap);

    const squares = data.map((d, i) => {
      const color = d.status === "done" ? "var(--green)" : d.status === "missed" ? "var(--red)" : d.status === "pending" ? "var(--orange)" : "var(--border)";
      return svgEl("rect", {
        x: String(i * (size + gap)), y: "0", width: String(size), height: String(size),
        rx: "2", fill: color
      });
    });

    const svg = svgEl("svg", { viewBox: `0 0 ${totalW} ${size}`, width: "100%", style: `max-width:${totalW}px;` }, squares);
    const row = el("div", { class: "mb-sm" }, [
      el("div", { class: "text-xs", style: "font-weight:700;margin-bottom:4px;" }, r.title),
      el("div", { style: "overflow-x:auto;" }, [svg])
    ]);
    container.appendChild(row);
  });

  const legend = el("div", { class: "flex gap-md mt-sm", style: "font-size:10px;color:var(--muted);" }, [
    el("span", { class: "flex items-center gap-xs" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--green);display:inline-block;" }), "Fait"]),
    el("span", { class: "flex items-center gap-xs" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--red);display:inline-block;" }), "Manqué"]),
    el("span", { class: "flex items-center gap-xs" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--orange);display:inline-block;" }), "En attente"]),
    el("span", { class: "flex items-center gap-xs" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--border);display:inline-block;" }), "—"])
  ]);

  const card = el("div", { class: "card" }, [el("h4", { class: "mb-sm" }, "Heatmap routines (30 jours)"), container, legend]);
  return card;
}
