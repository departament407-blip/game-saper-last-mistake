import { MEDALS, type Medal } from "../data/medals";

export interface MedalRenderOptions {
  isNew?: boolean;
  variant?: "compact" | "card";
}

// Intentionally geometric, so a missing asset never falls back to a Roman numeral.
const FALLBACK = `<svg class="medal-art__fallback" viewBox="0 0 96 120" aria-hidden="true" focusable="false">
  <path fill="#36545b" stroke="#d8d8cc" stroke-width="3" d="M26 5h44v32L48 51 26 37z"/>
  <path fill="#bb9d61" stroke="#fff1bd" stroke-width="3" d="m48 43 8 18 20 3-14 14 3 20-17-9-17 9 3-20-14-14 20-3z"/>
  <circle cx="48" cy="74" r="10" fill="#2c3b3d" stroke="#f6e8b0" stroke-width="2"/>
</svg>`;

export function renderMedalBadge(medal: Medal, options: MedalRenderOptions = {}): string {
  const isCard = options.variant === "card";
  const label = escapeHtml(medal.label);
  const condition = escapeHtml(medal.description);
  return `<details class="medal-badge medal-badge--${isCard ? "card" : "compact"} medal-badge--${medal.finish}${options.isNew ? " is-new-medal" : ""}" data-medal-id="${escapeHtml(medal.id)}">
    <summary class="medal-badge__trigger" aria-label="${label}. ${condition}" title="${label}: ${condition}">
      <span class="medal-art">
        ${FALLBACK}
        <img class="medal-art__image" src="${escapeHtml(medal.assetPath)}" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.parentElement.classList.add('is-missing')">
        ${options.isNew ? '<span class="medal-badge__new" aria-label="Новая награда">✦</span>' : ""}
      </span>
      ${isCard ? `<span class="medal-badge__caption"><strong>${label}</strong><small>${condition}</small></span>` : ""}
      <span class="medal-badge__info" aria-hidden="true"><strong>${label}</strong><span>${condition}</span></span>
    </summary>
  </details>`;
}

export function renderMedalAward(medalId: string, isNew = true): string {
  const medal = MEDALS.find(item => item.id === medalId);
  return medal ? renderMedalBadge(medal, { variant: "card", isNew }) : "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
}
