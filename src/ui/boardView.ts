import type { BoardState, Cell } from "../core/types";
import type { EventBus } from "../events/eventBus";
import type { GameEventMap } from "../events/gameEvents";
import type { RunManager } from "../run/runManager";
import { FLAG_MARKUP, renderMine, renderPostBlastObject } from "./boardObjects";
import { BLAST_TIMING, type PostBlastFlags } from "./postBlastFlags";
import { t } from "../localization/i18n";
import { BoardInputController } from "./boardInputController";
import "./boardInput.css";

export interface BoardViewOptions {
  onTacticalCell?: (row: number, col: number) => void;
}

export class BoardView {
  private readonly input: BoardInputController;
  private tacticalMode = false;
  private flagMode = false;
  private tacticalCellIds = new Set<string>();

  constructor(
    private readonly boardWrap: HTMLElement,
    private readonly board: HTMLElement,
    private readonly runManager: RunManager,
    bus: EventBus<GameEventMap>,
    private readonly postBlastFlags: PostBlastFlags,
    private readonly options: BoardViewOptions = {}
  ) {
    this.input = new BoardInputController(board, {
      getState: () => this.runManager.getState(),
      isLocked: () => {
        const status = this.runManager.getState().status;
        return this.runManager.isInputLocked() || (status !== "idle" && status !== "playing");
      },
      getMode: () => this.tacticalMode ? "tactical" : this.flagMode ? "flag" : "reveal",
      onAction: (action, cell) => {
        if (action === "tactical") this.options.onTacticalCell?.(cell.row, cell.col);
        else if (action === "flag") this.runManager.toggleFlag(cell.row, cell.col);
        else if (action === "chord") this.runManager.chordReveal(cell.row, cell.col);
        else this.runManager.reveal(cell.row, cell.col);
      }
    });
    bus.on("GAME_STARTED", ({ state }) => {
      this.clearAftermath();
      this.render(state);
    });
    bus.on("GAME_RESET", () => this.clearAftermath());
    bus.on("CELL_REVEALED", ({ result }) => this.render(result.state));
    bus.on("FLAG_TOGGLED", ({ result }) => this.render(result.state));
    bus.on("ACTIVE_PERK_USED", ({ cellIds }) => {
      const flagged = new Set(cellIds);
      this.board.querySelectorAll<HTMLElement>(".cell.is-flagged").forEach((cell) => {
        if (flagged.has(cell.dataset.cellId!)) cell.classList.add("is-auto-flagged");
      });
    });
    bus.on("CHORD_SUCCEEDED", ({ result }) => this.render(result.state));
    bus.on("CHORD_FAILED", ({ result }) => this.render(result.state));
    bus.on("RUN_WON", ({ state }) => this.render(state));
    bus.on("MINE_TRIGGERED", ({ state }) => this.render(state));
    bus.on("BLAST_RECOVERED", ({ state }) => this.render(state));
    bus.on("RUN_LOST", ({ state }) => {
      this.postBlastFlags.start(state);
      this.render(state);
    });
  }

  setTacticalMode(enabled: boolean): void {
    this.tacticalMode = enabled;
    this.render(this.runManager.getState());
  }

  setFlagMode(enabled: boolean): void {
    this.flagMode = enabled;

    if (this.runManager.hasActiveGame()) {
      this.render(this.runManager.getState());
    }
  }

  setTacticalCells(cellIds: string[]): void {
    this.tacticalCellIds = new Set(cellIds);
    this.render(this.runManager.getState());
  }

  clearTacticalCells(): void {
    this.tacticalMode = false;
    this.tacticalCellIds.clear();
  }

  clearAftermath(): void {
    this.input.cancel();
    if (this.postBlastFlags.getStatistics()) this.board.replaceChildren();
    this.postBlastFlags.clear();
    this.board.style.removeProperty("--flag-ignition-delay");
    this.board.style.removeProperty("--flag-settle-delay");
  }

  render(state: BoardState): void {
    this.input.cancel();
    this.boardWrap.style.setProperty("--cols", String(state.cols));
    this.board.style.setProperty("--cols", String(state.cols));
    this.boardWrap.dataset.boardCols = String(state.cols);
    this.boardWrap.dataset.boardRows = String(state.rows);
    this.board.innerHTML = "";
    if (this.postBlastFlags.getStatistics()) {
      const elapsed = this.postBlastFlags.getElapsedMs();
      this.board.style.setProperty("--flag-ignition-delay", `${BLAST_TIMING.ignition - elapsed}ms`);
      this.board.style.setProperty("--flag-settle-delay", `${BLAST_TIMING.settling - elapsed}ms`);
    }

    state.cells.forEach((cell) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = this.getCellClass(cell, state);
      button.disabled = this.runManager.isInputLocked() || (state.status !== "idle" && state.status !== "playing");
      button.dataset.row = String(cell.row);
      button.dataset.col = String(cell.col);
      button.dataset.cellId = cell.id;
      button.setAttribute("aria-label", this.getCellLabel(cell, state));
      button.innerHTML = this.getCellMarkup(cell, state);

      this.board.appendChild(button);
    });
  }

  private getCellMarkup(cell: Cell, state: BoardState): string {
    const kind = state.status === "lost" ? this.postBlastFlags.getCellKind(cell.id) : undefined;
    if (kind) return renderPostBlastObject(kind);
    if (cell.state === "flagged") {
      return FLAG_MARKUP;
    }

    if (cell.state !== "revealed") {
      return "";
    }

    if (cell.hasMine) {
      return renderMine(true);
    }

    return cell.adjacentMines > 0 ? String(cell.adjacentMines) : "";
  }

  private getCellClass(cell: Cell, state: BoardState): string {
    const classes = ["cell"];
    const kind = state.status === "lost" ? this.postBlastFlags.getCellKind(cell.id) : undefined;
    if (kind) classes.push(`is-${kind}`);

    if (cell.state === "flagged") {
      classes.push("is-flagged");
    }

    if (this.tacticalMode && state.status === "playing") {
      classes.push("is-tactical-target");
    }

    if (this.flagMode && state.status === "playing" && cell.state !== "revealed") {
      classes.push("is-flag-target");
    }

    if (this.tacticalCellIds.has(cell.id)) {
      classes.push("is-tactical-marked");
    }

    if (cell.state === "revealed") {
      classes.push("is-revealed");
      if (cell.hasMine && state.status !== "lost") classes.push("is-local-crater");
    }

    if (cell.state === "revealed" && cell.adjacentMines > 0 && !cell.hasMine) {
      classes.push(`n${cell.adjacentMines}`);
    }

    if (kind === "unflagged-mine" || kind === "epicenter") {
      classes.push("is-mine");
    }

    if (kind === "epicenter") {
      classes.push("is-exploded");
    }

    const blastDistance = kind === "correct-flag" ? null : this.getBlastDistance(cell, state);

    if (blastDistance !== null && blastDistance <= 1.5 && state.explodedCellId !== cell.id) {
      classes.push("is-scorched-near");
    } else if (blastDistance !== null && blastDistance <= 3) {
      classes.push("is-scorched-mid");
    } else if (blastDistance !== null && blastDistance <= 5) {
      classes.push("is-scorched-far");
    }

    return classes.join(" ");
  }

  private getBlastDistance(cell: Cell, state: BoardState): number | null {
    if (state.status !== "lost" || !state.explodedCellId) {
      return null;
    }

    const explodedCell = state.cells.find((candidate) => candidate.id === state.explodedCellId);

    if (!explodedCell) {
      return null;
    }

    const rowDistance = cell.row - explodedCell.row;
    const colDistance = cell.col - explodedCell.col;
    return Math.sqrt(rowDistance * rowDistance + colDistance * colDistance);
  }

  private getCellLabel(cell: Cell, state: BoardState): string {
    const kind = state.status === "lost" ? this.postBlastFlags.getCellKind(cell.id) : undefined;
    if (kind) return t(`aftermath.${kind}`, { row: cell.row + 1, col: cell.col + 1 });
    if (cell.state === "flagged") {
      return `Флаг на ${cell.row + 1}, ${cell.col + 1}`;
    }

    if (cell.state === "revealed") {
      if (cell.hasMine) return t("aftermath.epicenter", { row: cell.row + 1, col: cell.col + 1 });
      return cell.adjacentMines > 0 ? `Рядом мин: ${cell.adjacentMines}` : "Пусто";
    }

    return `Клетка ${cell.row + 1}, ${cell.col + 1}`;
  }
}
