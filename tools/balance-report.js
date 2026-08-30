// ============================================================
// TOOLS/BALANCE-REPORT.JS — Công cụ cân bằng (KHÔNG nạp vào game thật, không có
// trong index.html). Dùng để soi số liệu khi tinh chỉnh:
//
//   node tools/balance-report.js            → in toàn bộ bảng ra terminal
//   node tools/balance-report.js 15         → chỉ map index 15
//
// Nó tự nạp CONFIG (config.js) + MAPS-liên-quan bằng cách eval các file cần thiết
// trong 1 sandbox tối thiểu (không cần trình duyệt). Chỉ đọc số, không sửa gì.
//
// Ba bảng:
//   1. DPS & hiệu suất vàng của từng tháp (theo loại sát thương).
//   2. Áp lực mỗi wave mỗi map: tổng HP hiệu dụng, cửa sổ spawn, DPS cần có.
//   3. Đối chiếu: vàng tích luỹ ước tính vs DPS mua được vs DPS cần  → cờ ⚠.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
function load(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// --- Sandbox tối thiểu: chỉ cần CONFIG + các helper của map.js dựng MAPS ---
const sandbox = {
  console, Math, JSON, Date,
  document: { createElement: () => ({ getContext: () => ({}) }) },
  performance: { now: () => 0 },
  window: {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// config.js (CONFIG)
vm.runInContext(load('js/config.js'), sandbox);
// map.js định nghĩa generateWaves / injectSplitterWaves / defineMap / MAPS...
// nó cần AssetLoader.getImage (chỉ dùng cho vẽ) — stub ra null là đủ.
vm.runInContext('var AssetLoader = { getImage: () => null };', sandbox);
vm.runInContext('var SpriteFX = { drawFrame(){}, hopOffset(){return 0;} };', sandbox);
vm.runInContext(load('js/map.js'), sandbox);

// top-level `const CONFIG` / `const MAPS` KHÔNG tự gắn vào context object — kéo ra thủ công.
vm.runInContext('globalThis.__CONFIG = CONFIG; globalThis.__MAPS = MAPS;', sandbox);
const CONFIG = sandbox.__CONFIG;
const MAPS = sandbox.__MAPS;

// ---------------------------------------------------------------
// 1. DPS THÁP
// ---------------------------------------------------------------
const AVG_SPLASH_TARGETS = 1.7;   // ước lượng số quái dính 1 quả AoE
const SKILL_ONE_SHOT_CAP = 900;   // "giá trị" tối đa quy cho 1 phát Death Ray (không tính vô hạn)

function towerCumCost(cfg, level, branch) {
  let c = cfg.levels[0].cost;
  for (let i = 1; i < level; i++) c += cfg.levels[i].cost;
  if (branch) c += cfg.branches[branch].cost;
  return c;
}

function dpsRow(type, label, s, cfg, branch) {
  let dps = 0;
  let dtype = branch ? (cfg.damageType) : cfg.damageType;
  if (type === 'barracks') {
    dps = cfg.soldierCount * (s.dmg / s.atkRate);
    if (branch === 'A' && s.skill) dps += (s.skill.damage / s.skill.cooldown); // holy strike aoe
    if (branch === 'B' && s.skill) dps += (s.skill.damage / s.skill.cooldown); // throwing axes
    dtype = 'physical';
  } else {
    dps = (s.damage || 0) / (s.rate || 1);
    if (s.critChance) dps *= (1 + s.critChance * ((s.critMult || 2) - 1));
    if (s.splash || (!branch && cfg.splash)) dps *= AVG_SPLASH_TARGETS;
    if (s.chain) { let m = 0, f = 1; for (let k = 0; k < s.chain.targets; k++) { m += f; f *= s.chain.falloff; } dps *= m; }
    if (s.poison) dps += s.poison.damage / s.poison.tick;
    const sk = s.skill, sk2 = s.skill2;
    if (sk) {
      if (sk.burstCount) dps += (sk.burstCount * sk.burstDamage) / sk.cooldown;
      else if (sk.trueDamage) dps += Math.min(sk.trueDamage, SKILL_ONE_SHOT_CAP) / sk.cooldown;
      else if (sk.miniCount) dps += (sk.miniCount * sk.miniDamage * 0.6) / sk.cooldown;
      else if (sk.damage) dps += (sk.damage * (sk.radius ? AVG_SPLASH_TARGETS : 1)) / sk.cooldown;
    }
    if (sk2 && sk2.damage) dps += sk2.damage / sk2.cooldown;
  }
  const cost = towerCumCost(cfg, branch ? 3 : Number(label.replace(/\D/g, '')) || 1, branch);
  return { label: `${type}/${label}`, dtype, dps: Math.round(dps), cost, perGold: +(dps / cost).toFixed(2) };
}

function towerTable() {
  const rows = [];
  for (const type of ['archer', 'barracks', 'mage', 'artillery']) {
    const cfg = CONFIG.towers[type];
    cfg.levels.forEach((lv, i) => rows.push(dpsRow(type, `Lv${i + 1}`, lv, cfg, null)));
    for (const bk of ['A', 'B']) rows.push(dpsRow(type, `4${bk}`, cfg.branches[bk], cfg, bk));
  }
  return rows;
}

// ---------------------------------------------------------------
// 2. ÁP LỰC WAVE
// ---------------------------------------------------------------
// HP hiệu dụng: HP * (1 + armor?) — quy đổi thô để so với DPS vật lý thuần.
function effHp(base, waveScale) {
  const raw = base.hp * waveScale;
  const armorTax = 1 + (base.armor || 0) * 0.6 + (base.magicResist || 0) * 0.4; // trung bình vật lý/phép
  return raw * armorTax;
}

function waveStats(map, wi) {
  const groups = map.waves[wi];
  const scale = map.waveScaleFor(wi);
  let hp = 0, count = 0, reward = 0, span = 0, boss = false;
  for (const g of groups) {
    const base = CONFIG.enemies[g.type];
    if (!base) continue;
    hp += effHp(base, scale) * g.count;
    count += g.count;
    reward += (base.reward || 0) * g.count;
    span = Math.max(span, (g.delay || 0) + g.count * (g.interval || 0.5));
    if (base.isBoss) boss = true;
  }
  span = Math.max(span, 6);
  // thời gian thực tế để dọn ≈ span + thời gian quái cuối đi hết đường (~14s), tối thiểu 12s
  const clearWindow = span + 14;
  return { wi: wi + 1, count, hp: Math.round(hp), reward, span: +span.toFixed(1),
    needDps: Math.round(hp / clearWindow), boss };
}

// vàng tích luỹ ước tính tới đầu wave wi (chưa tính wave wi)
function goldByWave(map, wi) {
  let g = CONFIG.economy.startGold;
  for (let i = 0; i < wi; i++) g += waveStats(map, i).reward;
  return Math.round(g);
}

// DPS "vật lý thuần" mua được với X vàng — chọn tổ hợp tháp perGold cao nhất (thô).
function bestDpsForGold(gold) {
  const rows = towerTable().filter(r => r.dtype !== undefined);
  const best = rows.reduce((a, b) => (b.perGold > a.perGold ? b : a));
  return Math.round(best.perGold * gold * 0.8); // 0.8 = hao phí đặt lệch chỗ / xây dở
}

// ---------------------------------------------------------------
// IN
// ---------------------------------------------------------------
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function padL(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

function printTowers() {
  console.log('\n=== 1. DPS & HIỆU SUẤT VÀNG THÁP ===');
  console.log(pad('Tháp/Cấp', 16), pad('Loại ST', 9), padL('DPS', 6), padL('Giá', 6), padL('DPS/vàng', 9));
  for (const r of towerTable()) {
    console.log(pad(r.label, 16), pad(r.dtype, 9), padL(r.dps, 6), padL(r.cost, 6), padL(r.perGold, 9));
  }
}

function printMap(mi) {
  const map = MAPS[mi];
  if (!map) return;
  console.log(`\n=== MAP ${mi} · ${map.name} · difficulty ${map.difficulty} · ${map.waves.length} wave ===`);
  console.log(pad('W', 3), padL('#quái', 6), padL('HP hiệu dụng', 13), padL('span', 6),
    padL('DPS cần', 8), padL('vàng≈', 7), padL('DPS mua≈', 9), 'cờ');
  for (let wi = 0; wi < map.waves.length; wi++) {
    const w = waveStats(map, wi);
    const gold = goldByWave(map, wi);
    const canDps = bestDpsForGold(gold);
    let flag = '';
    if (canDps < w.needDps * 0.75) flag = '⚠ THIẾU HỎA LỰC';
    else if (canDps > w.needDps * 2.5) flag = '· quá dễ';
    if (w.boss) flag = (flag ? flag + ' ' : '') + '👑';
    console.log(pad(w.wi, 3), padL(w.count, 6), padL(w.hp.toLocaleString(), 13), padL(w.span, 6),
      padL(w.needDps, 8), padL(gold.toLocaleString(), 7), padL(canDps.toLocaleString(), 9), flag);
  }
}

const arg = process.argv[2];
printTowers();
if (arg !== undefined) {
  printMap(Number(arg));
} else {
  for (let mi = 0; mi < 16; mi++) printMap(mi);
}
console.log('\n(HP hiệu dụng = HP×waveScale×thuế-giáp. DPS cần = HP / (span+14s). ' +
  'DPS mua ≈ vàng × perGold tốt nhất × 0.8. Đây là ước lượng thô để soi xu hướng, không phải mô phỏng.)');
