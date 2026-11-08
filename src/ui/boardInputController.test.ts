import { describe, expect, it, vi } from "vitest";
import { MinesweeperCore } from "../core/minesweeperCore";
import { BoardInputGesture, type BoardInputMode } from "./boardInputController";

function setup() {
  const core = new MinesweeperCore({ id: "input", label: "Input", rows: 4, cols: 4, mines: 2 }, {
    presetMines: [{ row: 0, col: 0 }, { row: 3, col: 3 }]
  });
  core.reveal(1, 1);
  core.toggleFlag(0, 0);
  let locked = false;
  let mode: BoardInputMode = "reveal";
  const onAction = vi.fn();
  const onPressed = vi.fn();
  const input = new BoardInputGesture({
    getState: () => core.getState(), isLocked: () => locked, getMode: () => mode, onAction, onPressed
  });
  return {
    core, input, onAction, onPressed,
    lock: () => { locked = true; },
    mode: (value: BoardInputMode) => { mode = value; },
    pressed: () => onPressed.mock.lastCall?.[0] ?? []
  };
}

describe("BoardInputGesture", () => {
  it("presses a hidden cell immediately but reveals only on release over that cell", () => {
    const { input, onAction, pressed, core } = setup();
    const before = core.getState();
    input.down("0:1", 0, 1);
    expect(pressed()).toEqual(["0:1"]);
    expect(onAction).not.toHaveBeenCalled();
    expect(core.getState()).toEqual(before);
    input.up("0:1", 0, 0);
    expect(pressed()).toEqual([]);
    expect(onAction).toHaveBeenCalledExactlyOnceWith("reveal", expect.objectContaining({ id: "0:1" }));
  });

  it.each(["0:2", null])("cancels the press when moved to %s, even if the pointer returns", (outside) => {
    const { input, onAction, pressed } = setup();
    input.down("0:1", 0, 1);
    input.move(outside, 1);
    expect(pressed()).toEqual([]);
    input.move("0:1", 1);
    input.up("0:1", 0, 0);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not reveal if released over a different cell without a move notification", () => {
    const { input, onAction, pressed } = setup();
    input.down("0:1", 0, 1);
    input.up("0:2", 0, 0);
    expect(pressed()).toEqual([]);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("cancels on a lost gesture and accepts the next fresh pointer press", () => {
    const { input, onAction, pressed } = setup();
    input.down("0:1", 0, 1);
    input.cancel();
    input.up("0:1", 0, 0);
    expect(onAction).not.toHaveBeenCalled();
    expect(pressed()).toEqual([]);
    input.down("0:2", 0, 1);
    input.up("0:2", 0, 0);
    expect(onAction).toHaveBeenCalledExactlyOnceWith("reveal", expect.objectContaining({ id: "0:2" }));
  });

  it.each([
    { first: 0, firstButtons: 1, second: 2, released: 0, remaining: 2 },
    { first: 2, firstButtons: 2, second: 0, released: 2, remaining: 1 }
  ])("chords once on first release, with button $first pressed first", ({ first, firstButtons, second, released, remaining }) => {
    const { input, onAction, pressed } = setup();
    input.down("1:1", first, firstButtons);
    input.down("1:1", second, 3, false, false);
    expect(pressed()).toEqual(["0:1", "0:2", "1:0", "1:2", "2:0", "2:1", "2:2"]);
    expect(pressed()).not.toContain("0:0");
    expect(onAction).not.toHaveBeenCalled();
    input.up("1:1", released, remaining);
    expect(onAction).toHaveBeenCalledExactlyOnceWith("chord", expect.objectContaining({ id: "1:1" }));
    expect(pressed()).toEqual([]);
    input.move("1:1", remaining);
    input.up("1:1", released === 0 ? 2 : 0, 0);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("detects the second mouse button through pointermove buttons without another pointerdown", () => {
    const { input, onAction, pressed } = setup();
    input.down("1:1", 0, 1);
    input.move("1:1", 3);
    expect(pressed()).toHaveLength(7);
    input.move("1:1", 1); // Browsers emit this before mouseup for the first released button.
    expect(onAction).not.toHaveBeenCalled();
    input.up("1:1", 2, 1);
    input.up("1:1", 0, 0);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("does not execute a chord after leaving its source number", () => {
    const { input, onAction, pressed } = setup();
    input.down("1:1", 0, 1);
    input.move("1:1", 3);
    input.move("1:2", 3);
    expect(pressed()).toEqual([]);
    input.up("1:1", 0, 2);
    input.up("1:1", 2, 0);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("never presses or reveals flagged cells in reveal mode", () => {
    const { input, onAction, pressed } = setup();
    input.down("0:0", 0, 1);
    expect(pressed()).toEqual([]);
    input.up("0:0", 0, 0);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not turn a two-button press on a hidden cell into a reveal or flag", () => {
    const { input, onAction } = setup();
    input.down("0:1", 0, 1);
    input.move("0:1", 3);
    input.up("0:1", 0, 2);
    input.up("0:1", 2, 0);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("toggles right-click flags only on release", () => {
    const { input, onAction } = setup();
    input.down("0:1", 2, 2);
    expect(onAction).not.toHaveBeenCalled();
    input.up("0:1", 2, 0);
    expect(onAction).toHaveBeenCalledExactlyOnceWith("flag", expect.objectContaining({ id: "0:1" }));
  });

  it("keeps flag-mode taps and tactical selection as primary-button actions", () => {
    const { input, onAction, mode } = setup();
    mode("flag");
    input.down("0:0", 0, 1);
    input.up("0:0", 0, 0);
    expect(onAction).toHaveBeenLastCalledWith("flag", expect.objectContaining({ id: "0:0" }));
    mode("tactical");
    input.down("1:1", 0, 1);
    input.up("1:1", 0, 0);
    expect(onAction).toHaveBeenLastCalledWith("tactical", expect.objectContaining({ id: "1:1" }));
  });

  it("supports shift-release and keyboard chord activation", () => {
    const { input, onAction, pressed } = setup();
    input.down("1:1", 0, 1, true);
    expect(pressed()).toHaveLength(7);
    expect(onAction).not.toHaveBeenCalled();
    input.up("1:1", 0, 0);
    input.activate("1:1", true);
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith("chord", expect.objectContaining({ id: "1:1" }));
  });

  it("blocks input during blast lock, including gestures that were already held", () => {
    const { input, onAction, pressed, lock } = setup();
    input.down("0:1", 0, 1);
    lock();
    input.up("0:1", 0, 0);
    input.down("0:1", 0, 1);
    input.up("0:1", 0, 0);
    input.activate("0:1");
    input.activate("1:1", true);
    expect(pressed()).toEqual([]);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("reset clears an unfinished chord without retaining a pending action", () => {
    const { input, onAction, pressed } = setup();
    input.down("1:1", 0, 1);
    input.move("1:1", 3);
    input.reset();
    input.up("1:1", 0, 0);
    expect(pressed()).toEqual([]);
    expect(onAction).not.toHaveBeenCalled();
    input.activate("0:1");
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
