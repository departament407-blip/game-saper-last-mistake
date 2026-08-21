import type { Language } from "../localization/i18n";
import type { PlayerIdentity } from "../player/playerIdentity";
import type { CampaignSessionState } from "../progression/campaignTypes";

export interface SavedGameProgress {
  version: 1;
  playerIdentity: PlayerIdentity;
  language: Language;
  campaign: CampaignSessionState;
  savedAt: number;
}

export interface ProgressRepository {
  load(playerId: string): Promise<SavedGameProgress | null>;
  save(progress: SavedGameProgress): Promise<void>;
  clear(playerId: string): Promise<void>;
  has(playerId: string): Promise<boolean>;
}
