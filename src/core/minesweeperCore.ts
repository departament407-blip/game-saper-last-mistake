import { cellId, createRectangleMask } from "./geometryMask";
import type {
  BoardState,
  Cell,
  ChordResult,
  Coordinate,
  Difficulty,
  FlagResult,
  GameStatus,
  RevealResult
} from "./types";

type RandomSource = () => number;

export interface MinesweeperCoreOptions {
  rng?: RandomSource;
  presetMines?: Coordinate[];
}

export class MinesweeperCore {
  private readonly rows: number;
  private readonly cols: number;
  private readonly mines: number;
  private readonly rng: RandomSource;
  private readonly activeCellIds: Set<string>;
  private cells: Cell[];
  private flagsPlaced = 0;
  private revealedSafeCells = 0;
  private status: GameStatus = "idle";
  private firstMoveDone = false;
  private explodedCellId: string | null = null;

  constructor(difficulty: Difficulty, options: MinesweeperCoreOptions = {}) {
    this.rows = difficulty.rows;
    this.cols = difficulty.cols;
    this.mines = difficulty.mines;
    this.rng = options.rng ?? Math.random;
    const mask = createRectangleMask(this.rows, this.cols);
    this.activeCellIds = new Set(mask.activeCellIds);
    this.cells = this.createEmptyCells();

    if (options.presetMines) {
      this.applyPresetMines(options.presetMines);
      this.firstMoveDone = true;
    }
  }

  getState(): BoardState {
    const geometryMask = createRectangleMask(this.rows, this.cols);

    return {
      rows: this.rows,
      cols: this.cols,
      mines: this.mines,
      flagsPlaced: this.flagsPlaced,
      revealedSafeCells: this.revealedSafeCells,
      totalSafeCells: this.activeCellIds.size - this.mines,
      status: this.status,
      firstMoveDone: this.firstMoveDone,
      explodedCellId: this.explodedCellId,
      geometryMask,
      cells: this.cells.map((cell) => ({ ...cell }))
    };
  }

  getCell(row: number, col: number): Cell | null {
    const cell = this.cellAt(row, col);
    return cell ? { ...cell } : null;
  }

  reveal(row: number, col: number): RevealResult {
    const cell = this.cellAt(row, col);

    if (!cell || !this.canReveal(cell)) {
      return this.revealResult("ignored", [], null);
    }

    if (!this.firstMoveDone) {
      this.placeMines(cell);
      this.calculateAdjacentMines();
      this.firstMoveDone = true;
    }

    if (this.status === "idle") {
      this.status = "playing";
    }

    if (cell.hasMine) {
      cell.state = "revealed";
      this.status = "detonating";
      this.explodedCellId = cell.id;
      return this.revealResult("mine_triggered", [{ ...cell }], { ...cell });
    }

    const revealedCells = this.floodReveal(cell);

    if (this.hasWon()) {
      this.status = "won";
      return this.revealResult("won", revealedCells, null);
    }

    return this.revealResult("revealed", revealedCells, null);
  }

  toggleFlag(row: number, col: number): FlagResult {
    const cell = this.cellAt(row, col);

    if (!cell || this.status === "won" || this.status === "lost" || this.status === "detonating" || cell.state === "revealed" || cell.state === "blocked") {
      return {
        kind: "ignored",
        cell: cell ? { ...cell } : null,
        state: this.getState()
      };
    }

    if (cell.state === "flagged") {
      cell.state = "hidden";
      this.flagsPlaced -= 1;
      return {
        kind: "unflagged",
        cell: { ...cell },
        state: this.getState()
      };
    }

    cell.state = "flagged";
    this.flagsPlaced += 1;

    return {
      kind: "flagged",
      cell: { ...cell },
      state: this.getState()
    };
  }

  chordReveal(row: number, col: number): ChordResult {
    const sourceCell = this.cellAt(row, col);

    if (!sourceCell || this.status !== "playing" || sourceCell.state !== "revealed" || sourceCell.hasMine || sourceCell.adjacentMines === 0) {
      return this.chordResult("ignored", sourceCell, [], null);
    }

    const neighbors = this.neighbors(sourceCell);
    const flagCount = neighbors.filter((cell) => cell.state === "flagged" || (cell.state === "revealed" && cell.hasMine)).length;

    if (flagCount !== sourceCell.adjacentMines) {
      return this.chordResult("chord_failed", sourceCell, [], null);
    }

    const targets = neighbors.filter((cell) => cell.state === "hidden");
    const revealedCells: Cell[] = [];

    for (const target of targets) {
      if (target.hasMine) {
        target.state = "revealed";
        this.status = "detonating";
        this.explodedCellId = target.id;
        return this.chordResult("mine_triggered", sourceCell, revealedCells, target);
      }

      revealedCells.push(...this.floodReveal(target));
    }

    if (this.hasWon()) {
      this.status = "won";
      return this.chordResult("won", sourceCell, revealedCells, null);
    }

    return this.chordResult("chord_succeeded", sourceCell, revealedCells, null);
  }

  /** Resolves a pending hit without regenerating mines or rolling back any move. */
  resolveMineHit(survived: boolean): BoardState {
    if (this.status === "detonating") this.status = survived ? "playing" : "lost";
    return this.getState();
  }

  private createEmptyCells(): Cell[] {
    const cells: Cell[] = [];

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        cells.push({
          id: cellId(row, col),
          row,
          col,
          state: "hidden",
          hasMine: false,
          adjacentMines: 0
        });
      }
    }

    return cells;
  }

  private applyPresetMines(mines: Coordinate[]): void {
    if (mines.length !== this.mines) {
      throw new Error(`Preset mine count ${mines.length} does not match difficulty mine count ${this.mines}.`);
    }

    mines.forEach((mine) => {
      const cell = this.cellAt(mine.row, mine.col);

      if (!cell) {
        throw new Error(`Preset mine is outside board: ${mine.row}:${mine.col}.`);
      }

      cell.hasMine = true;
    });

    this.calculateAdjacentMines();
  }

  private canReveal(cell: Cell): boolean {
    return (
      this.status !== "won" &&
      this.status !== "lost" &&
      this.status !== "detonating" &&
      cell.state !== "revealed" &&
      cell.state !== "flagged" &&
      cell.state !== "blocked"
    );
  }

  private placeMines(firstCell: Cell): void {
    const broadSafeZone = new Set([firstCell.id, ...this.neighbors(firstCell).map((cell) => cell.id)]);
    const broadCandidates = this.cells.filter((cell) => this.activeCellIds.has(cell.id) && !broadSafeZone.has(cell.id));
    const strictCandidates = this.cells.filter((cell) => this.activeCellIds.has(cell.id) && cell.id !== firstCell.id);
    const candidates = broadCandidates.length >= this.mines ? broadCandidates : strictCandidates;

    if (candidates.length < this.mines) {
      throw new Error("Not enough cells to place mines safely.");
    }

    this.shuffle(candidates);
    candidates.slice(0, this.mines).forEach((cell) => {
      cell.hasMine = true;
    });
  }

  private calculateAdjacentMines(): void {
    this.cells.forEach((cell) => {
      cell.adjacentMines = this.neighbors(cell).filter((neighbor) => neighbor.hasMine).length;
    });
  }

  private floodReveal(startCell: Cell): Cell[] {
    const queue = [startCell];
    const seen = new Set<string>();
    const revealedCells: Cell[] = [];

    while (queue.length > 0) {
      const cell = queue.shift();

      if (!cell || seen.has(cell.id) || cell.state === "revealed" || cell.state === "flagged" || cell.hasMine) {
        continue;
      }

      seen.add(cell.id);
      cell.state = "revealed";
      this.revealedSafeCells += 1;
      revealedCells.push({ ...cell });

      if (cell.adjacentMines === 0) {
        this.neighbors(cell).forEach((neighbor) => {
          if (neighbor.state === "hidden" && !neighbor.hasMine) {
            queue.push(neighbor);
          }
        });
      }
    }

    return revealedCells;
  }

  private hasWon(): boolean {
    return this.revealedSafeCells === this.activeCellIds.size - this.mines;
  }

  private neighbors(cell: Cell): Cell[] {
    const neighbors: Cell[] = [];

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        if (rowOffset === 0 && colOffset === 0) {
          continue;
        }

        const row = cell.row + rowOffset;
        const col = cell.col + colOffset;
        const neighbor = this.cellAt(row, col);

        if (neighbor && this.activeCellIds.has(neighbor.id)) {
          neighbors.push(neighbor);
        }
      }
    }

    return neighbors;
  }

  private cellAt(row: number, col: number): Cell | null {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return null;
    }

    return this.cells[row * this.cols + col] ?? null;
  }

  private revealResult(kind: RevealResult["kind"], revealedCells: Cell[], explodedCell: Cell | null): RevealResult {
    return {
      kind,
      revealedCells,
      explodedCell,
      state: this.getState()
    };
  }

  private chordResult(
    kind: ChordResult["kind"],
    sourceCell: Cell | null,
    revealedCells: Cell[],
    explodedCell: Cell | null
  ): ChordResult {
    return {
      kind,
      sourceCell: sourceCell ? { ...sourceCell } : null,
      revealedCells: revealedCells.map((cell) => ({ ...cell })),
      explodedCell: explodedCell ? { ...explodedCell } : null,
      state: this.getState()
    };
  }

  private shuffle(cells: Cell[]): void {
    for (let index = cells.length - 1; index > 0; index -= 1) {
      const target = Math.floor(this.rng() * (index + 1));
      [cells[index], cells[target]] = [cells[target], cells[index]];
    }
  }
}
