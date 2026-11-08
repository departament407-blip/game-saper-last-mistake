import type { ClassicOperation } from "../data/operations";
import type { FlagDisciplineReward } from "./campaignTypes";

export const FLAG_DISCIPLINE_RATES = [0.02, 0.04, 0.06] as const;
export const FLAG_DISCIPLINE_MAX_BONUS_RATE = 0.60;

/** The approved +60% ceiling applies equally to Sych and every living recipient. */
export function calculateFlagDiscipline(
  operation: Pick<ClassicOperation, "mines" | "xpWin">,
  manualFlagPlacements: number,
  perkTier: number
): Omit<FlagDisciplineReward, "recipients"> {
  const perkRate = FLAG_DISCIPLINE_RATES[Math.min(3, Math.max(1, perkTier)) - 1] ?? FLAG_DISCIPLINE_RATES[0];
  const unusedFlagBudget = Math.max(0, operation.mines - manualFlagPlacements);
  const bonusRate = Math.min(FLAG_DISCIPLINE_MAX_BONUS_RATE, unusedFlagBudget * perkRate);
  return {
    mineCount: operation.mines,
    manualFlagPlacements,
    unusedFlagBudget,
    perkRate,
    bonusPercent: Math.round(bonusRate * 100),
    bonusXpPerOperative: Math.round(operation.xpWin * bonusRate)
  };
}
