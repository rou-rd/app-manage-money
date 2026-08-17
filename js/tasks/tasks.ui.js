import { el, clear, escapeHtml } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser, onAuthChange } from "../auth/auth.js";
import { subscribe } from "../store.js";
import { formatHuman, isPast, isToday, todayStr } from "../utils/date.js";
import { watchFinanceState, financeInvoicesToTasks } from "../finance/finance-reader.js";
import { watchViews, createView, deleteView } from "./views.service.js";
import {
  PRIORITIES, STATUSES, DEFAULT_COLORS, newTaskDefaults, taskProgress
} from "./tasks.model.js";
import {
  createTask, updateTask, deleteTask, setTaskStatus, addSubtask, toggleSubtask, removeSubtask
} from "./tasks.service.js";

let root = null;
let latestState = { tasks: [] };
let filters = { scope: "all", status: "all", priority: "all", category: "all", hideDone: false, query: "" };
let financeState = null;
let savedViews = [];
let unsubFinance = null;
let unsubViews = null;

export function initTasksView(container) {
  root = container;
  subscribe((state) => { latestState = state; render(container); });
  onAuthChange((user) => {
    if (unsubFinance) unsubFinance();
    if (unsubViews) unsubViews();
    if (user) {
      unsubFinance = watchFinanceState(user.uid, (fs) => { financeState = fs; render(root); });
      unsubViews = watchViews(user.uid, (views) => { savedViews = views; render(root); });
    } else {
      financeState = null;
      savedViews = [];
    }
  });
}

function allTasksWithFactures(state) {
  return [...state.tasks, ...financeInvoicesToTasks(financeState)];
}

function categoryOptions(state) {
  return Array.from(new Set(allTasksWithFactures(state).map((t) => t.category || "Général"))).sort();
}

function currentTasks(state) {
  let list = allTasksWithFactures(state);
  const today = todayStr();
  if (filters.scope === "today") list = list.filter((t) => t.date === today);
  else if (filters.scope === "upcoming") list = list.filter((t) => t.date && t.date >= today);
  else if (filters.scope === "overdue") list = list.filter((t) => t.date && t.date < today && t.status !== "done");
  if (filters.status !== "all") list = list.filter((t) => t.status === filters.status);
  if (filters.priority !== "all") list = list.filter((t) => t.priority === filters.priority);
  if (filters.category !== "all") list = list.filter((t) => (t.category || "Général") === filters.category);
  if (filters.hideDone) list = list.filter((t) => t.status !== "done");
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

  const chips = el("div", { style: "display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;" }, [
    scopeChip("Toutes", "all"),
    scopeChip("Aujourd'hui", "today"),
    scopeChip("À venir", "upcoming"),
    scopeChip("En retard", "overdue")
  ]);

  container.append(toolbar, chips, filtersBar(state), savedViewsBar());

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

function filtersBar(state) {
  const selectStyle = "padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-alt);color:var(--text);font-size:12.5px;";

  const prioritySelect = el("select", {
    style: selectStyle,
    onchange: (e) => { filters.priority = e.target.value; render(root); }
  }, [
    el("option", { value: "all", selected: filters.priority === "all" ? "selected" : null }, "Toute priorité"),
    ...PRIORITIES.map((p) => el("option", { value: p.value, selected: filters.priority === p.value ? "selected" : null }, p.label))
  ]);

  const categorySelect = el("select", {
    style: selectStyle,
    onchange: (e) => { filters.category = e.target.value; render(root); }
  }, [
    el("option", { value: "all", selected: filters.category === "all" ? "selected" : null }, "Toute catégorie"),
    ...categoryOptions(state).map((c) => el("option", { value: c, selected: filters.category === c ? "selected" : null }, c))
  ]);

  const hideDoneLabel = el("label", { style: "display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);cursor:pointer;" }, [
    el("input", { type: "checkbox", checked: filters.hideDone ? "checked" : null, onchange: (e) => { filters.hideDone = e.target.checked; render(root); } }),
    "Masquer terminées"
  ]);

  const saveBtn = el("button", {
    class: "btn btn--sm btn--ghost",
    onclick: () => {
      const uid = getCurrentUser()?.uid;
      if (!uid) { toast("Connecte-toi pour enregistrer une vue.", "error"); return; }
      const name = prompt("Nom de cette vue (ex : Tâches urgentes) :");
      if (!name || !name.trim()) return;
      createView(uid, { name: name.trim(), filters: { ...filters } }).catch((e) => {
        console.error("[Tasks] createView:", e);
        toast(`Erreur : ${e.message || "impossible d'enregistrer la vue"}`, "error");
      });
    }
  }, "💾 Enregistrer cette vue");

  return el("div", {
    style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);"
  }, [prioritySelect, categorySelect, hideDoneLabel, saveBtn]);
}

function savedViewsBar() {
  if (!savedViews.length) return el("div", {});
  const wrap = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;" });
  savedViews.forEach((v) => {
    wrap.appendChild(el("div", { style: "display:flex;align-items:center;gap:4px;" }, [
      el("button", {
        class: "btn btn--sm btn--ghost",
        onclick: () => { filters = { ...filters, ...v.filters }; render(root); }
      }, `⭐ ${v.name}`),
      el("button", {
        class: "btn btn--sm btn--ghost", title: "Supprimer cette vue",
        onclick: async () => {
          const uid = getCurrentUser()?.uid;
          if (!uid) return;
          try { await deleteView(uid, v.id); }
          catch (e) { console.error("[Tasks] deleteView:", e); toast(`Erreur : ${e.message || "impossible de supprimer la vue"}`, "error"); }
        }
      }, "✕")
    ]));
  });
  return wrap;
}

function scopeChip(label, value) {
  const active = filters.scope === value;
  return el("button", {
    class: `btn btn--sm ${active ? "btn--primary" : "btn--ghost"}`,
    onclick: () => { filters.scope = value; render(root); }
  }, label);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(amount || 0);
}

function taskCard(task) {
  const progress = taskProgress(task);
  const overdue = task.date && isPast(task.date) && task.status !== "done";
  const card = el("div", {
    class: `task-card ${task.status === "done" ? "done" : ""}`,
    onclick: (e) => {
      if (e.target.closest(".checkbox")) return;
      if (task.isFacture) { toast("Gère cette facture depuis Finances → Factures.", "info"); return; }
      openTaskForm(task);
    }
  });
  card.style.borderLeftColor = task.color || "#3d72d8";

  const row = el("div", { style: "display:flex;align-items:flex-start;gap:10px;" }, [
    el("div", {
      class: `checkbox ${task.status === "done" ? "checked" : ""}`,
      onclick: async () => {
        if (task.isFacture) { toast("Le statut d'une facture se gère depuis Finances.", "info"); return; }
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
      el("div", { class: "task-card__title" }, task.isFacture ? `🧾 ${task.title}` : task.title),
      el("div", { class: "task-card__meta" }, [
        priorityBadge(task.priority),
        task.category ? el("span", { class: "badge badge--muted" }, task.category) : null,
        task.date ? el("span", { class: `badge ${overdue ? "badge--high" : "badge--info"}` }, formatHuman(task.date) + (task.time ? ` · ${task.time}` : "")) : null,
        task.duration ? el("span", { class: "badge badge--muted" }, `${task.duration} min`) : null,
        task.routineId ? el("span", { class: "badge badge--info" }, "🔁 routine") : null,
        task.isFacture ? el("span", { class: "badge badge--muted" }, formatMoney(task.montant)) : null
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
  if (existing?.isFacture) { toast("Gère cette facture depuis Finances → Factures.", "info"); return; }

  const data = existing ? { ...existing } : newTaskDefaults();
  const body = el("div", {});

  // Champs essentiels — toujours visibles, pour une création rapide au quotidien.
  const titleField = field("Titre", input("text", data.title, (v) => (data.title = v), "Ex : Préparer la réunion"));
  const essentialRow = el("div", { class: "field-row" }, [
    field("Date", input("date", data.date, (v) => (data.date = v))),
    field("Priorité", selectField(PRIORITIES, data.priority, (v) => (data.priority = v)))
  ]);

  // Champs avancés — masqués par défaut, révélés via "+ Plus de détails".
  const descField = field("Description", textarea(data.description, (v) => (data.description = v)));
  const row1 = el("div", { class: "field-row" }, [
    field("Catégorie", input("text", data.category, (v) => (data.category = v))),
    field("Heure", input("time", data.time, (v) => (data.time = v)))
  ]);
  const row3 = el("div", { class: "field-row" }, [
    field("Durée estimée (min)", input("number", data.duration ?? "", (v) => (data.duration = v ? Number(v) : null))),
    field("Statut", selectField(STATUSES, data.status, (v) => (data.status = v)))
  ]);
  const colorField = field("Couleur", colorPicker(data.color, (v) => (data.color = v)));
  const notesField = field("Notes", textarea(data.notes, (v) => (data.notes = v)));
  const subtasksBlock = subtasksEditor(existing, uid);

  const hasAdvancedData = !!(data.description || (data.category && data.category !== "Général") || data.time || data.duration || data.notes || (data.subtasks && data.subtasks.length));
  let advancedOpen = !!existing && hasAdvancedData;

  const advancedWrap = el("div", { style: advancedOpen ? "" : "display:none;" }, [
    descField, row1, row3, colorField, subtasksBlock, notesField
  ]);
  const toggleBtn = el("button", {
    type: "button",
    class: "btn btn--sm btn--ghost",
    style: "margin-bottom:14px;",
    onclick: () => {
      advancedOpen = !advancedOpen;
      advancedWrap.style.display = advancedOpen ? "" : "none";
      toggleBtn.textContent = advancedOpen ? "− Moins de détails" : "+ Plus de détails";
    }
  }, advancedOpen ? "− Moins de détails" : "+ Plus de détails");

  body.append(titleField, essentialRow, toggleBtn, advancedWrap);

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
        filters = { scope: "all", status: "all", priority: "all", category: "all", hideDone: false, query: "" };
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
