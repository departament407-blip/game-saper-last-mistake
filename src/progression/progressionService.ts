import { ACHIEVEMENTS } from "../data/achievements";
import { getCharacterBaseHp } from "../data/characters";
import { MEDALS } from "../data/medals";
import { getCharacterPerks } from "../data/perks";
import { getHpBonusByXp, getPerkTierByXp, getRankUpHealAmount } from "../data/rankBenefits";
import { getNextRank, getRankById, getRankByXp } from "../data/ranks";
import type { CampaignMode, MissionContext, MissionResult, OperativeSessionProfile } from "./campaignTypes";
import { calculateFlagDiscipline } from "./xpRewardCalculator";

const SERGEI_SURVIVAL_PREFIX = "sergei-cycle-survival";
const SERGEI_PENDING_XP_KEY = "sergei-next-success-xp";
const ISKRA_SOLO_REVIVE_PREFIX = "iskra-solo-revive";

export function resolveMissionProgress(
  previous: OperativeSessionProfile,
  context: MissionContext,
  campaignMode: CampaignMode,
  sessionEnded: boolean
): MissionResult {
  const previousRank = getRankById(previous.rankId);
  const discipline = context.outcome === "won" && previous.id === "sych" && previous.unlockedPerkIds.includes("sych-flag-discipline")
    ? calculateFlagDiscipline(context.operation, context.manualFlagPlacements, getPerkTierByXp(previous.xp))
    : null;
  const directPerks = context.outcome === "won"
    ? getDirectWinPerkBonus(previous, context, campaignMode)
    : { bonus: 0, events: [] };
  const xpAwarded = context.outcome === "won" ? context.operation.xpWin + directPerks.bonus : 0;
  const built = buildNextProfile(previous, context, xpAwarded, campaignMode);
  const newAchievementIds = context.outcome === "won" ? getNewAchievementIds(previous, built.profile, context) : [];
  const newMedalIds = context.outcome === "won" ? getNewMedalIds(previous, context) : [];
  const newPerkIds = context.outcome === "won" ? getNewPerkIds(previous, built.profile, context) : [];
  const currentRank = getRankByXp(built.profile.xp);
  const profile = {
    ...built.profile,
    rankId: currentRank.id,
    unlockedAchievementIds: unique([...built.profile.unlockedAchievementIds, ...newAchievementIds]),
    unlockedMedalIds: unique([...built.profile.unlockedMedalIds, ...newMedalIds]),
    unlockedPerkIds: unique([...built.profile.unlockedPerkIds, ...newPerkIds])
  };

  return {
    outcome: context.outcome,
    manualFlagPlacements: context.manualFlagPlacements,
    automaticFlagPlacements: context.automaticFlagPlacements ?? 0,
    elapsedSeconds: context.elapsedSeconds,
    xpAwarded,
    previousRank,
    currentRank,
    nextRank: getNextRank(profile.xp),
    newAchievementIds,
    newMedalIds,
    newPerkIds,
    profile,
    campaignMode,
    cycle: context.operation.cycle,
    sessionEnded,
    campaignCompleted: false,
    perkEvents: unique([...(context.perkEvents ?? []), ...directPerks.events, ...built.events]),
    flagDiscipline: discipline ? {
      ...discipline,
      recipients: [{ characterId: previous.id, disciplineXp: discipline.bonusXpPerOperative, totalXp: xpAwarded }]
    } : null
  };
}

function buildNextProfile(
  previous: OperativeSessionProfile,
  context: MissionContext,
  xpAwarded: number,
  campaignMode: CampaignMode
): { profile: OperativeSessionProfile; events: string[] } {
  if (context.outcome === "lost") {
    return buildLostProfile(previous, context, campaignMode);
  }

  return buildWonProfile(previous, context, xpAwarded, campaignMode);
}

function buildLostProfile(
  previous: OperativeSessionProfile,
  context: MissionContext,
  campaignMode: CampaignMode
): { profile: OperativeSessionProfile; events: string[] } {
  const events: string[] = [];
  const damageTaken = Math.max(0, context.damageTaken ?? 3);
  const armorAbsorbed = Math.max(0, context.armorAbsorbed ?? 0);
  const damagedHp = Math.max(0, previous.hp - damageTaken);
  const perkTier = getPerkTierByXp(previous.xp);

  if (armorAbsorbed > 0) {
    events.push(`Тяжёлая высадка: броня поглотила ${armorAbsorbed} HP урона.`);
  }

  if (canSergeiSurvive(previous, context, damagedHp)) {
    const survivalHp = perkTier >= 2 ? 2 : 1;
    const usedPerkKeys = [...previous.usedPerkKeys, `${SERGEI_SURVIVAL_PREFIX}-${context.operation.cycle}`];

    if (perkTier >= 3) {
      usedPerkKeys.push(SERGEI_PENDING_XP_KEY);
    }

    events.push(`Запас плавучести: Сергей пережил смертельный подрыв и остался с ${survivalHp} HP.`);

    if (perkTier >= 3) {
      events.push("Запас плавучести: следующая успешная операция Сергея даст +20% XP.");
    }

    return {
      profile: {
        ...previous,
        hp: Math.min(previous.maxHp, survivalHp),
        status: "active",
        losses: previous.losses + 1,
        currentWinStreak: 0,
        usedPerkKeys: unique(usedPerkKeys)
      },
      events
    };
  }

  const iskraRevive = tryIskraSoloRevive(previous, context, campaignMode, damagedHp, perkTier);

  if (iskraRevive) {
    return {
      profile: {
        ...previous,
        hp: iskraRevive.succeeded ? 1 : damagedHp,
        status: iskraRevive.succeeded ? "active" : "fallen",
        losses: previous.losses + 1,
        currentWinStreak: 0,
        usedPerkKeys: unique([...previous.usedPerkKeys, `${ISKRA_SOLO_REVIVE_PREFIX}-${context.operation.cycle}`]),
        fallenAt: iskraRevive.succeeded ? previous.fallenAt : Date.now(),
        fallenOperationId: iskraRevive.succeeded ? previous.fallenOperationId : context.operation.id
      },
      events: [...events, iskraRevive.event]
    };
  }

  return {
    profile: {
      ...previous,
      hp: damagedHp,
      status: damagedHp <= 0 ? "fallen" : "active",
      losses: previous.losses + 1,
      currentWinStreak: 0,
      fallenAt: damagedHp <= 0 ? Date.now() : previous.fallenAt,
      fallenOperationId: damagedHp <= 0 ? context.operation.id : previous.fallenOperationId
    },
    events
  };
}

function buildWonProfile(
  previous: OperativeSessionProfile,
  context: MissionContext,
  xpAwarded: number,
  campaignMode: CampaignMode
): { profile: OperativeSessionProfile; events: string[] } {
  const bestResult = previous.bestResultsByOperation[context.operation.id];
  const nextBestResults = { ...previous.bestResultsByOperation };
  const nextXp = previous.xp + xpAwarded;
  const nextMaxHp = getMaxHp(context.character.id, nextXp);
  const rankHeal = getRankUpHealAmount(previous.xp, nextXp);
  const perkTier = getPerkTierByXp(previous.xp);
  const sychNightHeal = context.character.id === "sych" &&
    previous.unlockedPerkIds.includes("sych-night-patience") &&
    (context.wrongFlagsPlaced ?? 0) === 0 &&
    perkTier >= 3
    ? 1
    : 0;
  const events = sychNightHeal > 0
    ? ["Ночная выдержка: Сыч восстановил 1 HP после чистой операции."]
    : [];

  if (!bestResult || context.elapsedSeconds < bestResult.elapsedSeconds) {
    nextBestResults[context.operation.id] = {
      playerId: context.playerId,
      playerName: context.playerName,
      displayName: context.displayName,
      mode: campaignMode,
      cycle: context.operation.cycle,
      operationId: context.operation.id,
      operationIndex: context.operation.operationIndex,
      operationLabel: context.operation.label,
      biomeId: context.biome.id,
      boardWidth: context.operation.cols,
      boardHeight: context.operation.rows,
      mineCount: context.operation.mines,
      elapsedSeconds: context.elapsedSeconds,
      xpAwarded,
      score: Math.max(0, xpAwarded - context.elapsedSeconds)
    };
  }

  const currentWinStreak = previous.currentWinStreak + 1;

  return {
    profile: {
      ...previous,
      xp: nextXp,
      maxHp: nextMaxHp,
      hp: Math.min(nextMaxHp, previous.hp + rankHeal + sychNightHeal),
      wins: previous.wins + 1,
      bestResultsByOperation: nextBestResults,
      currentWinStreak,
      bestWinStreak: Math.max(previous.bestWinStreak, currentWinStreak),
      wonBiomeIds: Array.from(new Set([...previous.wonBiomeIds, context.biome.id])),
      usedPerkKeys: previous.usedPerkKeys.filter((key) => key !== SERGEI_PENDING_XP_KEY)
    },
    events
  };
}

function getDirectWinPerkBonus(
  previous: OperativeSessionProfile,
  context: MissionContext,
  campaignMode: CampaignMode
): { bonus: number; events: string[] } {
  const events: string[] = [];
  const perkTier = getPerkTierByXp(previous.xp);
  let bonus = 0;

  if (previous.id === "sergei" && previous.usedPerkKeys.includes(SERGEI_PENDING_XP_KEY)) {
    const amount = Math.round(context.operation.xpWin * 0.2);
    bonus += amount;
    events.push(`Запас плавучести: Сергей получил +${amount} XP за следующую успешную операцию после спасения.`);
  }

  if (previous.id === "sych" && previous.unlockedPerkIds.includes("sych-flag-discipline")) {
    const discipline = calculateFlagDiscipline(context.operation, context.manualFlagPlacements, perkTier);
    bonus += discipline.bonusXpPerOperative;

    if (discipline.bonusXpPerOperative > 0) {
      events.push(`Флажковая дисциплина: +${discipline.bonusXpPerOperative} XP за ${discipline.unusedFlagBudget} неиспользованных флагов (${discipline.manualFlagPlacements} ручных постановок).`);
    }
  }

  if (previous.id === "sych" && previous.unlockedPerkIds.includes("sych-night-patience")) {
    if ((context.wrongFlagsPlaced ?? 0) === 0) {
      const amount = [20, 40, 60][perkTier - 1] ?? 20;
      bonus += amount;
      events.push(`Ночная выдержка: +${amount} XP за операцию без неверных флагов.`);
    } else {
      events.push("Ночная выдержка не сработала: был неверный флаг.");
    }
  }

  if (previous.id === "olga" && previous.unlockedPerkIds.includes("olga-shared-analysis") && campaignMode === "solo") {
    const percent = [0.2, 0.3, 0.4][perkTier - 1] ?? 0.2;
    const amount = Math.round(context.operation.xpWin * percent);
    bonus += amount;
    events.push(`Общий расчёт: Ольга получила +${amount} XP (${Math.round(percent * 100)}%).`);
  }

  if (previous.id === "olga" && previous.unlockedPerkIds.includes("olga-reserve-staff") && campaignMode === "solo") {
    const amount = [25, 50, 75][perkTier - 1] ?? 25;
    bonus += amount;
    events.push(`Кадровый резерв: Ольга получила +${amount} XP.`);
  }

  if (previous.id === "iskra" && previous.unlockedPerkIds.includes("iskra-field-medicine") && campaignMode === "solo" && perkTier >= 3) {
    bonus += 20;
    events.push("Полевой протокол: Искра получила +20 XP на третьей ступени.");
  }

  return { bonus, events };
}

function canSergeiSurvive(previous: OperativeSessionProfile, context: MissionContext, damagedHp: number): boolean {
  return context.character.id === "sergei" &&
    previous.unlockedPerkIds.includes("sergei-cycle-survival") &&
    !previous.usedPerkKeys.includes(`${SERGEI_SURVIVAL_PREFIX}-${context.operation.cycle}`) &&
    damagedHp <= 0;
}

function tryIskraSoloRevive(
  previous: OperativeSessionProfile,
  context: MissionContext,
  campaignMode: CampaignMode,
  damagedHp: number,
  perkTier: number
): { succeeded: boolean; event: string } | null {
  if (
    campaignMode !== "solo" ||
    context.character.id !== "iskra" ||
    !previous.unlockedPerkIds.includes("iskra-reanimation-chance") ||
    previous.usedPerkKeys.includes(`${ISKRA_SOLO_REVIVE_PREFIX}-${context.operation.cycle}`) ||
    damagedHp > 0
  ) {
    return null;
  }

  const chance = [0.1, 0.2, 0.3][perkTier - 1] ?? 0.1;
  const succeeded = Math.random() < chance;

  return {
    succeeded,
    event: succeeded
      ? `Реанимационный шанс: Искра пережила смертельный подрыв с 1 HP. Операция провалена, XP не начислен.`
      : `Реанимационный шанс: попытка была, но шанс ${Math.round(chance * 100)}% не сработал.`
  };
}

function getNewAchievementIds(
  previous: OperativeSessionProfile,
  next: OperativeSessionProfile,
  context: MissionContext
): string[] {
  const unlocked = new Set(previous.unlockedAchievementIds);
  const candidates = [
    next.wins === 1 ? "first-win" : null,
    next.wins >= 3 ? "three-wins" : null,
    next.wins >= 5 ? "five-wins" : null,
    context.biome.id === "forest" ? "forest-win" : null,
    context.biome.id === "desert" ? "desert-win" : null,
    context.biome.id === "sunflower" ? "sunflower-win" : null,
    context.biome.id === "factory" ? "factory-win" : null,
    context.biome.id === "sea" ? "sea-win" : null,
    context.operation.mines >= 55 ? "expert-win" : null,
    next.bestWinStreak >= 2 ? "two-win-streak" : null,
    next.bestWinStreak >= 3 ? "three-win-streak" : null,
    next.wonBiomeIds.length >= 5 ? "all-biomes-win" : null
  ];

  return candidates.filter((id): id is string => id !== null && !unlocked.has(id) && ACHIEVEMENTS.some((item) => item.id === id));
}

function getNewMedalIds(previous: OperativeSessionProfile, context: MissionContext): string[] {
  const unlocked = new Set(previous.unlockedMedalIds);
  const candidates = [
    context.flagsPlaced === 0 ? "no-flags-win" : null,
    context.operation.tier === "easy" ? "training-medal" : null,
    context.operation.tier === "medium" ? "border-medal" : null,
    context.operation.tier === "hard" ? "forest-road-medal" : null,
    context.operation.tier === "peak" ? "iron-square-medal" : null,
    context.operation.isEndgame ? "grand-sweep-medal" : null,
    context.operation.mines <= 18 && context.elapsedSeconds <= 60 ? "fast-small-win" : null,
    context.operation.mines >= 40 ? "hard-survivor" : null
  ];

  return candidates.filter((id): id is string => id !== null && !unlocked.has(id) && MEDALS.some((item) => item.id === id));
}

function getNewPerkIds(
  previous: OperativeSessionProfile,
  next: OperativeSessionProfile,
  context: MissionContext
): string[] {
  const unlocked = new Set(previous.unlockedPerkIds);

  return getCharacterPerks(context.character.id)
    .filter((perk) => next.xp >= perk.unlockMinXp)
    .filter((perk) => !unlocked.has(perk.id))
    .map((perk) => perk.id);
}

function getMaxHp(characterId: string, xp: number): number {
  return getCharacterBaseHp(characterId) + getHpBonusByXp(xp);
}

export function hasPerk(profile: OperativeSessionProfile, perkId: string): boolean {
  return profile.unlockedPerkIds.includes(perkId);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
