export const FREQUENCIES = [
  { value: "daily", label: "Quotidienne" },
  { value: "weekly", label: "Hebdomadaire" },
  { value: "monthly", label: "Mensuelle" }
];

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function newRoutineDefaults(todayWeekday = 0) {
  return {
    title: "",
    category: "Bien-être",
    frequency: "daily",
    daysOfWeek: [todayWeekday],
    dayOfMonth: 1,
    time: "08:00",
    duration: 30,
    color: "#1d9e75",
    active: true
  };
}
