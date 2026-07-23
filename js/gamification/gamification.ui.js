import { el, clear } from "../utils/dom.js";
import { subscribe } from "../store.js";
import { computeGamificationStats } from "./gamification.service.js";

export function initGamificationView(container) {
  subscribe((state) => render(container, computeGamificationStats(state)));
}

function render(container, g) {
  clear(container);
  container.appendChild(el("div", { class: "topbar" }, [el("h1", {}, "Progression")]));

  const levelCard = el("div", { class: "card", style: "margin-bottom:20px;" }, [
    el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;" }, [
      el("div", {}, [
        el("div", { style: "font-size:22px;font-weight:800;" }, `Niveau ${g.level}`),
        el("div", { style: "font-size:12.5px;color:var(--muted);" }, `${g.points} points au total`)
      ]),
      el("span", { class: "streak-chip" }, `🔥 Meilleure série : ${g.bestStreak} j`)
    ]),
    el("div", { class: "progress-bar" }, [el("div", { style: `width:${Math.round((g.pointsInLevel / g.pointsForNextLevel) * 100)}%` })]),
    el("div", { style: "font-size:12px;color:var(--muted2);margin-top:6px;" }, `${g.pointsInLevel} / ${g.pointsForNextLevel} points avant le niveau ${g.level + 1}`)
  ]);
  container.appendChild(levelCard);

  const stats = el("div", { class: "grid grid--3", style: "margin-bottom:20px;" }, [
    statTile("Tâches terminées", g.tasksCompleted),
    statTile("Objectifs atteints", g.goalsCompleted),
    statTile("Série actuelle", `${g.currentBestStreak} j`)
  ]);
  container.appendChild(stats);

  container.appendChild(el("h3", {}, "🏅 Badges"));
  const grid = el("div", { class: "grid grid--4" });
  g.badges.forEach((b) => {
    grid.appendChild(el("div", { class: `badge-tile ${b.unlocked ? "" : "locked"}` }, [
      el("div", { class: "emoji" }, b.emoji),
      el("div", { class: "label" }, b.label)
    ]));
  });
  container.appendChild(grid);
}

function statTile(label, value) {
  return el("div", { class: "card stat-card" }, [
    el("div", { class: "stat-label" }, label),
    el("div", { class: "stat-value" }, String(value))
  ]);
}
