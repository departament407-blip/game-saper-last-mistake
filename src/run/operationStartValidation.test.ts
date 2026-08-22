import { describe, expect, it } from "vitest";
import { validateOperationStart } from "./operationStartValidation";

const validInput = {
  mode: "squad" as const,
  playerName: "Виктор",
  selectedOperationId: "cycle-1-op-1",
  operationExists: true,
  selectedOperativeId: "sergei",
  operativeStatus: "active" as const,
  soloOperativeLocked: true
};

describe("validateOperationStart", () => {
  it("allows operation start when operation, operative and player name are present", () => {
    expect(validateOperationStart(validInput)).toEqual({ ok: true });
  });

  it("returns a readable error when no operation is selected", () => {
    expect(validateOperationStart({ ...validInput, selectedOperationId: "", operationExists: false })).toEqual({
      ok: false,
      reason: "missingOperation",
      message: "Выберите операцию."
    });
  });

  it("returns a readable error when no operative is selected", () => {
    expect(validateOperationStart({ ...validInput, selectedOperativeId: "" })).toEqual({
      ok: false,
      reason: "missingOperative",
      message: "Выберите оперативника."
    });
  });

  it("returns a readable error when player name is missing", () => {
    expect(validateOperationStart({ ...validInput, playerName: " " })).toEqual({
      ok: false,
      reason: "missingPlayerName",
      message: "Введите имя игрока."
    });
  });

  it("blocks fallen operatives", () => {
    expect(validateOperationStart({ ...validInput, operativeStatus: "fallen" })).toEqual({
      ok: false,
      reason: "fallenOperative",
      message: "Выбранный оперативник выбыл. Выберите бойца в строю."
    });
  });

  it("requires the locked operative in solo mode", () => {
    expect(validateOperationStart({ ...validInput, mode: "solo", soloOperativeLocked: false })).toEqual({
      ok: false,
      reason: "missingSoloOperative",
      message: "Выберите оперативника."
    });
  });
});
