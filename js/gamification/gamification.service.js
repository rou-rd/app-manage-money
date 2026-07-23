// Système de points/niveaux/badges — entièrement dérivé des données existantes
// (tâches, routines, objectifs). Aucune collection Firestore dédiée : recalculé à la
// volée à chaque mise à jour du store, donc toujours cohérent avec l'état réel.
import { routineAnalytics } from "../analytics/analytics.service.js";

const POINTS_TASK = 10;
const POINTS_ROUTINE_TASK = 15;
const POINTS_GOAL = 50;
const POINTS_PER_LEVEL = 150;

export const BADGES = [
  { id: "first-task", emoji: "🥇", label: "Premier pas", test: (s) => s.tasksCompleted >= 1 },
  { id: "productive-25", emoji: "⚡", label: "Productif", test: (s) => s.tasksCompleted >= 25 },
  { id: "machine-100", emoji: "🚀", label: "Machine de guerre", test: (s) => s.tasksCompleted >= 100 },
  { id: "streak-7", emoji: "🔥", label: "Discipline de fer", test: (s) => s.bestStreak >= 7 },
  { id: "streak-30", emoji: "💎", label: "Habitude ancrée", test: (s) => s.bestStreak >= 30 },
  { id: "goal-1", emoji: "🎯", label: "Objectif atteint", test: (s) => s.goalsCompleted >= 1 },
  { id: "goal-5", emoji: "🏆", label: "Visionnaire", test: (s) => s.goalsCompleted >= 5 }
];

export function computeGamificationStats(state) {
  const tasks = state.tasks || [];
  const routines = state.routines || [];
  const goals = state.goals || [];

  const doneTasks = tasks.filter((t) => t.status === "done");
  const routineTasksDone = doneTasks.filter((t) => t.routineId);
  const normalTasksDone = doneTasks.filter((t) => !t.routineId);
  const goalsCompleted = goals.filter((g) => g.status === "completed").length;

  const bestStreak = routines.reduce((max, r) => Math.max(max, routineAnalytics(r, tasks).bestStreak), 0);
  const currentBestStreak = routines.reduce((max, r) => Math.max(max, routineAnalytics(r, tasks).currentStreak), 0);

  const points = normalTasksDone.length * POINTS_TASK
    + routineTasksDone.length * POINTS_ROUTINE_TASK
    + goalsCompleted * POINTS_GOAL;

  const level = Math.floor(points / POINTS_PER_LEVEL) + 1;
  const pointsInLevel = points % POINTS_PER_LEVEL;

  const stats = { tasksCompleted: doneTasks.length, goalsCompleted, bestStreak };
  const badges = BADGES.map((b) => ({ ...b, unlocked: b.test(stats) }));

  return {
    points, level, pointsInLevel, pointsForNextLevel: POINTS_PER_LEVEL,
    currentBestStreak, bestStreak, tasksCompleted: doneTasks.length, goalsCompleted, badges
  };
}
