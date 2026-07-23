import { initTheme, toggleTheme, currentTheme } from "./utils/theme.js";
import { onAuthChange, login, logout } from "./auth/auth.js";
import { subscribe } from "./store.js";
import { generateAllInstances } from "./routines/routines.service.js";
import { toast } from "./utils/toast.js";

import { initDashboardView } from "./dashboard/dashboard.ui.js";
import { initTasksView } from "./tasks/tasks.ui.js";
import { initRoutinesView } from "./routines/routines.ui.js";
import { initGoalsView } from "./goals/goals.ui.js";
import { initCalendarView } from "./calendar/calendar.ui.js";
import { initAnalyticsView } from "./analytics/analytics.ui.js";
import { initGamificationView } from "./gamification/gamification.ui.js";
import {
  notificationsSupported, notificationsEnabled, requestPermission, startNotificationScheduler
} from "./notifications/notifications.js";

initTheme();

const views = {
  dashboard: document.getElementById("view-dashboard"),
  tasks: document.getElementById("view-tasks"),
  routines: document.getElementById("view-routines"),
  goals: document.getElementById("view-goals"),
  calendar: document.getElementById("view-calendar"),
  analytics: document.getElementById("view-analytics"),
  gamification: document.getElementById("view-gamification")
};

let viewsInitialized = false;
let routineGenerationTriggered = false;

function initAllViews() {
  if (viewsInitialized) return;
  viewsInitialized = true;
  initDashboardView(views.dashboard);
  initTasksView(views.tasks);
  initRoutinesView(views.routines);
  initGoalsView(views.goals);
  initCalendarView(views.calendar);
  initAnalyticsView(views.analytics);
  initGamificationView(views.gamification);
}

function showView(name) {
  Object.entries(views).forEach(([key, node]) => node.classList.toggle("active", key === name));
  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
}

document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// Thème
const themeBtn = document.getElementById("theme-toggle");
function syncThemeIcon() { themeBtn.textContent = currentTheme() === "dark" ? "☀️" : "🌙"; }
syncThemeIcon();
themeBtn.addEventListener("click", () => { toggleTheme(); syncThemeIcon(); });

// Authentification
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userBlock = document.getElementById("user-block");
const userName = document.getElementById("user-name");
const userPhoto = document.getElementById("user-photo");

loginBtn.addEventListener("click", () => login().catch((e) => toast(e.message || "Erreur de connexion", "error")));
logoutBtn.addEventListener("click", () => logout());

onAuthChange((user) => {
  if (user) {
    document.body.classList.remove("app-hidden");
    userBlock.style.display = "flex";
    userName.textContent = user.displayName || user.email || "";
    if (user.photoURL) userPhoto.src = user.photoURL;
    initAllViews();
    maybeShowNotificationBanner();
    if (notificationsEnabled()) startNotificationScheduler();
  } else {
    document.body.classList.add("app-hidden");
    userBlock.style.display = "none";
  }
});

// Génération automatique des instances de routines — une fois par session, dès que
// tâches/routines/objectifs ont livré leur premier instantané Firestore.
subscribe((state) => {
  if (!routineGenerationTriggered && state.ready) {
    routineGenerationTriggered = true;
    generateAllInstances(state.uid, state.routines, state.tasks).catch((e) => console.error("[Routines] génération:", e));
  }
});

// Notifications navigateur
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
    toast("Notifications activées ✅", "success");
    startNotificationScheduler();
  } else {
    toast("Notifications refusées — tu peux les réactiver depuis les réglages du navigateur.", "info");
  }
});

notifDismissBtn.addEventListener("click", () => {
  localStorage.setItem(NOTIF_DISMISS_KEY, "1");
  notifBanner.classList.remove("show");
});

showView("dashboard");
