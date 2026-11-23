import { el, clear } from "../utils/dom.js";
import { subscribe } from "../store.js";
import { onAuthChange } from "../auth/auth.js";
import { watchFinanceState, summarizeFinance } from "../finance/finance-reader.js";
import { taskAnalytics, routineAnalytics, goalAnalytics, tasksPerDayThisWeek, tasksPerWeekHistory, tasksByCategory, routineHeatmap } from "./analytics.service.js";

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
  container.appendChild(el("div", { class: "grid grid--2", style: "margin-top:12px;" }, [weeklyBarChart(), categoryDonutChart()].filter(Boolean)));
  container.appendChild(el("div", { style: "margin-top:12px;" }, [monthlyTrendChart()]));

  container.appendChild(sectionTitle("🔁 Routines"));
  container.appendChild(routineSection());
  const heatmap = routineHeatmapChart();
  if (heatmap) container.appendChild(el("div", { style: "margin-top:12px;" }, [heatmap]));

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
  const card = el("div", { class: "card" }, [el("h4", { style: "margin-bottom:12px;" }, "Tâches cette semaine")]);
  card.appendChild(svg);
  const legend = el("div", { style: "display:flex;gap:14px;margin-top:8px;font-size:11px;" }, [
    el("span", { style: "display:flex;align-items:center;gap:4px;" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--blue);display:inline-block;" }), "Terminées"]),
    el("span", { style: "display:flex;align-items:center;gap:4px;" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--border);display:inline-block;" }), "Total"])
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
    el("div", { style: "display:flex;align-items:center;gap:6px;font-size:12px;" }, [
      el("span", { style: `width:10px;height:10px;border-radius:2px;background:${CHART_COLORS[i % CHART_COLORS.length]};flex-shrink:0;display:inline-block;` }),
      el("span", {}, `${d.category} (${d.count})`)
    ])
  );

  const card = el("div", { class: "card" }, [
    el("h4", { style: "margin-bottom:12px;" }, "Répartition par catégorie"),
    el("div", { style: "display:flex;align-items:center;gap:20px;flex-wrap:wrap;" }, [svg, el("div", { style: "display:flex;flex-direction:column;gap:6px;" }, legendItems)])
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

  const card = el("div", { class: "card" }, [el("h4", { style: "margin-bottom:12px;" }, "Tendance mensuelle (terminées)"), svg]);
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
    const row = el("div", { style: "margin-bottom:10px;" }, [
      el("div", { style: "font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text);" }, r.title),
      el("div", { style: "overflow-x:auto;" }, [svg])
    ]);
    container.appendChild(row);
  });

  const legend = el("div", { style: "display:flex;gap:12px;margin-top:6px;font-size:10px;color:var(--muted);" }, [
    el("span", { style: "display:flex;align-items:center;gap:3px;" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--green);display:inline-block;" }), "Fait"]),
    el("span", { style: "display:flex;align-items:center;gap:3px;" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--red);display:inline-block;" }), "Manqué"]),
    el("span", { style: "display:flex;align-items:center;gap:3px;" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--orange);display:inline-block;" }), "En attente"]),
    el("span", { style: "display:flex;align-items:center;gap:3px;" }, [el("span", { style: "width:10px;height:10px;border-radius:2px;background:var(--border);display:inline-block;" }), "Non prévu"])
  ]);

  const card = el("div", { class: "card" }, [el("h4", { style: "margin-bottom:12px;" }, "Heatmap routines (30 jours)"), container, legend]);
  return card;
}
