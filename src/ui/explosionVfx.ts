import type { BiomeId } from "../data/biomes";
import { BLAST_TIMING } from "../run/blastTiming";
import { FireAftermath, type FireSource } from "./fireAftermath";

interface Blast { startedAt: number; epicenter: string; biome: BiomeId; protected: boolean }

/** Owns canvas, RAF and geometry; never changes the run or calls gameplay methods. */
export class ExplosionVFX {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private frame = 0;
  private framesDrawn = 0;
  private lastDraw = 0;
  private blast: Blast | null = null;
  private sources: FireSource[] = [];
  private protectedRects: DOMRect[] = [];
  private origin = { x: 0, y: 0 };
  private width = 0;
  private height = 0;
  private visible = true;
  private dirty = true;
  private readonly fire = new FireAftermath();
  private observer: ResizeObserver | null = null;
  private readonly reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(private readonly screen: HTMLElement) {
    screen.addEventListener("operation-visibility", event => {
      this.visible = (event as CustomEvent<boolean>).detail;
      if (this.visible) this.mount(); else this.unmount();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.unmount(); else if (this.visible) this.mount();
    });
    this.reduced.addEventListener("change", () => { this.unmount(); this.mount(); });
  }

  start(epicenter: string, biome: BiomeId, protectedHit: boolean): void {
    this.stop();
    this.blast = { epicenter, biome, protected: protectedHit, startedAt: performance.now() };
    this.framesDrawn = 0;
    this.mount();
  }

  stop(): void { this.unmount(); this.blast = null; }

  private mount(): void {
    if (this.canvas || !this.blast || !this.visible || document.hidden) return;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "explosion-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.screen.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.dirty = true;
    this.lastDraw = 0;
    this.observer = new ResizeObserver(() => { this.dirty = true; });
    this.observer.observe(this.screen);
    this.frame = requestAnimationFrame(this.draw);
  }

  private unmount(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.observer?.disconnect();
    this.observer = null;
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.sources = [];
    this.protectedRects = [];
  }

  private measure(): void {
    if (!this.canvas || !this.ctx || !this.blast) return;
    const screen = this.screen.getBoundingClientRect();
    const lowPower = navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
    const ratio = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : screen.width < 600 ? 1.25 : 1.5);
    this.width = screen.width;
    this.height = screen.height;
    this.canvas.width = Math.ceil(screen.width * ratio);
    this.canvas.height = Math.ceil(screen.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return new DOMRect(r.left - screen.left, r.top - screen.top, r.width, r.height);
    };
    const epicenter = this.screen.querySelector(`[data-cell-id="${this.blast.epicenter}"]`);
    if (!epicenter) return;
    const center = rect(epicenter);
    this.origin = { x: center.x + center.width / 2, y: center.y + center.height / 2 };
    const cells = [...this.screen.querySelectorAll(".cell")];
    this.protectedRects = [...this.screen.querySelectorAll(".cell.is-flagged")].map(rect);
    const mobile = screen.width < 600;
    const maxCells = lowPower ? 14 : mobile ? 18 : 32;
    const stride = Math.max(1, Math.ceil(cells.length / maxCells));
    this.sources = cells.filter((cell, i) => i % stride === 0 && !cell.classList.contains("is-flagged")).map(cell => {
      const r = rect(cell);
      const distance = Math.hypot(r.x - center.x, r.y - center.y);
      return { x: r.x + r.width * .65, y: r.y + r.height - 1, size: Math.max(7, Math.min(15, r.width * .28)), delay: Math.min(.8, distance / 550) };
    });
    const edges = this.screen.querySelectorAll('[data-role="board-wrap"], [data-role="portrait"], .hud-item');
    for (const el of edges) {
      const r = rect(el);
      const portrait = el.getAttribute("data-role") === "portrait";
      const count = portrait ? 6 : Math.max(2, Math.min(10, Math.round(r.width / 48)));
      for (let i = 0; i < count; i += 1) {
        this.sources.push({ x: r.x + (i + .5) * r.width / count, y: portrait ? r.y + r.height * (.35 + (i % 3) * .28) : r.y + r.height - 3, size: portrait ? 12 : 10, delay: .25 + i * .045 });
        if (portrait) this.sources[this.sources.length - 1].x = i % 2 ? r.right - 3 : r.x + 3;
      }
    }
    this.sources = this.sources.slice(0, lowPower ? 40 : mobile ? 52 : 72);
    this.canvas.dataset.sources = String(this.sources.length);
    this.dirty = false;
  }

  private draw = (now: number): void => {
    const { canvas, ctx, blast } = this;
    if (!canvas || !ctx || !blast) return;
    const elapsed = now - blast.startedAt;
    if (blast.protected && elapsed >= BLAST_TIMING.debrief) { this.stop(); return; }
    if (this.dirty) this.measure();
    if (now - this.lastDraw >= 1000 / 30 || this.reduced.matches) {
      this.lastDraw = now;
      ctx.clearRect(0, 0, this.width, this.height);
      if (elapsed < BLAST_TIMING.ignition && !this.reduced.matches) this.drawShockwave(elapsed);
      if (elapsed >= BLAST_TIMING.ignition) {
        ctx.save();
        // Canvas flames must not damage/readjust the flag SVGs; wrong flags have their own fire.
        ctx.beginPath(); ctx.rect(0, 0, this.width, this.height);
        for (const r of this.protectedRects) ctx.rect(r.x - 1, r.y - 1, r.width + 2, r.height + 2);
        ctx.clip("evenodd");
        const fade = blast.protected ? Math.min(1, Math.max(0, (4000 - elapsed) / 750)) : elapsed > 4000 ? .75 : 1;
        this.fire.draw(ctx, this.sources, this.reduced.matches ? 2 : (elapsed - 900) / 1000, blast.biome, fade, this.reduced.matches);
        ctx.restore();
      }
      this.framesDrawn += 1;
      canvas.dataset.frames = String(this.framesDrawn);
      canvas.dataset.phase = elapsed < 900 ? "shockwave" : elapsed < 2500 ? "ignition" : elapsed < 4000 ? "burning" : "aftermath";
    }
    // Reduced motion still draws a static ember state at 900 ms, then sleeps.
    if (!this.reduced.matches || elapsed < 950) this.frame = requestAnimationFrame(this.draw);
  };

  private drawShockwave(elapsed: number): void {
    const ctx = this.ctx!;
    const { x, y } = this.origin;
    const progress = elapsed / 900;
    const radius = 8 + progress * Math.max(280, this.width * .7);
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = "#ffe9a7"; ctx.lineWidth = 8 * (1 - progress) + 1;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    if (elapsed < 240) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 100 + elapsed * .3);
      glow.addColorStop(0, "#ffffff"); glow.addColorStop(.3, "#ffe99b"); glow.addColorStop(.65, "#f96a24"); glow.addColorStop(1, "#f96a2400");
      ctx.fillStyle = glow; ctx.fillRect(x - 180, y - 180, 360, 360);
    }
    ctx.globalAlpha = 1;
  }
}
