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

  function init({ onPlayClicked, onLevelSelected, onResearchClicked }) {
    els.menu = document.getElementById('screen-menu');
    els.levelSelect = document.getElementById('screen-levelselect');
    els.levelList = document.getElementById('level-list');
    els.settingsPanel = document.getElementById('settings-panel');
    els.devModeRow = document.getElementById('dev-mode-row');
    els.chkDevMode = document.getElementById('chk-devmode');

    document.getElementById('btn-play').onclick = () => { AssetLoader.playSound('select'); onPlayClicked(); };
    const btnResearch = document.getElementById('btn-research');
    if (btnResearch && onResearchClicked) btnResearch.onclick = () => { AssetLoader.playSound('select'); onResearchClicked(); };
    document.getElementById('btn-settings').onclick = () => els.settingsPanel.classList.toggle('hidden');
    document.getElementById('btn-settings-close').onclick = () => els.settingsPanel.classList.add('hidden');
    for (const [id, field, checkbox] of [['chk-mute', 'muted', true], ['rng-volume', 'sfxVolume', false], ['chk-mute-music', 'musicMuted', true], ['rng-music-volume', 'musicVolume', false]]) {
      const control = document.getElementById(id);
      control[checkbox ? 'checked' : 'value'] = SoundSettings[field];
      control[checkbox ? 'onchange' : 'oninput'] = (e) => {
        SoundSettings[field] = checkbox ? e.target.checked : Number(e.target.value);
        SoundSettings.save();
        MusicPlayer.applySettings();
      };
    }
    document.getElementById('back-to-menu').onclick = () => showMainMenu();
    _initBackupControls();

    // Trình duyệt chặn autoplay có âm thanh — chỉ phát nhạc nền sau tương tác đầu tiên.
    document.addEventListener('pointerdown', () => MusicPlayer.start(), { once: true });
    document.addEventListener('keydown', () => MusicPlayer.start(), { once: true });

    const handleMapEditorClick = () => {
      const isUnlocked = typeof SaveSystem !== 'undefined' && typeof MAPS !== 'undefined' && SaveSystem.isGameCompleted(MAPS.length);
      if (isUnlocked) {
        AssetLoader.playSound('select');
        MapEditorUI.show();
      }
    };

    const btnMenuEd = document.getElementById('btn-mapeditor-menu');
    if (btnMenuEd) btnMenuEd.onclick = handleMapEditorClick;

    const btnSelEd = document.getElementById('btn-mapeditor-select');
    if (btnSelEd) btnSelEd.onclick = handleMapEditorClick;

    els.chkDevMode.checked = DevMode.enabled;
    els.chkDevMode.onchange = (e) => {
      DevMode.set(e.target.checked);
      renderLevelList();
      updateMapEditorButtonsVisibility();
    };
    _initDevModeUnlock();

    onSelectLevel = onLevelSelected;
  }

  function _initBackupControls() {
    const status = document.getElementById('backup-status');
    const fileInput = document.getElementById('file-import-save');
    document.getElementById('btn-export-save').onclick = () => {
      const data = { format: 'thu-thanh-save', version: 1, progress: SaveSystem.snapshot(), research: Meta.snapshot(), endless: Endless.snapshot() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'thu-thanh-tien-do.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Đã tạo tệp sao lưu tiến độ, nghiên cứu và kỷ lục vô tận.';
    };
    document.getElementById('btn-import-save').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        if (file.size > 100000) throw new Error('Tệp sao lưu quá lớn.');
        const data = JSON.parse(await file.text());
        if (data?.format !== 'thu-thanh-save' || data.version !== 1 || !Array.isArray(data.progress?.maps) || data.progress.maps.length !== 16) throw new Error('Tệp không đúng định dạng sao lưu Thủ Thành.');
        let stars = 0, spent = 0;
        for (const entry of data.progress.maps) {
          if (!entry || typeof entry.unlocked !== 'boolean' || !Number.isInteger(entry.stars) || entry.stars < 0 || entry.stars > 3) throw new Error('Tiến độ trong tệp không hợp lệ.');
          stars += entry.stars;
        }
        const research = {};
        for (const key in Meta.UPGRADES) {
          const level = data.research?.[key] ?? 0;
          const costs = Meta.UPGRADES[key].cost;
          if (!Number.isInteger(level) || level < 0 || level > costs.length) throw new Error('Nghiên cứu trong tệp không hợp lệ.');
          research[key] = level;
          spent += costs.slice(0, level).reduce((sum, cost) => sum + cost, 0);
        }
        if (spent > stars) throw new Error('Điểm nghiên cứu vượt quá số sao đã đạt.');
        const endless = {};
        for (const map of MAPS) {
          const score = data.endless?.[map.id] ?? 0;
          if (!Number.isSafeInteger(score) || score < 0) throw new Error('Kỷ lục vô tận không hợp lệ.');
          endless[map.id] = score;
        }
        // Validate the entire file before changing any live progress.
        SaveSystem.save(data.progress);
        Meta.restore(research);
        Endless.restore(endless);
        ResearchUI.refreshBadge();
        updateMapEditorButtonsVisibility();
        status.textContent = SaveSystem.usingMemory ? 'Đã khôi phục trong phiên này. Trình duyệt hiện không cho lưu lâu dài.' : 'Đã khôi phục tiến độ, nghiên cứu và kỷ lục vô tận.';
      } catch (error) {
        status.textContent = error instanceof SyntaxError ? 'Không đọc được tệp JSON. Tiến độ hiện tại được giữ nguyên.' : `${error.message} Tiến độ hiện tại được giữ nguyên.`;
      } finally { fileInput.value = ''; }
    };
  }

  function updateMapEditorButtonsVisibility() {
    const isUnlocked = typeof SaveSystem !== 'undefined' && typeof MAPS !== 'undefined' && Array.isArray(MAPS) && SaveSystem.isGameCompleted(MAPS.length);
    const btnMenuEd = document.getElementById('btn-mapeditor-menu');
    const btnSelEd = document.getElementById('btn-mapeditor-select');
    if (btnMenuEd) btnMenuEd.classList.toggle('hidden', !isUnlocked);
    if (btnSelEd) btnSelEd.classList.toggle('hidden', !isUnlocked);
  }

  function _initDevModeUnlock() {
    let streak = 0;
    const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta'];
    window.addEventListener('keydown', (e) => {
      if (MODIFIER_KEYS.includes(e.key)) return;
      if (e.repeat) return;
      streak = e.key === '@' ? streak + 1 : 0;
      if (streak >= 3) {
        streak = 0;
        if (els.devModeRow.classList.contains('hidden')) {
          els.devModeRow.classList.remove('hidden');
          AssetLoader.playSound('select');
          updateMapEditorButtonsVisibility();
        }
      }
    });
  }

  function showMainMenu() {
    els.menu.classList.remove('hidden');
    els.levelSelect.classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    if (window.__setPlayingChrome) window.__setPlayingChrome(false);
    updateMapEditorButtonsVisibility();
    if (typeof ResearchUI !== 'undefined') ResearchUI.refreshBadge();
  }

  function showLevelSelect() {
    els.menu.classList.add('hidden');
    els.levelSelect.classList.remove('hidden');
    document.getElementById('game-container').classList.add('hidden');
    if (window.__setPlayingChrome) window.__setPlayingChrome(false);
    renderLevelList();
    updateMapEditorButtonsVisibility();
    const cards = els.levelList.querySelectorAll('.level-card:not(.locked)');
    const lastUnlocked = cards[cards.length - 1];
    if (lastUnlocked) lastUnlocked.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function renderLevelList() {
    updateMapEditorButtonsVisibility();
    const officialMaps = MAPS.slice(0, 16);
    const save = SaveSystem.load(16);
    els.levelList.innerHTML = '';
    const seasonCounts = new Map();
    officialMaps.forEach((map) => {
      if (!map) return;
      const key = map.season || map.theme;
      seasonCounts.set(key, (seasonCounts.get(key) || 0) + 1);
    });
    const seenPerSeason = new Map();

    officialMaps.forEach((map, i) => {
      if (!map) return;
      const key = map.season || map.theme;
      const info = SEASON_INFO[key] || { icon: '🗺', name: key };
      const seenSoFar = (seenPerSeason.get(key) || 0) + 1;
      seenPerSeason.set(key, seenSoFar);
      const isBossMap = seenSoFar === seasonCounts.get(key);

      const entry = (save.maps && save.maps[i]) ? save.maps[i] : { unlocked: i === 0, stars: 0 };
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
