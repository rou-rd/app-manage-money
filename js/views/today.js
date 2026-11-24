import { el, clear } from "../utils/dom.js";
import { subscribe } from "../store.js";
import { todayStr, formatHuman, isPast, addDays, diffDays, parseDateStr } from "../utils/date.js";
import { getCurrentUser, onAuthChange } from "../auth/auth.js";
import { setTaskStatus } from "../tasks/tasks.service.js";
import { taskProgress } from "../tasks/tasks.model.js";
import { occursOn } from "../routines/routines.generator.js";
import { goalProgress } from "../goals/goals.model.js";
import { startPomodoro } from "../pomodoro/pomodoro.ui.js";
import { watchFinanceState, financeInvoicesToTasks } from "../finance/finance-reader.js";
import { toast } from "../utils/toast.js";

let root = null;
let latestState = { tasks: [], routines: [], goals: [] };
let financeState = null;
let unsubFinance = null;

const MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];
const WEEKDAY_FULL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function fullDateLabel(dateStr) {
  const d = parseDateStr(dateStr);
  const dow = (d.getDay() + 6) % 7;
  return `${WEEKDAY_FULL[dow]} ${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

export function initTodayView(container) {
  root = container;
  subscribe((state) => { latestState = state; render(); });
  onAuthChange((user) => {
    if (unsubFinance) unsubFinance();
    if (user) {
      unsubFinance = watchFinanceState(user.uid, (fs) => { financeState = fs; render(); });
    } else {
      financeState = null;
    }
  });
}

function allTasks() {
  return [...latestState.tasks, ...financeInvoicesToTasks(financeState)];
}

function render() {
  if (!root) return;
  clear(root);
  const today = todayStr();
  const tasks = allTasks();

  const todayTasks = tasks.filter((t) => t.date === today && !t.archived);
  const routines = (latestState.routines || []).filter((r) => r.active && occursOn(r, today));
  const activeGoals = (latestState.goals || []).filter((g) => g.status !== "completed");
  const upcoming = tasks
    .filter((t) => t.date && t.date > today && !t.archived && t.status !== "done")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const habitInstances = routines.map((r) => {
    const inst = latestState.tasks.find((t) => t.routineId === r.id && t.date === today);
    return { routine: r, instance: inst, done: inst?.status === "done" };
  });

  const doneTaskCount = todayTasks.filter((t) => t.status === "done").length;
  const doneHabitCount = habitInstances.filter((h) => h.done).length;
  const totalItems = todayTasks.length + habitInstances.length;
  const doneItems = doneTaskCount + doneHabitCount;
  const scorePct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  root.appendChild(greeting());
  root.appendChild(scoreCard(scorePct, doneItems, totalItems));

  if (todayTasks.length > 0 || habitInstances.length > 0) {
    root.appendChild(sectionHeader("Tâches du jour", `${doneTaskCount}/${todayTasks.length}`));
    if (todayTasks.length > 0) root.appendChild(taskList(todayTasks));
    else root.appendChild(emptyBlock("Aucune tâche aujourd'hui"));

    root.appendChild(sectionHeader("Habitudes", `${doneHabitCount}/${habitInstances.length}`));
    if (habitInstances.length > 0) root.appendChild(habitList(habitInstances));
    else root.appendChild(emptyBlock("Aucune habitude prévue aujourd'hui"));
  } else {
    root.appendChild(emptyBlock("Journée libre — pas de tâche ni d'habitude prévue", "🌴"));
  }

  if (activeGoals.length > 0) {
    root.appendChild(sectionHeader("Objectifs en cours", `${activeGoals.length}`));
    root.appendChild(goalGrid(activeGoals));
  }

  if (upcoming.length > 0) {
    root.appendChild(sectionHeader("Prochainement"));
    root.appendChild(upcomingList(upcoming));
  }
}

function greeting() {
  const user = getCurrentUser();
  const firstName = (user?.displayName || "").split(" ")[0] || "ami(e)";
  const hour = new Date().getHours();
  let greet = "Bonsoir";
  if (hour < 12) greet = "Bonjour";
  else if (hour < 18) greet = "Bon après-midi";

  return el("div", { style: "margin-bottom:var(--sp-lg);" }, [
    el("h1", { style: "margin-bottom:2px;" }, `${greet}, ${firstName}`),
    el("div", { class: "text-sm text-muted" }, fullDateLabel(todayStr()))
  ]);
}

function scoreCard(pct, done, total) {
  return el("div", { class: "today-score" }, [
    el("div", {}, [
      el("div", { class: "today-score__pct" }, `${pct}%`),
      el("div", { class: "today-score__label" }, "Score du jour"),
    ]),
    el("div", { style: "flex:1;" }, [
      el("div", { class: "today-score__detail" }, `${done} / ${total} tâches et habitudes complétées`),
      el("div", {
        style: "height:6px;background:rgba(255,255,255,.25);border-radius:99px;margin-top:8px;overflow:hidden;"
      }, [
        el("div", {
          style: `width:${pct}%;height:100%;background:#fff;border-radius:99px;transition:width .4s ease;`
        })
      ])
    ])
  ]);
}

function sectionHeader(title, badge) {
  const children = [el("span", { class: "section-title" }, title)];
  if (badge) children.push(el("span", { class: "badge badge--primary" }, badge));
  return el("div", { class: "section-header", style: "margin-top:var(--sp-xl);" }, children);
}

function taskList(tasks) {
  const wrap = el("div", { class: "flex flex-col gap-sm" });
  tasks.forEach((t) => wrap.appendChild(taskItem(t)));
  return wrap;
}

function taskItem(task) {
  const uid = getCurrentUser()?.uid;
  const isDone = task.status === "done";
  const priorityMap = { high: "badge--red", medium: "badge--orange", low: "badge--green" };
  const priorityLabel = { high: "Haute", medium: "Moyenne", low: "Basse" };

  const item = el("div", { class: `task-item ${isDone ? "done" : ""}` }, [
    el("div", {
      class: `check ${isDone ? "checked" : ""}`,
      onclick: async (e) => {
        e.stopPropagation();
        if (task.isFacture) { toast("Le statut d'une facture se gère depuis Finances.", "info"); return; }
        if (!uid) return;
        try { await setTaskStatus(uid, task, isDone ? "todo" : "done"); }
        catch (err) { toast(`Erreur : ${err.message}`, "error"); }
      }
    }, isDone ? "✓" : ""),
    el("div", { class: "task-item__body" }, [
      el("div", { class: "task-item__title" }, task.isFacture ? `🧾 ${task.title}` : task.title),
      el("div", { class: "task-item__meta" }, [
        el("span", { class: `badge ${priorityMap[task.priority] || ""}` }, priorityLabel[task.priority] || task.priority),
        task.category ? el("span", { class: "badge" }, task.category) : null,
        task.time ? el("span", { class: "badge badge--blue" }, task.time) : null,
        task.duration ? el("span", { class: "badge" }, `${task.duration} min`) : null,
        task.routineId ? el("span", { class: "badge badge--purple" }, "🔁") : null,
        task.isFacture ? el("span", { class: "badge" }, `${task.montant} DT`) : null,
      ].filter(Boolean))
    ]),
    el("div", { class: "task-item__actions" }, [
      !task.isFacture && !isDone ? el("button", {
        class: "btn btn--icon sm", title: "Pomodoro",
        onclick: (e) => { e.stopPropagation(); startPomodoro(task); }
      }, "⏱") : null
    ].filter(Boolean))
  ]);
  item.style.borderLeftColor = task.color || "var(--primary)";

  if (task.subtasks?.length) {
    const pct = taskProgress(task);
    item.appendChild(el("div", { class: "progress", style: "margin-top:6px;" }, [
      el("div", { class: "progress__fill", style: `width:${pct}%` })
    ]));
  }

  return item;
}

function habitList(habits) {
  const wrap = el("div", { class: "flex flex-col gap-sm" });
  habits.forEach((h) => wrap.appendChild(habitItem(h)));
  return wrap;
}

function habitItem({ routine, instance, done }) {
  const uid = getCurrentUser()?.uid;
  const streak = computeStreak(routine);

  return el("div", { class: "habit-row" }, [
    el("div", {
      class: `check ${done ? "checked" : ""}`,
      onclick: async () => {
        if (!uid || !instance) return;
        try { await setTaskStatus(uid, instance, done ? "todo" : "done"); }
        catch (err) { toast(`Erreur : ${err.message}`, "error"); }
      }
    }, done ? "✓" : ""),
    el("div", { class: "habit-row__info" }, [
      el("div", { class: "habit-row__title" }, routine.title),
      el("div", { class: "flex gap-sm items-center", style: "margin-top:2px;" }, [
        routine.time ? el("span", { class: "badge badge--blue" }, routine.time) : null,
        routine.duration ? el("span", { class: "badge" }, `${routine.duration} min`) : null,
        el("span", { class: "badge badge--purple" }, routine.category || "Habitude"),
      ].filter(Boolean))
    ]),
    streak > 0 ? el("div", { class: "habit-row__streak" }, `🔥 ${streak}j`) : null
  ].filter(Boolean));
}

function computeStreak(routine) {
  const today = todayStr();
  let streak = 0;
  let d = addDays(today, -1);
  for (let i = 0; i < 90; i++) {
    if (!occursOn(routine, d)) { d = addDays(d, -1); continue; }
    const inst = latestState.tasks.find((t) => t.routineId === routine.id && t.date === d);
    if (inst?.status === "done") { streak++; d = addDays(d, -1); }
    else break;
  }
  const todayInst = latestState.tasks.find((t) => t.routineId === routine.id && t.date === today);
  if (todayInst?.status === "done") streak++;
  return streak;
}

function goalGrid(goals) {
  const grid = el("div", { class: "grid grid--2" });
  goals.forEach((g) => grid.appendChild(goalCard(g)));
  return grid;
}

function goalCard(goal) {
  const pct = goalProgress(goal);
  const remaining = goal.deadline ? diffDays(todayStr(), goal.deadline) : null;
  const stepsDone = (goal.steps || []).filter((s) => s.done).length;
  const stepsTotal = (goal.steps || []).length;

  return el("div", { class: "goal-card" }, [
    el("div", { class: "goal-card__header" }, [
      el("div", { class: "goal-card__title" }, goal.title),
      goal.deadline ? el("div", { class: "goal-card__deadline" },
        remaining >= 0 ? `${remaining}j restants` : "Échéance dépassée"
      ) : null
    ].filter(Boolean)),
    el("div", { class: "progress", style: "margin:var(--sp-sm) 0;" }, [
      el("div", { class: `progress__fill${pct >= 100 ? "" : ""}`, style: `width:${pct}%;background:${pct >= 100 ? "var(--green)" : "var(--primary)"}` })
    ]),
    el("div", { class: "flex justify-between items-center" }, [
      el("span", { class: "text-xs text-muted" }, `${pct}% · ${stepsDone}/${stepsTotal} étapes`),
      el("span", { class: `badge ${goal.priority === "high" ? "badge--red" : goal.priority === "low" ? "badge--green" : "badge--orange"}` },
        goal.priority === "high" ? "Haute" : goal.priority === "low" ? "Basse" : "Moyenne")
    ])
  ]);
}

function upcomingList(tasks) {
  const wrap = el("div", { class: "flex flex-col gap-sm" });
  tasks.forEach((t) => {
    const priorityMap = { high: "badge--red", medium: "badge--orange", low: "badge--green" };
    wrap.appendChild(el("div", {
      class: "task-item",
      style: `border-left-color:${t.color || "var(--primary)"};opacity:.85;`
    }, [
      el("div", { class: "task-item__body" }, [
        el("div", { class: "task-item__title" }, t.title),
        el("div", { class: "task-item__meta" }, [
          el("span", { class: "badge badge--blue" }, formatHuman(t.date)),
          el("span", { class: `badge ${priorityMap[t.priority] || ""}` },
            t.priority === "high" ? "Haute" : t.priority === "low" ? "Basse" : "Moyenne"),
          t.category ? el("span", { class: "badge" }, t.category) : null,
        ].filter(Boolean))
      ])
    ]));
  });
  return wrap;
}

function emptyBlock(message, icon) {
  return el("div", { class: "empty" }, [
    icon ? el("div", { class: "empty__icon" }, icon) : null,
    el("div", { class: "empty__text" }, message)
  ].filter(Boolean));
}
