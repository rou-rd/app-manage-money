// Notifications navigateur natives (Notification Web API) — aucune dépendance backend.
// Limite assumée : ne fonctionne que pendant que l'onglet de l'application est ouvert
// (pas de push server), conformément à la contrainte "100% statique, sans backend".
import { getState } from "../store.js";
import { getCurrentUser } from "../auth/auth.js";
import { updateTask } from "../tasks/tasks.service.js";
import { updateGoal } from "../goals/goals.service.js";
import { todayStr } from "../utils/date.js";

const CHECK_INTERVAL_MS = 60 * 1000;
let timer = null;

export function notificationsSupported() {
  return typeof Notification !== "undefined";
}

export function notificationsEnabled() {
  return notificationsSupported() && Notification.permission === "granted";
}

export function requestPermission() {
  if (!notificationsSupported()) return Promise.resolve("unsupported");
  return Notification.requestPermission();
}

function notify(title, body) {
  if (!notificationsEnabled()) return;
  try {
    new Notification(title, { body, icon: "icon-192.svg" });
  } catch (e) {
    console.warn("[Notifications]", e);
  }
}

function checkNow() {
  if (!notificationsEnabled()) return;
  const uid = getCurrentUser()?.uid;
  if (!uid) return;

  const state = getState();
  const now = new Date();
  const today = todayStr();

  state.tasks.forEach((t) => {
    if (t.status === "done" || !t.date) return;
    const notified = t.notified || {};

    if (t.date === today && t.time) {
      const due = new Date(`${t.date}T${t.time}:00`);
      const diffMin = (due - now) / 60000;
      if (diffMin <= 15 && diffMin > 5 && !notified.before) {
        notify("⏰ Tâche à venir", `"${t.title}" commence dans ${Math.round(diffMin)} min`);
        updateTask(uid, t.id, { notified: { ...notified, before: true } });
      }
      if (diffMin < -30 && !notified.missed) {
        notify("😬 Tâche oubliée", `"${t.title}" devait commencer à ${t.time}`);
        updateTask(uid, t.id, { notified: { ...notified, missed: true } });
      }
    } else if (t.date < today && !notified.missed) {
      notify("😬 Tâche en retard", `"${t.title}" n'a pas été terminée`);
      updateTask(uid, t.id, { notified: { ...notified, missed: true } });
    }
  });

  state.goals.forEach((g) => {
    if (g.status === "completed" || !g.deadline) return;
    if (g.deadline === today && !g.deadlineNotified) {
      notify("🎯 Échéance aujourd'hui", `L'objectif "${g.title}" arrive à échéance aujourd'hui`);
      updateGoal(uid, g.id, { deadlineNotified: true });
    }
  });

  state.routines.forEach((r) => {
    if (!r.active || !r.time) return;
    const todayTask = state.tasks.find((t) => t.routineId === r.id && t.date === today);
    if (!todayTask || todayTask.status === "done") return;
    const due = new Date(`${today}T${r.time}:00`);
    const diffMin = (now - due) / 60000;
    if (diffMin > 120 && !(todayTask.notified || {}).routineMissed) {
      notify("🔁 Routine non réalisée", `"${r.title}" n'a pas encore été faite aujourd'hui`);
      updateTask(uid, todayTask.id, { notified: { ...(todayTask.notified || {}), routineMissed: true } });
    }
  });
}

export function startNotificationScheduler() {
  if (timer) return;
  checkNow();
  timer = setInterval(checkNow, CHECK_INTERVAL_MS);
}

export function stopNotificationScheduler() {
  clearInterval(timer);
  timer = null;
}
