import { apiJson } from "../api/apiClient";
import { LocalProgressRepository } from "./localProgressRepository";
import type { ProgressRepository, SavedGameProgress } from "./progressTypes";

export class ApiProgressRepository implements ProgressRepository {
  constructor(private readonly fallback = new LocalProgressRepository()) {}

  async load(playerId: string): Promise<SavedGameProgress | null> {
    try {
      const progress = await apiJson<SavedGameProgress | null>(`/progress/${encodeURIComponent(playerId)}`);
      return progress;
    } catch {
      return this.fallback.load(playerId);
    }
  }

  async save(progress: SavedGameProgress): Promise<void> {
    await this.fallback.save(progress);

    try {
      await apiJson<void>("/progress", {
        method: "PUT",
        body: JSON.stringify(progress)
      });
    } catch {
      // Local save is authoritative until a real backend is connected.
    }
  }

  async clear(playerId: string): Promise<void> {
    await this.fallback.clear(playerId);

    try {
      await apiJson<void>(`/progress/${encodeURIComponent(playerId)}`, {
        method: "DELETE"
      });
    } catch {
      // No backend configured or offline. Local state is already cleared.
    }
  }

  async has(playerId: string): Promise<boolean> {
    return (await this.load(playerId)) !== null;
  }
}
