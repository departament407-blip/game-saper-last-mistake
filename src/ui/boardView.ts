import type { BoardState, Cell } from "../core/types";
import type { EventBus } from "../events/eventBus";
import type { GameEventMap } from "../events/gameEvents";
import type { RunManager } from "../run/runManager";

export interface BoardViewOptions {
  onTacticalCell?: (row: number, col: number) => void;
}

const FLAG_MARKUP = `
  <svg class="flag-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M9 27V6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M11 7h14l-4 6 4 6H11z" fill="currentColor"/>
    <path d="M7 27h9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  </svg>
`;

export class BoardView {
  private suppressCellId: string | null = null;
  private tacticalMode = false;
  private flagMode = false;
  private tacticalCellIds = new Set<string>();

  constructor(
    private readonly boardWrap: HTMLElement,
    private readonly board: HTMLElement,
    private readonly runManager: RunManager,
    bus: EventBus<GameEventMap>,
    private readonly options: BoardViewOptions = {}
  ) {
    bus.on("GAME_STARTED", ({ state }) => this.render(state));
    bus.on("CELL_REVEALED", ({ result }) => this.render(result.state));
    bus.on("FLAG_TOGGLED", ({ result }) => this.render(result.state));
    bus.on("CHORD_SUCCEEDED", ({ result }) => this.render(result.state));
    bus.on("CHORD_FAILED", ({ result }) => this.render(result.state));
    bus.on("RUN_WON", ({ state }) => this.render(state));
    bus.on("RUN_LOST", ({ state }) => this.render(state));
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

  render(state: BoardState): void {
    this.boardWrap.style.setProperty("--cols", String(state.cols));
    this.board.style.setProperty("--cols", String(state.cols));
    this.board.innerHTML = "";

    state.cells.forEach((cell) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = this.getCellClass(cell, state);
      button.disabled = state.status === "won" || state.status === "lost";
      button.dataset.row = String(cell.row);
      button.dataset.col = String(cell.col);
      button.dataset.cellId = cell.id;
      button.setAttribute("aria-label", this.getCellLabel(cell, state));
      button.innerHTML = this.getCellMarkup(cell, state);

      button.addEventListener("click", (event) => {
        if (this.tacticalMode) {
          event.preventDefault();
          this.options.onTacticalCell?.(cell.row, cell.col);
          return;
        }

        if (this.suppressCellId === cell.id) {
          this.suppressCellId = null;
          return;
        }

        if (this.flagMode && state.status === "playing" && cell.state !== "revealed") {
          this.runManager.toggleFlag(cell.row, cell.col);
          return;
        }

        if (event.shiftKey) {
          this.runManager.chordReveal(cell.row, cell.col);
          return;
        }

        this.runManager.reveal(cell.row, cell.col);
      });

      button.addEventListener("dblclick", (event) => {
        event.preventDefault();
        this.runManager.chordReveal(cell.row, cell.col);
      });

      button.addEventListener("mousedown", (event) => {
        if (event.buttons !== 3) {
          return;
        }

        event.preventDefault();
        this.suppressCellId = cell.id;
        this.runManager.chordReveal(cell.row, cell.col);
        window.setTimeout(() => {
          if (this.suppressCellId === cell.id) {
            this.suppressCellId = null;
          }
        }, 250);
      });

      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();

        if (this.suppressCellId === cell.id) {
          this.suppressCellId = null;
          return;
        }

        this.runManager.toggleFlag(cell.row, cell.col);
      });

      this.board.appendChild(button);
    });
  }

  private getCellMarkup(cell: Cell, state: BoardState): string {
    if (cell.state === "flagged") {
      return FLAG_MARKUP;
    }

    if (state.status === "lost" && cell.hasMine) {
      return `<span class="mine-mark">*</span>`;
    }

    if (cell.state !== "revealed") {
      return "";
    }

    if (cell.hasMine) {
      return `<span class="mine-mark">*</span>`;
    }

    return cell.adjacentMines > 0 ? String(cell.adjacentMines) : "";
  }

  private getCellClass(cell: Cell, state: BoardState): string {
    const classes = ["cell"];

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
    }

    if (cell.state === "revealed" && cell.adjacentMines > 0 && !cell.hasMine) {
      classes.push(`n${cell.adjacentMines}`);
    }

    if (state.status === "lost" && cell.hasMine) {
      classes.push("is-mine");
    }

    if (state.explodedCellId === cell.id) {
      classes.push("is-exploded");
    }

    const blastDistance = this.getBlastDistance(cell, state);

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
    if (cell.state === "flagged") {
      return `Флаг на ${cell.row + 1}, ${cell.col + 1}`;
    }

    if (state.status === "lost" && cell.hasMine) {
      return `Мина ${cell.row + 1}, ${cell.col + 1}`;
    }

    if (cell.state === "revealed") {
      return cell.adjacentMines > 0 ? `Рядом мин: ${cell.adjacentMines}` : "Пусто";
    }

    return `Клетка ${cell.row + 1}, ${cell.col + 1}`;
  }
}
