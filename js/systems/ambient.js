// ============================================================
// AMBIENT.JS — Lớp không khí phủ lên map cho "có hồn" hơn: mây trôi + bóng mây
// quét trên mặt đất + hạt rơi theo mùa (cánh hoa / lá / tuyết / bụi nắng) + lớp
// vignette nhuộm tông mùa. Dựng 1 lần mỗi trận (như GlobalSkills), cập nhật theo
// dt của game (nên tua nhanh x2/x3 thì không khí cũng nhanh theo), vẽ ở 2 tầng:
//   drawGround(ctx)  — SAU nền, TRƯỚC quái/tháp  (bóng mây nằm trên đất)
//   drawSky(ctx)     — SAU mọi thứ, TRƯỚC HUD    (mây, hạt rơi, vignette)
// Toàn bộ là hình học Canvas + vài sprite mây có sẵn (cloudA*/cloudB*) — không
// thêm asset mới, chi phí mỗi frame nhỏ (≈ vài chục fillRect + 4-6 drawImage).
// ============================================================

const AMBIENT_THEMES = {
  // count = số hạt (giữ THẤP: hạt rơi chỉ để gợi không khí, không được làm rối mắt).
  // vignette = màu ở 4 GÓC (tâm màn hình luôn trong suốt) — chỉ "đóng khung" cảnh cho
  // có chiều sâu, KHÔNG phủ màu lên toàn map (theme filter của map.js đã lo tông màu).
  spring: { kind: 'petal', count: 13, alpha: 0.34, vignette: 'rgba(45, 30, 55, 0.12)' },
  summer: { kind: 'mote',  count: 9,  alpha: 0.22, vignette: 'rgba(55, 42, 14, 0.11)' },
  autumn: { kind: 'leaf',  count: 12, alpha: 0.38, vignette: 'rgba(40, 26, 12, 0.16)' },
  winter: { kind: 'snow',  count: 24, alpha: 0.42, vignette: 'rgba(24, 38, 60, 0.14)' },
  // Núi lửa: map.js đã có tàn lửa riêng — ở đây chỉ thêm vài tàn lửa cao + viền tối nóng.
  volcano: { kind: 'ember', count: 8,  alpha: 0.5,  vignette: 'rgba(40, 10, 3, 0.24)' },
};

const PETAL_COLORS = ['#ffd3df', '#ffc1d4', '#ffe0e8', '#f7b8cc'];
const LEAF_COLORS = ['#c9662e', '#d98b34', '#a9451f', '#e0a341', '#8a6a2c'];

class AmbientFX {
  constructor(map) {
    const W = CONFIG.canvas.width, H = CONFIG.canvas.height;
    this.W = W; this.H = H;
    this.theme = map.theme;
    this.cfg = AMBIENT_THEMES[this.theme] || AMBIENT_THEMES.spring;
    this.t = 0;

    // Chiều gió chung cho cả mây lẫn hạt rơi (mỗi map một hướng nhẹ khác nhau).
    const rng = mulberry32(4700 + (map.id || 0));
    this.wind = (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.4);

    // ---- Bóng mây quét RẤT MỜ trên mặt đất — chỉ 2 vệt, gần như không thấy trực
    // tiếp, chỉ cảm được ánh sáng "dịu đi" khi nó lướt qua. KHÔNG vẽ sprite mây trên
    // trời nữa (bản trước có mây trôi ngang khu chơi — bị báo là rối mắt).
    this.clouds = [];
    this.shadows = [];
    for (let i = 0; i < 2; i++) {
      this.shadows.push({
        x: rng() * (W + 500) - 250,
        y: 60 + rng() * (H - 120),
        rx: 150 + rng() * 160,
        ry: 90 + rng() * 90,
        speed: (7 + rng() * 8) * (this.wind >= 0 ? 1 : -1),
        alpha: 0.03 + rng() * 0.035,
      });
    }

    // ---- Hạt rơi theo mùa ----
    this.particles = [];
    for (let i = 0; i < this.cfg.count; i++) this.particles.push(this._makeParticle(rng, true));
    this._rng = rng;

    // Vignette nhuộm tông mùa — bake 1 lần ra canvas phụ (gradient mỗi frame khá tốn).
    this._vignette = this._buildVignette();
  }

  _makeParticle(rng, initial) {
    const W = this.W, H = this.H;
    const kind = this.cfg.kind;
    const p = {
      x: rng() * W,
      y: initial ? rng() * H : -10 - rng() * 40,
      phase: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 3,
      rot: rng() * Math.PI * 2,
    };
    if (kind === 'snow') {
      p.r = 0.8 + rng() * 1.6;
      p.vy = 16 + rng() * 22;
      p.sway = 6 + rng() * 12;
      p.swaySpeed = 0.5 + rng() * 0.9;
    } else if (kind === 'petal') {
      p.w = 2.4 + rng() * 2;
      p.vy = 14 + rng() * 16;
      p.sway = 10 + rng() * 16;
      p.swaySpeed = 0.6 + rng() * 0.8;
      p.color = PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)];
    } else if (kind === 'leaf') {
      p.w = 3 + rng() * 2.6;
      p.vy = 15 + rng() * 18;
      p.sway = 14 + rng() * 20;
      p.swaySpeed = 0.6 + rng() * 0.9;
      p.color = LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)];
    } else if (kind === 'ember') {
      p.r = 0.9 + rng() * 1.4;
      p.vy = -(12 + rng() * 20); // bay LÊN
      p.sway = 5 + rng() * 9;
      p.swaySpeed = 1.0 + rng() * 1.2;
      p.y = initial ? rng() * H : H + 10 + rng() * 30;
    } else { // mote — bụi nắng lơ lửng
      p.r = 0.8 + rng() * 1.6;
      p.vy = -(3 + rng() * 8);
      p.sway = 10 + rng() * 18;
      p.swaySpeed = 0.4 + rng() * 0.7;
    }
    return p;
  }

  _buildVignette() {
    const W = this.W, H = this.H;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const c = off.getContext('2d');
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.addColorStop(1, this.cfg.vignette);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    return off;
  }

  update(dt) {
    if (dt <= 0) return;
    this.t += dt;
    const W = this.W, H = this.H;

    for (const c of this.clouds) {
      c.x += c.speed * dt;
      const w = 576 * c.scale;
      if (c.speed >= 0 && c.x > W + w) c.x = -w - Math.random() * 200;
      if (c.speed < 0 && c.x < -w) c.x = W + Math.random() * 200;
    }
    for (const s of this.shadows) {
      s.x += s.speed * dt;
      if (s.speed >= 0 && s.x - s.rx > W) s.x = -s.rx - Math.random() * 300;
      if (s.speed < 0 && s.x + s.rx < 0) s.x = W + s.rx + Math.random() * 300;
    }

    const drift = this.wind * 14;
    for (const p of this.particles) {
      p.rot += p.spin * dt;
      const swayX = Math.sin(this.t * p.swaySpeed + p.phase) * p.sway;
      p.x += (drift + swayX * dt);
      p.y += p.vy * dt;
      // vòng lại khi ra khỏi khung
      if (p.vy >= 0 && p.y > H + 12) { const np = this._makeParticle(this._rng, false); Object.assign(p, np); }
      else if (p.vy < 0 && p.y < -12) { const np = this._makeParticle(this._rng, false); Object.assign(p, np); p.y = H + 12; }
      if (p.x < -20) p.x = W + 20;
      else if (p.x > W + 20) p.x = -20;
    }
  }

  // Bóng mây quét trên đất — vẽ ngay sau nền, trước quái/tháp (nằm "dưới" chân nhân vật).
  drawGround(ctx) {
    ctx.save();
    for (const s of this.shadows) {
      const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, Math.max(s.rx, s.ry));
      g.addColorStop(0, `rgba(20, 24, 30, ${s.alpha})`);
      g.addColorStop(1, 'rgba(20, 24, 30, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Hạt rơi + vignette — vẽ SAU cùng (trước HUD). Không còn mây trên trời.
  drawSky(ctx) {
    ctx.save();

    // Hạt rơi — thưa + mờ, chỉ gợi không khí. `a` = alpha nền theo theme.
    const kind = this.cfg.kind;
    const a = this.cfg.alpha;
    for (const p of this.particles) {
      if (kind === 'snow') {
        ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(p.phase + this.t));
        ctx.fillStyle = '#f4f9ff';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'ember') {
        ctx.globalAlpha = a * Math.max(0, 0.4 + 0.5 * Math.sin(this.t * 2 + p.phase));
        ctx.fillStyle = '#ffaa5a';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'mote') {
        ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(this.t * 1.5 + p.phase));
        ctx.fillStyle = '#fff4d6';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else {
        // petal / leaf — elip nhỏ nghiêng nhẹ, KHÔNG bẹp thành gạch (bản trước trông
        // như vệt rác bay). Xoay chậm cho có cảm giác lượn.
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * 0.5);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const squash = 0.7 + 0.2 * Math.abs(Math.cos(p.rot));
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w, p.w * squash, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // Vignette + nhuộm tông mùa
    ctx.drawImage(this._vignette, 0, 0);

    ctx.restore();
  }
}
