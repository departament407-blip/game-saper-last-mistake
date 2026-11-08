import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Uses the real source modules and assets from a running Vite development server.
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const output = new URL("../.vite/medal-gallery/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const galleryHtml = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/src/ui/medalRenderer.css"><style>
    body{margin:0;padding:30px;background:#152b29;color:#f5eddb;font:16px system-ui}h1{font-size:25px}section{margin:25px 0}
    .gallery{display:grid;grid-template-columns:repeat(5,1fr);gap:18px}.gallery article{background:#243e38;padding:18px;border:1px solid #596957;border-radius:12px;text-align:center}
    .gallery img{width:112px;height:145px}.gallery p{font-size:14px;margin:9px 0 0}
    .medal-strip{display:flex;flex-wrap:wrap;max-width:270px;padding:8px;background:#e3e3d3;border-radius:10px}.cards{display:flex;gap:8px;flex-wrap:wrap}
    .missing{background:#e3e3d3;display:inline-block;padding:8px;border-radius:10px}
    @media(max-width:600px){body{padding:16px}.gallery{grid-template-columns:repeat(2,1fr);gap:10px}.gallery article{padding:10px}.cards{display:grid;grid-template-columns:1fr}}
  </style></head><body><h1>Сапёр · Коллекция наград</h1><section class="gallery"></section>
  <section><h2>HUD · 44 × 52 px / новые награды</h2><div class="medal-strip"></div></section>
  <section class="cards"></section><section class="missing"></section></body></html>`;

try {
  for (const [name, options] of [
    ["desktop", { viewport: { width: 1200, height: 1000 } }],
    ["mobile", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/__medal-gallery", route => route.fulfill({ contentType: "text/html", body: galleryHtml }));
    await page.route("**/assets/medals/missing.svg", route => route.fulfill({ status: 404, body: "" }));
    await page.goto(`${baseURL}/__medal-gallery`);
    await page.evaluate(async () => {
      const [{ MEDALS }, { renderMedalBadge, renderMedalAward }, { renderMedalStrip }] = await Promise.all([
        import("/src/data/medals.ts"), import("/src/ui/medalRenderer.ts"), import("/src/ui/renderHelpers.ts")
      ]);
      document.querySelector(".gallery").innerHTML = MEDALS.map(medal => `<article><img src="${medal.assetPath}" alt="${medal.label}"><p>${medal.label}</p></article>`).join("");
      document.querySelector(".medal-strip").innerHTML = renderMedalStrip(MEDALS.map(medal => medal.id), "", ["grand-sweep-medal", "hard-survivor"]);
      document.querySelector(".cards").innerHTML = ["training-medal", "sunfield-medal", "hard-survivor"].map(id => renderMedalAward(id)).join("");
      document.querySelector(".missing").innerHTML = renderMedalBadge({ ...MEDALS[0], assetPath: "/assets/medals/missing.svg" });
    });
    await page.waitForFunction(() => [...document.querySelectorAll(".gallery img")].every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.locator(".gallery img").count(), 10);
    await page.locator(".missing").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector(".missing .medal-art").classList.contains("is-missing"));
    assert.equal(await page.locator(".missing .medal-art__fallback").isVisible(), true);
    assert.equal(await page.locator(".medal-strip .is-new-medal").count(), 2);
    const trigger = page.locator(".medal-strip summary").first();
    const disclosure = page.locator(".medal-strip .medal-badge__info").first();
    if (options.isMobile) await trigger.tap();
    else await trigger.hover();
    assert.equal(await disclosure.isVisible(), true);
    assert.match(await disclosure.textContent(), /Чистые руки.*Победить, не поставив ни одного флага/);
    if (!options.isMobile) {
      await page.mouse.move(1100, 0);
      await trigger.focus();
      assert.equal(await disclosure.isVisible(), true);
      await page.keyboard.press("Enter");
    }
    assert.equal(await page.locator(".medal-strip details").first().getAttribute("open"), "");
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS medals ${name}: 10 SVG assets, fallback, disclosure, new award highlight`);
  }
} finally {
  await browser.close();
}
console.log("Medal gallery snapshots: .vite/medal-gallery/");
