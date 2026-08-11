// ============================================================
// HERO.JS — Nhân vật điều khiển tay: click-to-move tự do, tự động đánh quái ở gần,
// 1 active skill riêng theo lớp nhân vật (phím Q hoặc nút UI), hồi sinh.
// 3 lớp chọn ở màn Chọn Tướng (xem heroselect.js): archer (tầm xa) / spear (cận
// chiến tầm với) / tank (cận chiến trâu bò + hào quang buff lính) — định nghĩa số
// liệu + skill tập trung ở CONFIG.heroTypes, class này chỉ đọc theo this.cfg.
// ============================================================
// Tâm ngang (cxN) và ĐÁY (botN) của phần có hình trong khung, đo bằng cách quét
// kênh alpha của từng sprite thật (blue_warrior/blue_archer/purple_lancer idle,
// khung đầu) — cùng kỹ thuật enemy.js dùng cho _spriteInfo(), KHÔNG đoán. Cần vì
// khung Tiny Swords không đặt nhân vật giữa khung và chừa khoảng trống khác nhau
// dưới chân theo từng bộ sprite; nếu căn giữa khung như trước, chân Hero lệch khỏi
// mặt đất so với cây/quái (vốn đã neo đúng theo đáy đo thật).
const HERO_SPRITE_ANCHOR = {
  archer: { cxN: 0.482, botN: 0.703 },
  spear: { cxN: 0.466, botN: 0.616 },
  tank: { cxN: 0.526, botN: 0.708 },
};

class Hero {
  constructor(x, y, heroType = 'tank') {
    this.heroType = CONFIG.heroTypes[heroType] ? heroType : 'tank';
    this.cfg = CONFIG.heroTypes[this.heroType];
    const cfg = this.cfg;

    this.x = x; this.y = y;
    this.spawnX = x; this.spawnY = y;
    // "Điểm gác" — Hero rảnh (Idle, hết mục tiêu) sẽ tự đi VỀ đây thay vì đứng yên
    // tại chỗ vừa đánh xong (dễ trôi dạt về phía cuối đường/thành theo quái). Ban đầu
    // = điểm spawn (gần chỗ quái ra quân); đổi lại mỗi khi người chơi CHỦ ĐỘNG ra
    // lệnh di chuyển (xem moveTo) — click-to-move giờ định nghĩa luôn vị trí gác mới.
    this.homeX = x; this.homeY = y;
    this.maxHp = cfg.hp; this.hp = cfg.hp;
    this.speed = cfg.speed;
    this.attackRange = cfg.attackRange;
    this.attackDamage = cfg.attackDamage;
    this.attackRate = cfg.attackRate;
    this.isRanged = !!cfg.ranged;
    this.atkTimer = 0;
    this.radius = 15;

    this.moveTarget = null;
    this.selected = false; // đang chờ người chơi bấm điểm đến trên bản đồ (xem main.js)
    this.alive = true;
    this.respawnTimer = 0;
    this.hitFlash = 0;
    this.facingLeft = false;
    this.animTimer = 0; this.animFrame = 0;
    this.target = null;
    // 'Idle' | 'Engage' (đang tự đi tới quái gần) | 'Combat' (đang đứng đánh, CHẶN
    // đường quái đó lại — xem enemy.js:engagedBy). Cung Thủ không có 'Engage' (không
    // lao vào cận chiến), chỉ đứng bắn ai lọt vào tầm.
    this.state = 'Idle';

    this.skillId = cfg.skill.id;
    this.skillCooldowns = { [this.skillId]: 0 };
    this.rootTimer = 0; // đóng băng chân (chiêu Nữ Hoàng Băng Giá) — chỉ chặn di chuyển

    this.slashFlashTimer = 0; // Lính Giáo: vệt chém vừa vẽ, chỉ để hiệu ứng nhấp nháy nhẹ
  }

  moveTo(x, y) { if (this.alive) { this.moveTarget = { x, y }; this.homeX = x; this.homeY = y; } }
  applyRoot(duration) { this.rootTimer = Math.max(this.rootTimer, duration); }

  // aimPoint (tuỳ chọn) = vị trí con trỏ chuột lúc bấm skill — dùng để LÍNH GIÁO
  // chọn hướng lao thẳng theo ý mình, thay vì bị ép lao theo mục tiêu đang đánh.
  useSkill(key, game, aimPoint) {
    if (!this.alive || key !== this.skillId) return;
    const scfg = this.cfg.skill;
    if (this.skillCooldowns[this.skillId] > 0) return;
    this.skillCooldowns[this.skillId] = scfg.cooldown;
    if (this.skillId === 'volley') this._castVolley(scfg, game);
    else if (this.skillId === 'piercingRush') this._castPiercingRush(scfg, game, aimPoint);
    else if (this.skillId === 'battleCry') this._castBattleCry(scfg, game);
  }

  // Cung Thủ — Mưa Tên: né lùi ra sau (thoát cận chiến) rồi dội 1 loạt tên xuống
  // vùng quanh mục tiêu đang đánh (hoặc phía trước nếu chưa khoá ai).
  _castVolley(scfg, game) {
    let dx = 0, dy = 1;
    const away = this.target || this.moveTarget;
    if (away) {
      const ddx = this.x - away.x, ddy = this.y - away.y;
      const d = Math.hypot(ddx, ddy) || 1;
      dx = ddx / d; dy = ddy / d;
    }
    this.x += dx * scfg.dodgeDist;
    this.y += dy * scfg.dodgeDist;
    this.moveTarget = null;

    const tx = this.target ? this.target.x : this.x - dx * scfg.dodgeDist * 2;
    const ty = this.target ? this.target.y : this.y - dy * scfg.dodgeDist * 2;
    game.effects.push(new Effect(tx, ty, scfg.radius, 0.5, '#7bdcff', 'telegraph'));
    AssetLoader.playSound('shoot', { volume: 0.4 });
    for (let i = 0; i < scfg.arrows; i++) {
      game.delayedActions.push({
        timer: 0.25 + i * scfg.arrowDelay,
        fn: () => {
          const ang = Math.random() * Math.PI * 2, dist = Math.random() * scfg.radius;
          const ax = tx + Math.cos(ang) * dist, ay = ty + Math.sin(ang) * dist * 0.6;
          game.effects.push(new Effect(ax, ay, 14, 0.2, 'explosion2', 'burst'));
          for (const e of game.enemies) {
            if (!e.dead && Math.hypot(e.x - ax, e.y - ay) <= 16) DamageSystem.applyTo(game, e, scfg.damage, 'physical');
          }
        },
      });
    }
  }

  // Lính Giáo — Cú Đâm Xuyên Phá: lao thẳng theo hướng CON TRỎ CHUỘT lúc bấm skill
  // (người chơi tự chọn hướng) — chỉ khi chuột đang ở ngoài canvas hoặc đứng yên tại
  // vị trí Hero mới rơi về mục tiêu/di chuyển hiện tại, rồi tới hướng đang quay mặt.
  _castPiercingRush(scfg, game, aimPoint) {
    let dx = this.facingLeft ? -1 : 1, dy = 0;
    const mouseAim = (aimPoint && aimPoint.x >= 0 && Math.hypot(aimPoint.x - this.x, aimPoint.y - this.y) > 4) ? aimPoint : null;
    const aim = mouseAim || this.target || this.moveTarget;
    if (aim) {
      const ddx = aim.x - this.x, ddy = aim.y - this.y;
      const d = Math.hypot(ddx, ddy) || 1;
      dx = ddx / d; dy = ddy / d;
    }
    const startX = this.x, startY = this.y;
    const endX = this.x + dx * scfg.dashDist, endY = this.y + dy * scfg.dashDist;
    this.facingLeft = dx < 0;

    // Vệt sáng dọc đường lao: nhiều đốm mờ dần dọc quãng đường thay vì 1 khối tĩnh,
    // trông có chiều dài + hướng chuyển động thay vì "dịch chuyển tức thời vô hình".
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      game.effects.push(new Effect(startX + (endX - startX) * t, startY + (endY - startY) * t, 16, 0.22 + t * 0.1, '#bfe8ff', 'fill'));
    }
    game.effects.push(new Effect(endX, endY, 26, 0.3, 'explosion1', 'burst'));
    AssetLoader.playSound('build', { volume: 0.5 });

    const dirLen = Math.hypot(endX - startX, endY - startY) || 1;
    const ux = (endX - startX) / dirLen, uy = (endY - startY) / dirLen;
    for (const e of game.enemies) {
      if (e.dead || e.hidden) continue;
      const ex = e.x - startX, ey = e.y - startY;
      const along = ex * ux + ey * uy;
      if (along < -10 || along > dirLen + 10) continue;
      const perp = Math.abs(ex * -uy + ey * ux);
      if (perp > scfg.width / 2) continue;
      DamageSystem.applyTo(game, e, scfg.damage, 'physical');
      e.applyRoot(scfg.stunDuration);
      e.pushBack(scfg.knockback);
    }

    this.x = endX; this.y = endY;
  }

  // Khiên & Kiếm — Tiếng Hét Khích Lệ: dậm đất tạo sóng xung + buff tốc độ đánh/sát
  // thương cho lính Doanh Trại trong bán kính, xem soldier.js:applyBattleCry.
  _castBattleCry(scfg, game) {
    game.effects.push(new Effect(this.x, this.y, scfg.radius, 0.5, '#ffdc78', 'ring'));
    game.effects.push(new Effect(this.x, this.y, scfg.radius * 0.5, 0.35, 'explosion1', 'burst'));
    AssetLoader.playSound('build', { volume: 0.6 });
    for (const s of game.soldiers) {
      if (s.state === 'Dead' || Math.hypot(s.x - this.x, s.y - this.y) > scfg.radius) continue;
      s.applyBattleCry(scfg.atkRateMult, scfg.dmgMult, scfg.duration);
    }
  }

  takeDamage(game, amount, type) {
    if (!this.alive) return;
    DamageSystem.applyTo(game, this, amount, type);
    if (this.hp <= 0) this._die();
  }

  _die() {
    this._releaseEngage();
    this.target = null;
    this.state = 'Idle';
    this.alive = false;
    this.respawnTimer = this.cfg.respawnTime;
  }

  update(dt, game) {
    // Từ khi Hero cận chiến có thể bị quái "khoá" đánh trả qua engagedBy (giống lính
    // Doanh Trại — xem enemy.js), đường sát thương đó gọi thẳng DamageSystem.applyTo
    // và chỉ set cờ `dead` chung (KHÔNG đi qua takeDamage()/_die() thủ công) — nên
    // phải poll cờ này mỗi frame giống Soldier/Enemy, nếu không Hero "chết" mà không
    // bao giờ hồi sinh (alive vẫn true, hp âm).
    if (this.dead) { this.dead = false; if (this.alive) this._die(); }

    for (const k in this.skillCooldowns) this.skillCooldowns[k] = Math.max(0, this.skillCooldowns[k] - dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.rootTimer > 0) this.rootTimer -= dt;
    if (this.slashFlashTimer > 0) this.slashFlashTimer -= dt;

    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.alive = true;
        this.hp = this.maxHp;
        this.x = this.spawnX; this.y = this.spawnY;
        this.homeX = this.spawnX; this.homeY = this.spawnY; this.moveTarget = null;
      }
      return;
    }

    if (this.moveTarget && this.rootTimer <= 0) {
      // Lệnh di chuyển của người chơi LUÔN ƯU TIÊN TUYỆT ĐỐI — không còn bị việc tự
      // động giao tranh ngắt giữa chừng (trước đây hễ có quái lọt vào tầm là Hero
      // đứng khựng lại đánh nhau, bấm đi đâu cũng không tới nơi). Bấm đi đâu là đi
      // thẳng tới đó; Hero vẫn có thể bị quái áp sát phản đòn (xem vòng lặp bên
      // dưới) nhưng sẽ không tự dừng lại để rượt/đánh.
      if (this.target) { this._releaseEngage(); this.target = null; }
      this.state = 'Move';
      const dx = this.moveTarget.x - this.x, dy = this.moveTarget.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) { this.moveTarget = null; }
      else {
        this.facingLeft = dx < 0;
        const step = this.speed * dt;
        this.x += (dx / dist) * Math.min(step, dist);
        this.y += (dy / dist) * Math.min(step, dist);
      }
      this._animate(dt, true);
    } else {
      // Mất mục tiêu đang đánh (chết/thoát/ra khỏi tầm) -> nhả khoá chặn đường, để
      // quái đó (nếu còn sống) được tự do đi tiếp/bị người khác giữ chân.
      if (this.target && (this.target.dead || this.target.reachedEnd || Math.hypot(this.target.x - this.x, this.target.y - this.y) > this.attackRange + (this.target.radius || 0))) {
        this._releaseEngage();
        this.target = null;
      }
      if (!this.target) this.target = this._findNearestEnemy(game);

      if (this.target) {
        // Trong tầm đánh -> đứng đánh (Combat) và CHẶN đường quái đó lại (khoá
        // engagedBy giống lính Doanh Trại) nếu chưa ai giữ — đúng nghĩa "chặn đánh
        // địch" thay vì chỉ đứng cho ăn dmg mà quái vẫn đi xuyên qua như trước. Cung
        // Thủ bắn xa nên KHÔNG chặn đường (không cận chiến với ai). Quái vẫn PHẢI đi
        // hết được tới cuối đường nếu không ai hạ được nó kịp — Hero chỉ CHẶN đúng 1
        // con đang giao tranh trực tiếp, không chặn cả luồng quái phía sau.
        this.state = 'Combat';
        if (!this.isRanged && !this.target.engagedBy) this.target.engagedBy = this;
        this.atkTimer -= dt;
        if (this.atkTimer <= 0) {
          this.atkTimer = this.attackRate;
          this.facingLeft = this.target.x < this.x;
          this._attack(game);
        }
        this._animate(dt, false);
      } else if (!this.isRanged) {
        // Không có ai trong tầm đánh -> hero cận chiến (Giáo/Khiên&Kiếm) TỰ ĐI tới
        // quái gần nhất trong bán kính dò để chủ động giao tranh, thay vì đứng yên
        // chờ quái tự đi ngang qua. Cung Thủ (isRanged) KHÔNG lao vào cận chiến, chỉ
        // đứng bắn từ xa.
        const seek = this._findEngageTarget(game);
        if (seek) {
          this.state = 'Engage';
          const dx = seek.x - this.x, dy = seek.y - this.y;
          const dist = Math.hypot(dx, dy) || 1;
          this.facingLeft = dx < 0;
          const step = this.speed * dt;
          this.x += (dx / dist) * Math.min(step, dist);
          this.y += (dy / dist) * Math.min(step, dist);
          this._animate(dt, true);
        } else {
          this.state = 'Idle';
        }
      } else {
        this.state = 'Idle';
      }

      if (this.state === 'Idle') {
        // Rảnh hẳn (hết mục tiêu, không có lệnh di chuyển) -> tự đi VỀ điểm gác thay
        // vì đứng lì tại chỗ vừa đánh xong — nếu không Hero sẽ trôi dạt dần về phía
        // cuối đường/thành theo quái mà không bao giờ quay lại canh cửa ngõ.
        const hdx = this.homeX - this.x, hdy = this.homeY - this.y;
        const hdist = Math.hypot(hdx, hdy);
        if (hdist > 6 && this.rootTimer <= 0) {
          this.facingLeft = hdx < 0;
          const step = this.speed * dt;
          this.x += (hdx / hdist) * Math.min(step, hdist);
          this.y += (hdy / hdist) * Math.min(step, hdist);
          this._animate(dt, true);
        } else {
          this._animate(dt, false);
        }
      }
    }

    // Quái ở gần phản đòn Hero — dùng khoảng cách VÀO SÁT cố định (không phải tầm
    // đánh của Hero), để Cung Thủ đứng xa 150px không bị "cận chiến" ăn đòn vô lý.
    // Chạy KHÔNG ĐIỀU KIỆN (kể cả đang state Move) — Hero vẫn có thể ăn đòn khi băng
    // qua đám quái lúc di chuyển, chỉ là không tự dừng lại đánh trả.
    if (this.alive) {
      const RETALIATE_RANGE = 52;
      for (const e of game.enemies) {
        if (e.dead || e.hidden) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) > RETALIATE_RANGE + (e.radius || 0)) continue;
        e.heroAtkTimer = (e.heroAtkTimer || 0) - dt;
        if (e.heroAtkTimer <= 0) {
          e.heroAtkTimer = e.atkRate;
          this.takeDamage(game, e.dmg, 'physical');
          if (!this.alive) break;
        }
      }
    }
  }

  _releaseEngage() {
    if (this.target && this.target.engagedBy === this) this.target.engagedBy = null;
  }

  // Bán kính dò quái để CHỦ ĐỘNG lao tới giao tranh (chỉ hero cận chiến) — rộng hơn
  // hẳn tầm đánh, giống detectRadius của lính Doanh Trại.
  _findEngageTarget(game) {
    const RADIUS = 170;
    let best = null, bestD = RADIUS;
    for (const e of game.enemies) {
      if (e.dead || e.reachedEnd || e.hidden) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // Cung Thủ bắn tên tầm xa (có thể chí mạng theo passive Mắt Diều Hâu); Lính
  // Giáo/Khiên&Kiếm đánh cận chiến trực tiếp — riêng Lính Giáo thêm vệt sáng vũ khí
  // (passive Tầm Với) mỗi lần đâm trúng.
  _attack(game) {
    const passive = this.cfg.passive || {};
    if (this.isRanged) {
      const crit = !!(passive.critChance && Math.random() < passive.critChance);
      game.projectiles.push(new Projectile(this.x, this.y - 12, {
        target: this.target, speed: this.cfg.projectileSpeed || 420,
        damage: this.attackDamage, damageType: this.cfg.damageType || 'physical',
        sprite: 'arrow', crit, critMult: passive.critMult || 2,
      }));
      AssetLoader.playSound('shoot', { volume: 0.3 });
    } else {
      DamageSystem.applyTo(game, this.target, this.attackDamage, this.cfg.damageType || 'physical');
      AssetLoader.playSound('hurt', { volume: 0.25 });
      if (passive.trailColor) {
        const mx = (this.x + this.target.x) / 2, my = (this.y + this.target.y) / 2;
        game.effects.push(new Effect(mx, my, 18, 0.15, passive.trailColor, 'fill'));
        this.slashFlashTimer = 0.15;
      }
    }
  }

  damageTypeOr(t) { return this.cfg.damageType || t; }

  // Cộng thêm bán kính THẬT của quái vào tầm đánh — quái thường (radius ~13-15) thì
  // không khác biệt mấy, nhưng boss (radius tới ~88 do scale x1.7-2.0) mà chỉ so
  // theo tâm-tới-tâm với 1 con số tầm đánh cố định thì boss trông như đứng sát Hero
  // (thân hình to đùng chạm nhau) nhưng vẫn bị coi là "ngoài tầm", không đánh được
  // nhau — đây chính là lý do boss/mini-boss "không đánh lại".
  _findNearestEnemy(game) {
    let best = null, bestD = Infinity;
    for (const e of game.enemies) {
      if (e.dead || e.hidden) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      const reach = this.attackRange + (e.radius || 0);
      if (d <= reach && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  _animate(dt, moving) {
    this.animTimer += dt;
    const fps = moving ? 8 : 4;
    if (this.animTimer > 1 / fps) { this.animTimer = 0; this.animFrame++; }
  }

  draw(ctx) {
    if (!this.alive) return;
    // Hào quang dưới chân + icon nhấp nhô trên đầu — LUÔN hiện (không cần chọn), để
    // Hero nổi bật hẳn giữa đám lính/tháp cùng tông xanh dương ngay cả khi zoom xa.
    // Vẽ hào quang TRƯỚC thân để không đè lên sprite nhân vật.
    this._drawGlow(ctx);
    // Đang CHỌN (chờ bấm điểm đến) -> thêm vòng tròn nét đứt xoay quanh chân, để
    // người chơi biết rõ cú bấm tiếp theo trên bản đồ sẽ ra lệnh cho Hero.
    if (this.selected) {
      ctx.save();
      ctx.translate(this.x, this.y + 12);
      ctx.rotate(performance.now() / 700);
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 11, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.facingLeft) ctx.scale(-1, 1);

    const walkingHome = this.state === 'Idle' && Math.hypot(this.homeX - this.x, this.homeY - this.y) > 6;
    const moving = this.state === 'Engage' || this.state === 'Move' || walkingHome;
    const key = this.target ? this.cfg.spriteAttack : (moving ? this.cfg.spriteRun : this.cfg.spriteIdle);
    const img = AssetLoader.getImage(key);
    const flashAmount = this.hitFlash > 0 ? Math.min(1, this.hitFlash * 4) : 0;
    // Lính Giáo mượn tạm sprite Lancer màu TÍM (pack không có bản xanh dương) — nhuộm
    // lại bằng ctx.filter cho khớp tông phe người chơi, không cần vẽ asset mới.
    const needsTint = this.heroType === 'spear';
    if (needsTint) ctx.filter = 'hue-rotate(200deg) saturate(1.3) brightness(1.05)';
    if (img) {
      const frameSize = this.cfg.frame || 192;
      const cols = Math.max(1, Math.floor(img.width / frameSize));
      const f = this.animFrame % cols;
      const size = this.heroType === 'archer' ? 46 : 50;
      const yOff = SpriteFX.hopOffset(this.hitFlash, 0.15);
      // Neo ĐÁY sprite (chân) đúng theo đo thật — giống hệt cách cây/quái đã neo —
      // để Hero đứng "trên mặt đất" cùng 1 trục y với mọi vật khác trong cảnh.
      const anchor = HERO_SPRITE_ANCHOR[this.heroType] || { cxN: 0.5, botN: 0.7 };
      const dx = -size * anchor.cxN, dy = -size * anchor.botN + yOff;
      SpriteFX.drawFrame(ctx, img, f * frameSize, 0, frameSize, frameSize, dx, dy, size, size, flashAmount);
    } else {
      // TODO: thay bằng sprite thật khi có asset (Hero 192x192, Idle/Run/Attack)
      ctx.fillStyle = flashAmount ? '#ff6a6a' : '#3ea1e0';
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    }
    if (needsTint) ctx.filter = 'none';
    ctx.restore();

    this._drawMarker(ctx);
    this._drawHpBar(ctx);
  }

  // Vòng hào quang dưới chân: quầng sáng gradient + viền elip nhấp nháy theo nhịp
  // sin, cùng ngôn ngữ hình ảnh với hào quang buff của lính (soldier.js) nhưng LUÔN
  // bật và tông sáng hơn hẳn — không thể nhầm Hero với lính/tháp khi nhìn thoáng qua.
  _drawGlow(ctx) {
    const pulse = 0.7 + Math.sin(performance.now() / 340) * 0.3;
    ctx.save();
    ctx.translate(this.x, this.y + 12);
    const r = 27;
    const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
    g.addColorStop(0, `rgba(120, 220, 255, ${0.55 * pulse})`);
    g.addColorStop(1, 'rgba(120, 220, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(190, 240, 255, ${0.85 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.6, r * 0.27, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Kim cương vàng nhấp nhô trên đầu — dấu hiệu "đây là Hero" nhận ra được ngay cả
  // khi thu nhỏ/nhìn thoáng giữa đám đông lính+quái, không lẫn với icon trạng thái
  // (rễ băng/độc) vốn nhỏ và chỉ hiện khi có debuff.
  _drawMarker(ctx) {
    const bob = Math.sin(performance.now() / 340) * 3;
    ctx.save();
    ctx.translate(this.x, this.y - 46 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffdc78';
    ctx.strokeStyle = 'rgba(80,50,10,0.85)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeRect(-5, -5, 10, 10);
    ctx.restore();
  }

  _drawHpBar(ctx) {
    const w = 30;
    const ratio = Math.max(0, this.hp / this.maxHp);
    ctx.save();
    ctx.translate(this.x, this.y - 34);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-w / 2 - 1, -1, w + 2, 6);
    ctx.fillStyle = '#5cc9ff';
    ctx.fillRect(-w / 2, 0, w * ratio, 4);
    ctx.restore();
  }
}
