// ============================================================
// MAIN.JS — State machine tổng: MENU / LEVEL_SELECT / PLAYING / PAUSE / WIN / LOSE
// + Game loop, xử lý input, dựng Game object, gắn kết UI <-> logic.
// ============================================================
(function () {
  const STATE = { MENU: 'MENU', LEVEL_SELECT: 'LEVEL_SELECT', PLAYING: 'PLAYING', RESULT: 'RESULT' };
  let appState = STATE.MENU;

  // Dùng chung 1 màn loading full-screen cho cả lúc tải tài nguyên (boot) lẫn lúc
  // chuyển vào trận (startLevel) — opts.autoFill: thanh + lính chạy tự động cố định
  // 1.6s (không có tiến trình thật để bám vào, chỉ để cảm giác có chuyển cảnh, đủ dài
  // để thấy trọn lính chạy hết thanh — xem LOADING_AUTOFILL_MS bên dưới, PHẢI khớp
  // với thời lượng animation loadingAutoFill/loadingCharWalk khai báo trong style.css).
  const LOADING_AUTOFILL_MS = 1600;
  function showLoadingScreen(text, opts = {}) {
    document.getElementById('loading-text').textContent = text;
    const bar = document.getElementById('loading-bar-inner');
    const wrap = document.getElementById('loading-bar-wrap');
    bar.classList.remove('auto-fill');
    bar.style.width = '0%';
    wrap.classList.remove('auto-walk');
    document.getElementById('loading-char').style.left = '0';
    if (opts.autoFill) {
      void bar.offsetWidth; // ép reflow để restart animation nếu gọi liên tiếp
      bar.classList.add('auto-fill');
      wrap.classList.add('auto-walk');
    }
    document.getElementById('loading-screen').classList.remove('hidden');
  }
  function hideLoadingScreen() {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('loading-bar-inner').classList.remove('auto-fill');
    document.getElementById('loading-bar-wrap').classList.remove('auto-walk');
  }

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Phóng to hiển thị theo cửa sổ trình duyệt thực tế — toạ độ game/canvas vẫn
  // 960x600 như cũ (không đổi gì ở gameplay), chỉ scale phần HIỂN THỊ của #app qua
  // CSS var --game-scale (xem style.css). canvasPos() bên dưới đã tính theo tỉ lệ
  // rect.width/canvas.width nên click vẫn đúng toạ độ dù #app hiển thị to hay nhỏ.
  const APP_W = 960, APP_H = 600;
  // Phóng #app (canvas + toàn bộ HUD overlay bên trong) LẤP ĐẦY cửa sổ thực tế.
  // Scale LẺ, không làm tròn xuống bội số nguyên: ép bội số nguyên tuy cho pixel
  // vuông tuyệt đối nhưng trên màn hình phổ biến hầu như luôn rơi về đúng x1, khiến
  // map đứng nguyên 960x600 giữa màn hình lớn và bỏ phí phần lớn diện tích thành nền
  // đen. Canvas vẫn `image-rendering: pixelated` + imageSmoothingEnabled=false nên
  // phóng theo kiểu nearest-neighbor — nét, chỉ là bề rộng pixel không đều tuyệt đối.
  // Viền đen còn lại chỉ đến từ chênh lệch TỈ LỆ khung hình cửa sổ vs 960:600 (16:10).
  // FILL = 1: lấp ĐÚNG BẰNG chiều bị giới hạn, không chừa mép. Trước đây để 0.99
  // ("chừa mép cho đẹp") làm hở ~5px trên và ~5px dưới, lộ màu nền của lớp ngoài
  // thành 2 dải tối chạy ngang màn hình.
  const FILL = 1;
  function fitGameScale() {
    const raw = Math.min(window.innerWidth / APP_W, window.innerHeight / APP_H) * FILL;
    const scale = Math.max(0.25, raw);
    document.documentElement.style.setProperty('--game-scale', String(scale));
    // Ô nước ngoài khung (#stage) phải cùng cỡ với ô nước map vẽ trong canvas (64px
    // gốc, đã bị `zoom` phóng theo scale) — lệch cỡ là lộ ngay đường nối giữa 2 vùng.
    document.documentElement.style.setProperty('--water-tile', (64 * scale).toFixed(2) + 'px');
  }
  window.addEventListener('resize', fitGameScale);
  fitGameScale();

  // HUD giờ nằm trong #game-container nên tự ẩn/hiện theo container — không cần lớp
  // chrome riêng nữa; chỉ tính lại scale phòng khi kích thước khả dụng đổi.
  function setPlayingChrome() { fitGameScale(); }
  window.__setPlayingChrome = setPlayingChrome;

  let game = null;
  let lastTime = 0;
  let mouseX = -1, mouseY = -1;

  // ---------------- Khởi tạo game mới cho 1 map ----------------
  function createGame(mapIndex, heroType) {
    const map = MAPS[mapIndex];
    const g = {
      map, mapIndex,
      economy: new Economy(CONFIG.economy.startGold),
      lives: CONFIG.economy.startLives,
      towers: [], enemies: [], soldiers: [], projectiles: [], effects: [], damageTexts: [],
      delayedActions: [], pendingAoe: [],
      armedTowerType: null,
      selectedTower: null,
      hoveredTower: null,
      speedOptions: CONFIG.speedOptions,
      speed: 1,
      paused: false,
      over: false,
    };
    // Hero PHẢI đứng gác trước cổng thành (điểm cuối đường, nơi quái tràn vào mất
    // mạng) và hồi sinh đúng tại đây sau khi chết (xem hero.js: spawnX/spawnY dùng
    // lại khi respawn) — thay vì đứng gần điểm ra quân của địch như trước. Lùi lại
    // theo hướng NGƯỢC với đường đi (từ điểm áp út -> điểm cuối) một đoạn để Hero
    // đứng chắn NGAY TRƯỚC cổng, không đứng lấp giữa thân toà thành.
    const castle = map.castlePos;
    const path0 = map.paths[0];
    const last = path0[path0.length - 1], prev = path0[path0.length - 2] || last;
    const dx = last.x - prev.x, dy = last.y - prev.y;
    const dlen = Math.hypot(dx, dy) || 1;
    const heroX = castle.x - (dx / dlen) * 50;
    const heroY = castle.y - (dy / dlen) * 50;
    g.hero = new Hero(heroX, heroY, heroType);
    g.globalSkills = new GlobalSkills(g);
    g.waveManager = new WaveManager(
      map.waves,
      (type, pathIndex, tunnelIndex) => spawnEnemy(g, type, pathIndex, tunnelIndex),
      () => {},
      () => {}
    );
    return g;
  }

  function spawnEnemy(g, type, pathIndex, tunnelIndex) {
    const scale = g.map.waveScaleFor(g.waveManager.waveIndex);
    const path = g.map.paths[pathIndex || 0] || g.map.waypoints;
    g.enemies.push(new Enemy(type, path, scale, tunnelIndex != null ? tunnelIndex : null));
  }

  // ---------------- Update ----------------
  function update(dtRaw) {
    if (game.paused || game.over) return;
    const dt = dtRaw * game.speed;

    game.waveManager.update(dt);

    for (const t of game.towers) t.update(dt, game);

    for (const s of game.soldiers) s.update(dt, game);
    game.soldiers = game.soldiers.filter(s => !s.removed);

    for (const e of game.enemies) e.update(dt, game);

    for (const p of game.projectiles) p.update(dt, game);
    game.projectiles = game.projectiles.filter(p => !p.dead);

    for (const fx of game.effects) fx.update(dt);
    game.effects = game.effects.filter(f => !f.dead);

    for (const d of game.damageTexts) d.update(dt);
    game.damageTexts = game.damageTexts.filter(d => !d.dead);

    game.hero.update(dt, game);
    game.globalSkills.update(dt);

    for (const a of game.delayedActions) a.timer -= dt;
    game.delayedActions.filter(a => a.timer <= 0).forEach(a => a.fn());
    game.delayedActions = game.delayedActions.filter(a => a.timer > 0);

    updatePendingAoe(dt);

    // Quái chết -> vàng; quái vào nhà -> mất mạng
    for (const e of game.enemies) {
      if (e.dead) {
        game.economy.earn(e.reward);
        AssetLoader.playSound('coin', { volume: 0.25 });
      } else if (e.reachedEnd) {
        game.lives -= e.isBoss ? 5 : 1;
        AssetLoader.playSound('hurt', { volume: 0.5 });
        e.dead = true;
      }
    }
    game.enemies = game.enemies.filter(e => !e.dead);

    checkWinLose();
  }

  function updatePendingAoe(dt) {
    for (const aoe of game.pendingAoe) {
      aoe.elapsed += dt;
      if (aoe.elapsed < aoe.delay) continue;
      if (!aoe.exploded) {
        aoe.exploded = true;
        game.effects.push(new Effect(aoe.x, aoe.y, aoe.radius, aoe.duration - aoe.elapsed, '#ff5a3c', 'firefield'));
      }
      aoe.tickTimer -= dt;
      if (aoe.tickTimer <= 0) {
        aoe.tickTimer = aoe.tick;
        for (const e of game.enemies) {
          if (!e.dead && Math.hypot(e.x - aoe.x, e.y - aoe.y) <= aoe.radius) DamageSystem.applyTo(game, e, aoe.damagePerTick, 'true');
        }
      }
    }
    game.pendingAoe = game.pendingAoe.filter(a => a.elapsed < a.delay + a.duration);
  }

  function checkWinLose() {
    if (game.over) return;
    if (game.lives <= 0) { game.lives = 0; game.over = true; endGame(false); return; }
    if (game.waveManager.finishedAllSpawns && game.enemies.length === 0) { game.over = true; endGame(true); }
  }

  function endGame(win) {
    appState = STATE.RESULT;
    let stars = 0;
    let newlyUnlocked = false;
    if (win) {
      const ratio = game.lives / CONFIG.economy.startLives;
      stars = ratio > 0.8 ? 3 : ratio > 0.4 ? 2 : 1;
      const before = SaveSystem.load(MAPS.length);
      newlyUnlocked = game.mapIndex + 1 < MAPS.length && !before.maps[game.mapIndex + 1].unlocked;
      SaveSystem.reportResult(MAPS.length, game.mapIndex, stars);
      MenuUI.renderLevelList();
    }
    AssetLoader.playSound(win ? 'win' : 'lose', { volume: 0.7 });
    // Trễ chút để không đè lên tiếng thắng màn vừa phát.
    if (newlyUnlocked) setTimeout(() => AssetLoader.playSound('unlock', { volume: 0.6 }), 500);
    const hasNextLevel = game.mapIndex + 1 < MAPS.length;
    HUD.showResult(win, stars, game.lives, hasNextLevel);
  }

  // ---------------- Render ----------------
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!game) return;
    const decorUi = { hoverX: mouseX, hoverY: mouseY, gold: game.economy.gold };
    game.map.drawBackground(ctx);
    game.map.drawTunnels(ctx);
    game.map.drawPathGates(ctx, game.waveManager.waveIndex);
    game.map.drawSpawnAndBase(ctx, {
      waveReady: canCallWave(),
      hoverX: mouseX, hoverY: mouseY,
    });

    // Vẽ tháp/lính/Hero/quái CÙNG cây/bụi/đá/nhà/vật cản theo thứ tự Y (painter's
    // algorithm) để vật ở hàng dưới (y lớn hơn) luôn đè lên vật hàng trên — tránh
    // cảnh quái đứng "trên nóc" tháp, và giờ cả cảnh nhân vật đứng "trước"/"sau" 1
    // gốc cây gần đó đều được che đúng chiều sâu thay vì cây luôn nằm cứng dưới cùng
    // như 1 phông nền phẳng (xem map.js:decorEntities/obstacleEntities).
    const layered = [
      ...game.towers, ...game.soldiers, ...game.enemies,
      ...game.map.decorEntities(), ...game.map.obstacleEntities(decorUi),
    ];
    if (game.hero.alive) layered.push(game.hero);
    layered.sort((a, b) => a.y - b.y);
    for (const ent of layered) ent.draw(ctx);

    game.map.drawDecorHoverOverlay(ctx, decorUi);

    for (const p of game.projectiles) p.draw(ctx);
    for (const fx of game.effects) fx.draw(ctx);
    for (const d of game.damageTexts) d.draw(ctx);

    if (game.selectedTower) drawRangeRing(game.selectedTower);
    if (game.hoveredTower && game.hoveredTower !== game.selectedTower) drawRangeRing(game.hoveredTower);
    if (game.armedTowerType && mouseX >= 0) drawBuildPreview();
    if (game.globalSkills.pendingActivation && mouseX >= 0) drawSkillPreview();
    if (isHeroMoving()) drawHeroMoveTarget();
  }

  function drawHeroMoveTarget() {
    if (!game || !game.hero || !game.hero.moveTarget) return;
    const target = game.hero.moveTarget;
    const time = Date.now() * 0.005;
    const pulseRadius = 12 + Math.sin(time * 6) * 3;

    ctx.save();
    ctx.strokeStyle = '#6bff95';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(target.x, target.y, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(107, 255, 149, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(target.x - 9, target.y); ctx.lineTo(target.x + 9, target.y);
    ctx.moveTo(target.x, target.y - 9); ctx.lineTo(target.x, target.y + 9);
    ctx.stroke();
    ctx.restore();
  }

  function isHeroMoving() {
    return game && game.hero && game.hero.alive && game.hero.moveTarget !== null;
  }

  function drawRangeRing(tower) {
    if (tower.type === 'barracks') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,220,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Đặt tháp tự do: preview bám thẳng theo vị trí chuột (không snap vào slot),
  // đổi xanh/đỏ ngay theo isBuildable() để người chơi biết hợp lệ hay không TRƯỚC
  // khi click, không phải bấm thử rồi mới nghe tiếng lỗi.
  function drawBuildPreview() {
    const valid = game.map.isBuildable(mouseX, mouseY, game.towers);
    const type = game.armedTowerType;
    const cfg = CONFIG.towers[type];
    const isSquare = (type === 'barracks' || type === 'artillery');

    const size = 68; // Bán kính chân tháp 68px (34px bán kính)
    const half = size / 2;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = valid ? '#7fff9a' : '#ff6a6a';

    if (isSquare) {
      ctx.beginPath();
      ctx.roundRect(mouseX - half, mouseY - half, size, size, 10);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(mouseX, mouseY, half, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = valid ? '#3fdc6a' : '#dc3f3f';
    ctx.lineWidth = 2.5;

    if (isSquare) {
      ctx.beginPath();
      ctx.roundRect(mouseX - half, mouseY - half, size, size, 10);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(mouseX, mouseY, half, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hiển thị ảnh bóng ghost của tháp chuẩn bị đặt
    const typeMap = { archer: 'blueArchery', barracks: 'blueBarracks', mage: 'blueMonastery', artillery: 'blueTower' };
    const imgKey = typeMap[type] || 'blueTower';
    const img = AssetLoader.getImage(imgKey);
    if (img) {
      ctx.globalAlpha = 0.5;
      const targetW = 62;
      const targetH = targetW * (img.height / img.width);
      ctx.drawImage(img, mouseX - targetW / 2, mouseY - targetH + 10, targetW, targetH);
    }

    // Vòng tròn hiển thị tầm bắn
    if (cfg.levels[0].range) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = valid ? '#ffffff' : '#ff6a6a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mouseX, mouseY, cfg.levels[0].range, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSkillPreview() {
    const key = game.globalSkills.pendingActivation;
    const cfg = CONFIG.globalSkills[key];
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#7bdcff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mouseX, mouseY, cfg.radius || 24, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------------- Input ----------------
  function canvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  }

  function towerAt(p) {
    return game.towers.find(t => Math.hypot(t.x - p.x, t.y - p.y) < 30 || (p.y <= t.y + 12 && p.y >= t.y - 120 && Math.abs(p.x - t.x) < 36));
  }

  let heroSelected = false;
  function heroHitTest(p) {
    return game.hero.alive && Math.hypot(p.x - game.hero.x, p.y - game.hero.y) <= 28;
  }
  function setHeroSelected(v) {
    heroSelected = v;
    game.hero.selected = v;
    HUD.setHeroArmed(v);
  }

  function obstacleAt(p) {
    return (game.map.obstacles || []).find(ob => !ob.cleared && Math.hypot(ob.x - p.x, ob.y - p.y) <= ob.radius + 8);
  }
  function tryClearObstacle(ob) {
    if (!game.economy.spend(ob.cost)) { AssetLoader.playSound('error'); return; }
    ob.cleared = true;
    AssetLoader.playSound('build', { volume: 0.7 });
    game.damageTexts.push(new DamageText(ob.x, ob.y - ob.dh * 0.5, `-${ob.cost}g`, '#ff6a6a'));
    if (typeof SpriteFX !== 'undefined') SpriteFX.burstDust(game, ob.x, ob.y - 10);
  }

  function tryClearResource(res) {
    if (!game.economy.spend(res.cost)) { AssetLoader.playSound('error'); return; }
    game.map.clearResource(res);
    AssetLoader.playSound('build', { volume: 0.7 });
    game.damageTexts.push(new DamageText(res.x, res.y - (res.dh || 30) * 0.5, `-${res.cost}g`, '#ff6a6a'));
    if (typeof SpriteFX !== 'undefined') SpriteFX.burstDust(game, res.x, res.y - 10);
  }

  canvas.addEventListener('mousemove', (e) => {
    const p = canvasPos(e);
    mouseX = p.x; mouseY = p.y;
    if (game && appState === STATE.PLAYING && !game.armedTowerType) {
      game.hoveredTower = towerAt(p) || null;
    }
  });
  canvas.addEventListener('mouseleave', () => { mouseX = -1; mouseY = -1; if (game) game.hoveredTower = null; });

  function canCallWave() {
    return game.waveManager.waitingForConfirm && game.enemies.length === 0;
  }

  function spawnButtonAt(p) {
    if (!canCallWave()) return null;
    return game.map.spawnButtons.find(b => {
      const dx = p.x - b.x, dy = p.y - b.y;
      return dx >= -46 && dx <= 46 && dy >= -84 && dy <= 26;
    });
  }

  canvas.addEventListener('click', (e) => {
    if (appState !== STATE.PLAYING || !game) return;
    const p = canvasPos(e);

    // Khi Tướng đang di chuyển -> KHÔNG CHO phép nhấp bất cứ thao tác nào khác trên map cho tới khi Tướng di chuyển xong!
    if (isHeroMoving()) {
      AssetLoader.playSound('error');
      return;
    }

    if (!game.armedTowerType && !game.globalSkills.pendingActivation && spawnButtonAt(p)) {
      hudCallbacks.onNextWave();
      return;
    }
    if (game.armedTowerType) {
      tryBuildTower(p.x, p.y);
      return;
    }
    if (game.globalSkills.pendingActivation) {
      game.globalSkills.confirmActivation(p.x, p.y);
      HUD.setPendingSkill(null);
      return;
    }

    // Vật cản — bấm là dọn ngay (nếu đủ tiền), ưu tiên trước cả chọn Hero/tháp vì nó
    // là 1 điểm tương tác cố định, không nên bị nuốt mất bởi các chế độ chọn khác.
    const obHit = obstacleAt(p);
    if (obHit) { tryClearObstacle(obHit); return; }

    // Tài nguyên trang trí (cây/đá/bụi/nhà/điểm nhấn) — bấm là dọn ngay nếu đủ tiền,
    // cùng độ ưu tiên với vật cản ở trên vì cũng là 1 điểm tương tác cố định trên map.
    const resHit = game.map.resourceAt(p.x, p.y);
    if (resHit) { tryClearResource(resHit); return; }

    // Hero: đã CHỌN từ trước (bấm vào Hero ở dưới) -> cú bấm này LÀ điểm đến để di chuyển Tướng.
    // Đảm bảo KHÔNG bao giờ bị nhảy sang chọn tháp hay mở bảng nâng cấp tháp!
    if (heroSelected) {
      const stillHero = heroHitTest(p);
      setHeroSelected(false);
      deselectTower();
      if (!stillHero) {
        game.hero.moveTo(p.x, p.y);
      }
      return;
    }
    if (heroHitTest(p)) {
      deselectTower();
      setHeroSelected(true);
      return;
    }

    // Chọn tháp đã xây (kể cả Barracks để đặt lại Rally Point) — CHỈ cho chọn khi không điều khiển Hero.
    const clicked = towerAt(p);
    if (clicked) {
      if (game.selectedTower === clicked) deselectTower();
      else {
        deselectTower();
        game.selectedTower = clicked;
        game.towers.forEach(t => t.selected = (t === clicked));
      }
      return;
    }
    if (game.selectedTower && game.selectedTower.type === 'barracks') {
      game.selectedTower.setRallyPoint(p.x, p.y);
      AssetLoader.playSound('build', { volume: 0.4 });
      return;
    }
    // Không trúng gì cả -> chỉ bỏ chọn tháp (KHÔNG còn tự động ra lệnh Hero di chuyển
    // như trước — giờ phải chọn Hero rõ ràng trước, xem nhánh heroSelected ở trên).
    deselectTower();
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancelArmedOrPending();
  });

  const TOWER_HOTKEYS = ['1', '2', '3', '4'];
  const TOWER_HOTKEY_ORDER = ['archer', 'barracks', 'mage', 'artillery'];
  window.addEventListener('keydown', (e) => {
    if (appState !== STATE.PLAYING || !game) return;
    if (e.key === 'Escape') { cancelArmedOrPending(); return; }
    const hotkeyIdx = TOWER_HOTKEYS.indexOf(e.key);
    if (hotkeyIdx !== -1) { hudCallbacks.onArmTower(TOWER_HOTKEY_ORDER[hotkeyIdx]); return; }
    const heroSkill = CONFIG.heroTypes[game.hero.heroType].skill;
    if (e.key.toUpperCase() === heroSkill.key) game.hero.useSkill(heroSkill.id, game, { x: mouseX, y: mouseY });
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
  });

  function tryBuildTower(x, y) {
    const type = game.armedTowerType;
    const cost = CONFIG.towers[type].levels[0].cost;
    if (!game.map.isBuildable(x, y, game.towers)) { AssetLoader.playSound('error'); return; }
    if (!game.economy.spend(cost)) { AssetLoader.playSound('error'); return; }
    const tower = new Tower(type, x, y);
    // Barracks: cho lính tự đi ra điểm gần nhất trên đường thay vì đứng cạnh tháp,
    // để chặn quái ngay từ khi vừa xây (rally point mặc định trước đó chỉ là ước
    // lượng "phía dưới tháp 46px", không chắc rơi đúng vào đường).
    if (type === 'barracks') tower.rallyPoint = game.map.nearestPointOnPath(x, y);
    game.towers.push(tower);
    AssetLoader.playSound('build', { volume: 0.6 });
    tower._hammerSfx = AssetLoader.playSustained('hammer', { volume: 0.45, loop: true });
    game.armedTowerType = null;
    HUD.setArmedTower(null);
  }

  function cancelArmedOrPending() {
    game.armedTowerType = null;
    HUD.setArmedTower(null);
    game.globalSkills.pendingActivation = null;
    HUD.setPendingSkill(null);
    if (heroSelected) setHeroSelected(false);
    deselectTower();
  }

  function deselectTower() {
    game.selectedTower = null;
    game.towers.forEach(t => t.selected = false);
  }

  function togglePause() {
    game.paused = !game.paused;
    HUD.showPauseOverlay(game.paused);
  }

  // ---------------- Loop ----------------
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0);
    lastTime = ts;
    if (appState === STATE.PLAYING) {
      update(dt);
      render();
      HUD.update(game);
    }
    requestAnimationFrame(loop);
  }

  // ---------------- Wiring UI <-> State machine ----------------
  function startLevel(mapIndex, heroType) {
    const targetMap = MAPS[mapIndex] || MAPS[0];
    const mapName = targetMap ? targetMap.name : 'Bản Đồ';
    showLoadingScreen(`Đang vào trận — ${mapName}`, { autoFill: true });
    // Không có tài nguyên thật để chờ (map/hero dựng tức thời) — trễ giả 0.7s để
    // kịp thấy màn chuyển cảnh thay vì chớp tắt ngay, đồng bộ với animation thanh chạy.
    setTimeout(() => {
      game = createGame(mapIndex, heroType);
      appState = STATE.PLAYING;
      document.getElementById('game-container').classList.remove('hidden');
      document.getElementById('screen-menu').classList.add('hidden');
      document.getElementById('screen-levelselect').classList.add('hidden');
      HeroSelectUI.hide();
      setPlayingChrome(true);
      HUD.setHero(game.hero.heroType);
      HUD.hideResult();
      HUD.showPauseOverlay(false);
      deselectTower();
      hideLoadingScreen();
    }, LOADING_AUTOFILL_MS);
  }

  function exitToLevelSelect() {
    appState = STATE.LEVEL_SELECT;
    document.getElementById('game-container').classList.add('hidden');
    setPlayingChrome(false);
    MenuUI.showLevelSelect();
  }

  const hudCallbacks = {
    onTogglePause: togglePause,
    onCycleSpeed: () => {
      const opts = game.speedOptions;
      const idx = opts.indexOf(game.speed);
      game.speed = opts[(idx + 1) % opts.length];
    },
    onSetSpeed: (rate) => {
      if (game.speedOptions.includes(rate)) game.speed = rate;
    },
    onNextWave: () => {
      if (isHeroMoving()) { AssetLoader.playSound('error'); return; }
      if (game.enemies.length > 0) { AssetLoader.playSound('error'); return; }
      game.waveManager.requestNextWaveNow();
    },
    onToggleSpawnMode: () => {
      if (isHeroMoving()) { AssetLoader.playSound('error'); return; }
      game.waveManager.setAutoAdvance(!game.waveManager.autoAdvance);
    },
    onExit: () => exitToLevelSelect(),
    onRestart: () => startLevel(game.mapIndex, game.hero.heroType),
    onNextLevel: () => startLevel(game.mapIndex + 1, game.hero.heroType),
    onArmTower: (type) => {
      if (isHeroMoving()) { AssetLoader.playSound('error'); return; }
      if (game.economy.gold < CONFIG.towers[type].levels[0].cost) { AssetLoader.playSound('error'); }
      game.armedTowerType = game.armedTowerType === type ? null : type;
      game.globalSkills.pendingActivation = null;
      HUD.setPendingSkill(null);
      HUD.setArmedTower(game.armedTowerType);
      if (heroSelected) setHeroSelected(false);
      deselectTower();
    },
    onCloseTowerPanel: () => deselectTower(),
    onUpgradeTower: (tower) => {
      if (isHeroMoving()) { AssetLoader.playSound('error'); return; }
      if (tower.upgrade(game.economy)) AssetLoader.playSound('upgrade');
    },
    onBranchTower: (tower, key) => {
      if (isHeroMoving()) { AssetLoader.playSound('error'); return; }
      if (tower.chooseBranch(key, game.economy, game)) AssetLoader.playSound('upgrade');
    },
    onSellTower: (tower) => {
      if (isHeroMoving()) { AssetLoader.playSound('error'); return; }
      if (tower._hammerSfx) { AssetLoader.stopSound(tower._hammerSfx); tower._hammerSfx = null; }
      game.economy.earn(tower.sellValue());
      game.towers = game.towers.filter(t => t !== tower);
      game.soldiers = game.soldiers.filter(s => s.owner !== tower);
      deselectTower();
    },
    onGlobalSkill: (key) => {
      if (isHeroMoving()) { AssetLoader.playSound('error'); return; }
      game.armedTowerType = null; HUD.setArmedTower(null);
      if (heroSelected) setHeroSelected(false);
      if (game.globalSkills.pendingActivation === key) { game.globalSkills.pendingActivation = null; HUD.setPendingSkill(null); }
      else { game.globalSkills.requestActivate(key); HUD.setPendingSkill(game.globalSkills.pendingActivation); }
    },
    onHeroSkill: (key) => game.hero.useSkill(key, game, { x: mouseX, y: mouseY }),
  };
  HUD.init(hudCallbacks);

  MenuUI.init({
    onPlayClicked: () => { appState = STATE.LEVEL_SELECT; MenuUI.showLevelSelect(); },
    onLevelSelected: (idx) => HeroSelectUI.show(idx),
  });

  HeroSelectUI.init({
    onHeroChosen: (mapIndex, heroType) => startLevel(mapIndex, heroType),
    onBackToLevels: () => { HeroSelectUI.hide(); MenuUI.showLevelSelect(); },
  });

  MapEditorUI.init({
    onPlayCustom: (customMapDef) => {
      MAPS[99] = customMapDef;
      HeroSelectUI.show(99);
    },
  });

  // ---------------- Boot ----------------
  async function boot() {
    const loadingChar = document.getElementById('loading-char');
    const barOuterWidth = document.getElementById('loading-bar-outer').offsetWidth;
    await AssetLoader.loadAll((ratio) => {
      document.getElementById('loading-bar-inner').style.width = Math.round(ratio * 100) + '%';
      loadingChar.style.left = Math.max(0, ratio * barOuterWidth - loadingChar.clientWidth) + 'px';
    });
    hideLoadingScreen();
    appState = STATE.MENU;
    MenuUI.showMainMenu();
    requestAnimationFrame(loop);
  }

  boot();
})();
