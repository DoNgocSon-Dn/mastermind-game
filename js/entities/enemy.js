// ============================================================
// ENEMY.JS — class Enemy dùng chung cho Thường/Nhanh/Trâu/Bay/Boss
// (định nghĩa số liệu tập trung tại CONFIG.enemies, không tạo subclass
// riêng cho từng loại vì hành vi giống nhau, chỉ khác chỉ số + sprite).
// ============================================================
let ENEMY_UID = 1;

class Enemy {
  // tunnelIndex: null (mặc định) = quái này ĐI HẾT đường bình thường, đi ngang qua
  // miệng hầm mà không có phản ứng gì — chỉ quái được wave chỉ định rõ số hầm
  // (map.tunnels[tunnelIndex]) mới thật sự dùng hầm đó. Nhờ vậy KHÔNG phải wave nào
  // /con nào cũng bị bắt buộc chui hầm, tuyến đường chính vẫn luôn liền mạch.
  constructor(type, waypoints, waveScale = 1, tunnelIndex = null) {
    const base = CONFIG.enemies[type];
    this.id = ENEMY_UID++;
    this.type = type;
    this.isFlying = !!base.isFlying;
    this.isBoss = !!base.isBoss;
    this.waypoints = waypoints;
    this.wpIndex = 0;
    // Lệch nhẹ ngẫu nhiên khỏi điểm spawn để nhiều quái ra cùng lúc (chế độ burst)
    // không đứng chồng khít lên nhau — vì cùng waypoints/tốc độ nên nếu spawn trùng
    // điểm, chúng sẽ đi song song chồng pixel-perfect suốt đường, trông như 1 con.
    this.x = waypoints[0].x + (Math.random() - 0.5) * 14;
    this.y = waypoints[0].y + (Math.random() - 0.5) * 14;
    this.scale = base.scale || 1;
    // Chiều cao THẬT của sinh vật trên màn hình (không phải cạnh khung sprite) — dùng
    // để đặt thanh máu/icon trạng thái ngay trên đầu, nên phải khớp với sprite mới.
    const baseVisualSize = {
      normal: 30, fast: 26, tank: 30, flying: 24, boss: 52,
      bossSpring: 56, bossSummer: 52, bossAutumn: 46, bossWinter: 48,
      splitter: 34, splitling: 22,
    }[type] || 32;
    this.radius = (baseVisualSize * this.scale) / 2; // dùng để đặt thanh máu/icon trạng thái ngay trên đầu sprite

    this.maxHp = Math.round(base.hp * waveScale);
    this.hp = this.maxHp;
    this._waveScale = waveScale; // giữ lại để lỡ splitter tách ra thì con sinh ra cũng scale đúng theo wave
    this.baseSpeed = base.speed;
    this.speed = base.speed;
    this.armor = base.armor;
    this.magicResist = base.magicResist;
    this.reward = base.reward;
    this.tint = base.tint || null;
    this.dmg = base.dmg || 6;
    this.atkRate = base.atkRate || 1.0;
    this.atkTimer = 0;

    this.dead = false;
    this.reachedEnd = false;
    this.hasSplit = false; // chỉ dùng cho type 'splitter' — đảm bảo mỗi con chỉ tách 1 lần
    this.hitFlash = 0;
    this.progress = 0; // 0..1 dọc theo path, dùng để chọn mục tiêu ưu tiên

    // Trạng thái đặc biệt
    this.rootTimer = 0;
    this.poison = null; // { dmgPerTick, tickTimer, tickInterval, timeLeft }
    this.polymorphTimer = 0;
    this.engagedBy = null; // Soldier đang giữ chân (nếu có)
    // Quái không có sprite "đánh" riêng (asset pack chỉ có Idle/Run) — khi đứng lại
    // giáp lá cà (xem engagedBy ở update()), nếu không có tín hiệu gì thì trông như
    // đứng yên vô hại dù vẫn đang gây sát thương thật. attackPulse nhô người về phía
    // mục tiêu đúng nhịp mỗi lần ra đòn để người chơi NHÌN THẤY nó phản đòn.
    this.attackPulse = 0;

    // Boss hành vi đặc biệt
    this.healCycle = base.isBoss ? 8 : 0;
    this.healTimer = this.healCycle;
    this.bossAbility = base.bossAbility || null; // {type, cooldown, ...} — 4 boss theo mùa
    this.abilityTimer = this.bossAbility ? this.bossAbility.cooldown : 0;

    // animation
    this.animTimer = 0;
    this.animFrame = 0;
    this.facingLeft = false;
    this._floatPhase = Math.random() * Math.PI * 2; // lắc bay lên xuống cho quái bay

    // Vừa ra quân: rơi/nhảy xuống từ trên cao vào đúng điểm spawn thay vì hiện ra
    // giữa không trung ngay tại chỗ — cho cảm giác "chui ra từ hang/nhảy khỏi vách"
    // thay vì bỗng dưng xuất hiện từ hư không. Chỉ ảnh hưởng hình vẽ + trễ 1 nhịp
    // ngắn trước khi bắt đầu di chuyển, không đổi logic waypoint/traveled.
    this.spawnDropDuration = 0.28;
    this.spawnDropTimer = this.spawnDropDuration;
    this.spawnDropHeight = 54 + Math.random() * 18;

    // Đường hầm bí mật (map.tunnels, xem map.js) — quái ĐƯỢC GÁN tunnelIndex mà đi
    // ngang miệng hầm số đó sẽ ẨN đi (vô hình + không thể nhắm bắn) một nhịp ngắn rồi
    // "chui lên" tại cửa ra CÙNG TRÊN ĐƯỜNG NÀY, tiếp tục đi bình thường từ đó.
    this.tunnelIndex = tunnelIndex;
    this.hidden = false;
    this.usedTunnel = false;
    this.tunnelTimer = 0;
    this._tunnelExitPoint = null;

    this._computeTotalLength();
  }

  _computeTotalLength() {
    let total = 0;
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      total += Math.hypot(this.waypoints[i + 1].x - this.waypoints[i].x, this.waypoints[i + 1].y - this.waypoints[i].y);
    }
    this.totalLength = total || 1;
    this.traveled = 0;
  }

  get isPolymorphed() { return this.polymorphTimer > 0; }
  get isRooted() { return this.rootTimer > 0; }

  applyRoot(duration) { this.rootTimer = Math.max(this.rootTimer, duration); }
  applyPoison(dmgPerTick, duration, tickInterval) {
    this.poison = { dmgPerTick, tickTimer: tickInterval, tickInterval, timeLeft: duration };
  }
  applyPolymorph(duration) { this.polymorphTimer = Math.max(this.polymorphTimer, duration); }
  pushBack(amount) {
    this.traveled = Math.max(0, this.traveled - amount);
    this._relocateAlongPath();
  }

  _relocateAlongPath() {
    let remain = this.traveled;
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this.waypoints[i], b = this.waypoints[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (remain <= segLen || i === this.waypoints.length - 2) {
        const t = segLen === 0 ? 0 : remain / segLen;
        this.x = a.x + (b.x - a.x) * Math.max(0, Math.min(1, t));
        this.y = a.y + (b.y - a.y) * Math.max(0, Math.min(1, t));
        this.wpIndex = i;
        break;
      }
      remain -= segLen;
    }
    this.progress = this.traveled / this.totalLength;
  }

  // Sau khi "chui lên" khỏi hầm, tìm lại waypoint GẦN NHẤT với điểm ra TRONG CHÍNH
  // this.waypoints (đường vẫn liền mạch 1 tuyến duy nhất, không đổi sang path khác)
  // rồi gán lại wpIndex/traveled cho khớp, để progress/tower targeting đúng thay vì
  // đứng yên ở traveled cũ (đằng trước xa, trước khi vào hầm).
  _relocateToNearestWaypoint(point) {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < this.waypoints.length; i++) {
      const d = Math.hypot(this.waypoints[i].x - point.x, this.waypoints[i].y - point.y);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    this.wpIndex = Math.min(bestI, this.waypoints.length - 2);
    let traveled = 0;
    for (let i = 0; i < this.wpIndex; i++) {
      traveled += Math.hypot(this.waypoints[i + 1].x - this.waypoints[i].x, this.waypoints[i + 1].y - this.waypoints[i].y);
    }
    this.traveled = traveled;
    this.progress = this.traveled / this.totalLength;
  }

  update(dt, game) {
    if (this.dead) return;

    if (this.spawnDropTimer > 0) {
      this.spawnDropTimer -= dt;
      this._animate(dt, false);
      return; // đứng yên tại điểm spawn cho tới khi "rơi" xong mới bắt đầu đi
    }

    // Đang ẩn dưới hầm — vô hình, đứng yên, chờ hết giờ rồi "chui lên" tại cửa ra
    // (vẫn TRÊN CÙNG đường đi liền mạch này, chỉ là nhảy cóc bỏ qua đoạn giữa).
    if (this.tunnelTimer > 0) {
      this.tunnelTimer -= dt;
      if (this.tunnelTimer <= 0) {
        this.hidden = false;
        this.x = this._tunnelExitPoint.x; this.y = this._tunnelExitPoint.y;
        this._relocateToNearestWaypoint(this._tunnelExitPoint);
      }
      return;
    }

    // Vừa bước vào miệng hầm ĐÚNG SỐ được gán (tunnelIndex) -> ẩn đi rồi "chui lên"
    // sau 1 nhịp ngắn. Quái không được gán hầm nào (tunnelIndex null) sẽ đi ngang qua
    // mọi miệng hầm mà không có phản ứng gì — không phải wave/con nào cũng dùng hầm.
    if (this.tunnelIndex != null && !this.usedTunnel && game.map.tunnels) {
      const t = game.map.tunnels[this.tunnelIndex];
      if (t && Math.hypot(this.x - t.x, this.y - t.y) <= (t.r || 22)) {
        this.usedTunnel = true;
        this.hidden = true;
        this.tunnelTimer = 0.55;
        this._tunnelExitPoint = { x: t.exitX, y: t.exitY };
        this._animate(dt, false);
        return;
      }
    }

    // Trạng thái theo thời gian
    if (this.rootTimer > 0) this.rootTimer -= dt;
    if (this.polymorphTimer > 0) this.polymorphTimer -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.poison && this.poison.timeLeft > 0) {
      this.poison.timeLeft -= dt;
      this.poison.tickTimer -= dt;
      if (this.poison.tickTimer <= 0) {
        this.poison.tickTimer = this.poison.tickInterval;
        DamageSystem.applyTo(game, this, this.poison.dmgPerTick, 'true');
      }
      if (this.poison.timeLeft <= 0) this.poison = null;
    }

    // Boss: tự hồi máu định kỳ + tăng tốc khi máu thấp
    if (this.isBoss) {
      this.healTimer -= dt;
      if (this.healTimer <= 0) {
        this.healTimer = this.healCycle;
        this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.03));
      }
      this.speed = this.hp < this.maxHp * 0.3 ? this.baseSpeed * 1.6 : this.baseSpeed;
    }
    if (this.bossAbility) this._updateBossAbility(dt, game);

    // Cơ chế 1 kèm 1: 1 con quái chỉ bị ĐÚNG 1 lính giữ chân, và ngược lại.
    // - Lính đang chạy tới (Engage): quái VẪN đi tiếp, nhưng chỗ đã bị "đặt gạch" nên
    //   lính khác không nhảy vào cùng 1 con.
    // - Lính đã áp sát (Combat): quái đứng lại đánh nhau tay đôi, không đi tiếp nữa.
    // Chỉ nhả khoá khi lính chết/bị xoá/đã đổi mục tiêu — nếu nhả sớm (như bản cũ, hễ
    // lính chưa ở Combat là nhả) thì suốt lúc lính chạy tới, con quái lại bị lính khác
    // giành mất, dẫn tới nhiều lính bâu vào 1 con còn con khác đi thẳng qua.
    if (this.engagedBy) {
      const s = this.engagedBy;
      const stillMine = s.target === this && s.state !== 'Dead' && !s.removed;
      if (!stillMine) {
        this.engagedBy = null;
      } else if (s.state === 'Combat') {
        this.facingLeft = s.x < this.x;
        this.atkTimer -= dt;
        if (this.atkTimer <= 0) {
          this.atkTimer = this.atkRate;
          DamageSystem.applyTo(game, s, this.dmg, 'physical');
          this.attackPulse = 0.22;
          // Boss to hẳn (scale x1.7-2.0) đứng đè gần hết thân lính khiến 1 cú nhô
          // người 7px gần như vô hình trên nền sprite khổng lồ — thêm tia va chạm
          // ngay chỗ tiếp xúc để dù không thấy quái "nhích", người chơi vẫn thấy RÕ
          // đúng khoảnh khắc nó vừa ra đòn.
          game.effects.push(new Effect((this.x + s.x) / 2, (this.y + s.y) / 2, 20, 0.22, 'explosion2', 'burst'));
        }
        if (this.attackPulse > 0) this.attackPulse -= dt;
        this._animate(dt, false);
        return;
      }
    }
    if (this.attackPulse > 0) this.attackPulse -= dt;

    if (this.isRooted) { this._animate(dt, false); return; }

    // Di chuyển theo waypoint
    const target = this.waypoints[this.wpIndex + 1];
    if (!target) { this.reachedEnd = true; return; }
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist < Math.max(step, 4)) {
      this.traveled += dist;
      this.wpIndex++;
      if (this.wpIndex >= this.waypoints.length - 1) { this.reachedEnd = true; }
    } else {
      this.facingLeft = dx < 0;
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.traveled += step;
    }
    this.progress = Math.min(1, this.traveled / this.totalLength);

    // Ngã ba đặc biệt (Phân Thân): quái "splitter" đi được đúng nửa đường -> tự tách
    // thành 3 "splitling" toả ra 3 hướng lệch nhau (xem _split) rồi biến mất, không
    // tính là bị hạ (không cộng vàng, xem CONFIG.enemies.splitter — reward:0).
    if (this.type === 'splitter' && !this.hasSplit && this.progress >= 0.5) {
      this.hasSplit = true;
      this._split(game);
      return;
    }
    this._animate(dt, true);
  }

  // Tách 1 splitter thành 3 splitling, mỗi con bám 1 nhánh đường LỆCH sang trái/giữa
  // /phải so với đường gốc (tính từ đúng điểm tách trở đi) — tạo cảm giác "toả ra 3
  // hướng" mà không cần map nào phải tự vẽ ngã ba thật (dùng được cho MỌI map).
  _split(game) {
    this.dead = true;
    game.effects.push(new Effect(this.x, this.y, 44, 0.45, '#c34dff', 'burst'));
    AssetLoader.playSound('hurt', { volume: 0.55 });
    const hpFrac = Math.max(0.34, this.hp / this.maxHp); // đánh dập máu splitter trước khi tách -> con sinh ra cũng yếu theo
    for (const off of [-28, 0, 28]) {
      const child = new Enemy('splitling', this._buildOffsetPath(off), this._waveScale, null);
      child.hp = child.maxHp = Math.round(child.maxHp * hpFrac);
      game.enemies.push(child);
    }
  }

  // Nhánh đường riêng cho 1 splitling: giữ nguyên các khúc cua CÒN LẠI phía trước
  // (từ vị trí hiện tại), chỉ đẩy lệch sang bên theo vector vuông góc với hướng đi
  // tại từng đoạn — offset âm/dương/0 cho ra 3 làn chạy song song lệch nhau.
  _buildOffsetPath(off) {
    const remaining = this.waypoints.slice(this.wpIndex + 1);
    const pts = [{ x: this.x, y: this.y }];
    let prev = { x: this.x, y: this.y };
    for (const cur of remaining) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;
      pts.push({ x: cur.x + px * off, y: cur.y + py * off });
      prev = cur;
    }
    return pts;
  }

  _animate(dt, moving) {
    this.animTimer += dt;
    const fps = moving ? 8 : 4;
    if (this.animTimer > 1 / fps) { this.animTimer = 0; this.animFrame++; }
    if (this.isFlying) this._floatPhase += dt * 4;
  }

  // Chiêu riêng của 4 boss theo mùa — kích hoạt định kỳ theo bossAbility.cooldown.
  _updateBossAbility(dt, game) {
    this.abilityTimer -= dt;
    if (this.abilityTimer > 0) return;
    const a = this.bossAbility;
    this.abilityTimer = a.cooldown;

    if (a.type === 'healAura') {
      // Cổ Thụ Tinh (Xuân): hồi máu cho bản thân + quái khác quanh nó.
      game.effects.push(new Effect(this.x, this.y, a.radius, 0.5, '#5cff8a', 'ring'));
      for (const e of game.enemies) {
        if (e.dead || Math.hypot(e.x - this.x, e.y - this.y) > a.radius) continue;
        e.hp = Math.min(e.maxHp, e.hp + a.amount);
      }
    } else if (a.type === 'burnNova') {
      // Chúa Tể Hoả Diệm (Hạ): nổ lửa quanh mình, gây sát thương Hero + lính gần đó.
      game.effects.push(new Effect(this.x, this.y, a.radius, 0.4, 'explosion1', 'burst'));
      if (game.hero.alive && Math.hypot(game.hero.x - this.x, game.hero.y - this.y) <= a.radius) {
        DamageSystem.applyTo(game, game.hero, a.damage, 'magic');
      }
      for (const s of game.soldiers) {
        if (s.state === 'Dead' || Math.hypot(s.x - this.x, s.y - this.y) > a.radius) continue;
        DamageSystem.applyTo(game, s, a.damage, 'magic');
      }
    } else if (a.type === 'mistWeaken') {
      // Vương Sương Mù (Thu): sương mù giảm tầm bắn các tháp quanh nó.
      game.effects.push(new Effect(this.x, this.y, a.radius, 0.6, '#8a7ab0', 'telegraph'));
      for (const t of game.towers) {
        if (Math.hypot(t.x - this.x, t.y - this.y) <= a.radius) t.applyRangeDebuff(a.rangeMult, a.duration);
      }
    } else if (a.type === 'frostSlow') {
      // Nữ Hoàng Băng Giá (Đông, boss cuối): băng giá làm chậm tốc độ bắn tháp quanh nó,
      // thỉnh thoảng đóng băng chân Hero nếu đứng gần.
      game.effects.push(new Effect(this.x, this.y, a.radius, 0.6, '#bfe8ff', 'ring'));
      for (const t of game.towers) {
        if (Math.hypot(t.x - this.x, t.y - this.y) <= a.radius) t.applyRateDebuff(a.rateMult, a.duration);
      }
      if (game.hero.alive && Math.random() < a.rootChance && Math.hypot(game.hero.x - this.x, game.hero.y - this.y) <= a.rootRadius) {
        game.hero.applyRoot(a.rootDuration);
      }
    }
  }

  draw(ctx) {
    if (this.hidden) return; // đang ở dưới hầm — vô hình hoàn toàn, xem update()

    // Đang trong pha "rơi xuống" spawn: lệch lên trên theo easing rơi nhanh dần
    // (dropT: 1→0), mờ dần vào + bóng đổ dưới đất phình to khi sắp chạm đất — để
    // quái trông như vừa nhảy/rơi xuống điểm spawn, không phải hiện ra tức thì.
    const dropping = this.spawnDropTimer > 0;
    const dropT = dropping ? this.spawnDropTimer / this.spawnDropDuration : 0;
    if (dropping) {
      const shadowScale = 1 - dropT;
      ctx.save();
      ctx.globalAlpha = 0.4 * shadowScale;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius * 0.75 * shadowScale, this.radius * 0.3 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = dropping ? Math.min(1, (1 - dropT) * 1.6 + 0.25) : 1;
    ctx.translate(this.x, this.y - (dropping ? dropT * dropT * this.spawnDropHeight : 0));
    if (this.facingLeft) ctx.scale(-1, 1);
    // Quái không có sprite "đánh" riêng (asset pack chỉ có Idle/Run) nên không thể
    // phát đúng animation vung vũ khí thật — attackPulse giả lập khoảnh khắc va chạm
    // bằng cách nghiêng + nhô người + bẹp nhẹ theo thân (như vừa giáng 1 đòn xuống)
    // ngay lúc sát thương thực sự được áp, rồi bật thẳng lại dần — không có pha
    // "lấy đà" trước đó vì thời điểm gây damage đã cố định, chỉ làm được phần va chạm.
    if (this.attackPulse > 0) {
      const t = this.attackPulse / 0.22; // 1 = vừa ra đòn -> 0 = hồi xong
      const ease = t * t; // giật mạnh lúc mới trúng, êm dần về cuối
      ctx.translate(ease * 9 * this.scale, 0); // nhô người về phía mục tiêu
      // Nghiêng + bẹp thân quanh điểm chân (không phải tâm sprite) để trông như vừa
      // dồn lực xuống rồi bật lại, chứ không lệch trọng tâm lên phía trên đầu.
      ctx.translate(0, this.radius * 0.4);
      ctx.rotate(ease * 0.22);
      ctx.scale(1 + ease * 0.08, 1 - ease * 0.1);
      ctx.translate(0, -this.radius * 0.4);
    }

    if (this.isPolymorphed) {
      // Biến thành cừu: hình tròn trắng đơn giản
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(6, -2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      this._drawHpBar(ctx);
      return;
    }

    const drawn = this._drawSprite(ctx);
    if (!drawn) {
      // TODO: thay bằng sprite thật khi có asset (fallback hình học)
      ctx.fillStyle = this._fallbackColor();
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
      if (this.hitFlash > 0) {
        ctx.fillStyle = `rgba(255,50,50,${Math.min(1, this.hitFlash * 4)})`;
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    if (dropping) return; // đang rơi: bỏ thanh máu/bóng bay/icon trạng thái cho gọn
    if (this.isFlying) this._drawFlyingShadow(ctx);
    this._drawHpBar(ctx);
    if (this.isRooted) this._drawStatusIcon(ctx, '🧊');
    if (this.poison) this._drawStatusIcon(ctx, '☠');
  }

  _fallbackColor() {
    if (this.isBoss) return '#7b1e1e';
    if (this.type === 'splitter' || this.type === 'splitling') return '#a349d6';
    if (this.type === 'flying') return '#3ea1e0';
    if (this.type === 'fast') return '#e0d23e';
    if (this.type === 'tank') return '#5b6b3a';
    return '#c0432f';
  }

  // Mỗi loại quái là 1 SINH VẬT riêng từ Enemy Pack.
  // `frame` = chiều cao sprite sheet của loài đó (đo từ header PNG, KHÔNG đoán) — các
  // loài có khung khác nhau: 192 / 256 / 320 / 384.
  // `size` KHÔNG phải chiều cao con quái trên màn hình, mà là cạnh của cả KHUNG được vẽ
  // ra; mỗi loài chiếm một tỉ lệ khác nhau trong khung của nó (rùa chỉ chiếm 28% chiều
  // cao khung, troll chiếm 54%). Các số dưới đây được tính ngược từ hộp bao nội dung đo
  // trực tiếp trên ảnh, để chiều cao THẬT của quái trên màn hình đúng như thiết kế
  // (thường ~26-30px, boss ~46-56px) — nếu đặt `size` bằng nhau cho mọi loài thì rùa và
  // cá sẽ bé tí còn troll thì quá khổ.
  _spriteInfo() {
    const moving = this.rootTimer <= 0 && !(this.engagedBy && this.engagedBy.state === 'Combat');
    // `cxN`/`botN` = tâm ngang và ĐÁY của phần có hình trong khung (chuẩn hoá 0..1, đo
    // bằng cách quét kênh alpha). Cần vì sinh vật KHÔNG nằm giữa khung và luôn chừa
    // khoảng trống dưới chân — nếu cứ căn giữa khung như cũ thì quái bị lệch khỏi tim
    // đường và thanh máu không khớp thân.
    const table = {
      normal: { idle: 'enemyNormalIdle', run: 'enemyNormalRun', frame: 256, size: 65, cxN: 0.467, botN: 0.668 },
      fast: { idle: 'enemyFastIdle', run: 'enemyFastRun', frame: 192, size: 67, cxN: 0.482, botN: 0.688 },
      tank: { idle: 'enemyTankIdle', run: 'enemyTankRun', frame: 320, size: 107, cxN: 0.519, botN: 0.650 },
      flying: { idle: 'enemyFlyingIdle', run: 'enemyFlyingRun', frame: 192, size: 64, cxN: 0.477, botN: 0.703 },
      boss: { idle: 'enemyBossIdle', run: 'enemyBossRun', frame: 320, size: 128, cxN: 0.411, botN: 0.669 },
      bossSpring: { idle: 'bossSpringIdle', run: 'bossSpringRun', frame: 384, size: 104, cxN: 0.526, botN: 0.773 },
      bossSummer: { idle: 'bossSummerIdle', run: 'bossSummerRun', frame: 320, size: 128, cxN: 0.411, botN: 0.669 },
      bossAutumn: { idle: 'bossAutumnIdle', run: 'bossAutumnRun', frame: 192, size: 118, cxN: 0.505, botN: 0.677 },
      bossWinter: { idle: 'bossWinterIdle', run: 'bossWinterRun', frame: 192, size: 101, cxN: 0.466, botN: 0.714 },
      // Phân Thân: mượn tạm sprite Trâu (to) cho splitter và Nhanh (nhỏ) cho splitling
      // (pack không có sinh vật riêng cho cơ chế này) — nhuộm tím ở _drawSprite() để
      // phân biệt rõ với quái Trâu/Nhanh thường, khỏi gây hiểu lầm cùng loại.
      splitter: { idle: 'enemyTankIdle', run: 'enemyTankRun', frame: 320, size: 107, cxN: 0.519, botN: 0.650 },
      splitling: { idle: 'enemyFastIdle', run: 'enemyFastRun', frame: 192, size: 67, cxN: 0.482, botN: 0.688 },
    };
    const t = table[this.type];
    return { key: moving ? t.run : t.idle, frame: t.frame, size: t.size * this.scale, cxN: t.cxN, botN: t.botN };
  }

  // Đã có sprite quái THẬT nên KHÔNG còn nhuộm tối/gắn "mắt đỏ" nữa — 2 thứ đó chỉ là
  // cách chữa cháy hồi quái còn là unit người tái sử dụng, nay chỉ làm bẩn màu gốc của
  // sinh vật. Riêng boss theo mùa vẫn giữ lớp nhuộm để hợp tông mùa của map.
  _drawSprite(ctx) {
    const info = this._spriteInfo();
    const img = AssetLoader.getImage(info.key);
    if (!img) return false;
    const frames = Math.max(1, Math.floor(img.width / info.frame));
    const f = this.animFrame % frames;
    let yOff = 0;
    if (this.isFlying) yOff = -10 - Math.sin(this._floatPhase || 0) * 4; // bay lơ lửng nhẹ nhàng
    yOff += SpriteFX.hopOffset(this.hitFlash, 0.15); // nảy nhẹ lên khi trúng đòn
    const flashAmount = this.hitFlash > 0 ? Math.min(1, this.hitFlash * 4) : 0;

    const BOSS_FILTERS = {
      bossSpring: 'saturate(1.6) hue-rotate(70deg) brightness(0.85) contrast(1.2)',   // xanh lá tinh linh
      bossSummer: 'saturate(2.0) hue-rotate(-30deg) brightness(0.95) contrast(1.3)',  // đỏ cam lửa
      bossAutumn: 'saturate(1.3) hue-rotate(200deg) brightness(0.75) contrast(1.2)',  // tím xám sương mù
      bossWinter: 'saturate(1.4) hue-rotate(150deg) brightness(1.05) contrast(1.15)', // xanh băng
      splitter: 'saturate(1.7) hue-rotate(250deg) brightness(0.9) contrast(1.2)',    // tím — báo hiệu sắp tách
      splitling: 'saturate(1.7) hue-rotate(250deg) brightness(1.1) contrast(1.15)',  // tím nhạt hơn — con vừa tách ra
    };
    // Quái thường: để NGUYÊN màu gốc của sinh vật. Chỉ boss/Phân Thân mới nhuộm.
    const tint = BOSS_FILTERS[this.type] || (this.isBoss ? 'saturate(1.5) hue-rotate(300deg) contrast(1.15)' : null);
    if (tint) ctx.filter = tint;
    // Căn: tâm ngang của SINH VẬT trùng toạ độ quái, chân đặt ngay dưới toạ độ đó.
    const dx = -info.size * info.cxN;
    const dy = -info.size * info.botN + 6 + yOff;
    SpriteFX.drawFrame(ctx, img, f * info.frame, 0, info.frame, info.frame, dx, dy, info.size, info.size, flashAmount);
    if (tint) ctx.filter = 'none';
    return true;
  }

  _drawFlyingShadow(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.radius + 4, this.radius * 0.7, this.radius * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawHpBar(ctx) {
    const w = this.isBoss ? 44 : 24;
    const ratio = Math.max(0, this.hp / this.maxHp);
    const yOff = -(this.radius + 10);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-w / 2 - 1, yOff - 1, w + 2, 6);
    ctx.fillStyle = ratio > 0.5 ? '#4ad24a' : ratio > 0.25 ? '#e0c23e' : '#e03e3e';
    ctx.fillRect(-w / 2, yOff, w * ratio, 4);
    ctx.restore();
  }

  _drawStatusIcon(ctx, emoji) {
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.fillText(emoji, this.x + this.radius - 4, this.y - this.radius - 10);
    ctx.restore();
  }
}
