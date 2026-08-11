// ============================================================
// PROJECTILE.JS — Đạn bay (tên/phép/pháo) + hiệu ứng nổ/tia điện.
// ============================================================
class Projectile {
  constructor(x, y, opts) {
    this.x = x; this.y = y;
    this.target = opts.target || null;
    this.targetX = opts.targetX; this.targetY = opts.targetY;
    this.speed = opts.speed || 300;
    this.damage = opts.damage;
    this.damageType = opts.damageType || 'physical';
    this.splash = opts.splash || 0;
    this.sprite = opts.sprite || 'arrow'; // 'arrow' | 'bolt' | 'shell'
    this.crit = !!opts.crit;
    this.critMult = opts.critMult || 2;
    this.onHit = opts.onHit || null;
    this.color = opts.color || '#e8e8e8';
    this.dead = false;
    this.angle = 0;
    this.animTimer = 0; this.animFrame = 0;
  }

  update(dt, game) {
    let tx, ty;
    if (this.target && !this.target.dead) { tx = this.target.x; ty = this.target.y - 6; }
    else if (this.targetX !== undefined) { tx = this.targetX; ty = this.targetY; }
    else { this.dead = true; return; }

    this.animTimer += dt;
    if (this.animTimer > 1 / 16) { this.animTimer = 0; this.animFrame++; }

    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    this.angle = Math.atan2(dy, dx);
    const step = this.speed * dt;
    if (dist <= step || dist < 4) {
      this.x = tx; this.y = ty;
      this._explode(game);
      this.dead = true;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  _explode(game) {
    if (this.splash > 0) {
      // Nổ AOE (pháo/splash) dùng bản nổ khói+lửa đầy đủ hơn (Update 010) cho "đã tay"
      // hơn cú đánh trúng đơn lẻ bên dưới.
      game.effects.push(new Effect(this.x, this.y, this.splash, 0.4, 'explosion3', 'burst'));
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) <= this.splash) {
          DamageSystem.applyTo(game, e, this.damage, this.damageType, { crit: this.crit, critMult: this.critMult });
        }
      }
    } else if (this.target && !this.target.dead) {
      DamageSystem.applyTo(game, this.target, this.damage, this.damageType, { crit: this.crit, critMult: this.critMult });
      game.effects.push(new Effect(this.x, this.y, 20, 0.25, 'explosion2', 'burst'));
    }
    if (this.onHit) this.onHit(game, this.target, this.x, this.y);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (this.sprite === 'arrow') {
      const img = AssetLoader.getImage('arrow');
      if (img) {
        ctx.drawImage(img, -16, -16, 32, 32);
      } else {
        // TODO: thay bằng sprite thật khi có asset (mũi tên 32x32)
        ctx.fillStyle = '#d8c68a';
        ctx.fillRect(-10, -2, 20, 4);
      }
    } else if (this.sprite === 'bolt') {
      // Đạn phép: dùng animation lửa "Tiny Swords" (không có sprite phép riêng trong pack)
      const img = AssetLoader.getImage('fire1');
      if (img) {
        const frameSize = 64;
        const frames = Math.floor(img.width / frameSize);
        const f = this.animFrame % frames;
        ctx.drawImage(img, f * frameSize, 0, frameSize, frameSize, -16, -16, 32, 32);
      } else {
        // TODO: thay bằng sprite thật khi có asset (đạn phép 32x32, animation)
        ctx.fillStyle = '#a34dff';
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      }
    } else if (this.sprite === 'shell') {
      // Đạn pháo: thỏi thuốc nổ "Dynamite" (Tiny Swords Update 010) bay tới, tia lửa
      // ngòi nổ nhấp nháy theo animFrame (đã tick sẵn trong update(), 16fps).
      const img = AssetLoader.getImage('dynamite');
      if (img) {
        const frameSize = 64;
        const frames = Math.floor(img.width / frameSize);
        const f = this.animFrame % frames;
        ctx.drawImage(img, f * frameSize, 0, frameSize, frameSize, -14, -14, 28, 28);
      } else {
        // TODO: thay bằng sprite thật khi có asset (đạn pháo — pack không có sẵn cannonball)
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.fillRect(-2, -2, 8, 4);
      }
    }
    ctx.restore();
  }
}

// Hiệu ứng thị giác dùng chung: vòng nổ, cảnh báo AOE, hào quang hồi máu...
class Effect {
  constructor(x, y, radius, life, color, type = 'ring') {
    this.x = x; this.y = y; this.radius = radius;
    this.life = life; this.maxLife = life;
    this.color = color; this.type = type;
    this.dead = false;
    this.animTime = 0;

    if (type === 'firefield') {
      // Rải vài đám lửa quanh tâm vùng AOE (thay vì 1 khối tròn màu phẳng),
      // mỗi đám lệch pha animation riêng để trông tự nhiên, không đồng bộ nhấp nháy.
      const count = Math.max(5, Math.round(radius / 11));
      this.particles = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius * 0.85;
        this.particles.push({
          ox: Math.cos(angle) * dist, oy: Math.sin(angle) * dist,
          phase: Math.random() * 10, scale: 0.75 + Math.random() * 0.6,
          // "fireBig" (Tiny Swords Update 010, ngọn lửa 128px) — hình lửa cháy thật
          // thay vì đốm nổ tròn (fire1-3 vốn dùng cho hiệu ứng nổ, không hợp lửa cháy lan).
          sprite: 'fireBig',
        });
      }
    }
  }
  update(dt) {
    this.life -= dt;
    this.animTime += dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const t = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = t;
    if (this.type === 'ring') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * (1.15 - t * 0.15), 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.type === 'fill') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'telegraph') {
      ctx.strokeStyle = this.color;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (this.type === 'lightning') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x2, this.y2);
      ctx.stroke();
    } else if (this.type === 'firefield') {
      ctx.globalAlpha = 1;
      const fps = 12;
      for (const p of this.particles) {
        const img = AssetLoader.getImage(p.sprite);
        const size = 46 * p.scale;
        const px = this.x + p.ox, py = this.y + p.oy;
        if (img) {
          const frameSize = 128; // fireBig: 896x128 = 7 khung 128x128 (đo thật, không đoán)
          const frames = Math.floor(img.width / frameSize);
          const f = Math.floor(this.animTime * fps + p.phase) % frames;
          ctx.drawImage(img, f * frameSize, 0, frameSize, frameSize, px - size / 2, py - size / 2, size, size);
        } else {
          // TODO: thay bằng sprite thật khi có asset (fallback đốm lửa)
          ctx.fillStyle = '#ff8a4d';
          ctx.beginPath(); ctx.arc(px, py, size * 0.3, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (this.type === 'burst') {
      // Hiệu ứng nổ dùng animation sprite "Particle FX" (Tiny Swords), field `color`
      // được tái dùng làm tên asset (explosion1/explosion2) thay vì mã màu.
      const img = AssetLoader.getImage(this.color);
      if (img) {
        const frameSize = 192;
        const frames = Math.floor(img.width / frameSize);
        const elapsed = 1 - t;
        const f = Math.min(frames - 1, Math.floor(elapsed * frames));
        const size = this.radius * 2;
        ctx.globalAlpha = 1;
        ctx.drawImage(img, f * frameSize, 0, frameSize, frameSize, this.x - size / 2, this.y - size / 2, size, size);
      } else {
        // TODO: thay bằng sprite thật khi có asset (fallback vòng nổ)
        ctx.strokeStyle = '#ff9d4d';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
