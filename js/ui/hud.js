// ============================================================
// HUD.JS — HUD trong trận: vàng, mạng, wave, build menu, tower panel,
// global skills, hero skills, pause/speed/next-wave.
// ============================================================
const HUD = (() => {
  let cb = {};
  let els = {};
  let lastGold = null;

  const TOWER_ORDER = ['archer', 'barracks', 'mage', 'artillery'];

  function init(callbacks) {
    cb = callbacks;
    els.gold = document.getElementById('hud-gold');
    els.lives = document.getElementById('hud-lives');
    els.wave = document.getElementById('hud-wave');
    els.mapName = document.getElementById('hud-map-name');
    els.buildMenu = document.getElementById('build-menu');
    els.status = document.getElementById('hud-status');
    els.enemiesLeft = document.getElementById('hud-enemies');
    els.speedGroup = document.getElementById('speed-group');
    els.towerPanel = document.getElementById('tower-panel');
    els.branchInfoPanel = document.getElementById('branch-info-panel');
    els.skillsPanel = document.getElementById('skills-panel');
    els.armedBanner = document.getElementById('armed-banner');
    els.hoverBar = document.getElementById('tower-hover-bar');
    els.btnPause = document.getElementById('btn-pause');
    els.btnSpawnMode = document.getElementById('btn-spawn-mode');
    els.btnExit = document.getElementById('btn-menu-exit');

    els.btnPause.onclick = () => cb.onTogglePause();
    els.btnSpawnMode.onclick = () => cb.onToggleSpawnMode();
    els.btnExit.onclick = () => cb.onExit();

    _buildSpeedButtons();
    _buildBuildMenu();
    _buildGlobalSkillButtons();

    document.getElementById('btn-resume').onclick = () => cb.onTogglePause();
    document.getElementById('btn-restart').onclick = () => cb.onRestart();
    document.getElementById('btn-quit').onclick = () => cb.onExit();
    document.getElementById('btn-result-retry').onclick = () => cb.onRestart();
    document.getElementById('btn-result-menu').onclick = () => cb.onExit();
    els.btnResultNext = document.getElementById('btn-result-next');
    els.btnResultNext.onclick = () => cb.onNextLevel();
  }

  // Mỗi mức tốc độ 1 nút riêng, mức đang chạy tô cam — thay cho 1 nút "x1" bấm xoay
  // vòng (không nhìn ra đang ở mức nào so với các mức còn lại).
  function _buildSpeedButtons() {
    els.speedGroup.innerHTML = '';
    CONFIG.speedOptions.forEach((rate) => {
      const b = document.createElement('div');
      b.className = 'speed-btn';
      b.dataset.speed = String(rate);
      b.textContent = rate + 'x';
      b.title = `Tốc độ ${rate}x`;
      b.onclick = () => cb.onSetSpeed(rate);
      els.speedGroup.appendChild(b);
    });
  }

  const TOWER_HOTKEYS = ['1', '2', '3', '4'];
  // Bậc sức mạnh/độ "nặng đô" của từng loại tháp (1-3 chấm) — suy từ giá mở bán và
  // vai trò: Cung Thủ rẻ/cơ bản, Pháp Sư & Doanh Trại tầm trung, Pháo Đài đắt nhất
  // + xây lâu nhất. Hiện bằng chấm thay vì chữ để không tốn chỗ trên thẻ nhỏ.
  const TOWER_TIER = { archer: 1, mage: 2, barracks: 2, artillery: 3 };
  function _buildBuildMenu() {
    els.buildMenu.innerHTML = '';
    TOWER_ORDER.forEach((type, i) => {
      const cfg = CONFIG.towers[type];
      const tier = TOWER_TIER[type] || 1;
      const btn = document.createElement('div');
      btn.className = 'build-btn';
      btn.dataset.type = type;
      btn.dataset.tier = String(tier);
      const pips = Array.from({ length: 3 }, (_, k) =>
        `<i class="${k < tier ? 'on' : ''}"></i>`).join('');
      btn.innerHTML = `<span class="hotkey">${TOWER_HOTKEYS[i]}</span>` +
        `<span class="bicon bicon-${type}"></span>` +
        `<span class="tier">${pips}</span>` +
        `<span class="cost"><span class="icon-inline coin"></span>${cfg.levels[0].cost}</span>`;
      // Tooltip pixel-art (đồng bộ với tooltip của skill) thay cho title mặc định —
      // tên tháp đã bỏ khỏi thẻ để tiết kiệm chỗ nên tooltip là nơi xem tên đầy đủ.
      btn.dataset.tooltip = `${cfg.label} — ${cfg.desc}`;
      btn.onclick = () => cb.onArmTower(type);
      els.buildMenu.appendChild(btn);
    });
  }

  // Mô tả ngắn cho tooltip CSS (hover hiện ngay, không chờ tooltip mặc định của
  // trình duyệt) — config gốc không có field desc riêng cho skill nên viết tay ở
  // đây, ngắn gọn đủ hiểu tác dụng + số liệu chính.
  const SKILL_DESC = {
    reinforcement: (c) => `Gọi ${c.unitCount} lính tiếp viện (${c.unitHp} HP) trong ${c.duration}s — hồi chiêu ${c.cooldown}s`,
    rainOfFire: (c) => `Dội lửa bán kính ${c.radius} quanh điểm chọn, cháy ${c.duration}s — hồi chiêu ${c.cooldown}s`,
    volley: (c) => `Né lùi ${c.dodgeDist}px rồi dội ${c.arrows} mũi tên (${c.damage} dmg/mũi) quanh mục tiêu — hồi chiêu ${c.cooldown}s`,
    piercingRush: (c) => `Lao ${c.dashDist}px xuyên địch, ${c.damage} dmg + choáng ${c.stunDuration}s — hồi chiêu ${c.cooldown}s`,
    battleCry: (c) => `Buff tốc đánh x${c.atkRateMult} + sát thương x${c.dmgMult} cho lính quanh Hero trong ${c.duration}s — hồi chiêu ${c.cooldown}s`,
  };
  const HERO_SKILL_ICON = { volley: 'skill-icon-volley', piercingRush: 'skill-icon-piercing', battleCry: 'skill-icon-battlecry' };

  // Global skills (Tiếp viện/Mưa lửa) dựng 1 LẦN lúc init — không đổi theo hero.
  function _buildGlobalSkillButtons() {
    els.skillsPanel.innerHTML = '';
    const gsIconClass = { reinforcement: 'skill-icon-reinforce', rainOfFire: 'skill-icon-fire' };
    for (const key in CONFIG.globalSkills) {
      const cfg = CONFIG.globalSkills[key];
      const btn = document.createElement('div');
      btn.className = 'skill-btn ready';
      btn.dataset.key = key;
      btn.dataset.kind = 'global';
      btn.dataset.tooltip = `${cfg.name} — ${(SKILL_DESC[key] || (() => ''))(cfg)}`;
      btn.innerHTML = `<div class="skill-icon ${gsIconClass[key] || ''}"></div><div class="cd-overlay hidden"></div>`;
      btn.onclick = () => cb.onGlobalSkill(key);
      els.skillsPanel.appendChild(btn);
    }
  }

  // Nút skill Hero: CHỈ 1 nút, đổi hẳn theo lớp nhân vật vừa chọn ở màn Chọn Tướng —
  // gọi lại mỗi khi vào trận (xem setHero), không dựng cố định lúc init như trước
  // (trước đây chỉ có 1 Hero duy nhất nên 2 skill Chém/Hồi máu cố định).
  function setHero(heroType) {
    els.skillsPanel.querySelectorAll('.skill-btn[data-kind="hero"]').forEach(b => b.remove());
    const scfg = CONFIG.heroTypes[heroType].skill;
    const btn = document.createElement('div');
    btn.className = 'skill-btn ready';
    btn.dataset.key = scfg.id;
    btn.dataset.kind = 'hero';
    btn.dataset.tooltip = `${scfg.name} — ${(SKILL_DESC[scfg.id] || (() => ''))(scfg)}`;
    btn.innerHTML = `<div class="skill-icon ${HERO_SKILL_ICON[scfg.id] || ''}"></div><div class="cd-overlay hidden"></div><span class="key-hint">${scfg.key}</span>`;
    btn.onclick = () => cb.onHeroSkill(scfg.id);
    els.skillsPanel.appendChild(btn);
  }

  function setArmedTower(type) {
    document.querySelectorAll('.build-btn').forEach(b => b.classList.toggle('armed', b.dataset.type === type));
    if (type) {
      const cfg = CONFIG.towers[type];
      els.armedBanner.textContent = `Đang đặt ${cfg.label} — click vào bản đồ để xây (Esc để huỷ)`;
      els.armedBanner.classList.remove('hidden');
    } else {
      els.armedBanner.classList.add('hidden');
    }
  }

  function setPendingSkill(key) {
    document.querySelectorAll('.skill-btn').forEach(b => b.classList.toggle('pending', b.dataset.key === key));
    if (key) {
      els.armedBanner.textContent = `Chọn vị trí trên bản đồ để dùng ${CONFIG.globalSkills[key].name}`;
      els.armedBanner.classList.remove('hidden');
    } else if (!document.querySelector('.build-btn.armed')) {
      els.armedBanner.classList.add('hidden');
    }
  }

  // Đã CHỌN Hero, đang chờ bấm điểm đến trên bản đồ để ra lệnh di chuyển.
  function setHeroArmed(v) {
    if (v) {
      els.armedBanner.textContent = 'Đã chọn Hero — bấm vào bản đồ để di chuyển tới đó (bấm lại vào Hero để huỷ)';
      els.armedBanner.classList.remove('hidden');
    } else if (!document.querySelector('.build-btn.armed')) {
      els.armedBanner.classList.add('hidden');
    }
  }

  function update(game) {
    els.gold.textContent = DevMode.enabled ? '∞' : Math.floor(game.economy.gold);
    if (lastGold !== null && game.economy.gold > lastGold) {
      els.gold.parentElement.classList.remove('gold-flash'); void els.gold.offsetWidth;
      els.gold.parentElement.classList.add('gold-flash');
    }
    lastGold = game.economy.gold;
    els.lives.textContent = game.lives;
    els.wave.textContent = `${game.waveManager.currentWaveNumber}/${game.waveManager.totalWaves}`;
    els.mapName.textContent = game.map.name;
    els.btnPause.textContent = game.paused ? '▶' : '⏸';
    els.speedGroup.querySelectorAll('.speed-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.speed) === game.speed);
    });

    // Banner giữa trên: trạng thái trận theo ngữ cảnh (giống "Chuẩn bị · 2s" của mẫu)
    const wm = game.waveManager;
    const alive = game.enemies.length;
    let status;
    if (game.paused) status = 'Tạm dừng';
    else if (wm.currentWaveNumber === 0) status = 'Chuẩn bị';
    else if (wm.waitingForConfirm) status = alive > 0 ? 'Đang dọn quái' : 'Sẵn sàng đợt sau';
    else status = 'Đang giao tranh';
    els.status.textContent = status;
    els.enemiesLeft.textContent = `Địch còn lại: ${alive}`;

    const autoAdvance = game.waveManager.autoAdvance;
    els.btnSpawnMode.textContent = autoAdvance ? '⏹' : '⏩';
    els.btnSpawnMode.classList.toggle('active', autoAdvance);
    els.btnSpawnMode.title = autoAdvance
      ? 'Đang tự động dồn hết các wave liên tục — bấm để dừng lại, chờ xác nhận từng wave'
      : 'Bấm để tự động dồn hết các wave liên tục (không cần bấm xác nhận từng wave)';

    document.querySelectorAll('.build-btn').forEach(btn => {
      const type = btn.dataset.type;
      const cost = _nextCostLabel(type);
      const affordable = game.economy.gold >= cost;
      btn.classList.toggle('disabled', !affordable);
      btn.querySelector('.cost').innerHTML = `<span class="icon-inline coin"></span>${cost}`;
    });

    document.querySelectorAll('.skill-btn[data-kind="global"]').forEach(btn => {
      const key = btn.dataset.key;
      const ratio = game.globalSkills.cooldownRatio(key);
      const overlay = btn.querySelector('.cd-overlay');
      if (ratio > 0) {
        overlay.classList.remove('hidden');
        overlay.textContent = Math.ceil(game.globalSkills.cooldowns[key]);
        btn.classList.remove('ready');
      } else {
        overlay.classList.add('hidden');
        btn.classList.add('ready');
      }
    });
    document.querySelectorAll('.skill-btn[data-kind="hero"]').forEach(btn => {
      const key = btn.dataset.key;
      const cd = game.hero.skillCooldowns[key];
      const overlay = btn.querySelector('.cd-overlay');
      if (cd > 0) {
        overlay.classList.remove('hidden');
        overlay.textContent = Math.ceil(cd);
        btn.classList.remove('ready');
      } else {
        overlay.classList.add('hidden');
        btn.classList.add('ready');
      }
    });

    if (game.selectedTower) renderTowerPanel(game, game.selectedTower);
    else els.towerPanel.classList.add('hidden');

    // Tháp đang CHỌN cũng hiện thanh chỉ số dưới đáy màn hình (không chỉ lúc hover) —
    // vì panel nổi giờ chỉ còn 2 nút hành động, không còn chỗ hiện chỉ số nữa.
    renderHoverBar(game.hoveredTower || game.selectedTower);

    if (game.selectedTower && game.selectedTower.canChooseBranch) renderBranchInfo(game.selectedTower);
    else els.branchInfoPanel.classList.add('hidden');
  }

  // Bảng so sánh nhanh nhánh A/B — chỉ dựng lại khi đổi tháp (nội dung tĩnh theo
  // cfg, không cần refresh mỗi frame như panel hành động vốn phụ thuộc số vàng).
  let _lastBranchTowerId = null;
  function renderBranchInfo(tower) {
    els.branchInfoPanel.classList.remove('hidden');
    if (tower.id === _lastBranchTowerId) return;
    _lastBranchTowerId = tower.id;
    const a = tower.cfg.branches.A, b = tower.cfg.branches.B;
    els.branchInfoPanel.innerHTML = `
      <div class="bip-title">⚠ Chọn 1 trong 2 — không đổi lại được</div>
      <div class="bip-cols">
        <div class="bip-col">
          <div class="bip-name">${a.label}</div>
          <div class="bip-cost">${a.cost}<span class="icon-inline coin"></span></div>
          <div class="bip-desc">${a.desc}</div>
        </div>
        <div class="bip-col">
          <div class="bip-name">${b.label}</div>
          <div class="bip-cost">${b.cost}<span class="icon-inline coin"></span></div>
          <div class="bip-desc">${b.desc}</div>
        </div>
      </div>`;
  }

  function _speedLabel(rate) {
    if (rate <= 0.5) return 'Nhanh';
    if (rate <= 1.0) return 'Vừa';
    return 'Chậm';
  }
  function _rangeLabel(range) {
    if (range <= 140) return 'Ngắn';
    if (range <= 170) return 'Vừa';
    return 'Xa';
  }

  let _lastHoverSig = null;
  function renderHoverBar(tower) {
    if (!tower) {
      els.hoverBar.classList.add('hidden');
      _lastHoverSig = null;
      return;
    }
    const aliveForSig = tower.type === 'barracks' ? tower.soldiers.filter(sd => sd.state !== 'Dead').length : -1;
    const sig = [tower.id, tower.level, tower.branch, aliveForSig].join('|');
    if (sig === _lastHoverSig) { els.hoverBar.classList.remove('hidden'); return; }
    _lastHoverSig = sig;
    els.hoverBar.classList.remove('hidden');

    const s = tower.stats;
    let stats;
    if (tower.type === 'barracks') {
      const alive = tower.soldiers.filter(sd => sd.state !== 'Dead').length;
      stats = [
        { val: `${alive}/${tower.soldiers.length}`, label: 'Lính' },
        { val: s.dmg, label: 'Sát thương', icon: true },
        { val: s.hp, label: 'Máu lính' },
        { val: _speedLabel(s.atkRate), label: 'Tốc độ đánh' },
        { val: s.respawn + 's', label: 'Hồi lính' },
      ];
    } else {
      stats = [
        { val: Math.round(s.damage), label: 'Sát thương', icon: true },
        { val: _speedLabel(s.rate), label: 'Tốc độ bắn' },
        { val: _rangeLabel(s.range), label: 'Tầm bắn' },
      ];
    }
    els.hoverBar.innerHTML = `<div class="thb-name"><span class="icon-inline"></span>${tower.displayName}</div>` +
      stats.map(st => `<div class="thb-stat"><span class="thb-val">${st.icon ? '<span class="icon-inline"></span>' : ''}${st.val}</span><span class="thb-label">${st.label}</span></div>`).join('');
  }

  function _nextCostLabel(type) {
    return CONFIG.towers[type].levels[0].cost;
  }


  // Thanh hành động NỔI, siêu gọn — thay cho bảng chữ nhật lớn cũ. Nổi ngay phía trên
  // đầu tháp (toạ độ world, xem CANVAS_W/H clamp bên dưới) thay vì đứng cố định 1 góc
  // màn hình, nên không bao giờ che khuất phần map ở xa tháp. Chỉ số chi tiết đã dời
  // sang #tower-hover-bar (hiện cả khi hover LẪN khi đang chọn — xem update()); ở đây
  // CHỈ còn tối đa 2-3 nút hành động: Nâng cấp/Chọn nhánh + Bán.
  const CANVAS_W = 960, CANVAS_H = 600;
  let _lastPanelSig = null;
  function renderTowerPanel(game, tower) {
    els.towerPanel.classList.remove('hidden');
    const buildSec = Math.ceil(tower.buildTimer);
    const gold = game.economy.gold;
    // Cờ "đủ tiền" đưa thẳng vào chữ ký để nút bật/tắt NGAY khoảnh khắc đủ vàng, không
    // phải chờ mốc làm tròn 5 vàng như phần chữ hiển thị bên dưới.
    const costs = [tower.nextUpgradeCost, tower.cfg.branches && tower.cfg.branches.A.cost, tower.cfg.branches && tower.cfg.branches.B.cost];
    const affordSig = costs.map(c => (c != null && gold >= c) ? 1 : 0).join('');
    const sig = [tower.id, tower.x, tower.y, tower.level, tower.branch, Math.floor(gold / 5), affordSig, buildSec].join('|');
    if (sig !== _lastPanelSig) {
      _lastPanelSig = sig;

      // Neo mép ĐÁY-GIỮA của thanh vào 1 điểm phía trên nóc tháp (CSS transform:
      // translate(-50%,-100%) đặt bên style.css) — kẹp lại gần mép canvas để thanh
      // không bao giờ bị cắt/lòi ra ngoài khung 960x600 dù tháp đứng sát biên.
      const ax = Math.min(Math.max(tower.x, 40), CANVAS_W - 40);
      const ay = Math.min(Math.max(tower.y - 58, 26), CANVAS_H - 20);
      els.towerPanel.style.left = ax + 'px';
      els.towerPanel.style.top = ay + 'px';

      const building = tower.buildTimer > 0;
      let html = '';
      if (building) {
        html = `<div class="tp-pill">🔨 ${buildSec}s</div>`;
      } else if (!tower.branch && tower.level < 3) {
        const cost = tower.nextUpgradeCost;
        html += `<button id="tp-upgrade" class="tp-btn upgrade" ${gold < cost ? 'disabled' : ''} data-tooltip="Nâng cấp lên Lv.${tower.level + 1}">⬆ ${cost}<span class="icon-inline coin"></span></button>`;
        html += `<button id="tp-sell" class="tp-btn sell" data-tooltip="Bán tháp">💰 ${tower.sellValue()}<span class="icon-inline coin"></span></button>`;
      } else if (tower.canChooseBranch) {
        const a = tower.cfg.branches.A, b = tower.cfg.branches.B;
        html += `<button id="tp-branch-a" class="tp-btn branch-a" ${gold < a.cost ? 'disabled' : ''} data-tooltip="${a.label} — ${a.desc}">A · ${a.cost}<span class="icon-inline coin"></span></button>`;
        html += `<button id="tp-branch-b" class="tp-btn branch-b" ${gold < b.cost ? 'disabled' : ''} data-tooltip="${b.label} — ${b.desc}">B · ${b.cost}<span class="icon-inline coin"></span></button>`;
        html += `<button id="tp-sell" class="tp-btn sell small" data-tooltip="Bán tháp">💰 ${tower.sellValue()}</button>`;
      } else {
        html += `<div class="tp-pill">★ MAX</div>`;
        html += `<button id="tp-sell" class="tp-btn sell" data-tooltip="Bán tháp">💰 ${tower.sellValue()}<span class="icon-inline coin"></span></button>`;
      }

      els.towerPanel.innerHTML = html;
      const up = document.getElementById('tp-upgrade'); if (up) up.onclick = () => cb.onUpgradeTower(tower);
      const ba = document.getElementById('tp-branch-a'); if (ba) ba.onclick = () => cb.onBranchTower(tower, 'A');
      const bb = document.getElementById('tp-branch-b'); if (bb) bb.onclick = () => cb.onBranchTower(tower, 'B');
      const sl = document.getElementById('tp-sell'); if (sl) sl.onclick = () => cb.onSellTower(tower);
    }
  }

  function showPauseOverlay(show) { document.getElementById('overlay-pause').classList.toggle('hidden', !show); }

  function showResult(win, stars, livesLeft, hasNextLevel) {
    const el = document.getElementById('overlay-result');
    el.classList.remove('hidden', 'win', 'lose');
    el.classList.add(win ? 'win' : 'lose');
    document.getElementById('result-title').textContent = win ? '🏆 CHIẾN THẮNG' : '💀 THẤT BẠI';
    document.getElementById('result-stars').textContent = win ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    document.getElementById('result-desc').textContent = win ? `Bạn đã giữ vững thành trì với ${livesLeft} mạng còn lại!` : 'Thành trì đã thất thủ... Hãy nâng cấp tháp và thử lại!';
    // Thắng mới có màn kế tiếp để đi tiếp luôn — thua thì chỉ có Chơi lại/Về Level
    // Select (còn màn hiện tại chưa qua được, "màn tiếp theo" không có nghĩa gì cả).
    els.btnResultNext.classList.toggle('hidden', !(win && hasNextLevel));
  }
  function hideResult() { document.getElementById('overlay-result').classList.add('hidden'); }

  return { init, update, setHero, setArmedTower, setPendingSkill, setHeroArmed, showPauseOverlay, showResult, hideResult };
})();
