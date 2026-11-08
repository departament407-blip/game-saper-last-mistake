import {
  MAX_CAMPAIGN_CYCLES,
  generateCampaignCycle,
  generateCycleSpecialOperation,
  generateEndgameOperation
} from "../campaign/operationGenerator";
import { CHARACTERS, getCharacter, getCharacterBaseHp } from "../data/characters";
import { FALLBACK_OPERATION } from "../data/operations";
import { DOPING, getCharacterPerks } from "../data/perks";
import type { ClassicOperation } from "../data/operations";
import { getHpBonusByXp, getRankUpHealAmount } from "../data/rankBenefits";
import { RANKS, getRankByXp } from "../data/ranks";
import type { CampaignMode, CampaignSessionState, FlagDisciplineReward, MissionResult, OperativeSessionProfile } from "./campaignTypes";

export const CAMPAIGN_RULESETS = {
  squad: {
    mode: "squad",
    label: "Отряд",
    description: "Командир ведёт группу сапёров. Подрыв снимает 3 HP, а выбытие наступает только при падении запаса до нуля.",
    squadSize: CHARACTERS.length
  },
  solo: {
    mode: "solo",
    label: "Один оперативник",
    description: "Один выбранный сапёр. Замены нет, а каждый подрыв снимает 3 HP до полного выбытия.",
    squadSize: 1
  }
} as const;

export class CampaignSessionStore {
  private state = createFreshSession("squad", "local-preview-player", "Игрок");
  // Transient receipt ledger; run IDs are not part of the persisted campaign schema.
  private readonly disciplineReceipts = new Map<string, FlagDisciplineReward>();

  startSession(mode: CampaignMode, playerId: string, playerName: string): CampaignSessionState {
    this.disciplineReceipts.clear();
    this.state = createFreshSession(mode, playerId, playerName);
    return this.getState();
  }

  restoreSession(session: CampaignSessionState): CampaignSessionState {
    this.disciplineReceipts.clear();
    this.state = normalizeSession(session);
    return this.getState();
  }

  getState(): CampaignSessionState {
    return cloneSession(this.state);
  }

  getMode(): CampaignMode {
    return this.state.mode;
  }

  getPlayerId(): string {
    return this.state.playerId;
  }

  getPlayerName(): string {
    return this.state.playerName;
  }

  getCycle(): number {
    return this.state.cycle;
  }

  getDopingStatus(): { unlocked: boolean; charges: number } {
    const rom = this.getVisibleProfiles().find(profile => profile.id === "rom");
    // Rom's existing receipts survive saves, death/revival and cycle changes.
    const used = rom?.usedPerkKeys.filter(key => key.startsWith(DOPING.receiptPrefix)).length ?? 0;
    return {
      unlocked: Boolean(rom && rom.status === "active" && rom.xp >= DOPING.minXp),
      charges: Math.max(0, DOPING.usesPerCampaign - used)
    };
  }

  useDoping(characterId: string): { healed: number; charges: number } | null {
    const { unlocked, charges } = this.getDopingStatus();
    const target = this.getSelectableProfiles().find(profile => profile.id === characterId);
    if (!unlocked || charges === 0 || this.isSessionEnded() || !target || target.hp >= target.maxHp) return null;
    const healed = Math.min(DOPING.healAmount, target.maxHp - target.hp);
    this.updateProfile(characterId, profile => ({ ...profile, hp: profile.hp + healed }));
    this.updateProfile("rom", profile => ({ ...profile,
      usedPerkKeys: [...profile.usedPerkKeys, `${DOPING.receiptPrefix}${DOPING.usesPerCampaign - charges + 1}`]
    }));
    return { healed, charges: charges - 1 };
  }

  getOperationPool(): ClassicOperation[] {
    return this.state.operationPool.map((operation) => ({ ...operation }));
  }

  getOpenOperations(): ClassicOperation[] {
    const completed = new Set(this.state.completedOperationIds);
    return this.getOperationPool().filter((operation) => !completed.has(operation.id));
  }

  getOperationById(operationId: string): ClassicOperation {
    return this.state.operationPool.find((operation) => operation.id === operationId) ?? this.state.operationPool[0] ?? FALLBACK_OPERATION;
  }

  getProfile(characterId: string): OperativeSessionProfile {
    return cloneProfile(this.ensureProfile(characterId));
  }

  getVisibleProfiles(): OperativeSessionProfile[] {
    if (this.state.mode === "solo" && this.state.soloOperativeId) {
      return [this.getProfile(this.state.soloOperativeId)];
    }

    return this.state.rosterIds.map((id) => this.getProfile(id));
  }

  getSelectableProfiles(): OperativeSessionProfile[] {
    const selectableIds = this.state.mode === "solo" && this.state.soloOperativeId === null
      ? CHARACTERS.map((character) => character.id)
      : this.state.rosterIds;

    return selectableIds
      .map((id) => this.getProfile(id))
      .filter((profile) => profile.status === "active");
  }

  lockSoloOperative(characterId: string): void {
    if (this.state.mode !== "solo" || this.state.soloOperativeId) {
      return;
    }

    this.ensureProfile(characterId);
    this.state = {
      ...this.state,
      rosterIds: [characterId],
      soloOperativeId: characterId
    };
  }

  isSessionEnded(): boolean {
    return this.state.campaignCompleted || this.getSelectableProfiles().length === 0;
  }

  isCampaignCompleted(): boolean {
    return this.state.campaignCompleted;
  }

  closeOperation(operationId: string): void {
    if (this.state.completedOperationIds.includes(operationId) || this.state.campaignCompleted) {
      return;
    }

    const operation = this.getOperationById(operationId);
    const completedOperationIds = [...this.state.completedOperationIds, operationId];

    if (operation.isEndgame) {
      this.state = {
        ...this.state,
        completedOperationIds,
        campaignCompleted: true
      };
      return;
    }

    if (operation.tier === "special") {
      if (this.state.cycle >= MAX_CAMPAIGN_CYCLES) {
        this.state = {
          ...this.state,
          operationPool: [generateEndgameOperation()],
          completedOperationIds: [],
          endgameUnlocked: true
        };
        return;
      }

      const nextCycle = this.state.cycle + 1;
      this.state = {
        ...this.state,
        cycle: nextCycle,
        operationPool: generateCampaignCycle(nextCycle),
        completedOperationIds: []
      };
      return;
    }

    const currentPoolCompleted = this.state.operationPool.every((candidate) => completedOperationIds.includes(candidate.id));

    if (!currentPoolCompleted) {
      this.state = {
        ...this.state,
        completedOperationIds
      };
      return;
    }

    this.state = {
      ...this.state,
      operationPool: [generateCycleSpecialOperation(this.state.cycle)],
      completedOperationIds: []
    };
  }

  updateProfile(characterId: string, updater: (profile: OperativeSessionProfile) => OperativeSessionProfile): OperativeSessionProfile {
    const current = this.ensureProfile(characterId);
    const next = normalizeProfile(updater(cloneProfile(current)));
    this.state = {
      ...this.state,
      profiles: {
        ...this.state.profiles,
        [characterId]: next
      }
    };
    return cloneProfile(next);
  }

  /** Acting Sych has already received his share through resolveMissionProgress. */
  applySychDisciplineReward(runId: string, result: MissionResult): FlagDisciplineReward | null {
    if (result.outcome !== "won" || result.profile.id !== "sych" || result.profile.status !== "active" || !result.flagDiscipline) {
      return null;
    }
    const previousReceipt = this.disciplineReceipts.get(runId);
    if (previousReceipt) return structuredClone(previousReceipt);

    const reward = structuredClone(result.flagDiscipline);
    if (this.state.mode === "squad") {
      for (const recipient of this.getSelectableProfiles()) {
        if (recipient.id === result.profile.id) continue;
        if (reward.bonusXpPerOperative > 0) this.addXpToProfile(recipient.id, reward.bonusXpPerOperative);
        reward.recipients.push({
          characterId: recipient.id,
          disciplineXp: reward.bonusXpPerOperative,
          totalXp: reward.bonusXpPerOperative
        });
      }
    }
    this.disciplineReceipts.set(runId, structuredClone(reward));
    return reward;
  }

  applySupportPerks(sourceCharacterId: string, xpAwarded: number, perkTier: number): string[] {
    const source = this.ensureProfile(sourceCharacterId);

    if (source.status !== "active") {
      return [];
    }

    if (this.state.mode !== "squad" || source.id !== "olga" || !source.unlockedPerkIds.includes("olga-shared-analysis")) {
      return [];
    }

    const percent = [0.15, 0.25, 0.35][Math.min(3, Math.max(1, perkTier)) - 1] ?? 0.15;
    const amountPerRecipient = Math.round(xpAwarded * percent);
    const recipientCount = this.distributeXpToOtherActive(sourceCharacterId, amountPerRecipient);

    if (recipientCount === 0) {
      return ["Общий расчёт не сработал: нет другого живого оперативника."];
    }

    return [`Общий расчёт: Ольга передала по ${amountPerRecipient} XP другим оперативникам (${recipientCount}).`];
  }

  applyOlgaReserve(sourceCharacterId: string, perkTier: number): string[] {
    const source = this.ensureProfile(sourceCharacterId);

    if (this.state.mode !== "squad" || source.id !== "olga" || !source.unlockedPerkIds.includes("olga-reserve-staff")) {
      return [];
    }

    const candidates = this.getSelectableProfiles().filter((profile) => profile.id !== sourceCharacterId);

    if (candidates.length === 0) {
      return ["Кадровый резерв не сработал: нет другого живого оперативника."];
    }

    const amount = [50, 100, 150][Math.min(3, Math.max(1, perkTier)) - 1] ?? 50;
    const target = candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
    this.addXpToProfile(target.id, amount);

    return [`Кадровый резерв: ${getCharacter(target.id).name} получил +${amount} XP.`];
  }

  applyPostWinHealing(sourceCharacterId: string, perkTier: number): { profile: OperativeSessionProfile | null; events: string[] } {
    const source = this.ensureProfile(sourceCharacterId);

    if (source.id !== "iskra" || !source.unlockedPerkIds.includes("iskra-field-medicine")) {
      return { profile: null, events: [] };
    }

    if (this.state.mode === "solo") {
      const amount = perkTier >= 2 ? 2 : 1;
      const healed = this.healProfile(source.id, amount);
      return {
        profile: healed,
        events: [`Полевой протокол: Искра восстановила ${amount} HP себе.`]
      };
    }

    const candidates = this.getSelectableProfiles().filter((profile) => profile.hp < profile.maxHp);

    if (candidates.length === 0) {
      return { profile: null, events: ["Полевой протокол не сработал: всем живым уже хватает HP."] };
    }

    if (perkTier >= 3) {
      const healedIds: string[] = [];
      candidates.forEach((candidate) => {
        this.healProfile(candidate.id, 1);
        healedIds.push(candidate.id);
      });

      return {
        profile: healedIds.includes(source.id) ? this.getProfile(source.id) : null,
        events: [`Полевой протокол: Искра восстановила 1 HP всем раненым живым оперативникам (${healedIds.length}).`]
      };
    }

    const healCount = perkTier >= 2 ? 2 : 1;
    const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, healCount);
    let sourceProfile: OperativeSessionProfile | null = null;
    const names: string[] = [];

    shuffled.forEach((target) => {
      const healed = this.healProfile(target.id, 1);
      names.push(getCharacter(target.id).name);

      if (target.id === source.id) {
        sourceProfile = healed;
      }
    });

    return {
      profile: sourceProfile,
      events: [`Полевой протокол: Искра восстановила 1 HP — ${names.join(", ")}.`]
    };
  }

  applyIskraReanimation(sourceCharacterId: string, perkTier: number): string[] {
    const source = this.ensureProfile(sourceCharacterId);

    if (this.state.mode !== "squad" || source.id !== "iskra" || !source.unlockedPerkIds.includes("iskra-reanimation-chance")) {
      return [];
    }

    const fallen = this.state.rosterIds
      .map((id) => this.ensureProfile(id))
      .filter((profile) => profile.status === "fallen");

    if (fallen.length === 0) {
      return ["Реанимация не понадобилась: павших нет."];
    }

    const chance = [0.1, 0.2, 0.3][Math.min(3, Math.max(1, perkTier)) - 1] ?? 0.1;
    const target = fallen[Math.floor(Math.random() * fallen.length)] ?? fallen[0];

    if (Math.random() >= chance) {
      return [`Реанимационный шанс: попытка была, но шанс ${Math.round(chance * 100)}% не сработал.`];
    }

    this.updateProfile(target.id, (profile) => ({
      ...profile,
      status: "active",
      hp: 1,
      fallenAt: null,
      fallenOperationId: null
    }));

    return [`Реанимационный шанс: ${getCharacter(target.id).name} возвращён в строй с 1 HP.`];
  }

  private ensureProfile(characterId: string): OperativeSessionProfile {
    const existing = this.state.profiles[characterId];

    if (existing) {
      return existing;
    }

    const fresh = createEmptyProfile(characterId);
    this.state = {
      ...this.state,
      profiles: {
        ...this.state.profiles,
        [characterId]: fresh
      }
    };
    return fresh;
  }

  private distributeXpToOtherActive(sourceCharacterId: string, amountPerRecipient: number): number {
    const recipients = this.getSelectableProfiles().filter((profile) => profile.id !== sourceCharacterId);

    if (recipients.length === 0 || amountPerRecipient <= 0) {
      return 0;
    }

    recipients.forEach((recipient) => {
      this.addXpToProfile(recipient.id, amountPerRecipient);
    });

    return recipients.length;
  }

  private addXpToProfile(characterId: string, amount: number): OperativeSessionProfile {
    return this.updateProfile(characterId, (profile) => {
      const nextXp = profile.xp + Math.max(0, amount);
      const nextMaxHp = getMaxHp(profile.id, nextXp);
      const healAmount = getRankUpHealAmount(profile.xp, nextXp);

      return {
        ...profile,
        xp: nextXp,
        maxHp: nextMaxHp,
        hp: Math.min(nextMaxHp, profile.hp + healAmount),
        unlockedPerkIds: unique([
          ...profile.unlockedPerkIds,
          ...getCharacterPerks(profile.id).filter((perk) => nextXp >= perk.unlockMinXp).map((perk) => perk.id)
        ])
      };
    });
  }

  private healProfile(characterId: string, amount: number): OperativeSessionProfile {
    return this.updateProfile(characterId, (profile) => ({
      ...profile,
      hp: Math.min(profile.maxHp, profile.hp + amount)
    }));
  }
}

function createFreshSession(mode: CampaignMode, playerId: string, playerName: string): CampaignSessionState {
  const rosterIds = CHARACTERS.map((character) => character.id);

  return {
    id: createSessionId(),
    mode,
    playerId,
    playerName,
    startedAt: Date.now(),
    cycle: 1,
    rosterIds,
    soloOperativeId: null,
    operationPool: generateCampaignCycle(1),
    completedOperationIds: [],
    endgameUnlocked: false,
    campaignCompleted: false,
    profiles: Object.fromEntries(rosterIds.map((characterId) => [characterId, createEmptyProfile(characterId)]))
  };
}

function createEmptyProfile(characterId: string): OperativeSessionProfile {
  const character = CHARACTERS.find((item) => item.id === characterId);
  const maxHp = getMaxHp(characterId, 0);

  return {
    id: characterId,
    status: "active",
    xp: 0,
    rankId: RANKS[0].id,
    hp: maxHp,
    maxHp,
    wins: 0,
    losses: 0,
    bestResultsByOperation: {},
    unlockedAchievementIds: [],
    unlockedMedalIds: [],
    unlockedPerkIds: character ? [character.startingPerkId] : [],
    currentWinStreak: 0,
    bestWinStreak: 0,
    wonBiomeIds: [],
    usedPerkKeys: [],
    fallenAt: null,
    fallenOperationId: null
  };
}

function normalizeProfile(profile: OperativeSessionProfile): OperativeSessionProfile {
  const xp = Math.max(0, Number(profile.xp) || 0);
  const maxHp = getMaxHp(profile.id, xp);
  const hpInput = profile.hp === undefined ? maxHp : Number(profile.hp);
  const hp = Math.max(0, Math.min(maxHp, Number.isFinite(hpInput) ? hpInput : maxHp));
  const status = hp <= 0 || profile.status === "fallen" ? "fallen" : "active";

  return {
    id: profile.id,
    status,
    xp,
    rankId: getRankByXp(xp).id,
    hp,
    maxHp,
    wins: Math.max(0, Number(profile.wins) || 0),
    losses: Math.max(0, Number(profile.losses) || 0),
    bestResultsByOperation: profile.bestResultsByOperation ?? {},
    unlockedAchievementIds: unique(profile.unlockedAchievementIds ?? []),
    unlockedMedalIds: unique(profile.unlockedMedalIds ?? []),
    unlockedPerkIds: unique([...(profile.unlockedPerkIds ?? []), ...(profile.id === "rom" && xp >= DOPING.minXp ? [DOPING.id] : [])]),
    currentWinStreak: Math.max(0, Number(profile.currentWinStreak) || 0),
    bestWinStreak: Math.max(0, Number(profile.bestWinStreak) || 0),
    wonBiomeIds: unique(profile.wonBiomeIds ?? []),
    usedPerkKeys: unique(profile.usedPerkKeys ?? []),
    fallenAt: profile.fallenAt ?? null,
    fallenOperationId: profile.fallenOperationId ?? null
  };
}

function cloneSession(session: CampaignSessionState): CampaignSessionState {
  return {
    id: session.id,
    mode: session.mode,
    playerId: session.playerId,
    playerName: session.playerName,
    startedAt: session.startedAt,
    cycle: session.cycle,
    rosterIds: [...session.rosterIds],
    soloOperativeId: session.soloOperativeId,
    operationPool: session.operationPool.map((operation) => ({ ...operation })),
    completedOperationIds: [...session.completedOperationIds],
    endgameUnlocked: session.endgameUnlocked,
    campaignCompleted: session.campaignCompleted,
    profiles: Object.fromEntries(
      Object.entries(session.profiles).map(([characterId, profile]) => [characterId, cloneProfile(profile)])
    )
  };
}

function normalizeSession(session: CampaignSessionState): CampaignSessionState {
  const fallback = createFreshSession(session.mode === "solo" ? "solo" : "squad", session.playerId || "local-preview-player", session.playerName || "Игрок");
  const rosterIds = Array.isArray(session.rosterIds) && session.rosterIds.length > 0
    ? session.rosterIds.filter((id) => CHARACTERS.some((character) => character.id === id))
    : fallback.rosterIds;
  const profiles = Object.fromEntries(
    rosterIds.map((characterId) => {
      const profile = session.profiles?.[characterId] ?? createEmptyProfile(characterId);
      return [characterId, normalizeProfile(profile)];
    })
  );

  return {
    id: typeof session.id === "string" ? session.id : fallback.id,
    mode: session.mode === "solo" ? "solo" : "squad",
    playerId: typeof session.playerId === "string" ? session.playerId : fallback.playerId,
    playerName: typeof session.playerName === "string" ? session.playerName : fallback.playerName,
    startedAt: typeof session.startedAt === "number" ? session.startedAt : fallback.startedAt,
    cycle: Math.max(1, Math.min(MAX_CAMPAIGN_CYCLES, Number(session.cycle) || fallback.cycle)),
    rosterIds,
    soloOperativeId: typeof session.soloOperativeId === "string" ? session.soloOperativeId : null,
    operationPool: Array.isArray(session.operationPool) && session.operationPool.length > 0
      ? session.operationPool.map((operation) => ({ ...operation }))
      : fallback.operationPool,
    completedOperationIds: Array.isArray(session.completedOperationIds) ? [...session.completedOperationIds] : [],
    endgameUnlocked: Boolean(session.endgameUnlocked),
    campaignCompleted: Boolean(session.campaignCompleted),
    profiles
  };
}

function cloneProfile(profile: OperativeSessionProfile): OperativeSessionProfile {
  return {
    ...profile,
    bestResultsByOperation: structuredClone(profile.bestResultsByOperation),
    unlockedAchievementIds: [...profile.unlockedAchievementIds],
    unlockedMedalIds: [...profile.unlockedMedalIds],
    unlockedPerkIds: [...profile.unlockedPerkIds],
    wonBiomeIds: [...profile.wonBiomeIds],
    usedPerkKeys: [...profile.usedPerkKeys]
  };
}

function getMaxHp(characterId: string, xp: number): number {
  return getCharacterBaseHp(characterId) + getHpBonusByXp(xp);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `campaign-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
