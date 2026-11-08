import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinesweeperCore } from "../core/minesweeperCore";
import type { Cell } from "../core/types";
import { FALLBACK_OPERATION, type ClassicOperation } from "../data/operations";
import { EventBus } from "../events/eventBus";
import type { GameEventMap } from "../events/gameEvents";
import { CampaignSessionStore } from "../progression/campaignSessionStore";
import type { CampaignMode } from "../progression/campaignTypes";
import { RunManager } from "./runManager";

const operation: ClassicOperation = { ...FALLBACK_OPERATION, rows: 12, cols: 12, mines: 40 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function fixture(characterId: string, perks: string[] = [], xp = 0, mode: CampaignMode = "squad") {
  const campaign = new CampaignSessionStore();
  campaign.startSession(mode, "test", "Test");
  if (mode === "solo") campaign.lockSoloOperative(characterId);
  campaign.updateProfile(characterId, profile => ({ ...profile, xp, unlockedPerkIds: perks }));
  const bus = new EventBus<GameEventMap>();
  const hit = vi.fn<(event: GameEventMap["MINE_TRIGGERED"]) => void>();
  const lost = vi.fn<(event: GameEventMap["RUN_LOST"]) => void>();
  const won = vi.fn<(event: GameEventMap["RUN_WON"]) => void>();
  const absorbed = vi.fn<(event: GameEventMap["ARMOR_ABSORBED"]) => void>();
  const recovered = vi.fn<(event: GameEventMap["BLAST_RECOVERED"]) => void>();
  const activePerk = vi.fn<(event: GameEventMap["ACTIVE_PERK_USED"]) => void>();
  bus.on("MINE_TRIGGERED", hit);
  bus.on("RUN_LOST", lost);
  bus.on("RUN_WON", won);
  bus.on("ARMOR_ABSORBED", absorbed);
  bus.on("BLAST_RECOVERED", recovered);
  bus.on("ACTIVE_PERK_USED", activePerk);
  const run = new RunManager(bus, campaign);
  run.newGame(operation, false, { characterId });
  const expected = new MinesweeperCore(operation, { rng: () => 0.5 });
  const expectedStart = expected.reveal(0, 0).state;
  const mines = expectedStart.cells.filter(cell => cell.hasMine);
  const safeHidden = expectedStart.cells.filter(cell => !cell.hasMine && cell.state === "hidden");
  expect(expectedStart.status).toBe("playing");
  expect(safeHidden.length).toBeGreaterThan(0);
  return { run, campaign, bus, expectedStart, mines, safeHidden, hit, lost, won, absorbed, recovered, activePerk };
}

function reveal(run: RunManager, cell: Cell): void { run.reveal(cell.row, cell.col); }
function flag(run: RunManager, cell: Cell): void { run.toggleFlag(cell.row, cell.col); }

describe("operation replacement during synchronous events", () => {
  it.each([false, true])("does not apply an old hit to a replacement operation (protected: %s)", protectedHit => {
    const f = fixture("sergei", protectedHit ? ["sergei-heavy-landing"] : []);
    f.run.reveal(0, 0);
    const before = f.campaign.getState();
    f.bus.on("MINE_TRIGGERED", () => f.run.newGame(operation, false, { characterId: "olga" }));
    reveal(f.run, f.mines[0]);
    vi.advanceTimersByTime(4000);
    expect(f.run.getCharacter().id).toBe("olga");
    expect(f.run.getState().status).toBe("idle");
    expect(f.run.isInputLocked()).toBe(false);
    expect(f.campaign.getState()).toEqual(before);
    expect(f.lost).not.toHaveBeenCalled();
    expect(f.absorbed).not.toHaveBeenCalled();
    expect(f.recovered).not.toHaveBeenCalled();
  });

  it("does not continue a first-move perk after its event replaces the operation", () => {
    const f = fixture("rom", ["rom-drunk-master"]);
    f.bus.on("FIRST_MOVE_COMPLETED", () => f.run.newGame(operation, false, { characterId: "olga" }));
    f.run.reveal(0, 0);
    expect(f.run.getState().status).toBe("idle");
    expect(f.run.getState().revealedSafeCells).toBe(0);
    expect(f.won).not.toHaveBeenCalled();
  });

  it("does not attach an old active-perk batch to a replacement operation", () => {
    const f = fixture("rom", ["rom-wild-intuition"]);
    f.run.reveal(0, 0);
    f.bus.on("FLAG_TOGGLED", () => f.run.newGame(operation, false, { characterId: "olga" }));
    f.run.activateWildIntuition();
    expect(f.run.getState().status).toBe("idle");
    expect(f.run.getState().flagsPlaced).toBe(0);
    expect(f.run.getManualFlagPlacements()).toBe(0);
    expect(f.activePerk).not.toHaveBeenCalled();
  });
});

describe("Sergei's one-charge armor", () => {
  it.each([0, 180, 750])("protects exactly one hit at %i XP, preserves the mission, and locks all input for four seconds", xp => {
    const f = fixture("sergei", ["sergei-heavy-landing"], xp);
    f.run.reveal(0, 0);
    flag(f.run, f.mines[2]);
    const campaignBefore = f.campaign.getState();
    const boardBefore = f.run.getState();
    expect(f.run.getTemporaryArmor()).toBe(1);
    reveal(f.run, f.mines[0]);
    expect(f.run.getState().status).toBe("playing");
    expect(f.run.isInputLocked()).toBe(true);
    expect(f.run.getTemporaryArmor()).toBe(0);
    expect(f.campaign.getState()).toEqual(campaignBefore);
    expect(f.run.getState().revealedSafeCells).toBe(boardBefore.revealedSafeCells);
    expect(f.run.getState().cells.filter(cell => cell.state === "flagged")).toEqual(boardBefore.cells.filter(cell => cell.state === "flagged"));
    expect(f.run.getOperation()).toEqual(operation);
    expect(f.hit).toHaveBeenCalledTimes(1);
    expect(f.hit.mock.calls[0][0].protected).toBe(true);
    expect(f.absorbed).toHaveBeenCalledTimes(1);
    expect(f.lost).not.toHaveBeenCalled();
    expect(f.won).not.toHaveBeenCalled();

    const afterHit = f.run.getState();
    reveal(f.run, f.mines[1]);
    reveal(f.run, f.safeHidden[0]);
    flag(f.run, f.safeHidden[0]);
    f.run.chordReveal(0, 0);
    expect(f.run.repairFlag(f.mines[2].row, f.mines[2].col)).toBe("not-flagged");
    expect(f.run.activateWildIntuition()).toBe(0);
    expect(f.run.getManualFlagPlacements()).toBe(1);
    expect(f.run.getState()).toEqual(afterHit);
    vi.advanceTimersByTime(3999);
    expect(f.run.isInputLocked()).toBe(true);
    expect(f.recovered).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.run.isInputLocked()).toBe(false);
    expect(f.recovered).toHaveBeenCalledTimes(1);
    reveal(f.run, f.mines[0]);
    expect(f.hit).toHaveBeenCalledTimes(1);
    reveal(f.run, f.safeHidden[0]);
    expect(f.run.getState().cells.find(cell => cell.id === f.safeHidden[0].id)?.state).toBe("revealed");

    reveal(f.run, f.mines[1]);
    expect(f.run.getState().status).toBe("lost");
    expect(f.hit).toHaveBeenCalledTimes(2);
    expect(f.hit.mock.calls[1][0].protected).toBe(false);
    expect(f.absorbed).toHaveBeenCalledTimes(1);
    expect(f.lost).toHaveBeenCalledTimes(1);
    expect(f.campaign.getProfile("sergei").hp).toBe(campaignBefore.profiles.sergei.hp - 3);
    expect(f.campaign.getProfile("sergei").xp).toBe(xp);
    expect(f.campaign.getProfile("sergei").losses).toBe(1);
    expect(f.run.getState().cells.map(cell => [cell.id, cell.hasMine, cell.adjacentMines])).toEqual(f.expectedStart.cells.map(cell => [cell.id, cell.hasMine, cell.adjacentMines]));
  });

  it("resolves flotation separately only on the second hit and does not re-award a terminal result", () => {
    const f = fixture("sergei", ["sergei-heavy-landing", "sergei-cycle-survival"], 750);
    f.campaign.updateProfile("sergei", profile => ({ ...profile, hp: 1 }));
    f.run.reveal(0, 0);
    reveal(f.run, f.mines[0]);
    expect(f.campaign.getProfile("sergei").hp).toBe(1);
    expect(f.campaign.getProfile("sergei").usedPerkKeys).toEqual([]);
    vi.advanceTimersByTime(4000);
    reveal(f.run, f.mines[1]);
    const profile = f.campaign.getProfile("sergei");
    expect(profile.status).toBe("active");
    expect(profile.hp).toBe(2);
    expect(profile.usedPerkKeys.filter(key => key.startsWith("sergei-cycle-survival"))).toHaveLength(1);
    expect(profile.usedPerkKeys).toContain("sergei-next-success-xp");
    expect(f.lost).toHaveBeenCalledTimes(1);
    const afterLoss = f.campaign.getState();
    for (let i = 0; i < 3; i += 1) {
      reveal(f.run, f.mines[1]);
      f.run.chordReveal(0, 0);
      flag(f.run, f.safeHidden[0]);
      f.run.activateWildIntuition();
    }
    vi.advanceTimersByTime(20_000);
    expect(f.campaign.getState()).toEqual(afterLoss);
    expect(f.lost).toHaveBeenCalledTimes(1);
    expect(f.hit).toHaveBeenCalledTimes(2);
  });

  it("recharges only on a new operation and cancels a stale recovery callback", () => {
    const f = fixture("sergei", ["sergei-heavy-landing"]);
    f.run.reveal(0, 0);
    reveal(f.run, f.mines[0]);
    f.run.newGame(operation, true, { characterId: "sergei" });
    expect(f.run.getTemporaryArmor()).toBe(1);
    expect(f.run.isInputLocked()).toBe(false);
    expect(f.run.getState().status).toBe("idle");
    expect(f.run.getState().explodedCellId).toBeNull();
    vi.advanceTimersByTime(4000);
    expect(f.recovered).not.toHaveBeenCalled();
    expect(f.run.getState().status).toBe("idle");
    f.run.reveal(0, 0);
    reveal(f.run, f.mines[0]);
    expect(f.hit).toHaveBeenCalledTimes(2);
    expect(f.hit.mock.calls.every(([event]) => event.protected)).toBe(true);
  });

  it("can win the protected operation once, keeping the exploded mine discovered", () => {
    const f = fixture("sergei", ["sergei-heavy-landing"]);
    f.run.reveal(0, 0);
    reveal(f.run, f.mines[0]);
    vi.advanceTimersByTime(4000);
    f.expectedStart.cells.filter(cell => !cell.hasMine).forEach(cell => reveal(f.run, cell));
    expect(f.run.getState().status).toBe("won");
    expect(f.won).toHaveBeenCalledTimes(1);
    expect(f.lost).not.toHaveBeenCalled();
    expect(f.campaign.getProfile("sergei").xp).toBe(operation.xpWin);
    expect(f.campaign.getProfile("sergei").wins).toBe(1);
    const afterWin = f.campaign.getState();
    reveal(f.run, f.safeHidden[0]);
    f.run.chordReveal(0, 0);
    expect(f.campaign.getState()).toEqual(afterWin);
    expect(f.won).toHaveBeenCalledTimes(1);
    expect(f.run.getState().cells.find(cell => cell.id === f.mines[0].id)).toMatchObject({ state: "revealed", hasMine: true });
  });
});

describe("active wild intuition and manual flag history", () => {
  it.each([{ xp: 0, count: 2 }, { xp: 180, count: 3 }, { xp: 750, count: 4 }])("actively flags $count eligible mines at $xp XP, once per operation", ({ xp, count }) => {
    const f = fixture("rom", ["rom-wild-intuition"], xp);
    expect(f.run.activateWildIntuition()).toBe(0);
    expect(f.run.getIntuitionCharges()).toBe(1);
    f.run.reveal(0, 0);
    expect(f.run.getState().flagsPlaced).toBe(0);
    flag(f.run, f.mines[0]);
    flag(f.run, f.safeHidden[0]);
    const manualIds = f.run.getState().cells.filter(cell => cell.state === "flagged").map(cell => cell.id);
    expect(f.run.activateWildIntuition()).toBe(count);
    expect(f.run.getIntuitionCharges()).toBe(0);
    expect(f.run.getManualFlagPlacements()).toBe(2);
    expect(f.run.getState().flagsPlaced).toBe(count + 2);
    const autoIds = f.activePerk.mock.calls[0][0].cellIds;
    expect(autoIds).toHaveLength(count);
    expect(new Set(autoIds).size).toBe(count);
    expect(autoIds.every(id => f.mines.some(cell => cell.id === id) && !manualIds.includes(id))).toBe(true);
    expect(f.run.getState().cells.filter(cell => manualIds.includes(cell.id)).every(cell => cell.state === "flagged")).toBe(true);
    expect(f.run.activateWildIntuition()).toBe(0);
    expect(f.activePerk).toHaveBeenCalledTimes(1);
    expect(f.run.getState().cells.filter(cell => cell.state !== "revealed").every(cell => !cell.hasMine && cell.adjacentMines === 0)).toBe(true);
    const spareMine = f.mines.find(cell => !manualIds.includes(cell.id) && !autoIds.includes(cell.id))!;
    reveal(f.run, spareMine);
    expect(f.lost.mock.calls[0][0].result).toMatchObject({ manualFlagPlacements: 2, automaticFlagPlacements: count });
    expect(f.lost.mock.calls[0][0].state.cells.filter(cell => autoIds.includes(cell.id)).every(cell => cell.hasMine && cell.state === "flagged")).toBe(true);
  });

  it("places only one flag when only one unmarked mine remains", () => {
    const f = fixture("rom", ["rom-wild-intuition"], 750);
    f.run.reveal(0, 0);
    f.mines.slice(1).forEach(cell => flag(f.run, cell));
    expect(f.run.activateWildIntuition()).toBe(1);
    expect(f.run.getIntuitionCharges()).toBe(0);
    expect(f.run.getState().flagsPlaced).toBe(operation.mines);
    expect(f.run.getManualFlagPlacements()).toBe(operation.mines - 1);
  });

  it("does not spend a charge when all mines are already marked", () => {
    const f = fixture("rom", ["rom-wild-intuition"], 750);
    f.run.reveal(0, 0);
    f.mines.forEach(cell => flag(f.run, cell));
    expect(f.run.activateWildIntuition()).toBe(0);
    expect(f.run.getIntuitionCharges()).toBe(1);
    expect(f.activePerk).not.toHaveBeenCalled();
    flag(f.run, f.mines[0]);
    expect(f.run.activateWildIntuition()).toBe(1);
    expect(f.run.getIntuitionCharges()).toBe(0);
    expect(f.run.getManualFlagPlacements()).toBe(operation.mines);
  });

  it("records re-placements without refunding removals and resets history on a new operation", () => {
    const f = fixture("rom", ["rom-wild-intuition"]);
    f.run.reveal(0, 0);
    flag(f.run, f.mines[0]);
    flag(f.run, f.mines[0]);
    flag(f.run, f.mines[0]);
    expect(f.run.getManualFlagPlacements()).toBe(2);
    expect(f.run.getState().flagsPlaced).toBe(1);
    expect(f.run.activateWildIntuition()).toBe(2);
    expect(f.run.getManualFlagPlacements()).toBe(2);
    f.run.toggleFlag(0, 0); // Revealed cell: ignored, not a placement.
    expect(f.run.getManualFlagPlacements()).toBe(2);
    f.run.newGame(operation, false, { characterId: "rom" });
    expect(f.run.getManualFlagPlacements()).toBe(0);
    expect(f.run.getIntuitionCharges()).toBe(1);
  });
});

describe("Sych's final rewards through RunManager", () => {
  it.each(["squad", "solo"] as const)("uses manual history and awards the correct recipients once in %s", mode => {
    const f = fixture("sych", ["sych-flag-discipline"], 0, mode);
    f.run.reveal(0, 0);
    for (let i = 0; i < 3; i += 1) {
      flag(f.run, f.mines[0]);
      flag(f.run, f.mines[0]);
    }
    expect(f.run.getState().flagsPlaced).toBe(0);
    expect(f.run.getManualFlagPlacements()).toBe(3);
    f.expectedStart.cells.filter(cell => !cell.hasMine).forEach(cell => reveal(f.run, cell));
    expect(f.won).toHaveBeenCalledTimes(1);
    const result = f.won.mock.calls[0][0].result;
    const bonus = 36; // round(60 * min(.60, (40 - 3) * .02))
    expect(result.flagDiscipline).toMatchObject({ manualFlagPlacements: 3, unusedFlagBudget: 37, bonusXpPerOperative: bonus, bonusPercent: 60 });
    expect(result.flagDiscipline?.recipients).toHaveLength(mode === "squad" ? 6 : 1);
    expect(f.campaign.getProfile("sych").xp).toBe(60 + bonus);
    expect(f.campaign.getProfile("rom").xp).toBe(mode === "squad" ? bonus : 0);
    const afterWin = f.campaign.getState();
    reveal(f.run, f.safeHidden[0]);
    flag(f.run, f.mines[0]);
    expect(f.campaign.getState()).toEqual(afterWin);
    expect(f.won).toHaveBeenCalledTimes(1);
  });
});
