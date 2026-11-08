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

  it("reports a pending mine hit before the caller resolves final loss", () => {
    const core = new MinesweeperCore(difficulty(1, 2, 1), {
      presetMines: [{ row: 0, col: 0 }]
    });

    const result = core.reveal(0, 0);

    expect(result.kind).toBe("mine_triggered");
    expect(result.state.status).toBe("detonating");
    expect(result.explodedCell?.id).toBe("0:0");
    expect(core.resolveMineHit(false).status).toBe("lost");
    expect(core.resolveMineHit(true).status).toBe("lost");
  });

  it("blocks actions while a hit is unresolved and continues the same board after protection", () => {
    const core = new MinesweeperCore(difficulty(3, 3, 2), {
      presetMines: [{ row: 0, col: 0 }, { row: 2, col: 2 }]
    });
    core.reveal(1, 1);
    core.toggleFlag(2, 2);
    const before = core.getState();
    const triggered = core.reveal(0, 0);
    expect(triggered.kind).toBe("mine_triggered");
    expect(core.reveal(0, 1).kind).toBe("ignored");
    expect(core.toggleFlag(0, 1).kind).toBe("ignored");
    expect(core.chordReveal(1, 1).kind).toBe("ignored");
    const continued = core.resolveMineHit(true);
    expect(continued.status).toBe("playing");
    expect(continued.revealedSafeCells).toBe(before.revealedSafeCells);
    expect(continued.flagsPlaced).toBe(before.flagsPlaced);
    expect(continued.cells.map(cell => [cell.id, cell.hasMine, cell.adjacentMines])).toEqual(before.cells.map(cell => [cell.id, cell.hasMine, cell.adjacentMines]));
    expect(core.reveal(0, 0).kind).toBe("ignored");
    expect(core.toggleFlag(0, 0).kind).toBe("ignored");
    expect(core.chordReveal(0, 0).kind).toBe("ignored");
  });

  it("counts an already exploded mine as known when chording a neighboring number", () => {
    const core = new MinesweeperCore(difficulty(3, 3, 2), {
      presetMines: [{ row: 0, col: 0 }, { row: 2, col: 2 }]
    });
    core.reveal(1, 1);
    core.reveal(0, 0);
    core.resolveMineHit(true);
    expect(core.chordReveal(1, 1).kind).toBe("chord_failed");
    core.toggleFlag(2, 2);
    const result = core.chordReveal(1, 1);
    expect(result.kind).toBe("won");
    expect(result.explodedCell).toBeNull();
    expect(result.state.revealedSafeCells).toBe(7);
    expect(findCell(result.state.cells, 0, 0)).toMatchObject({ state: "revealed", hasMine: true });
    expect(findCell(result.state.cells, 1, 1).adjacentMines).toBe(2);
  });

  it("a wrong flag plus a known exploded mine can still trigger another mine through chord", () => {
    const core = new MinesweeperCore(difficulty(3, 3, 2), {
      presetMines: [{ row: 0, col: 0 }, { row: 2, col: 2 }]
    });
    core.reveal(1, 1);
    core.reveal(0, 0);
    core.resolveMineHit(true);
    core.toggleFlag(0, 1);
    const result = core.chordReveal(1, 1);
    expect(result.kind).toBe("mine_triggered");
    expect(result.explodedCell?.id).toBe("2:2");
    expect(core.resolveMineHit(false).status).toBe("lost");
  });
});
