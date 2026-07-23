import { addItem, setItem, removeItem } from "../utils/firestore.js";
import { uid as genId } from "../utils/id.js";

const COL = "tasks";

export async function createTask(uid, data) {
  return addItem(uid, COL, data);
}

export async function updateTask(uid, id, patch) {
  return setItem(uid, COL, id, patch);
}

export async function deleteTask(uid, id) {
  return removeItem(uid, COL, id);
}

export async function setTaskStatus(uid, task, status) {
  const patch = { status };
  if (status === "done" && task.subtasks?.length) {
    patch.subtasks = task.subtasks.map((s) => ({ ...s, done: true }));
  }
  return updateTask(uid, task.id, patch);
}

export async function addSubtask(uid, task, title) {
  const subtasks = [...(task.subtasks || []), { id: genId(), title, done: false }];
  return updateTask(uid, task.id, { subtasks });
}

export async function toggleSubtask(uid, task, subtaskId) {
  const subtasks = (task.subtasks || []).map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
  const allDone = subtasks.length > 0 && subtasks.every((s) => s.done);
  const patch = { subtasks };
  if (allDone && task.status !== "done") patch.status = "done";
  return updateTask(uid, task.id, patch);
}

export async function removeSubtask(uid, task, subtaskId) {
  const subtasks = (task.subtasks || []).filter((s) => s.id !== subtaskId);
  return updateTask(uid, task.id, { subtasks });
}
