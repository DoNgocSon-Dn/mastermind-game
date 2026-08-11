// ============================================================
// HEROSELECT.JS — Màn Chọn Tướng, hiện sau khi chọn map và trước khi vào trận.
// 3 lớp cố định (archer/spear/tank), số liệu/skill đọc từ CONFIG.heroTypes.
// ============================================================
const HeroSelectUI = (() => {
  let els = {};
  let onChoose = null;
  let onBack = null;
  let pendingMapIndex = null;

  const HERO_ORDER = ['archer', 'spear', 'tank'];
  // Ảnh thẻ tướng = đúng khung Idle đầu tiên của sprite nhân vật đó (khớp hệt nhân
  // vật sẽ xuất hiện trong trận), thay cho emoji — xem class .hero-sprite-* ở CSS.
  const HERO_SPRITE_CLASS = { archer: 'hero-sprite-archer', spear: 'hero-sprite-spear', tank: 'hero-sprite-tank' };

  function init({ onHeroChosen, onBackToLevels }) {
    els.screen = document.getElementById('screen-heroselect');
    els.list = document.getElementById('hero-list');
    onChoose = onHeroChosen;
    onBack = onBackToLevels;

    document.getElementById('back-to-levelselect').onclick = () => { onBack && onBack(); };
    _renderCards();
  }

  function show(mapIndex) {
    pendingMapIndex = mapIndex;
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
        <div class="hero-icon ${HERO_SPRITE_CLASS[type] || ''}"></div>
        <div class="hero-name">${cfg.label}</div>
        <div class="hero-desc">${cfg.desc}</div>
        <div class="hero-passive"><span class="tag">Nội tại</span> ${cfg.passive.name}</div>
        <div class="hero-skill"><span class="tag">Chủ động</span> ${cfg.skill.name}</div>
        <button class="menu-btn btn-compact hero-pick">Chọn</button>
      `;
      card.querySelector('.hero-pick').onclick = () => {
        AssetLoader.playSound('select');
        hide();
        onChoose && onChoose(pendingMapIndex, type);
      };
      els.list.appendChild(card);
    });
  }

  return { init, show, hide };
})();
