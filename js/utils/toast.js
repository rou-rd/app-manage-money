// Petites notifications visuelles in-app (distinctes des notifications navigateur,
// voir js/notifications/notifications.js pour l'API Notification native).
import { el } from "./dom.js";

let container = null;

function ensureContainer() {
  if (container) return container;
  container = el("div", { class: "toast-container" });
  document.body.appendChild(container);
  return container;
}

export function toast(message, type = "info", durationMs = 3500) {
  const root = ensureContainer();
  const node = el("div", { class: `toast toast--${type}` }, message);
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add("toast--visible"));
  setTimeout(() => {
    node.classList.remove("toast--visible");
    setTimeout(() => node.remove(), 250);
  }, durationMs);
}
