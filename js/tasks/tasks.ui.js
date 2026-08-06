import { el, clear, escapeHtml } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser } from "../auth/auth.js";
import { subscribe } from "../store.js";
import { formatHuman, isPast, isToday, todayStr } from "../utils/date.js";
import {
  PRIORITIES, STATUSES, DEFAULT_COLORS, newTaskDefaults, taskProgress
} from "./tasks.model.js";
import {
  createTask, updateTask, deleteTask, setTaskStatus, addSubtask, toggleSubtask, removeSubtask
} from "./tasks.service.js";

let root = null;
let latestState = { tasks: [] };
let filters = { scope: "all", status: "all", query: "" };

export function initTasksView(container) {
  root = container;
  subscribe((state) => { latestState = state; render(container); });
}

function currentTasks(state) {
  let list = [...state.tasks];
  const today = todayStr();
  if (filters.scope === "today") list = list.filter((t) => t.date === today);
  else if (filters.scope === "upcoming") list = list.filter((t) => t.date && t.date >= today);
  else if (filters.scope === "overdue") list = list.filter((t) => t.date && t.date < today && t.status !== "done");
  if (filters.status !== "all") list = list.filter((t) => t.status === filters.status);
  if (filters.query) {
    const q = filters.query.toLowerCase();
    list = list.filter((t) => t.title.toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q));
  }
  return list.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
}

function render(container) {
  clear(container);
  const state = latestState;

  const toolbar = el("div", { class: "topbar" }, [
    el("h1", {}, "Tâches"),
    el("div", { class: "actions" }, [
      el("input", {
        class: "search-input", placeholder: "Rechercher...",
        oninput: (e) => { filters.query = e.target.value; render(container); }
      }),
      el("button", { class: "btn btn--primary", onclick: () => openTaskForm() }, "+ Nouvelle tâche")
    ])
  ]);
  toolbar.querySelector(".search-input").style.cssText = "padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-alt);color:var(--text);";

  const chips = el("div", { style: "display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;" }, [
    scopeChip("Toutes", "all"),
    scopeChip("Aujourd'hui", "today"),
    scopeChip("À venir", "upcoming"),
    scopeChip("En retard", "overdue")
  ]);

  container.appendChild(toolbar);
  container.appendChild(chips);

  const list = currentTasks(state);
  if (list.length === 0) {
    container.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, "🗒️"),
      el("div", {}, "Aucune tâche pour l'instant. Crée ta première tâche !")
    ]));
    return;
  }

  const listNode = el("div", {});
  list.forEach((task) => listNode.appendChild(taskCard(task)));
  container.appendChild(listNode);
}

function scopeChip(label, value) {
  const active = filters.scope === value;
  return el("button", {
    class: `btn btn--sm ${active ? "btn--primary" : "btn--ghost"}`,
    onclick: () => { filters.scope = value; render(root); }
  }, label);
}

function taskCard(task) {
  const progress = taskProgress(task);
  const overdue = task.date && isPast(task.date) && task.status !== "done";
  const card = el("div", {
    class: `task-card ${task.status === "done" ? "done" : ""}`,
    onclick: (e) => { if (!e.target.closest(".checkbox")) openTaskForm(task); }
  });
  card.style.borderLeftColor = task.color || "#3d72d8";

  const row = el("div", { style: "display:flex;align-items:flex-start;gap:10px;" }, [
    el("div", {
      class: `checkbox ${task.status === "done" ? "checked" : ""}`,
      onclick: async () => {
        const uid = getCurrentUser()?.uid;
        if (!uid) return;
        try {
          await setTaskStatus(uid, task, task.status === "done" ? "todo" : "done");
        } catch (e) {
          console.error("[Tasks] setTaskStatus:", e);
          toast(`Erreur : ${e.message || "impossible de mettre à jour la tâche"}`, "error");
        }
      }
    }, task.status === "done" ? "✓" : ""),
    el("div", { style: "flex:1;min-width:0;" }, [
      el("div", { class: "task-card__title" }, task.title),
      el("div", { class: "task-card__meta" }, [
        priorityBadge(task.priority),
        task.category ? el("span", { class: "badge badge--muted" }, task.category) : null,
        task.date ? el("span", { class: `badge ${overdue ? "badge--high" : "badge--info"}` }, formatHuman(task.date) + (task.time ? ` · ${task.time}` : "")) : null,
        task.duration ? el("span", { class: "badge badge--muted" }, `${task.duration} min`) : null,
        task.routineId ? el("span", { class: "badge badge--info" }, "🔁 routine") : null
      ])
    ])
  ]);
  card.appendChild(row);

  if (task.subtasks?.length) {
    const bar = el("div", { class: "task-card__progress" }, [el("div", { style: `width:${progress}%` })]);
    card.appendChild(bar);
  }
  return card;
}

function priorityBadge(priority) {
  const map = { low: "badge--low", medium: "badge--medium", high: "badge--high" };
  const labels = { low: "Basse", medium: "Moyenne", high: "Haute" };
  return el("span", { class: `badge ${map[priority] || "badge--muted"}` }, labels[priority] || priority);
}

function openTaskForm(existing) {
  const uid = getCurrentUser()?.uid;
  if (!uid) { toast("Connecte-toi pour gérer tes tâches.", "error"); return; }

  const data = existing ? { ...existing } : newTaskDefaults();
  const body = el("div", {});

  const titleField = field("Titre", input("text", data.title, (v) => (data.title = v), "Ex : Préparer la réunion"));
  const descField = field("Description", textarea(data.description, (v) => (data.description = v)));

  const row1 = el("div", { class: "field-row" }, [
    field("Catégorie", input("text", data.category, (v) => (data.category = v))),
    field("Priorité", selectField(PRIORITIES, data.priority, (v) => (data.priority = v)))
  ]);

  const row2 = el("div", { class: "field-row" }, [
    field("Date", input("date", data.date, (v) => (data.date = v))),
    field("Heure", input("time", data.time, (v) => (data.time = v)))
  ]);

  const row3 = el("div", { class: "field-row" }, [
    field("Durée estimée (min)", input("number", data.duration ?? "", (v) => (data.duration = v ? Number(v) : null))),
    field("Statut", selectField(STATUSES, data.status, (v) => (data.status = v)))
  ]);

  const colorField = field("Couleur", colorPicker(data.color, (v) => (data.color = v)));
  const notesField = field("Notes", textarea(data.notes, (v) => (data.notes = v)));

  const subtasksBlock = subtasksEditor(existing, uid);

  body.append(titleField, descField, row1, row2, row3, colorField, subtasksBlock, notesField);

  const actions = [
    { label: "Annuler", onClick: closeModal }
  ];
  if (existing) {
    actions.push({
      label: "Supprimer", variant: "danger",
      onClick: async () => {
        try {
          await deleteTask(uid, existing.id);
          toast("Tâche supprimée", "info");
          closeModal();
        } catch (e) {
          console.error("[Tasks] deleteTask:", e);
          toast(`Erreur : ${e.message || "impossible de supprimer la tâche"}`, "error");
        }
      }
    });
  }
  actions.push({
    label: existing ? "Enregistrer" : "Créer",
    variant: "primary",
    onClick: async () => {
      if (!data.title.trim()) { toast("Le titre est obligatoire", "error"); return; }
      try {
        if (existing) await updateTask(uid, existing.id, data);
        else await createTask(uid, data);
        filters = { scope: "all", status: "all", query: "" };
        render(root);
        toast(existing ? "Tâche mise à jour" : "Tâche créée", "success");
        closeModal();
      } catch (e) {
        console.error("[Tasks] createTask/updateTask:", e);
        toast(`Erreur : ${e.message || "impossible d'enregistrer la tâche"}`, "error");
      }
    }
  });

  openModal(existing ? "Modifier la tâche" : "Nouvelle tâche", body, actions);
}

function subtasksEditor(existing, uid) {
  const wrap = el("div", { class: "field" }, [el("label", {}, "Sous-tâches")]);
  const list = el("div", {});
  const subtasks = existing?.subtasks || [];

  function renderList() {
    clear(list);
    subtasks.forEach((s) => {
      const row = el("div", { class: `subtask-row ${s.done ? "done" : ""}` }, [
        el("div", {
          class: `checkbox ${s.done ? "checked" : ""}`,
          style: "width:16px;height:16px;",
          onclick: async () => {
            if (!existing) return;
            try { await toggleSubtask(uid, existing, s.id); }
            catch (e) { console.error("[Tasks] toggleSubtask:", e); toast(`Erreur : ${e.message || "impossible de mettre à jour la sous-tâche"}`, "error"); }
          }
        }, s.done ? "✓" : ""),
        el("span", { style: "flex:1;" }, s.title),
        el("button", {
          class: "btn btn--sm btn--ghost",
          onclick: async () => {
            if (!existing) return;
            try { await removeSubtask(uid, existing, s.id); }
            catch (e) { console.error("[Tasks] removeSubtask:", e); toast(`Erreur : ${e.message || "impossible de supprimer la sous-tâche"}`, "error"); }
          }
        }, "✕")
      ]);
      list.appendChild(row);
    });
  }
  renderList();

  const addRow = el("div", { style: "display:flex;gap:8px;margin-top:8px;" });
  const newInput = el("input", { placeholder: "Ajouter une sous-tâche...", style: "flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-alt);color:var(--text);" });
  const addBtn = el("button", {
    class: "btn btn--sm btn--ghost",
    onclick: async () => {
      const title = newInput.value.trim();
      if (!title) return;
      if (existing) {
        try { await addSubtask(uid, existing, title); }
        catch (e) { console.error("[Tasks] addSubtask:", e); toast(`Erreur : ${e.message || "impossible d'ajouter la sous-tâche"}`, "error"); return; }
      } else {
        toast("Enregistre d'abord la tâche pour ajouter des sous-tâches", "info");
      }
      newInput.value = "";
    }
  }, "Ajouter");
  addRow.append(newInput, addBtn);

  wrap.append(list, addRow);
  return wrap;
}

function field(label, inputNode) {
  return el("div", { class: "field" }, [el("label", {}, label), inputNode]);
}

function input(type, value, onChange, placeholder = "") {
  return el("input", { type, value: value ?? "", placeholder, oninput: (e) => onChange(e.target.value) });
}

function textarea(value, onChange) {
  return el("textarea", { oninput: (e) => onChange(e.target.value) }, value || "");
}

function selectField(options, value, onChange) {
  const sel = el("select", { onchange: (e) => onChange(e.target.value) },
    options.map((o) => el("option", { value: o.value, selected: o.value === value ? "selected" : null }, o.label)));
  return sel;
}

function colorPicker(value, onChange) {
  const wrap = el("div", { style: "display:flex;gap:8px;" });
  DEFAULT_COLORS.forEach((c) => {
    const swatch = el("div", {
      style: `width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c === value ? "var(--text)" : "transparent"};`,
      onclick: () => { onChange(c); wrap.querySelectorAll("div").forEach((n) => (n.style.borderColor = "transparent")); swatch.style.borderColor = "var(--text)"; }
    });
    wrap.appendChild(swatch);
  });
  return wrap;
}
