import { el, clear } from "../utils/dom.js";
import { onAuthChange, getCurrentUser } from "../auth/auth.js";
import { watchFinanceState, summarizeFinance } from "./finance-reader.js";
import { toast } from "../utils/toast.js";

let root = null;
let financeState = null;
let summary = null;
let unsubFinance = null;

export function initFinanceView(container) {
  root = container;
  onAuthChange((user) => {
    if (unsubFinance) unsubFinance();
    if (user) {
      unsubFinance = watchFinanceState(user.uid, (fs) => {
        financeState = fs;
        summary = summarizeFinance(fs);
        render();
      });
    } else {
      financeState = null;
      summary = null;
      render();
    }
  });
}

function render() {
  if (!root) return;
  clear(root);

  root.appendChild(el("div", { class: "view-header" }, [
    el("h1", {}, "Finances"),
    el("a", {
      class: "btn btn--primary btn--sm",
      href: "index.html",
      target: "_blank"
    }, "Ouvrir FinTrack complet")
  ]));

  if (!summary) {
    root.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "empty__icon" }, "💰"),
      el("div", { class: "empty__text" }, "Aucune donnée financière disponible. Ouvre FinTrack pour ajouter tes comptes et transactions.")
    ]));
    return;
  }

  root.appendChild(renderOverview());
  root.appendChild(renderBudgetBar());
  root.appendChild(renderCategories());
  root.appendChild(renderAccounts());
  root.appendChild(renderInvoices());
}

function renderOverview() {
  const f = summary;
  const evoLabel = f.evolutionDepensesPct !== null
    ? `${f.evolutionDepensesPct > 0 ? "+" : ""}${f.evolutionDepensesPct}% vs mois dernier`
    : "";

  return el("div", { class: "grid grid--3 mb-lg" }, [
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Solde total"),
      el("div", { class: "stat-value", style: `color:${f.soldeTotal >= 0 ? "var(--green)" : "var(--red)"};` }, fmt(f.soldeTotal)),
      el("div", { class: "stat-sub" }, `${f.nbComptes} compte(s)`)
    ]),
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Dépenses ce mois"),
      el("div", { class: "stat-value" }, fmt(f.totalDepensesMois)),
      el("div", { class: "stat-sub" }, evoLabel)
    ]),
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Budget restant"),
      el("div", {
        class: "stat-value",
        style: f.budgetRestant !== null && f.budgetRestant < 0 ? "color:var(--red);" : ""
      }, f.budgetRestant !== null ? fmt(f.budgetRestant) : "—"),
      el("div", { class: "stat-sub" }, f.budgetGlobal > 0 ? `sur ${fmt(f.budgetGlobal)}` : "Pas de budget défini")
    ])
  ]);
}

function renderBudgetBar() {
  const f = summary;
  if (!f.budgetGlobal || f.budgetGlobal <= 0) return el("div", {});

  const pct = Math.min(100, Math.round((f.totalDepensesMois / f.budgetGlobal) * 100));
  const color = pct > 90 ? "var(--red)" : pct > 70 ? "var(--orange)" : "var(--green)";

  return el("div", { class: "card mb-lg" }, [
    el("div", { class: "flex justify-between items-center mb-sm" }, [
      el("h4", {}, "Utilisation du budget"),
      el("span", { class: "text-sm", style: `color:${color};font-weight:700;` }, `${pct}%`)
    ]),
    el("div", { class: "progress" }, [
      el("div", { class: "progress__fill", style: `width:${pct}%;background:${color};` })
    ]),
    el("div", { class: "flex justify-between text-xs text-muted mt-sm" }, [
      el("span", {}, `Dépensé : ${fmt(f.totalDepensesMois)}`),
      el("span", {}, `Restant : ${fmt(f.budgetRestant)}`)
    ])
  ]);
}

function renderCategories() {
  const f = summary;
  if (!f.topCategories.length) return el("div", {});

  const max = Math.max(...f.topCategories.map((c) => c.total));
  const rows = f.topCategories.map((c) => {
    const pct = Math.round((c.total / max) * 100);
    return el("div", { class: "mb-sm" }, [
      el("div", { class: "flex justify-between text-sm mb-sm" }, [
        el("span", { style: "font-weight:600;" }, c.nom),
        el("span", { class: "text-muted" }, fmt(c.total))
      ]),
      el("div", { class: "progress" }, [
        el("div", { class: "progress__fill", style: `width:${pct}%;background:var(--blue);` })
      ])
    ]);
  });

  return el("div", { class: "card mb-lg" }, [
    el("h4", { class: "mb-md" }, "Dépenses par catégorie"),
    ...rows
  ]);
}

function renderAccounts() {
  if (!financeState?.comptes?.length) return el("div", {});

  const grid = el("div", { class: "grid grid--2 mb-lg" });
  financeState.comptes.forEach((c) => {
    const solde = computeSolde(c);
    grid.appendChild(el("div", { class: "card" }, [
      el("div", { class: "flex justify-between items-center" }, [
        el("div", {}, [
          el("div", { style: "font-weight:700;font-size:.95rem;" }, c.nom || "Compte"),
          el("div", { class: "text-xs text-muted" }, c.type || "courant")
        ]),
        el("div", {
          style: `font-size:1.1rem;font-weight:800;color:${solde >= 0 ? "var(--green)" : "var(--red)"};`
        }, fmt(solde))
      ])
    ]));
  });

  return el("div", {}, [
    el("h3", { class: "section-title mb-md" }, "Comptes"),
    grid
  ]);
}

function renderInvoices() {
  if (!financeState?.factures?.length) return el("div", {});

  const pending = financeState.factures.filter((f) => f.statut !== "payee");
  if (pending.length === 0) return el("div", {});

  const list = el("div", { class: "flex flex-col gap-sm" });
  pending.forEach((f) => {
    const overdue = f.dateEcheance && f.dateEcheance < new Date().toISOString().slice(0, 10);
    list.appendChild(el("div", { class: "task-item", style: "border-left-color:var(--orange);" }, [
      el("div", { class: "task-item__body" }, [
        el("div", { class: "task-item__title" }, `🧾 ${f.description || "Facture"}`),
        el("div", { class: "task-item__meta" }, [
          el("span", { class: `badge ${overdue ? "badge--red" : "badge--orange"}` }, overdue ? "En retard" : "En attente"),
          f.dateEcheance ? el("span", { class: "badge badge--blue" }, f.dateEcheance) : null,
          el("span", { class: "badge" }, fmt(f.montant || 0))
        ].filter(Boolean))
      ])
    ]));
  });

  return el("div", {}, [
    el("h3", { class: "section-title mb-md" }, `Factures en attente (${pending.length})`),
    list
  ]);
}

function computeSolde(compte) {
  const st = financeState;
  const depenses = (st.depenses || [])
    .filter((d) => d.compteId === compte.id)
    .reduce((s, d) => s + (Number(d.montant) || 0), 0);
  const ops = (st.operations || [])
    .filter((o) => o.compteId === compte.id && !o.factureId)
    .reduce((s, o) => s + (o.type === "credit" ? o.montant : -o.montant), 0);
  const transfers = (st.transfers || []).reduce((s, t) => {
    if (t.fromCompteId === compte.id) return s - t.montant;
    if (t.toCompteId === compte.id) return s + t.montant;
    return s;
  }, 0);
  return (compte.soldeInitial || 0) - depenses + ops + transfers;
}

function fmt(amount) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(amount || 0);
}
