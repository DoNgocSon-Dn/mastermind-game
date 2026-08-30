// ============================================================
// CASTLE.JS — Toà thành cuối đường KHÔNG còn là vật trang trí thuần: bấm vào thành
// để mở bảng nâng cấp, tiêu vàng cho 2 hướng phòng thủ:
//   • Pháo Thành  — 1 khẩu pháo gắn trên thành, tự bắn con quái GẦN CỔNG NHẤT trong
//                   tầm (chốt chặn cuối). 3 cấp: +tầm/+ST/+nhịp bắn.
//   • Tường Thành — mỗi ĐỢT, N con quái LỌT đầu tiên bị tường chặn, KHÔNG mất mạng.
//                   Nạp lại đầy vào đầu mỗi đợt. 3 cấp: N = 1 / 2 / 3.
// Cả 2 bắt đầu ở cấp 0 (chưa mua). Số liệu tập trung ở CONFIG.castle.
// ============================================================
class Castle {
  constructor(pos, game) {
    this.x = pos.x;
    this.y = pos.y;              // tâm thành (đáy neo cho y-sort: xem get sortY)
    this.w = pos.w; this.h = pos.h;
    this.game = game;

    this.cannonLevel = 0;
    this.wallLevel = 0;

    this.shield = 0;             // số "lượt chặn" còn lại của đợt hiện tại
    this.shieldFlash = 0;       // >0 = vừa chặn 1 con, nhấp nháy

    this.target = null;
    this.cooldown = 0;
    this.barrelAngle = -Math.PI / 2;
    this.muzzleFlash = 0;

    // Điểm ngắm/bắn của pháo = đỉnh thành (nhỉnh hơn tâm 1 chút lên trên).
    this.gunX = this.x;
    this.gunY = this.y - this.h * 0.45;
  }

  // Toà thành khá cao -> neo y-sort theo ĐÁY để nhân vật đứng trước cổng vẽ đè đúng.
  get sortY() { return this.y; }

  get cannonStats() { return this.cannonLevel > 0 ? CONFIG.castle.cannon[this.cannonLevel - 1] : null; }
  get wallStats() { return this.wallLevel > 0 ? CONFIG.castle.wall[this.wallLevel - 1] : null; }

  get nextCannonCost() {
    return this.cannonLevel < CONFIG.castle.cannon.length ? CONFIG.castle.cannon[this.cannonLevel].cost : null;
  }
  get nextWallCost() {
    return this.wallLevel < CONFIG.castle.wall.length ? CONFIG.castle.wall[this.wallLevel].cost : null;
  }

  upgradeCannon(economy) {
    const cost = this.nextCannonCost;
    if (cost == null || !economy.spend(cost)) return false;
    this.cannonLevel++;
    return true;
  }
  upgradeWall(economy) {
    const cost = this.nextWallCost;
    if (cost == null || !economy.spend(cost)) return false;
    this.wallLevel++;
    // Mua giữa đợt -> có hiệu lực ngay cho phần còn lại của đợt.
    this.shield = Math.max(this.shield, CONFIG.castle.wall[this.wallLevel - 1].block);
    return true;
  }

  // Gọi mỗi khi 1 đợt mới bắt đầu (WaveManager.onWaveStart) — nạp đầy tường.
  onWaveStart() {
    this.shield = this.wallStats ? this.wallStats.block : 0;
  }

  // Trả TRUE nếu tường chặn được con quái này (không mất mạng). 1 lượt chặn / 1 con,
  // bất kể quái thường hay boss.
  absorbLeak(/* enemy */) {
    if (this.shield > 0) {
      this.shield--;
      this.shieldFlash = 0.5;
      AssetLoader.playSound('build', { volume: 0.35 });
      return true;
    }
    return false;
  }

  update(dt, game) {
    if (this.shieldFlash > 0) this.shieldFlash -= dt;
    if (this.muzzleFlash > 0) this.muzzleFlash -= dt;

    const s = this.cannonStats;
    if (!s) return;

    this.cooldown -= dt;
    if (!this.target || this.target.dead || this.target.hidden || this._outOfRange(this.target)) {
      this.target = this._pickTarget(game, s.range);
    }
    if (this.target) {
      const a = Math.atan2(this.target.y - this.gunY, this.target.x - this.gunX);
      // xoay nòng mượt về hướng mục tiêu
      let diff = a - this.barrelAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.barrelAngle += diff * Math.min(1, dt * 10);
      if (this.cooldown <= 0) {
        this.cooldown = s.rate;
        this.muzzleFlash = 0.12;
        game.projectiles.push(new Projectile(this.gunX, this.gunY, {
          target: this.target, speed: 340, damage: s.damage * Meta.towerDamageMult(), damageType: 'physical', sprite: 'shell',
        }));
        AssetLoader.playSound('explosion', { volume: 0.22 });
      }
    }
  }

  _outOfRange(e) {
    return Math.hypot(e.x - this.gunX, e.y - this.gunY) > (this.cannonStats ? this.cannonStats.range : 0);
  }

  // Ưu tiên con quái ĐI XA NHẤT (progress lớn nhất) trong tầm — pháo thành là chốt
  // chặn cuối, đánh con sắp lọt cổng trước.
  _pickTarget(game, range) {
    let best = null, bestProg = -1;
    for (const e of game.enemies) {
      if (e.dead || e.hidden) continue;
      if (Math.hypot(e.x - this.gunX, e.y - this.gunY) > range) continue;
      if (e.progress > bestProg) { bestProg = e.progress; best = e; }
    }
    return best;
  }

  // Vẽ pháo + hào quang tường — gọi SAU khi map.drawSpawnAndBase() đã vẽ thân thành.
  draw(ctx) {
    // Hào quang tường thành (khi còn lượt chặn) + chớp sáng lúc vừa chặn 1 con.
    if (this.wallLevel > 0) {
      const pulse = this.shieldFlash > 0 ? 1 : 0.35 + 0.15 * Math.sin(performance.now() / 320);
      ctx.save();
      ctx.globalAlpha = (this.shield > 0 ? 0.5 : 0.18) * pulse + (this.shieldFlash > 0 ? 0.4 : 0);
      ctx.strokeStyle = '#7ec8ff';
      ctx.lineWidth = this.shieldFlash > 0 ? 4 : 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - this.h * 0.35, this.w * 0.62, this.h * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Pip số lượt chặn còn lại
      const maxBlock = this.wallStats.block;
      ctx.save();
      for (let i = 0; i < maxBlock; i++) {
        const px = this.x - (maxBlock - 1) * 5 + i * 10;
        const py = this.y - this.h * 0.9;
        ctx.fillStyle = i < this.shield ? '#7ec8ff' : 'rgba(120,150,180,0.35)';
        ctx.strokeStyle = 'rgba(20,30,45,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    // Khẩu pháo trên đỉnh thành
    if (this.cannonLevel > 0) {
      const len = 15 + this.cannonLevel * 4;
      ctx.save();
      ctx.translate(this.gunX, this.gunY);
      // bệ pháo
      ctx.fillStyle = '#3a3f47';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      // nòng
      ctx.rotate(this.barrelAngle);
      ctx.fillStyle = '#23262b';
      ctx.fillRect(0, -3.5, len, 7);
      ctx.fillStyle = '#4a4f57';
      ctx.fillRect(len - 4, -4.5, 4, 9);
      if (this.muzzleFlash > 0) {
        ctx.fillStyle = `rgba(255,200,120,${this.muzzleFlash / 0.12})`;
        ctx.beginPath(); ctx.arc(len + 3, 0, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Hit test cho click (main.js) — hộp chữ nhật quanh thân thành.
  hitTest(px, py) {
    return px >= this.x - this.w * 0.5 && px <= this.x + this.w * 0.5 &&
           py >= this.y - this.h && py <= this.y + 8;
  }
}
