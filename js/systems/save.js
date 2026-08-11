// ============================================================
// SAVE.JS — Lưu tiến độ: map đã mở khóa, số sao mỗi map.
// Dùng localStorage; nếu môi trường không hỗ trợ (vd artifact preview),
// tự động fallback sang biến JS trong session và báo qua console.
// ============================================================
const SaveSystem = (() => {
  const KEY = 'td_pixel_save_v1';
  let memoryFallback = null;
  let useMemory = false;

  function storageAvailable() {
    try {
      const t = '__td_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }
  useMemory = !storageAvailable();
  if (useMemory) console.warn('localStorage không khả dụng — tiến độ chỉ lưu trong phiên chơi hiện tại.');

  function defaultData(mapCount) {
    const maps = [];
    for (let i = 0; i < mapCount; i++) maps.push({ unlocked: i === 0, stars: 0 });
    return { maps };
  }

  // Bản THẬT, chưa áp Dev Mode — dùng nội bộ để ghi/đọc tiến trình lưu, tránh việc
  // bật Dev Mode (xem devmode.js) vô tình ghi "đã mở khoá hết" đè lên save thật.
  function _loadRaw(mapCount) {
    if (useMemory) return memoryFallback || (memoryFallback = defaultData(mapCount));
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData(mapCount);
      const parsed = JSON.parse(raw);
      if (!parsed.maps || parsed.maps.length !== mapCount) return defaultData(mapCount);
      return parsed;
    } catch (e) {
      return defaultData(mapCount);
    }
  }

  // Bản dùng để HIỂN THỊ (menu chọn map) — mở hết map nếu Dev Mode đang bật (xem
  // devmode.js), KHÔNG ghi gì xuống storage cả (chỉ trả về 1 bản copy) nên tắt Dev
  // Mode là tiến trình khoá map thật lộ lại y nguyên, không mất gì.
  function load(mapCount) {
    const data = _loadRaw(mapCount);
    if (typeof DevMode !== 'undefined' && DevMode.enabled) return { maps: data.maps.map(m => ({ ...m, unlocked: true })) };
    return data;
  }

  function save(data) {
    if (useMemory) { memoryFallback = data; return; }
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { useMemory = true; memoryFallback = data; }
  }

  function reportResult(mapCount, mapIndex, stars) {
    const data = _loadRaw(mapCount);
    if (stars > (data.maps[mapIndex].stars || 0)) data.maps[mapIndex].stars = stars;
    if (mapIndex + 1 < mapCount) data.maps[mapIndex + 1].unlocked = true;
    save(data);
    return data;
  }

  return { load, save, reportResult, get usingMemory() { return useMemory; } };
})();
