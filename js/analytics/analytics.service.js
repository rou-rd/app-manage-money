import { todayStr, startOfWeek, addDays, dayOfWeek, weekdayLabel, diffDays } from "../utils/date.js";
import { goalProgress } from "../goals/goals.model.js";

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
