import { CHARACTERS } from "../data/characters";
import type { Character } from "../data/characters";
import type { OperativeStatus } from "../progression/campaignTypes";

const FALLEN_OVERLAY_ASSET = "/assets/ui/bold_red_x_overlay.png";

export function resolvePortraitSources(character: Character, status: OperativeStatus = "active"): string[] {
  const activeSources = buildSourceCandidates(character.portraitAsset);

  if (status === "active") {
    return activeSources;
  }

  return unique([
    ...buildSourceCandidates(character.fallenPortraitAsset),
    ...activeSources
  ]);
}

export function renderPortraitMarkup(character: Character, status: OperativeStatus = "active"): string {
  const sources = resolvePortraitSources(character, status);
  const overlay = status === "fallen"
    ? `<img class="portrait-x-overlay" data-overlay-asset alt="" src="${FALLEN_OVERLAY_ASSET}">`
    : "";

  return `
    <img
      class="portrait-image"
      data-portrait-asset
      data-source-index="0"
      data-sources="${sources.join("|")}"
      alt="${character.name}"
      src="${sources[0] ?? ""}"
    >
    <span class="portrait-fallback" aria-hidden="true">${character.portraitSvg}</span>
    ${overlay}
  `;
}

export function mountPortrait(container: HTMLElement, character: Character, status: OperativeStatus = "active"): void {
  CHARACTERS.forEach((candidate) => container.classList.remove(candidate.portraitClass));
  container.classList.add("portrait", character.portraitClass);
  container.classList.toggle("is-fallen", status === "fallen");
  container.dataset.mark = character.portraitMark;
  container.setAttribute("aria-label", character.name);
  container.innerHTML = renderPortraitMarkup(character, status);
  hydratePortraitFallbacks(container);
}

export function hydratePortraitFallbacks(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>("[data-portrait-asset]").forEach((image) => {
    image.addEventListener("error", () => {
      const sources = (image.dataset.sources ?? "").split("|").filter(Boolean);
      const currentIndex = Number(image.dataset.sourceIndex ?? "0");
      const nextSource = sources[currentIndex + 1];

      if (nextSource) {
        image.dataset.sourceIndex = String(currentIndex + 1);
        image.src = nextSource;
        return;
      }

      image.hidden = true;
      image.classList.add("is-missing");
    }, { once: false });
  });

  root.querySelectorAll<HTMLImageElement>("[data-overlay-asset]").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      image.classList.add("is-missing");
    }, { once: true });
  });
}

function buildSourceCandidates(assetPath: string): string[] {
  if (!assetPath) {
    return [];
  }

  const extensionMatch = assetPath.match(/\.(png|jpg|jpeg|webp|svg)$/i);

  if (!extensionMatch) {
    return [assetPath];
  }

  const extension = extensionMatch[1].toLowerCase();
  const base = assetPath.slice(0, -extensionMatch[0].length);
  const extensions = ["png", "jpg", "jpeg", "webp", "svg"];

  return unique([
    assetPath,
    ...extensions
      .filter((candidate) => candidate !== extension)
      .map((candidate) => `${base}.${candidate}`)
  ]);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
