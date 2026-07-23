// Utilitaires de dates — toutes les dates métier sont stockées en chaîne "YYYY-MM-DD"
// (jour local, pas de fuseau/UTC) pour rester simples à comparer/trier/indexer Firestore.

export function todayStr() {
  return toDateStr(new Date());
}

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateStr(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, days) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function isBefore(a, b) { return a < b; }
export function isToday(dateStr) { return dateStr === todayStr(); }
export function isPast(dateStr) { return dateStr < todayStr(); }

export function dayOfWeek(dateStr) {
  // 0 = Lundi ... 6 = Dimanche (convention FR)
  const jsDay = parseDateStr(dateStr).getDay(); // 0 = Dimanche
  return (jsDay + 6) % 7;
}

export function dayOfMonth(dateStr) {
  return parseDateStr(dateStr).getDate();
}

export function startOfWeek(dateStr) {
  const offset = dayOfWeek(dateStr);
  return addDays(dateStr, -offset);
}

export function startOfMonth(dateStr) {
  const d = parseDateStr(dateStr);
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(dateStr) {
  const d = parseDateStr(dateStr);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function daysInRange(fromStr, toStr) {
  const out = [];
  let cur = fromStr;
  while (cur <= toStr) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export function formatHuman(dateStr) {
  const d = parseDateStr(dateStr);
  return `${WEEKDAY_LABELS[dayOfWeek(dateStr)]} ${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

export function monthLabel(dateStr) {
  const d = parseDateStr(dateStr);
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

export function weekdayLabel(index) { return WEEKDAY_LABELS[index]; }

/** Différence en jours (b - a), a et b au format "YYYY-MM-DD". */
export function diffDays(a, b) {
  return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000);
}
