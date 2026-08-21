import type { ProgressRepository, SavedGameProgress } from "./progressTypes";

const KEY_PREFIX = "minesweeper:last-mistake:campaign-progress:";

export class LocalProgressRepository implements ProgressRepository {
  async load(playerId: string): Promise<SavedGameProgress | null> {
    try {
      const raw = localStorage.getItem(getKey(playerId));
      const parsed = raw ? JSON.parse(raw) as Partial<SavedGameProgress> : null;

      if (!parsed?.campaign || parsed.version !== 1) {
        return null;
      }

      return parsed as SavedGameProgress;
    } catch {
      return null;
    }
  }

  async save(progress: SavedGameProgress): Promise<void> {
    localStorage.setItem(getKey(progress.playerIdentity.playerId), JSON.stringify(progress));
  }

  async clear(playerId: string): Promise<void> {
    localStorage.removeItem(getKey(playerId));
  }

  async has(playerId: string): Promise<boolean> {
    return localStorage.getItem(getKey(playerId)) !== null;
  }
}

function getKey(playerId: string): string {
  return `${KEY_PREFIX}${playerId}`;
}
