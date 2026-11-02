// Visual previews and environment regression checks; requires Playwright.
const { chromium } = require(process.env.TD_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../index.html')).href);
    await page.locator('#screen-menu').waitFor({ state: 'visible' });
    const out = path.join(__dirname, '../../scenery-previews');
    fs.mkdirSync(out, { recursive: true });
    for (const index of [0, 4, 7, 9, 12]) {
      const data = await page.evaluate(index => {
        const map = MAPS[index].createSession();
        const before = JSON.stringify([map.paths, map.decorations, map.obstacles]);
        const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 600;
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        map.drawBackground(ctx); map.drawSpawnAndBase(ctx);
        for (const ent of map.decorEntities().sort((a, b) => a.y - b.y)) ent.draw(ctx);
        const ambient = new AmbientFX(map); ambient.update(1 / 60); ambient.drawGround(ctx); ambient.drawSky(ctx);
        const environment = new EnvironmentSystem(map); environment.time = 11.5; environment.draw(ctx);
        document.getElementById('scenery-preview')?.remove();
        canvas.id = 'scenery-preview';
        canvas.style.cssText = 'position:fixed;inset:0;z-index:999999;width:960px;height:600px';
        document.body.appendChild(canvas);
        return { unchanged: before === JSON.stringify([map.paths, map.decorations, map.obstacles]) };
      }, index);
      assert.equal(data.unchanged, true);
      await page.locator('#scenery-preview').screenshot({ path: path.join(out, `map-${index + 1}.png`) });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => {
      const a = new AmbientFX(MAPS[0]); a.update(1); return a.t;
    }), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const driftError = await page.evaluate(() => {
      const a = new AmbientFX(MAPS[0]), b = new AmbientFX(MAPS[0]);
      for (const fx of [a, b]) { fx.particles = [{ ...fx.particles[0], x: 480, y: 300, sway: 0, vy: 0 }]; }
      for (let i = 0; i < 30; i++) a.update(1 / 30);
      for (let i = 0; i < 120; i++) b.update(1 / 120);
      return Math.abs(a.particles[0].x - b.particles[0].x);
    });
    assert.ok(driftError < 0.0001);
    assert.deepEqual(errors, []);
    console.log('PASS: five biome previews, unchanged gameplay geometry, reduced motion, FPS-independent wind');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
