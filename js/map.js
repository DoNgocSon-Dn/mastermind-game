// ============================================================
// MAP.JS — 16 map / 4 mùa (Xuân/Hạ/Thu/Đông), mỗi mùa 4 map (3 map thường +
// 1 map boss). Từ map thứ 2 mỗi mùa trở đi có 2 đường đi song song (paths[]).
//
// Bố cục map dựng theo kiểu Kingdom Rush: đường đi CONG mềm (smoothPath — spline
// Catmull-Rom chạy qua đúng các điểm góc cũ, quái/lính di chuyển theo path dày
// điểm này nên tự động "lượn" theo, không cần sửa gì ở enemy.js/hero.js). Đặt
// tháp TỰ DO trên bất kỳ ô cỏ hợp lệ (không còn slot cố định — xem
// GameMap.isBuildable): chỉ cấm đè lên path/tháp khác/nhà, không cần tính lại
// đường đi vì path là polyline vẽ sẵn, không phải pathfinding động. Cây/bụi/đá
// rải dày để lấp gần hết khoảng trống còn lại.
// ============================================================

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Spline Catmull-Rom chạy qua đúng các waypoint gốc (kể cả 2 đầu mút, giữ nguyên
// vị trí lều spawn / lâu đài) — biến path góc vuông thành đường cong mềm. Kết quả
// là 1 danh sách điểm DÀY hơn nhiều path gốc; enemy/hero/soldier chỉ đơn giản đi
// qua từng điểm liên tiếp nên tự động "lượn" theo, không cần đổi logic di chuyển.
// Dùng tham số hoá CENTRIPETAL (alpha = 0.5) thay cho uniform: bản uniform khiến
// đường cong VỌT RA NGOÀI (overshoot) khá xa tại các góc gấp — đo được có chỗ vọt lên
// tới 24px so với waypoint gốc, đẩy đường đi lấn vào sát mép trên của map (chỗ HUD
// đứng) dù toạ độ thiết kế vốn nằm an toàn ở y=90. Centripetal Catmull-Rom bám sát
// waypoint, không tự cắt, nên đường đi nằm gọn trong hành lang đã thiết kế.
// Đường đi Pixel Art góc vuông (Grid-aligned Pixel Path): giữ các đoạn thẳng strictly
// vuông góc / thẳng hàng với lưới ô 64px của Tiny Swords, góc rẽ bo gọn nhẹ 10-14px
// để quái và hero di chuyển mượt mà chuẩn Pixel Art TD cổ điển.
function smoothPath(points, samplesPerSegment = 8) {
  const n = points.length;
  if (n < 2) return points.slice();
  const out = [{ x: points[0].x, y: points[0].y }];
  const CORNER_R = 12; // Bán kính bo góc vuông nhẹ (12px) cho di chuyển mượt

  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (i < n - 2) {
      const p3 = points[i + 2];
      const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
      const len1 = Math.hypot(d1x, d1y);
      const d2x = p3.x - p2.x, d2y = p3.y - p2.y;
      const len2 = Math.hypot(d2x, d2y);

      const r = Math.min(CORNER_R, len1 / 2, len2 / 2);
      if (r > 2 && len1 > 0 && len2 > 0) {
        const stopX = p2.x - (d1x / len1) * r;
        const stopY = p2.y - (d1y / len1) * r;
        const startNextX = p2.x + (d2x / len2) * r;
        const startNextY = p2.y + (d2y / len2) * r;

        const startPt = out[out.length - 1];
        for (let s = 1; s <= samplesPerSegment; s++) {
          const t = s / samplesPerSegment;
          out.push({ x: startPt.x + (stopX - startPt.x) * t, y: startPt.y + (stopY - startPt.y) * t });
        }

        for (let s = 1; s <= 4; s++) {
          const t = s / 4;
          const invT = 1 - t;
          const qx = invT * invT * stopX + 2 * invT * t * p2.x + t * t * startNextX;
          const qy = invT * invT * stopY + 2 * invT * t * p2.y + t * t * startNextY;
          out.push({ x: qx, y: qy });
        }
        continue;
      }
    }

    const startPt = out[out.length - 1];
    for (let s = 1; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      out.push({
        x: startPt.x + (p2.x - startPt.x) * t,
        y: startPt.y + (p2.y - startPt.y) * t,
      });
    }
  }
  return out;
}

// PRNG nhỏ gọn, xác định theo seed (mulberry32) — dùng để rải decor/ô đặt tháp
// ngẫu nhiên nhưng LUÔN ra cùng 1 kết quả mỗi lần chơi (không đổi bố cục cảnh
// giữa các lần vào lại map).
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// (Hệ thống sinh "ô đặt tháp" cố định theo cụm đã bị bỏ — giờ đặt tháp tự do,
// xem GameMap.isBuildable(). pathLength/pointAtArc/generateBuildSpots chỉ phục vụ
// cơ chế cũ nên đã gỡ bỏ luôn cho gọn.)

// ---------------- Hình dạng map đất (khung tràn 960x600) ----------------
// Khung toàn bộ màn hình cho mọi map (canvas 960x600), toàn bộ là mặt đất tràn màn hình.
const ISLAND_RECT = { x: 0, y: 0, w: 960, h: 600 };

function generateIslandMask(paths, seed, rect = ISLAND_RECT) {
  const cell = 64;
  const cols = Math.ceil(rect.w / cell), rows = Math.ceil(rect.h / cell);
  const land = new Array(cols * rows).fill(true);
  return { cell, cols, rows, land, ox: rect.x, oy: rect.y };
}

function maskIsLand(m, x, y) {
  return x >= 0 && x <= CONFIG.canvas.width && y >= 0 && y <= CONFIG.canvas.height;
}

// Các ô viền quanh 4 mép màn hình — dùng để đặt ranh giới rừng viền quanh map.
function maskCoastCells(m) {
  const list = [];
  const W = CONFIG.canvas.width, H = CONFIG.canvas.height;
  for (let x = 20; x <= W - 20; x += 32) {
    list.push({ x, y: 18, nx: 0, ny: 1 });
    list.push({ x, y: H - 18, nx: 0, ny: -1 });
  }
  for (let y = 32; y <= H - 32; y += 32) {
    list.push({ x: 18, y, nx: 1, ny: 0 });
    list.push({ x: W - 18, y, nx: -1, ny: 0 });
  }
  return list;
}

// Giá vàng để PHÁ 1 tài nguyên trang trí (cây/đá/bụi/nhà/điểm nhấn) — y hệt cơ chế
// vật cản: bấm vào phải TRẢ tiền mới dọn được, không có thưởng gì cả. Cừu + dân
// làng (kind:'sheep'/'villager') KHÔNG có giá này -> loại khỏi mọi tương tác phá
// (xem resourceAt/_drawDecorations bên dưới, lọc theo cost != null).
function _decorClearCost(img, dw) {
  if (img.startsWith('bush')) return Math.round(8 + dw * 0.35);
  if (img.startsWith('rock')) return Math.round(6 + dw * 0.3);
  if (img === 'treeSet' || img.startsWith('tree')) return Math.round(20 + dw * 0.55);
  if (img.startsWith('house')) return 110;
  if (img === 'goldMine') return 80;
  if (img === 'deco16' || img === 'deco18') return 55;
  if (img.startsWith('deco')) return 6;
  return 10;
}
// Chỉ tài nguyên NẰM GẦN ĐƯỜNG (trong bán kính này tính tới mọi path) mới bán
// được — cây/đá rải sâu trong rừng/góc map xa đường vẫn thuần trang trí như cũ,
// đỡ biến cả bãi cỏ thành 1 rừng nút bấm.
const NEAR_PATH_SELL_RADIUS = 130;
function _nearAnyPath(paths, x, y, radius = NEAR_PATH_SELL_RADIUS) {
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      if (distToSegment(x, y, path[i], path[i + 1]) <= radius) return true;
    }
  }
  return false;
}

// Rải bush/rock/tree theo CỤM 2-4 vật/lần (không xếp lưới đều) khắp map theo seed
// cố định, né toàn bộ path + né các ô đặt tháp (buildSpots). Mỗi cụm trộn lẫn loại
// + kích thước, thỉnh thoảng lật ngang (flip-x) từng vật để đỡ lặp y hệt.
function scatterDecorations(paths, seed, opts = {}) {
  const rng = mulberry32(seed);
  const count = opts.count != null ? opts.count : 35;
  const minPathDist = opts.minPathDist || 55;
  const minSpotDist = opts.minSpotDist || 52;
  const clusterGap = opts.clusterGap || 44; // khoảng cách tối thiểu giữa TÂM các cụm
  const buildSpots = opts.buildSpots || [];
  const pool = opts.pool || [
    { img: 'bush1', sw: 128, sh: 128, size: [34, 44] },
    { img: 'bush2', sw: 128, sh: 128, size: [32, 40] },
    { img: 'bush3', sw: 128, sh: 128, size: [34, 44] },
    { img: 'bush4', sw: 128, sh: 128, size: [30, 38] },
    { img: 'rock1', sw: 64, sh: 64, size: [24, 30] },
    { img: 'rock2', sw: 64, sh: 64, size: [24, 30] },
    { img: 'rock3', sw: 64, sh: 64, size: [22, 28] },
    { img: 'rock4', sw: 64, sh: 64, size: [24, 30] },
    { img: 'tree1', sw: 192, sh: 256, size: [50, 62], tall: true, animated: true },
    { img: 'tree2', sw: 192, sh: 256, size: [48, 60], tall: true, animated: true },
    { img: 'tree3', sw: 192, sh: 192, size: [40, 50], animated: true },
    { img: 'tree4', sw: 192, sh: 192, size: [38, 48], animated: true },
    // Tiny Swords Update 010 — "treeSet" là 1 lưới 4x3 ô 192x192 (6 cây tĩnh + 1 gốc
    // cây, đo thật bằng Node trước khi cắt); lấy 6 ô cây làm biến thể TĨNH (không
    // animation lắc) để map đỡ lặp lại mà không tốn thêm chi phí vẽ mỗi frame.
    { img: 'treeSet', sx: 0, sy: 0, sw: 192, sh: 192, size: [40, 50] },
    { img: 'treeSet', sx: 192, sy: 0, sw: 192, sh: 192, size: [40, 50] },
    { img: 'treeSet', sx: 384, sy: 0, sw: 192, sh: 192, size: [40, 50] },
    { img: 'treeSet', sx: 576, sy: 0, sw: 192, sh: 192, size: [40, 50] },
    { img: 'treeSet', sx: 0, sy: 192, sw: 192, sh: 192, size: [40, 50] },
    { img: 'treeSet', sx: 192, sy: 192, sw: 192, sh: 192, size: [40, 50] },
    // Deco 01-15 (Update 010, 64x64 tĩnh): cụm cỏ dại/nấm/đá nhỏ rải lẫn cho phong phú.
    { img: 'deco1', sw: 64, sh: 64, size: [16, 22] }, { img: 'deco2', sw: 64, sh: 64, size: [16, 22] },
    { img: 'deco3', sw: 64, sh: 64, size: [16, 22] }, { img: 'deco4', sw: 64, sh: 64, size: [16, 22] },
    { img: 'deco5', sw: 64, sh: 64, size: [16, 22] }, { img: 'deco6', sw: 64, sh: 64, size: [16, 22] },
    { img: 'deco7', sw: 64, sh: 64, size: [16, 22] }, { img: 'deco8', sw: 64, sh: 64, size: [16, 22] },
    { img: 'deco9', sw: 64, sh: 64, size: [16, 22] }, { img: 'deco10', sw: 64, sh: 64, size: [16, 22] },
    { img: 'deco11', sw: 64, sh: 64, size: [16, 22] }, { img: 'deco12', sw: 64, sh: 64, size: [16, 22] },
    { img: 'deco13', sw: 64, sh: 64, size: [16, 22] }, { img: 'deco14', sw: 64, sh: 64, size: [16, 22] },
    { img: 'deco15', sw: 64, sh: 64, size: [16, 22] },
    // Deco 17 (64x128 tĩnh, cọc gỗ cao): xen giữa cụm cây cho có lớp cao thấp.
    { img: 'deco17', sw: 64, sh: 128, size: [22, 30], tall: true },
  ];
  // `pad` (mặc định 0) cộng thêm vào minPathDist — dùng khi kiểm tra 1 SPRITE cụ thể
  // thay vì 1 điểm trần, xem chú thích ở vòng lặp cluster item bên dưới.
  function tooCloseToPath(x, y, pad = 0) {
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i += 3) {
        if (distToSegment(x, y, path[i], path[Math.min(i + 3, path.length - 1)]) < minPathDist + pad) return true;
      }
    }
    return false;
  }
  function tooCloseToSpot(x, y) {
    return buildSpots.some(s => Math.hypot(s.x - x, s.y - y) < minSpotDist);
  }
  // Đảo có bờ lởm chởm nên phải kiểm tra đất thật, tránh cây/đá mọc giữa mặt nước.
  const onLand = opts.isLand || (() => true);
  const placedCenters = [];
  const decos = [];
  let attempts = 0;
  while (decos.length < count && attempts < count * 25) {
    attempts++;
    const cx = 34 + rng() * (CONFIG.canvas.width - 68);
    const cy = 82 + rng() * (CONFIG.canvas.height - 104);
    if (tooCloseToPath(cx, cy) || tooCloseToSpot(cx, cy) || !onLand(cx, cy)) continue;
    if (placedCenters.some(p => Math.hypot(p.x - cx, p.y - cy) < clusterGap)) continue;

    const clusterSize = Math.min(2 + Math.floor(rng() * 3), count - decos.length); // 2..4 vật/cụm
    if (clusterSize < 2) continue;
    const clusterItems = [];
    for (let k = 0; k < clusterSize; k++) {
      const ang = rng() * Math.PI * 2;
      const dist = k === 0 ? 0 : 14 + rng() * 24;
      const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist * 0.7; // nén trục y cho tự nhiên
      // Chọn sprite TRƯỚC khi kiểm tra khoảng cách đường (trước đây kiểm tra bằng 1
      // điểm tròn quanh (x,y) rồi MỚI chọn size) — vì (x,y) là ĐÁY sprite (neo, xem
      // _drawDecorationItemInto: translate rồi drawImage(-dw/2,-dh,...)), còn tán cây
      // cao (tree1/tree2, dh tới ~80px) vươn hẳn lên phía TRÊN đáy. 1 bán kính tròn
      // minPathDist=40 quanh đáy không hề che được phần tán phía trên nếu đường đi
      // chạy sát ngay trên gốc cây -> tán đè lên đường dù đáy đã "đủ xa" (bug đã báo:
      // cây che đường ở map núi lửa). Test tại TÂM sprite (x, y - dh/2) thay vì đáy,
      // cộng thêm dh/2 vào bán kính an toàn -> bao trọn cả đáy lẫn đỉnh tán.
      const pick = pool[Math.floor(rng() * pool.length)];
      const size = pick.size[0] + rng() * (pick.size[1] - pick.size[0]);
      const dh = pick.tall ? size * (pick.sh / pick.sw) : size;
      if (tooCloseToPath(x, y - dh / 2, dh / 2) || tooCloseToSpot(x, y) || !onLand(x, y)) continue;
      if (clusterItems.some(it => Math.hypot(it.x - x, it.y - y) < 16)) continue;
      const clearable = _nearAnyPath(paths, x, y);
      clusterItems.push({
        img: pick.img, sx: pick.sx || 0, sy: pick.sy || 0, sw: pick.sw, sh: pick.sh,
        x, y, dw: size, dh,
        animated: !!pick.animated, frames: 8, fps: 3, phase: Math.floor(rng() * 8),
        ...(clearable ? { cost: _decorClearCost(pick.img, size), cleared: false } : {}),
        flip: rng() < 0.4,
      });
    }
    if (clusterItems.length >= 2) { decos.push(...clusterItems); placedCenters.push({ x: cx, y: cy }); }
  }
  // Cừu rải theo BẦY 2-4 con/cụm (giống Kingdom Rush), không rời rạc từng con.
  // Mỗi con tự chuyển trạng thái Đứng yên -> Gặm cỏ -> Đi vài bước theo thời gian
  // (xem `kind:'sheep'` trong _drawDecorations) — tính hoàn toàn từ performance.now()
  // + phase riêng từng con, không cần vòng update() riêng cho decor.
  const sheepCount = opts.sheepCount != null ? opts.sheepCount : 2;
  const flockCount = Math.max(sheepCount > 0 ? 1 : 0, Math.round(sheepCount / 3));
  for (let f = 0; f < flockCount; f++) {
    let hx, hy, ok = false, tries = 0;
    while (tries < 20 && !ok) {
      tries++;
      hx = 60 + rng() * (CONFIG.canvas.width - 120);
      hy = 100 + rng() * (CONFIG.canvas.height - 140);
      ok = !tooCloseToPath(hx, hy) && !tooCloseToSpot(hx, hy) && onLand(hx, hy);
    }
    if (!ok) continue;
    const n = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      // Khoảng cách tối thiểu PHẢI lớn hơn cỡ sprite cừu (dw/dh ~26-32px) — trước đây
      // min=10px quá gần, 2 con dễ chồng lấn nhìn như 1 con thú méo mó nhiều chân
      // (bị nhầm là quái/con vật lạ, xem báo cáo lỗi "lợn rừng").
      const ang = rng() * Math.PI * 2, dist = k === 0 ? 0 : 26 + rng() * 22;
      const sx = hx + Math.cos(ang) * dist, sy = hy + Math.sin(ang) * dist * 0.6;
      if (tooCloseToPath(sx, sy) || tooCloseToSpot(sx, sy) || !onLand(sx, sy)) continue;
      const dirAng = rng() * Math.PI * 2;
      decos.push({
        kind: 'sheep', x: sx, y: sy, dw: 26 + rng() * 6, dh: 26 + rng() * 6,
        phase: rng() * 9, dirX: Math.cos(dirAng), dirY: Math.sin(dirAng) * 0.55,
        flip: rng() < 0.5,
      });
    }
  }
  return decos;
}

// Viền RỪNG DÀY quanh mép map (kiểu "tường cây" Kingdom Rush) — 2 vòng cây so le,
// cây to + chồng lấn nhau, chừa khoảng hở đúng nơi path đi vào/ra khỏi khung hình
// (điểm đầu/cuối mỗi path) để không che mất lối spawn.
function generateForestBorder(paths, seed, mask) {
  const rng = mulberry32(seed);
  const entries = [];
  for (const path of paths) { entries.push(path[0]); entries.push(path[path.length - 1]); }
  function nearEntry(x, y) { return entries.some(e => Math.hypot(e.x - x, e.y - y) < 100); }
  const pool = [
    { img: 'tree1', sw: 192, sh: 256, tall: true },
    { img: 'tree2', sw: 192, sh: 256, tall: true },
    { img: 'tree3', sw: 192, sh: 192 },
    { img: 'tree4', sw: 192, sh: 192 },
    // Tiny Swords Update 010 "treeSet" (6 cây tĩnh, lưới 4x3 ô 192x192) — viền rừng
    // là chỗ dùng NHIỀU cây nhất (~150-200 cây/map) nên thêm biến thể ở đây có lợi
    // nhất cho việc đỡ lặp lại; border:true nên sx/sy cố định, không cần animated.
    { img: 'treeSet', sx: 0, sy: 0, sw: 192, sh: 192 },
    { img: 'treeSet', sx: 192, sy: 0, sw: 192, sh: 192 },
    { img: 'treeSet', sx: 384, sy: 0, sw: 192, sh: 192 },
    { img: 'treeSet', sx: 576, sy: 0, sw: 192, sh: 192 },
    { img: 'treeSet', sx: 0, sy: 192, sw: 192, sh: 192 },
    { img: 'treeSet', sx: 192, sy: 192, sw: 192, sh: 192 },
  ];
  // Cây bám theo ĐƯỜNG BỜ BIỂN thật (các ô đất giáp nước) và lùi vào trong đất, thay vì
  // xếp quanh 1 khung chữ nhật như trước — nhờ vậy hàng cây uốn theo các khúc lồi lõm
  // của đảo, không còn "tường cây" thẳng băng chạy ngang màn hình.
  const coast = maskCoastCells(mask);
  const list = [];
  const place = (cx, cy, sizeRange) => {
    if (nearEntry(cx, cy)) return;
    if (!maskIsLand(mask, cx, cy)) return; // không mọc cây dưới nước
    const pick = pool[Math.floor(rng() * pool.length)];
    const size = sizeRange[0] + rng() * (sizeRange[1] - sizeRange[0]);
    const dh = pick.tall ? size * (pick.sh / pick.sw) : size;
    list.push({
      img: pick.img, sx: pick.sx || 0, sy: pick.sy || 0, sw: pick.sw, sh: pick.sh,
      x: cx, y: cy, dw: size, dh,
      // border:true — cây viền rừng vẫn vẽ mỗi frame (như mọi decor khác giờ) nhưng
      // GIỮ KHUNG HÌNH TĨNH (không lắc animation) vì số lượng quá lớn (~150-200/map).
      // KHÔNG gắn cost — cây viền rừng luôn THUẦN CẢNH, không bấm/bán được, dù
      // có ở gần path hay không (khác các cụm cây rải giữa map, vốn vẫn bán được).
      animated: true, border: true, frames: 8, fps: 3, phase: Math.floor(rng() * 8),
      flip: rng() < 0.5,
    });
  };
  for (const c of coast) {
    // Vòng 1: Ngay sát ranh giới mép đảo (~6px)
    place(c.x - c.nx * 6 + (rng() - 0.5) * 20, c.y - c.ny * 6 + (rng() - 0.5) * 20, [56, 78]);
    // Vòng 2: Lùi vào lòng đất (~32px) so le dày dặn
    if (rng() < 0.85) {
      place(c.x - c.nx * 32 + (rng() - 0.5) * 24, c.y - c.ny * 32 + (rng() - 0.5) * 24, [48, 66]);
    }
    // Vòng 3: Rừng đại ngàn lùi sâu (~58px) tạo vòm rừng xanh rậm rạp hoang sơ
    if (rng() < 0.65) {
      place(c.x - c.nx * 58 + (rng() - 0.5) * 28, c.y - c.ny * 58 + (rng() - 0.5) * 28, [42, 58]);
    }
  }
  return list;
}

// Xóm nhỏ trang trí (KHÔNG ảnh hưởng gameplay): 1 cụm 1-3 nhà (House1-3, giảm bão
// hoà màu cho cũ kỹ) + vài viên đá vỡ quanh chân nhà + 1 dân làng đi tuần quanh đó
// (dùng Pawn "Wood" làm dân thường, không phải lính). Pack Tiny Swords không có nhà
// đổ nát/cối xay gió/hàng rào/giếng nước sẵn nên chỉ dùng House + Rocks có sẵn.
function generateVillage(paths, buildSpots, seed, opts = {}) {
  const rng = mulberry32(seed);
  const minPathDist = opts.minPathDist || 46;
  const minSpotDist = opts.minSpotDist || 60;
  const onLand = opts.isLand || (() => true);
  function tooClose(x, y) {
    if (!onLand(x, y)) return true;
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i += 3) {
        if (distToSegment(x, y, path[i], path[Math.min(i + 3, path.length - 1)]) < minPathDist) return true;
      }
    }
    return buildSpots.some(s => Math.hypot(s.x - x, s.y - y) < minSpotDist);
  }
  let hx, hy, ok = false, tries = 0;
  while (tries < 30 && !ok) {
    tries++;
    hx = 70 + rng() * (CONFIG.canvas.width - 140);
    hy = 100 + rng() * (CONFIG.canvas.height - 150);
    ok = !tooClose(hx, hy);
  }
  if (!ok) return [];
  const decos = [];
  const houseCount = 1 + Math.floor(rng() * 2); // 1-2 nhà/xóm
  const houseImgs = ['house1', 'house2', 'house3'];
  for (let i = 0; i < houseCount; i++) {
    const hxx = hx + (i - (houseCount - 1) / 2) * 58, hyy = hy + (rng() - 0.5) * 14;
    const houseImg = houseImgs[Math.floor(rng() * houseImgs.length)];
    const houseClearable = _nearAnyPath(paths, hxx, hyy);
    decos.push({
      kind: 'house', img: houseImg,
      sx: 0, sy: 0, sw: 128, sh: 192, x: hxx, y: hyy, dw: 48, dh: 72,
      ...(houseClearable ? { cost: _decorClearCost(houseImg, 48), cleared: false } : {}),
      flip: rng() < 0.5,
    });
    const rubble = 2 + Math.floor(rng() * 3);
    for (let r = 0; r < rubble; r++) {
      const ang = rng() * Math.PI * 2, dist = 16 + rng() * 20;
      const rockImg = `rock${1 + Math.floor(rng() * 4)}`;
      const rdw = 14 + rng() * 8;
      const rx = hxx + Math.cos(ang) * dist, ry = hyy + 30 + Math.sin(ang) * dist * 0.5;
      decos.push({
        img: rockImg, sx: 0, sy: 0, sw: 64, sh: 64,
        x: rx, y: ry,
        dw: rdw, dh: 14 + rng() * 8,
        ...(_nearAnyPath(paths, rx, ry) ? { cost: _decorClearCost(rockImg, rdw), cleared: false } : {}),
        flip: rng() < 0.5,
      });
    }
  }
  const dirAng = rng() * Math.PI * 2;
  decos.push({
    kind: 'villager', x0: hx, y0: hy + 44, dw: 26, dh: 34,
    dirX: Math.cos(dirAng), dirY: Math.sin(dirAng) * 0.5,
    amplitude: 30 + rng() * 20, period: 5000 + rng() * 2000, phase: rng() * 6.28,
  });
  return decos;
}

// Điểm nhấn đặc biệt riêng mỗi map (KHÔNG ảnh hưởng gameplay): chọn seed-based 1
// trong 3 prop nổi bật của Tiny Swords Update 010 (mỏ vàng / cọc cảnh báo đầu lâu /
// bù nhìn) — mỗi map luôn ra đúng 1 loại cố định (không đổi giữa các lần chơi) nhưng
// khác nhau giữa các map, để 16 map đỡ trông giống hệt nhau dù dùng chung bộ decor nền.
function generateLandmark(paths, seed, opts = {}) {
  const rng = mulberry32(seed);
  const minPathDist = opts.minPathDist || 50;
  const onLand = opts.isLand || (() => true);
  function tooClose(x, y) {
    if (!onLand(x, y)) return true;
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i += 3) {
        if (distToSegment(x, y, path[i], path[Math.min(i + 3, path.length - 1)]) < minPathDist) return true;
      }
    }
    return false;
  }
  const picks = [
    { img: 'goldMine', sw: 192, sh: 128, dw: 58, dh: 58 * (128 / 192) },
    { img: 'deco16', sw: 64, sh: 128, dw: 26, dh: 52 },
    { img: 'deco18', sw: 192, sh: 192, dw: 42, dh: 42 },
  ];
  const chosen = picks[Math.floor(rng() * picks.length)];
  let x, y, ok = false, tries = 0;
  while (tries < 25 && !ok) {
    tries++;
    x = 70 + rng() * (CONFIG.canvas.width - 140);
    y = 100 + rng() * (CONFIG.canvas.height - 150);
    ok = !tooClose(x, y);
  }
  if (!ok) return [];
  return [{
    img: chosen.img, sx: 0, sy: 0, sw: chosen.sw, sh: chosen.sh, x, y, dw: chosen.dw, dh: chosen.dh,
    ...(_nearAnyPath(paths, x, y) ? { cost: _decorClearCost(chosen.img, chosen.dw), cleared: false } : {}),
    flip: rng() < 0.5,
  }];
}

// Vật cản CÓ THỂ DỌN (tảng đá lớn / bụi rậm) — chặn xây tháp cho tới khi trả vàng
// phá bỏ, cơ chế kinh điển của thể loại thủ thành. Khác hẳn decor cảnh thuần trang
// trí (bush/rock rải bởi scatterDecorations): obstacle có thể BIẾN MẤT giữa trận nên
// KHÔNG bake vào static layer — GameMap.obstacleEntities() cấp {y, draw} riêng mỗi
// frame cho main.js gộp vào lượt y-sort, chỉ vẽ con nào còn `cleared:false`.
// Phổ biến: đá lớn/nhỏ + bụi rậm, rẻ. Hiếm: nhà hoang (house1-3, dùng lại đúng
// sprite của generateVillage nhưng đây là instance RIÊNG, không liên quan gì tới
// làng trang trí) — to hơn, đắt hơn hẳn, rơi vào lúc dọn thấy "đã tay" hơn.
const OBSTACLE_COMMON = [
  { kind: 'rock', img: 'rock1', sw: 64, sh: 64, dw: 46, costRange: [35, 60] },  // đá lớn
  { kind: 'rock', img: 'rock3', sw: 64, sh: 64, dw: 42, costRange: [35, 60] },  // đá lớn
  { kind: 'rock', img: 'rock2', sw: 64, sh: 64, dw: 26, costRange: [15, 25] },  // đá nhỏ
  { kind: 'rock', img: 'rock4', sw: 64, sh: 64, dw: 24, costRange: [15, 25] },  // đá nhỏ
  { kind: 'bush', img: 'bush2', sw: 128, sh: 128, dw: 40, costRange: [25, 45] },
  { kind: 'bush', img: 'bush4', sw: 128, sh: 128, dw: 38, costRange: [25, 45] },
];
const OBSTACLE_RARE = [
  { kind: 'house', img: 'house1', sw: 128, sh: 192, dw: 44, costRange: [95, 150] },
  { kind: 'house', img: 'house2', sw: 128, sh: 192, dw: 44, costRange: [95, 150] },
  { kind: 'house', img: 'house3', sw: 128, sh: 192, dw: 44, costRange: [95, 150] },
];
function _pickObstacleType(rng) {
  const pool = rng() < 0.18 ? OBSTACLE_RARE : OBSTACLE_COMMON;
  return pool[Math.floor(rng() * pool.length)];
}
function generateObstacles(paths, seed, opts = {}) {
  const rng = mulberry32(seed);
  const count = opts.count != null ? opts.count : 5;
  // Cho phép đặt SÁT đường hơn (trước 50 khiến vật cản luôn nằm khá xa lối đi) —
  // 30 vẫn đủ để không đè lên chính path (pathWidth/2 = 23), nhưng giờ có cả vật cản
  // ngay ven đường, đúng kiểu "chặn spot tháp đẹp cạnh khúc cua" của thể loại này.
  const minPathDist = opts.minPathDist || 32;
  const maxPathDist = opts.maxPathDist || 75;
  const onLand = opts.isLand || (() => true);
  const avoidPoints = opts.avoidPoints || []; // né khu spawn quái + thành: [{x,y,r}]
  
  function isValidObstacleSpot(x, y) {
    if (!onLand(x, y)) return false;
    if (avoidPoints.some(p => Math.hypot(p.x - x, p.y - y) < p.r)) return false;
    let minDist = Infinity;
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const d = distToSegment(x, y, path[i], path[i + 1]);
        if (d < minDist) minDist = d;
      }
    }
    // CHỈ đặt chướng ngại vật sát ven đường quái đi (khoảng cách 32px đến 75px)
    return minDist >= minPathDist && minDist <= maxPathDist;
  }

  const obstacles = [];
  const placed = [];
  let tries = 0;
  while (obstacles.length < count && tries < count * 80) {
    tries++;
    const x = 60 + rng() * (CONFIG.canvas.width - 120);
    const y = 80 + rng() * (CONFIG.canvas.height - 130);
    if (!isValidObstacleSpot(x, y)) continue;
    if (placed.some(p => Math.hypot(p.x - x, p.y - y) < 80)) continue;
    const pick = _pickObstacleType(rng);
    const cost = pick.costRange[0] + Math.floor(rng() * (pick.costRange[1] - pick.costRange[0]));
    obstacles.push({
      id: obstacles.length, x, y, kind: pick.kind, img: pick.img,
      sw: pick.sw, sh: pick.sh, dw: pick.dw, dh: pick.dw * (pick.sh / pick.sw),
      cost, cleared: false, radius: pick.dw * 0.5,
    });
    placed.push({ x, y });
  }
  return obstacles;
}

// ---------------- Chủ đề NÚI LỬA (chỉ map "Miệng Núi Lửa" dùng) ----------------
// Bộ trang trí riêng: KHÔNG có cây thông xanh rải rác giữa bãi trống (đó chính là thứ
// gây rối mắt cần bỏ), thay bằng đá tảng — sau khi qua bộ lọc màu tối của theme sẽ đọc
// thành đá obsidian/đá cháy — cùng vài prop nhỏ. Viền rừng quanh mép map và đá viền
// đường đi KHÔNG dùng pool này nên vẫn giữ nguyên.
const VOLCANO_DECOR_POOL = [
  { img: 'rock1', sw: 64, sh: 64, size: [26, 36] },
  { img: 'rock2', sw: 64, sh: 64, size: [26, 36] },
  { img: 'rock3', sw: 64, sh: 64, size: [22, 30] },
  { img: 'rock4', sw: 64, sh: 64, size: [26, 34] },
  { img: 'waterRock1', sw: 64, sh: 64, size: [24, 32] },
  { img: 'waterRock3', sw: 64, sh: 64, size: [22, 30] },
  { img: 'deco3', sw: 64, sh: 64, size: [14, 20] },
  { img: 'deco8', sw: 64, sh: 64, size: [14, 20] },
  { img: 'deco11', sw: 64, sh: 64, size: [14, 20] },
];

// Khe nứt dung nham: mỗi khe = 1 đường gãy khúc + 1-2 nhánh con, sinh theo seed cố
// định. Chỉ mọc ở khoảng trống cách xa tim đường (minPathDist) để tuyệt đối không lấn
// hay làm rối đường đi của quái.
function generateLavaCracks(paths, seed, opts = {}) {
  const rng = mulberry32(seed);
  const count = opts.count || 8;
  const minPathDist = opts.minPathDist || 54;
  function tooCloseToPath(x, y) {
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i += 3) {
        if (distToSegment(x, y, path[i], path[Math.min(i + 3, path.length - 1)]) < minPathDist) return true;
      }
    }
    return false;
  }
  function walk(sx, sy, ang0, segs, lenMin, lenVar) {
    const pts = [{ x: sx, y: sy }];
    let cx = sx, cy = sy, ang = ang0;
    for (let s = 0; s < segs; s++) {
      ang += (rng() - 0.5) * 1.1;
      const len = lenMin + rng() * lenVar;
      cx += Math.cos(ang) * len;
      cy += Math.sin(ang) * len * 0.75; // nén trục y cho hợp góc nhìn nghiêng
      if (tooCloseToPath(cx, cy) || cx < 50 || cx > CONFIG.canvas.width - 50 || cy < 80 || cy > CONFIG.canvas.height - 40) break;
      pts.push({ x: cx, y: cy });
    }
    return pts;
  }
  const cracks = [];
  let tries = 0;
  while (cracks.length < count && tries < count * 30) {
    tries++;
    const x = 70 + rng() * (CONFIG.canvas.width - 140);
    const y = 100 + rng() * (CONFIG.canvas.height - 190);
    if (tooCloseToPath(x, y)) continue;
    const main = walk(x, y, rng() * Math.PI * 2, 4 + Math.floor(rng() * 4), 12, 20);
    if (main.length < 3) continue;
    const branches = [];
    const bn = 1 + Math.floor(rng() * 2);
    for (let b = 0; b < bn; b++) {
      const from = main[1 + Math.floor(rng() * (main.length - 2))];
      const br = walk(from.x, from.y, rng() * Math.PI * 2, 2 + Math.floor(rng() * 2), 8, 14);
      if (br.length >= 2) branches.push(br);
    }
    cracks.push({ main, branches, width: 2.4 + rng() * 1.8 });
  }
  return cracks;
}

// Màu nền fallback khi asset chưa tải xong (hiếm khi hiện, chỉ để tránh canvas trống).
const THEME_BASE = {
  forest: '#3f7a3a', desert: '#dcb877', castle: '#5a5a72',
  spring: '#5a9a5a', summer: '#5a9a48', autumn: '#8a7a3f', winter: '#c8dce8',
  // Núi lửa: tông tro NÂU TRUNG chứ không phải gần đen — màu này còn được dùng làm
  // gốc cho "vệt lấn mép đường"; nếu để quá tối thì các vệt đó thành đốm đen như vết
  // dầu loang trên mặt đường sáng màu.
  volcano: '#6b5646',
};
const THEME_PATH_COLORS = {
  forest: { path: '#b08c5a', pathEdge: '#6e5230' },
  desert: { path: '#c9975c', pathEdge: '#8a6438' },
  castle: { path: '#9c8f7a', pathEdge: '#4a4458' },
  spring: { path: '#c2a688', pathEdge: '#7a5c40' },
  summer: { path: '#c99a5e', pathEdge: '#8a6432' },
  autumn: { path: '#a97b4c', pathEdge: '#6a4326' },
  // Đông: đường mòn be/xám lạnh (đất/tuyết bị giẫm nát) thay vì xanh băng — tránh
  // nhìn giống 1 con sông chảy qua map như trước.
  winter: { path: '#b9b3a4', pathEdge: '#726b5c' },
  // Núi lửa: nền đất quanh đường rất TỐI (tro/đá cháy) nên đường đi cố tình để sáng
  // (tro lưu huỳnh bị giẫm mòn) — tương phản mạnh, không bị chìm màu vào nền.
  volcano: { path: '#c2a077', pathEdge: '#4e3122' },
};
function darkenHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt));
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amt));
  const b = Math.max(0, (n & 255) * (1 - amt));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
// Lọc màu nhẹ phủ lên toàn bộ decor (cây/bụi/đá) cho khớp tông mùa — cùng kỹ thuật
// ctx.filter (saturate/hue-rotate/brightness) đã dùng để nhuộm quái vật trong enemy.js.
const THEME_DECOR_FILTERS = {
  spring: 'saturate(1.05) hue-rotate(-8deg) brightness(1.05)',
  summer: 'saturate(1.15) brightness(1.08)',
  autumn: 'saturate(0.9) hue-rotate(-25deg) brightness(0.95) sepia(0.25)',
  winter: 'saturate(0.5) hue-rotate(150deg) brightness(1.2) contrast(0.95)',
  // Núi lửa: cây/đá đều ám tro, cháy sạm — đá xám thành đá đen ánh nâu (obsidian),
  // viền rừng quanh mép map thành rừng cháy khô nhưng vẫn làm ranh giới bản đồ.
  volcano: 'sepia(0.55) saturate(0.8) brightness(0.5) contrast(1.08)',
};
// Bộ lọc "cũ kỹ" riêng cho nhà (xóm trang trí + nhà hoang vật cản) — KHÔNG cộng
// thêm filter mùa, dùng chung hằng số này để _getFilteredImage() cache đúng 1 bản
// duy nhất thay vì rải chuỗi filter y hệt ở 2 nơi (map.js:_drawDecorationItemInto
// và _drawObstacleItem).
const HOUSE_DECOR_FILTER = 'saturate(0.55) brightness(0.92) sepia(0.12)';

// Bộ lọc riêng cho MẶT ĐẤT (tách khỏi bộ lọc trang trí): với núi lửa cần nền tối hơn
// hẳn so với cây/đá thì mới ra chất đất cháy, còn các theme khác dùng chung 1 bộ như cũ.
const THEME_GROUND_FILTERS = {
  // sepia gần tối đa để KHỬ HẲN sắc xanh lá của tile cỏ gốc — để 0.72 thì nền vẫn ám
  // xanh ô-liu, nhìn ra "cỏ bị nhuộm tối" chứ chưa ra "đất cháy".
  volcano: 'sepia(0.95) saturate(0.72) brightness(0.42) hue-rotate(-10deg) contrast(1.16)',
};

// Toạ độ ô (cột,hàng) trong tsTerrain (copy của Tilemap_color1.png, lưới 64px) —
// chỉ dùng khối cỏ thuần 9-slice (cols 0-2). KHÔNG dùng khối vách đá (cols 5-8) làm
// "đảo nổi" rải giữa map nữa — vách đá dạng autotile của pack có chiều cao cố định
// 5 hàng (~320px), quá dày để làm viền mỏng an toàn quanh mỗi cụm ô đặt tháp mà
// không lấn vào path/khu chơi (đây chính là lỗi "vách đá đè lên đường đi" đã báo).
// Toàn bộ khu chơi giờ chỉ là 1 đảo cỏ liền (island rect) nổi trên nước — ranh giới
// duy nhất giữa cỏ/nước nằm ở MÉP NGOÀI map, không có vách đá lẻ tẻ ở giữa.
const GRASS_TILE = {
  tl: [0, 0], t: [1, 0], tr: [2, 0],
  l: [0, 1], c: [1, 1], r: [2, 1],
  bl: [0, 2], b: [1, 2], br: [2, 2],
};

class GameMap {
  constructor(def) {
    Object.assign(this, def);
    this.pathWidth = 46;
  }

  // paths[0] — giữ tương thích cho code cũ chỉ biết tới 1 đường (Hero spawn, v.v.)
  get waypoints() { return this.paths[0]; }

  // Bụi rậm che tầm bắn tháp tầm xa (Cung Thủ/Pháp Sư — xem tower.js:_bushBlocked).
  // Bụi trong `decorations` giờ CÓ THỂ BỊ PHÁ (cleared:true) giữa trận nên phải lọc
  // sống mỗi lần gọi, không còn cache tĩnh như trước — y hệt cách bụi trong hệ vật
  // cản đã lọc `cleared` từ đầu.
  bushesBlocking() {
    const list = this.decorations
      .filter(d => d.img && d.img.startsWith('bush') && !d.cleared)
      .map(d => ({ x: d.x, y: d.y, r: (d.dw || 34) * 0.42 }));
    for (const ob of this.obstacles || []) {
      if (ob.kind === 'bush' && !ob.cleared) list.push({ x: ob.x, y: ob.y, r: ob.dw * 0.42 });
    }
    return list;
  }

  // Đặt tháp TỰ DO trên bất kỳ ô cỏ hợp lệ nào (không còn slot cố định): không nằm
  // trên path, không chồng lên tháp khác, không đè lên nhà trong xóm trang trí,
  // và trong ranh giới đảo cỏ chính. Path ở đây là polyline VẼ SẴN (không phải
  // pathfinding động) nên chỉ cần cấm xây đè lên dải path, không cần tính lại
  // đường đi cho quái.
  isBuildable(x, y, towers, excludeTower = null) {
    const MIN_TOWER_GAP = 68; // Khoảng cách tối thiểu 68px giữa tâm 2 tháp (ngăn tháp bị đè/chồng lên nhau)
    const PATH_MARGIN = 24;   // Đệm thêm ngoài mép đường đi
    const island = this._mainIslandRect;
    if (x < island.x + 20 || x > island.x + island.w - 20 || y < island.y + 28 || y > island.y + island.h - 12) return false;
    if (!this.isLandAt(x, y)) return false;
    for (const path of this.paths) {
      for (let i = 0; i < path.length - 1; i += 2) {
        if (distToSegment(x, y, path[i], path[Math.min(i + 2, path.length - 1)]) < this.pathWidth / 2 + PATH_MARGIN) return false;
      }
    }
    for (const t of towers) {
      if (t === excludeTower) continue;
      if (Math.hypot(t.x - x, t.y - y) < MIN_TOWER_GAP) return false;
    }
    for (const d of this.decorations) {
      if (d.kind === 'house' && Math.hypot(d.x - x, d.y - y) < 48) return false;
    }
    for (const ob of this.obstacles || []) {
      if (!ob.cleared && Math.hypot(ob.x - x, ob.y - y) < ob.radius + 32) return false;
    }
    return true;
  }

  // Điểm gần nhất trên TOÀN BỘ đường đi (mọi path) tính từ (x,y) — dùng để cho
  // lính Barracks tự đi ra đúng giữa đường chặn quái thay vì đứng cạnh tháp.
  nearestPointOnPath(x, y) {
    let best = null, bestDist = Infinity;
    for (const path of this.paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq === 0 ? 0 : ((x - a.x) * dx + (y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + t * dx, py = a.y + t * dy;
        const d = Math.hypot(x - px, y - py);
        if (d < bestDist) { bestDist = d; best = { x: px, y: py }; }
      }
    }
    return best || { x, y };
  }

  waveScaleFor(waveIndex) {
    return this.difficulty * (1 + waveIndex * 0.11);
  }

  // ---------------- Đảo cỏ / vách đá / nước (autotile Tiny Swords) ----------------
  // Toạ độ đảo chính CỐ ĐỊNH cho mọi map (canvas luôn 960x600) — chừa viền nước
  // mỏng quanh khu chơi hiện có (path/buildSpots vốn đã tự né mép 34-84px) nên
  // không cần đổi bất kỳ toạ độ gameplay nào, chỉ đổi phần vẽ nền.
  get _mainIslandRect() { return { x: 0, y: 0, w: 960, h: 600 }; }

  // ---- Mặt nạ hình dạng đảo (lưới ô 64px) ----
  get _islandMask() {
    if (!this.__mask) this.__mask = this.islandMask || generateIslandMask(this.paths, 4300 + (this.id || 0));
    return this.__mask;
  }

  isLandAt(x, y) { return maskIsLand(this._islandMask, x, y); }

  // Vẽ mặt đất tràn toàn bộ màn hình 960x600
  _drawGrassRectInto(ctx) {
    const sheet = AssetLoader.getImage('tsTerrain');
    const m = this._islandMask;
    const cell = m.cell;
    ctx.save();
    ctx.filter = THEME_GROUND_FILTERS[this.theme] || THEME_DECOR_FILTERS[this.theme] || 'none';
    if (!sheet) {
      ctx.fillStyle = THEME_BASE[this.theme] || '#3f7a3a';
      ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    } else {
      const t = GRASS_TILE.c;
      for (let rw = 0; rw < m.rows; rw++) {
        for (let c = 0; c < m.cols; c++) {
          ctx.drawImage(sheet, t[0] * cell, t[1] * cell, cell, cell, m.ox + c * cell, m.oy + rw * cell, cell, cell);
        }
      }
    }
    ctx.restore();
  }

  // Danh sách ô ĐẤT nằm sát nước (dùng để rải bọt sóng + đá ven bờ theo đúng đường bờ
  // biển mới, thay vì rải đều theo chu vi hình chữ nhật như trước).
  _coastCells() {
    if (!this.__coast) this.__coast = maskCoastCells(this._islandMask);
    return this.__coast;
  }

  // Texture đất/sỏi cho mặt đường (Tiny Swords không có tile đường đất riêng) —
  // tự vẽ 1 tile noise nhỏ (đốm sáng/tối + vài viên sỏi) rồi lặp lại bằng pattern,
  // thay cho fill màu phẳng 1 khối nhìn "vector" như trước.
  _getPathPattern(ctx) {
    if (this._pathPattern) return this._pathPattern;
    const pal = THEME_PATH_COLORS[this.theme];
    const size = 48;
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const octx = off.getContext('2d');
    octx.fillStyle = pal.path;
    octx.fillRect(0, 0, size, size);
    const rng = mulberry32(6001 + (this.id || 0));
    for (let i = 0; i < 100; i++) {
      const x = rng() * size, y = rng() * size, r = 0.6 + rng() * 1.7;
      octx.fillStyle = rng() < 0.55 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.11)';
      octx.beginPath(); octx.arc(x, y, r, 0, Math.PI * 2); octx.fill();
    }
    for (let i = 0; i < 7; i++) {
      const x = rng() * size, y = rng() * size, r = 1.8 + rng() * 2.4, rot = rng() * Math.PI;
      octx.fillStyle = 'rgba(0,0,0,0.18)';
      octx.beginPath(); octx.ellipse(x, y, r, r * 0.7, rot, 0, Math.PI * 2); octx.fill();
      octx.fillStyle = 'rgba(255,255,255,0.12)';
      octx.beginPath(); octx.ellipse(x - r * 0.25, y - r * 0.25, r * 0.55, r * 0.4, rot, 0, Math.PI * 2); octx.fill();
    }
    this._pathPattern = ctx.createPattern(off, 'repeat');
    return this._pathPattern;
  }

  // Cỏ ăn lấn mép đường (nibble) + sỏi/vệt cỏ rải dọc 2 bên — tính 1 lần theo seed
  // riêng của map (không lệ thuộc decor/buildSpots) rồi cache, vẽ đè lên mép path
  // để phá vỡ dáng "2 đường cong song song đều tăm tắp".
  _pathEdgeDecor() {
    if (this._edgeDecor) return this._edgeDecor;
    const rng = mulberry32(7001 + (this.id || 0));
    const halfW = this.pathWidth / 2;
    const nibbles = [];
    const rocks = [];
    for (const path of this.paths) {
      let acc = 999;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (segLen < 0.001) continue;
        const nx = -(b.y - a.y) / segLen, ny = (b.x - a.x) / segLen;
        acc += segLen;
        if (acc > 13) {
          acc = 0;
          if (rng() < 0.6) {
            const side = rng() < 0.5 ? 1 : -1;
            const depth = halfW - (1 + rng() * 8); // lấn vào trong mép đường 1-9px
            nibbles.push({ x: b.x + nx * depth * side, y: b.y + ny * depth * side, r: 4.5 + rng() * 6.5 });
          }
          if (rng() < 0.24) {
            const side = rng() < 0.5 ? 1 : -1;
            const out = halfW + 1 + rng() * 9;
            rocks.push({
              x: b.x + nx * out * side, y: b.y + ny * out * side,
              img: ['rock1', 'rock2', 'rock3', 'rock4'][Math.floor(rng() * 4)],
              scale: 0.3 + rng() * 0.22, rot: rng() * Math.PI * 2,
            });
          }
        }
      }
    }
    this._edgeDecor = { nibbles, rocks };
    return this._edgeDecor;
  }

  // Vẽ cụm cỏ lấn mép (2 lớp đậm/nhạt cho có độ dày) lên trên path đã vẽ, rồi rải
  // sỏi nhỏ ngay sát mép ngoài — làm mép đường trông lởm chởm tự nhiên.
  _drawPathEdgeDecorInto(ctx) {
    const { rocks } = this._pathEdgeDecor();
    ctx.save();
    for (const s of rocks) {
      const img = AssetLoader.getImage(s.img);
      if (!img) continue;
      const size = 64 * s.scale;
      ctx.save();
      if (this.volcanic) ctx.filter = THEME_DECOR_FILTERS[this.theme] || 'none';
      ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.drawImage(img, 0, 0, 64, 64, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------- Lớp phủ chủ đề núi lửa (chỉ chạy khi map.volcanic) ----------------
  // Vệt tro loang: đốm tối/sáng ngẫu nhiên phủ lên mặt đất để phá vỡ hoạ tiết "cỏ" của
  // tile gốc, cho ra chất đất nứt nẻ ám tro thay vì bãi cỏ bị nhuộm tối.
  _drawAshOverlayInto(ctx) {
    const r = this._mainIslandRect;
    const rng = mulberry32(8100 + (this.id || 0));
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    for (let i = 0; i < 260; i++) {
      const x = r.x + rng() * r.w, y = r.y + rng() * r.h;
      if (!this.isLandAt(x, y)) continue; // không phủ tro lên mặt nước
      const rad = 7 + rng() * 34;
      ctx.globalAlpha = 0.05 + rng() * 0.11;
      ctx.fillStyle = rng() < 0.62 ? '#181310' : '#54423a';
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * (0.45 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _strokePolyline(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  // Khe nứt dung nham: 3 lớp chồng (quầng sáng mờ rộng -> lõi cam -> tim vàng) tạo cảm
  // giác phát sáng từ dưới lòng đất. Vẽ vào static layer, không tốn chi phí mỗi khung hình.
  _drawLavaCracksInto(ctx) {
    if (!this.lavaCracks || !this.lavaCracks.length) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const c of this.lavaCracks) {
      const strokes = [c.main, ...c.branches];
      ctx.globalAlpha = 0.20; ctx.strokeStyle = '#ff7a1e'; ctx.lineWidth = c.width + 8;
      for (const s of strokes) this._strokePolyline(ctx, s);
      ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ff9836'; ctx.lineWidth = c.width;
      for (const s of strokes) this._strokePolyline(ctx, s);
      ctx.globalAlpha = 1; ctx.strokeStyle = '#ffe294'; ctx.lineWidth = Math.max(1, c.width * 0.38);
      for (const s of strokes) this._strokePolyline(ctx, s);
    }
    ctx.restore();
  }

  // Tàn lửa/tro bay: số lượng nhỏ (16 hạt), toạ độ tính thẳng từ thời gian nên không
  // cần vòng update riêng; đây là thứ DUY NHẤT của chủ đề núi lửa vẽ lại mỗi khung hình.
  _emberSpots() {
    if (this._embers) return this._embers;
    const rng = mulberry32(8200 + (this.id || 0));
    const list = [];
    for (let i = 0; i < 16; i++) {
      list.push({
        x: 70 + rng() * (CONFIG.canvas.width - 140),
        y0: 130 + rng() * (CONFIG.canvas.height - 230),
        rise: 26 + rng() * 30, speed: 12 + rng() * 16,
        phase: rng() * 10, sway: 4 + rng() * 8, size: 1.1 + rng() * 1.5,
      });
    }
    this._embers = list;
    return list;
  }

  _drawEmbersInto(ctx, now) {
    const t = now / 1000;
    ctx.save();
    for (const e of this._emberSpots()) {
      const k = (((t * e.speed) / e.rise) + e.phase) % 1; // 0..1 = 1 chu kỳ bay lên
      const y = e.y0 - k * e.rise;
      const x = e.x + Math.sin((t + e.phase) * 1.6) * e.sway;
      const a = Math.sin(Math.PI * k); // mờ dần ở 2 đầu chu kỳ
      ctx.globalAlpha = 0.3 * a;
      ctx.fillStyle = '#ff7a1e';
      ctx.beginPath(); ctx.arc(x, y, e.size * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9 * a;
      ctx.fillStyle = '#ffc266';
      ctx.beginPath(); ctx.arc(x, y, e.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _drawWaterInto(ctx) {
    const w = CONFIG.canvas.width, h = CONFIG.canvas.height;
    const img = AssetLoader.getImage('waterBg');
    if (img) {
      if (!this._waterPattern) this._waterPattern = ctx.createPattern(img, 'repeat');
      ctx.fillStyle = this._waterPattern;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#2a6f8a';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Đá rải trong nước quanh mép đảo chính — vị trí cố định theo seed = id map, nên
  // luôn giống nhau giữa các lần chơi nhưng khác nhau giữa các map.
  // Đá ven bờ: bám theo ĐƯỜNG BỜ BIỂN thật (danh sách ô đất giáp nước) rồi đẩy ra phía
  // nước, nên đá đi theo các khúc lồi lõm của đảo thay vì xếp đều quanh 1 khung chữ nhật.
  _waterRockSpots() {
    if (this._waterRocks) return this._waterRocks;
    const rng = mulberry32(1000 + (this.id || 0));
    const coast = this._coastCells();
    const pool = ['waterRock1', 'waterRock2', 'waterRock3', 'waterRock4'];
    const spots = [];
    if (!coast.length) { this._waterRocks = spots; return spots; }
    const count = 16;
    for (let i = 0; i < count; i++) {
      const c = coast[Math.floor(rng() * coast.length)];
      const out = 10 + rng() * 20;
      spots.push({
        x: c.x + c.nx * out + (rng() - 0.5) * 18,
        y: c.y + c.ny * out + (rng() - 0.5) * 18,
        img: pool[Math.floor(rng() * pool.length)], scale: 0.4 + rng() * 0.25, flip: rng() < 0.5,
      });
    }
    this._waterRocks = spots;
    return spots;
  }

  _drawWaterRocksInto(ctx) {
    // Tắt các đốm đá xám chìm dưới nước gây cảm giác giống bóng ma lơ lửng
  }

  // Bọt sóng hoạt hình mỏng dọc mép đảo — vẽ động mỗi khung hình (không cache vào
  // static layer) để giữ animation, dùng vài khung trong Water Foam.png làm đốm sóng.
  _drawFoamInto(ctx) {
    const img = AssetLoader.getImage('waterFoam');
    if (!img) return;
    const now = performance.now();
    const frame = 64;
    const totalFrames = Math.floor(img.width / frame);
    // Bọt sóng rải dọc ĐƯỜNG BỜ BIỂN thật — lấy mẫu thưa các ô đất giáp nước để sóng
    // ôm theo đúng các khúc lồi lõm của đảo.
    const spots = this._foamSpots || (this._foamSpots = (() => {
      const rng = mulberry32(2000 + (this.id || 0));
      const coast = this._coastCells();
      const list = [];
      const step = Math.max(1, Math.floor(coast.length / 30));
      for (let i = 0; i < coast.length; i += step) {
        const c = coast[i];
        const out = 2 + rng() * 8;
        list.push({
          x: c.x + c.nx * out, y: c.y + c.ny * out,
          phase: Math.floor(rng() * totalFrames), fps: 4 + rng() * 2,
        });
      }
      return list;
    })());
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const s of spots) {
      const f = (Math.floor(now / (1000 / s.fps)) + s.phase) % totalFrames;
      ctx.drawImage(img, f * frame, 0, frame, frame, s.x - 16, s.y - 16, 32, 32);
    }
    ctx.restore();
  }

  // Toàn bộ phần TĨNH (nước + đảo chính + đường đi + đảo nhỏ đặt tháp + đá trong
  // nước) chỉ cần dựng 1 lần rồi cache ra canvas phụ — mỗi frame chỉ drawImage lại
  // thay vì lặp lại hàng trăm lệnh vẽ tile, foam động vẫn vẽ riêng mỗi khung hình.
  // Nền/đường/mép cỏ — CHỈ dựng 1 LẦN DUY NHẤT cho cả trận, không bao giờ bị phá
  // huỷ giữa chừng nên không cần rebake (khác hẳn lớp decor bên dưới). Tách RIÊNG
  // khỏi lớp decor để phá 1 tài nguyên KHÔNG kéo theo việc dựng lại toàn bộ nước/
  // cỏ/đường (phần tốn thời gian nhất) — trước đây gộp chung khiến mỗi lần phá đều
  // giật hình do phải dựng lại nguyên map.
  _buildTerrainLayer() {
    const w = CONFIG.canvas.width, h = CONFIG.canvas.height;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;

    this._drawGrassRectInto(octx);

    // Chủ đề núi lửa: phủ vệt tro rồi vẽ khe nứt dung nham TRƯỚC khi vẽ đường đi, để
    // dù khe nứt có sinh gần đường thì mặt đường vẫn nằm đè lên trên, giữ đường đi rõ ràng.
    if (this.volcanic) {
      this._drawAshOverlayInto(octx);
      this._drawLavaCracksInto(octx);
    }

    // Đường đi vẽ 3 lớp để có cảm giác lõm xuống mặt cỏ (kiểu Kingdom Rush) thay vì
    // 1 khối màu phẳng: (1) viền ngoài đậm — rìa đất nhô lên khỏi cỏ; (2) 1 vòng bóng
    // đổ mờ NHỎ HƠN viền ngoài nhưng LỚN HƠN mặt đường — phần lộ ra giữa 2 lớp này
    // đọc thành 1 đường viền tối mỏng quanh mép trong, giống inner-shadow; (3) mặt
    // đường phủ texture đất/sỏi (pattern noise) thay vì fill màu đặc.
    const pal = THEME_PATH_COLORS[this.theme];
    octx.save();
    octx.lineCap = 'square'; octx.lineJoin = 'miter'; octx.miterLimit = 2;
    octx.strokeStyle = pal.pathEdge;
    octx.lineWidth = this.pathWidth + 10;
    this._strokeAllPaths(octx);
    octx.strokeStyle = 'rgba(0,0,0,0.32)';
    octx.lineWidth = this.pathWidth + 4;
    this._strokeAllPaths(octx);
    octx.strokeStyle = this._getPathPattern(octx);
    octx.lineWidth = this.pathWidth;
    this._strokeAllPaths(octx);
    octx.restore();

    // Cỏ lấn mép + sỏi rải dọc 2 bên — vẽ đè lên trên texture đường để phá dáng
    // "2 đường cong song song đều tăm tắp".
    this._drawPathEdgeDecorInto(octx);

    this._terrainLayer = off;
  }

  // Đánh dấu 1 tài nguyên đã phá. Decor không còn bake tĩnh (xem decorEntities())
  // nên không cần dựng lại gì — item bị lọc ra ở lần vẽ kế tiếp vì `cleared:true`.
  clearResource(d) {
    d.cleared = true;
  }

  // Toàn bộ decor CHƯA PHÁ (cây/bụi/đá/nhà/mốc, kể cả viền rừng — cừu/dân làng riêng)
  // dưới dạng {y, draw} để main.js gộp CHUNG vào mảng "layered" cùng tháp/lính/Hero/
  // quái rồi sort 1 lần theo y (painter's algorithm) — trước đây toàn bộ decor được
  // bake thành 1 layer nền vẽ TRƯỚC mọi entity nên nhân vật luôn nổi đè lên hết,
  // không thể "đi sau" 1 gốc cây gần đó -> nhìn như dán đè lên phông nền phẳng, giả.
  // y ở đây LUÔN là toạ độ CHÂN (đáy sprite, xem _drawDecorationItemInto) — khớp quy
  // ước entity.y cũng là điểm chạm đất, để so sánh y trực tiếp cho ra chiều sâu đúng.
  decorEntities() {
    const now = performance.now();
    const list = [];
    for (const d of this.decorations) {
      if (d.cleared) continue;
      if (d.kind === 'sheep') { list.push({ y: d.y, draw: (ctx) => this._drawSheep(ctx, d, now) }); continue; }
      if (d.kind === 'villager') {
        const t = now + d.phase * 1000;
        const y = d.y0 + d.dirY * d.amplitude * Math.sin(t / d.period);
        list.push({ y, draw: (ctx) => this._drawVillager(ctx, d, now) });
        continue;
      }
      // Viền rừng (border:true) vẫn GIỮ KHUNG HÌNH TĨNH dù animated:true (số lượng
      // quá lớn để lắc mỗi khung hình, xem generateForestBorder) — chỉ cây rải gần
      // đường mới thực sự lắc theo animTime.
      const animTime = (d.animated && !d.border) ? now : null;
      list.push({ y: d.y, draw: (ctx) => this._drawDecorationItemInto(ctx, d, animTime) });
    }
    return list;
  }

  // Vật cản CHƯA DỌN (đá/bụi/nhà hoang) — cũng gộp vào y-sort như decor: thường nằm
  // sát mép đường (minPathDist=30) nên quái/lính đi ngang rất dễ chạm chiều sâu với
  // chúng, y hệt lý do cây cần gộp vào ở trên.
  obstacleEntities(ui = {}) {
    return (this.obstacles || [])
      .filter(ob => !ob.cleared)
      .map(ob => ({ y: ob.y, draw: (ctx) => this._drawObstacleItem(ctx, ob, ui) }));
  }

  // Cache ảnh ĐÃ áp sẵn ctx.filter — set ctx.filter rồi drawImage cho MỖI decor MỖI
  // FRAME rất tốn (ctx.filter trên Canvas2D không tăng tốc phần cứng như CSS filter
  // DOM, tốn gấp ~10-20 lần 1 drawImage thường), trong khi viền rừng đã ~150-200
  // cây/map + cừu/dân làng cũng tự set filter riêng mỗi con. Filter chỉ phụ thuộc
  // (ảnh nguồn, chuỗi filter) — CỐ ĐỊNH suốt vòng đời map (theme không đổi giữa
  // trận) — nên áp 1 LẦN ra canvas phụ rồi cache lại, từ đó mỗi frame chỉ còn
  // drawImage thường (rẻ), không set ctx.filter nữa. Số ảnh nguồn khác nhau tối đa
  // vài chục (tree1-4/treeSet/bush/rock/deco/house...) nên chi phí dựng cache mỗi
  // ảnh (1 lần) không đáng kể so với hàng trăm lần tiết kiệm được mỗi giây.
  _getFilteredImage(imgKey, filter) {
    const img = AssetLoader.getImage(imgKey);
    if (!img || !filter || filter === 'none') return img;
    this._filterCache = this._filterCache || {};
    const cacheKey = imgKey + '|' + filter;
    let cached = this._filterCache[cacheKey];
    if (!cached) {
      cached = document.createElement('canvas');
      cached.width = img.width; cached.height = img.height;
      const cctx = cached.getContext('2d');
      cctx.filter = filter;
      cctx.drawImage(img, 0, 0);
      this._filterCache[cacheKey] = cached;
    }
    return cached;
  }

  // Vẽ 1 item decor. `animTime` = null -> luôn dùng khung hình đầu (frame tĩnh);
  // truyền `now` (performance.now()) để tính khung hình animation hiện tại cho các
  // item có animated:true.
  _drawDecorationItemInto(ctx, d, animTime) {
    // Nhà hoang giữ bộ lọc "cũ kỹ" RIÊNG, KHÔNG cộng thêm filter mùa (giữ đúng hành
    // vi cũ) — filter đã bake sẵn vào ảnh cache nên KHÔNG cần set ctx.filter nữa.
    const filter = d.kind === 'house' ? HOUSE_DECOR_FILTER : (THEME_DECOR_FILTERS[this.theme] || 'none');
    const img = this._getFilteredImage(d.img, filter);
    if (!img) return;
    let sx = d.sx;
    if (animTime != null && d.animated) sx = (Math.floor(animTime / (1000 / d.fps) + d.phase) % d.frames) * d.sw;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, d.sy, d.sw, d.sh, -d.dw / 2, -d.dh, d.dw, d.dh);
    ctx.restore();
  }

  // Chỉ còn vẽ NỀN THUẦN (nước/cỏ/đường) — cây/bụi/đá/nhà/cừu/dân làng giờ vẽ chung
  // với tháp/lính/Hero/quái theo thứ tự y (xem decorEntities(), main.js:render()) để
  // có chiều sâu đúng, không còn là 1 layer nền phẳng vẽ cứng trước mọi entity.
  drawBackground(ctx) {
    if (!this._terrainLayer) this._buildTerrainLayer();
    ctx.drawImage(this._terrainLayer, 0, 0);
    if (this.volcanic) this._drawEmbersInto(ctx, performance.now());
  }

  _strokeAllPaths(ctx) {
    for (const path of this.paths) {
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }
  }

  // Tài nguyên gần (x,y) trong tầm bấm, CHƯA phá — dùng cho click "trả tiền phá"
  // (main.js). Cừu/dân làng không có cost nên tự động bị loại khỏi tương tác.
  resourceAt(x, y) {
    return this.decorations.find(d => d.cost != null && !d.cleared && Math.hypot(d.x - x, d.y - y) <= d.dw * 0.5 + 12);
  }

  // Nhãn giá nhỏ phía trên tài nguyên đang rê chuột vào — y hệt bảng giá vật cản
  // (drawObstacles): CHI PHÍ phải trả để phá, không có thưởng gì cả.
  _drawResourceTag(ctx, d, affordable) {
    const label = `${d.cost}`;
    ctx.font = 'bold 11px sans-serif';
    const w = ctx.measureText(label).width + 22;
    const ly = d.y - d.dh - 10;
    ctx.fillStyle = affordable ? 'rgba(38,14,10,0.88)' : 'rgba(60,16,12,0.88)';
    ctx.beginPath(); ctx.roundRect(d.x - w / 2, ly - 9, w, 16, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,90,0.9)';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = affordable ? '#ffdc78' : '#ff9a8a';
    ctx.textAlign = 'left'; ctx.fillText(label, d.x - w / 2 + 15, ly + 4);
    ctx.font = '10px sans-serif'; ctx.fillText('🪙', d.x - w / 2 + 4, ly + 4);
    ctx.textAlign = 'center';
  }

  // Vòng sáng + nhãn giá cho tài nguyên đang bị RÊ CHUỘT VÀO — main.js gọi hàm này
  // SAU CÙNG (sau khi đã vẽ xong toàn bộ layer y-sort tháp/lính/Hero/quái/decor) để
  // nhãn giá luôn hiện TRÊN CÙNG, không bị 1 nhân vật đứng gần đó vẽ đè lên.
  drawDecorHoverOverlay(ctx, ui = {}) {
    if (ui.hoverX == null) return;
    const hovered = this.resourceAt(ui.hoverX, ui.hoverY);
    if (!hovered) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,190,90,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(hovered.x, hovered.y - hovered.dh * 0.4, hovered.dw * 0.6, hovered.dh * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    this._drawResourceTag(ctx, hovered, (ui.gold || 0) >= hovered.cost);
  }

  // Cừu: chu kỳ ~11.5s luân phiên Đứng yên (Sheep_Idle) -> Gặm cỏ (Sheep_Grass) -> Đi
  // vài bước (Sheep_Move, có rê nhẹ vị trí theo sin quanh điểm neo) -> nhảy vui vẻ tại
  // chỗ (HappySheep_Bouncing, Tiny Swords Update 010) rồi lặp lại. Toạ độ hiện tại
  // tính thẳng từ `now` + phase riêng từng con — không cần update().
  _drawSheep(ctx, d, now) {
    const t = (now + d.phase * 1000) % 11500;
    let key, frames, fps, moving = false;
    if (t < 3000) { key = 'sheepIdle'; frames = 6; fps = 3; }
    else if (t < 7000) { key = 'sheepGrass'; frames = 12; fps = 6; }
    else if (t < 9500) { key = 'sheepMove'; frames = 4; fps = 6; moving = true; }
    else { key = 'sheepBouncing'; frames = 6; fps = 7; }
    const img = this._getFilteredImage(key, THEME_DECOR_FILTERS[this.theme] || 'none');
    if (!img) return;
    const wander = moving ? Math.sin((now + d.phase * 1000) / 480) * 9 : 0;
    const x = d.x + d.dirX * wander, y = d.y + d.dirY * wander;
    const sx = (Math.floor(now / (1000 / fps) + d.phase * 10) % frames) * 128;
    ctx.save();
    ctx.translate(x, y);
    if (d.flip !== (moving && wander < 0)) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, 0, 128, 128, -d.dw / 2, -d.dh * 0.7, d.dw, d.dh);
    ctx.restore();
  }

  // Dân làng đi tuần trang trí: đi tới-lui quanh điểm neo (x0,y0) theo sin
  _drawVillager(ctx, d, now) {
    const t = now + d.phase * 1000;
    const s = Math.sin(t / d.period);
    const speedSign = Math.cos(t / d.period);
    const x = d.x0 + d.dirX * d.amplitude * s, y = d.y0 + d.dirY * d.amplitude * s;
    const moving = Math.abs(speedSign) > 0.12;
    const key = moving ? 'villagerRun' : 'villagerIdle';
    const img = this._getFilteredImage(key, THEME_DECOR_FILTERS[this.theme] || 'none');
    if (!img) return;
    const frames = moving ? 6 : 8;
    const fps = moving ? 8 : 3;
    const sx = (Math.floor(now / (1000 / fps)) % frames) * 192;
    ctx.save();
    ctx.translate(x, y);
    if (speedSign * d.dirX < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, 0, 192, 192, -d.dw / 2, -d.dh * 0.68, d.dw, d.dh);
    ctx.restore();
  }

  // Mỗi path có 1 điểm spawn riêng, đánh dấu bằng icon đầu lâu trong vòng viền đỏ
  // (kiểu Kingdom Rush — map nhiều path = quái ra từ nhiều hướng cùng lúc, mỗi
  // hướng 1 đầu lâu riêng). Mọi path hội tụ về CÙNG 1 toạ độ cuối nên chỉ cần vẽ
  // 1 lâu đài chung (paths[0] đại diện, vì điểm cuối các path đều trùng nhau).
  // Vị trí NÚT ĐẦU LÂU của từng đường (kẹp vào trong khung vì path bắt đầu ở x=-20,
  // tức ngoài màn hình). main.js dùng danh sách này để bắt click "gọi quái".
  get spawnButtons() {
    if (this.__spawnBtns) return this.__spawnBtns;
    const R = 19;
    // Lề kẹp phải đủ rộng cho CẢ CỤM hình (trại quái cao ~77px phía trên tâm, cọc đầu
    // lâu rộng ±40px) — kẹp trước đây chỉ tính theo bán kính R=19 của riêng huy hiệu
    // tròn nên trại quái bị vẽ lòi ra ngoài, lộ nửa hình ở map có điểm spawn gần mép
    // trên/dưới canvas. Cùng con số với vùng nhận click ở main.js:spawnButtonAt().
    const MX = 46, MY_TOP = 84, MY_BOT = 26;
    this.__spawnBtns = this.paths.map((path) => {
      const s = path[0];
      return {
        x: Math.min(Math.max(s.x, MX), CONFIG.canvas.width - MX),
        y: Math.min(Math.max(s.y, MY_TOP), CONFIG.canvas.height - MY_BOT),
        r: R,
      };
    });
    return this.__spawnBtns;
  }

  // Lối mòn đất nối trại quái ra mép màn hình — vệt trang trí THUẦN HÌNH ẢNH (không
  // phải path chơi thật), cho cảm giác "quái đi từ xa tới" thay vì trại lơ lửng giữa
  // cỏ. Tái dùng ĐÚNG kỹ thuật đã có: pattern đất của _getPathPattern() + cách rải
  // đá ven đường của _pathEdgeDecor() — tính 1 lần rồi cache, không random lại mỗi
  // frame (cùng quy ước với mọi decor khác trong file này).
  _spawnTrails() {
    if (this.__spawnTrails) return this.__spawnTrails;
    const rng = mulberry32(9100 + (this.id || 0));
    const W = CONFIG.canvas.width, H = CONFIG.canvas.height;
    this.__spawnTrails = this.spawnButtons.map((b) => {
      // Mép màn hình gần nhất — lối mòn chạy thẳng ra hướng đó (đúng hướng path
      // thật vốn đã đi ra mép từ điểm này).
      const edges = [
        { x: 0, y: b.y, d: b.x },
        { x: W, y: b.y, d: W - b.x },
        { x: b.x, y: 0, d: b.y },
        { x: b.x, y: H, d: H - b.y },
      ];
      edges.sort((a, c) => a.d - c.d);
      const edge = edges[0];
      const horizontal = edge.y === b.y;
      const jitter = (rng() - 0.5) * 44;
      const mid = {
        x: (b.x + edge.x) / 2 + (horizontal ? 0 : jitter),
        y: (b.y + edge.y) / 2 + (horizontal ? jitter : 0),
      };
      const dx = edge.x - b.x, dy = edge.y - b.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const rocks = [];
      const n = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const t = 0.15 + rng() * 0.7;
        const px = b.x + dx * t, py = b.y + dy * t;
        const side = rng() < 0.5 ? -1 : 1;
        const off = 22 + rng() * 14;
        rocks.push({
          x: px + nx * off * side, y: py + ny * off * side,
          img: ['rock1', 'rock2', 'rock3', 'rock4'][Math.floor(rng() * 4)],
          scale: 0.26 + rng() * 0.2, rot: rng() * Math.PI * 2,
        });
      }
      return { from: { x: b.x, y: b.y }, mid, to: edge, nx, ny, rocks };
    });
    return this.__spawnTrails;
  }

  // Vệt đất thon dần (rộng ở trại quái, hẹp dần ra mép) uốn nhẹ qua điểm `mid` lệch
  // ngẫu nhiên — quadratic curve thay vì hình chữ nhật thẳng đơ cho đỡ giả tạo.
  _drawSpawnTrail(ctx, trail) {
    const pattern = this._getPathPattern(ctx);
    const { from, mid, to, nx, ny } = trail;
    const wStart = 34, wEnd = 15, wMid = (wStart + wEnd) / 2;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = pattern;
    ctx.beginPath();
    ctx.moveTo(from.x + nx * wStart, from.y + ny * wStart);
    ctx.quadraticCurveTo(mid.x + nx * wMid, mid.y + ny * wMid, to.x + nx * wEnd, to.y + ny * wEnd);
    ctx.lineTo(to.x - nx * wEnd, to.y - ny * wEnd);
    ctx.quadraticCurveTo(mid.x - nx * wMid, mid.y - ny * wMid, from.x - nx * wStart, from.y - ny * wStart);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    for (const r of trail.rocks) {
      const img = AssetLoader.getImage(r.img);
      if (!img) continue;
      const size = 64 * r.scale;
      ctx.save();
      ctx.translate(r.x, r.y); ctx.rotate(r.rot);
      ctx.drawImage(img, 0, 0, 64, 64, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  // Vị trí + kích thước toà thành cuối đường (đảo LUÔN kẹp trong ranh giới đảo,
  // không lòi ra ngoài mép canvas/nước) — dùng chung cho vẽ thành (dưới) và cho
  // main.js đặt điểm gác/hồi sinh của Hero ngay trước cổng thành.
  get castlePos() {
    if (this.__castlePos) return this.__castlePos;
    // `castleOverride` (tuỳ chọn, map.js def): dùng khi path[0] KHÔNG kết thúc ở cổng
    // thành thật — ví dụ map có hầm bí mật, path gốc dừng hẳn ở miệng hầm chứ không
    // đi tới thành (xem "Rừng Lá Đỏ"). Map bình thường không set field này, hành vi
    // y hệt cũ (lấy điểm cuối path[0]).
    const end = this.castleOverride || this.paths[0][this.paths[0].length - 1];
    const cw = 148;
    const castleImg = AssetLoader.getImage('blueCastle');
    const ch = castleImg ? cw * (castleImg.height / castleImg.width) : cw * 0.8;
    const island = this._mainIslandRect;
    const cx = Math.min(Math.max(end.x, island.x + cw / 2 + 10), island.x + island.w - cw / 2 - 10);
    const cy = Math.min(Math.max(end.y, island.y + ch * 0.6 + 8), island.y + island.h - 18);
    this.__castlePos = { x: cx, y: cy, w: cw, h: ch };
    return this.__castlePos;
  }

  // Vị trí 2 nhà trang trí hai bên cổng — lệch đều VUÔNG GÓC với hướng đoạn đường
  // cuối cùng đổ vào cổng (không hard-code toạ độ tay cho từng map, tự tính từ
  // path[0] + castlePos đã có sẵn). Thuần trang trí, xem drawSpawnAndBase().
  get gatePillarPositions() {
    if (this.__gatePillarPos) return this.__gatePillarPos;
    const castle = this.castlePos;
    const path0 = this.paths[0];
    const last = path0[path0.length - 1], prev = path0[path0.length - 2] || last;
    const dx = last.x - prev.x, dy = last.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // vector vuông góc hướng đi
    // dh của tháp tròn là ~56px. Tính neo đáy chuẩn để cả 2 tháp cách 2 mép đường đúng 2px cân đối.
    const dh = 56;
    const gap = 25; // pathWidth / 2 + 2px đệm
    const p1Y = ny < 0 ? castle.y + ny * gap : castle.y + ny * (gap + dh);
    const p2Y = ny < 0 ? castle.y - ny * (gap + dh) : castle.y - ny * gap;
    const p1X = nx < 0 ? castle.x + nx * gap : castle.x + nx * (gap + 10);
    const p2X = nx < 0 ? castle.x - nx * (gap + 10) : castle.x - nx * gap;
    this.__gatePillarPos = [
      { x: castle.x + nx * gap, y: p1Y },
      { x: castle.x - nx * gap, y: p2Y },
    ];
    return this.__gatePillarPos;
  }

  // `ui` (main.js truyền vào): { waveReady, hoverX, hoverY } — waveReady = đang cho phép
  // gọi đợt kế tiếp, dùng để nhấp nháy nút đầu lâu mời người chơi bấm.
  drawSpawnAndBase(ctx, ui = {}) {
    ctx.save();
    const now = performance.now();
    const camp = AssetLoader.getImage('goblinCamp');
    const spike = AssetLoader.getImage('skullSpike');
    const btns = this.spawnButtons;

    // Không có sprite trại quái riêng cho từng theme, nên "reskin" bằng đúng bộ lọc
    // màu (saturate/hue-rotate/brightness) map.js đã dùng để nhuộm cây/đá theo mùa —
    // trại ở map Đông ngả xanh băng, map núi lửa ngả tro xám, v.v. — thay vì 1 màu gỗ
    // nâu y hệt trên mọi map bất kể bối cảnh, trông tự nhiên hơn nhiều mà không cần
    // vẽ thêm asset mới.
    const campFilter = THEME_DECOR_FILTERS[this.theme] || 'none';
    const trails = this._spawnTrails();
    this.paths.forEach((path, i) => {
      const b = btns[i];
      // Lối mòn dẫn ra mép màn hình, vẽ TRƯỚC (nằm dưới) trại quái + cọc — cho cảm
      // giác quái đi từ xa tới theo 1 lối mòn thật, không phải trại lơ lửng giữa cỏ.
      this._drawSpawnTrail(ctx, trails[i]);

      // Trại quái + 2 cọc đầu lâu hai bên: chỗ quái chui ra nhìn ra "hang ổ" hẳn hoi,
      // thay cho vòng tròn đỏ + emoji 💀 như trước.
      ctx.filter = campFilter;
      if (spike) {
        ctx.globalAlpha = 0.95;
        ctx.drawImage(spike, 0, 0, 64, 128, b.x - 40, b.y - 34, 18, 36);
        ctx.drawImage(spike, 0, 0, 64, 128, b.x + 22, b.y - 34, 18, 36);
      }
      if (camp) {
        const cw = 62, ch = cw * (192 / 128);
        ctx.globalAlpha = 1;
        ctx.drawImage(camp, b.x - cw / 2, b.y - ch + 16, cw, ch);
      }
      ctx.filter = 'none';

      // Huy hiệu đầu lâu CHỈ hiện khi đang chờ người chơi gọi đợt (waveReady) — bấm
      // vào là đợt bắt đầu ngay, đầu lâu biến mất theo (ready=false) cho tới khi dọn
      // sạch quái đợt đó và sẵn sàng đợt kế tiếp mới hiện lại. Trại quái + cọc vẫn
      // luôn hiện làm "hang ổ" cố định, chỉ riêng huy hiệu là tín hiệu bấm-được.
      const ready = !!ui.waveReady;
      if (ready) {
        const pulse = 0.65 + Math.sin(now / 260) * 0.35;
        const hovered = ui.hoverX >= 0 && Math.hypot(ui.hoverX - b.x, ui.hoverY - b.y) <= b.r + 4;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(255,160,60,${0.35 + pulse * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5 + pulse * 4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = hovered ? 'rgba(60,20,14,0.96)' : 'rgba(38,14,10,0.9)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,${140 + pulse * 80},60,1)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
        ctx.font = '19px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff';
        ctx.fillText('💀', b.x, b.y + 7);

        if (i === 0) {
          const label = 'Bấm để thả quái';
          ctx.font = 'bold 11px sans-serif';
          const w = ctx.measureText(label).width + 14;
          const ly = b.y + b.r + 16;
          ctx.fillStyle = 'rgba(38,14,10,0.9)';
          ctx.beginPath(); ctx.roundRect(b.x - w / 2, ly - 11, w, 16, 5); ctx.fill();
          ctx.strokeStyle = `rgba(255,170,70,${0.55 + pulse * 0.45})`; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#ffd9a0';
          ctx.fillText(label, b.x, ly + 1);
        }
      }
    });

    // 2 toà tháp pháo đài hai bên cổng thành — canh giữ lối vào điểm cuối đường,
    // dùng sprite tháp tròn (blueTower/yellowTower/redTower) thay cho 2 căn nhà cũ.
    const towerKey = this.theme === 'autumn' ? 'yellowTower' : (this.theme === 'volcano' ? 'redTower' : 'blueTower');
    const towerImg = this._getFilteredImage(towerKey, THEME_DECOR_FILTERS[this.theme] || 'none');
    this.gatePillarPositions.forEach((p) => {
      if (!towerImg) return;
      const dw = 34, dh = dw * (towerImg.height / towerImg.width);
      ctx.drawImage(towerImg, p.x - dw / 2, p.y - dh, dw, dh);
    });
    ctx.restore();
  }

  // Đường hầm/cổng dịch chuyển bí mật (chỉ map nào khai báo `tunnels`) — vẽ tại
  // từng cửa vào VÀ cửa ra, cả 2 đều NẰM TRÊN cùng 1 đường chính liền mạch (không
  // có đoạn đường riêng nào cần vẽ thêm ở đây). Mặc định dùng sprite "mỏ vàng"
  // (goldMine); nếu tunnel có `color` -> vẽ thành cổng phép thuật phát sáng theo
  // màu đó thay vì miệng hầm (dùng cho map cổng dịch chuyển đa sắc).
  drawTunnels(ctx) {
    if (!this.tunnels || !this.tunnels.length) return;
    const img = AssetLoader.getImage('goldMine');
    ctx.save();
    const dw = 46, dh = img ? dw * (img.height / img.width) : dw;
    const drawMineMouth = (x, y) => {
      ctx.drawImage(img, 0, 0, img.width, img.height, x - dw / 2, y - dh * 0.82, dw, dh);
    };
    const now = performance.now();
    const drawPortal = (x, y, color) => {
      const pulse = 0.85 + Math.sin(now / 260 + x * 0.01 + y * 0.01) * 0.15;
      const r = 20 * pulse;
      const grad = ctx.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(x, y, r * 0.75, now / 900, now / 900 + Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.95, -now / 700, -now / 700 + Math.PI * 1.1); ctx.stroke();
      ctx.globalAlpha = 1;
    };
    const drawnPoints = new Set();
    for (const t of this.tunnels) {
      const inKey = t.x + ',' + t.y, outKey = t.exitX + ',' + t.exitY;
      if (!drawnPoints.has(inKey)) {
        drawnPoints.add(inKey);
        if (t.color) drawPortal(t.x, t.y, t.color); else if (img) drawMineMouth(t.x, t.y);
      }
      if (!drawnPoints.has(outKey)) {
        drawnPoints.add(outKey);
        if (t.color) drawPortal(t.exitX, t.exitY, t.color); else if (img) drawMineMouth(t.exitX, t.exitY);
      }
    }
    ctx.restore();
  }

  activePathIndex(waveIndex) {
    if (!this.pathPattern || !this.pathPattern.length) return null;
    return this.pathPattern[Math.max(0, waveIndex) % this.pathPattern.length];
  }

  drawPathGates(ctx, waveIndex) {
    if (!this.pathPattern) return;
    const active = this.activePathIndex(waveIndex);
    const spikeImg = AssetLoader.getImage('skullSpike');
    const now = performance.now();
    ctx.save();
    this.paths.forEach((path, i) => {
      const p0 = path[0], p1 = path[Math.min(3, path.length - 1)];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      if (i === active) {
        const pulse = 0.8 + Math.sin(now / 300) * 0.2;
        const grad = ctx.createRadialGradient(p0.x, p0.y, 2, p0.x, p0.y, 34 * pulse);
        grad.addColorStop(0, 'rgba(120,255,160,0.55)');
        grad.addColorStop(1, 'rgba(120,255,160,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p0.x, p0.y, 34 * pulse, 0, Math.PI * 2); ctx.fill();
      } else if (spikeImg) {
        const sw = 30, sh = sw * (spikeImg.height / spikeImg.width);
        ctx.save();
        ctx.filter = 'sepia(1) saturate(4) hue-rotate(-40deg) brightness(0.75)';
        for (const off of [-14, 0, 14]) {
          const sx = p0.x + nx * off, sy = p0.y + ny * off;
          ctx.drawImage(spikeImg, 0, 0, spikeImg.width, spikeImg.height, sx - sw / 2, sy - sh * 0.85, sw, sh);
        }
        ctx.restore();
      }
    });
    ctx.restore();
  }

  _drawObstacleItem(ctx, ob, ui = {}) {
    const img = AssetLoader.getImage(ob.img);
    const hovered = ui.hoverX != null && Math.hypot(ui.hoverX - ob.x, ui.hoverY - ob.y) <= ob.radius + 8;
    const affordable = (ui.gold || 0) >= ob.cost;

    ctx.save();
    if (img) {
      ctx.save();
      // Nhà hoang dùng lại đúng bộ lọc "cũ kỹ" của generateVillage cho khớp tông;
      // đá/bụi giữ nguyên màu gốc. Neo ĐÁY sprite vào ob.y (giống mọi decor khác
      // trong file) — bắt buộc vì nhà cao gấp rưỡi chiều rộng (sw:128 sh:192),
      // neo giữa như đá/bụi sẽ khiến nửa nhà chìm xuống đất.
      const filters = [];
      if (ob.kind === 'house') filters.push(HOUSE_DECOR_FILTER);
      if (hovered) filters.push('brightness(1.25)');
      ctx.filter = filters.length ? filters.join(' ') : 'none';
      ctx.drawImage(img, 0, 0, ob.sw, ob.sh, ob.x - ob.dw / 2, ob.y - ob.dh, ob.dw, ob.dh);
      ctx.restore();
    }

    // CHỈ hiện thẻ dọn dẹp (🔨 Dọn: 40g) KHI RÊ CHUỘT VÀO vật cản — để map không bị rối mắt
    if (hovered) {
      const label = `🔨 Dọn: ${ob.cost}g`;
      ctx.font = 'bold 11px sans-serif';
      const w = ctx.measureText(label).width + 14;
      const ly = ob.y - ob.dh - 10;
      
      ctx.fillStyle = affordable ? 'rgba(32,18,10,0.94)' : 'rgba(50,14,10,0.94)';
      ctx.beginPath(); ctx.roundRect(ob.x - w / 2, ly - 9, w, 18, 5); ctx.fill();
      ctx.strokeStyle = affordable ? '#ffdc78' : '#ff9a8a';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = affordable ? '#ffdc78' : '#ff9a8a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, ob.x, ly);
    }
    
    ctx.restore();
  }
}

// Factory dựng 1 map: nhận waypoint GỐC (góc vuông, dễ đọc/sửa toạ độ), tự động
// làm cong path, rải cụm ô đặt tháp, rải decor lấp khoảng trống (né path + né ô
// đặt tháp) — tránh phải lặp lại path 2-3 lần thủ công như cách cũ.
function defineMap(o) {
  const paths = o.rawPaths.map(rp => smoothPath(rp));
  // Hình dạng đảo sinh TRƯỚC trang trí, để mọi thứ (cây, nhà, điểm nhấn) chỉ được đặt
  // trên phần đất thật — nếu không sẽ có cây/nhà mọc lơ lửng giữa mặt nước ở các khúc
  // bờ biển vừa bị "gặm" cho lởm chởm. Map có hầm bí mật: `paths` KHÔNG còn tới được
  // khu vực thành thật/đoạn đường ra hầm nữa (path gốc dừng ở miệng hầm) — phải cộng
  // thêm `tunnelExitPath` vào danh sách chỉ để tính khoá đất, nếu không đảo sẽ bị gặm
  // trống ngay dưới chân đoạn đường + toà thành đó.
  const islandLockPaths = o.tunnelExitPath ? [...paths, smoothPath(o.tunnelExitPath)] : paths;
  const islandMask = generateIslandMask(islandLockPaths, o.seed + 4300);
  const isLand = (x, y) => maskIsLand(islandMask, x, y);
  const decorations = [
    // `decorPool` (tuỳ chọn) chỉ đổi bộ trang trí RẢI GIỮA BÃI TRỐNG của riêng map đó;
    // viền rừng quanh mép map + đá viền đường đi nằm ở hàm khác nên không bị ảnh hưởng.
    ...scatterDecorations(paths, o.seed, { count: o.decorCount, sheepCount: o.sheepCount, pool: o.decorPool, isLand }),
    ...generateForestBorder(paths, o.seed + 9000, islandMask),
    ...(o.village === false ? [] : generateVillage(paths, [], o.seed + 9500, { isLand })),
    ...generateLandmark(paths, o.seed + 9800, { isLand }),
    ...(o.extraDecor || []),
  ];
  // Né khu spawn quái + khu thành khi rải vật cản (paths[i][0]/[cuối] xấp xỉ đúng vị
  // trí 2 khu đó — castlePos thật kẹp lại chút ít nhưng bán kính né 150 đã đủ dư).
  const obstacleAvoid = [];
  paths.forEach(p => {
    obstacleAvoid.push({ x: p[0].x, y: p[0].y, r: 130 });
    obstacleAvoid.push({ x: p[p.length - 1].x, y: p[p.length - 1].y, r: 150 });
  });
  // Map có hầm bí mật (castleOverride khác điểm cuối path[0]): né thêm khu thành thật
  // + đoạn đường ra hầm dùng chung, vì obstacleAvoid ở trên chỉ tính theo path gốc.
  if (o.castleOverride) obstacleAvoid.push({ x: o.castleOverride.x, y: o.castleOverride.y, r: 150 });
  if (o.tunnelExitPath) obstacleAvoid.push({ x: o.tunnelExitPath[0].x, y: o.tunnelExitPath[0].y, r: 90 });
  const obstacles = o.obstacles === false ? [] : generateObstacles(paths, o.seed + 9600, {
    count: o.obstacleCount, isLand, avoidPoints: obstacleAvoid,
  });
  return new GameMap({
    id: o.id, name: o.name, theme: o.theme, season: o.season, difficulty: o.difficulty,
    paths, decorations, islandMask, obstacles,
    volcanic: !!o.volcanic,
    lavaCracks: o.volcanic ? generateLavaCracks(paths, o.seed + 9900) : null,
    castleOverride: o.castleOverride || null,
    tunnels: o.tunnels || null,
    tunnelExitPath: o.tunnelExitPath || null,
    // `o.pathPattern` (tuỳ chọn): map nhiều đường muốn CHỈ 1 đường "mở" mỗi wave —
    // mảng chỉ số path theo từng wave (lặp vòng nếu totalWaves > length), đường
    // còn lại bị chặn (xem drawPathGates). Không set = mọi đường luôn mở như cũ.
    pathPattern: o.pathPattern || null,
    // `o.waves` (tuỳ chọn): cho map tự viết wave thủ công thay vì dùng generator
    // chung — CHỈ dùng khi map cần điều phối nhiều hướng cụ thể (path 0/1/2...)
    // theo ý đồ riêng, generateWaves() mặc định vẫn giữ nguyên cho mọi map khác.
    // Từ map 2 (id>=1) trở đi: chèn thêm cơ chế Phân Thân vào random 1 số wave
    // (xem injectSplitterWaves) — áp dụng SAU CÙNG, bất kể wave tự sinh hay viết tay.
    // Map 1 (id0) CHỪA RIÊNG làm màn "học nghề", không có Phân Thân.
    waves: (() => {
      const base = o.waves || generateWaves(o.totalWaves, { pathCount: o.rawPaths.length, bossType: o.bossType });
      return o.id >= 1 ? injectSplitterWaves(base, o.seed, BOSS_MAP_IDS.has(o.id)) : base;
    })(),
  });
}

// 4 map "chốt mùa" (map thứ 4 mỗi mùa: 4/8/12/16, xem bossType ở từng defineMap) —
// có boss riêng theo mùa nên Phân Thân cũng dồn dập hơn hẳn map thường cho tương xứng.
const BOSS_MAP_IDS = new Set([3, 7, 11, 15]);

// Từ map 2 trở đi: 1 số wave GIỮA (không phải wave đầu làm quen, không phải wave
// cuối vốn đã có boss riêng) ngẫu nhiên có thêm quái "Phân Thân" — quái to, đi nửa
// đường sẽ tự tách thành 3 quái nhỏ toả 3 hướng (xem enemy.js:_split). Map boss
// (`boosted`) tăng cả xác suất dính wave lẫn số splitter/wave đó. Dùng RNG SEED
// RIÊNG (không phải Math.random thô) để mỗi map cố định luôn có đúng những wave
// nào có Phân Thân, không đổi lung tung mỗi lần tải lại trang.
function injectSplitterWaves(waves, seed, boosted) {
  const rng = mulberry32((seed || 0) + 9700);
  const chance = boosted ? 0.65 : 0.4;
  const count = boosted ? 2 : 1;
  return waves.map((group, i) => {
    if (i === 0 || i === waves.length - 1 || rng() > chance) return group;
    const anyEntry = group[0];
    return [...group, { type: 'splitter', count, interval: 1, delay: 0.6, path: anyEntry ? anyEntry.path : 0 }];
  });
}

// Sinh danh sách wave dạng data {type,count,interval,delay,path}, độ khó tăng dần,
// wave cuối luôn có boss (loại boss tuỳ `bossType`, mặc định boss dùng chung cũ).
// Khi pathCount=2: nhóm fast/flying tách sang path 1 để tạo 2 hướng tấn công khác kiểu.
function generateWaves(totalWaves, opts = {}) {
  const pathCount = opts.pathCount || 1;
  const bossType = opts.bossType || 'boss';
  const secondaryPath = pathCount > 1 ? 1 : 0;
  const waves = [];
  for (let i = 0; i < totalWaves; i++) {
    const n = i + 1;
    const group = [];
    group.push({ type: 'normal', count: 5 + Math.floor(n * 1.4), interval: 0.85, delay: 0, path: 0 });
    if (n >= 2) group.push({ type: 'fast', count: 3 + Math.floor(n * 0.7), interval: 0.45, delay: 1.4, path: secondaryPath });
    if (n >= 4) group.push({ type: 'tank', count: 2 + Math.floor(n * 0.35), interval: 1.3, delay: 2.2, path: 0 });
    if (n >= 5) group.push({ type: 'flying', count: 2 + Math.floor(n * 0.4), interval: 0.9, delay: 3.2, path: secondaryPath });
    if (n === totalWaves) group.push({ type: bossType, count: 1, interval: 1, delay: 1.5, path: 0 });
    waves.push(group);
  }
  return waves;
}

// Wave riêng cho Map 12 (id 11) — 20 wave, quái đông + trâu hơn mặt bằng chung
// (đếm/wave cao hơn generateWaves(), nhịp bắn dồn dập hơn), có dùng cổng dịch
// chuyển màu (path0 xuyên qua tunnelIndex 0, path1 qua tunnelIndex 1) xen kẽ chứ
// không phải wave nào cũng bắt chui cổng. Wave 15 là màn "dồn boss": cả 3 loại
// boss mùa khác (Hạ/Thu/Đông — trừ Xuân) đổ bộ cùng lúc; wave 20 là chung kết.
function buildMap12Waves() {
  const waves = [];
  const tunnelWaves = new Set([2, 5, 8, 11, 14, 17]);
  for (let i = 0; i < 20; i++) {
    const n = i + 1;
    if (i === 14) {
      waves.push([
        { type: 'fast',       count: 10, interval: 0.3, delay: 0,   path: 0 },
        { type: 'fast',       count: 10, interval: 0.3, delay: 0,   path: 1 },
        { type: 'tank',       count: 6,  interval: 0.8, delay: 0.5, path: 0 },
        { type: 'tank',       count: 6,  interval: 0.8, delay: 0.5, path: 1 },
        { type: 'bossSummer', count: 1,  interval: 1,   delay: 1,   path: 0 },
        { type: 'bossAutumn', count: 1,  interval: 1,   delay: 3,   path: 1 },
        { type: 'bossWinter', count: 1,  interval: 1,   delay: 5,   path: 0 },
      ]);
      continue;
    }
    if (i === 19) {
      waves.push([
        { type: 'normal',     count: 20, interval: 0.3, delay: 0, path: 0 },
        { type: 'normal',     count: 20, interval: 0.3, delay: 0, path: 1 },
        { type: 'tank',       count: 10, interval: 0.6, delay: 1, path: 0 },
        { type: 'flying',     count: 10, interval: 0.5, delay: 1, path: 1 },
        { type: 'bossAutumn', count: 1,  interval: 1,   delay: 4, path: 0 },
      ]);
      continue;
    }
    const flip = i % 2; // đổi bên path chính mỗi wave cho đỡ nhàm, cả 2 bên đều ăn đủ áp lực
    const group = [
      { type: 'normal', count: 6 + Math.floor(n * 1.6), interval: 0.5,  delay: 0,   path: 0 },
      { type: 'normal', count: 6 + Math.floor(n * 1.4), interval: 0.5,  delay: 0.2, path: 1 },
    ];
    if (n >= 2) group.push({ type: 'fast',   count: 4 + Math.floor(n * 0.9), interval: 0.3,  delay: 0.7, path: flip });
    if (n >= 4) group.push({ type: 'tank',   count: 2 + Math.floor(n * 0.5), interval: 0.85, delay: 1.1, path: 1 - flip });
    if (n >= 6) group.push({ type: 'flying', count: 2 + Math.floor(n * 0.5), interval: 0.6,  delay: 1.4, path: flip });
    if (tunnelWaves.has(i)) {
      const g0 = group.find(g => g.path === 0);
      const g1 = group.find(g => g.path === 1 && g !== g0);
      if (g0) g0.tunnelIndex = 0;
      if (g1) g1.tunnelIndex = 1;
    }
    waves.push(group);
  }
  return waves;
}

// Wave dùng chung cho map 13/14/15 (id 12/13/14) — nhiều hướng quái hội tụ về
// đúng 1 cổng thành (pathCount tuỳ map, KHÔNG cố định 3 — mỗi map có số hướng và
// hình dạng riêng), độ khó tăng dần theo n=waveIndex+1, path phụ (fast/tank/
// flying) xoay vòng qua từng hướng cho đỡ đoán trước được. `tunnelPlan` (tuỳ
// chọn): mảng {wave, path, tunnelIndex} gắn cổng dịch chuyển (tái dùng cơ chế
// tunnels từ Map 9/10/12) vào đúng wave/path đó — không phải wave nào cũng ép
// chui cổng.
function buildConvergedWaves(pathCount, totalWaves, bossType, tunnelPlan) {
  const waves = [];
  const plan = tunnelPlan || [];
  for (let i = 0; i < totalWaves; i++) {
    const n = i + 1;
    const group = [];
    for (let p = 0; p < pathCount; p++) {
      if (n < p + 1) continue; // hướng thứ p+1 chỉ mở dần từ wave p+1 trở đi
      group.push({ type: 'normal', count: 6 + Math.floor(n * 1.2) - p, interval: 0.55, delay: p * 0.2, path: p });
    }
    if (n >= 3) group.push({ type: 'fast',   count: 4 + Math.floor(n * 0.6), interval: 0.35, delay: 0.8, path: n % pathCount });
    if (n >= 5) group.push({ type: 'tank',   count: 2 + Math.floor(n * 0.4), interval: 0.9,  delay: 1.2, path: (n + 1) % pathCount });
    if (n >= 7) group.push({ type: 'flying', count: 2 + Math.floor(n * 0.4), interval: 0.65, delay: 1.5, path: (n + 2) % pathCount });
    if (n === totalWaves) group.push({ type: bossType, count: 1, interval: 1, delay: 3, path: 0 });
    for (const p of plan) {
      if (p.wave !== i) continue;
      const g = group.find(gr => gr.path === p.path && gr.type === 'normal');
      if (g) g.tunnelIndex = p.tunnelIndex;
    }
    waves.push(group);
  }
  return waves;
}

const MAPS = [
  // ================= XUÂN (SPRING) =================
  defineMap({
    // ---- GIAI ĐOẠN 1: TÂN THỦ (map 1-4) — đường đơn tuyến, KHÔNG nhánh rẽ, quái đi
    // một mạch từ đầu này sang đầu kia, cho người chơi mới làm quen dần. ----
    id: 0, name: 'Thung Lũng Hoa Đào', theme: 'spring', season: 'spring', difficulty: 1.00,
    // Map 1: Tây → thành bên PHẢI (Đông), hình chữ Z (thanh ngang trên, chéo xuống,
    // thanh ngang dưới) — ngoằn ngoèo hơn hẳn đường thẳng cũ mà vẫn dễ đọc cho tân thủ.
    rawPaths: [[
      { x: -20, y: 130 }, { x: 720, y: 130 }, { x: 720, y: 300 }, { x: 220, y: 300 }, { x: 220, y: 470 }, { x: 980, y: 470 },
    ]],
    seed: 3001, decorCount: 40, sheepCount: 3, totalWaves: 6, obstacleCount: 4,
  }),

  defineMap({
    id: 1, name: 'Rừng Anh Đào', theme: 'spring', season: 'spring', difficulty: 1.10,
    // Map 2: Nam → thành bên TRÊN (Bắc), hình chữ M (lên-xuống-lên-xuống-lên) — 2
    // đỉnh rõ rệt, mỗi đỉnh là 1 chỗ đặt cụm tháp tốt.
    rawPaths: [[
      { x: 150, y: 620 }, { x: 150, y: 130 }, { x: 480, y: 130 }, { x: 480, y: 440 }, { x: 810, y: 440 }, { x: 810, y: -20 },
    ]],
    seed: 3002, decorCount: 44, sheepCount: 2, totalWaves: 8, obstacleCount: 5,
  }),

  defineMap({
    id: 2, name: 'Vườn Xuân Bí Ẩn', theme: 'spring', season: 'spring', difficulty: 1.20,
    // Map 3: Bắc → thành bên DƯỚI (Nam), hình chữ Z (xuống-ngang-lên-ngang-xuống).
    // Bản cũ đoạn cuối "lên rồi vòng xuống thành" dùng LẠI đúng x=800 nên quái đi
    // lên rồi quay đầu đi ngược lại xuống đè khít lên đúng đoạn vừa đi qua — nhìn
    // như đường cụt/lỗi. Giữ NGUYÊN điểm ra quân (150,-20) và cổng thành (800,620),
    // chỉ chêm 1 đoạn ngang ở giữa (x: 500) để đường lên/xuống nằm ở 2 cột khác
    // nhau, không còn chồng lấn — vẫn giữ đúng ý đồ "bụng giữa map" cho tháp tầm xa.
    rawPaths: [[
      { x: 150, y: -20 }, { x: 150, y: 420 }, { x: 500, y: 420 }, { x: 500, y: 180 }, { x: 800, y: 180 }, { x: 800, y: 620 },
    ]],
    seed: 3003, decorCount: 46, sheepCount: 2, totalWaves: 10, obstacleCount: 5,
  }),

  defineMap({
    id: 3, name: 'Đền Thờ Cổ Thụ', theme: 'spring', season: 'spring', difficulty: 1.40,
    // Map 4: CHỐT Giai đoạn 1, khó hơn 1 bậc — 2 hướng cùng lúc (Bắc đổ xuống + Đông
    // đánh ngang) hội tụ về thành bên TRÁI (Tây). Vẫn giữ boss cuối mùa Xuân.
    rawPaths: [
      [{ x: 520, y: -20 }, { x: 520, y: 300 }, { x: -20, y: 300 }],
      [{ x: 980, y: 460 }, { x: 600, y: 460 }, { x: 600, y: 300 }, { x: -20, y: 300 }],
    ],
    seed: 3004, decorCount: 40, sheepCount: 1, totalWaves: 12, bossType: 'bossSpring', obstacleCount: 5,
    extraDecor: [
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 90, y: 200, dw: 30, dh: 60 },
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 90, y: 400, dw: 30, dh: 60 },
    ],
  }),

  // ================= HẠ (SUMMER) — GIAI ĐOẠN 2: HỢP LƯU ÁC MỘNG =================
  // Quái ra từ NHIỀU cổng, chia nhánh rồi lại hợp lại thành những "nút thắt" tử
  // thần. Cả 4 map đều viết `waves` thủ công (không dùng generateWaves() chung) để
  // chủ động điều phối hướng tấn công theo đúng thiết kế.
  defineMap({
    id: 4, name: 'Bờ Biển Nắng Cháy', theme: 'summer', season: 'summer', difficulty: 1.40,
    // Map 5: Bắc & Nam hợp lại thành 1 (hình chữ Y) rồi đánh thẳng vào thành Đông —
    // dồn hoả lực + tháp làm chậm ngay tại ngã ba hợp lưu (450,300).
    rawPaths: [
      [{ x: 350, y: -20 }, { x: 350, y: 300 }, { x: 980, y: 300 }],
      [{ x: 350, y: 620 }, { x: 350, y: 300 }, { x: 980, y: 300 }],
    ],
    seed: 3005, decorCount: 38, sheepCount: 4, obstacleCount: 6,
    waves: [
      [{ type: 'normal', count: 7, interval: 0.85, delay: 0, path: 0 }],
      [
        { type: 'normal', count: 7, interval: 0.8,  delay: 0,   path: 0 },
        { type: 'fast',   count: 4, interval: 0.5,  delay: 1.2, path: 1 },
      ],
      [
        { type: 'normal', count: 6, interval: 0.8,  delay: 0, path: 1 },
        { type: 'fast',   count: 5, interval: 0.45, delay: 1, path: 0 },
      ],
      [
        { type: 'tank',   count: 3, interval: 1.3, delay: 0,   path: 0 },
        { type: 'normal', count: 7, interval: 0.7, delay: 0.5, path: 1 },
      ],
      [
        { type: 'fast', count: 6, interval: 0.4, delay: 0, path: 0 },
        { type: 'fast', count: 6, interval: 0.4, delay: 0, path: 1 },
      ],
      [
        { type: 'flying', count: 4, interval: 0.9,  delay: 0, path: 0 },
        { type: 'tank',   count: 3, interval: 1.2,  delay: 1, path: 1 },
        { type: 'normal', count: 8, interval: 0.65, delay: 0, path: 0 },
      ],
      [
        { type: 'tank',   count: 4, interval: 1.1,  delay: 0, path: 1 },
        { type: 'flying', count: 4, interval: 0.85, delay: 1, path: 0 },
        { type: 'fast',   count: 6, interval: 0.4,  delay: 0, path: 1 },
      ],
      [
        { type: 'normal', count: 9, interval: 0.6, delay: 0,   path: 0 },
        { type: 'fast',   count: 6, interval: 0.4, delay: 0,   path: 1 },
        { type: 'tank',   count: 4, interval: 1.1, delay: 0,   path: 0 },
        { type: 'flying', count: 4, interval: 0.8, delay: 1.5, path: 0 },
      ],
      [
        { type: 'normal', count: 9, interval: 0.6, delay: 0,   path: 0 },
        { type: 'tank',   count: 4, interval: 1.1, delay: 0,   path: 1 },
        { type: 'flying', count: 4, interval: 0.8, delay: 1.5, path: 0 },
        { type: 'boss',   count: 1, interval: 1,   delay: 3,   path: 1 },
      ],
    ],
  }),

  defineMap({
    id: 5, name: 'Ốc Đảo Sa Mạc', theme: 'summer', season: 'summer', difficulty: 1.55,
    // Map 6: Tây, Bắc, Nam ngoằn ngoèo tụ về 1 cửa ải Đông — tháp giá rẻ rải theo 3
    // luồng để rỉa máu, tháp AoE mạnh nhất đặt ngay cửa ải cuối (600,300)→(980,300).
    rawPaths: [
      [{ x: -20, y: 300 }, { x: 240, y: 300 }, { x: 240, y: 150 }, { x: 600, y: 150 }, { x: 600, y: 300 }, { x: 980, y: 300 }],
      [{ x: 440, y: -20 }, { x: 440, y: 180 }, { x: 760, y: 180 }, { x: 760, y: 300 }, { x: 980, y: 300 }],
      [{ x: 440, y: 620 }, { x: 440, y: 420 }, { x: 760, y: 420 }, { x: 760, y: 300 }, { x: 980, y: 300 }],
    ],
    seed: 3006, decorCount: 44, sheepCount: 1, obstacleCount: 6,
    waves: [
      [{ type: 'normal', count: 7, interval: 0.8, delay: 0, path: 0 }],
      [
        { type: 'normal', count: 7, interval: 0.75, delay: 0, path: 0 },
        { type: 'fast',   count: 4, interval: 0.5,  delay: 1, path: 1 },
      ],
      [
        { type: 'normal', count: 6, interval: 0.75, delay: 0,   path: 1 },
        { type: 'fast',   count: 5, interval: 0.45, delay: 0.8, path: 2 },
      ],
      [
        { type: 'tank',   count: 3, interval: 1.2,  delay: 0,   path: 0 },
        { type: 'normal', count: 7, interval: 0.65, delay: 0.5, path: 2 },
      ],
      [
        { type: 'fast', count: 6, interval: 0.4, delay: 0,   path: 0 },
        { type: 'fast', count: 6, interval: 0.4, delay: 0,   path: 1 },
        { type: 'tank', count: 2, interval: 1.2, delay: 1.5, path: 2 },
      ],
      [
        { type: 'flying', count: 4, interval: 0.85, delay: 0,   path: 2 },
        { type: 'normal', count: 8, interval: 0.6,  delay: 0,   path: 0 },
        { type: 'normal', count: 8, interval: 0.6,  delay: 0.3, path: 1 },
      ],
      [
        { type: 'tank',   count: 4, interval: 1.1,  delay: 0, path: 1 },
        { type: 'flying', count: 5, interval: 0.8,  delay: 1, path: 0 },
        { type: 'fast',   count: 6, interval: 0.4,  delay: 0, path: 2 },
      ],
      [
        { type: 'normal', count: 9, interval: 0.55, delay: 0, path: 0 },
        { type: 'tank',   count: 4, interval: 1.0,  delay: 0, path: 1 },
        { type: 'flying', count: 5, interval: 0.75, delay: 1, path: 2 },
      ],
      [
        { type: 'normal', count: 9, interval: 0.55, delay: 0, path: 0 },
        { type: 'fast',   count: 8, interval: 0.35, delay: 0, path: 1 },
        { type: 'tank',   count: 5, interval: 1.0,  delay: 0, path: 0 },
        { type: 'flying', count: 5, interval: 0.75, delay: 1, path: 2 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.55, delay: 0, path: 0 },
        { type: 'fast',   count: 9,  interval: 0.35, delay: 0, path: 2 },
        { type: 'tank',   count: 5,  interval: 1.0,  delay: 0, path: 2 },
        { type: 'flying', count: 5,  interval: 0.75, delay: 1, path: 0 },
      ],
      [
        { type: 'fast',   count: 9, interval: 0.35, delay: 0, path: 0 },
        { type: 'tank',   count: 6, interval: 1.0,  delay: 0, path: 1 },
        { type: 'flying', count: 6, interval: 0.75, delay: 1, path: 2 },
        { type: 'boss',   count: 1, interval: 1,    delay: 3, path: 1 },
      ],
    ],
  }),

  defineMap({
    id: 6, name: 'Núi Lửa Ngủ Yên', theme: 'summer', season: 'summer', difficulty: 1.70,
    // Map 7: Tây Bắc & Đông Bắc đan chéo hình chữ X, tách ra rồi chụm lại ở thành
    // Nam — tâm chữ X (~480,300) là nơi quái đi ngang qua 2 LẦN từ 2 hướng khác nhau,
    // bố trí "tổ ong" hoả lực đúng chỗ đó.
    // Điểm chụm cuối đường y=580 (KHÔNG phải 620) — khác các điểm spawn ở mép Bắc/Tây/
    // Đông (cố ý đặt ngoài canvas.height=600 cho cảm giác quái ra từ ngoài khung hình),
    // điểm NÀY là toạ độ THÀNH của người chơi (castlePos lấy path[0] điểm cuối) nên
    // phải nằm HẲN trong canvas — để y=620 khiến khúc cua bo tròn cuối đường bị cắt
    // cụt ngoài màn hình (báo lỗi "đường mòn bị tràn/thụt xuống khỏi màn hình").
    rawPaths: [
      [{ x: -20, y: 120 }, { x: 760, y: 120 }, { x: 760, y: 480 }, { x: 480, y: 480 }, { x: 480, y: 580 }],
      [{ x: 980, y: 120 }, { x: 200, y: 120 }, { x: 200, y: 480 }, { x: 480, y: 480 }, { x: 480, y: 580 }],
    ],
    seed: 3007, decorCount: 46, sheepCount: 1, obstacleCount: 6,
    waves: [
      [{ type: 'normal', count: 8, interval: 0.8, delay: 0, path: 0 }],
      [
        { type: 'normal', count: 8, interval: 0.75, delay: 0, path: 1 },
        { type: 'fast',   count: 5, interval: 0.45, delay: 1, path: 0 },
      ],
      [
        { type: 'normal', count: 7, interval: 0.75, delay: 0, path: 0 },
        { type: 'fast',   count: 5, interval: 0.45, delay: 1, path: 1 },
      ],
      [
        { type: 'tank',   count: 4, interval: 1.2,  delay: 0,   path: 1 },
        { type: 'normal', count: 8, interval: 0.65, delay: 0.5, path: 0 },
      ],
      [
        { type: 'fast', count: 7, interval: 0.4, delay: 0, path: 0 },
        { type: 'fast', count: 7, interval: 0.4, delay: 0, path: 1 },
      ],
      [
        { type: 'flying', count: 5, interval: 0.85, delay: 0, path: 0 },
        { type: 'tank',   count: 4, interval: 1.1,  delay: 1, path: 1 },
      ],
      [
        { type: 'tank',   count: 5, interval: 1.05, delay: 0, path: 0 },
        { type: 'flying', count: 5, interval: 0.8,  delay: 1, path: 1 },
        { type: 'fast',   count: 7, interval: 0.35, delay: 0, path: 0 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.55, delay: 0, path: 1 },
        { type: 'tank',   count: 5,  interval: 1.0,  delay: 0, path: 0 },
      ],
      [
        { type: 'fast',   count: 9, interval: 0.35, delay: 0,   path: 0 },
        { type: 'fast',   count: 9, interval: 0.35, delay: 0,   path: 1 },
        { type: 'flying', count: 5, interval: 0.75, delay: 1.5, path: 0 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.5,  delay: 0, path: 0 },
        { type: 'fast',   count: 10, interval: 0.35, delay: 0, path: 0 },
        { type: 'tank',   count: 6,  interval: 0.95, delay: 0, path: 1 },
        { type: 'flying', count: 6,  interval: 0.7,  delay: 0, path: 0 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.5,  delay: 0, path: 1 },
        { type: 'fast',   count: 10, interval: 0.35, delay: 0, path: 1 },
        { type: 'tank',   count: 6,  interval: 0.95, delay: 0, path: 1 },
        { type: 'flying', count: 6,  interval: 0.7,  delay: 0, path: 1 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.5,  delay: 0, path: 0 },
        { type: 'fast',   count: 11, interval: 0.35, delay: 0, path: 0 },
        { type: 'tank',   count: 7,  interval: 0.95, delay: 0, path: 0 },
        { type: 'flying', count: 7,  interval: 0.7,  delay: 0, path: 0 },
      ],
      [
        { type: 'normal', count: 11, interval: 0.5,  delay: 0, path: 1 },
        { type: 'tank',   count: 7,  interval: 0.95, delay: 0, path: 1 },
        { type: 'flying', count: 7,  interval: 0.7,  delay: 0, path: 0 },
        { type: 'boss',   count: 1,  interval: 1,    delay: 3, path: 0 },
      ],
    ],
  }),

  // Map DUY NHẤT dùng chủ đề núi lửa: nền đất cháy ám tro + khe nứt dung nham + tàn
  // lửa bay, trang trí giữa bãi là đá obsidian thay cho cây thông xanh. `season` vẫn là
  // 'summer' để không ảnh hưởng cách nhóm mùa/nhận diện map boss ở màn chọn màn chơi.
  defineMap({
    id: 7, name: 'Miệng Núi Lửa', theme: 'volcano', season: 'summer', difficulty: 1.85,
    volcanic: true, decorPool: VOLCANO_DECOR_POOL,
    // Map 8 — CHỐT Giai đoạn 2 (Boss Hạ): 2 đường lượn sóng mềm mại qua thung lũng núi lửa
    // hội tụ về cổng thành phía Đông, không còn 4 đường đâm thẳng rối mắt.
    rawPaths: [
      [{ x: -20, y: 150 }, { x: 260, y: 150 }, { x: 260, y: 440 }, { x: 680, y: 440 }, { x: 680, y: 270 }, { x: 980, y: 270 }],
      [{ x: -20, y: 450 }, { x: 340, y: 450 }, { x: 340, y: 180 }, { x: 680, y: 180 }, { x: 680, y: 330 }, { x: 980, y: 330 }],
    ],
    seed: 3008, decorCount: 52, sheepCount: 0, bossType: 'bossSummer', obstacleCount: 7,
    extraDecor: [
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 260, y: 280, dw: 30, dh: 60 },
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 680, y: 360, dw: 30, dh: 60 },
    ],
    waves: [
      [{ type: 'normal', count: 8, interval: 0.75, delay: 0, path: 0 }],
      [
        { type: 'normal', count: 8, interval: 0.7,  delay: 0, path: 0 },
        { type: 'fast',   count: 5, interval: 0.45, delay: 1, path: 1 },
      ],
      [
        { type: 'normal', count: 7, interval: 0.7,  delay: 0,   path: 1 },
        { type: 'fast',   count: 5, interval: 0.4,  delay: 0.8, path: 0 },
      ],
      [
        { type: 'tank',   count: 4, interval: 1.1,  delay: 0,   path: 1 },
        { type: 'normal', count: 8, interval: 0.6,  delay: 0.5, path: 0 },
      ],
      [
        { type: 'fast', count: 7, interval: 0.35, delay: 0,   path: 0 },
        { type: 'fast', count: 7, interval: 0.35, delay: 0,   path: 1 },
        { type: 'tank', count: 3, interval: 1.1,  delay: 1.5, path: 1 },
      ],
      [
        { type: 'flying', count: 5, interval: 0.8,  delay: 0,   path: 0 },
        { type: 'normal', count: 9, interval: 0.55, delay: 0,   path: 0 },
        { type: 'normal', count: 9, interval: 0.55, delay: 0.3, path: 1 },
      ],
      [
        { type: 'tank',   count: 5, interval: 1.0,  delay: 0, path: 1 },
        { type: 'flying', count: 6, interval: 0.75, delay: 1, path: 0 },
        { type: 'fast',   count: 8, interval: 0.35, delay: 0, path: 0 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.5,  delay: 0, path: 0 },
        { type: 'tank',   count: 5,  interval: 1.0,  delay: 0, path: 1 },
        { type: 'flying', count: 6,  interval: 0.7,  delay: 1, path: 1 },
      ],
      [
        { type: 'fast',   count: 9, interval: 0.3,  delay: 0,   path: 0 },
        { type: 'fast',   count: 9, interval: 0.3,  delay: 0,   path: 0 },
        { type: 'tank',   count: 5, interval: 0.95, delay: 1.5, path: 1 },
        { type: 'flying', count: 6, interval: 0.7,  delay: 0,   path: 1 },
      ],
      [
        { type: 'tank',   count: 6,  interval: 0.9, delay: 0, path: 0 },
        { type: 'tank',   count: 6,  interval: 0.9, delay: 0, path: 0 },
        { type: 'normal', count: 11, interval: 0.5, delay: 0, path: 1 },
        { type: 'flying', count: 7,  interval: 0.65, delay: 1, path: 1 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.5,  delay: 0, path: 0 },
        { type: 'fast',   count: 10, interval: 0.3,  delay: 0, path: 1 },
        { type: 'tank',   count: 6,  interval: 0.9,  delay: 0, path: 1 },
        { type: 'flying', count: 6,  interval: 0.65, delay: 0.5, path: 0 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.5,  delay: 0, path: 0 },
        { type: 'fast',   count: 11, interval: 0.3,  delay: 0, path: 0 },
        { type: 'tank',   count: 6,  interval: 0.9,  delay: 0, path: 1 },
        { type: 'flying', count: 6,  interval: 0.65, delay: 0.5, path: 0 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.5,  delay: 0, path: 1 },
        { type: 'fast',   count: 11, interval: 0.3,  delay: 0, path: 0 },
        { type: 'tank',   count: 7,  interval: 0.9,  delay: 0, path: 1 },
        { type: 'flying', count: 6,  interval: 0.65, delay: 0.5, path: 1 },
      ],
      [
        { type: 'normal', count: 11, interval: 0.5,  delay: 0, path: 0 },
        { type: 'fast',   count: 12, interval: 0.3,  delay: 0, path: 1 },
        { type: 'tank',   count: 7,  interval: 0.9,  delay: 0, path: 1 },
        { type: 'flying', count: 7,  interval: 0.65, delay: 0.5, path: 1 },
      ],
      [
        { type: 'normal', count: 11, interval: 0.5,  delay: 0, path: 0 },
        { type: 'fast',   count: 12, interval: 0.3,  delay: 0, path: 0 },
        { type: 'tank',   count: 7,  interval: 0.9,  delay: 0, path: 1 },
        { type: 'flying', count: 7,  interval: 0.65, delay: 0.5, path: 1 },
      ],
      [
        { type: 'normal', count: 11, interval: 0.5,  delay: 0, path: 1 },
        { type: 'fast',   count: 13, interval: 0.3,  delay: 0, path: 0 },
        { type: 'tank',   count: 7,  interval: 0.9,  delay: 0, path: 0 },
        { type: 'flying', count: 7,  interval: 0.65, delay: 0.5, path: 1 },
      ],
      [
        { type: 'normal', count: 11, interval: 0.5,  delay: 0, path: 0 },
        { type: 'fast',   count: 14, interval: 0.3,  delay: 0, path: 0 },
        { type: 'tank',   count: 8,  interval: 0.9,  delay: 0, path: 0 },
        { type: 'flying', count: 7,  interval: 0.65, delay: 0.5, path: 0 },
      ],
      [
        { type: 'normal', count: 11, interval: 0.5,  delay: 0, path: 1 },
        { type: 'fast',   count: 14, interval: 0.3,  delay: 0, path: 1 },
        { type: 'tank',   count: 8,  interval: 0.9,  delay: 0, path: 0 },
        { type: 'flying', count: 7,  interval: 0.65, delay: 0.5, path: 0 },
      ],
      [
        { type: 'normal', count: 12, interval: 0.5,  delay: 0, path: 0 },
        { type: 'fast',   count: 15, interval: 0.3,  delay: 0, path: 0 },
        { type: 'tank',   count: 8,  interval: 0.9,  delay: 0, path: 1 },
        { type: 'flying', count: 8,  interval: 0.65, delay: 0.5, path: 1 },
      ],
      [
        { type: 'normal', count: 12, interval: 0.5,  delay: 0,   path: 0 },
        { type: 'tank',   count: 9,  interval: 0.9,  delay: 0,   path: 0 },
        { type: 'flying', count: 8,  interval: 0.65, delay: 0.5, path: 1 },
        { type: 'bossSummer', count: 1, interval: 1, delay: 3,   path: 0 },
      ],
    ],
  }),

  // ================= THU (AUTUMN) — GIAI ĐOẠN 3: ĐỊA NGỤC ĐẶC THÙ =================
  // Map 9: ĐƯỜNG HẦM BÍ MẬT — 3 cửa hầm rải khắp map (mỗi cửa cuối 1 trong 3 nhánh
  // Tây/Bắc/Nam), quái bước vào là BIẾN MẤT (vô hình, không bắn trúng được — xem
  // enemy.js: hidden/tunnelTimer) rồi "chui lên" cùng 1 chỗ NGAY SÁT THÀNH sau ~0.55s.
  // Một đường đi DUY NHẤT, liền mạch từ tây sang đông, gấp khúc kiểu zigzag như
  // mỏ khai thác trong núi tuyết. Mỗi miệng hầm mỏ (asset goldMine) được đặt NGAY
  // TẠI một khúc cua và dịch chuyển thẳng sang khúc cua kế tiếp (bỏ qua đúng 1 khúc
  // cua ở giữa) — giống mấy toa xe mỏ chạy tắt giữa các đoạn ngoặt trong hầm mỏ,
  // không dịch xa lung tung. Chỉ nhóm quái được gán tunnelIndex mới chui hầm.
  // Miệng hầm luôn cách xa cổng thành (cổng ở tận cuối path, idx 9).
  defineMap({
    id: 8, name: 'Rừng Lá Đỏ', theme: 'autumn', season: 'autumn', difficulty: 1.95,
    rawPaths: [
      [
        { x: -20, y: 150 }, { x: 250, y: 150 }, { x: 250, y: 350 }, { x: 400, y: 350 }, // 0-3
        { x: 400, y: 150 }, { x: 600, y: 150 }, { x: 600, y: 400 }, { x: 750, y: 400 }, // 4-7
        { x: 750, y: 200 }, { x: 980, y: 200 },                                          // 8-9 (cổng thành)
      ],
    ],
    tunnels: [
      { x: 250, y: 150, exitX: 400, exitY: 350, r: 24 }, // hầm A: idx1 -> idx3 (bỏ qua khúc cua idx2)
      { x: 400, y: 150, exitX: 600, exitY: 400, r: 24 }, // hầm B: idx4 -> idx6 (bỏ qua khúc cua idx5)
      { x: 600, y: 400, exitX: 750, exitY: 200, r: 24 }, // hầm C: idx6 -> idx8 (bỏ qua khúc cua idx7)
    ],
    // Địa hình phong phú hơn: nhiều cây/đá/bụi rải rác hơn để đỡ đơn điệu.
    seed: 3009, decorCount: 62, sheepCount: 2, obstacleCount: 10,
    waves: [
      [{ type: 'normal', count: 7, interval: 0.8, delay: 0, path: 0 }],
      [{ type: 'normal', count: 9, interval: 0.7, delay: 0, path: 0 }],
      [
        { type: 'normal', count: 6, interval: 0.75, delay: 0,   path: 0 },
        { type: 'fast',   count: 5, interval: 0.45, delay: 0.8, path: 0, tunnelIndex: 0 },
      ],
      [
        { type: 'tank',   count: 3, interval: 1.2,  delay: 0,   path: 0 },
        { type: 'normal', count: 7, interval: 0.65, delay: 0.5, path: 0 },
      ],
      [
        { type: 'fast', count: 6, interval: 0.4, delay: 0,   path: 0 },
        { type: 'fast', count: 6, interval: 0.4, delay: 0,   path: 0, tunnelIndex: 1 },
      ],
      [
        { type: 'tank',   count: 4, interval: 1.1,  delay: 0, path: 0 },
        { type: 'flying', count: 5, interval: 0.8,  delay: 1, path: 0 },
        { type: 'fast',   count: 6, interval: 0.4,  delay: 0, path: 0, tunnelIndex: 2 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.5, delay: 0, path: 0 },
        { type: 'tank',   count: 4, interval: 1.0,  delay: 0, path: 0 },
      ],
      [
        { type: 'fast',   count: 8, interval: 0.35, delay: 0, path: 0, tunnelIndex: 0 },
        { type: 'flying', count: 5, interval: 0.75, delay: 1, path: 0 },
      ],
      [
        { type: 'fast',   count: 9, interval: 0.35, delay: 0,   path: 0, tunnelIndex: 1 },
        { type: 'flying', count: 6, interval: 0.6,  delay: 0.5, path: 0 },
        { type: 'tank',   count: 4, interval: 1.0,  delay: 1,   path: 0 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.4, delay: 0, path: 0 },
        { type: 'fast',   count: 8,  interval: 0.35,delay: 0, path: 0, tunnelIndex: 2 },
        { type: 'tank',   count: 5,  interval: 0.9, delay: 1, path: 0 },
      ],
      [
        { type: 'flying', count: 7, interval: 0.55, delay: 0, path: 0 },
        { type: 'tank',   count: 6, interval: 0.85, delay: 0, path: 0 },
        { type: 'fast',   count: 8, interval: 0.3,  delay: 1, path: 0, tunnelIndex: 0 },
      ],
      [
        { type: 'fast',   count: 8, interval: 0.35, delay: 0, path: 0 },
        { type: 'tank',   count: 5, interval: 1.0,  delay: 0, path: 0, tunnelIndex: 1 },
        { type: 'flying', count: 5, interval: 0.75, delay: 1, path: 0 },
        { type: 'boss',   count: 1, interval: 1,    delay: 3, path: 0 },
      ],
    ],
  }),

  // Map 10 — Cổng dịch chuyển đa sắc: mỗi đường (path 0 & path 1) chỉ còn ĐÚNG 1
  // cổng phép màu riêng (xanh dương cho path 0, xanh lá cho path 1) => tổng cộng 4
  // miệng cổng trên toàn map (2 cổng x cửa vào + cửa ra), đỡ rối mắt hơn bản trước.
  // Mỗi cổng nối 1 khúc cua sang khúc cua kế tiếp TRÊN CHÍNH đường đó (giống lối
  // chơi ở Map 9). Không phải wave nào cũng dùng cổng. Thành dời xuống góc dưới
  // bên phải (900,520) — cả 2 đường cùng đổ dốc xuống-phải rồi mới gặp cổng thành,
  // và cổng dịch chuyển vẫn nằm ở giữa map nên luôn cách xa cổng thành.
  defineMap({
    id: 9, name: 'Đầm Lầy Sương Mù', theme: 'autumn', season: 'autumn', difficulty: 2.10,
    rawPaths: [
      [{ x: -20, y: 110 }, { x: 160, y: 110 }, { x: 160, y: 300 }, { x: 320, y: 300 }, { x: 320, y: 110 }, { x: 480, y: 110 }, { x: 480, y: 310 }, { x: 640, y: 310 }, { x: 640, y: 150 }, { x: 800, y: 150 }, { x: 800, y: 520 }, { x: 900, y: 520 }],
      [{ x: -20, y: 480 }, { x: 200, y: 480 }, { x: 200, y: 290 }, { x: 360, y: 290 }, { x: 360, y: 480 }, { x: 520, y: 480 }, { x: 520, y: 270 }, { x: 700, y: 270 }, { x: 700, y: 440 }, { x: 860, y: 440 }, { x: 860, y: 520 }, { x: 900, y: 520 }],
    ],
    tunnels: [
      { x: 160, y: 300, exitX: 320, exitY: 110, r: 22 }, // 0 hầm mỏ (path0, idx2->idx4)
      { x: 200, y: 290, exitX: 360, exitY: 480, r: 22 }, // 1 hầm mỏ (path1, idx2->idx4)
    ],
    seed: 3010, decorCount: 46, sheepCount: 0, obstacleCount: 7,
    waves: [
      [{ type: 'normal', count: 8,  interval: 0.8,  delay: 0,   path: 0 }],
      [
        { type: 'normal', count: 9,  interval: 0.7,  delay: 0,   path: 1 },
        { type: 'fast',   count: 5,  interval: 0.5,  delay: 1.2, path: 0, tunnelIndex: 0 },
      ],
      [
        { type: 'normal', count: 8,  interval: 0.65, delay: 0,   path: 0 },
        { type: 'fast',   count: 6,  interval: 0.45, delay: 0.8, path: 1 },
      ],
      [
        { type: 'tank',   count: 4,  interval: 1.2,  delay: 0,   path: 0 },
        { type: 'normal', count: 8,  interval: 0.6,  delay: 0.5, path: 1, tunnelIndex: 1 },
      ],
      [
        { type: 'fast',   count: 7,  interval: 0.4,  delay: 0,   path: 0 },
        { type: 'fast',   count: 7,  interval: 0.4,  delay: 0,   path: 1 },
        { type: 'tank',   count: 3,  interval: 1.1,  delay: 1.5, path: 0 },
      ],
      [
        { type: 'flying', count: 5,  interval: 0.85, delay: 0,   path: 1 },
        { type: 'normal', count: 10, interval: 0.55, delay: 0,   path: 0 },
      ],
      [
        { type: 'tank',   count: 5,  interval: 1.1,  delay: 0,   path: 1 },
        { type: 'flying', count: 5,  interval: 0.8,  delay: 1,   path: 0 },
        { type: 'fast',   count: 7,  interval: 0.4,  delay: 0,   path: 1, tunnelIndex: 1 },
      ],
      [
        { type: 'normal', count: 11, interval: 0.5,  delay: 0,   path: 0, tunnelIndex: 0 },
        { type: 'tank',   count: 5,  interval: 1.0,  delay: 0,   path: 1 },
        { type: 'flying', count: 6,  interval: 0.75, delay: 1,   path: 0 },
      ],
      [
        { type: 'fast',   count: 9,  interval: 0.35, delay: 0,   path: 1, tunnelIndex: 1 },
        { type: 'tank',   count: 6,  interval: 0.95, delay: 0,   path: 0 },
        { type: 'flying', count: 6,  interval: 0.7,  delay: 1,   path: 1 },
      ],
      [
        { type: 'normal', count: 12, interval: 0.5,  delay: 0,   path: 0 },
        { type: 'fast',   count: 9,  interval: 0.35, delay: 0,   path: 0, tunnelIndex: 0 },
        { type: 'tank',   count: 6,  interval: 1.0,  delay: 0,   path: 0 },
        { type: 'flying', count: 6,  interval: 0.75, delay: 1,   path: 1 },
      ],
      [
        { type: 'normal', count: 12, interval: 0.5,  delay: 0,   path: 1 },
        { type: 'fast',   count: 10, interval: 0.35, delay: 0,   path: 1, tunnelIndex: 1 },
        { type: 'tank',   count: 6,  interval: 1.0,  delay: 0,   path: 0 },
        { type: 'flying', count: 6,  interval: 0.75, delay: 1,   path: 0 },
      ],
      [
        { type: 'normal', count: 13, interval: 0.5,  delay: 0,   path: 0 },
        { type: 'fast',   count: 10, interval: 0.35, delay: 0,   path: 0, tunnelIndex: 1 },
        { type: 'tank',   count: 7,  interval: 1.0,  delay: 0,   path: 1 },
        { type: 'flying', count: 7,  interval: 0.75, delay: 1,   path: 0 },
      ],
      [
        { type: 'normal', count: 13, interval: 0.5,  delay: 0,   path: 1 },
        { type: 'fast',   count: 11, interval: 0.35, delay: 0,   path: 1, tunnelIndex: 0 },
        { type: 'tank',   count: 7,  interval: 1.0,  delay: 0,   path: 1 },
        { type: 'flying', count: 7,  interval: 0.75, delay: 1,   path: 1 },
      ],
      [
        { type: 'fast',   count: 11, interval: 0.35, delay: 0,   path: 0 },
        { type: 'tank',   count: 7,  interval: 1.0,  delay: 0,   path: 1 },
        { type: 'flying', count: 7,  interval: 0.75, delay: 1,   path: 0 },
        { type: 'boss',   count: 1,  interval: 1,    delay: 3,   path: 1 },
      ],
    ],
  }),

  // Map 11 — Đổi đường theo wave: mỗi wave CHỈ 1 trong 2 đường (path 0/1) được mở,
  // đường còn lại bị chặn ngay từ miệng bằng rào đầu lâu (đỏ) — đường mở có hào
  // quang xanh. Người chơi phải đọc trước xem wave tới mở đường nào để dồn tháp
  // đúng chỗ, vì lượt sau có thể đổi hẳn sang đường bên kia (xem pathPattern).
  defineMap({
    id: 10, name: 'Thung Lũng Ma Ám', theme: 'autumn', season: 'autumn', difficulty: 2.25,
    rawPaths: [
      [{ x: -20, y: 90 }, { x: 140, y: 90 }, { x: 140, y: 260 }, { x: 280, y: 260 }, { x: 280, y: 90 }, { x: 420, y: 90 }, { x: 420, y: 270 }, { x: 560, y: 270 }, { x: 560, y: 110 }, { x: 700, y: 110 }, { x: 700, y: 300 }, { x: 860, y: 300 }, { x: 860, y: 200 }, { x: 980, y: 200 }],
      [{ x: -20, y: 510 }, { x: 180, y: 510 }, { x: 180, y: 330 }, { x: 320, y: 330 }, { x: 320, y: 510 }, { x: 460, y: 510 }, { x: 460, y: 320 }, { x: 600, y: 320 }, { x: 600, y: 480 }, { x: 740, y: 480 }, { x: 740, y: 300 }, { x: 880, y: 300 }, { x: 880, y: 200 }, { x: 980, y: 200 }],
    ],
    pathPattern: [0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1],
    seed: 3011, decorCount: 48, sheepCount: 0, obstacleCount: 7,
    waves: [
      [{ type: 'normal', count: 8,  interval: 0.75, delay: 0, path: 0 }],
      [{ type: 'normal', count: 9,  interval: 0.7,  delay: 0, path: 0 },
       { type: 'fast',   count: 4,  interval: 0.5,  delay: 1.4, path: 0 }],
      [{ type: 'normal', count: 9,  interval: 0.65, delay: 0, path: 1 },
       { type: 'fast',   count: 5,  interval: 0.45, delay: 1, path: 1 }],
      [{ type: 'tank',   count: 4,  interval: 1.2,  delay: 0, path: 0 },
       { type: 'normal', count: 8,  interval: 0.6,  delay: 0.6, path: 0 }],
      [{ type: 'fast',   count: 8,  interval: 0.4,  delay: 0, path: 1 },
       { type: 'tank',   count: 3,  interval: 1.1,  delay: 1.5, path: 1 }],
      [{ type: 'flying', count: 5,  interval: 0.85, delay: 0, path: 1 },
       { type: 'normal', count: 10, interval: 0.55, delay: 0, path: 1 }],
      [{ type: 'tank',   count: 5,  interval: 1.1,  delay: 0, path: 0 },
       { type: 'flying', count: 5,  interval: 0.8,  delay: 1, path: 0 }],
      [{ type: 'normal', count: 11, interval: 0.5,  delay: 0, path: 1 },
       { type: 'fast',   count: 7,  interval: 0.4,  delay: 0.8, path: 1 }],
      [{ type: 'fast',   count: 9,  interval: 0.35, delay: 0, path: 0 },
       { type: 'tank',   count: 6,  interval: 0.95, delay: 0, path: 0 },
       { type: 'flying', count: 5,  interval: 0.7,  delay: 1, path: 0 }],
      [{ type: 'fast',   count: 10, interval: 0.35, delay: 0, path: 1 },
       { type: 'tank',   count: 6,  interval: 1.0,  delay: 0, path: 1 },
       { type: 'flying', count: 6,  interval: 0.75, delay: 1, path: 1 }],
      [{ type: 'normal', count: 12, interval: 0.4,  delay: 0, path: 0 },
       { type: 'fast',   count: 11, interval: 0.35, delay: 0, path: 0 },
       { type: 'tank',   count: 7,  interval: 0.9,  delay: 0, path: 0 },
       { type: 'flying', count: 6,  interval: 0.7,  delay: 1, path: 0 }],
      [{ type: 'normal', count: 12, interval: 0.4,  delay: 0, path: 0 },
       { type: 'fast',   count: 12, interval: 0.35, delay: 0, path: 0 },
       { type: 'tank',   count: 7,  interval: 0.9,  delay: 0, path: 0 },
       { type: 'flying', count: 6,  interval: 0.7,  delay: 1, path: 0 }],
      [{ type: 'normal', count: 13, interval: 0.4,  delay: 0, path: 1 },
       { type: 'fast',   count: 12, interval: 0.35, delay: 0, path: 1 },
       { type: 'tank',   count: 8,  interval: 0.9,  delay: 0, path: 1 },
       { type: 'flying', count: 6,  interval: 0.7,  delay: 1, path: 1 }],
      [{ type: 'normal', count: 13, interval: 0.4,  delay: 0, path: 0 },
       { type: 'fast',   count: 13, interval: 0.35, delay: 0, path: 0 },
       { type: 'tank',   count: 8,  interval: 0.9,  delay: 0, path: 0 },
       { type: 'flying', count: 7,  interval: 0.7,  delay: 1, path: 0 }],
      [{ type: 'normal', count: 14, interval: 0.4,  delay: 0, path: 1 },
       { type: 'fast',   count: 14, interval: 0.35, delay: 0, path: 1 },
       { type: 'tank',   count: 9,  interval: 0.9,  delay: 0, path: 1 },
       { type: 'flying', count: 7,  interval: 0.7,  delay: 1, path: 1 }],
      [{ type: 'normal', count: 14, interval: 0.4,  delay: 0, path: 1 },
       { type: 'tank',   count: 9,  interval: 0.9,  delay: 0, path: 1 },
       { type: 'flying', count: 7,  interval: 0.7,  delay: 1, path: 1 },
       { type: 'boss',   count: 1,  interval: 1,    delay: 3, path: 1 }],
    ],
  }),

  defineMap({
    // Map 12 (Boss Thu): đảo chiều bản đồ — quái spawn bên PHẢI (Đông), thành đặt bên TRÁI (Tây).
    // Đường đi được bo mượt 2 nhánh hoàng gia thông thoáng qua khuôn viên lâu đài bỏ hoang.
    id: 11, name: 'Lâu Đài Bỏ Hoang', theme: 'autumn', season: 'autumn', difficulty: 2.70,
    rawPaths: [
      [{ x: 980, y: 150 }, { x: 720, y: 150 }, { x: 720, y: 380 }, { x: 420, y: 380 }, { x: 420, y: 220 }, { x: 160, y: 220 }, { x: 160, y: 300 }, { x: -20, y: 300 }],
      [{ x: 980, y: 450 }, { x: 720, y: 450 }, { x: 720, y: 260 }, { x: 420, y: 260 }, { x: 420, y: 420 }, { x: 160, y: 420 }, { x: 160, y: 300 }, { x: -20, y: 300 }],
    ],
    tunnels: [
      { x: 720, y: 150, exitX: 420, exitY: 380, r: 22 }, // 0 hầm mỏ (path0)
      { x: 720, y: 450, exitX: 420, exitY: 260, r: 22 }, // 1 hầm mỏ (path1)
    ],
    seed: 3012, decorCount: 54, sheepCount: 2, obstacleCount: 8,
    extraDecor: [
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 720, y: 270, dw: 32, dh: 64 },
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 420, y: 300, dw: 32, dh: 64 },
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 160, y: 150, dw: 32, dh: 64 },
    ],
    waves: buildMap12Waves(),
  }),

  // ================= ĐÔNG (WINTER) =================
  // Map 13 — thành dời lên hướng BẮC (trên), quái đổ về từ 3 hướng Tây/Nam/Đông
  // cùng lúc (đa hướng tấn công thật, không còn 1 đường duy nhất như bản cũ) +
  // hầm mỏ dịch chuyển tái dùng từ Map 9, kéo dài lên 15 wave.
  defineMap({
    id: 12, name: 'Đồng Băng Giá', theme: 'winter', season: 'winter', difficulty: 2.55,
    rawPaths: [
      [{ x: -20, y: 300 }, { x: 220, y: 300 }, { x: 220, y: 120 }, { x: 480, y: 120 }, { x: 480, y: -20 }], // Tây
      [{ x: 300, y: 620 }, { x: 300, y: 400 }, { x: 480, y: 400 }, { x: 480, y: -20 }],                       // Nam
      [{ x: 980, y: 340 }, { x: 750, y: 340 }, { x: 750, y: 160 }, { x: 480, y: 160 }, { x: 480, y: -20 }],  // Đông
    ],
    tunnels: [
      { x: 220, y: 300, exitX: 480, exitY: 120, r: 22 }, // 0 hầm mỏ (path0, bỏ qua khúc cua 220,120)
      { x: 750, y: 340, exitX: 480, exitY: 160, r: 22 }, // 1 hầm mỏ (path2, bỏ qua khúc cua 750,160)
    ],
    seed: 3013, decorCount: 42, sheepCount: 0, obstacleCount: 8,
    waves: buildConvergedWaves(3, 15, 'bossWinter', [
      { wave: 2, path: 0, tunnelIndex: 0 }, { wave: 5, path: 2, tunnelIndex: 1 },
      { wave: 8, path: 0, tunnelIndex: 0 }, { wave: 11, path: 2, tunnelIndex: 1 },
    ]),
  }),

  // Map 14 — KHÁC HẲN kiểu "ngã 3 hội tụ" của map 13: chỉ 2 đường nhưng đi CHÉO
  // (không còn bẻ góc vuông thuần) và BẮT CHÉO NHAU giữa map thành hình chữ X
  // trước khi cùng đổ về cổng thành hướng NAM (dưới). Cổng dịch chuyển đổi sang
  // miệng hầm mỏ (goldMine, như Map 9) thay vì cổng phép màu.
  defineMap({
    id: 13, name: 'Rừng Tuyết', theme: 'winter', season: 'winter', difficulty: 2.75,
    rawPaths: [
      [{ x: -20, y: 120 }, { x: 320, y: 120 }, { x: 320, y: 480 }, { x: 480, y: 480 }, { x: 480, y: 620 }],
      [{ x: 980, y: 120 }, { x: 640, y: 120 }, { x: 640, y: 480 }, { x: 480, y: 480 }, { x: 480, y: 620 }],
    ],
    tunnels: [
      { x: 320, y: 120, exitX: 480, exitY: 480, r: 22 },
      { x: 640, y: 120, exitX: 480, exitY: 480, r: 22 },
    ],
    seed: 3014, decorCount: 44, sheepCount: 0, obstacleCount: 8,
    waves: buildConvergedWaves(2, 17, 'bossWinter', [
      { wave: 2, path: 1, tunnelIndex: 1 }, { wave: 5, path: 0, tunnelIndex: 0 },
      { wave: 8, path: 1, tunnelIndex: 1 }, { wave: 11, path: 0, tunnelIndex: 0 },
    ]),
  }),

  // Map 15 — KHÁC cả map 13 (ngã 3) lẫn map 14 (chữ X): dùng NGÃ TƯ thật sự, 4
  // hướng đổ về (Bắc/Nam + 2 mũi Đông trên-dưới tách biệt), cổng thành hướng TÂY
  // (trái). Cổng dịch chuyển cũng đổi sang miệng hầm mỏ như map 14.
  defineMap({
    id: 14, name: 'Hang Băng Vĩnh Cửu', theme: 'winter', season: 'winter', difficulty: 2.95,
    rawPaths: [
      [{ x: 480, y: -20 }, { x: 480, y: 180 }, { x: 200, y: 180 }, { x: 200, y: 300 }, { x: -20, y: 300 }],                        // Bắc
      [{ x: 480, y: 620 }, { x: 480, y: 420 }, { x: 200, y: 420 }, { x: 200, y: 300 }, { x: -20, y: 300 }],                        // Nam
      [{ x: 980, y: 100 }, { x: 650, y: 100 }, { x: 650, y: 300 }, { x: 350, y: 300 }, { x: -20, y: 300 }],                        // Đông (mũi trên)
      [{ x: 980, y: 500 }, { x: 750, y: 500 }, { x: 750, y: 380 }, { x: 350, y: 380 }, { x: 350, y: 300 }, { x: -20, y: 300 }],   // Đông (mũi dưới)
    ],
    tunnels: [
      { x: 480, y: 180, exitX: 200, exitY: 300, r: 22 }, // 0 hầm mỏ (path0 Bắc, bỏ qua khúc cua 200,180)
      { x: 650, y: 100, exitX: 350, exitY: 300, r: 22 }, // 1 hầm mỏ (path2 Đông-trên, bỏ qua khúc cua 650,300)
    ],
    seed: 3015, decorCount: 48, sheepCount: 0, obstacleCount: 8,
    waves: buildConvergedWaves(4, 19, 'bossWinter', [
      { wave: 3, path: 0, tunnelIndex: 0 }, { wave: 6, path: 2, tunnelIndex: 1 },
      { wave: 9, path: 0, tunnelIndex: 0 }, { wave: 12, path: 2, tunnelIndex: 1 },
    ]),
  }),

  defineMap({
    // Map CUỐI CÙNG của game (Boss Đông / Nữ Hoàng Băng Giá) — 3 đại lộ uy nghi bo cong
    // thông thoáng hội tụ về Cung Điện Băng ở phía Đông, đẹp mắt và dễ quan sát.
    id: 15, name: 'Cung Điện Băng', theme: 'winter', season: 'winter', difficulty: 3.20,
    rawPaths: [
      [{ x: -20, y: 150 }, { x: 320, y: 150 }, { x: 320, y: 270 }, { x: 680, y: 270 }, { x: 680, y: 300 }, { x: 980, y: 300 }],
      [{ x: -20, y: 450 }, { x: 320, y: 450 }, { x: 320, y: 330 }, { x: 680, y: 330 }, { x: 680, y: 300 }, { x: 980, y: 300 }],
      [{ x: 480, y: -20 }, { x: 480, y: 200 }, { x: 750, y: 200 }, { x: 750, y: 300 }, { x: 980, y: 300 }],
    ],
    tunnels: [
      { x: 320, y: 150, exitX: 680, exitY: 270, r: 22 }, // 0 hầm mỏ (path0)
      { x: 320, y: 450, exitX: 680, exitY: 330, r: 22 }, // 1 hầm mỏ (path1)
    ],
    seed: 3016, decorCount: 56, sheepCount: 1, obstacleCount: 9,
    extraDecor: [
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 750, y: 150, dw: 30, dh: 60 },
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 750, y: 420, dw: 30, dh: 60 },
      { img: 'blueTower', sx: 0, sy: 0, sw: 128, sh: 256, x: 320, y: 280, dw: 28, dh: 56 },
    ],
    waves: [
      [{ type: 'normal', count: 8,  interval: 0.8,  delay: 0,   path: 0 }],
      [
        { type: 'normal', count: 8,  interval: 0.75, delay: 0,   path: 0 },
        { type: 'fast',   count: 5,  interval: 0.45, delay: 1,   path: 1 },
      ],
      [
        { type: 'normal', count: 7,  interval: 0.75, delay: 0,   path: 1 },
        { type: 'fast',   count: 6,  interval: 0.4,  delay: 0.8, path: 2 },
      ],
      [
        { type: 'tank',   count: 4,  interval: 1.2,  delay: 0,   path: 0 },
        { type: 'normal', count: 8,  interval: 0.7,  delay: 0.5, path: 2 },
      ],
      [
        { type: 'fast',   count: 7,  interval: 0.4,  delay: 0,   path: 0, tunnelIndex: 0, tunnelChance: 0.6 },
        { type: 'fast',   count: 7,  interval: 0.4,  delay: 0,   path: 1 },
        { type: 'tank',   count: 3,  interval: 1.2,  delay: 1.5, path: 2 },
      ],
      [
        { type: 'flying', count: 5,  interval: 0.85, delay: 0,   path: 2 },
        { type: 'normal', count: 9,  interval: 0.65, delay: 0,   path: 0 },
        { type: 'normal', count: 9,  interval: 0.65, delay: 0.3, path: 1, tunnelIndex: 1, tunnelChance: 0.6 },
      ],
      [
        { type: 'tank',   count: 5,  interval: 1.1,  delay: 0,   path: 1 },
        { type: 'flying', count: 6,  interval: 0.8,  delay: 1,   path: 0 },
        { type: 'fast',   count: 7,  interval: 0.4,  delay: 0,   path: 2 },
      ],
      [
        { type: 'normal', count: 10, interval: 0.6,  delay: 0,   path: 0, tunnelIndex: 0, tunnelChance: 0.6 },
        { type: 'tank',   count: 5,  interval: 1.1,  delay: 0,   path: 2 },
        { type: 'flying', count: 5,  interval: 0.8,  delay: 1.5, path: 1 },
      ],
      [
        { type: 'fast',   count: 9,  interval: 0.35, delay: 0,   path: 0 },
        { type: 'fast',   count: 9,  interval: 0.35, delay: 0,   path: 1, tunnelIndex: 1, tunnelChance: 0.6 },
        { type: 'tank',   count: 4,  interval: 1.1,  delay: 2,   path: 2 },
      ],
      [
        { type: 'tank',   count: 6,  interval: 1.0,  delay: 0,   path: 0 },
        { type: 'flying', count: 7,  interval: 0.75, delay: 0,   path: 1 },
        { type: 'normal', count: 10, interval: 0.6,  delay: 0.5, path: 2 },
      ],
      [
        { type: 'flying', count: 7,  interval: 0.7,  delay: 0,   path: 0 },
        { type: 'flying', count: 7,  interval: 0.7,  delay: 0,   path: 2 },
        { type: 'tank',   count: 5,  interval: 1.0,  delay: 1.5, path: 1 },
      ],
      [
        { type: 'normal', count: 12, interval: 0.55, delay: 0,   path: 0 },
        { type: 'normal', count: 12, interval: 0.55, delay: 0,   path: 1 },
        { type: 'tank',   count: 6,  interval: 1.0,  delay: 1,   path: 2 },
      ],
      [
        { type: 'tank',   count: 7,  interval: 0.95, delay: 0,   path: 2 },
        { type: 'fast',   count: 10, interval: 0.35, delay: 0,   path: 0 },
        { type: 'fast',   count: 10, interval: 0.35, delay: 0,   path: 1 },
      ],
      // Wave 14 — dồn áp lực cả 3 hướng liên tục ngay trước chung kết, không còn
      // khoảng nghỉ giữa loại quái như các wave trước.
      [
        { type: 'normal', count: 13, interval: 0.45, delay: 0,   path: 0 },
        { type: 'normal', count: 13, interval: 0.45, delay: 0,   path: 1 },
        { type: 'tank',   count: 7,  interval: 0.9,  delay: 0.5, path: 2 },
        { type: 'flying', count: 7,  interval: 0.7,  delay: 1,   path: 0 },
      ],
      // Wave 15 — không còn là chung kết nữa (đã đẩy xuống wave 20), nhưng vẫn dồn
      // đủ cả 3 hướng + xen cổng dịch chuyển ngẫu nhiên để giữ áp lực leo thang liên tục.
      [
        { type: 'normal', count: 12, interval: 0.5,  delay: 0,   path: 0, tunnelIndex: 0, tunnelChance: 0.5 },
        { type: 'tank',   count: 6,  interval: 0.95, delay: 0,   path: 1 },
        { type: 'flying', count: 6,  interval: 0.7,  delay: 1,   path: 2 },
      ],
      [
        { type: 'fast',   count: 12, interval: 0.35, delay: 0,   path: 0 },
        { type: 'fast',   count: 12, interval: 0.35, delay: 0,   path: 1, tunnelIndex: 1, tunnelChance: 0.5 },
        { type: 'tank',   count: 6,  interval: 0.9,  delay: 1,   path: 2 },
      ],
      [
        { type: 'normal', count: 14, interval: 0.4,  delay: 0,   path: 0, tunnelIndex: 0, tunnelChance: 0.5 },
        { type: 'normal', count: 14, interval: 0.4,  delay: 0,   path: 1, tunnelIndex: 1, tunnelChance: 0.5 },
        { type: 'flying', count: 8,  interval: 0.65, delay: 1,   path: 2 },
      ],
      [
        { type: 'tank',   count: 8,  interval: 0.85, delay: 0,   path: 0 },
        { type: 'tank',   count: 8,  interval: 0.85, delay: 0,   path: 1 },
        { type: 'fast',   count: 12, interval: 0.3,  delay: 1,   path: 2, tunnelIndex: 0, tunnelChance: 0.4 },
      ],
      // Wave 19 — dồn áp lực tối đa ngay trước chung kết, không còn khoảng nghỉ.
      [
        { type: 'normal', count: 15, interval: 0.35, delay: 0,   path: 0, tunnelIndex: 0, tunnelChance: 0.5 },
        { type: 'normal', count: 15, interval: 0.35, delay: 0,   path: 1, tunnelIndex: 1, tunnelChance: 0.5 },
        { type: 'tank',   count: 8,  interval: 0.8,  delay: 0.5, path: 2 },
        { type: 'flying', count: 8,  interval: 0.65, delay: 1,   path: 0 },
      ],
      // Wave 20 — chung kết thật sự: cả 3 hướng đổ dồn cùng lúc + Nữ Hoàng Băng Giá.
      [
        { type: 'normal',     count: 14, interval: 0.4,  delay: 0, path: 0, tunnelIndex: 0, tunnelChance: 0.5 },
        { type: 'tank',       count: 8,  interval: 0.85, delay: 0, path: 1 },
        { type: 'flying',     count: 8,  interval: 0.65, delay: 1, path: 2 },
        { type: 'bossWinter', count: 1,  interval: 1,    delay: 3, path: 2 },
      ],
    ],
  }),
];
