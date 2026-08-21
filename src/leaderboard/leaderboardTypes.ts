import type { BiomeId } from "../data/biomes";
import type { CampaignMode } from "../progression/campaignTypes";

export interface LeaderboardRecord {
  id: string;
  playerId: string;
  playerName: string;
  mode: CampaignMode;
  cycleIndex: number;
  operationIndex: number | null;
  operationId: string;
  operationName: string;
  biomeId: BiomeId;
  biomeName: string;
  boardRows: number;
  boardCols: number;
  mineCount: number;
  operativeId: string;
  operativeName: string;
  elapsedSeconds: number;
  score: number;
  result: "win";
  createdAt: number;
  baseOperationXp: number;
  parTimeSeconds: number;
  medalsEarnedCount: number;
  remainingHp: number;
  rankIndex: number;
  rankBonus: number;
  scoreBreakdown: LeaderboardScoreBreakdown;
  usedPerks: string[];
}

export type LeaderboardRecordInput = Omit<LeaderboardRecord, "id" | "createdAt" | "result"> & {
  result?: "win";
};

export interface OperationLeaderboardFilter {
  mode: CampaignMode;
  cycleIndex: number;
  operationIndex: number | null;
}

export interface GlobalLeaderboardRecord {
  playerId: string;
  playerName: string;
  totalScore: number;
  wins: number;
  bestCycleIndex: number;
  bestOperationIndex: number | null;
  topOperativeName: string;
}

export interface LeaderboardRepository {
  saveRecord(record: LeaderboardRecordInput): Promise<LeaderboardRecord>;
  getOperationRecords(filter: OperationLeaderboardFilter): Promise<LeaderboardRecord[]>;
  getAllLocalRecords(): Promise<LeaderboardRecord[]>;
  getGlobalRecords(): Promise<GlobalLeaderboardRecord[]>;
}

export interface ScoreInput {
  baseOperationXp: number;
  parTimeSeconds: number;
  elapsedSeconds: number;
  remainingHp?: number;
  medalsEarnedCount?: number;
  rankIndex?: number;
}

export interface LeaderboardScoreBreakdown {
  baseOperationXp: number;
  timeBonus: number;
  hpBonus: number;
  medalBonus: number;
  rankBonus: number;
  total: number;
}

export function calculateLeaderboardScore(input: ScoreInput): number {
  return getLeaderboardScoreBreakdown(input).total;
}

export function getLeaderboardScoreBreakdown(input: ScoreInput): LeaderboardScoreBreakdown {
  const timeBonus = Math.max(0, input.parTimeSeconds - input.elapsedSeconds) * 2;
  const hpBonus = Math.max(0, input.remainingHp ?? 0) * 10;
  const medalBonus = Math.max(0, input.medalsEarnedCount ?? 0) * 25;
  const rankBonus = Math.max(0, input.rankIndex ?? 0) * 10;
  const total = Math.max(0, Math.round(input.baseOperationXp + timeBonus + hpBonus + medalBonus + rankBonus));

  return {
    baseOperationXp: input.baseOperationXp,
    timeBonus,
    hpBonus,
    medalBonus,
    rankBonus,
    total
  };
}
