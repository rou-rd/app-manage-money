import { initTheme, toggleTheme, currentTheme } from "./utils/theme.js";
import { onAuthChange, login, logout } from "./auth/auth.js";
import { subscribe } from "./store.js";
import { generateAllInstances, cleanupOldRoutineTasks } from "./routines/routines.service.js";
import { toast } from "./utils/toast.js";
import { initPomodoro } from "./pomodoro/pomodoro.ui.js";
import {
  notificationsSupported, notificationsEnabled, requestPermission, startNotificationScheduler
} from "./notifications/notifications.js";

import { initTodayView } from "./views/today.js";
import { initTasksView } from "./tasks/tasks.ui.js";
import { initHabitsView } from "./routines/routines.ui.js";
import { initGoalsView } from "./goals/goals.ui.js";
import { initCalendarView } from "./calendar/calendar.ui.js";
import { initAnalyticsView } from "./analytics/analytics.ui.js";
import { initFinanceView } from "./finance/finance.ui.js";
import { initSettingsView } from "./views/settings.js";

initTheme();
initPomodoro();

const views = {
  today: document.getElementById("view-today"),
  tasks: document.getElementById("view-tasks"),
  habits: document.getElementById("view-habits"),
  goals: document.getElementById("view-goals"),
  calendar: document.getElementById("view-calendar"),
  analytics: document.getElementById("view-analytics"),
  finance: document.getElementById("view-finance"),
  settings: document.getElementById("view-settings")
};

const loginGate = document.getElementById("login-gate");
const appShell = document.getElementById("app");

let viewsInitialized = false;
let routineGenerationTriggered = false;

function showView(name) {
  Object.entries(views).forEach(([key, node]) => node.classList.toggle("active", key === name));
  document.querySelectorAll(".nav-item[data-view]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.view === name)
  );
  document.querySelectorAll(".bnav-item[data-view]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.view === name)
  );
}

function initAllViews() {
  if (viewsInitialized) return;
  viewsInitialized = true;
  initTodayView(views.today);
  initTasksView(views.tasks);
  initHabitsView(views.habits);
  initGoalsView(views.goals);
  initCalendarView(views.calendar);
  initAnalyticsView(views.analytics);
  initFinanceView(views.finance);
  initSettingsView(views.settings);
}

document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
document.querySelectorAll(".bnav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

const themeBtn = document.getElementById("theme-toggle");
const themeBtnM = document.getElementById("theme-toggle-m");
function syncThemeIcon() {
  const icon = currentTheme() === "dark" ? "☀️" : "🌙";
  if (themeBtn) themeBtn.textContent = icon;
  if (themeBtnM) themeBtnM.textContent = icon;
}
syncThemeIcon();
function onThemeToggle() { toggleTheme(); syncThemeIcon(); }
if (themeBtn) themeBtn.addEventListener("click", onThemeToggle);
if (themeBtnM) themeBtnM.addEventListener("click", onThemeToggle);

document.getElementById("login-btn").addEventListener("click", () =>
  login().catch((e) => toast(e.message || "Erreur de connexion", "error"))
);
document.getElementById("logout-btn").addEventListener("click", () => logout());

const userPhoto = document.getElementById("user-photo");
const userPhotoM = document.getElementById("user-photo-m");
const userName = document.getElementById("user-name");

onAuthChange((user) => {
  if (user) {
    loginGate.style.display = "none";
    appShell.classList.remove("app-hidden");
    userName.textContent = user.displayName || user.email || "";
    if (user.photoURL) {
      userPhoto.src = user.photoURL;
      userPhotoM.src = user.photoURL;
    }
    initAllViews();
    maybeShowNotificationBanner();
    if (notificationsEnabled()) startNotificationScheduler();
  } else {
    loginGate.style.display = "";
    appShell.classList.add("app-hidden");
  }
});

subscribe((state) => {
  if (!routineGenerationTriggered && state.ready) {
    routineGenerationTriggered = true;
    cleanupOldRoutineTasks(state.uid, state.tasks).catch((e) => console.error("[Routines] cleanup:", e));
    generateAllInstances(state.uid, state.routines, state.tasks).catch((e) => console.error("[Routines] génération:", e));
  }
});

const notifBanner = document.getElementById("notif-banner");
const notifEnableBtn = document.getElementById("notif-enable-btn");
const notifDismissBtn = document.getElementById("notif-dismiss-btn");
const NOTIF_DISMISS_KEY = "lifehub-notif-dismissed";

function maybeShowNotificationBanner() {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "default") return;
  if (localStorage.getItem(NOTIF_DISMISS_KEY)) return;
  notifBanner.classList.add("show");
}

notifEnableBtn.addEventListener("click", async () => {
  const result = await requestPermission();
  notifBanner.classList.remove("show");
  if (result === "granted") {
    toast("Notifications activées", "success");
    startNotificationScheduler();
  } else {
    toast("Notifications refusées — tu peux les réactiver depuis les réglages du navigateur.", "info");
  }
});

notifDismissBtn.addEventListener("click", () => {
  localStorage.setItem(NOTIF_DISMISS_KEY, "1");
  notifBanner.classList.remove("show");
});

showView("today");
