import { RANKS } from "./ranks";

export interface RankBenefit {
  minXp: number;
  label: string;
  description: string;
}

export const RANK_BENEFITS: RankBenefit[] = [
  {
    minXp: 0,
    label: "Стартовый перк",
    description: "С первого звания активен личный стартовый перк оперативника с конкретным эффектом в карточке."
  },
  {
    minXp: 120,
    label: "Полевое восстановление",
    description: "Каждое новое звание восстанавливает 1 HP."
  },
  {
    minXp: 260,
    label: "Первое усиление перков",
    description: "Открытые перки переходят на вторую ступень: в описании каждого перка показан точный новый эффект."
  },
  {
    minXp: 700,
    label: "+1 к max HP и второй перк",
    description: "Максимальный HP увеличивается на 1, и открывается второй личный перк оперативника."
  },
  {
    minXp: 1000,
    label: "Второе усиление перков",
    description: "Открытые перки переходят на третью ступень с максимальными числовыми эффектами."
  }
];

export function getRankIndexByXp(xp: number): number {
  for (let index = RANKS.length - 1; index >= 0; index -= 1) {
    if (xp >= RANKS[index].minXp) {
      return index;
    }
  }

  return 0;
}

export function getPerkTierByXp(xp: number): number {
  return Math.min(3, 1 + Math.floor(getRankIndexByXp(xp) / 2));
}

export function getHpBonusByXp(xp: number): number {
  return Math.floor(getRankIndexByXp(xp) / 3);
}

export function getRankUpHealAmount(previousXp: number, nextXp: number): number {
  return Math.max(0, getRankIndexByXp(nextXp) - getRankIndexByXp(previousXp));
}

export function getUnlockedRankBenefits(xp: number): RankBenefit[] {
  return RANK_BENEFITS.filter((benefit) => xp >= benefit.minXp);
}

export function getNextRankBenefit(xp: number): RankBenefit | null {
  return RANK_BENEFITS.find((benefit) => benefit.minXp > xp) ?? null;
}
