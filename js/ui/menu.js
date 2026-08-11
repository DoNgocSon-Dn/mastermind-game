// ============================================================
// MENU.JS — Main Menu + Level Select (mở khóa dần, hiển thị số sao).
// ============================================================
const MenuUI = (() => {
  let els = {};
  let onSelectLevel = null;

  const SEASON_INFO = {
    spring: { icon: '🌸', name: 'Mùa Xuân' },
    summer: { icon: '☀️', name: 'Mùa Hạ' },
    autumn: { icon: '🍂', name: 'Mùa Thu' },
    winter: { icon: '❄️', name: 'Mùa Đông' },
  };

  function init({ onPlayClicked, onLevelSelected }) {
    els.menu = document.getElementById('screen-menu');
    els.levelSelect = document.getElementById('screen-levelselect');
    els.levelList = document.getElementById('level-list');
    els.settingsPanel = document.getElementById('settings-panel');
    els.devModeRow = document.getElementById('dev-mode-row');
    els.chkDevMode = document.getElementById('chk-devmode');

    document.getElementById('btn-play').onclick = () => { AssetLoader.playSound('select'); onPlayClicked(); };
    document.getElementById('btn-settings').onclick = () => els.settingsPanel.classList.toggle('hidden');
    document.getElementById('btn-settings-close').onclick = () => els.settingsPanel.classList.add('hidden');
    document.getElementById('chk-mute').onchange = (e) => { SoundSettings.muted = e.target.checked; };
    document.getElementById('rng-volume').oninput = (e) => { SoundSettings.sfxVolume = parseFloat(e.target.value); };
    document.getElementById('chk-mute-music').onchange = (e) => { SoundSettings.musicMuted = e.target.checked; MusicPlayer.applySettings(); };
    document.getElementById('rng-music-volume').oninput = (e) => { SoundSettings.musicVolume = parseFloat(e.target.value); MusicPlayer.applySettings(); };
    document.getElementById('back-to-menu').onclick = () => showMainMenu();

    // Trình duyệt chặn autoplay có âm thanh — chỉ phát nhạc nền sau tương tác đầu tiên.
    document.addEventListener('pointerdown', () => MusicPlayer.start(), { once: true });
    document.addEventListener('keydown', () => MusicPlayer.start(), { once: true });

    els.chkDevMode.checked = DevMode.enabled;
    els.chkDevMode.onchange = (e) => { DevMode.set(e.target.checked); renderLevelList(); };
    _initDevModeUnlock();

    onSelectLevel = onLevelSelected;
  }

  // Ô Dev Mode trong Cài đặt mặc định ẨN — chỉ hiện ra sau khi gõ 3 lần liên tiếp
  // ký tự "@" (không xen phím nào khác ở giữa). Mục đích chỉ là tránh người chơi
  // thường bấm nhầm vào cheat vàng vô hạn/mở hết map, KHÔNG phải bảo mật thật sự.
  function _initDevModeUnlock() {
    let streak = 0;
    const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta'];
    window.addEventListener('keydown', (e) => {
      // Gõ "@" luôn cần giữ Shift (hoặc AltGr) — mỗi lần nhấn/thả phím bổ trợ đó
      // giữa 2 lần gõ "@" cũng bắn ra 1 sự kiện keydown riêng, nếu tính cả vào thì
      // chuỗi gần như không bao giờ đếm đủ 3 lần liên tiếp. Bỏ qua các phím bổ trợ,
      // chỉ tính streak theo phím "thật".
      if (MODIFIER_KEYS.includes(e.key)) return;
      // e.repeat: giữ phím hơi lâu là trình duyệt tự bắn liên tiếp nhiều keydown cho
      // ĐÚNG 1 lần bấm vật lý — nếu tính cả thì chỉ cần lỡ tay giữ "@" hơi lâu 1 lần
      // là đủ đếm thành 3, tự lộ ra dù người chơi không cố ý gõ 3 lần.
      if (e.repeat) return;
      streak = e.key === '@' ? streak + 1 : 0;
      if (streak >= 3) {
        streak = 0;
        if (els.devModeRow.classList.contains('hidden')) {
          els.devModeRow.classList.remove('hidden');
          AssetLoader.playSound('select');
        }
      }
    });
  }

  function showMainMenu() {
    els.menu.classList.remove('hidden');
    els.levelSelect.classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    if (window.__setPlayingChrome) window.__setPlayingChrome(false);
  }

  function showLevelSelect() {
    els.menu.classList.add('hidden');
    els.levelSelect.classList.remove('hidden');
    document.getElementById('game-container').classList.add('hidden');
    if (window.__setPlayingChrome) window.__setPlayingChrome(false);
    renderLevelList();
    // Tự cuộn ngang tới map đã mở gần nhất, để không phải kéo lại từ đầu mỗi lần vào.
    const cards = els.levelList.querySelectorAll('.level-card:not(.locked)');
    const lastUnlocked = cards[cards.length - 1];
    if (lastUnlocked) lastUnlocked.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  // 1 hàng ngang duy nhất, 16 map đúng thứ tự 1→16 (cuộn ngang) — mỗi thẻ có badge
  // số thứ tự + icon mùa nhỏ ở góc để vẫn nhận ra map thuộc mùa nào dù không còn
  // tiêu đề mùa tách hàng như bản trước.
  function renderLevelList() {
    const save = SaveSystem.load(MAPS.length);
    els.levelList.innerHTML = '';
    const seasonCounts = new Map();
    MAPS.forEach((map) => {
      const key = map.season || map.theme;
      seasonCounts.set(key, (seasonCounts.get(key) || 0) + 1);
    });
    const seenPerSeason = new Map();

    MAPS.forEach((map, i) => {
      const key = map.season || map.theme;
      const info = SEASON_INFO[key] || { icon: '🗺', name: key };
      const seenSoFar = (seenPerSeason.get(key) || 0) + 1;
      seenPerSeason.set(key, seenSoFar);
      const isBossMap = seenSoFar === seasonCounts.get(key);

      const entry = save.maps[i];
      const card = document.createElement('div');
      card.className = `level-card theme-${map.theme}` + (entry.unlocked ? '' : ' locked') + (isBossMap ? ' boss-map' : '');
      const thumbIcon = isBossMap ? '👑' : info.icon;
      card.innerHTML = `
        <div class="level-num">${i + 1}</div>
        <div class="season-badge">${info.icon}</div>
        <div class="thumb">${thumbIcon}</div>
        <div class="name">${map.name}</div>
        <div class="stars">${starString(entry.stars)}</div>
        ${entry.unlocked ? '<div class="play-tag">Chơi</div>' : '<div class="lock-icon">🔒</div>'}
      `;
      if (entry.unlocked) card.onclick = () => { AssetLoader.playSound('select'); onSelectLevel(i); };
      else card.onclick = () => AssetLoader.playSound('error', { volume: 0.5 });
      els.levelList.appendChild(card);
    });
  }

  function starString(n) {
    let s = '';
    for (let i = 0; i < 3; i++) s += i < n ? '★' : '☆';
    return s;
  }

  return { init, showMainMenu, showLevelSelect, renderLevelList };
})();
