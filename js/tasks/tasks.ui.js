import { el, clear } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser, onAuthChange } from "../auth/auth.js";
import { subscribe } from "../store.js";
import { formatHuman, isPast, todayStr, addDays } from "../utils/date.js";
import { watchFinanceState, financeInvoicesToTasks } from "../finance/finance-reader.js";
import { watchViews, createView, deleteView } from "./views.service.js";
import {
  PRIORITIES, STATUSES, DEFAULT_COLORS, newTaskDefaults, taskProgress
} from "./tasks.model.js";
import {
  createTask, updateTask, deleteTask, setTaskStatus,
  addSubtask, toggleSubtask, removeSubtask, archiveTask
} from "./tasks.service.js";
import { startPomodoro } from "../pomodoro/pomodoro.ui.js";

let root = null;
let latestState = { tasks: [] };
let filters = { scope: "all", status: "all", priority: "all", category: "all", hideDone: false, query: "" };
let dailyDate = todayStr();
let financeState = null;
let savedViews = [];
let unsubFinance = null;
let unsubViews = null;
let viewMode = "list";

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

/* ── Data helpers ── */

function allTasksWithFactures(state) {
  return [...state.tasks, ...financeInvoicesToTasks(financeState)];
}

function categoryOptions(state) {
  return Array.from(new Set(allTasksWithFactures(state).map((t) => t.category || "Général"))).sort();
}

function currentTasks(state) {
  let list = allTasksWithFactures(state);
  const today = todayStr();
  if (filters.scope === "archived") return list.filter((t) => t.archived);
  list = list.filter((t) => !t.archived);
  if (filters.scope === "today") list = list.filter((t) => t.date === today);
  else if (filters.scope === "daily") list = list.filter((t) => t.date === dailyDate);
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

function buildRenderItems(list) {
  const today = todayStr();
  const routineGroups = new Map();
  const items = [];
  list.forEach((t) => {
    if (t.routineId) {
      if (!routineGroups.has(t.routineId)) routineGroups.set(t.routineId, []);
      routineGroups.get(t.routineId).push(t);
    } else {
      items.push({ type: "task", date: t.date, task: t });
    }
  });
  routineGroups.forEach((tasks) => {
    const sorted = [...tasks].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const primary = sorted.find((t) => t.date === today)
      || sorted.find((t) => t.date > today && t.status !== "done")
      || [...sorted].reverse().find((t) => t.status !== "done")
      || sorted[sorted.length - 1];
    const others = sorted.filter((t) => t.id !== primary.id);
    items.push({ type: "routineGroup", date: primary.date, primary, others });
  });
  return items.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
}

/* ── Main render ── */

function render(container) {
  clear(container);
  const state = latestState;

  container.appendChild(renderHeader());
  container.appendChild(renderViewToggle());
  container.appendChild(renderScopeChips());

  if (filters.scope === "daily") container.appendChild(renderDayNav());

  container.appendChild(renderFiltersBar(state));
  container.appendChild(renderSavedViews());

  if (viewMode === "stats") {
    container.appendChild(renderStats(state));
    return;
  }

  const list = currentTasks(state);
  if (list.length === 0) {
    container.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "empty__icon" }, "🗒️"),
      el("div", { class: "empty__text" },
        filters.scope === "archived" ? "Aucune tâche archivée." : "Aucune tâche pour l'instant.")
    ]));
  } else if (viewMode === "kanban") {
    container.appendChild(renderKanban(list));
  } else {
    container.appendChild(renderList(list));
  }

  container.appendChild(el("button", {
    class: "btn btn--fab",
    onclick: () => openTaskForm(),
    title: "Nouvelle tâche"
  }, "+"));
}

/* ── Header ── */

function renderHeader() {
  const searchInput = el("input", {
    type: "text",
    placeholder: "Rechercher...",
    value: filters.query,
    oninput: (e) => { filters.query = e.target.value; render(root); }
  });
  searchInput.style.cssText = "padding:8px 14px;border-radius:var(--r);border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-size:.85rem;width:200px;";

  return el("div", { class: "view-header" }, [
    el("h1", {}, "Tâches"),
    el("div", { class: "flex gap-sm items-center" }, [
      searchInput,
      el("button", { class: "btn btn--primary", onclick: () => openTaskForm() }, "+ Nouvelle tâche")
    ])
  ]);
}

/* ── View toggle ── */

function renderViewToggle() {
  return el("div", { class: "chip-bar" }, [
    viewChip("Liste", "list"),
    viewChip("Kanban", "kanban"),
    viewChip("Stats", "stats")
  ]);
}

function viewChip(label, mode) {
  return el("button", {
    class: `chip ${viewMode === mode ? "active" : ""}`,
    onclick: () => { viewMode = mode; render(root); }
  }, label);
}

/* ── Scope chips ── */

function renderScopeChips() {
  return el("div", { class: "chip-bar" }, [
    scopeChip("Toutes", "all"),
    scopeChip("Aujourd'hui", "today"),
    scopeChip("Journée", "daily"),
    scopeChip("À venir", "upcoming"),
    scopeChip("En retard", "overdue"),
    scopeChip("Archives", "archived")
  ]);
}

function scopeChip(label, value) {
  return el("button", {
    class: `chip ${filters.scope === value ? "active" : ""}`,
    onclick: () => { filters.scope = value; render(root); }
  }, label);
}

/* ── Daily date navigator ── */

function renderDayNav() {
  return el("div", { class: "card flex items-center gap-md mb-md", style: "padding:10px 16px;" }, [
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { dailyDate = addDays(dailyDate, -1); render(root); } }, "◀"),
    el("span", { style: "flex:1;text-align:center;font-weight:700;font-size:.9rem;" }, formatHuman(dailyDate)),
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { dailyDate = addDays(dailyDate, 1); render(root); } }, "▶"),
    el("button", {
      class: "btn btn--sm btn--outline",
      style: dailyDate === todayStr() ? "opacity:.35;pointer-events:none;" : "",
      onclick: () => { dailyDate = todayStr(); render(root); }
    }, "Aujourd'hui")
  ]);
}

/* ── Filters bar ── */

function renderFiltersBar(state) {
  const wrap = el("div", { class: "card flex gap-sm items-center mb-md", style: "padding:10px 14px;flex-wrap:wrap;" });

  wrap.appendChild(filterSelect(
    [{ value: "all", label: "Toute priorité" }, ...PRIORITIES],
    filters.priority,
    (v) => { filters.priority = v; render(root); }
  ));
  wrap.appendChild(filterSelect(
    [{ value: "all", label: "Toute catégorie" }, ...categoryOptions(state).map((c) => ({ value: c, label: c }))],
    filters.category,
    (v) => { filters.category = v; render(root); }
  ));

  wrap.appendChild(el("label", { class: "flex items-center gap-xs text-sm text-muted", style: "cursor:pointer;" }, [
    el("input", {
      type: "checkbox",
      checked: filters.hideDone ? "checked" : null,
      onchange: (e) => { filters.hideDone = e.target.checked; render(root); }
    }),
    "Masquer terminées"
  ]));

  wrap.appendChild(el("button", {
    class: "btn btn--sm btn--ghost",
    onclick: () => {
      const uid = getCurrentUser()?.uid;
      if (!uid) { toast("Connecte-toi d'abord.", "error"); return; }
      const name = prompt("Nom de cette vue :");
      if (!name?.trim()) return;
      const { query: _q, ...saved } = filters;
      createView(uid, { name: name.trim(), filters: saved }).catch((e) => toast(`Erreur : ${e.message}`, "error"));
    }
  }, "💾 Sauvegarder"));

  return wrap;
}

function filterSelect(options, current, onChange) {
  const sel = el("select", { onchange: (e) => onChange(e.target.value) },
    options.map((o) => el("option", { value: o.value, selected: o.value === current ? "selected" : null }, o.label))
  );
  sel.style.cssText = "padding:6px 10px;border-radius:var(--r-sm);border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-size:.8rem;";
  return sel;
}

/* ── Saved views ── */

function renderSavedViews() {
  if (!savedViews.length) return el("div", {});
  return el("div", { class: "flex gap-sm mb-md", style: "flex-wrap:wrap;" },
    savedViews.map((v) =>
      el("div", { class: "flex items-center gap-xs" }, [
        el("button", {
          class: "chip",
          onclick: () => { filters = { ...filters, ...v.filters }; render(root); }
        }, `⭐ ${v.name}`),
        el("button", {
          class: "btn btn--icon sm btn--ghost",
          onclick: async () => {
            const uid = getCurrentUser()?.uid;
            if (!uid) return;
            try { await deleteView(uid, v.id); }
            catch (e) { toast(`Erreur : ${e.message}`, "error"); }
          }
        }, "✕")
      ])
    )
  );
}

/* ── List view ── */

function renderList(list) {
  const wrap = el("div", { class: "flex flex-col gap-sm" });
  buildRenderItems(list).forEach((item) => {
    if (item.type === "task") {
      wrap.appendChild(taskCard(item.task));
      return;
    }
    wrap.appendChild(taskCard(item.primary));
    if (item.others.length) {
      const sub = el("div", { style: "margin:2px 0 8px 36px;" }, item.others.map((t) =>
        el("div", {
          class: "flex items-center gap-xs text-xs text-muted-2",
          style: "cursor:pointer;padding:3px 0;",
          onclick: () => openTaskForm(t)
        }, [
          el("span", { style: `width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0;background:${t.status === "done" ? "var(--green)" : "var(--muted-2)"};` }),
          formatHuman(t.date) + (t.status === "done" ? " · fait" : "")
        ])
      ));
      wrap.appendChild(sub);
    }
  });
  return wrap;
}

/* ── Task card ── */

function taskCard(task) {
  const progress = taskProgress(task);
  const overdue = task.date && isPast(task.date) && task.status !== "done";

  const card = el("div", {
    class: `task-item ${task.status === "done" ? "done" : ""}`,
    draggable: "true",
    style: `border-left-color:${task.color || "var(--primary)"};`,
    ondragstart: (e) => { e.dataTransfer.setData("text/plain", task.id); card.classList.add("dragging"); },
    ondragend: () => card.classList.remove("dragging"),
    onclick: (e) => {
      if (e.target.closest(".check") || e.target.closest(".task-item__actions")) return;
      if (task.isFacture) { toast("Gère cette facture depuis Finances.", "info"); return; }
      openTaskForm(task);
    }
  });

  const checkbox = el("div", {
    class: `check ${task.status === "done" ? "checked" : ""}`,
    onclick: async () => {
      if (task.isFacture) { toast("Statut géré depuis Finances.", "info"); return; }
      const uid = getCurrentUser()?.uid;
      if (!uid) return;
      try { await setTaskStatus(uid, task, task.status === "done" ? "todo" : "done"); }
      catch (e) { toast(`Erreur : ${e.message}`, "error"); }
    }
  }, task.status === "done" ? "✓" : "");

  const body = el("div", { class: "task-item__body" }, [
    el("div", { class: "task-item__title" }, task.isFacture ? `🧾 ${task.title}` : task.title),
    el("div", { class: "task-item__meta" }, [
      priorityBadge(task.priority),
      task.category ? el("span", { class: "badge" }, task.category) : null,
      task.date ? el("span", { class: `badge ${overdue ? "badge--red" : "badge--blue"}` },
        formatHuman(task.date) + (task.time ? ` · ${task.time}` : "")) : null,
      task.duration ? el("span", { class: "badge" }, `${task.duration} min`) : null,
      task.routineId ? el("span", { class: "badge badge--purple" }, "🔁") : null,
      task.isFacture ? el("span", { class: "badge" }, formatMoney(task.montant)) : null,
      task.timeSpent ? el("span", { class: "badge badge--blue" }, `⏱ ${Math.round(task.timeSpent / 60)}m`) : null
    ].filter(Boolean))
  ]);

  if (task.subtasks?.length) {
    body.appendChild(el("div", { class: "progress progress--sm mt-sm" }, [
      el("div", { class: "progress__fill", style: `width:${progress}%` })
    ]));
  }

  const actions = el("div", { class: "task-item__actions" });
  if (!task.isFacture && task.status !== "done") {
    actions.appendChild(el("button", {
      class: "btn btn--icon sm btn--ghost", title: "Focus",
      onclick: () => startPomodoro(task)
    }, "⏱"));
  }
  if (!task.isFacture) {
    actions.appendChild(el("button", {
      class: "btn btn--icon sm btn--ghost", title: task.archived ? "Désarchiver" : "Archiver",
      onclick: async () => {
        const uid = getCurrentUser()?.uid;
        if (!uid) return;
        try {
          await archiveTask(uid, task.id, !task.archived);
          toast(task.archived ? "Désarchivée" : "Archivée", "info");
        } catch (e) { toast(`Erreur : ${e.message}`, "error"); }
      }
    }, task.archived ? "↩" : "📦"));
  }

  card.append(checkbox, body, actions);
  return card;
}

function priorityBadge(priority) {
  const cls = { low: "badge--green", medium: "badge--orange", high: "badge--red" };
  const lbl = { low: "Basse", medium: "Moyenne", high: "Haute" };
  return el("span", { class: `badge ${cls[priority] || ""}` }, lbl[priority] || priority);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(amount || 0);
}

/* ── Kanban view ── */

function renderKanban(list) {
  const columns = [
    { status: "todo", label: "À faire", color: "var(--blue)" },
    { status: "doing", label: "En cours", color: "var(--orange)" },
    { status: "done", label: "Terminé", color: "var(--green)" }
  ];
  const board = el("div", { class: "kanban" });

  columns.forEach((col) => {
    const tasks = list.filter((t) => t.status === col.status);
    const column = el("div", {
      class: "kanban-col",
      ondragover: (e) => { e.preventDefault(); column.classList.add("kanban-col--over"); },
      ondragleave: () => column.classList.remove("kanban-col--over"),
      ondrop: async (e) => {
        e.preventDefault();
        column.classList.remove("kanban-col--over");
        const taskId = e.dataTransfer.getData("text/plain");
        const uid = getCurrentUser()?.uid;
        if (!uid) return;
        const task = latestState.tasks.find((t) => t.id === taskId);
        if (task && task.status !== col.status) {
          try { await setTaskStatus(uid, task, col.status); }
          catch (err) { toast(`Erreur : ${err.message}`, "error"); }
        }
      }
    });

    column.appendChild(el("div", { class: "kanban-col__header" }, [
      el("div", { class: "kanban-col__title", style: `color:${col.color};` }, col.label),
      el("span", { class: "kanban-col__count" }, String(tasks.length))
    ]));

    tasks.forEach((t) => column.appendChild(kanbanCard(t)));
    board.appendChild(column);
  });

  return board;
}

function kanbanCard(task) {
  const progress = taskProgress(task);
  const overdue = task.date && isPast(task.date) && task.status !== "done";

  const card = el("div", {
    class: "kanban-card",
    draggable: "true",
    style: `border-left-color:${task.color || "var(--primary)"};`,
    ondragstart: (e) => { e.dataTransfer.setData("text/plain", task.id); card.classList.add("dragging"); },
    ondragend: () => card.classList.remove("dragging"),
    onclick: () => {
      if (task.isFacture) { toast("Gère cette facture depuis Finances.", "info"); return; }
      openTaskForm(task);
    }
  });

  card.appendChild(el("div", { style: "font-size:.85rem;font-weight:600;margin-bottom:6px;" }, task.title));
  card.appendChild(el("div", { class: "flex gap-xs", style: "flex-wrap:wrap;" }, [
    priorityBadge(task.priority),
    task.category ? el("span", { class: "badge" }, task.category) : null,
    task.date ? el("span", { class: `badge ${overdue ? "badge--red" : "badge--blue"}` }, formatHuman(task.date)) : null,
    task.routineId ? el("span", { class: "badge badge--purple" }, "🔁") : null
  ].filter(Boolean)));

  if (task.subtasks?.length) {
    card.appendChild(el("div", { class: "progress progress--sm mt-sm" }, [
      el("div", { class: "progress__fill", style: `width:${progress}%` })
    ]));
  }
  return card;
}

/* ── Stats view ── */

function renderStats(state) {
  const all = allTasksWithFactures(state).filter((t) => !t.archived);
  const today = todayStr();
  const weekAgo = addDays(today, -7);
  const done = all.filter((t) => t.status === "done");
  const doneThisWeek = done.filter((t) => t.date && t.date >= weekAgo && t.date <= today);
  const overdue = all.filter((t) => t.date && t.date < today && t.status !== "done");
  const doing = all.filter((t) => t.status === "doing");
  const todo = all.filter((t) => t.status === "todo");
  const completionRate = all.length ? Math.round((done.length / all.length) * 100) : 0;
  const totalTime = all.reduce((s, t) => s + (t.timeSpent || 0), 0);

  const catCounts = {};
  all.forEach((t) => { const c = t.category || "Général"; catCounts[c] = (catCounts[c] || 0) + 1; });
  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const priCounts = { high: 0, medium: 0, low: 0 };
  all.forEach((t) => { if (priCounts[t.priority] !== undefined) priCounts[t.priority]++; });

  const wrap = el("div", {});

  wrap.appendChild(el("div", { class: "grid grid--3 mb-lg" }, [
    statTile("Total", String(all.length), "tâches"),
    statTile("Terminées", String(done.length), `${completionRate}%`),
    statTile("Cette semaine", String(doneThisWeek.length), "complétées"),
    statTile("En retard", String(overdue.length), overdue.length > 0 ? "⚠ attention" : "✓ OK"),
    statTile("En cours", String(doing.length), "actives"),
    statTile("À faire", String(todo.length), "en attente")
  ]));

  if (totalTime > 0) {
    const hrs = Math.floor(totalTime / 3600);
    const mins = Math.floor((totalTime % 3600) / 60);
    wrap.appendChild(el("div", { class: "card mb-md" }, [
      el("div", { class: "text-xs text-muted", style: "font-weight:700;margin-bottom:4px;" }, "TEMPS FOCUS TOTAL"),
      el("div", { style: "font-size:1.4rem;font-weight:800;color:var(--primary);" }, `${hrs}h ${mins}m`)
    ]));
  }

  wrap.appendChild(el("div", { class: "card mb-md" }, [
    el("h4", { class: "mb-sm" }, "Par priorité"),
    statsBar("Haute", priCounts.high, all.length, "var(--red)"),
    statsBar("Moyenne", priCounts.medium, all.length, "var(--orange)"),
    statsBar("Basse", priCounts.low, all.length, "var(--green)")
  ]));

  if (topCats.length) {
    const catCard = el("div", { class: "card" }, [el("h4", { class: "mb-sm" }, "Top catégories")]);
    topCats.forEach(([name, count]) => catCard.appendChild(statsBar(name, count, all.length, "var(--primary)")));
    wrap.appendChild(catCard);
  }

  return wrap;
}

function statTile(label, value, sub) {
  return el("div", { class: "card stat-card" }, [
    el("div", { class: "stat-label" }, label),
    el("div", { class: "stat-value" }, value),
    el("div", { class: "stat-sub" }, sub)
  ]);
}

function statsBar(label, count, total, color) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return el("div", { class: "mb-sm" }, [
    el("div", { class: "flex justify-between text-sm mb-sm" }, [
      el("span", {}, label),
      el("span", { class: "text-muted-2" }, `${count} (${pct}%)`)
    ]),
    el("div", { class: "progress" }, [
      el("div", { class: "progress__fill", style: `width:${pct}%;background:${color};` })
    ])
  ]);
}

/* ── Task form modal ── */

function openTaskForm(existing) {
  const uid = getCurrentUser()?.uid;
  if (!uid) { toast("Connecte-toi pour gérer tes tâches.", "error"); return; }
  if (existing?.isFacture) { toast("Gère cette facture depuis Finances.", "info"); return; }

  const data = existing ? { ...existing } : newTaskDefaults();
  const body = el("div", {});

  const titleField = formField("Titre", formInput("text", data.title, (v) => (data.title = v), "Ex : Préparer la réunion"));
  const essentialRow = el("div", { class: "field-row" }, [
    formField("Date", formInput("date", data.date, (v) => (data.date = v))),
    formField("Priorité", formSelect(PRIORITIES, data.priority, (v) => (data.priority = v)))
  ]);

  const descField = formField("Description", formTextarea(data.description, (v) => (data.description = v)));
  const row1 = el("div", { class: "field-row" }, [
    formField("Catégorie", formInput("text", data.category, (v) => (data.category = v))),
    formField("Heure", formInput("time", data.time, (v) => (data.time = v)))
  ]);
  const row2 = el("div", { class: "field-row" }, [
    formField("Durée (min)", formInput("number", data.duration ?? "", (v) => (data.duration = v ? Number(v) : null))),
    formField("Statut", formSelect(STATUSES, data.status, (v) => (data.status = v)))
  ]);
  const colorField = formField("Couleur", renderColorPicker(data.color, (v) => (data.color = v)));
  const notesField = formField("Notes", formTextarea(data.notes, (v) => (data.notes = v)));
  const subtasksBlock = subtasksEditor(existing, uid);

  const hasAdvanced = !!(data.description || (data.category && data.category !== "Général") || data.time || data.duration || data.notes || data.subtasks?.length);
  let advancedOpen = !!existing && hasAdvanced;

  const advancedWrap = el("div", { style: advancedOpen ? "" : "display:none;" }, [
    descField, row1, row2, colorField, subtasksBlock, notesField
  ]);
  const toggleBtn = el("button", {
    type: "button", class: "btn btn--sm btn--outline mb-md",
    onclick: () => {
      advancedOpen = !advancedOpen;
      advancedWrap.style.display = advancedOpen ? "" : "none";
      toggleBtn.textContent = advancedOpen ? "− Moins de détails" : "+ Plus de détails";
    }
  }, advancedOpen ? "− Moins de détails" : "+ Plus de détails");

  body.append(titleField, essentialRow, toggleBtn, advancedWrap);

  const actions = [{ label: "Annuler", onClick: closeModal }];
  if (existing) {
    actions.push({
      label: existing.archived ? "Désarchiver" : "Archiver",
      onClick: async () => {
        try {
          await archiveTask(uid, existing.id, !existing.archived);
          toast(existing.archived ? "Désarchivée" : "Archivée", "info");
          closeModal();
        } catch (e) { toast(`Erreur : ${e.message}`, "error"); }
      }
    });
    actions.push({
      label: "Supprimer", variant: "danger",
      onClick: async () => {
        if (!confirm("Supprimer cette tâche ?")) return;
        try { await deleteTask(uid, existing.id); toast("Supprimée", "info"); closeModal(); }
        catch (e) { toast(`Erreur : ${e.message}`, "error"); }
      }
    });
  }
  actions.push({
    label: existing ? "Enregistrer" : "Créer", variant: "primary",
    onClick: async () => {
      if (!data.title.trim()) { toast("Le titre est obligatoire", "error"); return; }
      try {
        if (existing) {
          const { subtasks, ...fields } = data;
          await updateTask(uid, existing.id, fields);
        } else {
          await createTask(uid, data);
        }
        toast(existing ? "Mise à jour" : "Tâche créée", "success");
        closeModal();
      } catch (e) { toast(`Erreur : ${e.message}`, "error"); }
    }
  });

  openModal(existing ? "Modifier la tâche" : "Nouvelle tâche", body, actions);
}

/* ── Subtasks editor ── */

function subtasksEditor(existing, uid) {
  const wrap = el("div", { class: "field" }, [el("label", {}, "Sous-tâches")]);
  const listNode = el("div", {});
  const subtasks = existing?.subtasks || [];

  function renderSubs() {
    clear(listNode);
    subtasks.forEach((s) => {
      listNode.appendChild(el("div", { class: `subtask-row ${s.done ? "done" : ""}` }, [
        el("div", {
          class: `check ${s.done ? "checked" : ""}`,
          style: "width:18px;height:18px;font-size:.65rem;",
          onclick: async () => {
            if (!existing) return;
            try { await toggleSubtask(uid, existing, s.id); }
            catch (e) { toast(`Erreur : ${e.message}`, "error"); }
          }
        }, s.done ? "✓" : ""),
        el("span", { style: "flex:1;" }, s.title),
        el("button", {
          class: "btn btn--icon sm btn--ghost",
          onclick: async () => {
            if (!existing) return;
            try { await removeSubtask(uid, existing, s.id); }
            catch (e) { toast(`Erreur : ${e.message}`, "error"); }
          }
        }, "✕")
      ]));
    });
  }
  renderSubs();

  const addRow = el("div", { class: "flex gap-sm mt-sm" });
  const inp = el("input", { placeholder: "Ajouter une sous-tâche..." });
  inp.style.cssText = "flex:1;padding:8px 12px;border-radius:var(--r-sm);border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-size:.85rem;";
  addRow.append(inp, el("button", {
    class: "btn btn--sm btn--outline",
    onclick: async () => {
      const title = inp.value.trim();
      if (!title) return;
      if (existing) {
        try { await addSubtask(uid, existing, title); }
        catch (e) { toast(`Erreur : ${e.message}`, "error"); return; }
      } else {
        toast("Enregistre d'abord la tâche", "info");
      }
      inp.value = "";
    }
  }, "Ajouter"));

  wrap.append(listNode, addRow);
  return wrap;
}

/* ── Form helpers ── */

function formField(label, node) {
  return el("div", { class: "field" }, [el("label", {}, label), node]);
}

function formInput(type, value, onChange, placeholder = "") {
  return el("input", { type, value: value ?? "", placeholder, oninput: (e) => onChange(e.target.value) });
}

function formTextarea(value, onChange) {
  return el("textarea", { oninput: (e) => onChange(e.target.value) }, value || "");
}

function formSelect(options, value, onChange) {
  return el("select", { onchange: (e) => onChange(e.target.value) },
    options.map((o) => el("option", { value: o.value, selected: o.value === value ? "selected" : null }, o.label))
  );
}

function renderColorPicker(value, onChange) {
  const wrap = el("div", { class: "color-dots" });
  DEFAULT_COLORS.forEach((c) => {
    const dot = el("div", {
      class: `color-dot ${c === value ? "active" : ""}`,
      style: `background:${c};`,
      onclick: () => {
        onChange(c);
        wrap.querySelectorAll(".color-dot").forEach((d) => d.classList.remove("active"));
        dot.classList.add("active");
      }
    });
    wrap.appendChild(dot);
  });
  return wrap;
}
