import type { BiomeId } from "../data/biomes";
import type { Biome } from "../data/biomes";
import type { Character } from "../data/characters";
import type { ClassicOperation } from "../data/operations";
import type { Rank } from "../data/ranks";

export type CampaignMode = "squad" | "solo";
export type OperativeStatus = "active" | "fallen";

export interface CampaignRuleset {
  mode: CampaignMode;
  label: string;
  description: string;
  squadSize: number;
}

export interface OperativeBestResult {
  playerId: string;
  playerName: string;
  displayName: string;
  mode: CampaignMode;
  cycle: number;
  operationId: string;
  operationIndex: number | null;
  operationLabel: string;
  biomeId: BiomeId;
  boardWidth: number;
  boardHeight: number;
  mineCount: number;
  elapsedSeconds: number;
  xpAwarded: number;
  score: number;
}

export interface OperativeSessionProfile {
  id: string;
  status: OperativeStatus;
  xp: number;
  rankId: string;
  hp: number;
  maxHp: number;
  wins: number;
  losses: number;
  bestResultsByOperation: Record<string, OperativeBestResult>;
  unlockedAchievementIds: string[];
  unlockedMedalIds: string[];
  unlockedPerkIds: string[];
  currentWinStreak: number;
  bestWinStreak: number;
  wonBiomeIds: string[];
  usedPerkKeys: string[];
  fallenAt: number | null;
  fallenOperationId: string | null;
}

export interface CampaignSessionState {
  id: string;
  mode: CampaignMode;
  playerId: string;
  playerName: string;
  startedAt: number;
  cycle: number;
  rosterIds: string[];
  soloOperativeId: string | null;
  operationPool: ClassicOperation[];
  completedOperationIds: string[];
  endgameUnlocked: boolean;
  campaignCompleted: boolean;
  profiles: Record<string, OperativeSessionProfile>;
}

export interface MissionResult {
  outcome: "won" | "lost";
  elapsedSeconds: number;
  xpAwarded: number;
  previousRank: Rank;
  currentRank: Rank;
  nextRank: Rank | null;
  newAchievementIds: string[];
  newMedalIds: string[];
  newPerkIds: string[];
  profile: OperativeSessionProfile;
  campaignMode: CampaignMode;
  cycle: number;
  sessionEnded: boolean;
  campaignCompleted: boolean;
  perkEvents: string[];
}

export interface MissionContext {
  playerId: string;
  playerName: string;
  displayName: string;
  character: Character;
  operation: ClassicOperation;
  biome: Biome;
  elapsedSeconds: number;
  flagsPlaced: number;
  wrongFlagsPlaced: number;
  damageTaken?: number;
  armorAbsorbed?: number;
  perkEvents?: string[];
  outcome: "won" | "lost";
}
