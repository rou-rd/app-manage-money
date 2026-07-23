import { addItem, setItem, removeItem } from "../utils/firestore.js";
import { uid as genId } from "../utils/id.js";

const COL = "goals";

export async function createGoal(uid, data) {
  return addItem(uid, COL, data);
}

export async function updateGoal(uid, id, patch) {
  return setItem(uid, COL, id, patch);
}

export async function deleteGoal(uid, id) {
  return removeItem(uid, COL, id);
}

export async function addStep(uid, goal, title) {
  const steps = [...(goal.steps || []), { id: genId(), title, done: false }];
  return updateGoal(uid, goal.id, { steps });
}

export async function toggleStep(uid, goal, stepId) {
  const steps = (goal.steps || []).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
  const patch = { steps };
  if (steps.length > 0 && steps.every((s) => s.done)) patch.status = "completed";
  else if (goal.status === "completed") patch.status = "in_progress";
  return updateGoal(uid, goal.id, patch);
}

export async function removeStep(uid, goal, stepId) {
  const steps = (goal.steps || []).filter((s) => s.id !== stepId);
  return updateGoal(uid, goal.id, { steps });
}
