import { MinesweeperCore } from "../core/minesweeperCore";
import type { BoardState, Cell } from "../core/types";
import { getBiome } from "../data/biomes";
import type { Biome } from "../data/biomes";
import { getCharacter } from "../data/characters";
import type { Character } from "../data/characters";
import { getClassicOperation } from "../data/operations";
import type { ClassicOperation } from "../data/operations";
import { getPerkTierByXp } from "../data/rankBenefits";
import type { EventBus } from "../events/eventBus";
import type { GameEventMap } from "../events/gameEvents";
import { resolveMissionProgress } from "../progression/progressionService";
import type { CampaignSessionStore } from "../progression/campaignSessionStore";
import type { MissionResult } from "../progression/campaignTypes";
import type { RunState } from "./runState";

export interface NewGameOptions {
  characterId?: string;
}

export class RunManager {
  private core: MinesweeperCore | null = null;
  private runState: RunState | null = null;
  private temporaryArmor = 0;
  private armorAbsorbedThisRun = 0;
  private wrongFlagPenaltyIds = new Set<string>();
  private perkEvents: string[] = [];

  constructor(
    private readonly bus: EventBus<GameEventMap>,
    private readonly campaignStore: CampaignSessionStore
  ) {}

  newGame(operationInput: ClassicOperation | string = "fallback-training", emitReset = false, options: NewGameOptions = {}): void {
    const previousState = this.runState?.board ?? null;

    if (emitReset) {
      this.bus.emit("GAME_RESET", { previousState });
    }

    const operation = typeof operationInput === "string" ? getClassicOperation(operationInput) : operationInput;
    const biome = getBiome(operation.biomeId);
    const character = getCharacter(options.characterId ?? this.runState?.character.id ?? "olga");
    const profile = this.campaignStore.getProfile(character.id);
    this.core = new MinesweeperCore(operation);
    this.temporaryArmor = getStartingArmor(character.id, profile);
    this.armorAbsorbedThisRun = 0;
    this.wrongFlagPenaltyIds.clear();
    this.perkEvents = [];
    this.runState = {
      id: createRunId(),
      operation,
      biome,
      character,
      board: this.core.getState(),
      startedAt: null,
      endedAt: null
    };

    this.bus.emit("GAME_STARTED", {
      state: this.runState.board,
      operation,
      biome,
      character
    });
  }

  reveal(row: number, col: number): void {
    const core = this.requireCore();
    const wasFirstMoveDone = core.getState().firstMoveDone;
    const result = core.reveal(row, col);

    this.syncState();

    if (!wasFirstMoveDone && result.state.firstMoveDone) {
      this.markStarted();
      this.bus.emit("FIRST_MOVE_COMPLETED", {
        state: this.requireCore().getState(),
        character: this.requireRun().character
      });
    }

    if (result.kind !== "ignored") {
      this.bus.emit("CELL_REVEALED", { result });
    }

    if (!wasFirstMoveDone && result.state.firstMoveDone && result.kind !== "lost") {
      this.applyRomFirstClickPerks();
    }

    const stateAfterPerks = this.requireCore().getState();

    if (stateAfterPerks.status === "won") {
      this.finishWon(stateAfterPerks);
      return;
    }

    if (result.kind === "won") {
      this.finishWon(result.state);
    }

    if (result.kind === "lost" && result.explodedCell) {
      this.finishLost(result.state, result.explodedCell);
    }
  }

  toggleFlag(row: number, col: number): void {
    const result = this.requireCore().toggleFlag(row, col);
    this.syncState();

    if (result.kind !== "ignored") {
      if (result.kind === "flagged" && result.state.firstMoveDone && result.cell && !result.cell.hasMine) {
        this.wrongFlagPenaltyIds.add(result.cell.id);
      }

      this.bus.emit("FLAG_TOGGLED", { result });
    }
  }

  repairFlag(row: number, col: number): "not-flagged" | "removed-wrong" | "correct-flag" {
    const core = this.requireCore();
    const cell = core.getCell(row, col);

    if (!cell || cell.state !== "flagged") {
      return "not-flagged";
    }

    if (cell.hasMine) {
      return "correct-flag";
    }

    const result = core.toggleFlag(row, col);
    this.wrongFlagPenaltyIds.delete(cell.id);
    this.syncState();

    if (result.kind !== "ignored") {
      this.bus.emit("FLAG_TOGGLED", { result });
    }

    this.perkEvents.push("Полевое восстановление: Лада сняла ошибочный флаг без штрафа.");
    this.bus.emit("PERK_USED", {
      character: this.requireRun().character,
      perkId: "lada-field-restoration"
    });

    return "removed-wrong";
  }

  chordReveal(row: number, col: number): void {
    const result = this.requireCore().chordReveal(row, col);
    this.syncState();

    if (result.kind === "chord_failed") {
      this.bus.emit("CHORD_FAILED", { result });
      return;
    }

    if (result.kind === "chord_succeeded" || result.kind === "won") {
      this.bus.emit("CHORD_SUCCEEDED", { result });
    }

    if (result.revealedCells.length > 0) {
      this.bus.emit("CELL_REVEALED", {
        result: {
          kind: result.kind === "won" ? "won" : "revealed",
          revealedCells: result.revealedCells,
          explodedCell: result.explodedCell,
          state: result.state
        }
      });
    }

    if (result.kind === "won") {
      this.finishWon(result.state);
    }

    if (result.kind === "lost" && result.explodedCell) {
      this.finishLost(result.state, result.explodedCell);
    }
  }

  getState(): BoardState {
    return this.requireCore().getState();
  }

  getOperation(): ClassicOperation {
    return this.requireRun().operation;
  }

  getBiome(): Biome {
    return this.requireRun().biome;
  }

  getCharacter(): Character {
    return this.requireRun().character;
  }

  getElapsedSeconds(): number {
    const run = this.requireRun();
    const startedAt = run.startedAt;

    if (startedAt === null) {
      return 0;
    }

    const end = run.endedAt ?? Date.now();
    return Math.floor((end - startedAt) / 1000);
  }

  getTemporaryArmor(): number {
    return this.temporaryArmor;
  }

  recordPerkEvent(event: string): void {
    if (event.trim()) {
      this.perkEvents.push(event.trim());
    }
  }

  private markStarted(): void {
    const run = this.requireRun();

    if (run.startedAt === null) {
      run.startedAt = Date.now();
    }
  }

  private finishWon(state: BoardState): void {
    const run = this.requireRun();
    run.endedAt = Date.now();
    const result = this.applyProgression(run, state, "won");
    this.bus.emit("RUN_WON", {
      state,
      elapsedSeconds: this.getElapsedSeconds(),
      operation: run.operation,
      biome: run.biome,
      character: run.character,
      result
    });
  }

  private finishLost(state: BoardState, explodedCell: Cell): void {
    const run = this.requireRun();
    run.endedAt = Date.now();
    const absorbed = Math.min(3, this.temporaryArmor);
    this.temporaryArmor -= absorbed;
    this.armorAbsorbedThisRun += absorbed;
    const result = this.applyProgression(run, state, "lost");
    this.bus.emit("RUN_LOST", {
      state,
      explodedCell,
      elapsedSeconds: this.getElapsedSeconds(),
      operation: run.operation,
      biome: run.biome,
      character: run.character,
      result
    });
  }

  private applyProgression(run: RunState, state: BoardState, outcome: "won" | "lost"): MissionResult {
    const previousProfile = this.campaignStore.getProfile(run.character.id);
    const draft = resolveMissionProgress(previousProfile, {
      playerId: this.campaignStore.getPlayerId(),
      playerName: this.campaignStore.getPlayerName(),
      displayName: this.campaignStore.getPlayerName(),
      character: run.character,
      operation: run.operation,
      biome: run.biome,
      elapsedSeconds: this.getElapsedSeconds(),
      flagsPlaced: state.flagsPlaced,
      wrongFlagsPlaced: this.wrongFlagPenaltyIds.size,
      damageTaken: outcome === "lost" ? Math.max(0, 3 - this.armorAbsorbedThisRun) : 0,
      armorAbsorbed: outcome === "lost" ? this.armorAbsorbedThisRun : 0,
      perkEvents: this.perkEvents,
      outcome
    }, this.campaignStore.getMode(), false);
    let profile = this.campaignStore.updateProfile(run.character.id, () => draft.profile);
    const perkEvents = [...draft.perkEvents];

    if (outcome === "won") {
      const perkTier = getPerkTierByXp(previousProfile.xp);
      perkEvents.push(...this.campaignStore.applySupportPerks(run.character.id, draft.xpAwarded, perkTier));
      perkEvents.push(...this.campaignStore.applyOlgaReserve(run.character.id, perkTier));
      const healed = this.campaignStore.applyPostWinHealing(run.character.id, perkTier);
      perkEvents.push(...healed.events);
      perkEvents.push(...this.campaignStore.applyIskraReanimation(run.character.id, perkTier));

      if (healed.profile?.id === run.character.id) {
        profile = healed.profile;
      }
    }

    this.campaignStore.closeOperation(run.operation.id);

    return {
      ...draft,
      profile,
      perkEvents,
      cycle: draft.cycle,
      sessionEnded: this.campaignStore.isSessionEnded(),
      campaignCompleted: this.campaignStore.isCampaignCompleted()
    };
  }

  private syncState(): void {
    const run = this.requireRun();
    run.board = this.requireCore().getState();
  }

  private applyRomFirstClickPerks(): void {
    const run = this.requireRun();

    if (run.character.id !== "rom") {
      return;
    }

    const profile = this.campaignStore.getProfile(run.character.id);
    const perkTier = getPerkTierByXp(profile.xp);

    if (profile.unlockedPerkIds.includes("rom-drunk-master")) {
      this.applyRomDrunkMaster(perkTier);
    }

    if (profile.unlockedPerkIds.includes("rom-wild-intuition")) {
      this.applyRomWildIntuition(perkTier);
    }
  }

  private applyRomDrunkMaster(perkTier: number): void {
    const run = this.requireRun();
    const core = this.requireCore();
    const state = core.getState();
    const revealedCells = state.cells.filter((cell) => cell.state === "revealed");
    const candidates = state.cells.filter((cell) => {
      if (cell.state !== "hidden" || cell.hasMine) {
        return false;
      }

      return revealedCells.every((revealed) => Math.abs(revealed.row - cell.row) > 1 || Math.abs(revealed.col - cell.col) > 1);
    });
    const revealCount = [2, 3, 4][Math.min(3, Math.max(1, perkTier)) - 1] ?? 2;
    const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, revealCount);

    shuffled.forEach((cell) => {
      const perkResult = core.reveal(cell.row, cell.col);
      this.syncState();

      if (perkResult.kind !== "ignored") {
        this.bus.emit("CELL_REVEALED", { result: perkResult });
      }
    });

    this.bus.emit("PERK_USED", {
      character: run.character,
      perkId: "rom-drunk-master"
    });

    if (shuffled.length > 0) {
      this.perkEvents.push(`Пьяный мастер: Ром раскрыл ${shuffled.length} безопасные клетки после первого клика.`);
    }
  }

  private applyRomWildIntuition(perkTier: number): void {
    const run = this.requireRun();
    const core = this.requireCore();
    const state = core.getState();
    const revealedCells = state.cells.filter((cell) => cell.state === "revealed");
    const candidates = state.cells.filter((cell) => {
      if (!cell.hasMine || cell.state !== "hidden") {
        return false;
      }

      return revealedCells.every((revealed) => Math.abs(revealed.row - cell.row) > 1 || Math.abs(revealed.col - cell.col) > 1);
    });
    const flagCount = [1, 2, 3][Math.min(3, Math.max(1, perkTier)) - 1] ?? 1;
    const targets = [...candidates].sort(() => Math.random() - 0.5).slice(0, flagCount);

    targets.forEach((cell) => {
      const flagResult = core.toggleFlag(cell.row, cell.col);
      this.syncState();

      if (flagResult.kind !== "ignored") {
        this.bus.emit("FLAG_TOGGLED", { result: flagResult });
      }
    });

    if (targets.length > 0) {
      this.perkEvents.push(`Шальная интуиция: Ром поставил ${targets.length} правильных флагов.`);
      this.bus.emit("PERK_USED", {
        character: run.character,
        perkId: "rom-wild-intuition"
      });
    }
  }

  private requireCore(): MinesweeperCore {
    if (!this.core) {
      throw new Error("RunManager has no active core. Call newGame() first.");
    }

    return this.core;
  }

  private requireRun(): RunState {
    if (!this.runState) {
      throw new Error("RunManager has no active run. Call newGame() first.");
    }

    return this.runState;
  }
}

function createRunId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getStartingArmor(characterId: string, profile: import("../progression/campaignTypes").OperativeSessionProfile): number {
  if (characterId !== "sergei" || !profile.unlockedPerkIds.includes("sergei-heavy-landing")) {
    return 0;
  }

  return [1, 2, 3][getPerkTierByXp(profile.xp) - 1] ?? 1;
}
