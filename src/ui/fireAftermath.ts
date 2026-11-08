import type { BiomeId } from "../data/biomes";

export interface FireSource { x: number; y: number; size: number; delay: number }
const PALETTES: Record<BiomeId, [string, string, string]> = {
  forest: ["#ed4e12", "#ffe5a0", "72,64,55"],
  desert: ["#ef7825", "#fff0b8", "153,120,77"],
  sunflower: ["#ff7317", "#fff4a8", "66,59,35"],
  factory: ["#ff4b18", "#fff6d8", "54,57,62"],
  sea: ["#fb8936", "#fff2c1", "171,204,211"]
};

/** Analytic particles: bounded source count, no particle allocation or timers per frame. */
export class FireAftermath {
  draw(ctx: CanvasRenderingContext2D, sources: FireSource[], seconds: number, biome: BiomeId, intensity: number, reduced: boolean): void {
    const [edge, core, smoke] = PALETTES[biome];
    sources.forEach((source, i) => {
      const age = seconds - source.delay;
      if (age < 0) return;
      const strength = Math.min(1, age * 2) * intensity;
      const phase = reduced ? i : seconds * 8 + i * 2.4;
      const width = source.size;
      const height = width * (2.8 + Math.sin(phase) * .65);
      const sway = Math.sin(phase * .71) * width * .5;
      if (!reduced) {
        // A solid, tapered flame with an independently moving pale inner tongue.
        const gradient = ctx.createLinearGradient(source.x, source.y, source.x, source.y - height);
        gradient.addColorStop(0, edge);
        gradient.addColorStop(.5, "#ffad38");
        gradient.addColorStop(1, core);
        ctx.globalAlpha = strength * .88;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(source.x - width, source.y);
        ctx.bezierCurveTo(source.x - width * 1.1, source.y - height * .45, source.x + sway, source.y - height * .48, source.x + sway, source.y - height);
        ctx.bezierCurveTo(source.x + width * .3, source.y - height * .55, source.x + width * 1.3, source.y - height * .28, source.x + width, source.y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.moveTo(source.x - width * .38, source.y);
        ctx.quadraticCurveTo(source.x - width * .55, source.y - height * .2, source.x + sway * .3, source.y - height * .65);
        ctx.quadraticCurveTo(source.x + width * .6, source.y - height * .2, source.x + width * .38, source.y);
        ctx.fill();
      }
      // Smoke, glowing coals and flying sparks remain visible after four seconds.
      const drift = reduced ? .6 : (seconds * .32 + i * .137) % 1;
      ctx.globalAlpha = strength * (1 - drift) * .26;
      ctx.fillStyle = `rgb(${smoke})`;
      ctx.beginPath();
      ctx.arc(source.x + Math.sin(i + seconds) * width + drift * 18, source.y - height * .6 - drift * 90, width * (1 + drift * 1.8), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = strength * .85;
      ctx.fillStyle = "#ff8b24";
      ctx.fillRect(source.x - 2, source.y - 2, 4, 2);
      if (!reduced && i % 2 === 0) {
        const spark = (seconds * .7 + i * .173) % 1;
        ctx.globalAlpha = strength * (1 - spark);
        ctx.fillStyle = core;
        ctx.fillRect(source.x + Math.sin(i) * spark * 60, source.y - spark * (80 + width * 2), 1.5, 3);
      }
    });
    ctx.globalAlpha = 1;
  }
}
