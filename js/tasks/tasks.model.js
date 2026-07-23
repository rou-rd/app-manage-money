export const PRIORITIES = [
  { value: "low", label: "Basse" },
  { value: "medium", label: "Moyenne" },
  { value: "high", label: "Haute" }
];

export const STATUSES = [
  { value: "todo", label: "À faire" },
  { value: "doing", label: "En cours" },
  { value: "done", label: "Terminée" }
];

export const DEFAULT_COLORS = ["#3d72d8", "#1d9e75", "#f6a623", "#e24b4a", "#8a5cf6", "#00b8d9"];

export function newTaskDefaults() {
  return {
    title: "",
    description: "",
    category: "Général",
    priority: "medium",
    date: "",
    time: "",
    duration: null,
    color: DEFAULT_COLORS[0],
    status: "todo",
    subtasks: [],
    notes: "",
    routineId: null,
    goalId: null,
    goalMilestoneId: null,
    notified: {}
  };
}

export function taskProgress(task) {
  if (!task.subtasks || task.subtasks.length === 0) return task.status === "done" ? 100 : 0;
  const done = task.subtasks.filter((s) => s.done).length;
  return Math.round((done / task.subtasks.length) * 100);
}
