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

    if (index > 0) {
      bonuses.push(`Бонус ранга к итоговому счёту рекорда: +${index * 10} очков.`);
    }

    if (index === 8) {
      bonuses.push("Высокорисковые операции в брифинге становятся заметнее для планирования состава.");
    }

    if (index === 10) {
      bonuses.push("Элитная подготовка: все открытые перки уже работают на максимальной ступени.");
    }

    if (index === RANKS.length - 1) {
      bonuses.push("Финальное звание версии 0.1. Дальше решает только чистая игра.");
    }

    if (bonuses.length === 0) {
      bonuses.push("Стартовая ступень: личный стартовый перк активен.");
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
