// ============================================================
// SPRITEFX.JS — Vẽ 1 frame sprite với tint đỏ khi trúng đòn, giới hạn
// đúng trong silhouette của sprite (không tràn thành ô/hình chữ nhật
// đè lên nền như khi dùng globalCompositeOperation trực tiếp trên ctx chính).
// ============================================================
const SpriteFX = (() => {
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');
  buf.width = 128; buf.height = 128;

  function ensureSize(w, h) {
    if (buf.width < w || buf.height < h) {
      buf.width = Math.max(buf.width, w);
      buf.height = Math.max(buf.height, h);
    }
  }

  // sx,sy,sw,sh = vùng cắt trên sprite sheet; dx,dy,dw,dh = vị trí/kích thước vẽ ra (đã căn theo tâm sẵn).
  // flashAmount 0..1: 0 = vẽ bình thường, >0 = tint đỏ theo cường độ.
  function drawFrame(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh, flashAmount) {
    if (!flashAmount) {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    const bw = Math.ceil(dw), bh = Math.ceil(dh);
    ensureSize(bw, bh);
    bctx.clearRect(0, 0, bw, bh);
    bctx.drawImage(img, sx, sy, sw, sh, 0, 0, bw, bh);
    bctx.globalCompositeOperation = 'source-atop';
    bctx.fillStyle = `rgba(255,50,50,${Math.min(1, flashAmount)})`;
    bctx.fillRect(0, 0, bw, bh);
    bctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(buf, 0, 0, bw, bh, dx, dy, dw, dh);
  }

  // Độ nảy lên khi trúng đòn: t chạy 0..1 trong suốt thời gian flash, tạo 1 cú hất nhẹ lên rồi rơi xuống.
  function hopOffset(flashRemaining, flashDuration) {
    if (flashRemaining <= 0) return 0;
    const t = 1 - flashRemaining / flashDuration;
    return -Math.sin(Math.min(1, t) * Math.PI) * 6;
  }

  // Bụi bốc lên khi dọn/phá 1 vật cản trên map (đá/cây/nhà) — vài đám khói bụi nhỏ
  // toả ra quanh điểm phá. Gọi từ main.js:tryClearObstacle / tryClearResource.
  function burstDust(game, x, y) {
    if (!game || !game.effects || typeof Effect === 'undefined') return;
    for (let i = 0; i < 4; i++) {
      const ox = (Math.random() - 0.5) * 20;
      const oy = (Math.random() - 0.5) * 8;
      game.effects.push(new Effect(x + ox, y + oy, 9 + Math.random() * 9, 0.28 + Math.random() * 0.18, 'dust1', 'dust'));
    }
  }

  return { drawFrame, hopOffset, burstDust };
})();
