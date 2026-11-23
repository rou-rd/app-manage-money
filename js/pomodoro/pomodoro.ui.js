import { el } from "../utils/dom.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser } from "../auth/auth.js";
import { updateTask } from "../tasks/tasks.service.js";

const WORK_MIN = 25;
const SHORT_BREAK_MIN = 5;
const LONG_BREAK_MIN = 15;
const SESSIONS_BEFORE_LONG = 4;

let widget = null;
let minimized = true;
let currentTask = null;
let phase = "work";
let sessionsCompleted = 0;
let totalSecondsWorked = 0;
let running = false;
let endTime = 0;
let remainingMs = WORK_MIN * 60 * 1000;
let rafId = null;

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .pomo-widget {
      position: fixed; bottom: 80px; right: 20px; z-index: 400;
      font-family: var(--font); transition: all .2s ease;
    }
    .pomo-pill {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border);
      box-shadow: 0 4px 20px rgba(0,0,0,.15); cursor: pointer;
      font-size: 14px; font-weight: 700; color: var(--text);
    }
    .pomo-pill:hover { filter: brightness(1.05); }
    .pomo-expanded {
      width: 280px; padding: 20px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,.18);
    }
    .pomo-title {
      font-size: 12.5px; font-weight: 700; color: var(--muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-bottom: 14px; text-align: center;
    }
    .pomo-ring-wrap { display: flex; justify-content: center; margin-bottom: 14px; }
    .pomo-time {
      font-size: 32px; font-weight: 800; text-align: center; margin-bottom: 4px;
      font-variant-numeric: tabular-nums;
    }
    .pomo-phase {
      font-size: 11.5px; font-weight: 700; text-align: center;
      text-transform: uppercase; letter-spacing: .04em; margin-bottom: 14px;
    }
    .pomo-controls { display: flex; justify-content: center; gap: 8px; margin-bottom: 10px; }
    .pomo-btn {
      width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border);
      background: var(--surface-2); color: var(--text); cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    .pomo-btn:hover { background: var(--border); }
    .pomo-sessions { font-size: 11px; color: var(--muted2); text-align: center; }
    .pomo-minimize {
      position: absolute; top: 8px; right: 10px; background: none; border: none;
      color: var(--muted); cursor: pointer; font-size: 14px; padding: 4px;
    }
  `;
  document.head.appendChild(style);
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.stop(ctx.currentTime + 0.8);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1000;
      gain2.gain.value = 0.3;
      osc2.start();
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc2.stop(ctx.currentTime + 0.6);
    }, 300);
  } catch (e) { /* silent */ }
}

function notifyUser(title, body) {
  playBeep();
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "icon-192.svg" }); } catch (e) { /* */ }
  }
}

function phaseDuration() {
  if (phase === "work") return WORK_MIN * 60 * 1000;
  if (phase === "longBreak") return LONG_BREAK_MIN * 60 * 1000;
  return SHORT_BREAK_MIN * 60 * 1000;
}

function phaseLabel() {
  if (phase === "work") return "Focus";
  if (phase === "longBreak") return "Pause longue";
  return "Pause";
}

function phaseColor() {
  return phase === "work" ? "var(--red)" : "var(--green)";
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function tick() {
  if (!running) return;
  const now = Date.now();
  remainingMs = Math.max(0, endTime - now);
  renderWidget();
  if (remainingMs <= 0) {
    onPhaseEnd();
    return;
  }
  rafId = requestAnimationFrame(tick);
}

async function onPhaseEnd() {
  running = false;
  if (phase === "work") {
    sessionsCompleted++;
    totalSecondsWorked += WORK_MIN * 60;
    await savePomodoroTime();
    if (sessionsCompleted % SESSIONS_BEFORE_LONG === 0) {
      phase = "longBreak";
      notifyUser("Pause longue !", `${LONG_BREAK_MIN} min de repos. ${sessionsCompleted} sessions terminées.`);
    } else {
      phase = "shortBreak";
      notifyUser("Pause !", `${SHORT_BREAK_MIN} min de repos. Session ${sessionsCompleted} terminée.`);
    }
  } else {
    phase = "work";
    notifyUser("C'est reparti !", `Focus ${WORK_MIN} min — "${currentTask?.title || "Tâche"}"`);
  }
  remainingMs = phaseDuration();
  running = true;
  endTime = Date.now() + remainingMs;
  rafId = requestAnimationFrame(tick);
  renderWidget();
}

async function savePomodoroTime() {
  if (!currentTask) return;
  const uid = getCurrentUser()?.uid;
  if (!uid || currentTask.isFacture) return;
  try {
    const prev = currentTask.pomodoroMinutes || 0;
    await updateTask(uid, currentTask.id, { pomodoroMinutes: prev + WORK_MIN });
    currentTask.pomodoroMinutes = prev + WORK_MIN;
  } catch (e) { console.error("[Pomodoro] save:", e); }
}

function startTimer() {
  running = true;
  endTime = Date.now() + remainingMs;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
  renderWidget();
}

function pauseTimer() {
  running = false;
  remainingMs = Math.max(0, endTime - Date.now());
  if (rafId) cancelAnimationFrame(rafId);
  renderWidget();
}

function stopTimer() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  currentTask = null;
  phase = "work";
  sessionsCompleted = 0;
  totalSecondsWorked = 0;
  remainingMs = WORK_MIN * 60 * 1000;
  widget.style.display = "none";
}

function skipPhase() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  if (phase === "work") {
    sessionsCompleted++;
    totalSecondsWorked += Math.round((phaseDuration() - remainingMs) / 1000);
    savePomodoroTime();
    phase = sessionsCompleted % SESSIONS_BEFORE_LONG === 0 ? "longBreak" : "shortBreak";
  } else {
    phase = "work";
  }
  remainingMs = phaseDuration();
  startTimer();
}

function ringSvg(progress) {
  const r = 50, cx = 60, cy = 60, sw = 8;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);
  return `<svg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${phaseColor()}" stroke-width="${sw}"
      stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
      stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
      style="transition: stroke-dashoffset 0.3s ease;"/>
  </svg>`;
}

function renderWidget() {
  if (!widget || !currentTask) return;

  const progress = 1 - (remainingMs / phaseDuration());

  if (minimized) {
    widget.innerHTML = "";
    const pill = el("div", { class: "pomo-pill", onclick: () => { minimized = false; renderWidget(); } }, [
      el("span", {}, "🍅"),
      el("span", { style: `color:${phaseColor()};` }, formatTime(remainingMs)),
      el("span", { style: "font-size:11px;color:var(--muted2);" }, `#${sessionsCompleted + (phase === "work" ? 1 : 0)}`)
    ]);
    widget.appendChild(pill);
    return;
  }

  widget.innerHTML = "";
  const card = el("div", { class: "pomo-expanded", style: "position:relative;" });

  card.appendChild(el("button", { class: "pomo-minimize", onclick: () => { minimized = true; renderWidget(); } }, "▼"));

  card.appendChild(el("div", { class: "pomo-title" }, currentTask.title));

  const ringWrap = el("div", { class: "pomo-ring-wrap" });
  ringWrap.innerHTML = ringSvg(progress);
  card.appendChild(ringWrap);

  card.appendChild(el("div", { class: "pomo-time", style: `color:${phaseColor()};` }, formatTime(remainingMs)));
  card.appendChild(el("div", { class: "pomo-phase", style: `color:${phaseColor()};` }, phaseLabel()));

  const controls = el("div", { class: "pomo-controls" }, [
    el("button", { class: "pomo-btn", onclick: () => running ? pauseTimer() : startTimer(), title: running ? "Pause" : "Play" },
      running ? "⏸" : "▶"),
    el("button", { class: "pomo-btn", onclick: skipPhase, title: "Passer" }, "⏭"),
    el("button", { class: "pomo-btn", onclick: stopTimer, title: "Arrêter" }, "⏹")
  ]);
  card.appendChild(controls);

  card.appendChild(el("div", { class: "pomo-sessions" },
    `${sessionsCompleted} session(s) · ${Math.round(totalSecondsWorked / 60)} min focus`));

  widget.appendChild(card);
}

export function initPomodoro() {
  injectStyles();
  widget = el("div", { class: "pomo-widget" });
  widget.style.display = "none";
  document.body.appendChild(widget);
}

export function startPomodoro(task) {
  if (!task) return;
  if (currentTask && running) {
    if (!confirm(`Un timer est déjà en cours pour "${currentTask.title}". Remplacer ?`)) return;
    if (rafId) cancelAnimationFrame(rafId);
  }
  currentTask = task;
  phase = "work";
  sessionsCompleted = 0;
  totalSecondsWorked = 0;
  remainingMs = WORK_MIN * 60 * 1000;
  minimized = false;
  widget.style.display = "";
  startTimer();
  toast(`🍅 Pomodoro lancé : "${task.title}"`, "info");
}
