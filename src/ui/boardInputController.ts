import type { BoardState, Cell } from "../core/types";

export type BoardInputAction = "reveal" | "flag" | "chord" | "tactical";
export type BoardInputMode = "reveal" | "flag" | "tactical";

export interface BoardInputOptions {
  getState: () => BoardState;
  isLocked: () => boolean;
  getMode: () => BoardInputMode;
  onAction: (action: BoardInputAction, cell: Cell) => void;
  onPressed: (cellIds: string[]) => void;
}

interface Press {
  cellId: string;
  kind: "primary" | "secondary" | "chord";
}

/** Gesture state only: never reveals a cell while a button is held. */
export class BoardInputGesture {
  private press: Press | null = null;
  private waitingForRelease = false;

  constructor(private readonly options: BoardInputOptions) {}

  down(cellId: string | null, button: number, buttons: number, shiftKey = false, firstPress = true): void {
    if (firstPress && (buttons === 1 || buttons === 2)) this.waitingForRelease = false;
    if (this.waitingForRelease || this.options.isLocked() || !cellId || (button !== 0 && button !== 2)) return;
    if (this.press) {
      this.move(cellId, buttons);
      return;
    }
    const cell = this.cell(cellId);
    if (!cell || cell.state === "blocked") return;
    const chord = buttons === 3 || (button === 0 && shiftKey);
    if (chord && !this.canChord(cell)) {
      this.waitingForRelease = true;
      return;
    }
    this.press = { cellId, kind: chord ? "chord" : button === 2 ? "secondary" : "primary" };
    this.paint();
  }

  move(cellId: string | null, buttons: number): void {
    if (!this.press) return;
    if (this.options.isLocked() || cellId !== this.press.cellId || buttons === 0) {
      this.cancel();
      return;
    }
    if (buttons === 3) {
      const cell = this.cell(this.press.cellId);
      if (!cell || !this.canChord(cell)) {
        this.cancel();
        return;
      }
      this.press.kind = "chord";
      this.paint();
    }
  }

  up(cellId: string | null, button: number, buttons: number): void {
    const press = this.press;
    this.press = null;
    this.options.onPressed([]);
    const wasWaiting = this.waitingForRelease;
    this.waitingForRelease = buttons !== 0;
    if (!press || wasWaiting || cellId !== press.cellId || this.options.isLocked()) return;
    const cell = this.cell(press.cellId);
    if (!cell) return;
    if (press.kind === "chord") {
      if ((button === 0 || button === 2) && this.canChord(cell)) this.options.onAction("chord", cell);
    } else if (press.kind === "secondary" && button === 2) {
      if (cell.state === "hidden" || cell.state === "flagged") this.options.onAction("flag", cell);
    } else if (press.kind === "primary" && button === 0) {
      this.activateCell(cell);
    }
  }

  activate(cellId: string | null, chord = false): void {
    if (!cellId || this.press || this.waitingForRelease || this.options.isLocked()) return;
    const cell = this.cell(cellId);
    if (!cell) return;
    if (chord) {
      if (this.canChord(cell)) this.options.onAction("chord", cell);
    } else this.activateCell(cell);
  }

  cancel(): void {
    if (this.press) this.waitingForRelease = true;
    this.press = null;
    this.options.onPressed([]);
  }

  reset(): void {
    this.press = null;
    this.waitingForRelease = false;
    this.options.onPressed([]);
  }

  private cell(id: string): Cell | undefined {
    return this.options.getState().cells.find((cell) => cell.id === id);
  }

  private canChord(cell: Cell): boolean {
    return cell.state === "revealed" && !cell.hasMine && cell.adjacentMines > 0;
  }

  private activateCell(cell: Cell): void {
    if (cell.state === "blocked") return;
    const mode = this.options.getMode();
    if (mode === "tactical") this.options.onAction("tactical", cell);
    else if (mode === "flag" && (cell.state === "hidden" || cell.state === "flagged")) this.options.onAction("flag", cell);
    else if (mode === "reveal" && cell.state === "hidden") this.options.onAction("reveal", cell);
  }

  private paint(): void {
    if (!this.press) return;
    const source = this.cell(this.press.cellId);
    if (!source) return;
    const pressed = this.press.kind === "chord"
      ? this.options.getState().cells.filter((cell) => cell.state === "hidden"
        && Math.abs(cell.row - source.row) <= 1 && Math.abs(cell.col - source.col) <= 1)
      : this.press.kind === "primary" && source.state === "hidden" ? [source] : [];
    this.options.onPressed(pressed.map((cell) => cell.id));
  }
}

/** Delegated DOM adapter; also sees the first release of a two-button mouse chord. */
export class BoardInputController {
  private readonly abort = new AbortController();
  private readonly gesture: BoardInputGesture;
  private touchPointerId: number | null = null;
  private ignoreMouseUntil = 0;
  private ignoreDoubleClickUntil = 0;
  private readonly view: Window;

  constructor(private readonly board: HTMLElement, options: Omit<BoardInputOptions, "onPressed">) {
    this.view = board.ownerDocument.defaultView!;
    this.gesture = new BoardInputGesture({
      ...options,
      onAction: (action, cell) => {
        if (action === "chord") this.ignoreDoubleClickUntil = performance.now() + 600;
        options.onAction(action, cell);
      },
      onPressed: (ids) => {
        const pressed = new Set(ids);
        board.querySelectorAll<HTMLElement>("[data-cell-id]").forEach((cell) => {
          cell.classList.toggle("is-pressed", pressed.has(cell.dataset.cellId!));
        });
      }
    });
    const listenerOptions = { signal: this.abort.signal };
    board.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary) return;
      if (event.pointerType !== "mouse") {
        if (this.touchPointerId !== null) return;
        this.touchPointerId = event.pointerId;
        this.ignoreMouseUntil = performance.now() + 800;
      }
      this.gesture.down(this.targetCell(event.target), event.button, event.buttons, event.shiftKey);
    }, listenerOptions);
    // A second mouse button does not emit pointerdown. Do not rely on pointer events alone.
    board.addEventListener("mousedown", (event) => {
      if (performance.now() < this.ignoreMouseUntil) return;
      this.gesture.down(this.targetCell(event.target), event.button, event.buttons, event.shiftKey, false);
    }, listenerOptions);
    this.view.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" && event.pointerId !== this.touchPointerId) return;
      this.gesture.move(this.hitCell(event), event.buttons);
    }, listenerOptions);
    this.view.addEventListener("mouseup", (event) => {
      if (performance.now() < this.ignoreMouseUntil) return;
      this.gesture.up(this.hitCell(event), event.button, event.buttons);
    }, listenerOptions);
    this.view.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse" || event.pointerId !== this.touchPointerId) return;
      this.touchPointerId = null;
      this.ignoreMouseUntil = performance.now() + 800;
      this.gesture.up(this.hitCell(event), 0, 0);
    }, listenerOptions);
    this.view.addEventListener("pointercancel", () => this.reset(), listenerOptions);
    board.addEventListener("pointerleave", () => this.gesture.cancel(), listenerOptions);
    this.view.addEventListener("blur", () => this.reset(), listenerOptions);
    board.ownerDocument.addEventListener("visibilitychange", () => {
      if (board.ownerDocument.hidden) this.reset();
    }, listenerOptions);
    board.addEventListener("contextmenu", (event) => event.preventDefault(), listenerOptions);
    board.addEventListener("click", (event) => {
      event.preventDefault();
      // Mouse/touch clicks are already handled on release. detail=0 is keyboard/AT activation.
      if (event.detail === 0 && performance.now() >= this.ignoreMouseUntil) {
        this.gesture.activate(this.targetCell(event.target), event.shiftKey);
      }
    }, listenerOptions);
    board.addEventListener("dblclick", (event) => {
      event.preventDefault();
      if (performance.now() >= this.ignoreDoubleClickUntil && performance.now() >= this.ignoreMouseUntil) {
        this.gesture.activate(this.targetCell(event.target), true);
      }
    }, listenerOptions);
    board.addEventListener("dragstart", (event) => event.preventDefault(), listenerOptions);
  }

  cancel(): void {
    this.touchPointerId = null;
    this.gesture.cancel();
  }

  destroy(): void {
    this.abort.abort();
    this.gesture.reset();
  }

  private reset(): void {
    this.touchPointerId = null;
    this.gesture.reset();
  }

  private targetCell(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const cell = target.closest<HTMLElement>("[data-cell-id]");
    return cell && this.board.contains(cell) ? cell.dataset.cellId ?? null : null;
  }

  private hitCell(event: MouseEvent): string | null {
    return this.targetCell(this.board.ownerDocument.elementFromPoint(event.clientX, event.clientY));
  }
}
