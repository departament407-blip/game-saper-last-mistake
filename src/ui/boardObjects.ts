import type { PostBlastCellKind } from "./postBlastFlags";

const FLAG_SHAPE = `
  <g class="flag-mark__staff">
    <path class="flag-mark__pole" d="M9 27V5"/>
    <path class="flag-mark__cloth" d="M10 6h15l-4 6 4 6H10z"/>
  </g>
  <path class="flag-mark__base" d="M6 27h11"/>`;

export const FLAG_MARKUP = `<svg class="flag-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${FLAG_SHAPE}</svg>`;

export function renderMine(exploded = false): string {
  return `<svg class="mine-object ${exploded ? "mine-object--exploded" : ""}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path class="mine-object__spikes" d="M16 2v5m0 18v5M2 16h5m18 0h5M6 6l4 4m12 12 4 4M6 26l4-4M22 10l4-4"/>
    <circle class="mine-object__body" cx="16" cy="17" r="10"/>
    <path class="mine-object__shine" d="M9 16a7 7 0 0 1 9-6"/>
    <rect class="mine-object__fuse" x="12" y="5" width="8" height="7" rx="2"/>
    <circle class="mine-object__rivet" cx="11" cy="21" r="1.2"/>
    <circle class="mine-object__rivet" cx="21" cy="21" r="1.2"/>
    ${exploded ? '<path class="mine-object__crack" d="m18 11-5 6 6 1-5 8"/><circle class="mine-object__blast" cx="16" cy="16" r="14"/>' : ""}
  </svg>`;
}

export function renderPostBlastObject(kind: PostBlastCellKind): string {
  if (kind === "epicenter" || kind === "unflagged-mine") return renderMine(kind === "epicenter");
  if (kind === "correct-flag") {
    return `<span class="flag-aftermath">${FLAG_MARKUP}<svg class="flag-confirmed" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7"/><path d="m4 8 3 3 5-6"/></svg></span>`;
  }
  return `<span class="flag-aftermath">
    <svg class="flag-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      ${FLAG_SHAPE}
      <g class="flag-ash"><circle cx="16" cy="14" r="1"/><circle cx="24" cy="18" r="1.2"/><circle cx="20" cy="10" r=".8"/></g>
      <path class="flag-smoke" d="M18 17C3 8 25 9 13 1c17 3 6 10 13 13z"/>
      <path class="flag-flame" d="M11 23C5 15 15 15 12 8c7 4 2 7 7 8 0-6 7-7 4-14 13 12-1 14 3 20-3 8-12 8-15 1z"/>
      <path class="flag-flame flag-flame--core" d="M14 24c-3-5 5-5 3-11 9 6 0 7 5 11-2 4-6 4-8 0z"/>
    </svg>
    <svg class="flag-error" viewBox="0 0 20 20" aria-hidden="true"><path class="flag-error__outline" d="m5 5 10 10M15 5 5 15"/><path d="m5 5 10 10M15 5 5 15"/></svg>
  </span>`;
}
