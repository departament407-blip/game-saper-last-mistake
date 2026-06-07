import type { BiomeId } from "../data/biomes";
import { getBiome } from "../data/biomes";
import { getOperationName } from "../data/operationNames";
import type { ClassicOperation, OperationTier } from "../data/operations";

export const MAX_CAMPAIGN_CYCLES = 5;

interface OperationTemplate {
  tier: OperationTier;
  rows: number;
  cols: number;
  mines: number;
  xpWin: number;
  parTimeSeconds?: number;
}

const CYCLE_TEMPLATES: Record<number, OperationTemplate[]> = {
  1: [
    { tier: "easy", rows: 8, cols: 8, mines: 8, xpWin: 60 },
    { tier: "easy", rows: 8, cols: 9, mines: 10, xpWin: 70 },
    { tier: "medium", rows: 9, cols: 10, mines: 14, xpWin: 95 },
    { tier: "medium", rows: 9, cols: 12, mines: 16, xpWin: 110 },
    { tier: "hard", rows: 10, cols: 12, mines: 20, xpWin: 145 },
    { tier: "hard", rows: 11, cols: 12, mines: 24, xpWin: 165 },
    { tier: "peak", rows: 12, cols: 14, mines: 30, xpWin: 220 }
  ],
  2: [
    { tier: "easy", rows: 9, cols: 9, mines: 12, xpWin: 85 },
    { tier: "easy", rows: 9, cols: 10, mines: 14, xpWin: 95 },
    { tier: "medium", rows: 10, cols: 12, mines: 20, xpWin: 135 },
    { tier: "medium", rows: 11, cols: 12, mines: 23, xpWin: 155 },
    { tier: "hard", rows: 12, cols: 14, mines: 30, xpWin: 205 },
    { tier: "hard", rows: 12, cols: 16, mines: 34, xpWin: 235 },
    { tier: "peak", rows: 14, cols: 16, mines: 42, xpWin: 310 }
  ],
  3: [
    { tier: "easy", rows: 9, cols: 10, mines: 15, xpWin: 105 },
    { tier: "easy", rows: 10, cols: 10, mines: 17, xpWin: 115 },
    { tier: "medium", rows: 11, cols: 14, mines: 28, xpWin: 180 },
    { tier: "medium", rows: 12, cols: 14, mines: 32, xpWin: 205 },
    { tier: "hard", rows: 14, cols: 16, mines: 44, xpWin: 285 },
    { tier: "hard", rows: 14, cols: 18, mines: 50, xpWin: 330 },
    { tier: "peak", rows: 16, cols: 18, mines: 60, xpWin: 430 }
  ],
  4: [
    { tier: "easy", rows: 10, cols: 10, mines: 18, xpWin: 125 },
    { tier: "easy", rows: 10, cols: 12, mines: 22, xpWin: 145 },
    { tier: "medium", rows: 12, cols: 16, mines: 38, xpWin: 250 },
    { tier: "medium", rows: 13, cols: 16, mines: 42, xpWin: 285 },
    { tier: "hard", rows: 15, cols: 18, mines: 62, xpWin: 400 },
    { tier: "hard", rows: 16, cols: 20, mines: 72, xpWin: 470 },
    { tier: "peak", rows: 16, cols: 24, mines: 84, xpWin: 610 }
  ],
  5: [
    { tier: "easy", rows: 10, cols: 12, mines: 24, xpWin: 165 },
    { tier: "easy", rows: 11, cols: 12, mines: 28, xpWin: 190 },
    { tier: "medium", rows: 13, cols: 18, mines: 52, xpWin: 350 },
    { tier: "medium", rows: 14, cols: 18, mines: 58, xpWin: 395 },
    { tier: "hard", rows: 16, cols: 22, mines: 82, xpWin: 560 },
    { tier: "hard", rows: 16, cols: 24, mines: 90, xpWin: 640 },
    { tier: "peak", rows: 16, cols: 30, mines: 99, xpWin: 820 }
  ]
};

const SPECIAL_TEMPLATES: Record<number, OperationTemplate> = {
  1: { tier: "special", rows: 10, cols: 12, mines: 22, xpWin: 180 },
  2: { tier: "special", rows: 12, cols: 16, mines: 40, xpWin: 320 },
  3: { tier: "special", rows: 14, cols: 18, mines: 58, xpWin: 500 },
  4: { tier: "special", rows: 16, cols: 22, mines: 78, xpWin: 720 },
  5: { tier: "special", rows: 16, cols: 26, mines: 92, xpWin: 920 }
};

const ENDGAME_TEMPLATE: OperationTemplate = {
  tier: "endgame",
  rows: 16,
  cols: 30,
  mines: 99,
  xpWin: 1200,
  parTimeSeconds: 600
};

const FLAVOUR_LINES = [
  "Штаб не обещает чистого маршрута.",
  "Сапёрная карта неполная. Остальное придётся доказать на поле.",
  "Разведка слышала металл под землёй. Подтверждения не будет.",
  "Погодные условия не важны. Ошибка важна.",
  "Маршрут открыт только на бумаге."
];

export function generateCampaignCycle(cycle: number): ClassicOperation[] {
  const templates = CYCLE_TEMPLATES[cycle] ?? CYCLE_TEMPLATES[MAX_CAMPAIGN_CYCLES];

  return templates.map((template, slot) => createOperationFromTemplate(template, cycle, slot + 1, false));
}

export function generateCycleSpecialOperation(cycle: number): ClassicOperation {
  const template = SPECIAL_TEMPLATES[cycle] ?? SPECIAL_TEMPLATES[MAX_CAMPAIGN_CYCLES];
  return createOperationFromTemplate(template, cycle, 8, true);
}

export function generateEndgameOperation(): ClassicOperation {
  const biomeId = pickBiome(6, 1);

  return {
    id: "endgame-last-mistake",
    label: "Великая спецоперация: Последняя ошибка",
    description: "Финальная операция кампании. Геометрия пока прямоугольная, но это конечная цель текущей версии.",
    type: "classic",
    availability: "available",
    biomeId,
    cycle: MAX_CAMPAIGN_CYCLES,
    operationIndex: null,
    isEndgame: true,
    ...ENDGAME_TEMPLATE,
    parTimeSeconds: ENDGAME_TEMPLATE.parTimeSeconds ?? getDefaultParTime(ENDGAME_TEMPLATE.tier)
  };
}

function createOperationFromTemplate(template: OperationTemplate, cycle: number, slot: number, isSpecial: boolean): ClassicOperation {
  const biomeId = pickBiome(cycle, slot);
  const biome = getBiome(biomeId);
  const label = getOperationName(biomeId, template.tier, Math.random());
  const flavour = FLAVOUR_LINES[Math.floor(Math.random() * FLAVOUR_LINES.length)] ?? FLAVOUR_LINES[0];

  return {
    id: isSpecial ? `cycle-${cycle}-special` : `cycle-${cycle}-op-${slot}`,
    label: isSpecial ? `Спецоперация: ${label}` : label,
    description: `${isSpecial ? "Спецоперация цикла" : `Операция ${slot}/7`}. Биом: ${biome.name}. ${flavour}`,
    type: "classic",
    availability: "available",
    biomeId,
    cycle,
    operationIndex: isSpecial ? 8 : slot,
    ...template,
    parTimeSeconds: template.parTimeSeconds ?? getDefaultParTime(template.tier)
  };
}

function getDefaultParTime(tier: OperationTier): number {
  switch (tier) {
    case "easy":
      return 90;
    case "medium":
      return 180;
    case "hard":
      return 300;
    case "peak":
    case "special":
      return 420;
    case "endgame":
      return 600;
  }
}

function pickBiome(cycle: number, slot: number): BiomeId {
  const biomes: BiomeId[] = ["forest", "desert", "sunflower", "factory", "sea"];
  return biomes[Math.floor(Math.random() * biomes.length)] ?? biomes[(cycle + slot) % biomes.length];
}
