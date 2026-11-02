// Local terrain mechanics. All clocks use simulation time (pause and speed included).
class EnvironmentSystem {
  constructor(map) {
    this.time = 0;
    this.kind = map.volcanic ? 'lava' : map.theme === 'winter' ? 'frost' : map.id === 9 ? 'mud' : null;
    this.zones = [];
    if (!this.kind) return;
    // Place small zones along actual path length, away from spawn/castle.
    map.paths.slice(0, 3).forEach((path, index) => {
      const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
      let distance = lengths.reduce((a, b) => a + b, 0) * (index % 2 ? 0.6 : 0.4);
      for (let i = 0; i < lengths.length; i++) {
        if (distance > lengths[i]) { distance -= lengths[i]; continue; }
        const f = distance / (lengths[i] || 1);
        const x = path[i].x + (path[i + 1].x - path[i].x) * f;
        const y = path[i].y + (path[i + 1].y - path[i].y) * f;
        if (!this.zones.some(z => Math.hypot(z.x - x, z.y - y) < 110)) {
          this.zones.push({ x, y, radius: this.kind === 'frost' ? 66 : 44, offset: index * 3 });
        }
        break;
      }
    });
  }

  phase(zone, time = this.time) {
    if (this.kind === 'mud') return 'active';
    const phase = (time + zone.offset) % 14;
    return phase < 9 ? 'idle' : phase < 11 ? 'warning' : 'active';
  }

  contains(zone, entity) {
    return Math.hypot(zone.x - entity.x, zone.y - entity.y) <= zone.radius;
  }

  speedMultiplier(entity, side) {
    if (!this.kind || entity.hidden || entity.dead || entity.reachedEnd) return 1;
    if (this.kind === 'mud' && (side !== 'enemy' || entity.isFlying)) return 1;
    if (this.kind === 'lava') return 1;
    return this.zones.some(z => this.phase(z) === 'active' && this.contains(z, entity))
      ? (this.kind === 'mud' ? 0.75 : 0.72) : 1;
  }

  update(dt, game) {
    if (!this.kind || dt <= 0 || game.paused || game.over || game.waveManager.waveIndex < 0) return;
    const previous = this.time;
    this.time += dt;
    if (this.kind !== 'lava') return;
    // Fixed half-second damage ticks: the same damage at 30/60/120 FPS and x1/x3.
    for (let tick = Math.floor(previous * 2 + 1e-9) + 1; tick <= Math.floor(this.time * 2 + 1e-9); tick++) {
      for (const enemy of game.enemies) {
        if (enemy.dead || enemy.hidden || enemy.reachedEnd || enemy.isFlying) continue;
        if (this.zones.some(z => this.phase(z, tick / 2) === 'active' && this.contains(z, enemy))) {
          DamageSystem.applyTo(game, enemy, 8, 'true');
        }
      }
    }
  }

  draw(ctx) {
    if (!this.kind) return;
    ctx.save();
    for (const z of this.zones) {
      const phase = this.phase(z), active = phase === 'active', warning = phase === 'warning';
      const color = this.kind === 'lava' ? '#ff984b' : this.kind === 'frost' ? '#d4f5ff' : '#b39363';
      ctx.fillStyle = this.kind === 'mud' ? 'rgba(73,52,31,0.35)' : active
        ? (this.kind === 'lava' ? 'rgba(246,83,25,0.27)' : 'rgba(184,230,250,0.28)') : 'rgba(32,42,42,0.12)';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = active ? 2 : 1;
      ctx.setLineDash(active ? [] : [4, 5]);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // Small marks convey terrain without hiding units or the road beneath it.
      ctx.globalAlpha = active ? 0.75 : 0.35;
      ctx.fillStyle = color;
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, r = 12 + (i % 3) * 11;
        ctx.fillRect(Math.round(z.x + Math.cos(a) * r), Math.round(z.y + Math.sin(a) * r), this.kind === 'frost' ? 7 : 4, 2);
      }
      ctx.globalAlpha = 1;
      const label = this.kind === 'mud' ? 'BÙN · −25% TỐC' : this.kind === 'lava'
        ? (warning ? 'SẮP PHUN!' : active ? 'PHUN LỬA' : 'KHE NHIỆT')
        : (warning ? 'GIÓ LẠNH SẮP TỚI' : active ? 'GIÁ LẠNH · −28% TỐC' : 'VÙNG GIÓ LẠNH');
      ctx.font = 'bold 10px Segoe UI'; ctx.textAlign = 'center';
      const width = ctx.measureText(label).width + 12;
      ctx.fillStyle = warning ? '#683b20' : '#20302c';
      ctx.fillRect(z.x - width / 2, z.y + z.radius + 3, width, 16);
      ctx.fillStyle = color; ctx.fillText(label, z.x, z.y + z.radius + 15);
    }
    ctx.restore();
  }
}
