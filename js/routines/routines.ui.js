import { el, clear } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser } from "../auth/auth.js";
import { subscribe } from "../store.js";
import { dayOfWeek, todayStr } from "../utils/date.js";
import { FREQUENCIES, WEEKDAY_LABELS, newRoutineDefaults } from "./routines.model.js";
import { createRoutine, updateRoutine, deleteRoutine } from "./routines.service.js";
import { DEFAULT_COLORS } from "../tasks/tasks.model.js";

let latestState = { routines: [], tasks: [] };

export function initRoutinesView(container) {
  subscribe((state) => { latestState = state; render(container); });
}

function render(container) {
  clear(container);
  const toolbar = el("div", { class: "topbar" }, [
    el("h1", {}, "Routines"),
    el("div", { class: "actions" }, [
      el("button", { class: "btn btn--primary", onclick: () => openRoutineForm() }, "+ Nouvelle routine")
    ])
  ]);
  container.appendChild(toolbar);

  const routines = latestState.routines || [];
  if (routines.length === 0) {
    container.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, "🔁"),
      el("div", {}, "Aucune routine. Crée une routine (sport, lecture, méditation...) et les tâches se génèrent automatiquement chaque jour.")
    ]));
    return;
  }

  const grid = el("div", { class: "grid grid--3" });
  routines.forEach((r) => grid.appendChild(routineCard(r)));
  container.appendChild(grid);
}

function frequencyLabel(routine) {
  if (routine.frequency === "daily") return "Tous les jours";
  if (routine.frequency === "weekly") return "Chaque " + (routine.daysOfWeek || []).map((d) => WEEKDAY_LABELS[d]).join(", ");
  if (routine.frequency === "monthly") return `Le ${routine.dayOfMonth} du mois`;
  return "";
}

function routineCard(routine) {
  const uid = getCurrentUser()?.uid;
  const card = el("div", { class: "card", style: `border-left:4px solid ${routine.color};` });
  card.append(
    el("h3", {}, routine.title),
    el("div", { class: "badge badge--info", style: "margin-bottom:8px;" }, frequencyLabel(routine)),
    el("div", { style: "font-size:12.5px;color:var(--muted);margin-bottom:12px;" },
      `${routine.category} · ${routine.time || "--:--"}${routine.duration ? " · " + routine.duration + " min" : ""}`),
    el("div", { style: "display:flex;gap:8px;" }, [
      el("button", { class: "btn btn--sm btn--ghost", onclick: () => openRoutineForm(routine) }, "Modifier"),
      el("button", {
        class: `btn btn--sm ${routine.active ? "btn--ghost" : "btn--primary"}`,
        onclick: async () => { await updateRoutine(uid, routine.id, { active: !routine.active }); }
      }, routine.active ? "Mettre en pause" : "Réactiver"),
      el("button", {
        class: "btn btn--sm btn--danger",
        onclick: async () => { if (confirm("Supprimer cette routine ?")) await deleteRoutine(uid, routine.id); }
      }, "✕")
    ])
  );
  if (!routine.active) card.style.opacity = "0.55";
  return card;
}

function openRoutineForm(existing) {
  const uid = getCurrentUser()?.uid;
  if (!uid) { toast("Connecte-toi pour gérer tes routines.", "error"); return; }

  const data = existing ? { ...existing } : newRoutineDefaults(dayOfWeek(todayStr()));
  const body = el("div", {});

  const titleInput = el("input", { value: data.title, placeholder: "Ex : Sport, Lecture, Méditation...", oninput: (e) => (data.title = e.target.value) });
  const categoryInput = el("input", { value: data.category, oninput: (e) => (data.category = e.target.value) });

  const freqSelect = el("select", {}, FREQUENCIES.map((f) => el("option", { value: f.value, selected: f.value === data.frequency ? "selected" : null }, f.label)));

  const weeklyBlock = el("div", { class: "field", style: data.frequency === "weekly" ? "" : "display:none;" }, [
    el("label", {}, "Jours de la semaine"),
    el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;" }, WEEKDAY_LABELS.map((label, idx) => {
      const active = (data.daysOfWeek || []).includes(idx);
      const chip = el("button", {
        class: `btn btn--sm ${active ? "btn--primary" : "btn--ghost"}`, type: "button",
        onclick: () => {
          const set = new Set(data.daysOfWeek || []);
          if (set.has(idx)) set.delete(idx); else set.add(idx);
          data.daysOfWeek = Array.from(set).sort();
          chip.className = `btn btn--sm ${set.has(idx) ? "btn--primary" : "btn--ghost"}`;
        }
      }, label);
      return chip;
    }))
  ]);

  const monthlyBlock = el("div", { class: "field", style: data.frequency === "monthly" ? "" : "display:none;" }, [
    el("label", {}, "Jour du mois"),
    el("input", { type: "number", min: "1", max: "31", value: data.dayOfMonth, oninput: (e) => (data.dayOfMonth = Number(e.target.value)) })
  ]);

  freqSelect.addEventListener("change", (e) => {
    data.frequency = e.target.value;
    weeklyBlock.style.display = data.frequency === "weekly" ? "" : "none";
    monthlyBlock.style.display = data.frequency === "monthly" ? "" : "none";
  });

  const timeInput = el("input", { type: "time", value: data.time, oninput: (e) => (data.time = e.target.value) });
  const durationInput = el("input", { type: "number", value: data.duration ?? "", oninput: (e) => (data.duration = e.target.value ? Number(e.target.value) : null) });

  const colorWrap = el("div", { style: "display:flex;gap:8px;" });
  DEFAULT_COLORS.forEach((c) => {
    const swatch = el("div", {
      style: `width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c === data.color ? "var(--text)" : "transparent"};`,
      onclick: () => { data.color = c; colorWrap.querySelectorAll("div").forEach((n) => (n.style.borderColor = "transparent")); swatch.style.borderColor = "var(--text)"; }
    });
    colorWrap.appendChild(swatch);
  });

  body.append(
    fieldWrap("Titre", titleInput),
    fieldWrap("Catégorie", categoryInput),
    fieldWrap("Fréquence", freqSelect),
    weeklyBlock,
    monthlyBlock,
    fieldWrap("Heure", timeInput),
    fieldWrap("Durée (min)", durationInput),
    fieldWrap("Couleur", colorWrap)
  );

  const actions = [{ label: "Annuler", onClick: closeModal }];
  if (existing) {
    actions.push({ label: "Supprimer", variant: "danger", onClick: async () => { await deleteRoutine(uid, existing.id); closeModal(); } });
  }
  actions.push({
    label: existing ? "Enregistrer" : "Créer",
    variant: "primary",
    onClick: async () => {
      if (!data.title.trim()) { toast("Le titre est obligatoire", "error"); return; }
      if (data.frequency === "weekly" && (!data.daysOfWeek || data.daysOfWeek.length === 0)) {
        toast("Sélectionne au moins un jour de la semaine", "error"); return;
      }
      if (existing) await updateRoutine(uid, existing.id, data);
      else await createRoutine(uid, data);
      toast(existing ? "Routine mise à jour" : "Routine créée", "success");
      closeModal();
    }
  });

  openModal(existing ? "Modifier la routine" : "Nouvelle routine", body, actions);
}

function fieldWrap(label, node) {
  return el("div", { class: "field" }, [el("label", {}, label), node]);
}
