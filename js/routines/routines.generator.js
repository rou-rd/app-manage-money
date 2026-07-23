import { daysInRange, dayOfWeek, dayOfMonth, addDays, todayStr } from "../utils/date.js";

/** Une routine "occurre"-t-elle le jour donné ? */
export function occursOn(routine, dateStr) {
  if (!routine.active) return false;
  if (routine.frequency === "daily") return true;
  if (routine.frequency === "weekly") return (routine.daysOfWeek || []).includes(dayOfWeek(dateStr));
  if (routine.frequency === "monthly") return dayOfMonth(dateStr) === routine.dayOfMonth;
  return false;
}

/**
 * Dates où la routine doit avoir une tâche générée mais n'en a pas encore,
 * sur une fenêtre glissante [aujourd'hui - backDays, aujourd'hui + aheadDays].
 */
export function pendingInstanceDates(routine, existingTasks, backDays = 3, aheadDays = 6) {
  const today = todayStr();
  const from = addDays(today, -backDays);
  const to = addDays(today, aheadDays);
  const existingDates = new Set(
    existingTasks.filter((t) => t.routineId === routine.id).map((t) => t.date)
  );
  return daysInRange(from, to).filter((d) => occursOn(routine, d) && !existingDates.has(d));
}

export function taskInstanceFromRoutine(routine, dateStr) {
  return {
    title: routine.title,
    description: "",
    category: routine.category,
    priority: "medium",
    date: dateStr,
    time: routine.time || "",
    duration: routine.duration || null,
    color: routine.color,
    status: "todo",
    subtasks: [],
    notes: "",
    routineId: routine.id,
    goalId: null,
    goalMilestoneId: null,
    notified: {}
  };
}
