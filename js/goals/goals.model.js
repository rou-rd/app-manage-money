export const TERMS = [
  { value: "short", label: "Court terme" },
  { value: "medium", label: "Moyen terme" },
  { value: "long", label: "Long terme" }
];

export const PRIORITIES = [
  { value: "low", label: "Basse" },
  { value: "medium", label: "Moyenne" },
  { value: "high", label: "Haute" }
];

export function newGoalDefaults() {
  return {
    title: "",
    description: "",
    term: "medium",
    deadline: "",
    priority: "medium",
    steps: [],
    status: "in_progress"
  };
}

export function goalProgress(goal) {
  if (!goal.steps || goal.steps.length === 0) return goal.status === "completed" ? 100 : 0;
  const done = goal.steps.filter((s) => s.done).length;
  return Math.round((done / goal.steps.length) * 100);
}
