// ============================================================
// HEROSELECT.JS — Màn Chọn Tướng, hiện sau khi chọn map và trước khi vào trận.
// 3 lớp cố định (archer/spear/tank), số liệu/skill đọc từ CONFIG.heroTypes.
// ============================================================
const HeroSelectUI = (() => {
  let els = {};
  let onChoose = null;
  let onBack = null;
  let pendingMapIndex = null;
  let endlessMode = false; // chọn ở hàng "Chế độ" (chỉ hiện khi map đã thắng)

  const HERO_ORDER = ['archer', 'spear', 'tank'];
  // Ảnh thẻ tướng = đúng khung Idle đầu tiên của sprite nhân vật đó (khớp hệt nhân
  // vật sẽ xuất hiện trong trận), thay cho emoji — xem class .hero-sprite-* ở CSS.
  const HERO_SPRITE_CLASS = { archer: 'hero-sprite-archer', spear: 'hero-sprite-spear', tank: 'hero-sprite-tank' };

  function init({ onHeroChosen, onBackToLevels }) {
    els.screen = document.getElementById('screen-heroselect');
    els.list = document.getElementById('hero-list');
    els.diffButtons = document.getElementById('diff-buttons');
    els.diffHint = document.getElementById('diff-hint');
    els.modeSelect = document.getElementById('mode-select');
    els.modeButtons = document.getElementById('mode-buttons');
    els.modeHint = document.getElementById('mode-hint');
    onChoose = onHeroChosen;
    onBack = onBackToLevels;

    document.getElementById('back-to-levelselect').onclick = () => { onBack && onBack(); };
    _renderDifficulty();
    _renderCards();
  }

  // Đã THẮNG map này ở chiến dịch chưa (stars > 0) — điều kiện mở chế độ Vô Tận.
  function _mapCleared(mapIndex) {
    try {
      const data = SaveSystem.load(MAPS.length);
      return !!(data.maps && data.maps[mapIndex] && data.maps[mapIndex].stars > 0);
    } catch (e) { return false; }
  }

  // Hàng "Chế độ": Thường / Vô Tận. Chỉ hiện khi map đã thắng ít nhất 1 sao. Mỗi lần
  // MỞ màn chọn tướng đều reset về "Thường" (endlessMode = false).
  function _renderMode() {
    if (!els.modeSelect) return;
    const cleared = pendingMapIndex != null && _mapCleared(pendingMapIndex);
    if (!cleared) {
      endlessMode = false;
      els.modeSelect.classList.add('hidden');
      return;
    }
    els.modeSelect.classList.remove('hidden');
    els.modeButtons.innerHTML = '';
    const opts = [
      { key: false, badge: '⚔️', label: 'Thường', hint: 'Chơi hết wave rồi thắng' },
      { key: true, badge: '🔁', label: 'Vô Tận', hint: `Wave vô hạn — kỷ lục: ${Endless.getBest(MAPS[pendingMapIndex].id)} đợt` },
    ];
    for (const o of opts) {
      const b = document.createElement('button');
      b.className = 'diff-btn' + (endlessMode === o.key ? ' active' : '');
      b.innerHTML = `<span class="diff-badge">${o.badge}</span>${o.label}`;
      b.onclick = () => { endlessMode = o.key; AssetLoader.playSound('select'); _renderMode(); };
      els.modeButtons.appendChild(b);
    }
    els.modeHint.textContent = opts.find(o => o.key === endlessMode).hint;
  }

  // Hàng nút Dễ / Thường / Khó — áp dụng cho MỌI map, nhớ lựa chọn qua localStorage
  // (xem systems/difficulty.js). Không phải 1 bước riêng: chọn xong bấm thẳng "Chọn Tướng".
  function _renderDifficulty() {
    if (!els.diffButtons || typeof Difficulty === 'undefined') return;
    els.diffButtons.innerHTML = '';
    for (const key of ['easy', 'normal', 'hard']) {
      const lv = Difficulty.LEVELS[key];
      const b = document.createElement('button');
      b.className = 'diff-btn' + (Difficulty.id === key ? ' active' : '');
      b.dataset.key = key;
      b.innerHTML = `<span class="diff-badge">${lv.badge}</span>${lv.label}`;
      b.onclick = () => {
        Difficulty.set(key);
        AssetLoader.playSound('select');
        _renderDifficulty();
      };
      els.diffButtons.appendChild(b);
    }
    if (els.diffHint) els.diffHint.textContent = Difficulty.get().blurb;
  }

  function show(mapIndex) {
    pendingMapIndex = mapIndex;
    endlessMode = false;
    _renderDifficulty();
    _renderMode();
    document.getElementById('screen-levelselect').classList.add('hidden');
    els.screen.classList.remove('hidden');
  }

  function hide() { els.screen.classList.add('hidden'); }

  function _renderCards() {
    els.list.innerHTML = '';
    HERO_ORDER.forEach((type) => {
      const cfg = CONFIG.heroTypes[type];
      const card = document.createElement('div');
      card.className = `hero-card hero-${type}`;
      card.innerHTML = `
        <div class="hero-header">
          <div class="hero-icon ${HERO_SPRITE_CLASS[type] || ''}"></div>
          <div class="hero-title-box">
            <div class="hero-name">${cfg.label}</div>
            <div class="hero-badge">${cfg.badge || ''}</div>
          </div>
        </div>
        <div class="hero-desc">${cfg.desc}</div>
        <div class="hero-stats">
          <div class="stat-item" title="Máu tối đa"><span class="stat-ico">❤️</span> <span class="stat-val">${cfg.hp} HP</span></div>
          <div class="stat-item" title="Sát thương"><span class="stat-ico">⚔️</span> <span class="stat-val">${cfg.attackDamage} ST</span></div>
          <div class="stat-item" title="Tầm đánh"><span class="stat-ico">🎯</span> <span class="stat-val">${cfg.attackRange}px</span></div>
          <div class="stat-item" title="Tốc độ bắn/chém"><span class="stat-ico">⚡</span> <span class="stat-val">${cfg.attackRate}s</span></div>
        </div>
        <div class="hero-passive">
          <div class="skill-header">
            <span class="tag tag-passive">Nội tại</span>
            <span class="skill-title">${cfg.passive.name}</span>
          </div>
          <div class="skill-desc">${cfg.passive.desc || ''}</div>
        </div>
        <div class="hero-skill">
          <div class="skill-header">
            <span class="tag tag-active">Chiêu [Q]</span>
            <span class="skill-title">${cfg.skill.name}</span>
            <span class="skill-cd">⏳ ${cfg.skill.cooldown}s</span>
          </div>
          <div class="skill-desc">${cfg.skill.desc || ''}</div>
        </div>
        <button class="menu-btn btn-compact hero-pick">▶ Chọn Tướng</button>
      `;
      card.querySelector('.hero-pick').onclick = () => {
        AssetLoader.playSound('select');
        hide();
        onChoose && onChoose(pendingMapIndex, type, endlessMode);
      };
      els.list.appendChild(card);
    });
  }

  return { init, show, hide };
})();
