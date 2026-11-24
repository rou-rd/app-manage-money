import { el, clear } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser } from "../auth/auth.js";
import { subscribe } from "../store.js";
import { todayStr, addDays, formatHuman, dayOfWeek, isPast } from "../utils/date.js";
import { FREQUENCIES, WEEKDAY_LABELS, newRoutineDefaults } from "./routines.model.js";
import { createRoutine, updateRoutine, deleteRoutine } from "./routines.service.js";
import { setTaskStatus } from "../tasks/tasks.service.js";
import { occursOn } from "./routines.generator.js";
import { DEFAULT_COLORS } from "../tasks/tasks.model.js";

let latestState = { routines: [], tasks: [] };
let root = null;

export function initHabitsView(container) {
  root = container;
  subscribe((state) => { latestState = state; render(container); });
}

export const initRoutinesView = initHabitsView;

function computeStreak(routine, tasks) {
  const today = todayStr();
  let streak = 0;
  let d = today;
  for (let i = 0; i < 90; i++) {
    if (!occursOn(routine, d)) { d = addDays(d, -1); continue; }
    const inst = tasks.find(t => t.routineId === routine.id && t.date === d);
    if (inst && inst.status === "done") { streak++; d = addDays(d, -1); }
    else if (d === today) { d = addDays(d, -1); }
    else break;
  }
  return streak;
}

function computeSuccessRate(routine, tasks, days = 30) {
  const today = todayStr();
  let scheduled = 0, done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    if (!occursOn(routine, d)) continue;
    scheduled++;
    const inst = tasks.find(t => t.routineId === routine.id && t.date === d);
    if (inst && inst.status === "done") done++;
  }
  return scheduled ? Math.round((done / scheduled) * 100) : 0;
}

function render(container) {
  clear(container);
  const routines = latestState.routines || [];
  const tasks = latestState.tasks || [];

  const header = el("div", { class: "view-header" }, [
    el("h1", {}, "Habitudes"),
    el("button", { class: "btn btn--primary btn--sm", onclick: () => openRoutineForm() }, "+ Nouvelle")
  ]);
  container.appendChild(header);

  if (routines.length > 0) container.appendChild(statsSection(routines, tasks));

  if (routines.length === 0) {
    container.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "empty__icon" }, "🔁"),
      el("div", { class: "empty__text" }, "Aucune habitude. Crée ta première routine !")
    ]));
  } else {
    const list = el("div", { class: "flex flex-col gap-sm" });
    routines.forEach(r => list.appendChild(habitRow(r, tasks)));
    container.appendChild(list);
  }

  container.appendChild(el("button", {
    class: "btn btn--fab", onclick: () => openRoutineForm()
  }, "+"));
}

function statsSection(routines, tasks) {
  const active = routines.filter(r => r.active);
  const streaks = active.map(r => computeStreak(r, tasks));
  const bestStreak = Math.max(0, ...streaks);
  const rates = active.map(r => computeSuccessRate(r, tasks));
  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

  return el("div", { class: "grid grid--3 mb-md" }, [
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Actives"),
      el("div", { class: "stat-value" }, String(active.length)),
    ]),
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Meilleur streak"),
      el("div", { class: "stat-value" }, `🔥 ${bestStreak}`),
    ]),
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Taux moyen"),
      el("div", { class: "stat-value" }, `${avgRate}%`),
    ])
  ]);
}

function habitRow(routine, tasks) {
  const uid = getCurrentUser()?.uid;
  const today = todayStr();
  const streak = computeStreak(routine, tasks);
  const rate = computeSuccessRate(routine, tasks);
  const todayInstance = tasks.find(t => t.routineId === routine.id && t.date === today);
  const todayDone = todayInstance && todayInstance.status === "done";
  const todayScheduled = occursOn(routine, today);

  const row = el("div", { class: "habit-row", style: `border-left:3px solid ${routine.color};${!routine.active ? "opacity:.5;" : ""}` });

  const checkEl = todayScheduled
    ? el("div", {
        class: `check ${todayDone ? "checked" : ""}`,
        onclick: async (e) => {
          e.stopPropagation();
          if (!uid || !todayInstance) return;
          await setTaskStatus(uid, todayInstance, todayDone ? "todo" : "done");
        }
      }, todayDone ? "✓" : "")
    : el("div", { style: "width:22px;" });

  const info = el("div", { class: "habit-row__info", onclick: () => openRoutineForm(routine) }, [
    el("div", { class: "flex items-center gap-sm" }, [
      el("span", { class: "habit-row__title" }, routine.title),
      el("span", { class: "badge" }, frequencyLabel(routine)),
      routine.category ? el("span", { class: "badge badge--purple" }, routine.category) : null
    ].filter(Boolean)),
    el("div", { class: "flex items-center gap-sm mt-sm" }, [
      streak > 0 ? el("span", { class: "habit-row__streak" }, `🔥 ${streak} jours`) : null,
      el("span", { class: "text-xs text-muted-2" }, `${rate}% · ${routine.time || "--:--"}${routine.duration ? " · " + routine.duration + "min" : ""}`)
    ].filter(Boolean))
  ]);

  const heatmap = buildHeatmap(routine, tasks);

  row.append(checkEl, info, heatmap);
  return row;
}

function buildHeatmap(routine, tasks) {
  const today = todayStr();
  const grid = el("div", { class: "habit-grid" });

  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const scheduled = occursOn(routine, d);
    const inst = tasks.find(t => t.routineId === routine.id && t.date === d);
    let cls = "habit-cell";
    if (d === today) cls += " habit-cell--today";
    if (scheduled) {
      if (inst && inst.status === "done") cls += " habit-cell--done";
      else if (isPast(d)) cls += " habit-cell--missed";
    }
    grid.appendChild(el("div", { class: cls, title: formatHuman(d) }));
  }
  return grid;
}

function frequencyLabel(routine) {
  if (routine.frequency === "daily") return "Quotidien";
  if (routine.frequency === "weekly") return "Hebdo";
  if (routine.frequency === "monthly") return "Mensuel";
  return "";
}

function openRoutineForm(existing) {
  const uid = getCurrentUser()?.uid;
  if (!uid) { toast("Connecte-toi pour gérer tes habitudes.", "error"); return; }

  const data = existing ? { ...existing } : newRoutineDefaults(dayOfWeek(todayStr()));
  const body = el("div", {});

  const titleInput = el("input", { value: data.title, placeholder: "Ex : Sport, Lecture, Méditation..." });
  titleInput.addEventListener("input", (e) => { data.title = e.target.value; });

  const categoryInput = el("input", { value: data.category });
  categoryInput.addEventListener("input", (e) => { data.category = e.target.value; });

  const freqSelect = el("select", {}, FREQUENCIES.map(f =>
    el("option", { value: f.value, selected: f.value === data.frequency ? "selected" : null }, f.label)
  ));

  const weeklyBlock = el("div", { class: "field", style: data.frequency === "weekly" ? "" : "display:none;" }, [
    el("label", {}, "Jours"),
    el("div", { class: "chip-bar" }, WEEKDAY_LABELS.map((label, idx) => {
      const active = (data.daysOfWeek || []).includes(idx);
      const chip = el("button", {
        class: `chip ${active ? "active" : ""}`, type: "button",
        onclick: () => {
          const set = new Set(data.daysOfWeek || []);
          if (set.has(idx)) set.delete(idx); else set.add(idx);
          data.daysOfWeek = Array.from(set).sort();
          chip.className = `chip ${set.has(idx) ? "active" : ""}`;
        }
      }, label);
      return chip;
    }))
  ]);

  const monthlyBlock = el("div", { class: "field", style: data.frequency === "monthly" ? "" : "display:none;" }, [
    el("label", {}, "Jour du mois"),
    el("input", { type: "number", min: "1", max: "31", value: data.dayOfMonth, oninput: (e) => { data.dayOfMonth = Number(e.target.value); } })
  ]);

  freqSelect.addEventListener("change", (e) => {
    data.frequency = e.target.value;
    weeklyBlock.style.display = data.frequency === "weekly" ? "" : "none";
    monthlyBlock.style.display = data.frequency === "monthly" ? "" : "none";
  });

  const timeInput = el("input", { type: "time", value: data.time });
  timeInput.addEventListener("input", (e) => { data.time = e.target.value; });

  const durationInput = el("input", { type: "number", value: data.duration ?? "", placeholder: "Minutes" });
  durationInput.addEventListener("input", (e) => { data.duration = e.target.value ? Number(e.target.value) : null; });

  const colorWrap = el("div", { class: "color-dots" });
  DEFAULT_COLORS.forEach(c => {
    const dot = el("div", {
      class: `color-dot ${c === data.color ? "active" : ""}`,
      style: `background:${c};`,
      onclick: () => { data.color = c; colorWrap.querySelectorAll(".color-dot").forEach(n => n.classList.remove("active")); dot.classList.add("active"); }
    });
    colorWrap.appendChild(dot);
  });

  const activeToggle = el("label", { class: "flex items-center gap-sm", style: "cursor:pointer;font-size:.88rem;" }, [
    el("input", { type: "checkbox", checked: data.active ? "checked" : null, onchange: (e) => { data.active = e.target.checked; } }),
    "Active"
  ]);

  body.append(
    fieldWrap("Titre", titleInput),
    fieldWrap("Catégorie", categoryInput),
    el("div", { class: "field-row" }, [
      fieldWrap("Fréquence", freqSelect),
      fieldWrap("Heure", timeInput)
    ]),
    weeklyBlock,
    monthlyBlock,
    fieldWrap("Durée (min)", durationInput),
    fieldWrap("Couleur", colorWrap),
    el("div", { class: "field" }, [activeToggle])
  );

  const actions = [{ label: "Annuler", onClick: closeModal }];
  if (existing) {
    actions.push({
      label: "Supprimer", variant: "danger",
      onClick: async () => {
        const linked = (latestState.tasks || []).filter(t => t.routineId === existing.id);
        const msg = linked.length
          ? `Supprimer cette habitude et ses ${linked.length} tâche(s) liée(s) ?`
          : "Supprimer cette habitude ?";
        if (confirm(msg)) { await deleteRoutine(uid, existing.id, linked); closeModal(); }
      }
    });
  }
  actions.push({
    label: existing ? "Enregistrer" : "Créer", variant: "primary",
    onClick: async () => {
      if (!data.title.trim()) { toast("Le titre est obligatoire", "error"); return; }
      if (data.frequency === "weekly" && (!data.daysOfWeek || data.daysOfWeek.length === 0)) {
        toast("Sélectionne au moins un jour", "error"); return;
      }
      if (existing) await updateRoutine(uid, existing.id, data);
      else await createRoutine(uid, data);
      toast(existing ? "Habitude mise à jour" : "Habitude créée", "success");
      closeModal();
    }
  });

  openModal(existing ? "Modifier l'habitude" : "Nouvelle habitude", body, actions);
}

function fieldWrap(label, node) {
  return el("div", { class: "field" }, [el("label", {}, label), node]);
}
