import { hasApiBackend } from "../api/apiClient";
import { ApiProgressRepository } from "./apiProgressRepository";
import { LocalProgressRepository } from "./localProgressRepository";
import type { ProgressRepository } from "./progressTypes";

export function createProgressRepository(): ProgressRepository {
  return hasApiBackend() ? new ApiProgressRepository() : new LocalProgressRepository();
}
