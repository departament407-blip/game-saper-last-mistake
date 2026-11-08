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
import { BLAST_TIMING } from "./blastTiming";
import { MineHitResolver } from "./mineHitResolver";
import { ManualFlagCounter } from "./manualFlagCounter";
import { WildIntuition } from "./perkEngine";

export interface NewGameOptions {
  characterId?: string;
}

export class RunManager {
  private core: MinesweeperCore | null = null;
  private runState: RunState | null = null;
  private mineHitResolver = new MineHitResolver(false);
  private wildIntuition = new WildIntuition(false, 1);
  private readonly manualFlags = new ManualFlagCounter();
  private automaticFlagPlacements = 0;
  private inputLocked = false;
  private blastTimer: ReturnType<typeof setTimeout> | null = null;
  private wrongFlagPenaltyIds = new Set<string>();
  private perkEvents: string[] = [];

  constructor(
    private readonly bus: EventBus<GameEventMap>,
    private readonly campaignStore: CampaignSessionStore
  ) {}

  newGame(operationInput: ClassicOperation | string = "fallback-training", emitReset = false, options: NewGameOptions = {}): void {
    this.cancelPendingBlast();
    this.inputLocked = false;
    const previousState = this.core ? this.getState() : null;

    if (emitReset) {
      const previousRun = this.runState;
      this.bus.emit("GAME_RESET", { previousState });
      if (this.runState !== previousRun) return;
    }

    const operation = typeof operationInput === "string" ? getClassicOperation(operationInput) : operationInput;
    const biome = getBiome(operation.biomeId);
    const character = getCharacter(options.characterId ?? this.runState?.character.id ?? "olga");
    const profile = this.campaignStore.getProfile(character.id);
    this.core = new MinesweeperCore(operation);
    this.mineHitResolver = new MineHitResolver(character.id === "sergei" && profile.unlockedPerkIds.includes("sergei-heavy-landing"));
    this.wildIntuition = new WildIntuition(character.id === "rom" && profile.unlockedPerkIds.includes("rom-wild-intuition"), getPerkTierByXp(profile.xp));
    this.manualFlags.reset();
    this.automaticFlagPlacements = 0;
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
      state: this.getState(),
      operation,
      biome,
      character
    });
  }

  reveal(row: number, col: number): void {
    if (!this.canAct()) return;
    const run = this.requireRun();
    const core = this.requireCore();
    const wasFirstMoveDone = core.getState().firstMoveDone;
    const result = core.reveal(row, col);

    this.syncState();

    if (!wasFirstMoveDone && result.state.firstMoveDone) {
      this.markStarted();
      this.bus.emit("FIRST_MOVE_COMPLETED", {
        state: this.getState(),
        character: this.requireRun().character
      });
      if (this.runState !== run) return;
    }

    if (result.kind === "mine_triggered" && result.explodedCell) {
      this.resolveMineHit(result.explodedCell);
      return;
    }

    if (result.kind !== "ignored") {
      this.bus.emit("CELL_REVEALED", { result: { ...result, state: this.getState() } });
      if (this.runState !== run) return;
    }

    if (!wasFirstMoveDone && result.state.firstMoveDone) {
      this.applyRomFirstClickPerks();
      if (this.runState !== run) return;
    }

    const stateAfterPerks = this.requireCore().getState();

    if (stateAfterPerks.status === "won") {
      this.finishWon(stateAfterPerks);
      return;
    }

  }

  toggleFlag(row: number, col: number): void {
    if (!this.canAct()) return;
    const result = this.requireCore().toggleFlag(row, col);
    this.syncState();
    this.manualFlags.record(result.kind, "manual");

    if (result.kind !== "ignored") {
      if (result.kind === "flagged" && result.state.firstMoveDone && result.cell && !result.cell.hasMine) {
        this.wrongFlagPenaltyIds.add(result.cell.id);
      }

      this.bus.emit("FLAG_TOGGLED", { result: { ...result, cell: result.cell ? publicCell(result.cell, false) : null, state: this.getState() } });
    }
  }

  repairFlag(row: number, col: number): "not-flagged" | "removed-wrong" | "correct-flag" {
    if (!this.canAct()) return "not-flagged";
    const run = this.requireRun();
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
      this.bus.emit("FLAG_TOGGLED", { result: { ...result, cell: result.cell ? publicCell(result.cell, false) : null, state: this.getState() } });
      if (this.runState !== run) return "removed-wrong";
    }

    this.perkEvents.push("Полевое восстановление: Лада сняла ошибочный флаг без штрафа.");
    this.bus.emit("PERK_USED", {
      character: this.requireRun().character,
      perkId: "lada-field-restoration"
    });

    return "removed-wrong";
  }

  chordReveal(row: number, col: number): void {
    if (!this.canAct()) return;
    const run = this.requireRun();
    const result = this.requireCore().chordReveal(row, col);
    this.syncState();

    if (result.kind === "mine_triggered" && result.explodedCell) {
      this.resolveMineHit(result.explodedCell);
      return;
    }

    if (result.kind === "chord_failed") {
      this.bus.emit("CHORD_FAILED", { result: { ...result, state: this.getState() } });
      return;
    }

    if (result.kind === "chord_succeeded" || result.kind === "won") {
      this.bus.emit("CHORD_SUCCEEDED", { result: { ...result, state: this.getState() } });
      if (this.runState !== run) return;
    }

    if (result.revealedCells.length > 0) {
      this.bus.emit("CELL_REVEALED", {
        result: {
          kind: result.kind === "won" ? "won" : "revealed",
          revealedCells: result.revealedCells,
          explodedCell: result.explodedCell,
          state: this.getState()
        }
      });
      if (this.runState !== run) return;
    }

    if (result.kind === "won") {
      this.finishWon(result.state);
    }
  }

  getState(): BoardState {
    const state = this.requireCore().getState();
    return { ...state, cells: state.cells.map(cell => publicCell(cell, state.status === "lost" || state.status === "won")) };
  }

  hasActiveGame(): boolean {
    return this.core !== null && this.runState !== null;
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
    return this.mineHitResolver.charges;
  }

  isInputLocked(): boolean { return this.inputLocked; }
  getManualFlagPlacements(): number { return this.manualFlags.placements; }
  getIntuitionCharges(): number { return this.wildIntuition.charges; }

  activateWildIntuition(): number {
    if (!this.canAct()) return 0;
    const run = this.requireRun();
    const results = this.wildIntuition.activate(this.requireCore());
    if (!results.length) return 0;
    this.automaticFlagPlacements += results.length;
    this.syncState();
    for (const result of results) {
      this.bus.emit("FLAG_TOGGLED", { result: { ...result, cell: result.cell ? publicCell(result.cell, false) : null, state: this.getState() } });
      if (this.runState !== run) return results.length;
    }
    this.perkEvents.push(`Шальная интуиция: установлено ${results.length} правильных флагов.`);
    this.bus.emit("PERK_USED", { character: this.getCharacter(), perkId: "rom-wild-intuition" });
    if (this.runState !== run) return results.length;
    this.bus.emit("ACTIVE_PERK_USED", { perkId: "rom-wild-intuition", flagsPlaced: results.length, charges: this.wildIntuition.charges, cellIds: results.flatMap(result => result.cell ? [result.cell.id] : []) });
    return results.length;
  }

  countSectorMines(cellIds: string[]): number {
    if (!this.canAct() || this.getCharacter().id !== "lada") return 0;
    const ids = new Set(cellIds);
    return this.requireCore().getState().cells.filter(cell => ids.has(cell.id) && cell.hasMine).length;
  }

  cancelPendingBlast(): void {
    if (this.blastTimer !== null) clearTimeout(this.blastTimer);
    this.blastTimer = null;
    this.inputLocked = true;
  }

  private canAct(): boolean {
    if (!this.core || this.inputLocked || this.runState?.endedAt !== null) return false;
    const status = this.core.getState().status;
    return status === "idle" || status === "playing";
  }

  private resolveMineHit(explodedCell: Cell): void {
    const run = this.requireRun();
    const resolution = this.mineHitResolver.resolve();
    const state = this.requireCore().resolveMineHit(resolution.protected);
    this.syncState();
    this.inputLocked = true;
    if (resolution.protected) {
      this.perkEvents.push("Тяжёлая высадка: один заряд поглотил 3 HP урона, операция продолжена.");
      const runId = run.id;
      this.blastTimer = setTimeout(() => {
        this.blastTimer = null;
        if (this.runState?.id !== runId || this.runState.endedAt !== null) return;
        this.inputLocked = false;
        this.bus.emit("BLAST_RECOVERED", { state: this.getState(), runId });
      }, BLAST_TIMING.debrief);
    }
    this.bus.emit("MINE_TRIGGERED", { state: this.getState(), explodedCell, protected: resolution.protected, runId: run.id, operation: run.operation, biome: run.biome, character: run.character });
    // Event listeners may synchronously replace the operation. Never finish the replacement.
    if (this.runState !== run) return;
    if (resolution.protected) {
      this.bus.emit("ARMOR_ABSORBED", { state: this.getState(), runId: run.id, character: run.character });
    } else {
      this.finishLost(state, explodedCell, resolution.damage);
    }
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
    if (run.endedAt !== null) return;
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

  private finishLost(state: BoardState, explodedCell: Cell, damage: number): void {
    const run = this.requireRun();
    if (run.endedAt !== null) return;
    run.endedAt = Date.now();
    const result = this.applyProgression(run, state, "lost", damage);
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

  private applyProgression(run: RunState, state: BoardState, outcome: "won" | "lost", damageTaken = 0): MissionResult {
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
      manualFlagPlacements: this.manualFlags.placements,
      automaticFlagPlacements: this.automaticFlagPlacements,
      wrongFlagsPlaced: this.wrongFlagPenaltyIds.size,
      damageTaken,
      perkEvents: this.perkEvents,
      outcome
    }, this.campaignStore.getMode(), false);
    let profile = this.campaignStore.updateProfile(run.character.id, () => draft.profile);
    const flagDiscipline = this.campaignStore.applySychDisciplineReward(run.id, draft);
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
      flagDiscipline,
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

    for (const cell of shuffled) {
      const perkResult = core.reveal(cell.row, cell.col);
      this.syncState();

      if (perkResult.kind !== "ignored") {
        this.bus.emit("CELL_REVEALED", { result: { ...perkResult, state: this.getState() } });
        if (this.runState !== run) return;
      }
    }

    this.bus.emit("PERK_USED", {
      character: run.character,
      perkId: "rom-drunk-master"
    });
    if (this.runState !== run) return;

    if (shuffled.length > 0) {
      this.perkEvents.push(`Пьяный мастер: Ром раскрыл ${shuffled.length} безопасные клетки после первого клика.`);
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

function publicCell(cell: Cell, finished: boolean): Cell {
  return finished || cell.state === "revealed" ? { ...cell } : { ...cell, hasMine: false, adjacentMines: 0 };
}
