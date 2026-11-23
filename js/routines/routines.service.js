import { addItem, setItem, removeItem } from "../utils/firestore.js";
import { createTask } from "../tasks/tasks.service.js";
import { pendingInstanceDates, taskInstanceFromRoutine } from "./routines.generator.js";
import { addDays, todayStr } from "../utils/date.js";

const COL = "routines";

export async function createRoutine(uid, data) {
  const id = await addItem(uid, COL, data);
  await generateInstancesForRoutine(uid, { ...data, id }, []);
  return id;
}

export async function updateRoutine(uid, id, patch) {
  return setItem(uid, COL, id, patch);
}

export async function deleteRoutine(uid, id, linkedTasks = []) {
  for (const t of linkedTasks) {
    await removeItem(uid, "tasks", t.id);
  }
  return removeItem(uid, COL, id);
}

/** Génère les tâches manquantes pour une routine donnée, sur la fenêtre glissante. */
export async function generateInstancesForRoutine(uid, routine, existingTasks) {
  const dates = pendingInstanceDates(routine, existingTasks);
  for (const date of dates) {
    await createTask(uid, taskInstanceFromRoutine(routine, date));
  }
  return dates.length;
}

/**
 * Supprime les tâches de routine "todo" dont la date est antérieure au seuil
 * (par défaut 30 jours). Évite l'accumulation de centaines de tâches fantômes.
 */
export async function cleanupOldRoutineTasks(uid, tasks, daysOld = 30) {
  const cutoff = addDays(todayStr(), -daysOld);
  const stale = tasks.filter(t => t.routineId && t.status !== "done" && t.date && t.date < cutoff);
  for (const t of stale) {
    await removeItem(uid, "tasks", t.id);
  }
  return stale.length;
}

/** Génère les tâches manquantes pour toutes les routines actives (appelé une fois au chargement). */
export async function generateAllInstances(uid, routines, tasks) {
  let total = 0;
  for (const routine of routines) {
    if (!routine.active) continue;
    total += await generateInstancesForRoutine(uid, routine, tasks);
  }
  return total;
}
