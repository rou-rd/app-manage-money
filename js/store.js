// Store mémoire partagé entre tous les modules (Tâches, Routines, Objectifs, Calendrier,
// Dashboard, Analyses, Gamification) — une seule écoute Firestore par sous-collection,
// tous les modules s'abonnent à ce store plutôt que de dupliquer des onSnapshot.
import { onAuthChange } from "./auth/auth.js";
import { watchCollection } from "./utils/firestore.js";

const state = {
  uid: null,
  ready: false,
  tasksReady: false,
  routinesReady: false,
  goalsReady: false,
  tasks: [],
  routines: [],
  goals: []
};

function recomputeReady() {
  state.ready = state.tasksReady && state.routinesReady && state.goalsReady;
}

const subscribers = new Set();
let unsubs = [];

function notify() {
  subscribers.forEach((cb) => cb(state));
}

export function subscribe(callback) {
  subscribers.add(callback);
  callback(state);
  return () => subscribers.delete(callback);
}

export function getState() {
  return state;
}

function startListening(uid) {
  stopListening();
  state.uid = uid;
  unsubs.push(watchCollection(uid, "tasks", (items) => { state.tasks = items; state.tasksReady = true; recomputeReady(); notify(); }));
  unsubs.push(watchCollection(uid, "routines", (items) => { state.routines = items; state.routinesReady = true; recomputeReady(); notify(); }));
  unsubs.push(watchCollection(uid, "goals", (items) => { state.goals = items; state.goalsReady = true; recomputeReady(); notify(); }));
}

function stopListening() {
  unsubs.forEach((u) => u && u());
  unsubs = [];
  state.uid = null;
  state.ready = false;
  state.tasksReady = false;
  state.routinesReady = false;
  state.goalsReady = false;
  state.tasks = [];
  state.routines = [];
  state.goals = [];
  notify();
}

onAuthChange((user) => {
  if (user) startListening(user.uid);
  else stopListening();
});
