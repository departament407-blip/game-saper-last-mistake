import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// Run against Vite: npm run dev, then npm run test:browser.
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const output = new URL("../.vite/flag-browser/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let scenarios = 0;

async function startGame(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.flagTestSeed = 12345;
    Math.random = () => {
      window.flagTestSeed = (Math.imul(window.flagTestSeed, 1664525) + 1013904223) >>> 0;
      return window.flagTestSeed / 4294967296;
    };
  });
  await page.goto(baseURL);
  await page.locator('[data-role="player-name"]').fill("Flag review");
  await page.locator('[data-role="main-start"]').click();
  await page.locator('[data-role="start-operation"]').click();
  await page.evaluate(() => { window.flagTestSeed = 12345; });
  await page.locator('.cell[data-cell-id="0:0"]').click();
  // A separate deterministic core supplies the expected layout; no production debug hooks.
  const targets = await page.evaluate(async () => {
    const { MinesweeperCore } = await import("/src/core/minesweeperCore.ts");
    const wrap = document.querySelector('[data-role="board-wrap"]');
    const rows = Number(wrap.dataset.boardRows);
    const cols = Number(wrap.dataset.boardCols);
    const mines = Number(document.querySelector('[data-role="mine-count"]').textContent);
    let seed = 12345;
    const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const core = new MinesweeperCore({ id: "test", label: "test", rows, cols, mines }, { rng });
    const state = core.reveal(0, 0).state;
    const correct = state.cells.find(cell => cell.hasMine);
    const wrong = state.cells.find(cell => !cell.hasMine && cell.state === "hidden");
    const epicenter = state.cells.find(cell => cell.hasMine && cell.id !== correct.id);
    return { correct: correct.id, wrong: wrong.id, epicenter: epicenter.id, mines };
  });
  const cell = id => page.locator(`.cell[data-cell-id="${id}"]`);
  if (options.isMobile) {
    await page.locator('[data-role="flag-mode-button"]').tap();
    await cell(targets.correct).tap();
    await cell(targets.wrong).tap();
    await page.locator('[data-role="reveal-mode-button"]').tap();
  } else {
    await cell(targets.correct).click({ button: "right" });
    await cell(targets.wrong).click({ button: "right" });
  }
  assert.equal(await cell(targets.correct).innerHTML(), await cell(targets.wrong).innerHTML());
  assert.equal(await cell(targets.correct).getAttribute("class"), await cell(targets.wrong).getAttribute("class"));
  for (const id of [targets.correct, targets.wrong]) {
    assert.match(await cell(id).getAttribute("aria-label"), /^Флаг на/);
  }
  assert.equal(await page.locator('.flag-error, .flag-confirmed, .is-unflagged-mine').count(), 0);
  const intact = await cell(targets.correct).locator(".flag-mark").innerHTML();
  await cell(targets.epicenter).click();
  const startedAt = Date.now();
  async function until(ms) { await page.waitForTimeout(Math.max(0, ms - (Date.now() - startedAt))); }
  return { context, page, errors, targets, cell, intact, until };
}

async function inspect(page) {
  return page.evaluate(() => {
    const style = selector => getComputedStyle(document.querySelector(selector));
    return {
      flame: Number(style(".is-wrong-flag .flag-flame").opacity),
      cross: Number(style(".flag-error").opacity),
      correctFill: style(".is-correct-flag .flag-mark__cloth").fill,
      correctFilter: style(".is-correct-flag").filter,
      wrongFill: style(".is-wrong-flag .flag-mark__cloth").fill,
      staff: style(".is-wrong-flag .flag-mark__staff").transform,
      debrief: !document.querySelector('[data-screen="debrief"]').classList.contains("is-hidden")
    };
  });
}

try {
  for (const [name, options] of [
    ["desktop", { viewport: { width: 1440, height: 1100 } }],
    ["mobile", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }]
  ]) {
    const { context, page, errors, targets, cell, intact, until } = await startGame(options);
    assert.equal(await page.locator('.is-correct-flag').count(), 1);
    assert.equal(await page.locator('.is-wrong-flag').count(), 1);
    assert.equal(await page.locator('.is-unflagged-mine').count(), targets.mines - 2);
    assert.equal(await page.locator('.is-epicenter .mine-object--exploded').count(), 1);
    assert.equal(await page.locator('.is-unflagged-mine .flag-error, .is-epicenter .flag-error').count(), 0);
    assert.equal(await cell(targets.correct).locator(".flag-mark").innerHTML(), intact);
    assert.doesNotMatch(await cell(targets.correct).getAttribute("class"), /is-scorched|is-mine/);
    await until(500);
    const initial = await inspect(page);
    assert.equal(initial.flame, 0);
    assert.equal(initial.cross, 0);
    assert.equal(initial.debrief, false);
    await until(1700);
    const burning = await inspect(page);
    assert.ok(burning.flame > .4, JSON.stringify(burning));
    assert.equal(burning.cross, 0);
    assert.notEqual(burning.wrongFill, initial.wrongFill);
    assert.equal(burning.correctFill, initial.correctFill);
    await page.locator('[data-role="board-wrap"]').screenshot({ path: fileURLToPath(new URL(`${name}-burning.png`, output)) });
    // The real input-mode buttons re-render the entire field during the effect.
    await page.locator('[data-role="flag-mode-button"]').dispatchEvent("click");
    assert.ok((await inspect(page)).flame > .3, "Re-render restarted the burning animation");
    await until(3300);
    const settling = await inspect(page);
    assert.equal(settling.cross, 1);
    assert.equal(settling.debrief, false);
    await until(4250);
    const finished = await inspect(page);
    assert.equal(finished.flame, 0);
    assert.equal(finished.cross, 1);
    assert.equal(finished.debrief, true);
    assert.equal(finished.correctFill, "rgb(227, 33, 40)");
    assert.equal(finished.correctFilter, "none");
    assert.notEqual(finished.staff, "none");
    assert.deepEqual(await page.locator('[data-role="debrief-flags"] dd').allTextContents(), ["1", "1", String(targets.mines - 1)]);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-debrief.png`, output)), fullPage: true });
    // Visiting the operative's profile must preserve the destroyed scene and final markers.
    await page.locator('[data-role="debrief-profile"]').click();
    await page.locator('[data-role="profile-back"]').click();
    assert.equal((await inspect(page)).cross, 1);
    assert.equal(await page.locator('.operation-screen.is-destroyed.is-burning-aftermath').count(), 1);
    for (const biome of ["forest", "desert", "sunflower", "factory", "sea"]) {
      await page.evaluate(biome => {
        document.querySelector('.operation-screen').dataset.biome = biome;
        const game = document.querySelector('[data-role="game"]');
        game.className = `game biome-${biome}`;
        document.querySelector('[data-screen="debrief"]').classList.add("is-hidden");
      }, biome);
      assert.equal((await inspect(page)).correctFill, "rgb(227, 33, 40)");
      assert.equal((await inspect(page)).cross, 1);
      await page.locator('[data-role="board-wrap"]').screenshot({ path: fileURLToPath(new URL(`${name}-${biome}-aftermath.png`, output)) });
    }
    await page.evaluate(() => document.querySelector('[data-screen="debrief"]').classList.remove("is-hidden"));
    await page.locator('[data-role="debrief-new-operation"]').click();
    await page.locator('[data-role="start-operation"]').click();
    assert.equal(await page.locator('.is-correct-flag, .is-wrong-flag, .is-unflagged-mine, .is-epicenter').count(), 0);
    assert.equal(await page.locator('.is-destroyed, .is-burning-aftermath').count(), 0);
    assert.equal(await page.locator('[data-role="debrief-flags"]').textContent(), "");
    assert.equal(await page.locator('[data-role="board"]').evaluate(el => el.style.getPropertyValue("--flag-ignition-delay")), "");
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.is-burning-aftermath').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    scenarios += 1;
    console.log(`PASS ${name}: flags, phases, debrief, five biome styles, profile, restart`);
  }

  const reduced = await startGame({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  assert.equal(await reduced.page.locator('.flag-flame').first().isVisible(), false);
  assert.equal((await inspect(reduced.page)).cross, 1);
  assert.equal((await inspect(reduced.page)).correctFill, "rgb(227, 33, 40)");
  assert.equal((await inspect(reduced.page)).debrief, false);
  await reduced.until(4200);
  assert.equal((await inspect(reduced.page)).debrief, true);
  assert.deepEqual(reduced.errors, []);
  await reduced.context.close();
  scenarios += 1;
  console.log("PASS reduced motion: static readable result on 320px, debrief after 4s");

  // Exercise the same views with real RunManager outcomes and inspect the event boundary.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/__flag-view-test", route => route.fulfill({ contentType: "text/html", body: '<div id="app"></div>' }));
  await page.goto(`${baseURL}/__flag-view-test`);
  const outcomes = await page.evaluate(async () => {
    const [{ EventBus }, { CampaignSessionStore }, { RunManager }, { BoardView }, { HudView },
      { PostBlastFlags }, { createApp }, { FALLBACK_OPERATION }] = await Promise.all([
      import("/src/events/eventBus.ts"), import("/src/progression/campaignSessionStore.ts"),
      import("/src/run/runManager.ts"), import("/src/ui/boardView.ts"), import("/src/ui/hudView.ts"),
      import("/src/ui/postBlastFlags.ts"), import("/src/ui/screens.ts"), import("/src/data/operations.ts")
    ]);
    const reports = [];
    for (const scenario of [
      { characterId: "olga", hp: 1, xp: 0, perks: [] },
      { characterId: "sergei", hp: 1, xp: 1000, perks: ["sergei-heavy-landing"] }
    ]) {
      Math.random = () => .5;
      const campaign = new CampaignSessionStore();
      campaign.updateProfile(scenario.characterId, profile => ({ ...profile, hp: scenario.hp, xp: scenario.xp, unlockedPerkIds: scenario.perks }));
      const bus = new EventBus();
      const run = new RunManager(bus, campaign);
      const review = new PostBlastFlags();
      const refs = createApp(document.querySelector("#app"));
      const view = new BoardView(refs.boardWrap, refs.board, run, bus, review);
      const hud = new HudView(refs, run, bus, review);
      let premature = null;
      let result = null;
      bus.on("CELL_REVEALED", ({ result }) => {
        if (result.state.status === "lost") {
          premature = { statistics: review.getStatistics(), marked: refs.board.querySelectorAll('.is-correct-flag, .is-wrong-flag').length };
        }
      });
      bus.on("RUN_LOST", event => { result = event.result; });
      run.newGame({ ...FALLBACK_OPERATION, rows: 12, cols: 12, mines: 40 }, false, { characterId: scenario.characterId });
      run.reveal(0, 0);
      const cells = run.getState().cells;
      const mines = cells.filter(cell => cell.hasMine);
      const wrong = cells.find(cell => !cell.hasMine && cell.state === "hidden");
      run.toggleFlag(mines[0].row, mines[0].col);
      run.toggleFlag(wrong.row, wrong.col);
      run.reveal(mines[1].row, mines[1].col);
      const beforeRender = JSON.stringify(run.getState());
      view.setFlagMode(true);
      const report = {
        status: result.profile.status,
        statistics: review.getStatistics(),
        premature,
        unchanged: beforeRender === JSON.stringify(run.getState()),
        correct: refs.board.querySelectorAll('.is-correct-flag .flag-mark').length,
        wrong: refs.board.querySelectorAll('.is-wrong-flag .flag-error').length
      };
      // Leave before the 900 ms timer: neither classes nor counters may return later.
      view.clearAftermath();
      hud.clearSceneState();
      await new Promise(resolve => setTimeout(resolve, 950));
      report.cleared = !refs.operationScreen.classList.contains("is-burning-aftermath") && !refs.board.children.length && !refs.debriefFlags.textContent;
      reports.push(report);
    }
    return reports;
  });
  assert.deepEqual(outcomes.map(result => result.status), ["fallen", "active"]);
  for (const outcome of outcomes) {
    assert.deepEqual(outcome.statistics, { correctFlags: 1, wrongFlags: 1, unflaggedMines: 39 });
    assert.deepEqual(outcome.premature, { statistics: null, marked: 0 });
    assert.equal(outcome.unchanged, true);
    assert.equal(outcome.correct, 1);
    assert.equal(outcome.wrong, 1);
    assert.equal(outcome.cleared, true);
  }
  await context.close();
  scenarios += 2;
  console.log("PASS death and armor survival: same flag review, RUN_LOST gate, early cleanup");
} finally {
  await browser.close();
}
console.log(`Passed ${scenarios} browser scenarios. Screenshots: .vite/flag-browser/`);

