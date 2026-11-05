import type { BoardState } from "../core/types";

export const BLAST_TIMING = Object.freeze({ ignition: 900, settling: 2500, debrief: 4000 });
export type PostBlastCellKind = "correct-flag" | "wrong-flag" | "unflagged-mine" | "epicenter";
export type BlastPhase = "shockwave" | "burning" | "settling" | "aftermath";

export interface FlagStatistics {
  readonly correctFlags: number;
  readonly wrongFlags: number;
  readonly unflaggedMines: number;
}

export interface PostBlastSnapshot {
  readonly cells: Readonly<Record<string, PostBlastCellKind>>;
  readonly statistics: FlagStatistics;
}

/** Presentation-only copy. Call after RUN_LOST, never while an operation is active. */
export function classifyPostBlastFlags(state: BoardState): PostBlastSnapshot | null {
  if (state.status !== "lost" || !state.explodedCellId) return null;

  const cells: Record<string, PostBlastCellKind> = {};
  let correctFlags = 0;
  let wrongFlags = 0;
  let unflaggedMines = 0;

  for (const cell of state.cells) {
    if (cell.state === "blocked") continue;
    if (cell.state === "flagged") {
      cells[cell.id] = cell.hasMine ? "correct-flag" : "wrong-flag";
      if (cell.hasMine) correctFlags += 1;
      else wrongFlags += 1;
    } else if (cell.hasMine) {
      unflaggedMines += 1; // Includes the detonated mine.
      cells[cell.id] = "unflagged-mine";
    }
    if (cell.id === state.explodedCellId) cells[cell.id] = "epicenter";
  }

  return Object.freeze({
    cells: Object.freeze(cells),
    statistics: Object.freeze({ correctFlags, wrongFlags, unflaggedMines })
  });
}

/** Owns no game state, timers or animation callbacks. CSS catches up after any re-render. */
export class PostBlastFlags {
  private snapshot: PostBlastSnapshot | null = null;
  private startedAt = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(state: BoardState): void {
    if (this.snapshot) return;
    this.snapshot = classifyPostBlastFlags(state);
    if (this.snapshot) this.startedAt = this.now();
  }

  getCellKind(cellId: string): PostBlastCellKind | undefined {
    return this.snapshot?.cells[cellId];
  }

  getStatistics(): FlagStatistics | null {
    return this.snapshot?.statistics ?? null;
  }

  getElapsedMs(): number {
    return this.snapshot ? Math.max(0, this.now() - this.startedAt) : 0;
  }

  getPhase(): BlastPhase | null {
    if (!this.snapshot) return null;
    const elapsed = this.getElapsedMs();
    if (elapsed < BLAST_TIMING.ignition) return "shockwave";
    if (elapsed < BLAST_TIMING.settling) return "burning";
    if (elapsed < BLAST_TIMING.debrief) return "settling";
    return "aftermath";
  }

  clear(): void {
    this.snapshot = null;
    this.startedAt = 0;
  }
}
