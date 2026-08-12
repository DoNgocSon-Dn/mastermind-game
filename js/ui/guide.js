// ============================================================
// GUIDE.JS — Bảng chỉ dẫn chung (đầu game) + thông báo cơ chế mới theo map.
// showQueue(mapId) gọi mỗi khi vào 1 màn (main.js:startLevel): hiện bảng chỉ dẫn
// chung nếu chưa từng thấy, sau đó hiện thông báo cơ chế mới của map đó (nếu có
// và chưa bị người chơi tắt vĩnh viễn).
// ============================================================
const GuideUI = (() => {
  let els = {};
  let mode = null; // 'guide' | 'mechanic'
  let currentMapId = null;
  let closeCallback = null;

  const GENERAL_GUIDE_LINES = [
    'Xây tháp: bấm nút tháp dưới màn hình (hoặc phím 1-4: Cung Thủ / Doanh Trại / Pháp Sư / Pháo Đài) rồi bấm vào vị trí muốn đặt.',
    'Bấm vào tháp đã xây để nâng cấp, bán, hoặc chọn nhánh chuyên biệt khi tháp đạt cấp cao nhất.',
    'Bấm vào Tướng để chọn, rồi bấm vào vị trí khác trên bản đồ để di chuyển. Phím Q để dùng kỹ năng của Tướng.',
    'Bấm vào cổng ra quân hoặc nút ⏩ để gọi đợt quái tiếp theo khi đã sẵn sàng.',
    'Vật cản (đá, cây, nhà đổ...) có thể dọn bằng vàng để mở thêm chỗ đặt tháp.',
    'Để quái lọt được vào thành sẽ mất Mạng — hết Mạng là thua, dọn sạch mọi đợt quái là thắng.',
    'Phím Space để Tạm Dừng, nút tốc độ ở góc dưới để tua nhanh trận đấu.',
  ];

  function init() {
    els.overlay = document.getElementById('overlay-info');
    els.title = document.getElementById('info-title');
    els.body = document.getElementById('info-body');
    els.checkbox = document.getElementById('info-dontshow');
    els.checkboxLabel = document.getElementById('info-checkbox-label');
    els.closeBtn = document.getElementById('btn-info-close');
    els.closeBtn.onclick = _handleClose;
  }

  function _handleClose() {
    if (typeof AssetLoader !== 'undefined') AssetLoader.playSound('select');
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

  function _open(title, lines, checkboxLabel) {
    els.title.textContent = title;
    els.body.innerHTML = lines.map(l => `<p>${l}</p>`).join('');
    els.checkboxLabel.textContent = checkboxLabel;
    els.checkbox.checked = false;
    els.overlay.classList.remove('hidden');
  }

  function showGeneralGuide(onClose) {
    mode = 'guide';
    closeCallback = onClose || null;
    _open('📖 Hướng Dẫn Chơi', GENERAL_GUIDE_LINES, 'Hiện lại bảng này ở lần vào màn kế tiếp');
  }

  function showMechanicNotice(mapId, onClose) {
    const info = CONFIG.mechanicIntros[mapId];
    if (!info) { if (onClose) onClose(); return; }
    mode = 'mechanic';
    currentMapId = mapId;
    closeCallback = onClose || null;
    _open('⚠️ ' + info.title, info.lines, 'Không hiện lại thông báo này');
  }

  // Gọi mỗi khi vào 1 màn: chỉ dẫn chung trước (nếu chưa từng xem), rồi tới thông
  // báo cơ chế mới của map đó (nếu có và chưa bị tắt vĩnh viễn).
  function showQueue(mapId) {
    const showMechanicIfNeeded = () => {
      if (CONFIG.mechanicIntros[mapId] && !TutorialSystem.isMechanicDismissed(mapId)) showMechanicNotice(mapId);
    };
    if (!TutorialSystem.hasSeenGuide()) showGeneralGuide(showMechanicIfNeeded);
    else showMechanicIfNeeded();
  }

  return { init, showQueue };
})();
