import type { CampaignMode } from "../progression/campaignTypes";

export type OperationStartFailureReason =
  | "missingPlayerName"
  | "missingOperation"
  | "missingOperative"
  | "missingSoloOperative"
  | "fallenOperative";

export type OperationStartValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: OperationStartFailureReason;
      message: string;
    };

export interface OperationStartValidationInput {
  mode: CampaignMode;
  playerName: string;
  selectedOperationId: string;
  operationExists: boolean;
  selectedOperativeId: string;
  operativeStatus?: "active" | "fallen";
  soloOperativeLocked?: boolean;
}

export function validateOperationStart(input: OperationStartValidationInput): OperationStartValidationResult {
  if (input.playerName.trim() === "") {
    return {
      ok: false,
      reason: "missingPlayerName",
      message: "Введите имя игрока."
    };
  }

  if (input.selectedOperationId.trim() === "" || !input.operationExists) {
    return {
      ok: false,
      reason: "missingOperation",
      message: "Выберите операцию."
    };
  }

  if (input.mode === "solo" && !input.soloOperativeLocked) {
    return {
      ok: false,
      reason: "missingSoloOperative",
      message: "Выберите оперативника."
    };
  }

  if (input.selectedOperativeId.trim() === "") {
    return {
      ok: false,
      reason: "missingOperative",
      message: "Выберите оперативника."
    };
  }

  if (input.operativeStatus === "fallen") {
    return {
      ok: false,
      reason: "fallenOperative",
      message: "Выбранный оперативник выбыл. Выберите бойца в строю."
    };
  }

  return { ok: true };
}
