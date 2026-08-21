import { hasApiBackend } from "../api/apiClient";
import { ApiLeaderboardRepository } from "./apiLeaderboardRepository";
import { LocalLeaderboardRepository } from "./localLeaderboardRepository";
import type { LeaderboardRepository } from "./leaderboardTypes";

export function createLeaderboardRepository(): LeaderboardRepository {
  return hasApiBackend() ? new ApiLeaderboardRepository() : new LocalLeaderboardRepository();
}
