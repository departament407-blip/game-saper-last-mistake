import { afterEach, describe, expect, it, vi } from "vitest";
import { MinesweeperCore } from "../core/minesweeperCore";
import type { BoardState, Difficulty } from "../core/types";
import { FALLBACK_OPERATION } from "../data/operations";
import { EventBus } from "../events/eventBus";
import type { GameEventMap } from "../events/gameEvents";
import { CampaignSessionStore } from "../progression/campaignSessionStore";
import { RunManager } from "../run/runManager";
import { BLAST_TIMING, classifyPostBlastFlags, PostBlastFlags } from "./postBlastFlags";

const difficulty: Difficulty = { id: "flag-review", label: "Flag review", rows: 4, cols: 4, mines: 3 };

function makeCore(): MinesweeperCore {
  return new MinesweeperCore(difficulty, {
    presetMines: [{ row: 0, col: 0 }, { row: 0, col: 3 }, { row: 3, col: 3 }]
  });
}

function makeLostState(): BoardState {
  const core = makeCore();
  core.toggleFlag(0, 0);
  core.toggleFlag(1, 1);
  return lose(core, 3, 3);
}

function lose(core: MinesweeperCore, row: number, col: number): BoardState {
  expect(core.reveal(row, col).kind).toBe("mine_triggered");
  return core.resolveMineHit(false);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("post-blast flag classification", () => {
  it("preserves a correctly placed flag and distinguishes wrong flags, hidden mines and the epicenter", () => {
    const state = makeLostState();
    const review = classifyPostBlastFlags(state);

    expect(review).toEqual({
      cells: {
        "0:0": "correct-flag",
        "0:3": "unflagged-mine",
        "1:1": "wrong-flag",
        "3:3": "epicenter"
      },
      statistics: { correctFlags: 1, wrongFlags: 1, unflaggedMines: 2 }
    });
    expect(state.cells.find((cell) => cell.id === "0:0")).toMatchObject({ state: "flagged", hasMine: true });
    expect(state.cells.find((cell) => cell.id === "1:1")).toMatchObject({ state: "flagged", hasMine: false });
    expect(state.cells.find((cell) => cell.id === "0:3")?.state).toBe("hidden");
  });

  it("uses the current flags, excluding removed flags and including the exploded mine in unflagged mines", () => {
    const core = makeCore();
    core.toggleFlag(2, 0);
    core.toggleFlag(2, 0); // A historical wrong flag is not a current error.
    core.toggleFlag(0, 3);
    core.toggleFlag(0, 3); // This mine is now unmarked again.
    core.toggleFlag(0, 0);
    core.toggleFlag(1, 1);
    const state = lose(core, 3, 3);
    const review = classifyPostBlastFlags(state);

    expect(review?.statistics).toEqual({ correctFlags: 1, wrongFlags: 1, unflaggedMines: 2 });
    expect(review?.cells["2:0"]).toBeUndefined();
    expect(review?.cells["0:3"]).toBe("unflagged-mine");
    expect(review!.statistics.correctFlags + review!.statistics.unflaggedMines).toBe(state.mines);
    expect(review!.statistics.correctFlags + review!.statistics.wrongFlags).toBe(state.flagsPlaced);
  });

  it("does not modify frozen game data and freezes the presentation snapshot", () => {
    const state = deepFreeze(makeLostState());
    const before = structuredClone(state);
    const review = classifyPostBlastFlags(state);
    const flags = new PostBlastFlags(() => 100);
    flags.start(state);
    flags.clear();

    expect(state).toEqual(before);
    expect(Object.isFrozen(review)).toBe(true);
    expect(Object.isFrozen(review?.cells)).toBe(true);
    expect(Object.isFrozen(review?.statistics)).toBe(true);
  });

  it("retains the detonation snapshot even if its input object is later changed", () => {
    const state = makeLostState();
    const flags = new PostBlastFlags();
    flags.start(state);
    state.cells.forEach((cell) => { cell.hasMine = false; cell.state = "hidden"; });
    state.flagsPlaced = 0;
    state.status = "playing";
    state.explodedCellId = null;

    expect(flags.getCellKind("0:0")).toBe("correct-flag");
    expect(flags.getCellKind("1:1")).toBe("wrong-flag");
    expect(flags.getCellKind("3:3")).toBe("epicenter");
    expect(flags.getStatistics()).toEqual({ correctFlags: 1, wrongFlags: 1, unflaggedMines: 2 });
  });

  it("exposes no classification or statistics before a real loss, even when mines and flags already exist", () => {
    const core = makeCore();
    core.toggleFlag(0, 0);
    core.toggleFlag(1, 1);
    const flags = new PostBlastFlags();
    const idle = core.getState();
    const playing = core.reveal(1, 0).state;

    for (const state of [idle, playing]) {
      expect(classifyPostBlastFlags(state)).toBeNull();
      flags.start(state);
      expect(flags.getStatistics()).toBeNull();
      expect(flags.getCellKind("0:0")).toBeUndefined();
      expect(flags.getCellKind("1:1")).toBeUndefined();
      expect(flags.getPhase()).toBeNull();
      expect(flags.getElapsedMs()).toBe(0);
    }

    const pendingHit = core.reveal(3, 3);
    expect(pendingHit.kind).toBe("mine_triggered");
    expect(classifyPostBlastFlags(pendingHit.state)).toBeNull();
    flags.start(core.resolveMineHit(false));
    expect(flags.getCellKind("0:0")).toBe("correct-flag");
    expect(flags.getCellKind("1:1")).toBe("wrong-flag");
  });

  it("does not start an explosion review for a victory or a loss without an epicenter", () => {
    const core = new MinesweeperCore({ ...difficulty, rows: 1, cols: 2, mines: 1 }, {
      presetMines: [{ row: 0, col: 0 }]
    });
    core.toggleFlag(0, 0);
    const won = core.reveal(0, 1).state;
    expect(won.status).toBe("won");
    expect(classifyPostBlastFlags(won)).toBeNull();
    expect(classifyPostBlastFlags({ ...makeLostState(), explodedCellId: null })).toBeNull();
  });

  it("classifies a chord detonation even when it reveals no safe cells first", () => {
    const core = new MinesweeperCore({ ...difficulty, rows: 3, cols: 3, mines: 2 }, {
      presetMines: [{ row: 0, col: 0 }, { row: 2, col: 2 }]
    });
    core.reveal(1, 1);
    core.toggleFlag(0, 1);
    core.toggleFlag(2, 2);
    const result = core.chordReveal(1, 1);

    expect(result.kind).toBe("mine_triggered");
    expect(result.revealedCells).toHaveLength(0);
    expect(classifyPostBlastFlags(result.state)).toBeNull();
    expect(classifyPostBlastFlags(core.resolveMineHit(false))).toEqual({
      cells: { "0:0": "epicenter", "0:1": "wrong-flag", "2:2": "correct-flag" },
      statistics: { correctFlags: 1, wrongFlags: 1, unflaggedMines: 1 }
    });
  });

  it("ignores inactive cells in a board snapshot", () => {
    const state = makeLostState();
    state.cells.push({ id: "blocked", row: 4, col: 0, state: "blocked", hasMine: true, adjacentMines: 0 });
    const review = classifyPostBlastFlags(state);

    expect(review?.cells.blocked).toBeUndefined();
    expect(review?.statistics).toEqual({ correctFlags: 1, wrongFlags: 1, unflaggedMines: 2 });
  });
});

describe("post-blast visual lifecycle", () => {
  it("follows the 900 / 2500 / 4000 ms boundaries and keeps classifications after the debrief", () => {
    let now = 10_000;
    const flags = new PostBlastFlags(() => now);
    flags.start(makeLostState());

    expect(BLAST_TIMING).toEqual({ ignition: 900, settling: 2500, debrief: 4000 });
    for (const [elapsed, phase] of [
      [0, "shockwave"], [899, "shockwave"], [900, "burning"], [2499, "burning"],
      [2500, "settling"], [3999, "settling"], [4000, "aftermath"], [60_000, "aftermath"]
    ] as const) {
      now = 10_000 + elapsed;
      expect(flags.getElapsedMs()).toBe(elapsed);
      expect(flags.getPhase()).toBe(phase);
      expect(flags.getCellKind("0:0")).toBe("correct-flag");
      expect(flags.getCellKind("1:1")).toBe("wrong-flag");
    }
  });

  it("does not restart the animation or replace the snapshot on repeated start calls", () => {
    let now = 100;
    const flags = new PostBlastFlags(() => now);
    const first = makeLostState();
    flags.start(first);
    now += 1500;
    flags.start(first);
    flags.start(lose(makeCore(), 0, 0));

    expect(flags.getElapsedMs()).toBe(1500);
    expect(flags.getPhase()).toBe("burning");
    expect(flags.getCellKind("0:0")).toBe("correct-flag");
    expect(flags.getStatistics()).toEqual({ correctFlags: 1, wrongFlags: 1, unflaggedMines: 2 });
  });

  it("clears every result and starts the next operation with its own time and snapshot", () => {
    let now = 0;
    const flags = new PostBlastFlags(() => now);
    flags.start(makeLostState());
    now = 4000;
    expect(flags.getPhase()).toBe("aftermath");
    flags.clear();
    flags.clear();
    now = 10_000;
    flags.start(makeCore().getState());

    expect(flags.getStatistics()).toBeNull();
    expect(flags.getPhase()).toBeNull();
    expect(flags.getElapsedMs()).toBe(0);
    for (const id of ["0:0", "0:3", "1:1", "3:3"]) expect(flags.getCellKind(id)).toBeUndefined();

    flags.start(lose(makeCore(), 0, 0));
    expect(flags.getPhase()).toBe("shockwave");
    expect(flags.getElapsedMs()).toBe(0);
    expect(flags.getCellKind("0:0")).toBe("epicenter");
    expect(flags.getCellKind("1:1")).toBeUndefined();
    expect(flags.getStatistics()).toEqual({ correctFlags: 0, wrongFlags: 0, unflaggedMines: 3 });
  });

  it("clamps elapsed time when the injected clock moves backwards", () => {
    let now = 100;
    const flags = new PostBlastFlags(() => now);
    flags.start(makeLostState());
    now = 90;
    expect(flags.getElapsedMs()).toBe(0);
    expect(flags.getPhase()).toBe("shockwave");
  });
});

describe("automatic flags from RunManager", () => {
  it.each([
    { mode: "squad" as const, xp: 500, count: 3 },
    { mode: "solo" as const, xp: 750, count: 4 }
  ])("preserves Rom's $count automatic flags after a $mode detonation", ({ mode, xp, count }) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const campaign = new CampaignSessionStore();
    campaign.startSession(mode, "flag-test-player", "Flag test");
    if (mode === "solo") campaign.lockSoloOperative("rom");
    campaign.updateProfile("rom", (profile) => ({
      ...profile, xp, unlockedPerkIds: ["rom-wild-intuition"]
    }));
    const bus = new EventBus<GameEventMap>();
    const run = new RunManager(bus, campaign);
    const flags = new PostBlastFlags();
    const onLoss = vi.fn(({ state }: GameEventMap["RUN_LOST"]) => flags.start(state));
    bus.on("RUN_LOST", onLoss);
    bus.on("GAME_STARTED", () => flags.clear());
    run.newGame({ ...FALLBACK_OPERATION, rows: 12, cols: 12, mines: 40 }, false, { characterId: "rom" });
    run.reveal(0, 0);
    const expectedCore = new MinesweeperCore({ ...FALLBACK_OPERATION, rows: 12, cols: 12, mines: 40 }, { rng: () => .5 });
    const expectedCells = expectedCore.reveal(0, 0).state.cells;
    expect(run.getState().flagsPlaced).toBe(0);
    expect(run.activateWildIntuition()).toBe(count);
    expect(run.activateWildIntuition()).toBe(0);
    const playing = run.getState();
    const automaticFlags = playing.cells.filter((cell) => cell.state === "flagged");

    expect(playing.status).toBe("playing");
    expect(automaticFlags).toHaveLength(count);
    expect(automaticFlags.every(cell => expectedCells.find(expected => expected.id === cell.id)?.hasMine)).toBe(true);
    expect(automaticFlags.every(cell => !cell.hasMine && cell.adjacentMines === 0)).toBe(true);
    expect(run.getManualFlagPlacements()).toBe(0);
    expect(flags.getStatistics()).toBeNull();
    automaticFlags.forEach((cell) => expect(flags.getCellKind(cell.id)).toBeUndefined());

    const unflaggedMine = expectedCells.find(cell => cell.hasMine && playing.cells.find(current => current.id === cell.id)?.state === "hidden");
    expect(unflaggedMine).toBeDefined();
    run.reveal(unflaggedMine!.row, unflaggedMine!.col);

    expect(onLoss).toHaveBeenCalledTimes(1);
    expect(run.getState().status).toBe("lost");
    expect(flags.getStatistics()).toEqual({ correctFlags: count, wrongFlags: 0, unflaggedMines: 40 - count });
    automaticFlags.forEach((cell) => {
      expect(flags.getCellKind(cell.id)).toBe("correct-flag");
      expect(run.getState().cells.find((candidate) => candidate.id === cell.id)?.state).toBe("flagged");
    });
    expect(flags.getCellKind(unflaggedMine!.id)).toBe("epicenter");

    run.newGame(FALLBACK_OPERATION, false, { characterId: "rom" });
    expect(flags.getStatistics()).toBeNull();
    expect(flags.getPhase()).toBeNull();
    automaticFlags.forEach((cell) => expect(flags.getCellKind(cell.id)).toBeUndefined());
  });

  it("does not expose flag correctness or hidden mines when armor absorbs a detonation", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(.5);
    const operation = { ...FALLBACK_OPERATION, rows: 12, cols: 12, mines: 40 };
    const truth = new MinesweeperCore(operation, { rng: () => .5 }).reveal(0, 0).state;
    const mines = truth.cells.filter(cell => cell.hasMine);
    const safe = truth.cells.find(cell => cell.state === "hidden" && !cell.hasMine)!;
    const campaign = new CampaignSessionStore();
    campaign.updateProfile("sergei", profile => ({ ...profile, xp: 750, unlockedPerkIds: ["sergei-heavy-landing"] }));
    const bus = new EventBus<GameEventMap>();
    const run = new RunManager(bus, campaign);
    const flags = new PostBlastFlags();
    const onLoss = vi.fn(({ state }: GameEventMap["RUN_LOST"]) => flags.start(state));
    const onArmor = vi.fn(({ state }: GameEventMap["ARMOR_ABSORBED"]) => flags.start(state));
    bus.on("RUN_LOST", onLoss);
    bus.on("ARMOR_ABSORBED", onArmor);
    run.newGame(operation, false, { characterId: "sergei" });
    run.reveal(0, 0);
    run.toggleFlag(mines[0].row, mines[0].col);
    run.toggleFlag(safe.row, safe.col);
    run.reveal(mines[1].row, mines[1].col);

    expect(onArmor).toHaveBeenCalledTimes(1);
    expect(onLoss).not.toHaveBeenCalled();
    expect(run.getState().status).toBe("playing");
    expect(flags.getStatistics()).toBeNull();
    expect(flags.getCellKind(mines[0].id)).toBeUndefined();
    expect(flags.getCellKind(safe.id)).toBeUndefined();
    const publicCells = run.getState().cells;
    expect(publicCells.filter(cell => cell.state !== "revealed").every(cell => !cell.hasMine && cell.adjacentMines === 0)).toBe(true);
    expect(publicCells.find(cell => cell.id === mines[1].id)).toMatchObject({ state: "revealed", hasMine: true });

    vi.advanceTimersByTime(BLAST_TIMING.debrief);
    expect(flags.getStatistics()).toBeNull();
    run.reveal(mines[2].row, mines[2].col);
    expect(onLoss).toHaveBeenCalledTimes(1);
    expect(flags.getStatistics()).toEqual({ correctFlags: 1, wrongFlags: 1, unflaggedMines: 39 });
    expect(flags.getCellKind(mines[0].id)).toBe("correct-flag");
    expect(flags.getCellKind(safe.id)).toBe("wrong-flag");
    expect(flags.getCellKind(mines[2].id)).toBe("epicenter");
  });
});
