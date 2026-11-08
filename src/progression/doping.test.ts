import { describe, expect, it } from "vitest";
import { DOPING, getCharacterPerks } from "../data/perks";
import { getRankProgressionForCharacter } from "../data/rankProgression";
import { CampaignSessionStore } from "./campaignSessionStore";

function fixture(xp = DOPING.minXp, mode: "solo" | "squad" = "squad", soloId = "rom") {
  const store = new CampaignSessionStore();
  store.startSession(mode, "test", "Test");
  if (mode === "solo") store.lockSoloOperative(soloId);
  store.updateProfile("rom", profile => ({ ...profile, xp }));
  return store;
}
function wound(store: CampaignSessionStore, id: string, hp = 1) {
  store.updateProfile(id, profile => ({ ...profile, hp }));
}

describe("Rom's campaign-limited Doping", () => {
  it("belongs only to Rom and unlocks at 1750 XP", () => {
    const store = fixture(1749);
    wound(store, "olga");
    store.updateProfile("olga", profile => ({ ...profile, xp: 3000 }));
    expect(store.useDoping("olga")).toBeNull();
    expect(store.getDopingStatus()).toEqual({ unlocked: false, charges: 2 });
    store.updateProfile("rom", profile => ({ ...profile, xp: 1750 }));
    expect(store.getProfile("rom").unlockedPerkIds).toContain(DOPING.id);
    expect(store.getDopingStatus()).toEqual({ unlocked: true, charges: 2 });
    expect(getCharacterPerks("rom").map(perk => perk.id)).toEqual(["rom-drunk-master", "rom-wild-intuition", "rom-doping"]);
    expect(getRankProgressionForCharacter("rom")[8].bonuses.join(" ")).toContain("Допинг");
    expect(getRankProgressionForCharacter("olga")[8].bonuses.join(" ")).not.toContain("Допинг");
  });

  it("heals different living allies with exactly two shared uses and grants no XP", () => {
    const store = fixture();
    wound(store, "olga"); wound(store, "sergei");
    expect(store.useDoping("olga")).toEqual({ healed: 3, charges: 1 });
    expect(store.getProfile("olga").hp).toBe(4);
    expect(store.useDoping("sergei")).toEqual({ healed: 3, charges: 0 });
    const after = store.getState();
    expect(store.useDoping("olga")).toBeNull();
    expect(store.getState()).toEqual(after);
    expect(store.getProfile("olga").xp).toBe(0);
    expect(store.getProfile("rom").xp).toBe(1750);
    expect(store.getProfile("rom").usedPerkKeys).toEqual(["rom-doping:1", "rom-doping:2"]);
  });

  it("caps healing at max HP and spends no use on full HP, fallen or invalid targets", () => {
    const store = fixture();
    expect(store.useDoping("olga")).toBeNull();
    expect(store.useDoping("missing")).toBeNull();
    wound(store, "iskra", 0);
    expect(store.useDoping("iskra")).toBeNull();
    expect(store.getProfile("iskra").hp).toBe(0);
    expect(store.getDopingStatus().charges).toBe(2);
    wound(store, "olga", store.getProfile("olga").maxHp - 1);
    expect(store.useDoping("olga")).toEqual({ healed: 1, charges: 1 });
    expect(store.getProfile("olga").hp).toBe(store.getProfile("olga").maxHp);
  });

  it("preserves spent uses through serialization, cycle changes and Rom's death/revival", () => {
    const store = fixture(); wound(store, "olga");
    store.useDoping("olga");
    const save = JSON.parse(JSON.stringify(store.getState()));
    save.cycle = 4;
    const restored = new CampaignSessionStore(); restored.restoreSession(save);
    expect(restored.getDopingStatus().charges).toBe(1);
    wound(restored, "rom", 0);
    expect(restored.useDoping("olga")).toBeNull();
    expect(restored.getDopingStatus()).toEqual({ unlocked: false, charges: 1 });
    restored.updateProfile("rom", profile => ({ ...profile, hp: 1, status: "active" }));
    expect(restored.useDoping("rom")).toEqual({ healed: 3, charges: 0 });
  });

  it("resets only with a new campaign", () => {
    const store = fixture(); wound(store, "olga"); store.useDoping("olga");
    store.closeOperation(store.getOpenOperations()[0].id);
    expect(store.getDopingStatus().charges).toBe(1);
    store.startSession("squad", "test", "Test");
    expect(store.getDopingStatus()).toEqual({ unlocked: false, charges: 2 });
  });

  it("allows solo Rom to heal himself, but grants no access to other solo operatives", () => {
    const rom = fixture(1750, "solo"); wound(rom, "rom");
    expect(rom.useDoping("olga")).toBeNull();
    expect(rom.useDoping("rom")).toEqual({ healed: 3, charges: 1 });
    const olga = fixture(1750, "solo", "olga"); wound(olga, "olga");
    expect(olga.getDopingStatus().unlocked).toBe(false);
    expect(olga.useDoping("olga")).toBeNull();
  });

  it("supports old saves with no Doping receipts without changing their schema", () => {
    const old = fixture().getState();
    old.profiles.rom.unlockedPerkIds = ["rom-drunk-master", "rom-wild-intuition"];
    const keys = Object.keys(old);
    const profileKeys = Object.keys(old.profiles.rom);
    const store = new CampaignSessionStore(); store.restoreSession(old);
    expect(store.getDopingStatus()).toEqual({ unlocked: true, charges: 2 });
    expect(store.getProfile("rom").unlockedPerkIds).toContain(DOPING.id);
    wound(store, "rom"); store.useDoping("rom");
    expect(Object.keys(store.getState())).toEqual(keys);
    expect(Object.keys(store.getProfile("rom"))).toEqual(profileKeys);
  });
});
