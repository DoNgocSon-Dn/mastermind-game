// ============================================================
// RESEARCH.JS — Màn "Nghiên Cứu": tiêu SAO tích luỹ (tổng sao mọi map − đã tiêu)
// để mua nâng cấp vĩnh viễn (xem systems/meta.js). Mở từ nút ở Main Menu.
// ============================================================
const ResearchUI = (() => {
  let els = {};
  let onBack = null;

  function init({ onBackToMenu }) {
    els.screen = document.getElementById('screen-research');
    els.points = document.getElementById('research-points');
    els.list = document.getElementById('research-list');
    els.badge = document.getElementById('research-badge');
    onBack = onBackToMenu;
    document.getElementById('research-back').onclick = () => { AssetLoader.playSound('select'); onBack && onBack(); };
    refreshBadge();
  }

  // Chấm nhỏ cạnh nút "Nghiên Cứu" ở menu: số điểm còn có thể tiêu (0 -> ẩn).
  function refreshBadge() {
    if (!els.badge) return;
    const avail = Meta.available();
    if (avail > 0) {
      els.badge.textContent = avail;
      els.badge.classList.remove('hidden');
    } else {
      els.badge.classList.add('hidden');
    }
  }

  function show() {
    els.screen.classList.remove('hidden');
    render();
  }
  function hide() { els.screen.classList.add('hidden'); }

  function render() {
    const avail = Meta.available();
    els.points.innerHTML = `<span class="rp-star">★</span> ${avail} điểm nghiên cứu` +
      `<span class="rp-sub">(tổng ${Meta.totalStars()} sao đã đạt − đã dùng ${Meta.totalStars() - avail})</span>`;

    els.list.innerHTML = '';
    for (const key in Meta.UPGRADES) {
      const u = Meta.UPGRADES[key];
      const lv = Meta.level(key), maxLv = Meta.maxLevel(key);
      const cost = Meta.nextCost(key);
      const curVal = Meta.value(key);
      const nextVal = lv < maxLv ? u.effect[lv] : curVal;

      const card = document.createElement('div');
      card.className = 'rs-card';
      const pips = Array.from({ length: maxLv }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const line = lv >= maxLv
        ? `<div class="rs-max">★ Đã tối đa — ${u.desc(curVal)}</div>`
        : `<div class="rs-next">Cấp ${lv + 1}: ${u.desc(nextVal)}</div>` +
          `<button class="rs-buy" data-key="${key}" ${avail < cost ? 'disabled' : ''}>Mua · ${cost} <span class="rp-star">★</span></button>`;

      card.innerHTML =
        `<div class="rs-head"><span class="rs-icon">${u.icon}</span>` +
        `<span class="rs-name">${u.label}</span><span class="rs-pips">${pips}</span></div>` +
        (lv > 0 ? `<div class="rs-cur">Hiện tại: ${u.desc(curVal)}</div>` : `<div class="rs-cur rs-cur-none">Chưa nghiên cứu</div>`) +
        line;
      els.list.appendChild(card);
    }
    els.list.querySelectorAll('.rs-buy').forEach(b => {
      b.onclick = () => {
        if (Meta.buy(b.dataset.key)) { AssetLoader.playSound('upgrade'); render(); refreshBadge(); }
        else AssetLoader.playSound('error');
      };
    });
  }

  return { init, show, hide, refreshBadge };
})();
