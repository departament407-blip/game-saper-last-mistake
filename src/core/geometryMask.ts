import type { GeometryMask } from "./types";

export function cellId(row: number, col: number): string {
  return `${row}:${col}`;
}

export function createRectangleMask(rows: number, cols: number): GeometryMask {
  const activeCellIds: string[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      activeCellIds.push(cellId(row, col));
    }
  }

  return {
    id: `rectangle-${rows}x${cols}`,
    kind: "rectangle",
    activeCellIds,
    blockedCellIds: []
  };
}
