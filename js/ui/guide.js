// ============================================================
// GUIDE.JS — Bảng chỉ dẫn chung (đầu game) + thông báo cơ chế mới theo map.
// showQueue(mapId, onAllClosed) gọi mỗi khi vào 1 màn (main.js:startLevel): hiện
// bảng chỉ dẫn chung nếu chưa từng thấy, sau đó hiện thông báo cơ chế mới của map
// đó (nếu có và chưa bị người chơi tắt vĩnh viễn). onAllClosed chạy đúng 1 lần khi
// không còn bảng nào để hiện — main.js dùng để mở khoá game (xem game.paused).
// Chỉ dẫn chung chia thành từng "thẻ mẹo" ngắn (icon + 1 câu), lật bằng nút Tiếp/
// Trước thay vì dồn hết vào 1 khối văn bản dài — đỡ ngán hơn khi đọc.
// ============================================================
const GuideUI = (() => {
  let els = {};
  let mode = null; // 'guide' | 'mechanic'
  let currentMapId = null;
  let closeCallback = null;
  let steps = [];
  let stepIndex = 0;

  const GENERAL_GUIDE_STEPS = [
    { icon: '🏗️', title: 'Xây Tháp', text: 'Bấm nút tháp dưới màn hình (hoặc phím 1-4: Cung Thủ / Doanh Trại / Pháp Sư / Pháo Đài) rồi bấm vào vị trí muốn đặt.' },
    { icon: '⬆️', title: 'Nâng Cấp & Bán', text: 'Bấm vào tháp đã xây để nâng cấp, bán, hoặc chọn nhánh chuyên biệt khi tháp đạt cấp cao nhất.' },
    { icon: '🗡️', title: 'Điều Khiển Tướng', text: 'Bấm vào Tướng để chọn, rồi bấm vào vị trí khác trên bản đồ để di chuyển. Phím Q để dùng kỹ năng của Tướng.' },
    { icon: '🌊', title: 'Gọi Đợt Quái', text: 'Bấm vào cổng ra quân hoặc nút ⏩ để gọi đợt quái tiếp theo khi đã sẵn sàng.' },
    { icon: '🪨', title: 'Dọn Vật Cản', text: 'Vật cản (đá, cây, nhà đổ...) có thể dọn bằng vàng để mở thêm chỗ đặt tháp.' },
    { icon: '❤️', title: 'Giữ Mạng Thành', text: 'Để quái lọt được vào thành sẽ mất Mạng — hết Mạng là thua, dọn sạch mọi đợt quái là thắng.' },
    { icon: '⏯️', title: 'Tạm Dừng & Tua Nhanh', text: 'Phím Space để Tạm Dừng, nút tốc độ ở góc dưới để tua nhanh trận đấu.' },
  ];

  function init() {
    els.overlay = document.getElementById('overlay-info');
    els.icon = document.getElementById('info-icon');
    els.title = document.getElementById('info-title');
    els.body = document.getElementById('info-body');
    els.dots = document.getElementById('info-dots');
    els.nav = document.getElementById('info-nav');
    els.backBtn = document.getElementById('btn-info-back');
    els.nextBtn = document.getElementById('btn-info-next');
    els.checkbox = document.getElementById('info-dontshow');
    els.checkboxLabel = document.getElementById('info-checkbox-label');
    els.closeBtn = document.getElementById('btn-info-close');
    els.closeBtn.onclick = _handleClose;
    els.backBtn.onclick = () => _goToStep(stepIndex - 1);
    els.nextBtn.onclick = () => _goToStep(stepIndex + 1);
    window.addEventListener('keydown', (e) => {
      if (mode !== 'guide' || els.overlay.classList.contains('hidden')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); _goToStep(stepIndex + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); _goToStep(stepIndex - 1); }
    });
  }

  function _playSound(name) { if (typeof AssetLoader !== 'undefined') AssetLoader.playSound(name); }

  function _handleClose() {
    _playSound('select');
    els.overlay.classList.add('hidden');
    if (mode === 'guide') {
      // Mặc định (checkbox bỏ trống) = coi như đã xem, không tự hiện lại lần sau.
      // Tick "hiện lại lần sau" -> KHÔNG đánh dấu đã xem, để lần vào màn kế tiếp hiện lại.
      if (!els.checkbox.checked) TutorialSystem.markGuideSeen();
    } else if (mode === 'mechanic') {
      // Mặc định (checkbox bỏ trống) = vẫn tiếp tục hiện lại mỗi lần vào map này.
      // Tick "không hiện lại" -> tắt vĩnh viễn thông báo này.
      if (els.checkbox.checked) TutorialSystem.markMechanicDismissed(currentMapId);
    }
    const cb = closeCallback;
    mode = null;
    currentMapId = null;
    closeCallback = null;
    if (cb) cb();
  }

  // Đi tới thẻ mẹo thứ `idx` (chặn ở 2 đầu danh sách) — CHỈ dùng cho mode 'guide'.
  function _goToStep(idx) {
    if (idx < 0 || idx >= steps.length) return;
    if (idx !== stepIndex) _playSound('select');
    stepIndex = idx;
    const step = steps[stepIndex];
    els.icon.textContent = step.icon;
    els.body.innerHTML = `<div class="info-step"><div class="info-step-title">${step.title}</div><p class="info-step-text">${step.text}</p></div>`;
    els.dots.innerHTML = steps.map((_, i) => `<span class="dot${i === stepIndex ? ' active' : ''}"></span>`).join('');
    els.backBtn.classList.toggle('hidden', stepIndex === 0);
    els.nextBtn.classList.toggle('hidden', stepIndex === steps.length - 1);
  }

  function showGeneralGuide(onClose) {
    mode = 'guide';
    closeCallback = onClose || null;
    steps = GENERAL_GUIDE_STEPS;
    stepIndex = -1; // ép _goToStep(0) luôn render (idx !== stepIndex)
    els.title.textContent = 'Hướng Dẫn Chơi';
    els.checkboxLabel.textContent = 'Hiện lại bảng này ở lần vào màn kế tiếp';
    els.checkbox.checked = false;
    els.dots.classList.remove('hidden');
    els.nav.classList.remove('hidden');
    _goToStep(0);
    els.overlay.classList.remove('hidden');
  }

  function showMechanicNotice(mapId, onClose) {
    const info = CONFIG.mechanicIntros[mapId];
    if (!info) { if (onClose) onClose(); return; }
    mode = 'mechanic';
    currentMapId = mapId;
    closeCallback = onClose || null;
    els.icon.textContent = info.icon || '⚠️';
    els.title.textContent = info.title;
    els.body.innerHTML = info.lines.map(l => `<p>${l}</p>`).join('');
    els.dots.classList.add('hidden');
    els.nav.classList.add('hidden');
    els.checkboxLabel.textContent = 'Không hiện lại thông báo này';
    els.checkbox.checked = false;
    els.overlay.classList.remove('hidden');
  }

  // Gọi mỗi khi vào 1 màn: chỉ dẫn chung trước (nếu chưa từng xem), rồi tới thông
  // báo cơ chế mới của map đó (nếu có và chưa bị tắt vĩnh viễn). onAllClosed chạy
  // đúng 1 lần, kể cả khi không có bảng nào cần hiện (để main.js luôn mở khoá lại
  // được game, xem game.paused).
  function showQueue(mapId, onAllClosed) {
    const done = onAllClosed || (() => {});
    const maybeMechanic = () => {
      if (CONFIG.mechanicIntros[mapId] && !TutorialSystem.isMechanicDismissed(mapId)) showMechanicNotice(mapId, done);
      else done();
    };
    if (!TutorialSystem.hasSeenGuide()) showGeneralGuide(maybeMechanic);
    else maybeMechanic();
  }

  return { init, showQueue };
})();
