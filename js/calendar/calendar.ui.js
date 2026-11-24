import { el, clear } from "../utils/dom.js";
import { subscribe } from "../store.js";
import {
  todayStr, parseDateStr, toDateStr, addDays, startOfWeek, startOfMonth, endOfMonth,
  daysInRange, monthLabel, formatHuman, weekdayLabel, dayOfWeek
} from "../utils/date.js";
import { occursOn } from "../routines/routines.generator.js";

let latestState = { tasks: [], routines: [], goals: [] };
let view = "month";
let anchor = todayStr();
let selectedDay = null;

export function initCalendarView(container) {
  subscribe((state) => { latestState = state; render(container); });
}

function eventsForDay(dateStr) {
  const events = [];
  (latestState.tasks || []).forEach(t => {
    if (t.date === dateStr) events.push({ type: "task", color: t.color || "#3d72d8", label: t.title, time: t.time, done: t.status === "done" });
  });
  (latestState.routines || []).forEach(r => {
    if (occursOn(r, dateStr)) {
      const inst = (latestState.tasks || []).find(t => t.routineId === r.id && t.date === dateStr);
      events.push({ type: "routine", color: r.color, label: "🔁 " + r.title, time: r.time, done: inst?.status === "done" });
    }
  });
  (latestState.goals || []).forEach(g => {
    if (g.deadline === dateStr) events.push({ type: "goal", color: "#8a5cf6", label: "🎯 " + g.title, time: null });
  });
  events.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  return events;
}

function render(container) {
  clear(container);

  const header = el("div", { class: "view-header" }, [
    el("h1", {}, "Calendrier"),
    el("div", { class: "flex gap-sm items-center" }, [
      el("div", { class: "chip-bar" }, [
        chipBtn("Mois", "month"), chipBtn("Sem", "week"), chipBtn("Jour", "day")
      ]),
      el("button", { class: "btn btn--ghost btn--sm", onclick: () => { anchor = todayStr(); selectedDay = null; render(container); } }, "Aujourd'hui")
    ])
  ]);
  container.appendChild(header);

  const nav = el("div", { class: "flex items-center gap-sm mb-md" }, [
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { shiftAnchor(-1); render(container); } }, "←"),
    el("div", { style: "font-weight:700;font-size:.95rem;" }, navLabel()),
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { shiftAnchor(1); render(container); } }, "→")
  ]);
  container.appendChild(nav);

  if (view === "month") container.appendChild(renderMonth(container));
  else if (view === "week") container.appendChild(renderWeek(container));
  else container.appendChild(renderDay());

  if (selectedDay) container.appendChild(dayDetail(selectedDay));
}

function chipBtn(label, value) {
  return el("button", {
    class: `chip ${view === value ? "active" : ""}`, type: "button",
    onclick: () => { view = value; selectedDay = null; render(document.getElementById("view-calendar")); }
  }, label);
}

function shiftAnchor(dir) {
  if (view === "month") {
    const d = parseDateStr(anchor);
    d.setMonth(d.getMonth() + dir);
    anchor = toDateStr(d);
  } else if (view === "week") {
    anchor = addDays(anchor, 7 * dir);
  } else {
    anchor = addDays(anchor, dir);
  }
}

function navLabel() {
  if (view === "month") return monthLabel(anchor);
  if (view === "week") return `Semaine du ${formatHuman(startOfWeek(anchor))}`;
  return formatHuman(anchor);
}

function renderMonth(container) {
  const from = startOfWeek(startOfMonth(anchor));
  const lastDay = endOfMonth(anchor);
  const to = addDays(startOfWeek(lastDay), 6);
  const days = daysInRange(from, to);
  const currentMonth = anchor.slice(0, 7);
  const today = todayStr();

  const wrap = el("div", {});

  const dayLabels = el("div", { class: "cal-grid" },
    ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(l =>
      el("div", { class: "cal-day-label" }, l)
    )
  );
  wrap.appendChild(dayLabels);

  const grid = el("div", { class: "cal-grid" });
  days.forEach(d => {
    const events = eventsForDay(d);
    const isToday = d === today;
    const otherMonth = d.slice(0, 7) !== currentMonth;
    const isSelected = d === selectedDay;

    let cls = "cal-cell";
    if (isToday) cls += " cal-cell--today";
    if (events.length > 0) cls += " cal-cell--has-tasks";
    if (otherMonth) cls += " cal-cell--other";
    if (isSelected) cls += " cal-cell--selected";

    const cell = el("div", { class: cls, onclick: () => { selectedDay = selectedDay === d ? null : d; render(container); } });
    cell.appendChild(el("div", { class: "cal-cell__num" }, String(parseDateStr(d).getDate())));

    if (events.length > 0) {
      const dots = el("div", { class: "cal-cell__dots" });
      events.slice(0, 3).forEach(ev => {
        dots.appendChild(el("div", { class: "cal-cell__dot", style: `background:${ev.color}` }));
      });
      cell.appendChild(dots);
    }

    grid.appendChild(cell);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderWeek(container) {
  const from = startOfWeek(anchor);
  const days = daysInRange(from, addDays(from, 6));
  const today = todayStr();

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(7,1fr);gap:var(--gap-sm);overflow-x:auto;" });
  days.forEach(d => {
    const events = eventsForDay(d);
    const isToday = d === today;
    const isSelected = d === selectedDay;

    const col = el("div", {
      class: `card ${isSelected ? "ring" : ""}`,
      style: isToday ? "border-color:var(--accent);" : "",
      onclick: () => { selectedDay = selectedDay === d ? null : d; render(container); }
    });

    col.appendChild(el("div", { style: "font-weight:700;font-size:.82rem;margin-bottom:6px;" },
      `${weekdayLabel(dayOfWeek(d))} ${parseDateStr(d).getDate()}`));

    if (events.length === 0) {
      col.appendChild(el("div", { class: "text-xs text-muted-2" }, "—"));
    } else {
      events.slice(0, 4).forEach(ev => col.appendChild(eventChip(ev)));
      if (events.length > 4) col.appendChild(el("div", { class: "text-xs text-muted-2" }, `+${events.length - 4}`));
    }
    grid.appendChild(col);
  });

  return grid;
}

function renderDay() {
  const events = eventsForDay(anchor);
  selectedDay = anchor;

  if (events.length === 0) {
    return el("div", { class: "empty" }, [
      el("div", { class: "empty__icon" }, "📅"),
      el("div", { class: "empty__text" }, "Rien de prévu ce jour.")
    ]);
  }

  const list = el("div", { class: "flex flex-col gap-xs" });
  events.forEach(ev => list.appendChild(taskItem(ev)));
  return list;
}

function dayDetail(dateStr) {
  const events = eventsForDay(dateStr);
  const section = el("div", { class: "mt-md" });

  section.appendChild(el("div", { class: "section-header" }, [
    el("h2", {}, formatHuman(dateStr)),
    el("span", { class: "badge" }, `${events.length} événement${events.length > 1 ? "s" : ""}`)
  ]));

  if (events.length === 0) {
    section.appendChild(el("div", { class: "text-sm text-muted-2", style: "padding:12px 0;" }, "Aucun événement ce jour."));
  } else {
    const list = el("div", { class: "flex flex-col gap-xs" });
    events.forEach(ev => list.appendChild(taskItem(ev)));
    section.appendChild(list);
  }
  return section;
}

function taskItem(ev) {
  return el("div", { class: "task-item", style: ev.done ? "opacity:.55;" : "" }, [
    el("div", { class: "task-item__dot", style: `background:${ev.color}` }),
    el("div", { class: "task-item__body" }, [
      el("div", { class: "task-item__title", style: ev.done ? "text-decoration:line-through;" : "" }, ev.label),
      ev.time ? el("div", { class: "task-item__meta" }, ev.time) : null
    ].filter(Boolean)),
    el("span", { class: `badge badge--${ev.type === "task" ? "blue" : ev.type === "routine" ? "green" : "purple"}` }, ev.type === "task" ? "Tâche" : ev.type === "routine" ? "Habitude" : "Objectif")
  ]);
}

function eventChip(ev) {
  return el("div", {
    style: `font-size:.75rem;padding:2px 6px;border-radius:4px;margin-bottom:2px;background:${ev.color}18;color:${ev.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${ev.done ? "text-decoration:line-through;opacity:.6;" : ""}`
  }, (ev.time ? ev.time + " " : "") + ev.label);
}
