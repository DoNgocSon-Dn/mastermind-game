// ============================================================
// SOLDIER.JS — FSM lính Barracks: Idle → Move → Combat → Dead → (respawn)
// Dùng chung cho lính gốc, Paladin (4A), Barbarian (4B), lính tiếp viện
// tạm thời (Global Skill), và Golem Đá (Mage 4B Summon Elemental).
// ============================================================
// frame = kích cỡ khung THẬT của sheet (đo header PNG, không đoán — Golem mượn sprite
// Gấu của Enemy Pack, khung 256 chứ không phải 192 như 3 bộ Unit Pack còn lại, trước
// đây bị hard-code chung 192 nên mỗi khung Golem bị cắt lệch/mất góc).
// cxN/botN = tâm ngang + đáy phần có hình trong khung, đo bằng quét kênh alpha (khung
// Idle đầu tiên) — cùng kỹ thuật enemy.js dùng, để chân lính neo đúng mặt đất như
// cây/quái thay vì căn giữa khung theo cách cũ.
const SOLDIER_SPRITE_INFO = {
  base: { frame: 192, cxN: 0.526, botN: 0.708 },
  paladin: { frame: 192, cxN: 0.497, botN: 0.693 },
  barbarian: { frame: 192, cxN: 0.526, botN: 0.708 }, // red_warrior giống hệt blue_warrior, chỉ khác màu
  golem: { frame: 256, cxN: 0.504, botN: 0.688 },
};

class Soldier {
  constructor(x, y, stats, owner) {
    this.x = x; this.y = y;
    this.homeX = x; this.homeY = y;
    this.owner = owner; // Tower Barracks chủ quản, hoặc null nếu tiếp viện tạm thời

    this.maxHp = stats.hp; this.hp = stats.hp;
    this.dmg = stats.dmg;
    this.atkRate = stats.atkRate || 0.85;
    this.atkTimer = 0;
    this.armor = stats.armor || 0;
    this.magicResist = stats.magicResist || 0;
    this.canHitFlying = !!stats.canHitFlying;
    this.respawnTime = stats.respawn || 12;
    this.respawnTimer = 0;
    this.temporary = !!stats.temporary;
    this.lifespan = stats.lifespan || 0;
    this.isGolem = !!stats.isGolem;
    this.spriteSet = stats.spriteSet || 'base'; // 'base' | 'paladin' | 'barbarian' | 'golem'

    this.state = 'Idle';   // Idle | Move | Engage | Combat | Dead
    this.target = null;
    this.dead = false;     // cờ tạm: DamageSystem set true khi hp<=0
    this.removed = false;  // true = xoá khỏi mảng game.soldiers vĩnh viễn
    this.radius = this.isGolem ? 17 : 12;
    // Tầm PHÁT HIỆN (chạy ra chặn) rộng hơn hẳn tầm ĐÁNH — lính phải chạy tới tận nơi
    // ôm chân quái rồi mới đánh, thay vì đứng từ xa 36px "chặn" trong vô hình.
    this.detectRadius = 96;
    this.meleeRadius = this.isGolem ? 24 : 19;
    this.leashRadius = 140; // rời điểm tập kết quá xa thì bỏ mục tiêu, quay về
    this.animTimer = 0; this.animFrame = 0;
    this.facingLeft = false;
    this.hitFlash = 0;

    this.baseArmor = this.armor;
    this.buffed = false;    // đang trong hào quang Hero (Citadel Wall — chỉ hero Khiên&Kiếm)
    this.buffPulse = 0;     // pha nhấp nháy hiệu ứng sáng

    // Tiếng Hét Khích Lệ (Battle Cry, hero Khiên&Kiếm): buff tạm thời tốc độ đánh +
    // sát thương, tách riêng khỏi hào quang Citadel Wall (2 buff có thể cộng dồn).
    this.battleCryTimer = 0;
    this.battleCryAtkMult = 1;
    this.battleCryDmgMult = 1;
  }

  applyBattleCry(atkRateMult, dmgMult, duration) {
    this.battleCryTimer = duration;
    this.battleCryAtkMult = atkRateMult;
    this.battleCryDmgMult = dmgMult;
  }

  // Bỏ mục tiêu và TRẢ quái về trạng thái tự do — luôn đi qua hàm này để không bao giờ
  // để sót con quái bị "khoá" vào 1 lính đã chết/đã đổi mục tiêu (sẽ đứng im mãi mãi).
  _releaseTarget() {
    if (this.target && this.target.engagedBy === this) this.target.engagedBy = null;
    this.target = null;
  }

  setRallyPoint(x, y) {
    this.homeX = x; this.homeY = y;
    if (this.state !== 'Combat' && this.state !== 'Dead') this.state = 'Move';
  }

  update(dt, game) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.buffPulse += dt;
    this._updateHeroAura(dt, game);
    if (this.battleCryTimer > 0) {
      this.battleCryTimer -= dt;
      if (this.battleCryTimer <= 0) { this.battleCryAtkMult = 1; this.battleCryDmgMult = 1; }
    }
    // Vừa bị hạ gục (DamageSystem set this.dead = true)
    if (this.dead && this.state !== 'Dead') {
      this.state = 'Dead';
      this.dead = false; // reset cờ tạm, không dùng để filter mảng
      this.respawnTimer = this.respawnTime;
      this._releaseTarget();
      if (this.temporary) this.removed = true;
      AssetLoader.playSound('hurt', { volume: 0.4 });
      return;
    }

    if (this.state === 'Dead') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0 && !this.temporary) {
        this.hp = this.maxHp;
        this.x = this.homeX; this.y = this.homeY;
        this.state = 'Idle';
      }
      return;
    }

    if (this.temporary) {
      this.lifespan -= dt;
      if (this.lifespan <= 0) { this.removed = true; return; }
    }

    // ---- Đang giữ 1 mục tiêu: chạy tới chặn (Engage) rồi đánh giáp lá cà (Combat) ----
    if (this.target) {
      const t = this.target;
      const dTar = Math.hypot(t.x - this.x, t.y - this.y);
      const dHome = Math.hypot(t.x - this.homeX, t.y - this.homeY);
      if (t.dead || t.reachedEnd || dHome > this.leashRadius) {
        this._releaseTarget();       // mục tiêu chết / thoát / đi quá xa chốt -> quay về
        this.state = 'Move';
      } else if (dTar <= this.meleeRadius + (t.radius || 0)) {
        // Cộng thêm bán kính THẬT của quái — boss to hẳn (scale x1.7-2.0, radius có
        // thể ~88) mà chỉ so tâm-tới-tâm với 1 số cố định thì lính đứng sát thân boss
        // vẫn bị coi là "chưa tới nơi", cứ chạy vòng quanh không bao giờ đánh được.
        this.state = 'Combat';       // đã ôm được chân quái: quái sẽ đứng lại (xem enemy.js)
        this.facingLeft = t.x < this.x;
        this.atkTimer -= dt;
        if (this.atkTimer <= 0) {
          this.atkTimer = this.atkRate / this.battleCryAtkMult;
          DamageSystem.applyTo(game, t, this.dmg * this.battleCryDmgMult, 'physical');
        }
        this._animate(dt, false);
        return;
      } else {
        this.state = 'Engage';       // chạy ra đón đầu
        const step = 82 * dt;
        this.facingLeft = t.x < this.x;
        this.x += ((t.x - this.x) / dTar) * step;
        this.y += ((t.y - this.y) / dTar) * step;
        this._animate(dt, true);
        return;
      }
    }

    // Chưa có mục tiêu: tìm 1 con quái CHƯA bị lính nào giữ, và GIỮ CHỖ ngay lập tức
    // (gán engagedBy) để 2 lính không cùng lao vào 1 con — đúng nghĩa 1 kèm 1.
    const found = this._findEnemyToEngage(game);
    if (found) {
      this.target = found;
      found.engagedBy = this;
      this.state = 'Engage';
      this._animate(dt, true);
      return;
    }

    const dx = this.homeX - this.x, dy = this.homeY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      this.state = 'Move';
      this.facingLeft = dx < 0;
      const step = 75 * dt;
      if (dist < step) { this.x = this.homeX; this.y = this.homeY; }
      else { this.x += (dx / dist) * step; this.y += (dy / dist) * step; }
      this._animate(dt, true);
    } else {
      this.state = 'Idle';
      this._animate(dt, false);
    }
  }

  // Chỉ nhận quái CHƯA có lính nào giữ (e.engagedBy rỗng) và còn nằm trong bán kính
  // canh giữ quanh điểm tập kết — nhờ vậy lính không bỏ chốt đuổi theo quái khắp map.
  _findEnemyToEngage(game) {
    let best = null, bestDist = this.detectRadius;
    for (const e of game.enemies) {
      if (e.dead || e.reachedEnd || e.engagedBy || e.hidden) continue;
      if (e.isFlying && !this.canHitFlying) continue;
      if (Math.hypot(e.x - this.homeX, e.y - this.homeY) > this.leashRadius) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  // Hào quang Citadel Wall: CHỈ hero Khiên&Kiếm có — lính đứng gần Hero thì "trâu"
  // hẳn lên (giảm sát thương nhận vào + tự hồi máu nhẹ) và phát sáng để người chơi
  // thấy rõ ai đang được buff. Cung Thủ/Lính Giáo không có passive này.
  _updateHeroAura(dt, game) {
    const hero = game && game.hero;
    const aura = (hero && hero.cfg && hero.cfg.passive && hero.cfg.passive.aura) || null;
    const on = !!(aura && hero.alive && Math.hypot(hero.x - this.x, hero.y - this.y) <= aura.radius);
    this.buffed = on;
    this.armor = Math.min(0.85, this.baseArmor + (on ? aura.armorBonus : 0));
    if (on && this.state !== 'Dead' && this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + aura.regenPerSec * dt);
    }
  }

  _animate(dt, moving) {
    this.animTimer += dt;
    const fps = moving ? 7 : 5;
    if (this.animTimer > 1 / fps) { this.animTimer = 0; this.animFrame++; }
  }

  draw(ctx) {
    if (this.state === 'Dead') return;
    // Hào quang buff vẽ TRƯỚC thân lính (nằm dưới chân) để không che mất nhân vật.
    if (this.buffed) this._drawBuffAura(ctx);

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.facingLeft) ctx.scale(-1, 1);

    const drawn = this._drawSprite(ctx);
    if (!drawn) {
      // TODO: thay bằng sprite thật khi có asset (fallback hình học)
      ctx.fillStyle = '#7fa8ff';
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    this._drawHpBar(ctx);
    if (this.battleCryTimer > 0) this._drawStatusIcon(ctx, '⚡');
  }

  _drawStatusIcon(ctx, emoji) {
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.fillText(emoji, this.x + this.radius - 4, this.y - this.radius - 10);
    ctx.restore();
  }

  // Sprite key theo bộ (base/paladin/barbarian/golem) + trạng thái FSM.
  // Tất cả unit "Tiny Swords" dùng khung vuông 192x192.
  _spriteKey() {
    const moving = this.state === 'Move' || this.state === 'Engage';
    const inCombat = this.state === 'Combat';
    if (this.spriteSet === 'paladin') return inCombat ? 'paladinHeal' : (moving ? 'paladinRun' : 'paladinIdle');
    if (this.spriteSet === 'barbarian') return inCombat ? 'barbarianAttack' : (moving ? 'barbarianRun' : 'barbarianIdle');
    if (this.spriteSet === 'golem') return moving ? 'golemRun' : 'golemIdle';
    return inCombat ? 'soldierBaseAttack' : (moving ? 'soldierBaseRun' : 'soldierBaseIdle');
  }

  _drawSprite(ctx) {
    const img = AssetLoader.getImage(this._spriteKey());
    const size = (this.isGolem ? 58 : 38);
    if (!img) return false;
    const info = SOLDIER_SPRITE_INFO[this.spriteSet] || SOLDIER_SPRITE_INFO.base;
    const frameSize = info.frame;
    const frames = Math.max(1, Math.floor(img.width / frameSize));
    const f = this.animFrame % frames;
    const yOff = SpriteFX.hopOffset(this.hitFlash, 0.15);
    const flashAmount = this.hitFlash > 0 ? Math.min(1, this.hitFlash * 4) : 0;
    // Neo ĐÁY sprite (chân) đúng theo đo thật, xem SOLDIER_SPRITE_INFO ở đầu file.
    const dx = -size * info.cxN, dy = -size * info.botN + yOff;
    SpriteFX.drawFrame(ctx, img, f * frameSize, 0, frameSize, frameSize, dx, dy, size, size, flashAmount);
    return true;
  }

  // Vòng sáng vàng dưới chân + viền sáng nhấp nháy nhẹ: dấu hiệu lính đang được Hero buff.
  _drawBuffAura(ctx) {
    const pulse = 0.72 + Math.sin(this.buffPulse * 4) * 0.28;
    ctx.save();
    ctx.translate(this.x, this.y + 4);
    const r = this.radius + 8;
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, `rgba(255, 226, 140, ${0.5 * pulse})`);
    g.addColorStop(1, 'rgba(255, 200, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255, 224, 130, ${0.75 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.82, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  _drawHpBar(ctx) {
    const w = 22;
    const ratio = Math.max(0, this.hp / this.maxHp);
    ctx.save();
    ctx.translate(this.x, this.y - this.radius - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-w / 2 - 1, -1, w + 2, 5);
    // Máu đổi sang vàng kim khi đang được buff, khớp với vòng sáng dưới chân.
    ctx.fillStyle = this.buffed ? '#ffd766' : '#4ad24a';
    ctx.fillRect(-w / 2, 0, w * ratio, 3);
    if (this.buffed) {
      ctx.strokeStyle = 'rgba(255,226,140,0.9)'; ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2 - 1.5, -1.5, w + 3, 6);
    }
    ctx.restore();
  }
}
