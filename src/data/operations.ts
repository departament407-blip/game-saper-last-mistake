import type { BiomeId } from "./biomes";

export type OperationType = "classic" | "special";
export type OperationAvailability = "available" | "comingSoon";
export type OperationTier = "easy" | "medium" | "hard" | "peak" | "special" | "endgame";

export interface BaseOperation {
  id: string;
  label: string;
  description: string;
  type: OperationType;
  availability: OperationAvailability;
}

export interface ClassicOperation extends BaseOperation {
  type: "classic";
  availability: "available";
  rows: number;
  cols: number;
  mines: number;
  xpWin: number;
  parTimeSeconds: number;
  biomeId: BiomeId;
  tier: OperationTier;
  cycle: number;
  operationIndex: number | null;
  isEndgame?: boolean;
}

export interface SpecialOperation extends BaseOperation {
  type: "special";
  availability: "comingSoon";
}

export type Operation = ClassicOperation | SpecialOperation;

export const SPECIAL_OPERATIONS: SpecialOperation[] = [
  {
    id: "rift",
    label: "Разлом",
    description: "Нестандартная геометрия поля. Будет включена позже.",
    type: "special",
    availability: "comingSoon"
  },
  {
    id: "ring",
    label: "Кольцо",
    description: "Операция с пустым центром и давлением по периметру.",
    type: "special",
    availability: "comingSoon"
  },
  {
    id: "marsh",
    label: "Камышовый лабиринт",
    description: "Будущий режим с заблокированными проходами.",
    type: "special",
    availability: "comingSoon"
  }
];

export const FALLBACK_OPERATION: ClassicOperation = {
  id: "fallback-training",
  label: "Учебный двор",
  description: "Страховочная операция для запуска ядра сапёра.",
  type: "classic",
  availability: "available",
  rows: 8,
  cols: 8,
  mines: 8,
  xpWin: 60,
  parTimeSeconds: 90,
  biomeId: "forest",
  tier: "easy",
  cycle: 1,
  operationIndex: 1
};

export const OPERATIONS: Operation[] = [FALLBACK_OPERATION, ...SPECIAL_OPERATIONS];

export function getOperation(id: string): Operation {
  return OPERATIONS.find((operation) => operation.id === id) ?? FALLBACK_OPERATION;
}

export function getClassicOperation(id: string): ClassicOperation {
  const operation = getOperation(id);

  if (operation.type !== "classic" || operation.availability !== "available") {
    return FALLBACK_OPERATION;
  }

  return operation;
}
