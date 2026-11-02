// Runtime smoke test, not a balance/playthrough test. Requires Playwright.
const { chromium } = require(process.env.TD_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../index.html')).href);
    await page.locator('#screen-menu').waitFor({ state: 'visible' });
    await page.evaluate(() => { DevMode.set(true); TutorialSystem.markGuideSeen(); });
    await page.click('#btn-play');
    for (let index = 0; index < 16; index++) {
      await page.locator('.level-card').nth(index).click();
      await page.locator('.hero-pick').nth(index % 3).click();
      await page.locator('#loading-screen').waitFor({ state: 'hidden' });
      while (await page.locator('#btn-info-close').isVisible()) await page.click('#btn-info-close');
      const state = await page.evaluate(index => {
        const game = __td.game;
        game.lives = game.maxLives = 10000;
        game.waveManager.requestNextWaveNow();
        Object.keys(CONFIG.enemies).forEach(type => __td.spawn(type));
        Object.keys(CONFIG.towers).forEach((type, i) => {
          const t = new Tower(type, 100 + i * 90, 175);
          t.level = 3; t.branch = index % 2 ? 'A' : 'B'; t.buildTimer = 0;
          t.setTargetPriority(['first', 'strongest', 'nearest'][i % 3]);
          game.towers.push(t);
        });
        // Cross the full 14-second environmental cycle, including warning and activation.
        __td.tick(900); __td.frame();
        return { mapIndex: game.mapIndex, wave: game.waveManager.waveIndex,
          valid: [...game.enemies, ...game.soldiers, game.hero].every(e => [e.x, e.y, e.hp].every(Number.isFinite)),
          templateClean: MAPS[index].decorations.every(d => !d.cleared),
        };
      }, index);
      assert.equal(state.mapIndex, index);
      assert.equal(state.valid, true, `Invalid entity state on map ${index + 1}`);
      assert.equal(state.templateClean, true);
      assert.deepEqual(errors, [], `Browser errors on map ${index + 1}`);
      await page.click('#btn-menu-exit');
    }
    console.log('PASS: all 16 maps load/render; every enemy type and both tower branches simulated; finite entity state; no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
