// ============================================================
// ENDLESS.JS — Chế độ VÔ TẬN: mở cho 1 map sau khi ĐÃ THẮNG map đó ở chiến dịch
// (stars > 0). Wave sinh vô hạn, leo thang mãi; không có "thắng", chơi tới khi hết
// mạng. Điểm = số đợt sống sót được, lưu kỷ lục riêng từng map vào localStorage.
// ============================================================
const Endless = (() => {
  const KEY = 'td_endless_scores_v1';
  let memory = null;
  let useMemory = false;
  try { localStorage.getItem(KEY); } catch (e) { useMemory = true; }

  function _load() {
    if (useMemory) return memory || (memory = {});
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function _save(obj) {
    if (useMemory) { memory = obj; return; }
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { useMemory = true; memory = obj; }
  }

  function getBest(mapId) { return _load()[mapId] || 0; }
  // Trả về TRUE nếu đây là kỷ lục mới.
  function reportScore(mapId, waves) {
    const data = _load();
    if (waves > (data[mapId] || 0)) { data[mapId] = waves; _save(data); return true; }
    return false;
  }

  // Sinh 1 đợt vô tận thứ n (n = waveIndex, 0-based). Leo thang: quái đông + nhanh
  // dần, tank/flying vào sớm, boss định kỳ. HP do main.js nhân waveScaleFor (vẫn
  // tăng tuyến tính sau khi chững — xem map.js) nên càng về sau càng trâu.
  const BOSS_CYCLE = ['boss', 'bossSummer', 'bossAutumn', 'bossWinter', 'bossSpring'];
  function genWave(n, pathCount) {
    const w = n + 1;                       // số đợt hiển thị (1-based)
    const pc = Math.max(1, pathCount || 1);
    const alt = w % pc;                    // đường xoay vòng cho nhóm phụ
    const fastInt = Math.max(0.25, 0.6 - w * 0.01);
    const g = [
      { type: 'normal', count: 8 + Math.floor(w * 1.6), interval: Math.max(0.3, 0.7 - w * 0.012), delay: 0, path: 0 },
    ];
    if (pc > 1) g.push({ type: 'normal', count: 5 + Math.floor(w * 1.1), interval: 0.45, delay: 0.3, path: 1 });
    if (w >= 2) g.push({ type: 'fast', count: 4 + Math.floor(w * 1.0), interval: fastInt, delay: 1.0, path: alt });
    if (w >= 3) g.push({ type: 'tank', count: 2 + Math.floor(w * 0.55), interval: 0.85, delay: 1.4, path: (alt + 1) % pc });
    if (w >= 4) g.push({ type: 'flying', count: 2 + Math.floor(w * 0.55), interval: 0.6, delay: 1.9, path: alt });
    if (w >= 7 && w % 3 === 0) {
      g.push({ type: 'splitter', count: 1 + Math.floor(w / 20), interval: 1.2, delay: 2.4, path: 0 });
    }
    // Boss cứ mỗi 5 đợt (từ đợt 5). Số lượng tăng dần cho các mốc rất xa.
    if (w >= 5 && w % 5 === 0) {
      const idx = Math.floor(w / 5 - 1) % BOSS_CYCLE.length;
      g.push({ type: BOSS_CYCLE[idx], count: 1 + Math.floor(w / 30), interval: 2.5, delay: 3, path: 0 });
    }
    return g;
  }

  return { getBest, reportScore, genWave };
})();
