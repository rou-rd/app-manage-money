import { el, clear } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser } from "../auth/auth.js";
import { subscribe } from "../store.js";
import { formatHuman, diffDays, todayStr } from "../utils/date.js";
import { TERMS, PRIORITIES, newGoalDefaults, goalProgress } from "./goals.model.js";
import { createGoal, updateGoal, deleteGoal, addStep, toggleStep, removeStep } from "./goals.service.js";

let latestState = { goals: [] };

export function initGoalsView(container) {
  subscribe((state) => { latestState = state; render(container); });
}

function render(container) {
  clear(container);
  container.appendChild(el("div", { class: "topbar" }, [
    el("h1", {}, "Objectifs"),
    el("div", { class: "actions" }, [
      el("button", { class: "btn btn--primary", onclick: () => openGoalForm() }, "+ Nouvel objectif")
    ])
  ]));

  const goals = latestState.goals || [];
  if (goals.length === 0) {
    container.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, "🎯"),
      el("div", {}, "Aucun objectif pour le moment. Fixe-toi un premier objectif !")
    ]));
    return;
  }

  const grid = el("div", { class: "grid grid--3" });
  goals.forEach((g) => grid.appendChild(goalCard(g)));
  container.appendChild(grid);
}

function termLabel(term) { return TERMS.find((t) => t.value === term)?.label || term; }

function goalCard(goal) {
  const progress = goalProgress(goal);
  const remaining = goal.deadline ? diffDays(todayStr(), goal.deadline) : null;
  const card = el("div", { class: "card", onclick: () => openGoalForm(goal), style: "cursor:pointer;" });
  card.append(...[
    el("div", { style: "display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;" }, [
      el("h3", { style: "margin:0;" }, goal.title),
      el("span", { class: "badge badge--info" }, termLabel(goal.term))
    ]),
    goal.deadline ? el("div", { style: "font-size:12px;color:var(--muted2);margin-bottom:10px;" },
      remaining >= 0 ? `${remaining} jour(s) restant(s) · ${formatHuman(goal.deadline)}` : `Échéance dépassée · ${formatHuman(goal.deadline)}`) : null,
    el("div", { class: "progress-bar", style: "margin-bottom:6px;" }, [el("div", { style: `width:${progress}%` })]),
    el("div", { style: "font-size:12px;color:var(--muted);" }, `${progress}% complété · ${(goal.steps || []).filter(s => s.done).length}/${(goal.steps || []).length} étapes`),
    goal.status === "completed" ? el("span", { class: "badge badge--low", style: "margin-top:8px;" }, "🏆 Atteint") : null
  ].filter(Boolean));
  return card;
}

function openGoalForm(existing) {
  const uid = getCurrentUser()?.uid;
  if (!uid) { toast("Connecte-toi pour gérer tes objectifs.", "error"); return; }

  const data = existing ? { ...existing } : newGoalDefaults();
  const body = el("div", {});

  const titleInput = el("input", { value: data.title, placeholder: "Ex : Économiser 1000€, Apprendre Angular...", oninput: (e) => (data.title = e.target.value) });
  const descInput = el("textarea", { oninput: (e) => (data.description = e.target.value) }, data.description || "");

  const row1 = el("div", { class: "field-row" }, [
    fieldWrap("Terme", el("select", { onchange: (e) => (data.term = e.target.value) },
      TERMS.map((t) => el("option", { value: t.value, selected: t.value === data.term ? "selected" : null }, t.label)))),
    fieldWrap("Priorité", el("select", { onchange: (e) => (data.priority = e.target.value) },
      PRIORITIES.map((p) => el("option", { value: p.value, selected: p.value === data.priority ? "selected" : null }, p.label))))
  ]);

  const deadlineInput = el("input", { type: "date", value: data.deadline || "", oninput: (e) => (data.deadline = e.target.value) });

  const stepsBlock = stepsEditor(existing, uid);

  body.append(
    fieldWrap("Titre", titleInput),
    fieldWrap("Description", descInput),
    row1,
    fieldWrap("Date limite", deadlineInput),
    stepsBlock
  );

  const actions = [{ label: "Fermer", onClick: closeModal }];
  if (existing) {
    actions.push({ label: "Supprimer", variant: "danger", onClick: async () => { await deleteGoal(uid, existing.id); toast("Objectif supprimé", "info"); closeModal(); } });
  }
  actions.push({
    label: existing ? "Enregistrer" : "Créer",
    variant: "primary",
    onClick: async () => {
      if (!data.title.trim()) { toast("Le titre est obligatoire", "error"); return; }
      if (existing) await updateGoal(uid, existing.id, data);
      else await createGoal(uid, data);
      toast(existing ? "Objectif mis à jour" : "Objectif créé", "success");
      closeModal();
    }
  });

  openModal(existing ? "Modifier l'objectif" : "Nouvel objectif", body, actions);
}

function stepsEditor(existing, uid) {
  const wrap = el("div", { class: "field" }, [el("label", {}, "Étapes")]);
  const list = el("div", {});
  const steps = existing?.steps || [];

  function renderList() {
    clear(list);
    steps.forEach((s) => {
      list.appendChild(el("div", { class: `subtask-row ${s.done ? "done" : ""}` }, [
        el("div", {
          class: `checkbox ${s.done ? "checked" : ""}`, style: "width:16px;height:16px;",
          onclick: async () => { if (existing) await toggleStep(uid, existing, s.id); }
        }, s.done ? "✓" : ""),
        el("span", { style: "flex:1;" }, s.title),
        el("button", { class: "btn btn--sm btn--ghost", onclick: async () => { if (existing) await removeStep(uid, existing, s.id); } }, "✕")
      ]));
    });
  }
  renderList();

  const addRow = el("div", { style: "display:flex;gap:8px;margin-top:8px;" });
  const newInput = el("input", { placeholder: "Ajouter une étape...", style: "flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-alt);color:var(--text);" });
  addRow.append(newInput, el("button", {
    class: "btn btn--sm btn--ghost",
    onclick: async () => {
      const title = newInput.value.trim();
      if (!title) return;
      if (existing) await addStep(uid, existing, title);
      else toast("Enregistre d'abord l'objectif pour ajouter des étapes", "info");
      newInput.value = "";
    }
  }, "Ajouter"));

  wrap.append(list, addRow);
  return wrap;
}

function fieldWrap(label, node) {
  return el("div", { class: "field" }, [el("label", {}, label), node]);
}
