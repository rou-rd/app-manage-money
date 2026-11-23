import { todayStr, startOfWeek, addDays, dayOfWeek, weekdayLabel, diffDays, parseDateStr } from "../utils/date.js";
import { goalProgress } from "../goals/goals.model.js";
import { occursOn } from "../routines/routines.generator.js";

export function taskAnalytics(tasks) {
  const today = todayStr();
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const weekTasks = tasks.filter((t) => t.date && t.date >= weekStart && t.date <= weekEnd);

  const completedThisWeek = weekTasks.filter((t) => t.status === "done").length;
  const missedThisWeek = weekTasks.filter((t) => t.date < today && t.status !== "done").length;

  const completedWithDuration = tasks.filter((t) => t.status === "done" && t.duration);
  const avgDuration = completedWithDuration.length
    ? Math.round(completedWithDuration.reduce((s, t) => s + t.duration, 0) / completedWithDuration.length)
    : 0;

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  tasks.filter((t) => t.status === "done" && t.date).forEach((t) => { byWeekday[dayOfWeek(t.date)]++; });
  const maxCount = Math.max(...byWeekday);
  const mostProductiveDay = maxCount > 0 ? weekdayLabel(byWeekday.indexOf(maxCount)) : "—";

  const byCategory = {};
  tasks.forEach((t) => { byCategory[t.category || "Général"] = (byCategory[t.category || "Général"] || 0) + 1; });
  const topCategoryEntry = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const topCategory = topCategoryEntry ? topCategoryEntry[0] : "—";

  return { completedThisWeek, missedThisWeek, avgDuration, mostProductiveDay, topCategory };
}

export function routineAnalytics(routine, tasks) {
  const today = todayStr();
  const instances = tasks
    .filter((t) => t.routineId === routine.id && t.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  let best = 0, current = 0, success = 0, missed = 0;
  instances.forEach((inst) => {
    if (inst.status === "done") { success++; current++; best = Math.max(best, current); }
    else { missed++; current = 0; }
  });
  const successRate = instances.length ? Math.round((success / instances.length) * 100) : 0;

  return { routine, totalDays: instances.length, success, missed, successRate, currentStreak: current, bestStreak: best };
}

export function goalAnalytics(goals) {
  const today = todayStr();
  return goals.map((g) => ({
    goal: g,
    progress: goalProgress(g),
    remainingDays: g.deadline ? diffDays(today, g.deadline) : null,
    stepsDone: (g.steps || []).filter((s) => s.done).length,
    stepsTotal: (g.steps || []).length
  }));
}

export function tasksPerDayThisWeek(tasks) {
  const today = todayStr();
  const ws = startOfWeek(today);
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const dayTasks = tasks.filter((t) => t.date === d);
    result.push({ day: weekdayLabel(i), date: d, total: dayTasks.length, done: dayTasks.filter((t) => t.status === "done").length });
  }
  return result;
}

export function tasksPerWeekHistory(tasks, weeks = 8) {
  const today = todayStr();
  const currentWs = startOfWeek(today);
  const result = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDays(currentWs, -7 * w);
    const we = addDays(ws, 6);
    const count = tasks.filter((t) => t.status === "done" && t.date >= ws && t.date <= we).length;
    const d = parseDateStr(ws);
    result.push({ weekLabel: `${d.getDate()}/${d.getMonth() + 1}`, count });
  }
  return result;
}

export function tasksByCategory(tasks) {
  const map = {};
  tasks.forEach((t) => { const c = t.category || "Général"; map[c] = (map[c] || 0) + 1; });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (sorted.length <= 6) return sorted.map(([category, count]) => ({ category, count }));
  const top = sorted.slice(0, 5);
  const other = sorted.slice(5).reduce((s, e) => s + e[1], 0);
  return [...top.map(([category, count]) => ({ category, count })), { category: "Autres", count: other }];
}

export function routineHeatmap(routine, tasks, days = 30) {
  const today = todayStr();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const scheduled = occursOn(routine, d);
    if (!scheduled) { result.push({ date: d, status: "none" }); continue; }
    const inst = tasks.find((t) => t.routineId === routine.id && t.date === d);
    if (inst && inst.status === "done") result.push({ date: d, status: "done" });
    else if (d < today) result.push({ date: d, status: "missed" });
    else result.push({ date: d, status: "pending" });
  }
  return result;
}
