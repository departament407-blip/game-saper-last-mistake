export type GameStatus = "idle" | "playing" | "won" | "lost";
export type CellState = "hidden" | "revealed" | "flagged" | "blocked";

export interface Coordinate {
  row: number;
  col: number;
}

export interface Cell extends Coordinate {
  id: string;
  state: CellState;
  hasMine: boolean;
  adjacentMines: number;
}

export interface GeometryMask {
  id: string;
  kind: "rectangle";
  activeCellIds: string[];
  blockedCellIds: string[];
}

export interface Difficulty {
  id: string;
  label: string;
  rows: number;
  cols: number;
  mines: number;
}

export interface BoardState {
  rows: number;
  cols: number;
  mines: number;
  flagsPlaced: number;
  revealedSafeCells: number;
  totalSafeCells: number;
  status: GameStatus;
  firstMoveDone: boolean;
  explodedCellId: string | null;
  geometryMask: GeometryMask;
  cells: Cell[];
}

export interface RevealResult {
  kind: "ignored" | "revealed" | "won" | "lost";
  revealedCells: Cell[];
  explodedCell: Cell | null;
  state: BoardState;
}

export interface FlagResult {
  kind: "ignored" | "flagged" | "unflagged";
  cell: Cell | null;
  state: BoardState;
}

export interface ChordResult {
  kind: "ignored" | "chord_failed" | "chord_succeeded" | "won" | "lost";
  sourceCell: Cell | null;
  revealedCells: Cell[];
  explodedCell: Cell | null;
  state: BoardState;
}
