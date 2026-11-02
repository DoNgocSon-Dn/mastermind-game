// ============================================================
// META.JS — "Nghiên Cứu": nâng cấp VĨNH VIỄN mua bằng SAO tích luỹ qua chiến dịch.
// Điểm dùng để mua = tổng sao đã đạt (mọi map) − tổng đã tiêu. Sao HIỂN THỊ ở màn
// chọn map KHÔNG bị trừ (đó là điểm đánh giá) — chỉ có "quỹ nghiên cứu" ảo bị trừ.
// Mỗi nâng cấp CỐ TÌNH NHẸ để không phá cân bằng chiến dịch — max tổng ~+12% ST,
// +120 vàng, +7 mạng... đủ để "dễ thở hơn" khi cày lại chứ không thành game khác.
// Lưu số cấp đã mua vào localStorage (fallback bộ nhớ phiên).
// ============================================================
const Meta = (() => {
  const KEY = 'td_meta_v1';

  // cost = giá LÊN cấp đó (index 0 = giá lên cấp 1). effect = giá trị TÍCH LUỸ ở cấp đó.
  const UPGRADES = {
    towerDamage: {
      label: 'Vũ Khí Sắc Bén', icon: '⚔️',
      desc: (v) => `+${Math.round(v * 100)}% sát thương mọi Tháp & Pháo Thành`,
      cost: [3, 5, 8], effect: [0.04, 0.08, 0.12],
    },
    startGold: {
      label: 'Kho Bạc Hoàng Gia', icon: '🪙',
      desc: (v) => `+${v} vàng khởi điểm mỗi trận`,
      cost: [2, 3, 5], effect: [30, 70, 120],
    },
    startLives: {
      label: 'Thành Luỹ Kiên Cố', icon: '❤️',
      desc: (v) => `+${v} mạng khởi điểm mỗi trận`,
      cost: [2, 4, 6], effect: [2, 4, 7],
    },
    buildSpeed: {
      label: 'Đội Thợ Lành Nghề', icon: '🔨',
      desc: (v) => `Xây tháp nhanh hơn ${Math.round(v * 100)}%`,
      cost: [2, 3, 5], effect: [0.12, 0.24, 0.36],
    },
    globalCd: {
      label: 'Bí Thuật Cổ Xưa', icon: '✨',
      desc: (v) => `Giảm ${Math.round(v * 100)}% hồi chiêu Mưa Lửa & Tiếp Viện`,
      cost: [2, 4, 6], effect: [0.08, 0.16, 0.25],
    },
  };

  let levels = {}; // { key: level }
  (function load() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { raw = {}; }
    for (const k in UPGRADES) levels[k] = Math.min(UPGRADES[k].cost.length, Math.max(0, (raw[k] | 0)));
  })();

  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(levels)); } catch (e) { /* memory-only phiên này */ }
  }

  function totalStars() {
    try {
      const data = SaveSystem.load(MAPS.length);
      return (data.maps || []).reduce((s, m) => s + (m.stars || 0), 0);
    } catch (e) { return 0; }
  }
  function totalSpent() {
    let s = 0;
    for (const k in UPGRADES) for (let i = 0; i < levels[k]; i++) s += UPGRADES[k].cost[i];
    return s;
  }
  function available() { return Math.max(0, totalStars() - totalSpent()); }

  function level(key) { return levels[key] || 0; }
  function maxLevel(key) { return UPGRADES[key].cost.length; }
  function nextCost(key) {
    const lv = level(key);
    return lv < maxLevel(key) ? UPGRADES[key].cost[lv] : null;
  }
  function canBuy(key) {
    const c = nextCost(key);
    return c != null && available() >= c;
  }
  function buy(key) {
    if (!canBuy(key)) return false;
    levels[key]++;
    _save();
    return true;
  }
  // Giá trị hiệu lực hiện tại của 1 nâng cấp (0 nếu chưa mua cấp nào).
  function value(key) {
    const lv = level(key);
    return lv > 0 ? UPGRADES[key].effect[lv - 1] : 0;
  }

  // ---- Các getter dùng trong gameplay ----
  function towerDamageMult() { return 1 + value('towerDamage'); }
  function startGoldBonus() { return value('startGold'); }
  function startLivesBonus() { return value('startLives'); }
  function buildTimeMult() { return 1 - value('buildSpeed'); }
  function globalCdMult() { return 1 - value('globalCd'); }

  return {
    snapshot: () => ({ ...levels }),
    restore: (data) => {
      for (const key in UPGRADES) levels[key] = data[key] || 0;
      _save();
    },
    UPGRADES, totalStars, available, level, maxLevel, nextCost, canBuy, buy, value,
    towerDamageMult, startGoldBonus, startLivesBonus, buildTimeMult, globalCdMult,
  };
})();
