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
let rootContainer = null;

export function initCalendarView(container) {
  rootContainer = container;
  subscribe((state) => { latestState = state; render(container); });
}

function eventsForDay(dateStr) {
  const events = [];
  latestState.tasks.forEach((t) => {
    if (t.date === dateStr) events.push({ type: "task", color: t.color, label: t.title, time: t.time, done: t.status === "done" });
  });
  latestState.routines.forEach((r) => {
    if (occursOn(r, dateStr)) events.push({ type: "routine", color: r.color, label: "🔁 " + r.title, time: r.time });
  });
  latestState.goals.forEach((g) => {
    if (g.deadline === dateStr) events.push({ type: "goal", color: "#8a5cf6", label: "🎯 " + g.title, time: null });
  });
  events.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  return events;
}

function render(container) {
  clear(container);
  container.appendChild(el("div", { class: "topbar" }, [
    el("h1", {}, "Calendrier"),
    el("div", { class: "actions" }, [
      viewBtn("Jour", "day"), viewBtn("Semaine", "week"), viewBtn("Mois", "month"),
      el("button", { class: "btn btn--ghost btn--sm", onclick: () => { anchor = todayStr(); render(container); } }, "Aujourd'hui")
    ])
  ]));

  const nav = el("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:14px;" }, [
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { shiftAnchor(-1); render(container); } }, "←"),
    el("div", { style: "font-weight:800;font-size:15px;" }, navLabel()),
    el("button", { class: "btn btn--sm btn--ghost", onclick: () => { shiftAnchor(1); render(container); } }, "→")
  ]);
  container.appendChild(nav);

  if (view === "month") container.appendChild(renderMonth());
  else if (view === "week") container.appendChild(renderWeek());
  else container.appendChild(renderDay());
}

function viewBtn(label, value) {
  return el("button", { class: `btn btn--sm ${view === value ? "btn--primary" : "btn--ghost"}`, onclick: () => { view = value; render(rootContainer); } }, label);
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

function renderMonth() {
  const from = startOfWeek(startOfMonth(anchor));
  const lastDay = endOfMonth(anchor);
  const to = addDays(startOfWeek(lastDay), 6);
  const days = daysInRange(from, to);
  const currentMonth = anchor.slice(0, 7);

  const header = el("div", { class: "calendar-grid", style: "margin-bottom:6px;" },
    ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((l) => el("div", { style: "font-size:11px;font-weight:800;color:var(--muted);text-align:center;" }, l)));

  const grid = el("div", { class: "calendar-grid" });
  days.forEach((d) => {
    const events = eventsForDay(d);
    const cell = el("div", { class: `calendar-day ${d === todayStr() ? "today" : ""} ${d.slice(0, 7) !== currentMonth ? "other-month" : ""}` });
    cell.appendChild(el("div", { class: "calendar-day__num" }, String(parseDateStr(d).getDate())));
    events.slice(0, 3).forEach((ev) => cell.appendChild(eventChip(ev)));
    if (events.length > 3) cell.appendChild(el("div", { style: "font-size:10px;color:var(--muted2);" }, `+${events.length - 3} de plus`));
    grid.appendChild(cell);
  });

  const wrap = el("div", {});
  wrap.append(header, grid);
  return wrap;
}

function renderWeek() {
  const from = startOfWeek(anchor);
  const days = daysInRange(from, addDays(from, 6));
  const grid = el("div", { class: "grid grid--4" }, days.map((d) => {
    const events = eventsForDay(d);
    const col = el("div", { class: `card card--pad-sm ${d === todayStr() ? "" : ""}`, style: d === todayStr() ? "border-color:var(--blue);" : "" });
    col.appendChild(el("div", { style: "font-weight:800;font-size:12.5px;margin-bottom:8px;" }, `${weekdayLabel(dayOfWeek(d))} ${parseDateStr(d).getDate()}`));
    if (events.length === 0) col.appendChild(el("div", { style: "font-size:11.5px;color:var(--muted2);" }, "—"));
    events.forEach((ev) => col.appendChild(eventChip(ev, true)));
    return col;
  }));
  grid.style.gridTemplateColumns = "repeat(7, 1fr)";
  return grid;
}

function renderDay() {
  const events = eventsForDay(anchor);
  const card = el("div", { class: "card" });
  if (events.length === 0) {
    card.appendChild(el("div", { class: "empty-state" }, [el("div", { class: "icon" }, "📅"), el("div", {}, "Rien de prévu ce jour.")]));
  } else {
    events.forEach((ev) => {
      card.appendChild(el("div", { style: "display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);" }, [
        el("div", { style: `width:8px;height:8px;border-radius:50%;background:${ev.color};flex-shrink:0;` }),
        el("div", { style: "font-weight:700;font-size:13px;width:52px;color:var(--muted);" }, ev.time || ""),
        el("div", { style: "flex:1;" }, ev.label)
      ]));
    });
  }
  return card;
}

function eventChip(ev, block = false) {
  const chip = el("div", { class: "calendar-event", style: `background:${ev.color}22;color:${ev.color};${ev.done ? "text-decoration:line-through;opacity:.6;" : ""}` },
    (ev.time ? ev.time + " " : "") + ev.label);
  if (block) chip.style.marginBottom = "4px";
  return chip;
}
