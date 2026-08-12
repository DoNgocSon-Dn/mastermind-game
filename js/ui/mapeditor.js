// ============================================================
// MAPEDITOR.JS — Trình Tự Làm Map (Custom Map Editor).
// Mở khóa khi người chơi thắng toàn bộ 16 map HOẶC gõ mã "@@@".
// ============================================================
const MapEditorUI = (() => {
  const KEY_CUSTOM_MAP = 'td_custom_map_v1';
  let els = {};
  let currentTheme = 'spring';
  let currentTool = 'path1'; // 'path1' | 'path2' | 'tree' | 'rock' | 'house' | 'erase'
  let rawPaths = [[], []];
  let customDecor = [];
  let mapName = 'Bản Đồ Tự Tạo';
  let totalWaves = 10;
  let difficulty = 1.5;
  let bossType = 'bossSpring';
  let onPlayCustomMap = null;
  let isEditing = false;

  function init({ onPlayCustom }) {
    onPlayCustomMap = onPlayCustom;
    els.screen = document.getElementById('screen-mapeditor');
    els.canvas = document.getElementById('editorCanvas');
    if (!els.canvas) return;
    els.ctx = els.canvas.getContext('2d');

    // Canvas Mouse Click & Move Event Listeners
    els.canvas.addEventListener('click', _onCanvasClick);
    els.canvas.addEventListener('mousemove', _onCanvasMouseMove);

    _bindControls();
    loadSavedMap();
  }

  function _bindControls() {
    const selTheme = document.getElementById('ed-theme');
    if (selTheme) {
      selTheme.onchange = (e) => {
        currentTheme = e.target.value;
        _renderEditor();
      };
    }

    const selBoss = document.getElementById('ed-boss');
    if (selBoss) {
      selBoss.onchange = (e) => { bossType = e.target.value; };
    }

    const selWaves = document.getElementById('ed-waves');
    if (selWaves) {
      selWaves.onchange = (e) => { totalWaves = parseInt(e.target.value, 10) || 10; };
    }

    const selDiff = document.getElementById('ed-diff');
    if (selDiff) {
      selDiff.onchange = (e) => { difficulty = parseFloat(e.target.value) || 1.5; };
    }

    const txtName = document.getElementById('ed-name');
    if (txtName) {
      txtName.oninput = (e) => { mapName = e.target.value || 'Bản Đồ Tự Tạo'; };
    }

    // Tool Mode Buttons
    const tools = ['path1', 'path2', 'tree', 'rock', 'house', 'erase'];
    tools.forEach(t => {
      const btn = document.getElementById(`tool-${t}`);
      if (btn) {
        btn.onclick = () => {
          currentTool = t;
          tools.forEach(other => {
            const b = document.getElementById(`tool-${other}`);
            if (b) b.classList.toggle('active', other === t);
          });
        };
      }
    });

    // Action Buttons
    const btnUndoPath1 = document.getElementById('btn-undo-p1');
    if (btnUndoPath1) btnUndoPath1.onclick = () => { rawPaths[0].pop(); _renderEditor(); };

    const btnUndoPath2 = document.getElementById('btn-undo-p2');
    if (btnUndoPath2) btnUndoPath2.onclick = () => { rawPaths[1].pop(); _renderEditor(); };

    const btnClearAll = document.getElementById('btn-editor-clear');
    if (btnClearAll) {
      btnClearAll.onclick = () => {
        if (confirm('Bạn có chắc chắn muốn xóa sạch bản đồ đang làm?')) {
          rawPaths = [[], []];
          customDecor = [];
          _renderEditor();
        }
      };
    }

    const btnSave = document.getElementById('btn-editor-save');
    if (btnSave) btnSave.onclick = () => { saveMap(); alert('💾 Đã lưu Map Tự Tạo thành công!'); };

    const btnPlay = document.getElementById('btn-editor-play');
    if (btnPlay) {
      btnPlay.onclick = () => {
        if (rawPaths[0].length < 2) {
          alert('⚠️ Bạn phải vẽ ít nhất 2 điểm đường đi cho Đường 1!');
          return;
        }
        saveMap();
        const customDef = exportMapDefinition();
        if (onPlayCustomMap) onPlayCustomMap(customDef);
      };
    }

    const btnBack = document.getElementById('btn-editor-back');
    if (btnBack) {
      btnBack.onclick = () => {
        hide();
        if (MenuUI) MenuUI.showLevelSelect();
      };
    }
  }

  function _getGridPoint(e) {
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const rawX = (e.clientX - rect.left) * scaleX;
    const rawY = (e.clientY - rect.top) * scaleY;
    // Snap to 32px grid node
    const grid = 32;
    const x = Math.round(rawX / grid) * grid;
    const y = Math.round(rawY / grid) * grid;
    return { x, y, rawX, rawY };
  }

  function _onCanvasClick(e) {
    if (!isEditing) return;
    const pt = _getGridPoint(e);

    if (currentTool === 'path1') {
      rawPaths[0].push({ x: pt.x, y: pt.y });
    } else if (currentTool === 'path2') {
      rawPaths[1].push({ x: pt.x, y: pt.y });
    } else if (currentTool === 'tree') {
      const trees = ['tree1', 'tree2', 'tree3', 'tree4'];
      const pick = trees[Math.floor(Math.random() * trees.length)];
      const isTall = pick === 'tree1' || pick === 'tree2';
      customDecor.push({
        img: pick, sx: 0, sy: 0, sw: 192, sh: isTall ? 256 : 192,
        x: pt.rawX, y: pt.rawY, dw: 64, dh: isTall ? 85 : 64
      });
    } else if (currentTool === 'rock') {
      const rocks = ['rock1', 'rock2', 'rock3', 'rock4'];
      const pick = rocks[Math.floor(Math.random() * rocks.length)];
      customDecor.push({
        img: pick, sx: 0, sy: 0, sw: 64, sh: 64,
        x: pt.rawX, y: pt.rawY, dw: 32, dh: 32
      });
    } else if (currentTool === 'house') {
      const houses = ['house1', 'house2', 'house3'];
      const pick = houses[Math.floor(Math.random() * houses.length)];
      customDecor.push({
        img: pick, sx: 0, sy: 0, sw: 128, sh: 192,
        x: pt.rawX, y: pt.rawY, dw: 52, dh: 78
      });
    } else if (currentTool === 'erase') {
      // Erase nearest decor or path point
      customDecor = customDecor.filter(d => Math.hypot(d.x - pt.rawX, d.y - pt.rawY) > 28);
      rawPaths[0] = rawPaths[0].filter(p => Math.hypot(p.x - pt.x, p.y - pt.y) > 20);
      rawPaths[1] = rawPaths[1].filter(p => Math.hypot(p.x - pt.x, p.y - pt.y) > 20);
    }
    _renderEditor();
  }

  let hoverPt = null;
  function _onCanvasMouseMove(e) {
    if (!isEditing) return;
    hoverPt = _getGridPoint(e);
    _renderEditor();
  }

  function _renderEditor() {
    if (!els.ctx) return;
    const ctx = els.ctx;
    const W = els.canvas.width, H = els.canvas.height;

    // Clear background with season ground filter
    const themeColors = {
      spring: '#3f7a3a',
      summer: '#74c442',
      autumn: '#a86c2e',
      winter: '#b0d6eb',
      volcano: '#3a2e2b',
    };
    ctx.fillStyle = themeColors[currentTheme] || '#3f7a3a';
    ctx.fillRect(0, 0, W, H);

    // Draw Grid Lines (32px)
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Draw Paths (Path 1: Orange, Path 2: Cyan)
    const drawPathLine = (pts, strokeColor, label) => {
      if (!pts || !pts.length) return;
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 40;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      // Waypoint Nodes
      pts.forEach((p, idx) => {
        ctx.globalAlpha = 1;
        ctx.fillStyle = idx === 0 ? '#ff4d4d' : (idx === pts.length - 1 ? '#ffcc00' : strokeColor);
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();

        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        if (idx === 0) ctx.fillText(`💀 Spawn ${label}`, p.x, p.y - 12);
        else if (idx === pts.length - 1) ctx.fillText(`🏰 Thành`, p.x, p.y + 20);
        else ctx.fillText(`${idx}`, p.x, p.y - 11);
      });
      ctx.restore();
    };

    drawPathLine(rawPaths[0], '#ff9f36', '1');
    drawPathLine(rawPaths[1], '#38c5ff', '2');

    // Draw Custom Decor with exact sprite frame cropping
    customDecor.forEach(d => {
      const img = AssetLoader.getImage(d.img);
      if (img) {
        const sw = d.sw || 128, sh = d.sh || 128;
        const sx = d.sx || 0, sy = d.sy || 0;
        ctx.drawImage(img, sx, sy, sw, sh, d.x - d.dw / 2, d.y - d.dh, d.dw, d.dh);
      } else {
        ctx.fillStyle = '#66aa66';
        ctx.beginPath(); ctx.arc(d.x, d.y, 14, 0, Math.PI * 2); ctx.fill();
      }
    });

    // Hover Cursor Indicator
    if (hoverPt) {
      ctx.save();
      ctx.strokeStyle = currentTool === 'erase' ? '#ff3333' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(hoverPt.x - 16, hoverPt.y - 16, 32, 32);
      ctx.restore();
    }
  }

  function saveMap() {
    const data = {
      theme: currentTheme,
      rawPaths: rawPaths.map(p => p.map(pt => ({ x: pt.x, y: pt.y }))),
      customDecor,
      name: mapName,
      totalWaves,
      difficulty,
      bossType,
    };
    try {
      localStorage.setItem(KEY_CUSTOM_MAP, JSON.stringify(data));
    } catch (e) {
      console.warn('Không lưu được map tự tạo:', e);
    }
  }

  function loadSavedMap() {
    try {
      const raw = localStorage.getItem(KEY_CUSTOM_MAP);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.theme) currentTheme = data.theme;
      if (data.rawPaths) rawPaths = data.rawPaths;
      if (data.customDecor) {
        customDecor = data.customDecor.map(d => {
          if (d.img && d.img.startsWith('tree')) {
            const isTall = d.img === 'tree1' || d.img === 'tree2';
            return { ...d, sx: 0, sy: 0, sw: 192, sh: isTall ? 256 : 192, dw: 64, dh: isTall ? 85 : 64 };
          }
          return d;
        });
      }
      if (data.name) mapName = data.name;
      if (data.totalWaves) totalWaves = data.totalWaves;
      if (data.difficulty) difficulty = data.difficulty;
      if (data.bossType) bossType = data.bossType;

      // Update Form Inputs
      const selTheme = document.getElementById('ed-theme'); if (selTheme) selTheme.value = currentTheme;
      const selBoss = document.getElementById('ed-boss'); if (selBoss) selBoss.value = bossType;
      const selWaves = document.getElementById('ed-waves'); if (selWaves) selWaves.value = totalWaves;
      const selDiff = document.getElementById('ed-diff'); if (selDiff) selDiff.value = difficulty;
      const txtName = document.getElementById('ed-name'); if (txtName) txtName.value = mapName;
    } catch (e) {
      console.warn('Lỗi đọc map tự tạo:', e);
    }
  }

  function exportMapDefinition() {
    const p1 = rawPaths[0].length >= 2 ? rawPaths[0] : [{ x: -20, y: 300 }, { x: 980, y: 300 }];
    const validPaths = [p1];
    if (rawPaths[1].length >= 2) validPaths.push(rawPaths[1]);

    const decorList = customDecor.map(d => ({
      img: d.img, sx: 0, sy: 0, sw: 128, sh: 128,
      x: d.x, y: d.y, dw: d.dw, dh: d.dh,
    }));

    return defineMap({
      id: 99,
      name: mapName || 'Bản Đồ Tự Tạo',
      theme: currentTheme,
      season: currentTheme === 'volcano' ? 'summer' : currentTheme,
      difficulty: difficulty,
      rawPaths: validPaths,
      decorCount: 10,
      sheepCount: 1,
      obstacleCount: 4,
      totalWaves: totalWaves,
      bossType: bossType,
      extraDecor: decorList,
    });
  }

  function show() {
    isEditing = true;
    if (els.screen) els.screen.classList.remove('hidden');
    document.getElementById('screen-menu').classList.add('hidden');
    document.getElementById('screen-levelselect').classList.add('hidden');
    loadSavedMap();
    _renderEditor();
  }

  function hide() {
    isEditing = false;
    if (els.screen) els.screen.classList.add('hidden');
  }

  return { init, show, hide, saveMap, loadSavedMap, exportMapDefinition };
})();
