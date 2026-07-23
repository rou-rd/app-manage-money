import { el, clear } from "./dom.js";

let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = el("div", { class: "modal-overlay" });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Ouvre une modale générique.
 * @param {string} title
 * @param {HTMLElement} bodyNode
 * @param {{label:string, onClick:Function, variant?:string}[]} actions
 */
export function openModal(title, bodyNode, actions = []) {
  const root = ensureOverlay();
  clear(root);

  const modal = el("div", { class: "modal" });
  const header = el("div", { class: "modal__header" }, [
    el("h2", {}, title),
    el("button", { class: "btn btn--icon btn--ghost", onclick: closeModal, "aria-label": "Fermer" }, "✕")
  ]);
  const footer = el("div", { class: "modal__footer" },
    actions.map((a) => el("button", {
      class: `btn ${a.variant === "primary" ? "btn--primary" : a.variant === "danger" ? "btn--danger" : "btn--ghost"}`,
      onclick: a.onClick
    }, a.label))
  );

  modal.appendChild(header);
  modal.appendChild(bodyNode);
  modal.appendChild(footer);
  root.appendChild(modal);
  root.classList.add("open");
}

export function closeModal() {
  if (overlay) overlay.classList.remove("open");
}
