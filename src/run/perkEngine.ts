import type { MinesweeperCore } from "../core/minesweeperCore";
import type { FlagResult } from "../core/types";

/** Chooses targets inside the game module, never returns an unflagged mine list to the UI. */
export class WildIntuition {
  private charge: number;
  constructor(enabled: boolean, private readonly tier: number, private readonly rng = Math.random) {
    this.charge = enabled ? 1 : 0;
  }
  get charges(): number { return this.charge; }
  activate(core: MinesweeperCore): FlagResult[] {
    const state = core.getState();
    if (!this.charge || !state.firstMoveDone || state.status !== "playing") return [];
    const candidates = state.cells.filter(cell => cell.hasMine && cell.state === "hidden");
    if (!candidates.length) return [];
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    this.charge = 0;
    return candidates.slice(0, Math.min(3, Math.max(1, this.tier)) + 1)
      .map(cell => core.toggleFlag(cell.row, cell.col));
  }
}
