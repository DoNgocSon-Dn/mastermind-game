// Run: node tools/regression-test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/systems/save.js'), 'utf8');
function setup(blockStorage = false) {
  const values = new Map();
  const context = vm.createContext({ console, localStorage: {
    getItem(key) { if (blockStorage) throw new Error('blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (blockStorage) throw new Error('blocked'); values.set(key, value); },
    removeItem(key) { values.delete(key); },
  }, DevMode: { enabled: false } });
  vm.runInContext(source + '\nglobalThis.save = SaveSystem;', context);
  return { save: context.save, values, context };
}
const { save, values, context } = setup();
for (const raw of ['null', '{', '{"maps":[null,3,{"stars":99},{"stars":-2}]}']) {
  values.set('td_pixel_save_v1', raw);
  assert.doesNotThrow(() => save.reportResult(16, 0, 3));
  const data = save.load(16);
  assert.equal(data.maps.length, 16);
  assert.equal(data.maps[0].stars, 3);
  assert.equal(data.maps[1].unlocked, true);
  assert.ok(data.maps.every(entry => Number.isInteger(entry.stars) && entry.stars >= 0 && entry.stars <= 3));
}
values.clear();
save.reportResult(16, 0, 3);
save.reportResult(16, 0, 1);
assert.equal(save.load(16).maps[0].stars, 3, 'Replaying cannot reduce earned stars');
context.DevMode.enabled = true;
assert.equal(save.load(16).maps[15].unlocked, true);
assert.equal(save.snapshot().maps[15].unlocked, false, 'Backups must not persist dev unlocks');
context.DevMode.enabled = false;
const before = JSON.stringify(save.snapshot());
for (const index of [-1, 16, 99, NaN, 0.5]) save.reportResult(16, index, 3);
assert.equal(JSON.stringify(save.snapshot()), before, 'Invalid/custom indexes cannot change campaign progress');
values.clear();
assert.equal(save.load(100).maps.length, 16, 'Campaign saves cannot expand to custom indexes');
save.reportResult(100, 15, 3);
assert.equal(save.isGameCompleted(100), true);
const memory = setup(true).save;
memory.reportResult(16, 0, 2);
assert.equal(memory.load(16).maps[0].stars, 2);
assert.equal(memory.usingMemory, true);
console.log('PASS: malformed saves, star bounds, unlocks, replay, dev backups, custom indexes, memory fallback');
