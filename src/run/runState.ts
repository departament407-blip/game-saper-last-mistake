import type { BoardState } from "../core/types";
import type { Biome } from "../data/biomes";
import type { Character } from "../data/characters";
import type { ClassicOperation } from "../data/operations";

export interface RunState {
  id: string;
  operation: ClassicOperation;
  biome: Biome;
  character: Character;
  board: BoardState;
  startedAt: number | null;
  endedAt: number | null;
}
