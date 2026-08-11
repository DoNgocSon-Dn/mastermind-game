// ============================================================
// DAMAGETEXT.JS — Số sát thương bay lên đầu quái, mờ dần rồi biến mất.
// Màu: trắng = Physical, tím = Magic, vàng = True/Chí mạng, xanh = hồi máu.
// ============================================================
class DamageText {
  constructor(x, y, value, color, isCrit = false) {
    this.x = x + (Math.random() * 10 - 5);
    this.y = y;
    this.value = value;
    this.color = color;
    this.isCrit = isCrit;
    this.life = 0.9;
    this.maxLife = 0.9;
    this.vy = -34;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy += 40 * dt;
    this.life -= dt;
  }
  get dead() { return this.life <= 0; }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.font = this.isCrit ? 'bold 16px monospace' : 'bold 12px monospace';
    ctx.textAlign = 'center';
    const text = typeof this.value === 'number' ? Math.round(this.value).toString() : this.value;
    ctx.strokeText(text, this.x, this.y);
    ctx.fillText(text, this.x, this.y);
    ctx.restore();
  }
}
