import { getCharacterPerks, getPerkEffectDescription } from "./perks";
import { getHpBonusByXp, getPerkTierByXp } from "./rankBenefits";
import { RANKS } from "./ranks";
import type { CampaignMode } from "../progression/campaignTypes";

export interface RankProgressionEntry {
  rankId: string;
  title: string;
  icon: string;
  xpRequired: number;
  bonuses: string[];
}

export function getRankProgressionForCharacter(characterId: string, mode: CampaignMode = "squad"): RankProgressionEntry[] {
  const perks = getCharacterPerks(characterId);

  return RANKS.map((rank, index) => {
    const previousRank = RANKS[index - 1];
    const previousHpBonus = previousRank ? getHpBonusByXp(previousRank.minXp) : 0;
    const currentHpBonus = getHpBonusByXp(rank.minXp);
    const previousPerkTier = previousRank ? getPerkTierByXp(previousRank.minXp) : 1;
    const currentPerkTier = getPerkTierByXp(rank.minXp);
    const bonuses: string[] = [];

    perks
      .filter((perk) => perk.unlockMinXp === rank.minXp)
      .forEach((perk) => {
        bonuses.push(`Открывается перк "${perk.label}": ${getPerkEffectDescription(perk.id, mode, currentPerkTier)}`);
      });

    if (index > 0) {
      bonuses.push("Повышение звания восстанавливает 1 HP.");
    }

    if (currentHpBonus > previousHpBonus) {
      bonuses.push("+1 к максимальному HP.");
    }

    if (currentPerkTier > previousPerkTier) {
      perks
        .filter((perk) => perk.unlockMinXp < rank.minXp)
        .forEach((perk) => {
          bonuses.push(`${perk.label}: ${getPerkEffectDescription(perk.id, mode, currentPerkTier)}`);
        });
    }

    if (bonuses.length === 0) {
      bonuses.push("Промежуточное звание: сохраняет текущие эффекты перков и приближает следующее усиление.");
    }

    return {
      rankId: rank.id,
      title: rank.label,
      icon: rank.icon,
      xpRequired: rank.minXp,
      bonuses
    };
  });
}
