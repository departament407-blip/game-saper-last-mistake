export interface PlayerIdentity {
  playerId: string;
  displayName: string;
  email: string | null;
  createdAt: number;
  lastSeenAt: number;
}

const STORAGE_KEY = "minesweeper:last-mistake:player-identity";

export function loadPlayerIdentity(): PlayerIdentity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<PlayerIdentity> : null;

    if (parsed?.playerId) {
      return persistIdentity(normalizeIdentity(parsed));
    }
  } catch {
    // Ignore corrupted state and recreate it below.
  }

  const fallback: PlayerIdentity = {
    playerId: createPlayerId(),
    displayName: "",
    email: null,
    createdAt: Date.now(),
    lastSeenAt: Date.now()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  return fallback;
}

export function savePlayerIdentity(displayName: string, existing?: PlayerIdentity, email?: string | null): PlayerIdentity {
  const base = existing ?? loadPlayerIdentity();
  const next: PlayerIdentity = {
    playerId: base.playerId,
    displayName: displayName.trim(),
    email: email === undefined ? base.email : normalizeEmail(email),
    createdAt: base.createdAt,
    lastSeenAt: Date.now()
  };
  return persistIdentity(next);
}

function createPlayerId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeIdentity(value: Partial<PlayerIdentity>): PlayerIdentity {
  const now = Date.now();

  return {
    playerId: typeof value.playerId === "string" && value.playerId.trim() ? value.playerId : createPlayerId(),
    displayName: typeof value.displayName === "string" ? value.displayName : "",
    email: normalizeEmail(value.email ?? null),
    createdAt: typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? value.createdAt : now,
    lastSeenAt: now
  };
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim();
  return email.includes("@") ? email : null;
}

function persistIdentity(identity: PlayerIdentity): PlayerIdentity {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}
