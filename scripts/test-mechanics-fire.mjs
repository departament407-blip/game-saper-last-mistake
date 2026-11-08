import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Vite only: the hook is appended to this intercepted response, never to production sources.
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const output = fileURLToPath(new URL("../.vite/mechanics-fire/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { scenarios: [], fire: [], plainPerformance: [], videos: [] };
const selectedScenarios = new Set((process.env.MECHANICS_SCENARIOS || "").split(",").filter(Boolean));
const enabled = (name) => selectedScenarios.size === 0 || selectedScenarios.has(name);

async function fixture(name, options = {}, video = false) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 }, ...options,
    ...(video ? { recordVideo: { dir: output, size: options.isMobile ? { width: 375, height: 812 } : { width: 1440, height: 1100 } } } : {})
  });
  const page = await context.newPage();
  if (name === "plain-low-power") {
    await page.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 }));
  }
  // Keep each scenario on its loaded build while collaborators edit other files.
  await page.routeWebSocket((url) => url.host === new URL(baseURL).host, () => {});
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route((url) => url.pathname === "/src/main.ts", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: `${body}\nwindow.__test = { runManager, campaignStore, bus, refs, hudView, boardView, enterPreparation, getResult: () => lastMissionResult };\n` });
  });
  await page.goto(baseURL);
  await page.waitForFunction(() => Boolean(window.__test));
  await page.locator('[data-role="player-name"]').fill("Mechanics integration");
  await page.locator('[data-role="main-start"]').click();
  await page.evaluate(() => {
    window.__events = [];
    window.__test.bus.on("MINE_TRIGGERED", (event) => {
      window.__blastAt = performance.now();
      window.__events.push({ type: "hit", runId: event.runId, protected: event.protected, cellId: event.explodedCell.id });
    });
    window.__test.bus.on("BLAST_RECOVERED", (event) => window.__events.push({ type: "recovered", runId: event.runId }));
    window.__test.bus.on("RUN_LOST", () => window.__events.push({ type: "lost" }));
    window.__test.bus.on("RUN_WON", () => window.__events.push({ type: "won" }));
  });
  const cell = (id) => page.locator(`.cell[data-cell-id="${id}"]`);
  const press = async (id) => { if (options.isMobile) await cell(id).tap(); else await cell(id).click(); };
  const flag = async (id) => {
    if (options.isMobile) {
      await page.locator('[data-role="flag-mode-button"]').tap();
      await cell(id).tap();
      await page.locator('[data-role="reveal-mode-button"]').tap();
    } else await cell(id).click({ button: "right" });
  };
  const finish = async () => {
    assert.deepEqual(errors, [], `${name}: browser errors`);
    const recording = page.video();
    await context.close();
    if (recording) {
      const path = `${output}/${name}.webm`;
      await recording.saveAs(path);
      report.videos.push(path);
    }
    report.scenarios.push(name);
    console.log(`PASS ${name}`);
  };
  return { page, context, cell, press, flag, finish, name, mobile: Boolean(options.isMobile) };
}

async function start(f, { character = "sergei", xp = 750, perks = ["sergei-heavy-landing"], mode = "squad", biome = "forest", open = true } = {}) {
  const expected = await f.page.evaluate(async ({ character, xp, perks, mode, biome }) => {
    const [{ FALLBACK_OPERATION }, { MinesweeperCore }] = await Promise.all([
      import("/src/data/operations.ts"), import("/src/core/minesweeperCore.ts")
    ]);
    const { campaignStore, runManager } = window.__test;
    campaignStore.startSession(mode, "mechanics-test-player", "Mechanics integration");
    if (mode === "solo") campaignStore.lockSoloOperative(character);
    campaignStore.updateProfile(character, (profile) => ({ ...profile, xp, hp: 5, unlockedPerkIds: perks }));
    const operation = { ...FALLBACK_OPERATION, id: "mechanics-integration", rows: 8, cols: 8, mines: 12, xpWin: 100, biomeId: biome };
    campaignStore.restoreSession({ ...campaignStore.getState(), operationPool: [operation], completedOperationIds: [] });
    window.__seed = 12345;
    Math.random = () => { window.__seed = (Math.imul(window.__seed, 1664525) + 1013904223) >>> 0; return window.__seed / 4294967296; };
    runManager.newGame(operation, true, { characterId: character });
    window.__seed = 12345;
    let seed = 12345;
    const reference = new MinesweeperCore(operation, { rng: () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; } });
    const state = reference.reveal(0, 0).state;
    return {
      mines: state.cells.filter((cell) => cell.hasMine).map((cell) => ({ id: cell.id, row: cell.row, col: cell.col })),
      safe: state.cells.filter((cell) => !cell.hasMine).map((cell) => ({ id: cell.id, row: cell.row, col: cell.col })),
      hiddenSafe: state.cells.filter((cell) => !cell.hasMine && cell.state === "hidden").map((cell) => ({ id: cell.id, row: cell.row, col: cell.col }))
    };
  }, { character, xp, perks, mode, biome });
  if (open) await f.press("0:0");
  return expected;
}

async function status(page) {
  return page.evaluate(() => {
    const { runManager: run, campaignStore: campaign, refs } = window.__test;
    const state = run.getState();
    return {
      status: state.status, hp: campaign.getProfile(run.getCharacter().id).hp,
      armor: run.getTemporaryArmor(), locked: run.isInputLocked(), manual: run.getManualFlagPlacements(),
      flags: state.flagsPlaced, intuition: run.getIntuitionCharges(),
      hiddenLeaks: state.cells.filter((cell) => cell.state === "hidden" || cell.state === "flagged").some((cell) => cell.hasMine || cell.adjacentMines),
      revealed: state.cells.filter((cell) => cell.state === "revealed").map((cell) => cell.id),
      debrief: !refs.debriefScreen.classList.contains("is-hidden"), view: refs.game.dataset.view,
      events: window.__events
    };
  });
}

async function until(page, ms) {
  const remaining = await page.evaluate((ms) => ms - (performance.now() - window.__blastAt), ms);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

async function canvasMetrics(page, includeImage = false) {
  return page.evaluate((includeImage) => {
    const canvas = document.querySelector(".explosion-canvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const framePixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = framePixels.data;
    let occupied = 0;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3]) occupied += 1;
      hash = Math.imul(hash ^ data[i] ^ (data[i + 1] << 8) ^ (data[i + 3] << 16), 16777619) >>> 0;
    }
    const screen = canvas.parentElement.getBoundingClientRect();
    const explosion = window.__test.hudView.explosion;
    const epicenter = document.querySelector(`[data-cell-id="${explosion.blast.epicenter}"]`).getBoundingClientRect();
    const sourceOutside = explosion.sources.some((source) => source.x < 0 || source.x > screen.width || source.y < 0 || source.y > screen.height);
    let imageId;
    if (includeImage) {
      window.__capturedFrames ??= new Map();
      imageId = `${performance.now()}-${window.__capturedFrames.size}`;
      window.__capturedFrames.set(imageId, framePixels);
    }
    return {
      frames: Number(canvas.dataset.frames), sources: Number(canvas.dataset.sources), phase: canvas.dataset.phase,
      occupied, hash, sourceOutside, width: canvas.width, height: canvas.height,
      cssWidth: screen.width, cssHeight: screen.height, dpr: canvas.width / screen.width,
      pointerEvents: getComputedStyle(canvas).pointerEvents,
      origin: explosion.origin,
      actualCenter: { x: epicenter.left - screen.left + epicenter.width / 2, y: epicenter.top - screen.top + epicenter.height / 2 },
      originError: Math.hypot(explosion.origin.x - (epicenter.left - screen.left + epicenter.width / 2), explosion.origin.y - (epicenter.top - screen.top + epicenter.height / 2)),
      elapsed: performance.now() - window.__blastAt,
      ...(includeImage ? { imageId } : {})
    };
  }, includeImage);
}

async function capture(f, label, times, requirePixels = true) {
  const samples = [];
  const captures = [];
  for (const ms of times) {
    await until(f.page, ms);
    let sample = await canvasMetrics(f.page, true);
    // Resizing a canvas clears its backing buffer until the next capped RAF draw.
    for (let attempt = 0; requirePixels && sample?.occupied === 0 && attempt < 3; attempt += 1) {
      await f.page.waitForTimeout(50);
      sample = await canvasMetrics(f.page, true);
    }
    assert.ok(sample, `${label}/${ms}: missing canvas`);
    const { imageId, ...metrics } = sample;
    if (requirePixels) assert.ok(metrics.occupied > 0, `${f.name}/${label}/${ms}: canvas is empty ${JSON.stringify(metrics)}`);
    assert.ok(metrics.sources > 0 && metrics.sources <= (f.mobile ? 52 : 72), JSON.stringify(metrics));
    assert.equal(metrics.sourceOutside, false, `${label}: fire source outside scene`);
    assert.ok(metrics.dpr <= (f.mobile ? 1.26 : 1.51), JSON.stringify(metrics));
    assert.equal(metrics.pointerEvents, "none");
    assert.ok(metrics.originError < (ms < 900 ? 12 : 2), `${label}/${ms}: incorrect blast origin ${JSON.stringify(metrics)}`);
    const expectedPhase = ms < 900 ? "shockwave" : ms < 2500 ? "ignition" : ms < 4000 ? "burning" : "aftermath";
    if (f.name !== "reduced-motion") assert.equal(metrics.phase, expectedPhase, `${label}/${ms}: phase sampling missed its window`);
    captures.push({ imageId, ms });
    // Scene screenshot encoding can exceed the 300 ms gap on busy/mobile hosts.
    // Preserve the exact 300/600 ms canvas frames; the video records the full scene there.
    if (ms >= 900) await f.page.screenshot({ path: `${output}/${f.name}-${label}-${ms}-scene.jpg`, type: "jpeg", quality: 75, fullPage: false, scale: "css" });
    samples.push({ requestedMs: ms, ...metrics });
  }
  // Encode saved pixels after sampling finishes, so PNG compression cannot delay the 600 ms frame.
  for (const { imageId, ms } of captures) {
    const image = await f.page.evaluate((id) => {
      const pixels = window.__capturedFrames.get(id);
      const frame = document.createElement("canvas");
      frame.width = pixels.width;
      frame.height = pixels.height;
      frame.getContext("2d").putImageData(pixels, 0, 0);
      window.__capturedFrames.delete(id);
      return frame.toDataURL("image/png").split(",")[1];
    }, imageId);
    await writeFile(`${output}/${f.name}-${label}-${ms}-canvas.png`, Buffer.from(image, "base64"));
  }
  report.fire.push({ name: `${f.name}-${label}`, samples });
  return samples;
}

async function finishSafeCells(f, expected) {
  await f.page.evaluate((safe) => {
    for (const { row, col } of safe) window.__test.runManager.reveal(row, col);
  }, expected.safe);
  assert.equal((await status(f.page)).status, "won");
  assert.equal((await status(f.page)).debrief, true);
}

try {
  for (const [name, options, biome] of [
    ["desktop", {}, "factory"],
    ["mobile", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, "sea"]
  ]) {
    if (!enabled(name)) continue;
    const f = await fixture(name, options, true);
    const expected = await start(f, { biome });
    const first = expected.mines[0], second = expected.mines[1];
    await f.flag(expected.mines[2].id);
    await f.flag(expected.hiddenSafe[0].id);
    const before = await status(f.page);
    assert.equal(before.armor, 1);
    assert.equal(before.hiddenLeaks, false);
    await f.press(first.id);
    const protectedState = await status(f.page);
    assert.equal(protectedState.status, "playing");
    assert.equal(protectedState.hp, before.hp);
    assert.equal(protectedState.armor, 0);
    assert.equal(protectedState.locked, true);
    assert.equal(protectedState.debrief, false);
    assert.equal(protectedState.hiddenLeaks, false);
    assert.equal(await f.page.locator(".cell:disabled").count(), 64);
    assert.equal(await f.cell(first.id).locator(".mine-object--exploded").count(), 1);
    assert.equal(await f.cell(second.id).innerHTML(), "");
    assert.equal(await f.page.locator(".flag-error,.flag-confirmed,.is-unflagged-mine").count(), 0);
    await f.page.evaluate(({ row, col }) => window.__test.runManager.reveal(row, col), second);
    assert.equal((await status(f.page)).events.filter((event) => event.type === "hit").length, 1);
    await capture(f, "protected", [300, 600, 1500, 3000]);
    await until(f.page, 4250);
    const recovered = await status(f.page);
    assert.equal(recovered.locked, false);
    assert.equal(recovered.hp, before.hp);
    assert.equal(recovered.status, "playing");
    assert.equal(recovered.debrief, false);
    assert.equal(recovered.hiddenLeaks, false);
    assert.equal(await f.page.locator(".explosion-canvas").count(), 0);
    assert.equal(await f.page.locator(".cell:disabled").count(), 0);
    await f.press(first.id);
    assert.equal((await status(f.page)).events.filter((event) => event.type === "hit").length, 1);
    assert.ok((await status(f.page)).revealed.includes("0:0"));
    await f.press(second.id);
    const loss = await status(f.page);
    assert.equal(loss.status, "lost");
    assert.equal(loss.hp, before.hp - 3);
    assert.equal(loss.events.filter((event) => event.type === "lost").length, 1);
    assert.equal(loss.events.filter((event) => event.type === "hit").length, 2);
    assert.equal(loss.events[0].runId, loss.events.findLast((event) => event.type === "hit").runId);
    const samples = await capture(f, "loss", [300, 600, 1500, 3000, 4500, 5500]);
    assert.notEqual(samples[4].hash, samples[5].hash, "Aftermath pixels must keep moving after debrief");
    const fps = (samples[5].frames - samples[4].frames) * 1000 / (samples[5].elapsed - samples[4].elapsed);
    // Encoding video/phase screenshots adds substantial host overhead; benchmark separately below.
    assert.ok(fps > 0 && fps <= 31, `Unexpected capture render rate: ${fps}`);
    report.fire[report.fire.length - 1].observedFps = fps;
    assert.equal((await status(f.page)).debrief, true);
    await f.page.locator('[data-role="debrief-profile"]').click();
    assert.equal(await f.page.locator(".explosion-canvas").count(), 0);
    await f.page.waitForTimeout(120);
    assert.equal(await f.page.locator(".explosion-canvas").count(), 0);
    await f.page.locator('[data-role="profile-back"]').click();
    await f.page.waitForFunction(() => {
      const canvas = document.querySelector(".explosion-canvas");
      if (!canvas || !Number(canvas.dataset.frames)) return false;
      return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
    }, null, { timeout: 2000 });
    await f.page.locator('[data-role="debrief-new-operation"]').click();
    assert.equal(await f.page.locator(".explosion-canvas").count(), 0);
    await f.page.locator('[data-role="start-operation"]').click();
    assert.equal(await f.page.locator(".explosion-canvas").count(), 0);
    const again = await start(f, { biome });
    await f.press(again.mines[0].id);
    await until(f.page, 1200);
    assert.equal(await f.page.locator(".explosion-canvas").count(), 1);
    await f.page.locator('[data-role="operation-menu"]').click();
    if (await f.page.locator('[data-role="confirm-accept"]').isVisible()) await f.page.locator('[data-role="confirm-accept"]').click();
    assert.equal(await f.page.locator(".explosion-canvas").count(), 0);
    await until(f.page, 4300);
    assert.equal(await f.page.locator(".explosion-canvas").count(), 0);
    assert.equal((await status(f.page)).view, "mainMenu");
    await f.finish();
  }

  for (const [xp, count] of [[0, 2], [180, 3], [750, 4]]) {
    if (!enabled(`rom-${count}`)) continue;
    const f = await fixture(`rom-${count}`);
    const expected = await start(f, { character: "rom", xp, perks: ["rom-wild-intuition"], open: false });
    assert.equal(await f.page.locator('[data-role="intuition-button"]').isDisabled(), true);
    assert.equal((await status(f.page)).intuition, 1);
    await f.page.locator('[data-role="intuition-button"]').dispatchEvent("click");
    assert.equal((await status(f.page)).intuition, 1);
    await f.press("0:0");
    assert.equal(await f.page.locator('[data-role="intuition-button"]').isDisabled(), false);
    await f.flag(expected.mines[0].id);
    await f.flag(expected.mines[0].id);
    await f.flag(expected.mines[0].id);
    assert.equal((await status(f.page)).manual, 2);
    await f.page.locator('[data-role="intuition-button"]').click();
    const used = await status(f.page);
    assert.equal(used.flags, count + 1);
    assert.equal(used.intuition, 0);
    assert.equal(used.manual, 2);
    assert.equal(used.hiddenLeaks, false);
    assert.equal(await f.page.locator(".is-auto-flagged").count(), count);
    const mineIds = new Set(expected.mines.map((mine) => mine.id));
    const flaggedIds = await f.page.locator(".is-flagged").evaluateAll((cells) => cells.map((cell) => cell.dataset.cellId));
    assert.ok(flaggedIds.every((id) => mineIds.has(id)));
    assert.equal(await f.page.locator('[data-role="intuition-button"]').isDisabled(), true);
    await f.page.locator('[data-role="intuition-button"]').dispatchEvent("click");
    assert.equal((await status(f.page)).flags, count + 1);
    await finishSafeCells(f, expected);
    const result = await f.page.evaluate(() => window.__test.getResult());
    assert.equal(result.manualFlagPlacements, 2);
    assert.equal(result.automaticFlagPlacements, count);
    assert.match(await f.page.locator('[data-role="debrief-details"]').textContent(), new RegExp(`Автофлагов: ${count}`));
    await f.finish();
  }

  for (const mode of ["solo", "squad"]) {
    if (!enabled(`sych-${mode}`)) continue;
    const f = await fixture(`sych-${mode}`);
    const expected = await start(f, { character: "sych", xp: 750, perks: ["sych-flag-discipline"], mode });
    const initialXp = await f.page.evaluate(() => Object.fromEntries(window.__test.campaignStore.getVisibleProfiles().map((profile) => [profile.id, profile.xp])));
    await finishSafeCells(f, expected);
    const outcome = await f.page.evaluate(() => ({ result: window.__test.getResult(), profiles: window.__test.campaignStore.getVisibleProfiles() }));
    assert.equal(outcome.result.flagDiscipline.manualFlagPlacements, 0);
    assert.equal(outcome.result.flagDiscipline.unusedFlagBudget, 12);
    assert.equal(outcome.result.flagDiscipline.bonusPercent, 60);
    assert.equal(outcome.result.flagDiscipline.bonusXpPerOperative, 60);
    assert.equal(outcome.result.xpAwarded, 160);
    assert.equal(outcome.result.flagDiscipline.recipients.length, mode === "solo" ? 1 : 6);
    for (const profile of outcome.profiles) assert.equal(profile.xp - initialXp[profile.id], profile.id === "sych" ? 160 : 60);
    assert.equal(await f.page.locator('[data-role="debrief-discipline"]').isVisible(), true);
    assert.match(await f.page.locator('[data-role="debrief-discipline"]').textContent(), /60%/);
    await f.page.screenshot({ path: `${output}/sych-${mode}-debrief.png`, fullPage: true });
    await f.finish();
  }

  if (enabled("reduced-motion")) {
    const f = await fixture("reduced-motion", { reducedMotion: "reduce" });
    const expected = await start(f, { character: "olga", xp: 0, perks: [] });
    await f.press(expected.mines[0].id);
    const samples = await capture(f, "loss", [1500, 3000, 4500], true);
    assert.equal(samples[0].hash, samples[1].hash, "Reduced motion should keep a static ember image");
    assert.equal(samples[0].frames, samples[1].frames, "Reduced motion should stop continuous RAF drawing");
    assert.equal((await status(f.page)).debrief, true);
    await f.finish();
  }
  for (const [name, options] of [
    ["plain-desktop", {}],
    ["plain-mobile", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
    ["plain-low-power", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }]
  ]) {
    if (!enabled(name)) continue;
    const f = await fixture(name, options);
    const expected = await start(f, { character: "olga", xp: 0, perks: [] });
    await f.press(expected.mines[0].id);
    await until(f.page, 1400);
    await f.page.waitForFunction(() => Number(document.querySelector(".explosion-canvas")?.dataset.frames) >= 3, null, { timeout: 5000 });
    // No video, screenshots or canvas readback inside this two-second measurement interval.
    const before = await f.page.evaluate(() => ({ frames: Number(document.querySelector(".explosion-canvas").dataset.frames), time: performance.now() }));
    await f.page.waitForTimeout(2000);
    const after = await f.page.evaluate(() => ({ frames: Number(document.querySelector(".explosion-canvas").dataset.frames), time: performance.now() }));
    const metrics = await canvasMetrics(f.page);
    const fps = (after.frames - before.frames) * 1000 / (after.time - before.time);
    assert.ok(fps >= 10 && fps <= 31, `${name}: unexpected unrecorded render rate ${fps} ${JSON.stringify({ before, after, metrics })}`);
    assert.ok(metrics.occupied > 0);
    assert.ok(metrics.sources <= (name === "plain-low-power" ? 40 : f.mobile ? 52 : 72));
    assert.ok(metrics.dpr <= (name === "plain-low-power" ? 1.01 : f.mobile ? 1.26 : 1.51));
    report.plainPerformance.push({ name, fps, framesInTwoSeconds: after.frames - before.frames, ...metrics });
    await f.finish();
  }

  for (const [name, options, mode] of [
    ["doping-desktop", {}, "squad"],
    ["doping-mobile", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, "squad"],
    ["doping-solo", {}, "solo"]
  ]) {
    if (!enabled(name)) continue;
    const f = await fixture(name, options);
    await f.page.evaluate((mode) => {
      const { campaignStore: campaign, enterPreparation } = window.__test;
      campaign.startSession(mode, "doping-test-player", "Mechanics integration");
      if (mode === "solo") campaign.lockSoloOperative("rom");
      campaign.updateProfile("rom", (profile) => ({ ...profile, xp: 1749, hp: 2 }));
      if (mode === "squad") {
        campaign.updateProfile("sergei", (profile) => ({ ...profile, hp: 1 }));
        campaign.updateProfile("iskra", (profile) => ({ ...profile, hp: 0, status: "fallen" }));
      }
      enterPreparation("rom");
    }, mode);
    assert.equal(await f.page.locator('[data-role="doping-panel"]').isVisible(), false);
    await f.page.evaluate(() => {
      window.__test.campaignStore.updateProfile("rom", (profile) => ({ ...profile, xp: 1750 }));
      window.__test.enterPreparation("rom");
    });
    assert.equal(await f.page.locator('[data-role="doping-panel"]').isVisible(), true);
    assert.match(await f.page.locator('[data-role="doping-charges"]').textContent(), /2\/2/);
    const target = mode === "solo" ? "rom" : "sergei";
    if (mode === "solo") {
      assert.deepEqual(await f.page.locator('[data-role="doping-target"] option').evaluateAll((options) => options.map((option) => option.value)), ["rom"]);
    } else {
      assert.equal(await f.page.locator('[data-role="doping-target"] option[value="iskra"]').count(), 0);
      const fullHealthOption = await f.page.locator('[data-role="doping-target"] option[value="olga"]').evaluate((option) => ({
        disabled: option.disabled, html: option.outerHTML, profile: window.__test.campaignStore.getProfile("olga")
      }));
      assert.equal(fullHealthOption.profile.hp, fullHealthOption.profile.maxHp);
      assert.equal(fullHealthOption.disabled, true, JSON.stringify(fullHealthOption));
    }
    await f.page.locator('[data-role="doping-target"]').selectOption(target);
    const beforeHp = await f.page.evaluate((id) => window.__test.campaignStore.getProfile(id).hp, target);
    if (f.mobile) await f.page.locator('[data-role="doping-use"]').tap();
    else await f.page.locator('[data-role="doping-use"]').click();
    const first = await f.page.evaluate((id) => ({ hp: window.__test.campaignStore.getProfile(id).hp, status: window.__test.campaignStore.getDopingStatus() }), target);
    assert.equal(first.hp, beforeHp + 3);
    assert.equal(first.status.charges, 1);
    await f.page.reload();
    await f.page.locator('[data-role="main-continue"]').click();
    assert.equal(await f.page.locator('[data-role="doping-panel"]').isVisible(), true);
    assert.equal(await f.page.evaluate(() => window.__test.campaignStore.getDopingStatus().charges), 1);
    assert.equal(await f.page.evaluate((id) => window.__test.campaignStore.getProfile(id).hp, target), first.hp);
    await f.page.locator('[data-role="doping-target"]').selectOption("rom");
    const secondBefore = await f.page.evaluate(() => window.__test.campaignStore.getProfile("rom"));
    if (f.mobile) await f.page.locator('[data-role="doping-use"]').tap();
    else await f.page.locator('[data-role="doping-use"]').click();
    const secondHp = await f.page.evaluate(() => window.__test.campaignStore.getProfile("rom").hp);
    assert.equal(secondHp, Math.min(secondBefore.maxHp, secondBefore.hp + 3));
    assert.equal(await f.page.evaluate(() => window.__test.campaignStore.getDopingStatus().charges), 0);
    assert.equal(await f.page.locator('[data-role="doping-use"]').isDisabled(), true);
    await f.page.locator('[data-role="doping-use"]').dispatchEvent("click");
    assert.equal(await f.page.evaluate(() => window.__test.campaignStore.getProfile("rom").hp), secondHp);
    assert.equal(await f.page.evaluate(() => window.__test.campaignStore.getDopingStatus().charges), 0);
    await f.page.screenshot({ path: `${output}/${name}-spent.jpg`, type: "jpeg", quality: 80, fullPage: true, scale: "css" });
    await f.page.reload();
    await f.page.locator('[data-role="main-continue"]').click();
    assert.equal(await f.page.evaluate(() => window.__test.campaignStore.getDopingStatus().charges), 0);
    assert.equal(await f.page.locator('[data-role="doping-use"]').isDisabled(), true);
    await f.finish();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.scenarios, plainPerformance: report.plainPerformance, fire: report.fire.map(({ name, observedFps, samples }) => ({ name, observedFps, sourceCount: samples[0].sources, maxFrames: samples.at(-1).frames })), output }, null, 2));
} finally {
  await writeFile(`${output}/report.partial.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
