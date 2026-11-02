// Requires Playwright: npm install --no-save playwright
// Run: node tools/ui-smoke.cjs
const { chromium } = require(process.env.TD_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = async () => {
      await page.goto(pathToFileURL(path.join(__dirname, '../index.html')).href);
      await page.locator('#screen-menu').waitFor({ state: 'visible' });
    };
    const enter = async () => {
      await page.click('#btn-play');
      await page.locator('.level-card:not(.locked)').first().click();
      await page.locator('.hero-pick').first().click();
      await page.locator('#loading-screen').waitFor({ state: 'hidden' });
      while (await page.locator('#btn-info-close').isVisible()) await page.click('#btn-info-close');
    };
    await open();
    await page.click('#btn-settings');
    await page.locator('#chk-mute-music').check();
    await page.locator('#rng-volume').fill('0.25');
    await open();
    assert.equal(await page.locator('#chk-mute-music').isChecked(), true);
    assert.equal(await page.locator('#rng-volume').inputValue(), '0.25');
    await enter();
    await page.waitForFunction(() => !document.getElementById('btn-call-wave').disabled);
    assert.equal(await page.locator('#btn-call-wave').isEnabled(), true);
    await page.evaluate(() => __td.tick(240));
    assert.equal(await page.evaluate(() => __td.game.waveManager.waveIndex), -1, 'Preparation has no automatic first wave');
    const count = await page.evaluate(() => __td.game.waveManager.waveDefs[0].reduce((n, g) => n + g.count, 0));
    assert.ok((await page.locator('#wave-preview-title').textContent()).includes(count + ' quái'));
    await page.evaluate(() => {
      const tower = new Tower('archer', 480, 300);
      tower.buildTimer = 0; tower.damageMult = 1.12;
      tower.rangeDebuffMult = .7; tower.rateDebuffMult = 2;
      __td.game.towers.push(tower); __td.game.selectedTower = tower;
      __td.game.economy.gold = 1000; __td.frame();
    });
    assert.ok((await page.locator('#branch-info-panel').textContent()).includes('13.44'));
    assert.ok((await page.locator('#branch-info-panel').textContent()).includes('66.5px'));
    assert.equal(await page.locator('[data-target-priority]').count(), 3);
    await page.click('[data-target-priority="strongest"]');
    await page.waitForFunction(() => __td.game.selectedTower.targetPriority === 'strongest');
    await page.waitForFunction(() => document.querySelector('[data-target-priority="strongest"]').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('[data-target-priority="strongest"]').getAttribute('aria-pressed'), 'true');
    await page.click('#btn-pause');
    await page.waitForFunction(() => document.querySelector('[data-target-priority="nearest"]').disabled);
    assert.equal(await page.locator('[data-target-priority="nearest"]').isDisabled(), true);
    await page.click('#btn-resume');
    await page.locator('.intel-branches summary').click();
    assert.equal(await page.locator('.intel-branch-grid section').count(), 2);
    await page.click('#tp-upgrade');
    await page.waitForFunction(() => __td.game.selectedTower.level === 2);
    assert.ok((await page.locator('.intel-upgrade').textContent()).includes('Cấp 3'));
    await page.click('#tp-upgrade');
    await page.waitForFunction(() => __td.game.selectedTower.level === 3);
    await page.waitForFunction(() => document.querySelector('.intel-branches')?.open);
    await page.click('#tp-branch-a');
    await page.waitForFunction(() => __td.game.selectedTower.branch === 'A');
    assert.equal(await page.evaluate(() => __td.game.selectedTower.targetPriority), 'strongest');
    assert.ok((await page.locator('#branch-info-panel').textContent()).includes('Đánh được quái bay'));
    assert.equal(await page.locator('.intel-branches').count(), 0);
    await page.evaluate(() => { __td.game.selectedTower = null; __td.game.towers = []; __td.frame(); });
    await page.click('#btn-call-wave');
    assert.equal(await page.evaluate(() => __td.game.waveManager.waveIndex), 0);
    assert.equal(await page.locator('#btn-call-wave').isDisabled(), true);
    await page.click('#btn-pause');
    const snapshot = () => page.evaluate(() => {
      const h = __td.game.hero;
      return [h.x, h.y, h.skillCooldowns[h.skillId], __td.game.armedTowerType];
    });
    const before = await snapshot();
    await page.keyboard.press('q');
    await page.keyboard.press('1');
    assert.deepEqual(await snapshot(), before, 'Pause blocks skills and building hotkeys');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => __td.game.paused), false);
    await page.evaluate(() => __td.game.hero.moveTo(100, 450));
    await page.locator('.build-btn').first().click();
    assert.equal(await page.evaluate(() => __td.game.armedTowerType), 'archer', 'Can build while hero moves');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { __td.game.hero.moveTarget = null; });
    const hero = await page.evaluate(() => ({ x: __td.game.hero.x, y: __td.game.hero.y }));
    const canvas = await page.locator('#gameCanvas').boundingBox();
    await page.mouse.click(canvas.x + hero.x * canvas.width / 960, canvas.y + hero.y * canvas.height / 600);
    assert.equal(await page.evaluate(() => __td.game.hero.selected), true);
    const clearedResource = await page.evaluate(() => {
      const map = __td.game.map;
      const index = map.decorations.findIndex(item => item.cost != null);
      if (index >= 0) map.clearResource(map.decorations[index]);
      return index;
    });
    await page.click('#btn-pause');
    await page.click('#btn-restart');
    await page.locator('#loading-screen').waitFor({ state: 'hidden' });
    while (await page.locator('#btn-info-close').isVisible()) await page.click('#btn-info-close');
    assert.equal(await page.evaluate(() => __td.game.hero.selected), false);
    assert.ok(clearedResource >= 0, 'First map has a resource to test reset');
    assert.equal(await page.evaluate(index => __td.game.map.decorations[index].cleared, clearedResource), false, 'Restart restores cleared resources');
    await page.locator('#gameCanvas').click({ position: { x: 650, y: 300 } });
    assert.equal(await page.evaluate(() => __td.game.hero.moveTarget), null, 'Restart clears stale hero selection');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
    });
    assert.equal(await page.evaluate(() => __td.game.paused), true, 'Hiding tab pauses game');
    await page.click('#btn-quit');
    await page.click('#back-to-menu');
    // Round trip a backup, then reject an invalid one without changing progress.
    await page.click('#btn-settings');
    await page.evaluate(() => {
      const create = URL.createObjectURL;
      URL.createObjectURL = blob => { window.backupBlob = blob; return create.call(URL, blob); };
    });
    await page.click('#btn-export-save');
    const backupText = await page.evaluate(() => window.backupBlob.text());
    const oldSave = await page.evaluate(() => JSON.stringify(SaveSystem.snapshot()));
    await page.locator('#file-import-save').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
    await page.waitForFunction(() => document.getElementById('backup-status').textContent.startsWith('Đã khôi phục'));
    await page.locator('#file-import-save').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}') });
    await page.waitForFunction(() => document.getElementById('backup-status').textContent.includes('giữ nguyên'));
    assert.equal(await page.evaluate(() => JSON.stringify(SaveSystem.snapshot())), oldSave);
    await page.click('#btn-settings-close');
    // Use the real editor callback and finish a custom map.
    await page.evaluate(() => { DevMode.set(true); MenuUI.showMainMenu(); });
    await page.click('#btn-mapeditor-menu');
    await page.locator('#editorCanvas').click({ position: { x: 100, y: 200 } });
    await page.locator('#editorCanvas').click({ position: { x: 700, y: 200 } });
    await page.click('#btn-editor-play');
    await page.locator('.hero-pick').first().click();
    await page.locator('#loading-screen').waitFor({ state: 'hidden' });
    while (await page.locator('#btn-info-close').isVisible()) await page.click('#btn-info-close');
    assert.equal(await page.evaluate(() => MAPS.length), 16, 'Custom map does not expand campaign');
    assert.equal(await page.evaluate(() => __td.game.mapIndex), 99);
    await page.evaluate(() => {
      __td.game.enemies = [];
      Object.defineProperty(__td.game.waveManager, 'finishedAllSpawns', { value: true });
      __td.tick();
    });
    await page.locator('#overlay-result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#btn-result-next').isVisible(), false);
    await page.click('#btn-result-menu');
    // Finish the last campaign map after playing a custom map.
    await page.locator('.level-card').nth(15).click();
    await page.locator('.hero-pick').first().click();
    await page.locator('#loading-screen').waitFor({ state: 'hidden' });
    while (await page.locator('#btn-info-close').isVisible()) await page.click('#btn-info-close');
    await page.evaluate(() => {
      __td.game.enemies = [];
      Object.defineProperty(__td.game.waveManager, 'finishedAllSpawns', { value: true });
      __td.tick();
    });
    await page.locator('#overlay-result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#btn-result-next').isVisible(), false, 'Last campaign map has no phantom next map');
    await page.click('#btn-result-menu');
    await page.click('#back-to-menu');
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = await page.locator('#app').boundingBox();
    assert.equal(Math.round(menu.width), 390);
    assert.equal(Math.round(menu.height), 844);
    const play = await page.locator('#btn-play').boundingBox();
    assert.ok(play.height >= 44 && play.x >= 0 && play.x + play.width <= 390);
    await page.click('#btn-play');
    assert.equal(await page.locator('#level-list').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2);
    await page.locator('.level-card').first().click();
    const heading = await page.locator('#screen-heroselect h2').boundingBox();
    const back = await page.locator('#back-to-levelselect').boundingBox();
    assert.ok(heading.y >= back.y + back.height, 'Mobile back button must not cover hero heading');
    assert.deepEqual(errors, []);
    console.log('PASS: pause, movement, restart, tab hiding, custom campaign isolation, backup, audio, mobile menus; no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
