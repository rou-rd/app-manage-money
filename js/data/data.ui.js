import { el, clear } from "../utils/dom.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser } from "../auth/auth.js";
import { subscribe, getState } from "../store.js";
import { listItems, addItem, removeItem } from "../utils/firestore.js";

let root = null;

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
    if (sep === -1) return { title: part, done: false };
    return { done: part.slice(0, sep) === "1", title: part.slice(sep + 2).replace(/⏐/g, "|") };
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
    if (sep === -1) return { title: part, done: false };
    return { done: part.slice(0, sep) === "1", title: part.slice(sep + 2).replace(/⏐/g, "|") };
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

function render() {
  if (!root) return;
  const st = getState();

  root.innerHTML = `
    <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;">📦 Import / Export</h2>

    <div class="card" style="margin-bottom:16px;padding:20px;">
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;">📊 Données actuelles</h3>
      <p style="color:var(--muted);font-size:13px;margin:0;">
        ${st.tasks.length} tâches · ${st.routines.length} routines · ${st.goals.length} objectifs
      </p>
    </div>

    <div class="card" style="margin-bottom:16px;padding:20px;">
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;">📤 Exporter</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 12px;">
        Télécharge toutes tes tâches, routines et objectifs en CSV.
      </p>
      <button class="btn btn--primary" id="btn-data-export">Télécharger lifehub-tasks.csv</button>
    </div>

    <div class="card" style="margin-bottom:16px;padding:20px;">
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;">📥 Importer</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 12px;">
        Importe un fichier CSV exporté précédemment. Les données importées s'ajoutent aux données existantes.
      </p>
      <label style="display:flex;flex-direction:column;align-items:center;padding:24px;border:2px dashed var(--border);border-radius:12px;cursor:pointer;text-align:center;">
        <span style="font-size:28px;margin-bottom:6px;">📂</span>
        <span style="font-size:13px;color:var(--muted);">Cliquer ou déposer un fichier CSV</span>
        <input type="file" id="file-data-import" accept=".csv,text/csv" style="display:none;" />
      </label>
    </div>

    <div class="card" style="padding:20px;border-color:var(--red,#e24b4a);">
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;color:var(--red,#e24b4a);">🗑 Supprimer tout</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 12px;">
        Efface toutes les tâches, routines et objectifs. Irréversible.
      </p>
      <button class="btn" id="btn-data-clear" style="color:var(--red,#e24b4a);border-color:var(--red,#e24b4a);">Tout supprimer</button>
    </div>
  `;

  root.querySelector("#btn-data-export").addEventListener("click", downloadCsv);

  root.querySelector("#file-data-import").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(reader.result);
    reader.readAsText(file, "utf-8");
  });

  root.querySelector("#btn-data-clear").addEventListener("click", clearAllData);
}
