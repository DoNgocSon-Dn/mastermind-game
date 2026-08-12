// ============================================================
// TUTORIAL.JS — Bảng chỉ dẫn chung (chỉ hiện 1 lần chơi đầu tiên) + thông báo
// cơ chế mới theo map (mặc định hiện lại mỗi lần vào map đó, tới khi người chơi
// tick "Không hiện lại"). Dùng localStorage; fallback bộ nhớ trong phiên nếu môi
// trường không hỗ trợ (cùng cách save.js xử lý).
// ============================================================
const TutorialSystem = (() => {
  const KEY = 'td_tutorial_v1';
  let memoryFallback = null;
  let useMemory = false;

  function storageAvailable() {
    try {
      const t = '__td_tut_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }
  useMemory = !storageAvailable();

  function defaultData() { return { guideSeen: false, mechanicsDismissed: {} }; }

  function _load() {
    if (useMemory) return memoryFallback || (memoryFallback = defaultData());
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      return {
        guideSeen: !!parsed.guideSeen,
        mechanicsDismissed: (parsed.mechanicsDismissed && typeof parsed.mechanicsDismissed === 'object') ? parsed.mechanicsDismissed : {},
      };
    } catch (e) {
      return defaultData();
    }
  }

  function _save(data) {
    if (useMemory) { memoryFallback = data; return; }
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { useMemory = true; memoryFallback = data; }
  }

  function hasSeenGuide() { return _load().guideSeen; }
  function markGuideSeen() { const d = _load(); d.guideSeen = true; _save(d); }

  function isMechanicDismissed(mapId) { return !!_load().mechanicsDismissed[mapId]; }
  function markMechanicDismissed(mapId) {
    const d = _load();
    d.mechanicsDismissed[mapId] = true;
    _save(d);
  }

  return { hasSeenGuide, markGuideSeen, isMechanicDismissed, markMechanicDismissed };
})();
