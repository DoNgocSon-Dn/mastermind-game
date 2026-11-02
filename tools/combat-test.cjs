// Run: node tools/combat-test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console, performance: { now: () => 0 },
  document: { createElement: () => ({ getContext: () => ({}) }) },
  Meta: { towerDamageMult: () => 1, buildTimeMult: () => 1 },
  AssetLoader: { getImage: () => null, playSound() {} },
});
for (const file of ['js/config.js', 'js/map.js', 'js/entities/tower.js', 'js/ui/tactical.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
vm.runInContext('globalThis.api = { CONFIG, MAPS, Tower, TacticalInfo };', context);
const { CONFIG, MAPS, Tower, TacticalInfo } = context.api;
assert.equal(MAPS.length, 16);
for (const map of MAPS) {
  for (const wave of map.waves) for (const group of wave) {
    assert.ok(CONFIG.enemies[group.type], `Map ${map.id}: unknown enemy ${group.type}`);
    assert.ok(map.paths[group.path || 0], `Map ${map.id}: missing path`);
    assert.ok(Number.isInteger(group.count) && group.count > 0);
    assert.ok(Number.isFinite(group.interval) && group.interval > 0);
    if (group.tunnelIndex != null) assert.ok(map.tunnels?.[group.tunnelIndex]);
  }
  const first = map.createSession(), retry = map.createSession();
  const resource = first.decorations.find(item => item.cost != null);
  if (resource) {
    first.clearResource(resource);
    assert.equal(resource.cleared, true);
    assert.equal(retry.decorations[first.decorations.indexOf(resource)].cleared, false);
    assert.equal(map.decorations[first.decorations.indexOf(resource)].cleared, false);
  }
  if (first.obstacles.length) {
    first.obstacles[0].cleared = true;
    assert.equal(retry.obstacles[0].cleared, false);
    assert.equal(map.obstacles[0].cleared, false);
  }
}
for (const type of Object.keys(CONFIG.towers)) for (const branch of [null, 'A', 'B']) {
  const tower = new Tower(type, 0, 0);
  tower.branch = branch;
  const expected = type === 'archer' || type === 'mage' || (branch === 'B' && type === 'artillery') || (branch === 'B' && type === 'barracks');
  assert.equal(tower._canHitFlying(), expected, `${type}/${branch} targeting`);
  assert.equal(TacticalInfo.canHitFlying(type, tower.stats), expected, `${type}/${branch} displayed capability`);
}
const tower = new Tower('archer', 0, 0);
const enemy = (id, x, hp, remaining, extra = {}) => ({ id, x, y: 0, hp, totalLength: 1000, traveled: 1000 - remaining, dead: false, hidden: false, reachedEnd: false, ...extra });
const front = enemy('front', 70, 20, 10, { totalLength: 100, traveled: 90 });
const strong = enemy('strong', 50, 300, 100, { totalLength: 2000, traveled: 1900 });
const nearest = enemy('nearest', 15, 30, 200);
const game = { enemies: [strong, front, nearest] };
assert.equal(tower._selectTarget(game).id, 'front', 'Compare distance remaining, not percentage of different routes');
assert.equal(tower.setTargetPriority('strongest'), true);
assert.equal(tower._selectTarget(game).id, 'strong');
tower.setTargetPriority('nearest');
assert.equal(tower._selectTarget(game).id, 'nearest');
for (const state of [{ dead: true }, { hidden: true }, { reachedEnd: true }, { hp: 0 }, { x: 999 }]) {
  assert.equal(tower._selectTarget({ enemies: [enemy('invalid', 10, 9999, 1, state)] }), null);
}
const artillery = new Tower('artillery', 0, 0);
assert.equal(artillery._selectTarget({ enemies: [enemy('blind', 10, 100, 1), enemy('air', 100, 100, 1, { isFlying: true })] }), null);
assert.equal(tower.setTargetPriority('unknown'), false);
assert.equal(new Tower('barracks', 0, 0).setTargetPriority('nearest'), false);
tower.setTargetPriority('strongest');
tower.buildTimer = 0; tower.cooldown = .1; tower.target = front;
tower._fire = () => {}; tower._animateUnit = () => {}; tower._updateBranchAutoSkills = () => {};
tower.update(.2, game);
assert.equal(tower.target.id, 'strong', 'Re-evaluate priority before the next shot');
tower.upgrade({ spend: () => true }); tower.upgrade({ spend: () => true });
tower.chooseBranch('A', { spend: () => true }, game);
assert.equal(tower.targetPriority, 'strongest', 'Upgrading preserves the player choice');
assert.equal(new Tower('archer', 0, 0).targetPriority, 'first', 'New towers start with a safe default');
console.log('PASS: all 16 map definitions, isolated restarts, branch anti-air, targeting modes, invalid targets, blind spots, retargeting, upgrade persistence');
