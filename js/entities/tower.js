// ============================================================
// TOWER.JS — class Tower dùng chung cho 4 loại (Archer/Barracks/Mage/
// Artillery) + toàn bộ logic Tower Tree Level 1→2→3→(4A|4B) và skill.
// ============================================================
let TOWER_UID = 1;

class Tower {
  constructor(type, x, y) {
    this.id = TOWER_UID++;
    this.type = type;
    this.x = x; this.y = y;
    this.cfg = CONFIG.towers[type];
    this.level = 1;
    this.branch = null;
    this.cooldown = 0;
    this.skillCooldown = 0;
    this.skill2Cooldown = 0;
    this.healCooldown = 0;
    this.target = null;
    this.radius = 20;
    this.selected = false;

    this.soldiers = []; // chỉ dùng cho barracks
    this.rallyPoint = null;

    if (type === 'barracks') {
      this.rallyPoint = { x: this.x, y: this.y + 46 };
    }

    // Thời gian chờ xây xong — mỗi loại tháp một mốc khác nhau (Pháo Đài lâu nhất,
    // Cung Thủ nhanh nhất), chỉ áp dụng lúc mới đặt, không lặp lại khi nâng cấp.
    this.buildTimer = this.cfg.buildTime || 0;

    // Nhân vật đứng trên/cạnh tháp (archer/mage/artillery) — thuần hiệu ứng hình ảnh,
    // không dùng cho barracks (barracks đã có lính thật đứng chặn đường).
    this.unitAnimTimer = 0;
    this.unitAnimFrame = 0;
    this.unitFireFlash = 0; // >0 = đang trong tư thế bắn/cast/thao tác, đếm ngược về 0
    this.unitFacingLeft = false;

    // Debuff tạm thời từ chiêu boss (Thu: giảm tầm bắn / Đông: giảm tốc độ bắn).
    // Timer đếm ngược bằng dt; hết giờ tự về hệ số 1 (không ảnh hưởng).
    this.rangeDebuffTimer = 0; this.rangeDebuffMult = 1;
    this.rateDebuffTimer = 0; this.rateDebuffMult = 1;
  }

  applyRangeDebuff(mult, duration) {
    this.rangeDebuffMult = mult;
    this.rangeDebuffTimer = Math.max(this.rangeDebuffTimer, duration);
  }
  applyRateDebuff(mult, duration) {
    this.rateDebuffMult = mult;
    this.rateDebuffTimer = Math.max(this.rateDebuffTimer, duration);
  }

  // Chỉ số hiện hành theo level/branch
  get stats() {
    if (this.branch) return this.cfg.branches[this.branch];
    return this.cfg.levels[this.level - 1];
  }

  get canChooseBranch() { return !this.branch && this.level >= 3; }

  get nextUpgradeCost() {
    if (this.branch || this.level >= 3) return null;
    return this.cfg.levels[this.level].cost;
  }

  get displayName() {
    return this.branch ? this.cfg.branches[this.branch].label : `${this.cfg.label} — Lv.${this.level}`;
  }

  get range() { return (this.stats.range || 0) * this.rangeDebuffMult; }

  upgrade(economy) {
    if (this.branch || this.level >= 3) return false;
    const cost = this.cfg.levels[this.level].cost;
    if (!economy.spend(cost)) return false;
    this.level++;
    if (this.type === 'barracks') this._syncSoldierStats();
    return true;
  }

  chooseBranch(branchKey, economy, game) {
    if (this.branch || this.level < 3) return false;
    const cost = this.cfg.branches[branchKey].cost;
    if (!economy.spend(cost)) return false;
    this.branch = branchKey;
    if (this.type === 'barracks') {
      this._syncSoldierStats();
      if (this.soldiers.length === 0) this._spawnSoldiers(game);
    }
    return true;
  }

  sellValue() {
    let spent = this.cfg.levels[0].cost;
    for (let i = 1; i < this.level; i++) spent += this.cfg.levels[i].cost;
    if (this.branch) spent += this.cfg.branches[this.branch].cost;
    return Math.round(spent * CONFIG.economy.sellRefundRatio);
  }

  // ---------------- Barracks: quản lý lính ----------------
  get soldierSpriteSet() {
    if (this.branch === 'A') return 'paladin';
    if (this.branch === 'B') return 'barbarian';
    return 'base';
  }

  _spawnSoldiers(game) {
    const s = this.stats;
    const n = this.cfg.soldierCount;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 26;
      // Xuất phát từ chân tháp rồi đi bộ ra rally point (mặc định là điểm gần
      // nhất trên đường) — nhìn như lính vừa xây xong tự chạy ra chặn quái.
      const sold = new Soldier(this.x + off, this.y, {
        hp: s.hp, dmg: s.dmg, atkRate: s.atkRate, armor: s.armor || 0,
        respawn: s.respawn, canHitFlying: !!s.canHitFlying, spriteSet: this.soldierSpriteSet,
      }, this);
      sold.setRallyPoint(this.rallyPoint.x + off, this.rallyPoint.y);
      this.soldiers.push(sold);
      game.soldiers.push(sold);
    }
  }

  _syncSoldierStats() {
    const s = this.stats;
    const spriteSet = this.soldierSpriteSet;
    for (const sold of this.soldiers) {
      const ratio = sold.maxHp > 0 ? sold.hp / sold.maxHp : 1;
      sold.maxHp = s.hp;
      sold.hp = Math.max(1, Math.round(s.hp * ratio));
      sold.dmg = s.dmg; sold.atkRate = s.atkRate; sold.armor = s.armor || 0;
      sold.canHitFlying = !!s.canHitFlying;
      sold.spriteSet = spriteSet;
      sold.respawnTime = s.respawn;
    }
  }

  setRallyPoint(x, y) {
    this.rallyPoint = { x, y };
    const n = this.soldiers.length;
    this.soldiers.forEach((s, i) => {
      const off = (i - (n - 1) / 2) * 26;
      s.setRallyPoint(x + off, y);
    });
  }

  // ---------------- Update ----------------
  update(dt, game) {
    if (this.buildTimer > 0) {
      this.buildTimer -= dt;
      if (this.buildTimer <= 0) {
        this.buildTimer = 0;
        if (this._hammerSfx) { AssetLoader.stopSound(this._hammerSfx); this._hammerSfx = null; }
        AssetLoader.playSound('build', { volume: 0.5 });
      }
      return; // đang xây — chưa bắn, chưa sinh lính, chưa chạy skill
    }

    if (this.rangeDebuffTimer > 0) { this.rangeDebuffTimer -= dt; if (this.rangeDebuffTimer <= 0) this.rangeDebuffMult = 1; }
    if (this.rateDebuffTimer > 0) { this.rateDebuffTimer -= dt; if (this.rateDebuffTimer <= 0) this.rateDebuffMult = 1; }

    if (this.type === 'barracks') {
      if (this.soldiers.length === 0) this._spawnSoldiers(game);
      this._updateBarracksSkills(dt, game);
      return;
    }

    this.cooldown -= dt;
    if (!this.target || this.target.dead || this._outOfRange(this.target) || (this.target.isFlying && !this._canHitFlying())) {
      this.target = this._selectTarget(game);
    }
    if (this.target && this.cooldown <= 0) {
      this.unitFacingLeft = this.target.x < this.x;
      this.unitFireFlash = 0.35; // giữ tư thế bắn/cast/thao tác một nhịp ngắn cho dễ thấy
      this._fire(game);
      this.cooldown = this.stats.rate * this.rateDebuffMult;
    }
    if (this.unitFireFlash > 0) this.unitFireFlash -= dt;
    this._animateUnit(dt);
    this._updateBranchAutoSkills(dt, game);
  }

  _animateUnit(dt) {
    this.unitAnimTimer += dt;
    const fps = this.unitFireFlash > 0 ? 10 : 5;
    if (this.unitAnimTimer > 1 / fps) { this.unitAnimTimer = 0; this.unitAnimFrame++; }
  }

  _outOfRange(e) { return Math.hypot(e.x - this.x, e.y - this.y) > this.range; }

  _canHitFlying() {
    if (this.branch) return !!this.stats.canHitFlying;
    return !!this.cfg.canHitFlying;
  }

  _selectTarget(game) {
    let best = null, bestProgress = -1;
    for (const e of game.enemies) {
      if (e.dead) continue;
      if (e.isFlying && !this._canHitFlying()) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.range && e.progress > bestProgress) { bestProgress = e.progress; best = e; }
    }
    return best;
  }

  _fire(game) {
    AssetLoader.playSound(this.type === 'artillery' ? 'explosion' : 'shoot', { volume: 0.3 });
    if (this.type === 'archer') this._fireArcher(game);
    else if (this.type === 'mage') this._fireMage(game);
    else if (this.type === 'artillery') this._fireArtillery(game);
  }

  _fireArcher(game) {
    const s = this.stats;
    let crit = !!(s.critChance && Math.random() < s.critChance);
    const branch = this.branch;
    const proj = new Projectile(this.x, this.y - 12, {
      target: this.target, speed: 430, damage: s.damage, damageType: 'physical',
      sprite: 'arrow', crit, critMult: s.critMult || 2,
      onHit: (g, t) => { if (branch === 'B' && s.poison && t && !t.dead) t.applyPoison(s.poison.damage, s.poison.duration, s.poison.tick); },
    });
    game.projectiles.push(proj);
  }

  _fireMage(game) {
    const s = this.stats;
    game.projectiles.push(new Projectile(this.x, this.y - 12, {
      target: this.target, speed: 270, damage: s.damage, damageType: 'magic', sprite: 'bolt',
    }));
  }

  _fireArtillery(game) {
    const s = this.stats;
    if (this.branch === 'B') { this._chainLightning(game, s.damage, this.cfg.branches.B.chain); return; }
    game.projectiles.push(new Projectile(this.x, this.y - 12, {
      target: this.target, speed: 210, damage: s.damage, damageType: 'physical',
      splash: s.splash || this.cfg.splash, sprite: 'shell',
    }));
  }

  _chainLightning(game, baseDamage, chainCfg) {
    let current = this.target;
    const hit = new Set();
    let dmg = baseDamage;
    let prevX = this.x, prevY = this.y - 20;
    for (let i = 0; i < chainCfg.targets && current; i++) {
      if (!current || current.dead || hit.has(current.id)) break;
      hit.add(current.id);
      DamageSystem.applyTo(game, current, dmg, 'magic');
      const fx = Object.assign(new Effect(prevX, prevY, 0, 0.15, '#7ecbff', 'lightning'));
      fx.x2 = current.x; fx.y2 = current.y;
      game.effects.push(fx);
      prevX = current.x; prevY = current.y;
      dmg *= chainCfg.falloff;
      let next = null, bestD = 95;
      for (const e of game.enemies) {
        if (e.dead || hit.has(e.id)) continue;
        const d = Math.hypot(e.x - current.x, e.y - current.y);
        if (d < bestD) { bestD = d; next = e; }
      }
      current = next;
    }
  }

  _updateBranchAutoSkills(dt, game) {
    if (!this.branch) return;
    const b = this.cfg.branches[this.branch];

    if (this.type === 'archer') {
      this.skillCooldown -= dt;
      if (this.branch === 'A') {
        if (this.skillCooldown <= 0 && this.target) { this.skillCooldown = b.skill.cooldown; this._castBarrage(game, b.skill); }
      } else {
        if (this.skillCooldown <= 0) {
          const inRange = game.enemies.filter(e => !e.dead && Math.hypot(e.x - this.x, e.y - this.y) <= this.range);
          if (inRange.length) {
            this.skillCooldown = b.skill.cooldown;
            inRange.forEach(e => e.applyRoot(b.skill.rootDuration));
            game.effects.push(new Effect(this.x, this.y, this.range, 0.4, '#3ecf6e', 'telegraph'));
          }
        }
      }
    } else if (this.type === 'mage') {
      this.skillCooldown -= dt; this.skill2Cooldown -= dt;
      if (this.branch === 'A') {
        if (this.skillCooldown <= 0 && this.target) {
          this.skillCooldown = b.skill.cooldown;
          DamageSystem.applyTo(game, this.target, b.skill.trueDamage, 'true');
          game.effects.push(new Effect(this.target.x, this.target.y, 34, 0.35, 'explosion1', 'burst'));
        }
        if (this.skill2Cooldown <= 0) {
          const inRange = game.enemies.filter(e => !e.dead && Math.hypot(e.x - this.x, e.y - this.y) <= this.range)
            .sort((a, c) => c.progress - a.progress).slice(0, b.skill2.pushCount);
          if (inRange.length) { this.skill2Cooldown = b.skill2.cooldown; inRange.forEach(e => e.pushBack(b.skill2.pushBack)); }
        }
      } else {
        if (this.skillCooldown <= 0 && this.target && !this.target.isPolymorphed) {
          this.skillCooldown = b.skill.cooldown;
          this.target.applyPolymorph(b.skill.duration);
        }
      }
    } else if (this.type === 'artillery' && this.branch === 'A') {
      this.skillCooldown -= dt; this.skill2Cooldown -= dt;
      if (this.skillCooldown <= 0 && this.target) { this.skillCooldown = b.skill.cooldown; this._castClusterBomb(game, b.skill); }
      if (this.skill2Cooldown <= 0) {
        const flying = game.enemies.find(e => !e.dead && e.isFlying && Math.hypot(e.x - this.x, e.y - this.y) <= this.range * 1.3);
        if (flying) {
          this.skill2Cooldown = b.skill2.cooldown;
          game.projectiles.push(new Projectile(this.x, this.y, { target: flying, speed: 260, damage: b.skill2.damage, damageType: 'physical', sprite: 'shell' }));
        }
      }
    }
  }

  _castBarrage(game, skillCfg) {
    const target = this.target;
    for (let i = 0; i < skillCfg.burstCount; i++) {
      game.delayedActions.push({
        timer: i * skillCfg.burstInterval,
        fn: () => {
          if (target && !target.dead) {
            game.projectiles.push(new Projectile(this.x, this.y - 10, { target, speed: 520, damage: skillCfg.burstDamage, damageType: 'physical', sprite: 'arrow' }));
          }
        },
      });
    }
  }

  _castClusterBomb(game, skillCfg) {
    const cx = this.target.x, cy = this.target.y;
    game.effects.push(new Effect(cx, cy, 80, 0.5, '#ff7d4d', 'telegraph'));
    for (let i = 0; i < skillCfg.miniCount; i++) {
      const angle = (i / skillCfg.miniCount) * Math.PI * 2;
      const dist = 20 + Math.random() * 45;
      const mx = cx + Math.cos(angle) * dist, my = cy + Math.sin(angle) * dist;
      game.delayedActions.push({
        timer: 0.15 + i * 0.05,
        fn: () => {
          game.effects.push(new Effect(mx, my, skillCfg.miniRadius, 0.3, 'explosion2', 'burst'));
          for (const e of game.enemies) {
            if (!e.dead && Math.hypot(e.x - mx, e.y - my) <= skillCfg.miniRadius) DamageSystem.applyTo(game, e, skillCfg.miniDamage, 'physical');
          }
        },
      });
    }
  }

  _updateBarracksSkills(dt, game) {
    if (!this.branch) return;
    const b = this.cfg.branches[this.branch];
    if (this.branch === 'A') {
      this.skillCooldown -= dt; this.healCooldown -= dt;
      if (this.skillCooldown <= 0) {
        const active = this.soldiers.filter(s => s.state === 'Combat');
        if (active.length) {
          this.skillCooldown = b.skill.cooldown;
          for (const s of active) {
            game.effects.push(new Effect(s.x, s.y, b.skill.radius, 0.35, '#ffe27a', 'ring'));
            for (const e of game.enemies) if (!e.dead && Math.hypot(e.x - s.x, e.y - s.y) <= b.skill.radius) DamageSystem.applyTo(game, e, b.skill.damage, 'magic');
          }
        }
      }
      if (this.healCooldown <= 0) {
        this.healCooldown = b.heal.cooldown;
        let any = false;
        for (const s of this.soldiers) { if (s.state !== 'Dead' && s.hp < s.maxHp) { s.hp = Math.min(s.maxHp, s.hp + b.heal.amount); any = true; } }
        if (any) game.effects.push(new Effect(this.x, this.y, b.heal.radius, 0.4, '#5cff8a', 'ring'));
      }
    } else {
      this.skillCooldown -= dt;
      if (this.skillCooldown <= 0) {
        const active = this.soldiers.filter(s => s.state === 'Combat' && s.target && !s.target.dead);
        if (active.length) {
          this.skillCooldown = b.skill.cooldown;
          for (const s of active) {
            DamageSystem.applyTo(game, s.target, b.skill.damage, 'physical');
            game.effects.push(new Effect(s.target.x, s.target.y, 20, 0.25, 'explosion2', 'burst'));
          }
        }
      }
    }
  }

  // ---------------- Vẽ ----------------
  draw(ctx) {
    if (this.selected && this.type !== 'barracks') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (this.type === 'barracks' && this.rallyPoint) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,120,0.7)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.rallyPoint.x, this.rallyPoint.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffdc78';
      ctx.beginPath(); ctx.arc(this.rallyPoint.x, this.rallyPoint.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Thân tháp: sprite building thật từ "Tiny Swords (Free Pack)".
    // Màu building = phe: xanh dương (gốc/Lv1-3), vàng (nhánh 4A), đỏ (nhánh 4B).
    const img = AssetLoader.getImage(this._buildingImageKey());
    const scaleUp = 1 + (this.level - 1) * 0.12 + (this.branch ? 0.15 : 0);
    const underConstruction = this.buildTimer > 0;
    if (img) {
      const targetW = 62 * scaleUp;
      const targetH = targetW * (img.height / img.width);
      const topY = this.y - targetH + 10;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 6, targetW * 0.38, targetW * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      // Đang xây: hiện giàn giáo gỗ thật (Tiny Swords Update 010) thay vì chỉ giảm
      // alpha thân tháp hoàn chỉnh — mỗi ảnh giữ đúng tỉ lệ khung hình riêng của nó
      // (không ép theo tỉ lệ thân tháp hoàn chỉnh, tránh méo hình).
      const cImg = underConstruction ? AssetLoader.getImage(this._constructionImageKey()) : null;
      if (cImg) {
        const cW = targetW;
        const cH = cW * (cImg.height / cImg.width);
        ctx.drawImage(cImg, this.x - cW / 2, this.y - cH + 10, cW, cH);
      } else {
        ctx.globalAlpha = underConstruction ? 0.45 : 1;
        ctx.drawImage(img, this.x - targetW / 2, topY, targetW, targetH);
      }
      ctx.restore();
      if (underConstruction) this._drawBuildProgress(ctx, topY, targetH);
      else if (this.type !== 'barracks') this._drawUnit(ctx, targetW, targetH, topY);
    } else {
      // TODO: thay bằng sprite thật khi có asset thân tháp (fallback hình học)
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = this.cfg.color;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // level pips
    const pipY = this.y + 14;
    ctx.save();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < Math.min(this.level, 3); i++) {
      ctx.beginPath(); ctx.arc(this.x - 8 + i * 8, pipY, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _buildingImageKey() {
    const typeMap = { archer: 'Archery', barracks: 'Barracks', mage: 'Monastery', artillery: 'Tower' };
    const colorMap = { A: 'yellow', B: 'red' };
    const color = colorMap[this.branch] || 'blue';
    return color + typeMap[this.type];
  }

  // Giàn giáo lúc đang xây: Pháo Đài dùng thân tròn (Tower_Construction, 128x256 —
  // cùng tỉ lệ với blue_tower), 3 loại còn lại dùng nền móng vuông (House_Construction)
  // vì thân hoàn chỉnh của chúng đều là nhà mái vuông.
  _constructionImageKey() {
    return this.type === 'artillery' ? 'towerConstruction' : 'houseConstruction';
  }

  // Nhân vật đứng trên/cạnh tháp: Cung Thủ đứng trên tháp Archer, Pháp Sư (Monk)
  // đứng trên tháp Mage, và người vận hành (Pawn) đứng cạnh tháp Artillery — cùng
  // tông màu với building (xanh gốc / vàng 4A / đỏ 4B). Chuyển sang tư thế
  // bắn/cast/thao tác trong lúc unitFireFlash > 0 (vừa bắn xong).
  _drawUnit(ctx, targetW, targetH, topY) {
    const colorMap = { A: 'Yellow', B: 'Red' };
    const color = colorMap[this.branch] || 'Blue';
    let idleKey, actionKey, ax, ay;
    const size = 34;
    if (this.type === 'archer') {
      idleKey = 'towerArcherIdle' + color; actionKey = 'towerArcherShoot' + color;
      ax = this.x; ay = topY + targetH * 0.12;
    } else if (this.type === 'mage') {
      idleKey = 'towerMageIdle' + color; actionKey = 'towerMageCast' + color;
      ax = this.x; ay = topY + targetH * 0.12;
    } else if (this.type === 'artillery') {
      idleKey = 'towerGunnerIdle' + color; actionKey = 'towerGunnerFire' + color;
      ax = this.x + targetW * 0.52 + 6; ay = this.y - 6;
    } else {
      return;
    }
    const img = AssetLoader.getImage(this.unitFireFlash > 0 ? actionKey : idleKey);
    if (!img) return;
    const frameSize = 192;
    const frames = Math.max(1, Math.floor(img.width / frameSize));
    const f = this.unitAnimFrame % frames;
    ctx.save();
    ctx.translate(ax, ay);
    if (this.unitFacingLeft) ctx.scale(-1, 1);
    SpriteFX.drawFrame(ctx, img, f * frameSize, 0, frameSize, frameSize, -size / 2, -size / 2, size, size, 0);
    ctx.restore();
  }

  // Thanh tiến độ + biểu tượng búa trong lúc đang xây (buildTimer > 0).
  _drawBuildProgress(ctx, topY, targetH) {
    const total = this.cfg.buildTime || 1;
    const ratio = 1 - Math.max(0, this.buildTimer) / total;
    const w = 40;
    ctx.save();
    ctx.translate(this.x, topY - 10);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-w / 2 - 1, -1, w + 2, 7);
    ctx.fillStyle = '#ffdc78';
    ctx.fillRect(-w / 2, 0, w * ratio, 5);
    ctx.restore();
    ctx.save();
    ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🔨', this.x, this.y - targetH * 0.4);
    ctx.restore();
  }
}
