export interface PlayerIdentity {
  playerId: string;
  displayName: string;
}

const STORAGE_KEY = "minesweeper:last-mistake:player-identity";

export function loadPlayerIdentity(): PlayerIdentity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<PlayerIdentity> : null;

    if (parsed?.playerId) {
      return {
        playerId: parsed.playerId,
        displayName: typeof parsed.displayName === "string" ? parsed.displayName : ""
      };
    }
  } catch {
    // Ignore corrupted state and recreate it below.
  }

  const fallback: PlayerIdentity = {
    playerId: createPlayerId(),
    displayName: ""
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  return fallback;
}

export function savePlayerIdentity(displayName: string, existing?: PlayerIdentity): PlayerIdentity {
  const next: PlayerIdentity = {
    playerId: existing?.playerId ?? loadPlayerIdentity().playerId,
    displayName: displayName.trim()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function createPlayerId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
