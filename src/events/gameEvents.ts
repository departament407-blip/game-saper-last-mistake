import type { BoardState, Cell, ChordResult, FlagResult, RevealResult } from "../core/types";
import type { Biome } from "../data/biomes";
import type { Character } from "../data/characters";
import type { ClassicOperation } from "../data/operations";
import type { MissionResult } from "../progression/campaignTypes";

export interface GameEventMap {
  MINE_TRIGGERED: {
    state: BoardState;
    explodedCell: Cell;
    protected: boolean;
    runId: string;
    operation: ClassicOperation;
    biome: Biome;
    character: Character;
  };
  ARMOR_ABSORBED: { state: BoardState; runId: string; character: Character };
  BLAST_RECOVERED: { state: BoardState; runId: string };
  ACTIVE_PERK_USED: { perkId: string; flagsPlaced: number; charges: number; cellIds: string[] };
  GAME_STARTED: {
    state: BoardState;
    operation: ClassicOperation;
    biome: Biome;
    character: Character;
  };
  CELL_REVEALED: {
    result: RevealResult;
  };
  FLAG_TOGGLED: {
    result: FlagResult;
  };
  CHORD_SUCCEEDED: {
    result: ChordResult;
  };
  CHORD_FAILED: {
    result: ChordResult;
  };
  RUN_WON: {
    state: BoardState;
    elapsedSeconds: number;
    operation: ClassicOperation;
    biome: Biome;
    character: Character;
    result: MissionResult;
  };
  RUN_LOST: {
    state: BoardState;
    explodedCell: Cell;
    elapsedSeconds: number;
    operation: ClassicOperation;
    biome: Biome;
    character: Character;
    result: MissionResult;
  };
  FIRST_MOVE_COMPLETED: {
    state: BoardState;
    character: Character;
  };
  PERK_USED: {
    character: Character;
    perkId: string;
  };
  GAME_RESET: {
    previousState: BoardState | null;
  };
}

export type GameEventName = keyof GameEventMap;
