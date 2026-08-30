// ============================================================
// DAMAGE.JS — Hệ thống sát thương 3 loại + kháng.
// ============================================================
const DamageSystem = {
  // amount: số damage gốc; type: 'physical' | 'magic' | 'true'
  // target: entity có .armor (0..1) và .magicResist (0..1)
  calc(amount, type, target) {
    if (type === 'true') return amount;
    // Quái đang bị "hoá cừu" (Polymorph — Sorcerer 4B) mất sạch giáp + kháng phép.
    const poly = !!target.isPolymorphed;
    if (type === 'physical') return amount * (1 - (poly ? 0 : (target.armor || 0)));
    if (type === 'magic') return amount * (1 - (poly ? 0 : (target.magicResist || 0)));
    return amount;
  },

  // Áp damage lên target, sinh DamageText + hit flash, trả về sát thương thực + có chết không
  applyTo(game, target, amount, type, opts = {}) {
    // target.hidden = quái đang ẩn dưới hầm bí mật (xem enemy.js) — không thể trúng
    // đòn từ BẤT KỲ nguồn nào (đạn, AoE, chain, Mưa Lửa, độc...) khi còn dưới hầm.
    if (!target || target.dead || target.hidden) return { dealt: 0, killed: false };
    let dealt = this.calc(amount, type, target);
    let isCrit = !!opts.crit;
    if (isCrit) dealt *= (opts.critMult || 2);
    dealt = Math.max(0, Math.round(dealt));
    target.hp -= dealt;
    target.hitFlash = 0.15;

    let color = CONFIG.damageColors[type] || '#fff';
    if (isCrit) color = CONFIG.damageColors.crit;
    game.damageTexts.push(new DamageText(target.x, target.y - (target.radius || 14), dealt, color, isCrit));

    let killed = false;
    if (target.hp <= 0 && !target.dead) {
      target.dead = true;
      killed = true;
    }
    return { dealt, killed };
  },
};
