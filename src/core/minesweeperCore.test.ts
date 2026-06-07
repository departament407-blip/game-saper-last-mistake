import { describe, expect, it } from "vitest";
import { MinesweeperCore } from "./minesweeperCore";
import type { Cell, Difficulty } from "./types";

function difficulty(rows: number, cols: number, mines: number): Difficulty {
  return {
    id: "test",
    label: "Test",
    rows,
    cols,
    mines
  };
}

function findCell(cells: Cell[], row: number, col: number): Cell {
  const cell = cells.find((candidate) => candidate.row === row && candidate.col === col);

  if (!cell) {
    throw new Error(`Missing cell ${row}:${col}`);
  }

  return cell;
}

describe("MinesweeperCore", () => {
  it("keeps the first clicked cell safe", () => {
    const core = new MinesweeperCore(difficulty(3, 3, 8), { rng: () => 0.5 });
    const result = core.reveal(1, 1);
    const clicked = findCell(result.state.cells, 1, 1);

    expect(clicked.hasMine).toBe(false);
    expect(result.kind).toBe("won");
  });

  it("calculates adjacent mine counts", () => {
    const core = new MinesweeperCore(difficulty(3, 3, 2), {
      presetMines: [
        { row: 0, col: 0 },
        { row: 2, col: 2 }
      ]
    });

    const center = findCell(core.getState().cells, 1, 1);
    const corner = findCell(core.getState().cells, 0, 2);

    expect(center.adjacentMines).toBe(2);
    expect(corner.adjacentMines).toBe(0);
  });

  it("flood reveals empty areas", () => {
    const core = new MinesweeperCore(difficulty(3, 3, 1), {
      presetMines: [{ row: 2, col: 2 }]
    });

    const result = core.reveal(0, 0);

    expect(result.revealedCells.length).toBeGreaterThan(1);
    expect(findCell(result.state.cells, 1, 1).state).toBe("revealed");
    expect(findCell(result.state.cells, 2, 2).state).toBe("hidden");
  });

  it("toggles flags without revealing cells", () => {
    const core = new MinesweeperCore(difficulty(2, 2, 1), {
      presetMines: [{ row: 0, col: 0 }]
    });

    const flagged = core.toggleFlag(0, 0);
    const unflagged = core.toggleFlag(0, 0);

    expect(flagged.kind).toBe("flagged");
    expect(flagged.cell?.state).toBe("flagged");
    expect(flagged.state.flagsPlaced).toBe(1);
    expect(unflagged.kind).toBe("unflagged");
    expect(unflagged.cell?.state).toBe("hidden");
    expect(unflagged.state.flagsPlaced).toBe(0);
  });

  it("only chord-reveals when the flag count matches the number", () => {
    const core = new MinesweeperCore(difficulty(2, 2, 1), {
      presetMines: [{ row: 0, col: 0 }]
    });

    core.reveal(1, 1);
    const failed = core.chordReveal(1, 1);
    core.toggleFlag(0, 0);
    const succeeded = core.chordReveal(1, 1);

    expect(failed.kind).toBe("chord_failed");
    expect(succeeded.kind).toBe("won");
    expect(findCell(succeeded.state.cells, 0, 1).state).toBe("revealed");
    expect(findCell(succeeded.state.cells, 1, 0).state).toBe("revealed");
  });

  it("detects a win after all safe cells are revealed", () => {
    const core = new MinesweeperCore(difficulty(1, 2, 1), {
      presetMines: [{ row: 0, col: 0 }]
    });

    const result = core.reveal(0, 1);

    expect(result.kind).toBe("won");
    expect(result.state.status).toBe("won");
  });

  it("detects a loss after revealing a mine", () => {
    const core = new MinesweeperCore(difficulty(1, 2, 1), {
      presetMines: [{ row: 0, col: 0 }]
    });

    const result = core.reveal(0, 0);

    expect(result.kind).toBe("lost");
    expect(result.state.status).toBe("lost");
    expect(result.explodedCell?.id).toBe("0:0");
  });
});
