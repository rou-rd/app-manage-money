import { addItem, setItem, removeItem } from "../utils/firestore.js";
import { createTask } from "../tasks/tasks.service.js";
import { pendingInstanceDates, taskInstanceFromRoutine } from "./routines.generator.js";

const COL = "routines";

export async function createRoutine(uid, data) {
  const id = await addItem(uid, COL, data);
  await generateInstancesForRoutine(uid, { ...data, id }, []);
  return id;
}

export async function updateRoutine(uid, id, patch) {
  return setItem(uid, COL, id, patch);
}

export async function deleteRoutine(uid, id) {
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

/** Génère les tâches manquantes pour toutes les routines actives (appelé une fois au chargement). */
export async function generateAllInstances(uid, routines, tasks) {
  let total = 0;
  for (const routine of routines) {
    if (!routine.active) continue;
    total += await generateInstancesForRoutine(uid, routine, tasks);
  }
  return total;
}
