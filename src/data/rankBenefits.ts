import { RANKS } from "./ranks";

export interface RankBenefit {
  minXp: number;
  label: string;
  description: string;
}

const RANK_REWARD_TEXT: string[] = [
  "Стартовый личный перк активен с первого выхода.",
  "Повышение восстанавливает 1 HP. Бонус ранга к рекорду: +10 очков.",
  "Стартовый перк улучшается до ступени 2. Повышение восстанавливает 1 HP.",
  "+1 к максимальному HP. Повышение восстанавливает 1 HP.",
  "Открывается второй личный перк. Повышение восстанавливает 1 HP.",
  "Все открытые перки работают на ступени 3. Повышение восстанавливает 1 HP.",
  "+1 к максимальному HP. Повышение восстанавливает 1 HP.",
  "Бонус ранга к рекорду: +70 очков. Повышение восстанавливает 1 HP.",
  "Бонус ранга к рекорду: +80 очков. Повышение восстанавливает 1 HP.",
  "+1 к максимальному HP. Повышение восстанавливает 1 HP.",
  "Элитная пассивная подготовка: все текущие числовые бонусы перков остаются на максимальной ступени. Повышение восстанавливает 1 HP.",
  "Бонус ранга к рекорду: +110 очков. Повышение восстанавливает 1 HP.",
  "+1 к максимальному HP. Повышение восстанавливает 1 HP.",
  "Резерв штаба: высокий ранг явно учитывается в итоговом счёте рекорда. Повышение восстанавливает 1 HP.",
  "Командный авторитет: максимальный бонус ранга перед финалом кампании. Повышение восстанавливает 1 HP.",
  "Финальное звание версии 0.1: +150 очков к рекорду за победу. Повышение восстанавливает 1 HP."
];

export const RANK_BENEFITS: RankBenefit[] = RANKS.map((rank, index) => ({
  minXp: rank.minXp,
  label: rank.label,
  description: RANK_REWARD_TEXT[index] ?? "Повышение восстанавливает 1 HP."
}));

export function getRankIndexByXp(xp: number): number {
  for (let index = RANKS.length - 1; index >= 0; index -= 1) {
    if (xp >= RANKS[index].minXp) {
      return index;
    }
  }

  return 0;
}

export function getPerkTierByXp(xp: number): number {
  const rankIndex = getRankIndexByXp(xp);

  if (rankIndex >= 5) {
    return 3;
  }

  if (rankIndex >= 2) {
    return 2;
  }

  return 1;
}

export function getHpBonusByXp(xp: number): number {
  return Math.floor(getRankIndexByXp(xp) / 3);
}

export function getRankUpHealAmount(previousXp: number, nextXp: number): number {
  return Math.max(0, getRankIndexByXp(nextXp) - getRankIndexByXp(previousXp));
}

export function getRankScoreBonusByXp(xp: number): number {
  return getRankIndexByXp(xp) * 10;
}

export function getUnlockedRankBenefits(xp: number): RankBenefit[] {
  return RANK_BENEFITS.filter((benefit) => xp >= benefit.minXp);
}

export function getNextRankBenefit(xp: number): RankBenefit | null {
  return RANK_BENEFITS.find((benefit) => benefit.minXp > xp) ?? null;
}
