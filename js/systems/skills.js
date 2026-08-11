// ============================================================
// SKILLS.JS — Global Skills: Gọi Tiếp Viện, Mưa Lửa.
// Mỗi skill có cooldown riêng, được kích hoạt bằng click vị trí trên map.
// ============================================================
class GlobalSkills {
  constructor(game) {
    this.game = game;
    this.cooldowns = { reinforcement: 0, rainOfFire: 0 };
    this.pendingActivation = null; // 'reinforcement' | 'rainOfFire' | null (đang chờ người chơi click vị trí)
  }

  cooldownRatio(key) {
    const max = CONFIG.globalSkills[key].cooldown;
    return Math.max(0, this.cooldowns[key]) / max;
  }

  isReady(key) { return this.cooldowns[key] <= 0; }

  requestActivate(key) {
    if (!this.isReady(key)) { AssetLoader.playSound('error'); return; }
    this.pendingActivation = key;
  }

  // Gọi khi người chơi click lên map trong lúc pendingActivation != null
  confirmActivation(x, y) {
    const key = this.pendingActivation;
    if (!key) return false;
    this.pendingActivation = null;
    if (key === 'reinforcement') this._castReinforcement(x, y);
    if (key === 'rainOfFire') this._castRainOfFire(x, y);
    this.cooldowns[key] = CONFIG.globalSkills[key].cooldown;
    return true;
  }

  _castReinforcement(x, y) {
    const cfg = CONFIG.globalSkills.reinforcement;
    for (let i = 0; i < cfg.unitCount; i++) {
      const off = (i - (cfg.unitCount - 1) / 2) * 22;
      const s = new Soldier(x + off, y, {
        hp: cfg.unitHp, dmg: cfg.unitDmg, atkRate: 0.8, armor: 0.1, respawn: 999999,
        spriteSet: 'base', temporary: true, lifespan: cfg.duration,
      }, null);
      this.game.soldiers.push(s);
    }
    AssetLoader.playSound('boost');
  }

  _castRainOfFire(x, y) {
    const cfg = CONFIG.globalSkills.rainOfFire;
    this.game.pendingAoe.push({
      x, y, radius: cfg.radius, delay: cfg.delay, duration: cfg.duration,
      tick: cfg.tick, tickTimer: cfg.tick, damagePerTick: cfg.damagePerTick, elapsed: 0, exploded: false,
    });
    AssetLoader.playSound('boost');
  }

  update(dt) {
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
  }
}
