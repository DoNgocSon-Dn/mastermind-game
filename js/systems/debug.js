// ============================================================
// DEBUG.JS — Lớp phủ gỡ lỗi (FPS + đếm entity). CHỈ hiện khi Dev Mode bật
// (gõ "@@@" ở Cài đặt rồi tick — xem devmode.js). Không ảnh hưởng gì khi tắt.
// Hook chạy loop thủ công nằm ở main.js: window.__td.tick(n) / __td.frame().
// ============================================================
(function () {
  let el = null;
  let frames = 0, acc = 0, fps = 0, last = performance.now();

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'debug-overlay';
    el.style.cssText =
      'position:fixed;top:4px;left:4px;z-index:99999;' +
      'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;' +
      'color:#7dff8a;background:rgba(0,0,0,0.62);padding:4px 7px;' +
      'border-radius:4px;pointer-events:none;white-space:pre;letter-spacing:0.3px;';
    document.body.appendChild(el);
    return el;
  }

  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    frames++; acc += now - last; last = now;
    if (acc >= 500) { fps = Math.round(frames / (acc / 1000)); frames = 0; acc = 0; }

    const on = typeof DevMode !== 'undefined' && DevMode.enabled;
    if (!on) { if (el) el.style.display = 'none'; return; }

    const g = (window.__td && window.__td.game) || null;
    ensure().style.display = 'block';
    if (g && window.__td.state === window.__td.STATE.PLAYING) {
      el.textContent =
        `FPS ${fps}\n` +
        `quái ${g.enemies.length}  tháp ${g.towers.length}  lính ${g.soldiers.length}\n` +
        `đạn ${g.projectiles.length}  fx ${g.effects.length}  số ${g.damageTexts.length}\n` +
        `đợt ${g.waveManager.currentWaveNumber}  vàng ${Math.floor(g.economy.gold)}  mạng ${g.lives}`;
    } else {
      el.textContent = `FPS ${fps}\n(ngoài trận)`;
    }
  }
  requestAnimationFrame(loop);
})();
