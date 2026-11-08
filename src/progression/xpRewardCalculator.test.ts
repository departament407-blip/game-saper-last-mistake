import { describe, expect, it } from "vitest";
import { getBiome } from "../data/biomes";
import { getCharacter } from "../data/characters";
import { FALLBACK_OPERATION } from "../data/operations";
import { CampaignSessionStore } from "./campaignSessionStore";
import type { CampaignMode, MissionContext, MissionResult } from "./campaignTypes";
import { resolveMissionProgress } from "./progressionService";
import { calculateFlagDiscipline } from "./xpRewardCalculator";

function context(overrides: Partial<MissionContext> = {}): MissionContext {
  return {
    playerId: "xp-test",
    playerName: "XP test",
    displayName: "XP test",
    character: getCharacter("sych"),
    operation: { ...FALLBACK_OPERATION, mines: 18, xpWin: 125 },
    biome: getBiome("forest"),
    elapsedSeconds: 90,
    flagsPlaced: 0,
    manualFlagPlacements: 0,
    wrongFlagsPlaced: 0,
    outcome: "won",
    ...overrides
  };
}

function start(mode: CampaignMode = "squad"): CampaignSessionStore {
  const store = new CampaignSessionStore();
  store.startSession(mode, "xp-test", "XP test");
  if (mode === "solo") store.lockSoloOperative("sych");
  return store;
}

function finish(store: CampaignSessionStore, mission = context()): MissionResult {
  const result = resolveMissionProgress(store.getProfile(mission.character.id), mission, store.getMode(), false);
  store.updateProfile(mission.character.id, () => result.profile);
  return result;
}

describe("flag discipline reward formula", () => {
  it.each([
    { mines: 8, base: 60, tier: 1, xp: 10, percent: 16 },
    { mines: 18, base: 125, tier: 2, xp: 75, percent: 60 },
    { mines: 30, base: 220, tier: 3, xp: 132, percent: 60 },
    { mines: 50, base: 330, tier: 3, xp: 198, percent: 60 },
    { mines: 84, base: 610, tier: 3, xp: 366, percent: 60 },
    { mines: 99, base: 1200, tier: 3, xp: 720, percent: 60 }
  ])("caps the bonus at +60% for $mines mines at tier $tier", ({ mines, base, tier, xp, percent }) => {
    expect(calculateFlagDiscipline({ mines, xpWin: base }, 0, tier)).toEqual({
      mineCount: mines, manualFlagPlacements: 0, unusedFlagBudget: mines,
      perkRate: [0.02, 0.04, 0.06][tier - 1], bonusPercent: percent, bonusXpPerOperative: xp
    });
  });

  it.each([
    { tier: 1, threshold: 30, belowPercent: 58, belowXp: 73 },
    { tier: 2, threshold: 15, belowPercent: 56, belowXp: 70 },
    { tier: 3, threshold: 10, belowPercent: 54, belowXp: 68 }
  ])("keeps the tier $tier rate below the limit and caps at its threshold", ({ tier, threshold, belowPercent, belowXp }) => {
    const operation = { mines: threshold + 1, xpWin: 125 };
    expect(calculateFlagDiscipline(operation, 2, tier)).toMatchObject({ bonusPercent: belowPercent, bonusXpPerOperative: belowXp });
    expect(calculateFlagDiscipline(operation, 1, tier)).toMatchObject({ bonusPercent: 60, bonusXpPerOperative: 75 });
    expect(calculateFlagDiscipline(operation, 0, tier)).toMatchObject({ bonusPercent: 60, bonusXpPerOperative: 75 });
  });

  it("counts the history even after all flags have been removed", () => {
    const store = start();
    const result = finish(store, context({ flagsPlaced: 0, manualFlagPlacements: 20 }));
    expect(result.flagDiscipline).toMatchObject({ manualFlagPlacements: 20, unusedFlagBudget: 0, bonusPercent: 0, bonusXpPerOperative: 0 });
    expect(result.xpAwarded).toBe(125);
  });

  it("uses every repeated placement, not the final flag count", () => {
    const store = start();
    const removed = resolveMissionProgress(store.getProfile("sych"), context({ manualFlagPlacements: 1 }), "squad", false);
    const replaced = resolveMissionProgress(store.getProfile("sych"), context({ flagsPlaced: 1, manualFlagPlacements: 2 }), "squad", false);
    expect(removed.flagDiscipline?.bonusXpPerOperative).toBe(43);
    expect(replaced.flagDiscipline?.bonusXpPerOperative).toBe(40);
    expect(replaced.flagDiscipline?.unusedFlagBudget).toBe(16);
  });

  it("automatic flags do not consume the manual budget and are reported separately", () => {
    const store = start();
    const result = finish(store, context({ flagsPlaced: 4, manualFlagPlacements: 0, automaticFlagPlacements: 4 }));
    expect(result.flagDiscipline?.unusedFlagBudget).toBe(18);
    expect(result.flagDiscipline?.bonusXpPerOperative).toBe(45);
    expect(result.manualFlagPlacements).toBe(0);
    expect(result.automaticFlagPlacements).toBe(4);
  });

  it("uses the operative's tier before this reward, not a newly reached rank", () => {
    const store = start();
    store.updateProfile("sych", profile => ({ ...profile, xp: 170 }));
    const result = finish(store);
    expect(result.flagDiscipline?.perkRate).toBe(0.02);
    expect(result.xpAwarded).toBe(170);
    expect(result.profile.xp).toBe(340);
  });
});

describe("flag discipline squad distribution", () => {
  it.each([0, 180, 750])("applies the same +60% cap to Sych and all living squad members at %i XP", xp => {
    const store = start();
    store.updateProfile("sych", profile => ({ ...profile, xp, unlockedPerkIds: ["sych-flag-discipline"] }));
    const result = finish(store, context({ operation: { ...FALLBACK_OPERATION, mines: 99, xpWin: 1200 } }));
    const reward = store.applySychDisciplineReward(`capped-${xp}`, result);
    expect(result.xpAwarded).toBe(1920);
    expect(reward).toMatchObject({ bonusPercent: 60, bonusXpPerOperative: 720 });
    expect(reward?.recipients).toHaveLength(6);
    expect(reward?.recipients.every(recipient => recipient.disciplineXp === 720)).toBe(true);
    expect(reward?.recipients.reduce((total, recipient) => total + recipient.totalXp, 0)).toBe(5520);
    expect(store.getProfile("sych").xp).toBe(xp + 1920);
    for (const recipient of store.getVisibleProfiles().filter(profile => profile.id !== "sych")) {
      expect(recipient.xp).toBe(720);
    }
  });

  it("caps solo Sych at +60% without awarding other operatives", () => {
    const store = start("solo");
    const result = finish(store, context({ operation: { ...FALLBACK_OPERATION, mines: 99, xpWin: 1200 } }));
    const reward = store.applySychDisciplineReward("capped-solo", result);
    expect(reward?.recipients).toEqual([{ characterId: "sych", disciplineXp: 720, totalXp: 1920 }]);
    expect(store.getProfile("sych").xp).toBe(1920);
    expect(store.getProfile("rom").xp).toBe(0);
  });

  it("credits all six living operatives with one share and Sych with base XP only once", () => {
    const store = start();
    const result = finish(store);
    const reward = store.applySychDisciplineReward("run-1", result);
    expect(result.xpAwarded).toBe(170);
    expect(reward?.recipients).toHaveLength(6);
    expect(store.getProfile("sych").xp).toBe(170);
    for (const profile of store.getVisibleProfiles()) {
      expect(profile.xp).toBe(profile.id === "sych" ? 170 : 45);
    }
    expect(reward?.recipients.reduce((sum, recipient) => sum + recipient.totalXp, 0)).toBe(395);
    expect(reward?.recipients.reduce((sum, recipient) => sum + recipient.disciplineXp, 0)).toBe(270);
  });

  it("excludes fallen operatives and processes recipient rank, HP and perk unlocks", () => {
    const store = start();
    store.updateProfile("rom", profile => ({ ...profile, xp: 490, hp: 1 }));
    store.updateProfile("olga", profile => ({ ...profile, status: "fallen", hp: 0, xp: 490 }));
    const result = finish(store);
    const reward = store.applySychDisciplineReward("run-rank", result);
    expect(reward?.recipients).toHaveLength(5);
    expect(reward?.recipients.some(recipient => recipient.characterId === "olga")).toBe(false);
    expect(store.getProfile("olga").xp).toBe(490);
    const rom = store.getProfile("rom");
    expect(rom.xp).toBe(535);
    expect(rom.rankId).toBe("junior-sergeant");
    expect(rom.hp).toBe(2);
    expect(rom.unlockedPerkIds).toContain("rom-wild-intuition");
    expect(rom.wins).toBe(0);
    expect(rom.unlockedMedalIds).toEqual([]);
  });

  it("does not award any squad XP on defeat", () => {
    const store = start();
    const result = finish(store, context({ outcome: "lost" }));
    const afterResult = store.getState();
    expect(result.flagDiscipline).toBeNull();
    expect(result.xpAwarded).toBe(0);
    expect(store.applySychDisciplineReward("run-lost", result)).toBeNull();
    expect(store.getState()).toEqual(afterResult);
    expect(store.getVisibleProfiles().every(profile => profile.xp === 0)).toBe(true);
  });

  it("does not award the team twice for the same run or expose mutable receipts", () => {
    const store = start();
    const result = finish(store);
    const first = store.applySychDisciplineReward("run-repeat", result)!;
    const stateAfterFirst = store.getState();
    first.recipients.length = 0;
    const second = store.applySychDisciplineReward("run-repeat", result)!;
    expect(second.recipients).toHaveLength(6);
    expect(store.getState()).toEqual(stateAfterFirst);
  });

  it("gives only Sych the bonus in solo", () => {
    const store = start("solo");
    const result = finish(store);
    const reward = store.applySychDisciplineReward("run-solo", result);
    expect(reward?.recipients).toEqual([{ characterId: "sych", disciplineXp: 45, totalXp: 170 }]);
    expect(store.getProfile("sych").xp).toBe(170);
    expect(store.getProfile("rom").xp).toBe(0);
  });

  it("keeps the campaign persistence schema unchanged and resets receipts with a new session", () => {
    const store = start();
    const originalKeys = Object.keys(store.getState());
    const result = finish(store);
    store.applySychDisciplineReward("same-run-id", result);
    expect(Object.keys(store.getState())).toEqual(originalKeys);
    store.startSession("squad", "new", "New");
    const newResult = finish(store);
    expect(store.applySychDisciplineReward("same-run-id", newResult)?.recipients).toHaveLength(6);
    expect(store.getProfile("rom").xp).toBe(45);
  });
});
