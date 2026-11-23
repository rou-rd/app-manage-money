import { el, clear } from "../utils/dom.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser } from "../auth/auth.js";
import { subscribe, getState } from "../store.js";
import { addItem, removeItem } from "../utils/firestore.js";
import { uid as genId } from "../utils/id.js";
import { formatHuman } from "../utils/date.js";

let root = null;
let selectedTasks = new Set();
let selectedGoals = new Set();
let selectedRoutines = new Set();
let openSections = { routineTasks: false, manualTasks: false, routines: false, goals: false };

export function initDataView(container) {
  root = container;
  render();
  subscribe(() => render());
}

function csvEsc(s) {
  const t = String(s ?? "");
  if (/[",\n;\t]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function serializeSubtasks(subtasks) {
  if (!subtasks || !subtasks.length) return "";
  return subtasks.map(s => `${s.done ? 1 : 0}::${(s.title || "").replace(/\|/g, "⏐")}`).join("|");
}

function parseSubtasks(str) {
  if (!str) return [];
  return str.split("|").filter(Boolean).map(part => {
    const sep = part.indexOf("::");
    if (sep === -1) return { id: genId(), title: part, done: false };
    return { id: genId(), done: part.slice(0, sep) === "1", title: part.slice(sep + 2).replace(/⏐/g, "|") };
  });
}

function serializeSteps(steps) {
  if (!steps || !steps.length) return "";
  return steps.map(s => `${s.done ? 1 : 0}::${(s.title || "").replace(/\|/g, "⏐")}`).join("|");
}

function parseSteps(str) {
  if (!str) return [];
  return str.split("|").filter(Boolean).map(part => {
    const sep = part.indexOf("::");
    if (sep === -1) return { id: genId(), title: part, done: false };
    return { id: genId(), done: part.slice(0, sep) === "1", title: part.slice(sep + 2).replace(/⏐/g, "|") };
  });
}

function serializeDaysOfWeek(days) {
  if (!days || !days.length) return "";
  return days.join("|");
}

function parseDaysOfWeek(str) {
  if (!str) return [];
  return str.split("|").filter(s => s !== "").map(Number);
}

function buildExportCsv() {
  const st = getState();
  const lines = [];

  lines.push("##TASKS");
  lines.push("id,title,description,category,priority,date,time,duration,color,status,subtasks,notes,routineId,goalId,goalMilestoneId");
  st.tasks.forEach(t => {
    lines.push([
      csvEsc(t.id), csvEsc(t.title), csvEsc(t.description || ""), csvEsc(t.category || ""),
      csvEsc(t.priority || "medium"), csvEsc(t.date || ""), csvEsc(t.time || ""),
      t.duration || "", csvEsc(t.color || ""), csvEsc(t.status || "todo"),
      csvEsc(serializeSubtasks(t.subtasks)), csvEsc(t.notes || ""),
      csvEsc(t.routineId || ""), csvEsc(t.goalId || ""), csvEsc(t.goalMilestoneId || "")
    ].join(","));
  });

  lines.push("");
  lines.push("##ROUTINES");
  lines.push("id,title,category,frequency,daysOfWeek,dayOfMonth,time,duration,color,active");
  st.routines.forEach(r => {
    lines.push([
      csvEsc(r.id), csvEsc(r.title), csvEsc(r.category || ""),
      csvEsc(r.frequency || "daily"), csvEsc(serializeDaysOfWeek(r.daysOfWeek)),
      r.dayOfMonth || 1, csvEsc(r.time || ""), r.duration || 30,
      csvEsc(r.color || ""), r.active !== false ? 1 : 0
    ].join(","));
  });

  lines.push("");
  lines.push("##GOALS");
  lines.push("id,title,description,term,deadline,priority,steps,status");
  st.goals.forEach(g => {
    lines.push([
      csvEsc(g.id), csvEsc(g.title), csvEsc(g.description || ""),
      csvEsc(g.term || "medium"), csvEsc(g.deadline || ""),
      csvEsc(g.priority || "medium"), csvEsc(serializeSteps(g.steps)),
      csvEsc(g.status || "in_progress")
    ].join(","));
  });

  return "﻿" + lines.join("\n");
}

function downloadCsv() {
  const blob = new Blob([buildExportCsv()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "lifehub-tasks.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Export CSV téléchargé", "success");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === "," || c === ";") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function importCsv(text) {
  const user = getCurrentUser();
  if (!user) { toast("Connecte-toi d'abord", "error"); return; }
  const uid = user.uid;
  const raw = text.replace(/^﻿/, "").trim();
  if (!raw) { toast("Fichier vide", "error"); return; }

  const rawLines = raw.split(/\r?\n/);
  const buckets = { TASKS: [], ROUTINES: [], GOALS: [] };
  let mode = null;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("##")) {
      mode = trimmed.slice(2).toUpperCase();
      if (!(mode in buckets)) buckets[mode] = [];
      continue;
    }
    if (!mode) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("id,") || lower.startsWith("id;")) continue;
    if (!trimmed) continue;
    buckets[mode].push(parseCsvLine(trimmed));
  }

  let counts = { tasks: 0, routines: 0, goals: 0 };

  for (const row of buckets.TASKS) {
    if (row.length < 2 || !row[1]) continue;
    const data = {
      title: row[1] || "",
      description: row[2] || "",
      category: row[3] || "Général",
      priority: row[4] || "medium",
      date: row[5] || "",
      time: row[6] || "",
      duration: row[7] ? Number(row[7]) : null,
      color: row[8] || "#3d72d8",
      status: row[9] || "todo",
      subtasks: parseSubtasks(row[10]),
      notes: row[11] || "",
      routineId: row[12] || null,
      goalId: row[13] || null,
      goalMilestoneId: row[14] || null,
      notified: {}
    };
    await addItem(uid, "tasks", data);
    counts.tasks++;
  }

  for (const row of buckets.ROUTINES) {
    if (row.length < 2 || !row[1]) continue;
    const data = {
      title: row[1] || "",
      category: row[2] || "Bien-être",
      frequency: row[3] || "daily",
      daysOfWeek: parseDaysOfWeek(row[4]),
      dayOfMonth: row[5] ? Number(row[5]) : 1,
      time: row[6] || "08:00",
      duration: row[7] ? Number(row[7]) : 30,
      color: row[8] || "#1d9e75",
      active: row[9] !== "0"
    };
    await addItem(uid, "routines", data);
    counts.routines++;
  }

  for (const row of buckets.GOALS) {
    if (row.length < 2 || !row[1]) continue;
    const data = {
      title: row[1] || "",
      description: row[2] || "",
      term: row[3] || "medium",
      deadline: row[4] || "",
      priority: row[5] || "medium",
      steps: parseSteps(row[6]),
      status: row[7] || "in_progress"
    };
    await addItem(uid, "goals", data);
    counts.goals++;
  }

  toast(`Importé : ${counts.tasks} tâches, ${counts.routines} routines, ${counts.goals} objectifs`, "success");
}

async function clearAllData() {
  const user = getCurrentUser();
  if (!user) { toast("Connecte-toi d'abord", "error"); return; }
  if (!confirm("Supprimer TOUTES les tâches, routines et objectifs ? Cette action est irréversible.")) return;
  const uid = user.uid;
  const st = getState();
  for (const t of st.tasks) await removeItem(uid, "tasks", t.id);
  for (const r of st.routines) await removeItem(uid, "routines", r.id);
  for (const g of st.goals) await removeItem(uid, "goals", g.id);
  toast("Toutes les données supprimées", "success");
}

async function bulkDelete(collection, ids) {
  const user = getCurrentUser();
  if (!user) { toast("Connecte-toi d'abord", "error"); return; }
  const uid = user.uid;
  let count = 0;
  for (const id of ids) {
    await removeItem(uid, collection, id);
    count++;
  }
  return count;
}

function groupRoutineTasks(tasks, routines) {
  const routineMap = new Map(routines.map(r => [r.id, r.title]));
  const groups = new Map();
  const manual = [];
  tasks.forEach(t => {
    if (t.routineId) {
      if (!groups.has(t.routineId)) groups.set(t.routineId, { title: routineMap.get(t.routineId) || t.title, tasks: [] });
      groups.get(t.routineId).tasks.push(t);
    } else {
      manual.push(t);
    }
  });
  return { groups, manual };
}

function collapsibleSection(key, title, badge, contentFn) {
  const open = openSections[key];
  const header = el("div", {
    style: "display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:12px 0;",
    onclick: () => { openSections[key] = !openSections[key]; render(); }
  }, [
    el("div", { style: "display:flex;align-items:center;gap:10px;" }, [
      el("span", { style: "font-size:12px;color:var(--muted);transition:transform .2s;" + (open ? "transform:rotate(90deg);" : "") }, "▶"),
      el("h3", { style: "margin:0;font-size:15px;font-weight:600;" }, title),
      el("span", { class: "badge badge--info", style: "font-size:11px;" }, String(badge))
    ])
  ]);
  const body = el("div", { style: open ? "" : "display:none;" });
  if (open) body.appendChild(contentFn());
  const wrap = el("div", { class: "card", style: "margin-bottom:16px;padding:14px 20px;" });
  wrap.append(header, body);
  return wrap;
}

function routineTasksContent(groups) {
  const uid = getCurrentUser()?.uid;
  const wrap = el("div", {});
  groups.forEach((group, routineId) => {
    const todoCount = group.tasks.filter(t => t.status !== "done").length;
    const doneCount = group.tasks.filter(t => t.status === "done").length;
    const row = el("div", {
      style: "display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);"
    }, [
      el("div", {}, [
        el("div", { style: "font-weight:600;font-size:13.5px;" }, group.title),
        el("div", { style: "font-size:11.5px;color:var(--muted2);" }, `${group.tasks.length} instances · ${doneCount} faites · ${todoCount} en attente`)
      ]),
      el("div", { style: "display:flex;gap:6px;" }, [
        el("button", {
          class: "btn btn--sm btn--ghost",
          style: "color:var(--red);border-color:var(--red);",
          onclick: async () => {
            const todoTasks = group.tasks.filter(t => t.status !== "done");
            if (!todoTasks.length) { toast("Aucune tâche en attente à supprimer", "info"); return; }
            if (!confirm(`Supprimer ${todoTasks.length} tâche(s) "${group.title}" non terminées ?`)) return;
            const n = await bulkDelete("tasks", todoTasks.map(t => t.id));
            toast(`${n} tâche(s) supprimée(s)`, "success");
          }
        }, `Suppr. todo (${todoCount})`),
        el("button", {
          class: "btn btn--sm btn--ghost",
          style: "color:var(--red);border-color:var(--red);",
          onclick: async () => {
            if (!confirm(`Supprimer les ${group.tasks.length} tâche(s) "${group.title}" ?`)) return;
            const n = await bulkDelete("tasks", group.tasks.map(t => t.id));
            toast(`${n} tâche(s) supprimée(s)`, "success");
          }
        }, `Suppr. tout (${group.tasks.length})`)
      ])
    ]);
    wrap.appendChild(row);
  });
  if (groups.size === 0) wrap.appendChild(el("div", { style: "color:var(--muted);font-size:13px;padding:8px 0;" }, "Aucune tâche de routine."));
  return wrap;
}

function manualTasksContent(tasks) {
  const wrap = el("div", {});
  if (!tasks.length) {
    wrap.appendChild(el("div", { style: "color:var(--muted);font-size:13px;padding:8px 0;" }, "Aucune tâche manuelle."));
    return wrap;
  }
  const toolbar = el("div", { style: "display:flex;gap:8px;margin-bottom:10px;align-items:center;" }, [
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { tasks.forEach(t => selectedTasks.add(t.id)); render(); } }, "Tout cocher"),
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { selectedTasks.clear(); render(); } }, "Tout décocher"),
    el("button", {
      class: "btn btn--sm btn--ghost", style: selectedTasks.size ? "color:var(--red);border-color:var(--red);" : "opacity:.4;pointer-events:none;",
      onclick: async () => {
        const ids = [...selectedTasks].filter(id => tasks.some(t => t.id === id));
        if (!ids.length) return;
        if (!confirm(`Supprimer ${ids.length} tâche(s) sélectionnée(s) ?`)) return;
        const n = await bulkDelete("tasks", ids);
        selectedTasks.clear();
        toast(`${n} tâche(s) supprimée(s)`, "success");
      }
    }, `Supprimer sélectionnées (${[...selectedTasks].filter(id => tasks.some(t => t.id === id)).length})`)
  ]);
  wrap.appendChild(toolbar);

  const list = el("div", { style: "max-height:400px;overflow-y:auto;" });
  tasks.forEach(t => {
    const checked = selectedTasks.has(t.id);
    list.appendChild(el("div", {
      style: "display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;",
      onclick: () => { if (checked) selectedTasks.delete(t.id); else selectedTasks.add(t.id); render(); }
    }, [
      el("div", {
        class: `checkbox ${checked ? "checked" : ""}`,
        style: "width:18px;height:18px;flex-shrink:0;"
      }, checked ? "✓" : ""),
      el("div", { style: "flex:1;min-width:0;" }, [
        el("div", { style: "font-size:13.5px;font-weight:600;" + (t.status === "done" ? "text-decoration:line-through;opacity:.5;" : "") }, t.title),
        el("div", { style: "font-size:11px;color:var(--muted2);" },
          [t.date ? formatHuman(t.date) : "Pas de date", t.category || "", t.status === "done" ? "fait" : ""].filter(Boolean).join(" · "))
      ]),
      el("span", { class: `badge ${t.priority === "high" ? "badge--high" : t.priority === "low" ? "badge--low" : "badge--medium"}`, style: "font-size:10px;" },
        t.priority === "high" ? "Haute" : t.priority === "low" ? "Basse" : "Moy.")
    ]));
  });
  wrap.appendChild(list);
  return wrap;
}

function routinesListContent(routines) {
  const wrap = el("div", {});
  if (!routines.length) {
    wrap.appendChild(el("div", { style: "color:var(--muted);font-size:13px;padding:8px 0;" }, "Aucune routine."));
    return wrap;
  }
  const toolbar = el("div", { style: "display:flex;gap:8px;margin-bottom:10px;align-items:center;" }, [
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { routines.forEach(r => selectedRoutines.add(r.id)); render(); } }, "Tout cocher"),
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { selectedRoutines.clear(); render(); } }, "Tout décocher"),
    el("button", {
      class: "btn btn--sm btn--ghost", style: selectedRoutines.size ? "color:var(--red);border-color:var(--red);" : "opacity:.4;pointer-events:none;",
      onclick: async () => {
        const ids = [...selectedRoutines].filter(id => routines.some(r => r.id === id));
        if (!ids.length) return;
        if (!confirm(`Supprimer ${ids.length} routine(s) sélectionnée(s) et leurs tâches liées ?`)) return;
        const st = getState();
        const linkedTaskIds = st.tasks.filter(t => ids.includes(t.routineId)).map(t => t.id);
        const nR = await bulkDelete("routines", ids);
        const nT = await bulkDelete("tasks", linkedTaskIds);
        selectedRoutines.clear();
        toast(`${nR} routine(s) + ${nT} tâche(s) liée(s) supprimées`, "success");
      }
    }, `Supprimer sélectionnées (${[...selectedRoutines].filter(id => routines.some(r => r.id === id)).length})`)
  ]);
  wrap.appendChild(toolbar);

  routines.forEach(r => {
    const checked = selectedRoutines.has(r.id);
    const taskCount = getState().tasks.filter(t => t.routineId === r.id).length;
    wrap.appendChild(el("div", {
      style: "display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;",
      onclick: () => { if (checked) selectedRoutines.delete(r.id); else selectedRoutines.add(r.id); render(); }
    }, [
      el("div", { class: `checkbox ${checked ? "checked" : ""}`, style: "width:18px;height:18px;flex-shrink:0;" }, checked ? "✓" : ""),
      el("div", { style: `width:10px;height:10px;border-radius:50%;background:${r.color};flex-shrink:0;` }),
      el("div", { style: "flex:1;" }, [
        el("div", { style: "font-size:13.5px;font-weight:600;" + (!r.active ? "opacity:.5;" : "") }, r.title + (!r.active ? " (en pause)" : "")),
        el("div", { style: "font-size:11px;color:var(--muted2);" }, `${r.frequency} · ${taskCount} tâche(s) liée(s)`)
      ])
    ]));
  });
  return wrap;
}

function goalsListContent(goals) {
  const wrap = el("div", {});
  if (!goals.length) {
    wrap.appendChild(el("div", { style: "color:var(--muted);font-size:13px;padding:8px 0;" }, "Aucun objectif."));
    return wrap;
  }
  const toolbar = el("div", { style: "display:flex;gap:8px;margin-bottom:10px;align-items:center;" }, [
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { goals.forEach(g => selectedGoals.add(g.id)); render(); } }, "Tout cocher"),
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { selectedGoals.clear(); render(); } }, "Tout décocher"),
    el("button", {
      class: "btn btn--sm btn--ghost", style: selectedGoals.size ? "color:var(--red);border-color:var(--red);" : "opacity:.4;pointer-events:none;",
      onclick: async () => {
        const ids = [...selectedGoals].filter(id => goals.some(g => g.id === id));
        if (!ids.length) return;
        if (!confirm(`Supprimer ${ids.length} objectif(s) sélectionné(s) ?`)) return;
        const n = await bulkDelete("goals", ids);
        selectedGoals.clear();
        toast(`${n} objectif(s) supprimé(s)`, "success");
      }
    }, `Supprimer sélectionnés (${[...selectedGoals].filter(id => goals.some(g => g.id === id)).length})`)
  ]);
  wrap.appendChild(toolbar);

  goals.forEach(g => {
    const checked = selectedGoals.has(g.id);
    const stepsDone = (g.steps || []).filter(s => s.done).length;
    const stepsTotal = (g.steps || []).length;
    wrap.appendChild(el("div", {
      style: "display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;",
      onclick: () => { if (checked) selectedGoals.delete(g.id); else selectedGoals.add(g.id); render(); }
    }, [
      el("div", { class: `checkbox ${checked ? "checked" : ""}`, style: "width:18px;height:18px;flex-shrink:0;" }, checked ? "✓" : ""),
      el("div", { style: "flex:1;" }, [
        el("div", { style: "font-size:13.5px;font-weight:600;" + (g.status === "completed" ? "text-decoration:line-through;opacity:.5;" : "") }, g.title),
        el("div", { style: "font-size:11px;color:var(--muted2);" },
          [g.term, stepsTotal ? `${stepsDone}/${stepsTotal} étapes` : "", g.deadline ? formatHuman(g.deadline) : ""].filter(Boolean).join(" · "))
      ]),
      g.status === "completed"
        ? el("span", { class: "badge badge--low", style: "font-size:10px;" }, "Atteint")
        : el("span", { class: "badge badge--medium", style: "font-size:10px;" }, "En cours")
    ]));
  });
  return wrap;
}

function render() {
  if (!root) return;
  try {
  clear(root);
  const st = getState();
  const { groups, manual } = groupRoutineTasks(st.tasks, st.routines);

  const topbar = el("div", { class: "topbar" }, [el("h1", {}, "Import / Export")]);
  root.appendChild(topbar);

  const statsCard = el("div", { class: "card", style: "margin-bottom:16px;padding:20px;" }, [
    el("h3", { style: "margin:0 0 8px;font-size:15px;font-weight:600;" }, "Données actuelles"),
    el("p", { style: "color:var(--muted);font-size:13px;margin:0;" },
      `${st.tasks.length} tâches · ${st.routines.length} routines · ${st.goals.length} objectifs`)
  ]);
  root.appendChild(statsCard);

  const exportCard = el("div", { class: "card", style: "margin-bottom:16px;padding:20px;" }, [
    el("h3", { style: "margin:0 0 8px;font-size:15px;font-weight:600;" }, "Exporter"),
    el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 12px;" }, "Télécharge toutes tes tâches, routines et objectifs en CSV."),
    el("button", { class: "btn btn--primary", onclick: downloadCsv }, "Télécharger lifehub-tasks.csv")
  ]);
  root.appendChild(exportCard);

  const importLabel = el("label", { style: "display:flex;flex-direction:column;align-items:center;padding:24px;border:2px dashed var(--border);border-radius:12px;cursor:pointer;text-align:center;" }, [
    el("span", { style: "font-size:28px;margin-bottom:6px;" }, "📂"),
    el("span", { style: "font-size:13px;color:var(--muted);" }, "Cliquer ou déposer un fichier CSV")
  ]);
  const fileInput = el("input", { type: "file", accept: ".csv,text/csv", style: "display:none;" });
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(reader.result);
    reader.readAsText(file, "utf-8");
  });
  importLabel.appendChild(fileInput);
  const importCard = el("div", { class: "card", style: "margin-bottom:16px;padding:20px;" }, [
    el("h3", { style: "margin:0 0 8px;font-size:15px;font-weight:600;" }, "Importer"),
    el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 12px;" }, "Importe un fichier CSV. Les données s'ajoutent aux existantes."),
    importLabel
  ]);
  root.appendChild(importCard);

  root.appendChild(el("h2", { style: "margin:28px 0 14px;font-size:18px;font-weight:700;" }, "Gestion des données"));

  root.appendChild(collapsibleSection("routineTasks", "Tâches de routine", groups.size + " groupes",
    () => routineTasksContent(groups)));

  root.appendChild(collapsibleSection("manualTasks", "Tâches manuelles", manual.length,
    () => manualTasksContent(manual)));

  root.appendChild(collapsibleSection("routines", "Routines", st.routines.length,
    () => routinesListContent(st.routines)));

  root.appendChild(collapsibleSection("goals", "Objectifs", st.goals.length,
    () => goalsListContent(st.goals)));

  const dangerCard = el("div", { class: "card", style: "margin-top:20px;padding:20px;border-color:var(--red,#e24b4a);" }, [
    el("h3", { style: "margin:0 0 8px;font-size:15px;font-weight:600;color:var(--red,#e24b4a);" }, "Supprimer tout"),
    el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 12px;" }, "Efface toutes les tâches, routines et objectifs. Irréversible."),
    el("button", { class: "btn", style: "color:var(--red,#e24b4a);border-color:var(--red,#e24b4a);", onclick: clearAllData }, "Tout supprimer")
  ]);
  root.appendChild(dangerCard);

  } catch (e) {
    console.error("[DataView] render error:", e);
    root.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><div>Erreur d'affichage. Ouvre la console (F12) pour les détails.</div></div>`;
  }
}
