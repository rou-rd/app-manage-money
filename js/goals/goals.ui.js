import { el, clear } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { toast } from "../utils/toast.js";
import { getCurrentUser } from "../auth/auth.js";
import { subscribe } from "../store.js";
import { formatHuman, diffDays, todayStr, isPast } from "../utils/date.js";
import { TERMS, PRIORITIES, newGoalDefaults, goalProgress } from "./goals.model.js";
import { createGoal, updateGoal, deleteGoal, addStep, toggleStep, removeStep } from "./goals.service.js";

let latestState = { goals: [], tasks: [] };
let filter = "all";

export function initGoalsView(container) {
  subscribe((state) => { latestState = state; render(container); });
}

function render(container) {
  clear(container);
  const goals = latestState.goals || [];

  const header = el("div", { class: "view-header" }, [
    el("h1", {}, "Objectifs"),
    el("button", { class: "btn btn--primary btn--sm", onclick: () => openGoalForm() }, "+ Nouveau")
  ]);
  container.appendChild(header);

  const chips = el("div", { class: "chip-bar mb-md" });
  [["all", "Tous"], ["active", "En cours"], ["done", "Complétés"]].forEach(([key, label]) => {
    chips.appendChild(el("button", {
      class: `chip ${filter === key ? "active" : ""}`, type: "button",
      onclick: () => { filter = key; render(container); }
    }, label));
  });
  container.appendChild(chips);

  const filtered = goals.filter(g => {
    if (filter === "active") return goalProgress(g) < 100;
    if (filter === "done") return goalProgress(g) >= 100;
    return true;
  });

  if (filtered.length === 0) {
    container.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "empty__icon" }, "🎯"),
      el("div", { class: "empty__text" }, filter === "all" ? "Aucun objectif. Définis tes ambitions !" : "Aucun objectif dans cette catégorie.")
    ]));
  } else {
    const grid = el("div", { class: "grid grid--2" });
    filtered.forEach(g => grid.appendChild(goalCard(g)));
    container.appendChild(grid);
  }

  container.appendChild(el("button", {
    class: "btn btn--fab", onclick: () => openGoalForm()
  }, "+"));
}

function goalCard(goal) {
  const pct = goalProgress(goal);
  const steps = goal.steps || [];
  const doneSteps = steps.filter(s => s.done).length;
  const daysLeft = goal.deadline ? diffDays(todayStr(), goal.deadline) : null;
  const overdue = goal.deadline && isPast(goal.deadline) && pct < 100;

  const card = el("div", { class: "goal-card card", onclick: () => openGoalForm(goal) });

  const headerEl = el("div", { class: "goal-card__header" }, [
    el("span", { class: "goal-card__title" }, goal.title),
    el("span", { class: `badge badge--${priorityColor(goal.priority)}` }, goal.priority || "medium")
  ]);

  const progressBar = el("div", { class: "progress" }, [
    el("div", { class: "progress__fill", style: `width:${pct}%` })
  ]);

  const linkedCount = (latestState.tasks || []).filter((t) => t.goalId === goal.id).length;
  const linkedDone = (latestState.tasks || []).filter((t) => t.goalId === goal.id && t.status === "done").length;

  const meta = el("div", { class: "flex items-center gap-sm mt-sm", style: "flex-wrap:wrap;" }, [
    el("span", { class: "text-xs text-muted-2" }, `${doneSteps}/${steps.length} étapes · ${pct}%`),
    linkedCount > 0 ? el("span", { class: "badge badge--teal", style: "font-size:.65rem;" }, `${linkedDone}/${linkedCount} tâches`) : null,
    goal.term ? el("span", { class: "badge" }, termLabel(goal.term)) : null,
    goal.deadline ? el("span", {
      class: `goal-card__deadline ${overdue ? "overdue" : ""}`,
    }, overdue ? `⚠️ ${formatHuman(goal.deadline)}` : `📅 ${formatHuman(goal.deadline)}`) : null,
    daysLeft !== null && daysLeft > 0 && pct < 100 ? el("span", { class: "text-xs text-muted-2" }, `${daysLeft}j restants`) : null
  ].filter(Boolean));

  card.append(headerEl, progressBar, meta);
  return card;
}

function priorityColor(p) {
  if (p === "high") return "red";
  if (p === "low") return "green";
  return "yellow";
}

function termLabel(t) {
  if (t === "short") return "Court terme";
  if (t === "long") return "Long terme";
  return "Moyen terme";
}

function openGoalForm(existing) {
  const uid = getCurrentUser()?.uid;
  if (!uid) { toast("Connecte-toi pour gérer tes objectifs.", "error"); return; }

  const data = existing ? { ...existing } : newGoalDefaults();
  const body = el("div", {});

  const titleInput = el("input", { value: data.title, placeholder: "Ex : Apprendre le piano, Courir un marathon..." });
  titleInput.addEventListener("input", (e) => { data.title = e.target.value; });

  const descInput = el("textarea", { rows: "2", placeholder: "Description (optionnel)" }, data.description || "");
  descInput.addEventListener("input", (e) => { data.description = e.target.value; });

  const deadlineInput = el("input", { type: "date", value: data.deadline || "" });
  deadlineInput.addEventListener("input", (e) => { data.deadline = e.target.value; });

  const termSelect = el("select", {}, TERMS.map(t =>
    el("option", { value: t.value, selected: t.value === data.term ? "selected" : null }, t.label)
  ));
  termSelect.addEventListener("change", (e) => { data.term = e.target.value; });

  const prioSelect = el("select", {}, PRIORITIES.map(p =>
    el("option", { value: p.value, selected: p.value === data.priority ? "selected" : null }, p.label)
  ));
  prioSelect.addEventListener("change", (e) => { data.priority = e.target.value; });

  body.append(
    fieldWrap("Titre", titleInput),
    fieldWrap("Description", descInput),
    el("div", { class: "field-row" }, [
      fieldWrap("Échéance", deadlineInput),
      fieldWrap("Terme", termSelect)
    ]),
    fieldWrap("Priorité", prioSelect)
  );

  if (existing) {
    const stepsSection = el("div", { class: "field" });
    stepsSection.appendChild(el("label", {}, "Étapes"));
    const stepsList = el("div", { class: "flex flex-col gap-xs" });

    function renderSteps() {
      clear(stepsList);
      (data.steps || []).forEach((step, idx) => {
        const row = el("div", { class: "subtask-row" }, [
          el("div", {
            class: `check sm ${step.done ? "checked" : ""}`,
            onclick: async () => {
              await toggleStep(uid, existing.id, idx);
              step.done = !step.done;
              renderSteps();
            }
          }, step.done ? "✓" : ""),
          el("span", { style: step.done ? "text-decoration:line-through;opacity:.6;" : "" }, step.text),
          el("button", {
            class: "btn btn--icon sm", title: "Supprimer",
            onclick: async () => {
              await removeStep(uid, existing.id, idx);
              data.steps.splice(idx, 1);
              renderSteps();
            }
          }, "✕")
        ]);
        stepsList.appendChild(row);
      });
    }
    renderSteps();

    const addStepInput = el("input", { placeholder: "Nouvelle étape..." });
    const addStepBtn = el("button", {
      class: "btn btn--sm btn--primary", type: "button",
      onclick: async () => {
        const text = addStepInput.value.trim();
        if (!text) return;
        await addStep(uid, existing.id, text);
        if (!data.steps) data.steps = [];
        data.steps.push({ text, done: false });
        addStepInput.value = "";
        renderSteps();
      }
    }, "+");

    stepsSection.append(stepsList, el("div", { class: "flex gap-sm mt-sm" }, [addStepInput, addStepBtn]));
    body.appendChild(stepsSection);

    const linkedTasks = (latestState.tasks || []).filter((t) => t.goalId === existing.id);
    if (linkedTasks.length) {
      const tasksSection = el("div", { class: "field" }, [el("label", {}, `Tâches liées (${linkedTasks.length})`)]);
      const tasksList = el("div", { class: "flex flex-col gap-xs" });
      linkedTasks.forEach((t) => {
        tasksList.appendChild(el("div", { class: "subtask-row" }, [
          el("div", {
            class: `check sm ${t.status === "done" ? "checked" : ""}`,
            style: "pointer-events:none;"
          }, t.status === "done" ? "✓" : ""),
          el("span", { style: t.status === "done" ? "text-decoration:line-through;opacity:.6;" : "" }, t.title),
          t.date ? el("span", { class: "badge badge--blue", style: "font-size:.65rem;" }, formatHuman(t.date)) : null
        ].filter(Boolean)));
      });
      tasksSection.appendChild(tasksList);
      const doneCount = linkedTasks.filter((t) => t.status === "done").length;
      tasksSection.appendChild(el("div", { class: "text-xs text-muted mt-sm" }, `${doneCount}/${linkedTasks.length} terminées`));
      body.appendChild(tasksSection);
    }
  }

  const actions = [{ label: "Annuler", onClick: closeModal }];
  if (existing) {
    actions.push({
      label: "Supprimer", variant: "danger",
      onClick: async () => {
        if (confirm("Supprimer cet objectif ?")) { await deleteGoal(uid, existing.id); closeModal(); }
      }
    });
  }
  actions.push({
    label: existing ? "Enregistrer" : "Créer", variant: "primary",
    onClick: async () => {
      if (!data.title.trim()) { toast("Le titre est obligatoire", "error"); return; }
      if (existing) {
        const { steps, ...fields } = data;
        await updateGoal(uid, existing.id, fields);
      } else {
        await createGoal(uid, data);
      }
      toast(existing ? "Objectif mis à jour" : "Objectif créé", "success");
      closeModal();
    }
  });

  openModal(existing ? "Modifier l'objectif" : "Nouvel objectif", body, actions);
}

function fieldWrap(label, node) {
  return el("div", { class: "field" }, [el("label", {}, label), node]);
}
