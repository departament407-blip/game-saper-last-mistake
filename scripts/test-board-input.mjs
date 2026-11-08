import assert from "node:assert/strict";
import { chromium } from "playwright";

// Start Vite first. Uses real browser mouse/touch events against BoardView and MinesweeperCore.
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
let checks = 0;

async function fixture(options = {}, flag = true) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL);
  await page.evaluate(async (flag) => {
    const [{ BoardView }, { MinesweeperCore }, { EventBus }, { PostBlastFlags }] = await Promise.all([
      import("/src/ui/boardView.ts"), import("/src/core/minesweeperCore.ts"),
      import("/src/events/eventBus.ts"), import("/src/ui/postBlastFlags.ts")
    ]);
    document.body.innerHTML = '<main class="game biome-forest"><section class="operation-screen"><div class="board-wrap"><div class="board"></div></div></section></main>';
    const core = new MinesweeperCore({ id: "input", label: "input", rows: 4, cols: 4, mines: 2 }, {
      presetMines: [{ row: 0, col: 0 }, { row: 3, col: 3 }]
    });
    core.reveal(1, 1);
    if (flag) core.toggleFlag(0, 0);
    const bus = new EventBus();
    window.inputActions = [];
    window.inputLocked = false;
    const run = {
      getState: () => core.getState(), hasActiveGame: () => true,
      isInputLocked: () => window.inputLocked,
      reveal: (row, col) => {
        window.inputActions.push(["reveal", row, col]);
        const result = core.reveal(row, col);
        bus.emit("CELL_REVEALED", { result });
      },
      toggleFlag: (row, col) => {
        window.inputActions.push(["flag", row, col]);
        bus.emit("FLAG_TOGGLED", { result: core.toggleFlag(row, col) });
      },
      chordReveal: (row, col) => {
        window.inputActions.push(["chord", row, col]);
        const result = core.chordReveal(row, col);
        bus.emit(result.kind === "chord_failed" ? "CHORD_FAILED" : "CHORD_SUCCEEDED", { result });
      }
    };
    const board = document.querySelector(".board");
    const view = new BoardView(document.querySelector(".board-wrap"), board, run, bus, new PostBlastFlags());
    view.render(core.getState());
    window.inputFixture = { core, bus, view, run };
  }, flag);
  const cell = (id) => page.locator(`.cell[data-cell-id="${id}"]`);
  const center = async (id) => {
    const box = await cell(id).boundingBox();
    assert.ok(box);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const move = async (id) => { const point = await center(id); await page.mouse.move(point.x, point.y); };
  const actions = () => page.evaluate(() => window.inputActions);
  const finish = async () => { assert.deepEqual(errors, []); await context.close(); checks += 1; };
  return { context, page, cell, move, actions, finish };
}

try {
  {
    const { page, cell, move, actions, finish } = await fixture();
    await move("0:1");
    await page.mouse.down();
    assert.equal(await cell("0:1").evaluate((el) => el.classList.contains("is-pressed")), true);
    assert.equal(await cell("0:1").evaluate((el) => el.classList.contains("is-revealed")), false);
    await page.waitForTimeout(150);
    assert.deepEqual(await actions(), []);
    await page.mouse.up();
    assert.deepEqual(await actions(), [["reveal", 0, 1]]);
    assert.equal(await cell("0:1").evaluate((el) => el.classList.contains("is-revealed")), true);
    assert.equal(await page.locator(".is-pressed").count(), 0);
    await finish();
  }
  for (const cancel of ["different-cell", "leave-return", "pointercancel", "blur"]) {
    const { page, cell, move, actions, finish } = await fixture();
    await move("0:1");
    await page.mouse.down();
    if (cancel === "different-cell") await move("0:2");
    else if (cancel === "leave-return") { await page.mouse.move(1, 1); await move("0:1"); }
    else if (cancel === "pointercancel") await cell("0:1").dispatchEvent("pointercancel", { pointerId: 1 });
    else await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(await page.locator(".is-pressed").count(), 0);
    await page.mouse.up();
    assert.deepEqual(await actions(), []);
    assert.equal(await cell("0:1").evaluate((el) => el.classList.contains("is-revealed")), false);
    await finish();
  }
  for (const [first, second, releasedFirst] of [
    ["left", "right", "left"], ["left", "right", "right"],
    ["right", "left", "left"], ["right", "left", "right"]
  ]) {
    const { page, cell, move, actions, finish } = await fixture();
    await move("1:1");
    await page.mouse.down({ button: first });
    await page.mouse.down({ button: second });
    assert.equal(await page.locator(".is-pressed").count(), 7);
    assert.equal(await cell("0:0").evaluate((el) => el.classList.contains("is-pressed")), false);
    await page.waitForTimeout(150);
    assert.deepEqual(await actions(), []);
    await page.mouse.up({ button: releasedFirst });
    assert.deepEqual(await actions(), [["chord", 1, 1]]);
    assert.equal(await page.locator(".is-pressed").count(), 0);
    await page.mouse.up({ button: releasedFirst === "left" ? "right" : "left" });
    await page.waitForTimeout(50);
    assert.deepEqual(await actions(), [["chord", 1, 1]]);
    await finish();
  }
  {
    const { page, move, actions, finish } = await fixture({}, false);
    await move("1:1");
    await page.mouse.down();
    await page.mouse.down({ button: "right" });
    assert.equal(await page.locator(".is-pressed").count(), 8);
    await page.mouse.up({ button: "right" });
    await page.mouse.up();
    assert.deepEqual(await actions(), [["chord", 1, 1]]);
    await finish();
  }
  {
    const { page, cell, actions, finish } = await fixture({}, false);
    await cell("1:1").dblclick();
    assert.deepEqual(await actions(), [["chord", 1, 1]]);
    await finish();
  }
  {
    const { page, move, actions, finish } = await fixture({}, false);
    await page.keyboard.down("Shift");
    await move("1:1");
    await page.mouse.down();
    assert.equal(await page.locator(".is-pressed").count(), 8);
    assert.deepEqual(await actions(), []);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    assert.deepEqual(await actions(), [["chord", 1, 1]]);
    await finish();
  }
  {
    const { page, cell, move, actions, finish } = await fixture();
    await move("0:1");
    await page.mouse.down({ button: "right" });
    assert.deepEqual(await actions(), []);
    await page.mouse.up({ button: "right" });
    assert.deepEqual(await actions(), [["flag", 0, 1]]);
    assert.equal(await cell("0:1").evaluate((el) => el.classList.contains("is-flagged")), true);
    await finish();
  }
  {
    const { page, cell, actions, finish } = await fixture({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await page.evaluate(() => window.inputFixture.view.setFlagMode(true));
    await cell("0:1").tap();
    assert.deepEqual(await actions(), [["flag", 0, 1]]);
    assert.equal(await cell("0:1").evaluate((el) => el.classList.contains("is-flagged")), true);
    await page.evaluate(() => window.inputFixture.view.setFlagMode(false));
    await cell("0:2").tap();
    assert.deepEqual(await actions(), [["flag", 0, 1], ["reveal", 0, 2]]);
    await finish();
  }
  {
    const { page, cell, actions, finish } = await fixture();
    await cell("0:1").focus();
    await page.keyboard.press("Space");
    assert.deepEqual(await actions(), [["reveal", 0, 1]]);
    await finish();
  }
  {
    const { page, cell, actions, finish } = await fixture();
    await page.evaluate(() => {
      const { core, bus } = window.inputFixture;
      core.toggleFlag(0, 0);
      const hit = core.reveal(0, 0);
      const state = core.resolveMineHit(true);
      window.inputLocked = true;
      bus.emit("MINE_TRIGGERED", { state, explodedCell: hit.explodedCell, protected: true, runId: "fixture" });
    });
    assert.equal(await cell("0:0").locator(".mine-object--exploded").count(), 1);
    assert.equal(await cell("0:0").evaluate((el) => el.classList.contains("is-local-crater")), true);
    assert.equal(await cell("3:3").innerHTML(), "");
    assert.equal(await page.locator(".flag-error,.flag-confirmed,.is-unflagged-mine").count(), 0);
    assert.equal(await page.locator(".cell:disabled").count(), 16);
    await cell("0:1").dispatchEvent("click");
    assert.deepEqual(await actions(), []);
    await page.evaluate(() => {
      window.inputLocked = false;
      const { core, bus } = window.inputFixture;
      bus.emit("BLAST_RECOVERED", { state: core.getState(), runId: "fixture" });
    });
    assert.equal(await page.locator(".cell:disabled").count(), 0);
    await cell("0:1").click();
    assert.deepEqual(await actions(), [["reveal", 0, 1]]);
    await finish();
  }
  console.log(`Board input: ${checks} real browser scenarios passed.`);
} finally {
  await browser.close();
}
