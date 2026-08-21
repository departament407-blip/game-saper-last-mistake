import { apiJson } from "../api/apiClient";
import { LocalLeaderboardRepository } from "./localLeaderboardRepository";
import type {
  GlobalLeaderboardRecord,
  LeaderboardRecord,
  LeaderboardRecordInput,
  LeaderboardRepository,
  OperationLeaderboardFilter
} from "./leaderboardTypes";

export class ApiLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly fallback = new LocalLeaderboardRepository()) {}

  async saveRecord(record: LeaderboardRecordInput): Promise<LeaderboardRecord> {
    const savedLocal = await this.fallback.saveRecord(record);

    try {
      return await apiJson<LeaderboardRecord>("/leaderboard/records", {
        method: "POST",
        body: JSON.stringify(savedLocal)
      });
    } catch {
      return savedLocal;
    }
  }

  async getOperationRecords(filter: OperationLeaderboardFilter): Promise<LeaderboardRecord[]> {
    try {
      const params = new URLSearchParams({
        mode: filter.mode,
        cycleIndex: String(filter.cycleIndex),
        operationIndex: String(filter.operationIndex ?? "")
      });
      return await apiJson<LeaderboardRecord[]>(`/leaderboard/operations?${params}`);
    } catch {
      return this.fallback.getOperationRecords(filter);
    }
  }

  async getAllLocalRecords(): Promise<LeaderboardRecord[]> {
    return this.fallback.getAllLocalRecords();
  }

  async getGlobalRecords(): Promise<GlobalLeaderboardRecord[]> {
    try {
      return await apiJson<GlobalLeaderboardRecord[]>("/leaderboard/global");
    } catch {
      return this.fallback.getGlobalRecords();
    }
  }
}
