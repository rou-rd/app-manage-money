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
  createTask, updateTask, deleteTask, setTaskStatus, addSubtask, toggleSubtask, removeSubtask,
  archiveTask
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

/** Regroupe les instances d'une même routine sous une seule ligne : garde la plus
 *  pertinente (aujourd'hui, sinon la prochaine à faire, sinon la plus récente non
 *  faite) en tête, et les autres dates apparaissent en petite liste juste dessous. */
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

  const viewToggle = el("div", { class: "view-toggle", style: "display:flex;gap:4px;margin-bottom:12px;" }, [
    el("button", {
      class: `btn btn--sm ${viewMode === "list" ? "btn--primary" : "btn--ghost"}`,
      onclick: () => { viewMode = "list"; render(container); }
    }, "Liste"),
    el("button", {
      class: `btn btn--sm ${viewMode === "kanban" ? "btn--primary" : "btn--ghost"}`,
      onclick: () => { viewMode = "kanban"; render(container); }
    }, "Kanban"),
    el("button", {
      class: `btn btn--sm ${viewMode === "stats" ? "btn--primary" : "btn--ghost"}`,
      onclick: () => { viewMode = "stats"; render(container); }
    }, "Stats")
  ]);

  const chips = el("div", { style: "display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;" }, [
    scopeChip("Toutes", "all"),
    scopeChip("Aujourd'hui", "today"),
    scopeChip("Journée", "daily"),
    scopeChip("À venir", "upcoming"),
    scopeChip("En retard", "overdue"),
    scopeChip("Archives", "archived")
  ]);

  container.append(toolbar, viewToggle, chips);

  if (filters.scope === "daily") {
    const dayNav = el("div", {
      style: "display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);"
    }, [
      el("button", {
        class: "btn btn--sm btn--ghost",
        onclick: () => { dailyDate = addDays(dailyDate, -1); render(container); }
      }, "◀"),
      el("span", { style: "font-weight:600;font-size:14px;flex:1;text-align:center;" }, formatHuman(dailyDate)),
      el("button", {
        class: "btn btn--sm btn--ghost",
        onclick: () => { dailyDate = addDays(dailyDate, 1); render(container); }
      }, "▶"),
      el("button", {
        class: "btn btn--sm btn--ghost",
        style: dailyDate === todayStr() ? "opacity:0.3;pointer-events:none;" : "",
        onclick: () => { dailyDate = todayStr(); render(container); }
      }, "Aujourd'hui")
    ]);
    container.appendChild(dayNav);
  }

  container.append(filtersBar(state), savedViewsBar());

  if (viewMode === "stats") {
    container.appendChild(renderStats(state));
    return;
  }

  const list = currentTasks(state);
  if (list.length === 0) {
    container.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, "🗒️"),
      el("div", {}, filters.scope === "archived" ? "Aucune tâche archivée." : "Aucune tâche pour l'instant. Crée ta première tâche !")
    ]));
    return;
  }

  if (viewMode === "kanban") {
    container.appendChild(renderKanban(list));
  } else {
    container.appendChild(renderList(list));
  }

}

function renderList(list) {
  const listNode = el("div", {});
  buildRenderItems(list).forEach((item) => {
    if (item.type === "task") {
      listNode.appendChild(taskCard(item.task));
      return;
    }
    listNode.appendChild(taskCard(item.primary));
    if (item.others.length) {
      const sub = el("div", { style: "margin:2px 0 10px 30px;display:flex;flex-direction:column;gap:2px;" });
      item.others.forEach((t) => {
        sub.appendChild(el("div", {
          style: "font-size:11.5px;color:var(--muted2);cursor:pointer;padding:3px 0;display:flex;align-items:center;gap:6px;",
          onclick: () => openTaskForm(t)
        }, [
          el("span", { style: `width:6px;height:6px;border-radius:50%;background:${t.status === "done" ? "var(--green)" : "var(--muted2)"};display:inline-block;flex-shrink:0;` }),
          formatHuman(t.date) + (t.status === "done" ? " · fait" : "")
        ]));
      });
      listNode.appendChild(sub);
    }
  });
  return listNode;
}

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

    const header = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;" }, [
      el("div", { class: "kanban-col__title", style: `color:${col.color};` }, col.label),
      el("span", { style: "font-size:11px;color:var(--muted2);background:var(--surface);padding:2px 8px;border-radius:10px;" }, String(tasks.length))
    ]);
    column.appendChild(header);

    tasks.forEach((t) => {
      const card = kanbanCard(t);
      column.appendChild(card);
    });

    board.appendChild(column);
  });

  return board;
}

function kanbanCard(task) {
  const progress = taskProgress(task);
  const overdue = task.date && isPast(task.date) && task.status !== "done";
  const card = el("div", {
    class: "kanban-task",
    draggable: "true",
    ondragstart: (e) => { e.dataTransfer.setData("text/plain", task.id); card.classList.add("dragging"); },
    ondragend: () => card.classList.remove("dragging"),
    onclick: () => {
      if (task.isFacture) { toast("Gère cette facture depuis Finances → Factures.", "info"); return; }
      openTaskForm(task);
    }
  });
  card.style.borderLeftColor = task.color || "#3d72d8";

  card.append(
    el("div", { style: "font-size:13px;font-weight:600;margin-bottom:6px;" }, task.title),
    el("div", { style: "display:flex;gap:4px;flex-wrap:wrap;" }, [
      priorityBadge(task.priority),
      task.category ? el("span", { class: "badge badge--muted" }, task.category) : null,
      task.date ? el("span", { class: `badge ${overdue ? "badge--high" : "badge--info"}` }, formatHuman(task.date)) : null,
      task.routineId ? el("span", { class: "badge badge--info" }, "🔁") : null
    ].filter(Boolean))
  );

  if (task.subtasks?.length) {
    card.appendChild(el("div", { class: "task-card__progress", style: "margin-top:6px;" }, [el("div", { style: `width:${progress}%` })]));
  }

  return card;
}

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

  const wrap = el("div", { class: "stats-panel" });

  const statCards = el("div", { class: "grid grid--3", style: "margin-bottom:20px;" }, [
    statTile("Total", String(all.length), "tâches"),
    statTile("Terminées", String(done.length), `${completionRate}%`),
    statTile("Cette semaine", String(doneThisWeek.length), "complétées"),
    statTile("En retard", String(overdue.length), overdue.length > 0 ? "attention" : "tout va bien"),
    statTile("En cours", String(doing.length), "actives"),
    statTile("À faire", String(todo.length), "en attente")
  ]);
  wrap.appendChild(statCards);

  if (totalTime > 0) {
    const hrs = Math.floor(totalTime / 3600);
    const mins = Math.floor((totalTime % 3600) / 60);
    wrap.appendChild(el("div", { class: "card", style: "margin-bottom:16px;padding:14px;" }, [
      el("div", { style: "font-size:12.5px;color:var(--muted);font-weight:700;margin-bottom:4px;" }, "Temps focus total"),
      el("div", { style: "font-size:22px;font-weight:800;" }, `${hrs}h ${mins}m`)
    ]));
  }

  const priBar = el("div", { class: "card", style: "margin-bottom:16px;padding:14px;" }, [
    el("div", { style: "font-size:12.5px;color:var(--muted);font-weight:700;margin-bottom:10px;" }, "Par priorité"),
    progressRow("Haute", priCounts.high, all.length, "var(--red)"),
    progressRow("Moyenne", priCounts.medium, all.length, "var(--orange)"),
    progressRow("Basse", priCounts.low, all.length, "var(--green)")
  ]);
  wrap.appendChild(priBar);

  if (topCats.length) {
    const catCard = el("div", { class: "card", style: "padding:14px;" }, [
      el("div", { style: "font-size:12.5px;color:var(--muted);font-weight:700;margin-bottom:10px;" }, "Top catégories")
    ]);
    topCats.forEach(([name, count]) => {
      catCard.appendChild(progressRow(name, count, all.length, "var(--blue)"));
    });
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

function progressRow(label, count, total, color) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return el("div", { style: "margin-bottom:8px;" }, [
    el("div", { style: "display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;" }, [
      el("span", {}, label),
      el("span", { style: "color:var(--muted2);" }, `${count} (${pct}%)`)
    ]),
    el("div", { style: "height:6px;background:var(--border);border-radius:3px;overflow:hidden;" }, [
      el("div", { style: `width:${pct}%;height:100%;background:${color};border-radius:3px;` })
    ])
  ]);
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
      const { query: _q, ...savedFilters } = filters;
      createView(uid, { name: name.trim(), filters: savedFilters }).catch((e) => {
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
    draggable: "true",
    ondragstart: (e) => { e.dataTransfer.setData("text/plain", task.id); card.classList.add("dragging"); },
    ondragend: () => card.classList.remove("dragging"),
    onclick: (e) => {
      if (e.target.closest(".checkbox") || e.target.closest(".task-actions")) return;
      if (task.isFacture) { toast("Gère cette facture depuis Finances → Factures.", "info"); return; }
      openTaskForm(task);
    }
  });
  card.style.borderLeftColor = task.color || "#3d72d8";

  const actionBtns = [];
  if (!task.isFacture && task.status !== "done") {
    actionBtns.push(el("button", {
      class: "btn btn--sm btn--ghost task-actions", title: "Focus",
      onclick: () => startPomodoro(task)
    }, "⏱"));
  }
  if (!task.isFacture) {
    actionBtns.push(el("button", {
      class: "btn btn--sm btn--ghost task-actions", title: task.archived ? "Désarchiver" : "Archiver",
      onclick: async () => {
        const uid = getCurrentUser()?.uid;
        if (!uid) return;
        try {
          await archiveTask(uid, task.id, !task.archived);
          toast(task.archived ? "Tâche désarchivée" : "Tâche archivée", "info");
        } catch (e) { toast(`Erreur : ${e.message}`, "error"); }
      }
    }, task.archived ? "↩" : "📦"));
  }

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
        task.isFacture ? el("span", { class: "badge badge--muted" }, formatMoney(task.montant)) : null,
        task.timeSpent ? el("span", { class: "badge badge--muted" }, `⏱ ${Math.round(task.timeSpent / 60)}m`) : null
      ])
    ]),
    ...(actionBtns.length ? [el("div", { style: "display:flex;gap:2px;flex-shrink:0;" }, actionBtns)] : [])
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
      label: existing.archived ? "Désarchiver" : "Archiver",
      onClick: async () => {
        try {
          await archiveTask(uid, existing.id, !existing.archived);
          toast(existing.archived ? "Tâche désarchivée" : "Tâche archivée", "info");
          closeModal();
        } catch (e) { toast(`Erreur : ${e.message}`, "error"); }
      }
    });
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
        if (existing) {
          const { subtasks, ...fields } = data;
          await updateTask(uid, existing.id, fields);
        } else {
          await createTask(uid, data);
        }
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
