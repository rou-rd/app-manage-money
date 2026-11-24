import { el, clear } from "../utils/dom.js";
import { getCurrentUser, logout } from "../auth/auth.js";
import { toggleTheme, currentTheme } from "../utils/theme.js";
import { initDataView } from "../data/data.ui.js";
import { toast } from "../utils/toast.js";

let root = null;

export function initSettingsView(container) {
  root = container;
  render();
}

function render() {
  if (!root) return;
  clear(root);

  root.appendChild(el("div", { class: "view-header" }, [el("h1", {}, "Réglages")]));

  root.appendChild(profileSection());
  root.appendChild(appearanceSection());
  root.appendChild(dataSection());
  root.appendChild(aboutSection());
  root.appendChild(dangerSection());
}

function profileSection() {
  const user = getCurrentUser();
  return el("div", { class: "card mb-md" }, [
    el("h3", { class: "mb-md" }, "Profil"),
    el("div", { class: "flex items-center gap-md" }, [
      el("img", {
        src: user?.photoURL || "",
        alt: "",
        style: "width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid var(--border);"
      }),
      el("div", {}, [
        el("div", { style: "font-weight:700;font-size:16px;" }, user?.displayName || "Utilisateur"),
        el("div", { class: "text-sm text-muted" }, user?.email || "")
      ])
    ])
  ]);
}

function appearanceSection() {
  const isDark = currentTheme() === "dark";

  const toggle = el("div", {
    style: `display:flex;align-items:center;justify-content:space-between;padding:12px 0;cursor:pointer;`,
    onclick: () => { toggleTheme(); render(); }
  }, [
    el("div", {}, [
      el("div", { style: "font-weight:600;" }, "Mode sombre"),
      el("div", { class: "text-xs text-muted" }, isDark ? "Activé" : "Désactivé")
    ]),
    el("div", {
      style: `width:44px;height:24px;border-radius:12px;position:relative;transition:background .2s;cursor:pointer;background:${isDark ? "var(--primary)" : "var(--border)"};`
    }, [
      el("div", {
        style: `width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;transition:left .2s;left:${isDark ? "23px" : "3px"};box-shadow:0 1px 3px rgba(0,0,0,.2);`
      })
    ])
  ]);

  return el("div", { class: "card mb-md" }, [
    el("h3", { class: "mb-sm" }, "Apparence"),
    toggle
  ]);
}

function dataSection() {
  const wrap = el("div", { class: "card mb-md" }, [
    el("h3", { class: "mb-md" }, "Données"),
    el("div", { class: "text-xs text-muted mb-md" }, "Importer ou exporter tes tâches, habitudes et objectifs au format CSV.")
  ]);
  const dataContainer = el("div", {});
  wrap.appendChild(dataContainer);
  setTimeout(() => initDataView(dataContainer), 0);
  return wrap;
}

function aboutSection() {
  return el("div", { class: "card mb-md" }, [
    el("h3", { class: "mb-sm" }, "À propos"),
    el("div", { class: "flex flex-col gap-sm" }, [
      el("div", { class: "flex justify-between" }, [
        el("span", { class: "text-muted" }, "Version"),
        el("span", { style: "font-weight:600;" }, "LifeHub v2.0")
      ]),
      el("div", { class: "flex justify-between" }, [
        el("span", { class: "text-muted" }, "Finance"),
        el("a", { href: "index.html", style: "color:var(--primary);font-weight:600;text-decoration:none;" }, "Ouvrir FinTrack →")
      ])
    ])
  ]);
}

function dangerSection() {
  return el("div", { class: "card", style: "border-color:var(--red);" }, [
    el("h3", { class: "mb-sm", style: "color:var(--red);" }, "Zone dangereuse"),
    el("div", { class: "text-xs text-muted mb-md" }, "Se déconnecter supprime les données locales. Tes données restent sur le cloud."),
    el("button", {
      class: "btn btn--danger",
      onclick: () => {
        if (confirm("Se déconnecter ?")) {
          logout().catch((e) => toast(e.message, "error"));
        }
      }
    }, "Se déconnecter")
  ]);
}
