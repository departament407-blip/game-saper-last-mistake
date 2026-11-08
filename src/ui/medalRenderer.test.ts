import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEDALS, MEDAL_ASSET_REGISTRY } from "../data/medals";
import { renderMedalAward, renderMedalBadge } from "./medalRenderer";
import { renderMedalStrip, renderUnlockedAwards } from "./renderHelpers";

describe("medal assets", () => {
  it("ships a self-contained SVG for every existing medal without changing the registry IDs", () => {
    expect(MEDALS.map(medal => medal.id)).toEqual([
      "no-flags-win", "training-medal", "border-medal", "forest-road-medal", "dry-line-medal",
      "sunfield-medal", "iron-square-medal", "grand-sweep-medal", "fast-small-win", "hard-survivor"
    ]);
    const emblems = new Set<string>();
    for (const medal of MEDALS) {
      const file = join(process.cwd(), "public", medal.assetPath);
      expect(existsSync(file), medal.assetPath).toBe(true);
      const svg = readFileSync(file, "utf8");
      expect(svg).toContain('viewBox="0 0 96 124"');
      expect(svg).toContain(`<title id="title">${medal.label}</title>`);
      expect(svg).toContain('<linearGradient id="metal"');
      expect(svg).toContain('<linearGradient id="ribbon"');
      expect(svg).toContain('<g id="emblem">');
      expect(svg).not.toMatch(/<script|<foreignObject|<text\b|href="(?:https?:|data:|\/)/);
      const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
      for (const reference of svg.matchAll(/(?:url\(#|href="#)([\w-]+)/g)) {
        expect(ids.has(reference[1]), `${medal.id}: missing ${reference[1]}`).toBe(true);
      }
      emblems.add(svg.slice(svg.indexOf('<g id="emblem">'), svg.indexOf("</defs>")));
      expect(MEDAL_ASSET_REGISTRY.find(item => item.medalId === medal.id)?.expectedAssetFilename).toBe(`${medal.id}.svg`);
    }
    expect(emblems.size).toBe(MEDALS.length);
    expect(new Set(MEDALS.map(medal => medal.finish))).toEqual(new Set(["bronze", "silver", "gold"]));
  });
});

describe("medal rendering", () => {
  it("gives every award a tap and keyboard disclosure with its real name and condition", () => {
    for (const medal of MEDALS) {
      const markup = renderMedalBadge(medal);
      expect(markup).toContain("<details");
      expect(markup).toContain("<summary");
      expect(markup).toContain(`aria-label="${medal.label}. ${medal.description}"`);
      expect(markup).toContain(`src="${medal.assetPath}"`);
      expect(markup).toContain(`>${medal.description}</span>`);
      expect(markup).toContain('class="medal-art__fallback"');
      expect(markup).toContain("this.parentElement.classList.add('is-missing')");
      expect(markup).not.toContain(`>${medal.icon}<`);
    }
  });

  it("marks only newly earned medals in a compact HUD strip", () => {
    const markup = renderMedalStrip(["training-medal", "hard-survivor"], "Empty", ["hard-survivor"]);
    expect(markup.match(/is-new-medal/g)).toHaveLength(1);
    expect(markup).toMatch(/is-new-medal" data-medal-id="hard-survivor"/);
    expect(markup.match(/medal-badge--compact/g)).toHaveLength(2);
  });

  it("uses award cards in the profile and debrief, handles unknown awards, and escapes metadata", () => {
    expect(renderMedalAward("not-a-medal")).toBe("");
    expect(renderMedalAward("training-medal")).toContain("is-new-medal");
    expect(renderUnlockedAwards(["training-medal"], "medal", "Empty")).toContain("medal-badge--card");
    expect(renderUnlockedAwards(["training-medal"], "medal", "Empty")).not.toContain("is-new-medal");
    const markup = renderMedalBadge({ ...MEDALS[0], label: '<Award "one">', description: "A & B" });
    expect(markup).not.toContain('<Award "one">');
    expect(markup).toContain("&lt;Award &quot;one&quot;&gt;");
    expect(markup).toContain("A &amp; B");
  });
});
