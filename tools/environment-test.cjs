const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ console, document: { createElement: () => ({ getContext: () => ({}) }) },
  AssetLoader: { getImage: () => null },
  DamageSystem: { applyTo(game, enemy, amount) { enemy.hp -= amount; if (enemy.hp <= 0) enemy.dead = true; } } });
for (const file of ['js/config.js', 'js/map.js', 'js/systems/environment.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const { EnvironmentSystem, MAPS } = vm.runInContext('({ EnvironmentSystem, MAPS })', context);
const at = z => ({ x: z.x, y: z.y, hp: 1000 });
const gameFor = enemies => ({ enemies, waveManager: { waveIndex: 0 }, paused: false, over: false });
for (const map of MAPS) {
  const env = new EnvironmentSystem(map);
  const expected = map.id === 7 ? 'lava' : map.id === 9 ? 'mud' : map.id >= 12 ? 'frost' : null;
  assert.equal(env.kind, expected);
  assert.ok(env.zones.length <= 3);
  if (expected) assert.ok(env.zones.length > 0);
  for (const z of env.zones) {
    assert.ok(Number.isFinite(z.x) && Number.isFinite(z.y));
    assert.ok(Math.hypot(z.x - map.castlePos.x, z.y - map.castlePos.y) > z.radius);
  }
}
const mud = new EnvironmentSystem(MAPS[9]), muddy = at(mud.zones[0]);
assert.equal(mud.speedMultiplier(muddy, 'enemy'), 0.75);
assert.equal(mud.speedMultiplier(muddy, 'ally'), 1);
assert.equal(mud.speedMultiplier({ ...muddy, isFlying: true }, 'enemy'), 1);
assert.equal(mud.speedMultiplier({ ...muddy, hidden: true }, 'enemy'), 1);
assert.equal(mud.speedMultiplier({ ...muddy, x: -1000 }, 'enemy'), 1);
const frost = new EnvironmentSystem(MAPS[12]), cold = at(frost.zones[0]);
assert.equal(frost.speedMultiplier(cold, 'ally'), 1);
frost.time = 10; assert.equal(frost.phase(frost.zones[0]), 'warning');
assert.equal(frost.speedMultiplier(cold, 'enemy'), 1);
frost.time = 11;
for (const side of ['ally', 'enemy']) assert.equal(frost.speedMultiplier(cold, side), 0.72);
assert.equal(frost.speedMultiplier({ ...cold, isFlying: true }, 'enemy'), 0.72);
frost.time = 14; assert.equal(frost.speedMultiplier(cold, 'ally'), 1);
function lavaRun(fps, speed = 1) {
  const env = new EnvironmentSystem(MAPS[7]);
  const target = at(env.zones[0]), hidden = { ...target, hidden: true }, flying = { ...target, isFlying: true };
  const escaped = { ...target, reachedEnd: true }, outside = { ...target, x: -1000 };
  const game = gameFor([target, hidden, flying, escaped, outside]);
  for (let frame = 0; frame < 14 * fps / speed; frame++) env.update(speed / fps, game);
  assert.equal(target.hp, 952);
  for (const e of [hidden, flying, escaped, outside]) assert.equal(e.hp, 1000);
  for (const flag of ['paused', 'over']) {
    const t = env.time; game[flag] = true; env.update(10, game); assert.equal(env.time, t); game[flag] = false;
  }
  game.waveManager.waveIndex = -1;
  const t = env.time; env.update(10, game); assert.equal(env.time, t);
}
for (const fps of [30, 60, 120]) for (const speed of [1, 2, 3]) lavaRun(fps, speed);
console.log('PASS: all-map zones, warning/active cycles, both factions, flying/tunnel immunity, exit recovery, pause/pre-wave, damage at 30/60/120 FPS and x1/x2/x3');
