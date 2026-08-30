// ============================================================
// DIFFICULTY.JS — Chọn độ khó toàn cục (Dễ / Thường / Khó). Áp dụng cho MỌI map:
//   goldMult      — nhân vàng khởi điểm
//   livesMult     — nhân số mạng khởi điểm
//   waveScaleMult — nhân thêm vào map.waveScaleFor() (HP quái)
//   rewardMult    — nhân vàng nhận khi hạ quái
// Lưu lựa chọn vào localStorage (fallback bộ nhớ trong phiên, giống save.js) — chỉ
// cần chọn 1 lần, các trận sau giữ nguyên cho tới khi đổi. "Thường" = số liệu gốc
// (mọi hệ số = 1) nên bật/tắt module này không đổi gì nếu để mặc định.
// ============================================================
const Difficulty = (() => {
  const KEY = 'td_difficulty_v1';

  const LEVELS = {
    easy: {
      id: 'easy', label: 'Dễ', badge: '🌱',
      blurb: '+40% vàng · 30 mạng · quái yếu hơn 18%',
      goldMult: 1.40, livesMult: 1.50, waveScaleMult: 0.82, rewardMult: 1.12,
    },
    normal: {
      id: 'normal', label: 'Thường', badge: '⚔️',
      blurb: 'Cân bằng gốc — 250 vàng, 20 mạng',
      goldMult: 1.00, livesMult: 1.00, waveScaleMult: 1.00, rewardMult: 1.00,
    },
    hard: {
      id: 'hard', label: 'Khó', badge: '🔥',
      blurb: '−15% vàng · 15 mạng · quái trâu hơn 18% · ít thưởng',
      goldMult: 0.85, livesMult: 0.75, waveScaleMult: 1.18, rewardMult: 0.90,
    },
  };

  let current = 'normal';
  try {
    const s = localStorage.getItem(KEY);
    if (s && LEVELS[s]) current = s;
  } catch (e) { /* localStorage không khả dụng — giữ 'normal' trong phiên */ }

  function set(id) {
    if (!LEVELS[id]) return;
    current = id;
    try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
  }
  function get() { return LEVELS[current]; }

  return { set, get, LEVELS, get id() { return current; } };
})();
