import { getBiome } from "../data/biomes";
import type { BiomeId } from "../data/biomes";
import type {
  GlobalLeaderboardRecord,
  LeaderboardRecord,
  LeaderboardRecordInput,
  LeaderboardRepository,
  OperationLeaderboardFilter
} from "./leaderboardTypes";

const STORAGE_KEY = "minesweeper:last-mistake:leaderboard-records";
const LEGACY_STORAGE_KEY = "minesweeper:last-mistake:local-records";
const MAX_LOCAL_RECORDS = 250;

export class LocalLeaderboardRepository implements LeaderboardRepository {
  async saveRecord(record: LeaderboardRecordInput): Promise<LeaderboardRecord> {
    const nextRecord: LeaderboardRecord = {
      ...record,
      id: createRecordId(),
      result: "win",
      createdAt: Date.now()
    };
    const records = [nextRecord, ...await this.getAllLocalRecords()]
      .sort(compareRecords)
      .slice(0, MAX_LOCAL_RECORDS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return nextRecord;
  }

  async getOperationRecords(filter: OperationLeaderboardFilter): Promise<LeaderboardRecord[]> {
    return (await this.getAllLocalRecords())
      .filter((record) => (
        record.mode === filter.mode &&
        record.cycleIndex === filter.cycleIndex &&
        record.operationIndex === filter.operationIndex
      ))
      .sort(compareRecords)
      .slice(0, 20);
  }

  async getAllLocalRecords(): Promise<LeaderboardRecord[]> {
    const records = readRecords(STORAGE_KEY);
    const legacyRecords = readRecords(LEGACY_STORAGE_KEY);
    return [...records, ...legacyRecords].sort(compareRecords);
  }

  async getGlobalRecords(): Promise<GlobalLeaderboardRecord[]> {
    return buildGlobalRecords(await this.getAllLocalRecords());
  }
}

function readRecords(storageKey: string): LeaderboardRecord[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeRecord).sort(compareRecords) : [];
  } catch {
    return [];
  }
}

function normalizeRecord(record: Partial<LeaderboardRecord> & Record<string, unknown>): LeaderboardRecord {
  const legacyCycle = numberValue(record.cycle);
  const legacyOperationLabel = stringValue(record.operationLabel);
  const legacyCharacterId = stringValue(record.characterId);
  const legacyCharacterName = stringValue(record.characterName);
  const legacyBoardHeight = numberValue(record.boardHeight);
  const legacyBoardWidth = numberValue(record.boardWidth);
  const biomeId = normalizeBiomeId(record.biomeId);
  const biome = getBiome(biomeId);
  const elapsedSeconds = positiveNumber(record.elapsedSeconds, 999);
  const baseOperationXp = positiveNumber(record.baseOperationXp ?? record.xpAwarded, 0);
  const parTimeSeconds = positiveNumber(record.parTimeSeconds, getFallbackParTime(record.operationIndex));
  const remainingHp = positiveNumber(record.remainingHp, 0);
  const medalsEarnedCount = positiveNumber(record.medalsEarnedCount, 0);

  return {
    id: stringValue(record.id) || createRecordId(),
    playerId: stringValue(record.playerId) || "local-anonymous-player",
    playerName: stringValue(record.playerName) || stringValue(record.displayName) || "Локальный игрок",
    mode: record.mode === "solo" ? "solo" : "squad",
    cycleIndex: positiveNumber(record.cycleIndex, legacyCycle || 1),
    operationIndex: normalizeOperationIndex(record.operationIndex, record.operationId),
    operationId: stringValue(record.operationId) || "unknown",
    operationName: stringValue(record.operationName) || legacyOperationLabel || "Неизвестная операция",
    biomeId,
    biomeName: stringValue(record.biomeName) || biome.name,
    boardRows: positiveNumber(record.boardRows, legacyBoardHeight || 8),
    boardCols: positiveNumber(record.boardCols, legacyBoardWidth || 8),
    mineCount: positiveNumber(record.mineCount, 8),
    operativeId: stringValue(record.operativeId) || legacyCharacterId || "unknown",
    operativeName: stringValue(record.operativeName) || legacyCharacterName || "Оперативник",
    elapsedSeconds,
    score: positiveNumber(record.score, Math.max(0, baseOperationXp - elapsedSeconds)),
    result: "win",
    createdAt: positiveNumber(record.createdAt, Date.now()),
    baseOperationXp,
    parTimeSeconds,
    medalsEarnedCount,
    remainingHp,
    usedPerks: Array.isArray(record.usedPerks) ? record.usedPerks.map(String) : []
  };
}

function buildGlobalRecords(records: LeaderboardRecord[]): GlobalLeaderboardRecord[] {
  const buckets = new Map<string, {
    playerId: string;
    playerName: string;
    totalScore: number;
    wins: number;
    bestCycleIndex: number;
    bestOperationIndex: number | null;
    operativeScores: Map<string, { name: string; score: number }>;
  }>();

  records.forEach((record) => {
    const bucket = buckets.get(record.playerId) ?? {
      playerId: record.playerId,
      playerName: record.playerName,
      totalScore: 0,
      wins: 0,
      bestCycleIndex: 0,
      bestOperationIndex: null,
      operativeScores: new Map<string, { name: string; score: number }>()
    };
    bucket.totalScore += record.score;
    bucket.wins += 1;

    if (
      record.cycleIndex > bucket.bestCycleIndex ||
      (record.cycleIndex === bucket.bestCycleIndex && (record.operationIndex ?? 99) > (bucket.bestOperationIndex ?? 0))
    ) {
      bucket.bestCycleIndex = record.cycleIndex;
      bucket.bestOperationIndex = record.operationIndex;
    }

    const operative = bucket.operativeScores.get(record.operativeId) ?? { name: record.operativeName, score: 0 };
    operative.score += record.score;
    bucket.operativeScores.set(record.operativeId, operative);
    buckets.set(record.playerId, bucket);
  });

  return [...buckets.values()]
    .map((bucket) => {
      const topOperative = [...bucket.operativeScores.values()].sort((left, right) => right.score - left.score)[0];

      return {
        playerId: bucket.playerId,
        playerName: bucket.playerName,
        totalScore: bucket.totalScore,
        wins: bucket.wins,
        bestCycleIndex: bucket.bestCycleIndex,
        bestOperationIndex: bucket.bestOperationIndex,
        topOperativeName: topOperative?.name ?? "Нет данных"
      };
    })
    .sort((left, right) => right.totalScore - left.totalScore || right.wins - left.wins)
    .slice(0, 20);
}

function compareRecords(a: LeaderboardRecord, b: LeaderboardRecord): number {
  return b.score - a.score || a.elapsedSeconds - b.elapsedSeconds || b.createdAt - a.createdAt;
}

function normalizeOperationIndex(value: unknown, operationId: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof operationId === "string") {
    const match = operationId.match(/(?:op|special)-(\d+)/) ?? operationId.match(/op-(\d+)/);
    if (match) {
      return Number(match[1]);
    }
    if (operationId.includes("special")) {
      return 8;
    }
  }

  return null;
}

function getFallbackParTime(operationIndex: unknown): number {
  const index = typeof operationIndex === "number" ? operationIndex : 1;
  if (index <= 2) {
    return 90;
  }
  if (index <= 4) {
    return 180;
  }
  if (index <= 6) {
    return 300;
  }
  return 420;
}

function normalizeBiomeId(value: unknown): BiomeId {
  return value === "desert" || value === "sunflower" || value === "factory" || value === "sea"
    ? value
    : "forest";
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function createRecordId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `record-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
