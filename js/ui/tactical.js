// Read-only presentation helpers. Never mutate wave definitions or tower stats.
const TacticalInfo = (() => {
  const names = { normal: 'Goblin', fast: 'Quái nhanh', tank: 'Quái giáp nặng', flying: 'Quái bay', splitter: 'Quái phân thân', splitling: 'Quái con', boss: 'Trùm', bossMini: 'Trùm nhỏ', bossSpring: 'Trùm Xuân', bossSummer: 'Trùm Hạ', bossAutumn: 'Trùm Thu', bossWinter: 'Trùm Đông' };
  const number = value => Number(value.toFixed(2)).toString();
  function summarizeWave(preview) {
    if (!preview) return null;
    const routes = new Map();
    let total = 0;
    for (const group of preview.groups) {
      const path = group.path || 0;
      if (!routes.has(path)) routes.set(path, { path, enemies: new Map(), tunnel: false });
      const route = routes.get(path);
      route.enemies.set(group.type, (route.enemies.get(group.type) || 0) + group.count);
      route.tunnel ||= group.tunnelIndex != null && group.tunnelChance !== 0;
      total += group.count;
    }
    return { number: preview.number, total, routes: [...routes.values()].sort((a, b) => a.path - b.path).map(route => ({ ...route, enemies: [...route.enemies].map(([type, count]) => ({ type, count, name: names[type] || type, boss: !!CONFIG.enemies[type]?.isBoss })) })) };
  }
  function statRows(type, stats, modifiers = {}) {
    const cfg = CONFIG.towers[type];
    const mult = modifiers.damageMult ?? 1;
    if (type === 'barracks') return [
      ['Sát thương/lính', number(stats.dmg)], ['Đòn/giây', number(1 / stats.atkRate)],
      ['Máu/lính', stats.hp], ['Giáp vật lý', Math.round(stats.armor * 100) + '%'],
      ['Số lính', cfg.soldierCount], ['Hồi sinh', stats.respawn + 's'],
    ];
    return [
      ['Sát thương/đòn', number(stats.damage * mult)],
      ['Đòn/giây', number(1 / (stats.rate * (modifiers.rateMult ?? 1)))],
      ['Tầm bắn', number(stats.range * (modifiers.rangeMult ?? 1)) + 'px'],
      ['Loại sát thương', cfg.damageType === 'magic' || (type === 'artillery' && stats.chain) ? 'Phép' : 'Vật lý'],
    ];
  }
  const canHitFlying = (type, stats) => !!(stats.canHitFlying ?? CONFIG.towers[type].canHitFlying);
  return { summarizeWave, statRows, canHitFlying };
})();

const TacticalPanels = (() => {
  let lastManager = null, lastWave = null, lastIntel = null;
  const statsHtml = rows => `<dl class="intel-stats">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  function renderWavePreview(game, els) {
    const wm = game.waveManager;
    if (wm !== lastManager || wm.waveIndex !== lastWave) {
      lastManager = wm; lastWave = wm.waveIndex;
      const info = TacticalInfo.summarizeWave(wm.previewNextWave());
      els.waveTitle.textContent = info ? `Đợt ${info.number} · ${info.total} quái` : 'Đợt cuối · không còn tiếp viện';
      els.waveBody.innerHTML = info ? info.routes.map(route => `<div class="wave-route"><h3>Đường ${route.path + 1}</h3><ul>${route.enemies.map(enemy => `<li class="${enemy.boss ? 'wave-boss' : ''}"><span>${enemy.name}${enemy.boss ? ' · BOSS' : ''}</span><strong>×${enemy.count}</strong></li>`).join('')}</ul>${route.tunnel ? '<p class="wave-warning">Có quái dùng hầm dịch chuyển</p>' : ''}</div>`).join('') + (info.routes.some(route => route.enemies.some(enemy => enemy.type === 'splitter')) ? '<p class="wave-warning">Phân thân có thể sinh thêm quái con; chưa tính vào tổng.</p>' : '') : '<p>Dọn sạch quái còn lại để giữ vững thành trì.</p>';
    }
    const ready = !wm.active && !wm.finishedAllSpawns && game.enemies.length === 0;
    els.callWave.classList.toggle('hidden', wm.finishedAllSpawns);
    els.callWave.disabled = !ready || game.paused || game.over;
    els.callWave.textContent = 'Gọi đợt';
    els.waveStatus.textContent = wm.finishedAllSpawns ? 'Không còn đợt mới.' : game.paused ? 'Tiếp tục trận để gọi đợt.' : wm.autoAdvance ? 'Tự động gọi đợt đang bật.' : ready ? 'Sẵn sàng khi bạn muốn.' : 'Chờ dọn xong đợt hiện tại để gọi tiếp.';
  }
  function renderTowerIntel(game, els) {
    const tower = game.selectedTower || (!game.armedTowerType ? game.hoveredTower : null);
    const type = game.armedTowerType || tower?.type;
    if (!type || game.selectedCastle || game.armedTowerType) {
      els.branchInfoPanel.classList.add('hidden'); lastIntel = null; return;
    }
    const cfg = CONFIG.towers[type];
    const stats = tower ? tower.stats : cfg.levels[0];
    const modifiers = { damageMult: tower?.damageMult ?? Meta.towerDamageMult(), rangeMult: tower?.rangeDebuffMult ?? 1, rateMult: tower?.rateDebuffMult ?? 1 };
    const sig = [type, tower?.id, tower?.level, tower?.branch, tower?.targetPriority, game.selectedTower === tower, game.paused, modifiers.damageMult, modifiers.rangeMult, modifiers.rateMult, Math.ceil(tower?.buildTimer || 0)].join('|');
    els.branchInfoPanel.classList.remove('hidden');
    if (lastIntel === sig) return;
    lastIntel = sig;
    const branch = tower?.branch;
    const flying = TacticalInfo.canHitFlying(type, stats);
    const blind = stats.minRange ?? cfg.minRange ?? 0;
    const rows = TacticalInfo.statRows(type, stats, modifiers);
    const expanded = els.branchInfoPanel.querySelector(".intel-details")?.open && els.branchInfoPanel.dataset.intelType === type;
    els.branchInfoPanel.dataset.intelType = type;
    let html = `<details class="intel-details" ${expanded ? "open" : ""}><summary><div class="intel-heading"><strong>${tower ? tower.displayName : cfg.label}</strong><span>${tower ? tower.buildTimer > 0 ? 'Đang xây · ' + Math.ceil(tower.buildTimer) + 's' : 'Đang xem' : 'Chuẩn bị xây · ' + stats.cost + ' vàng'}</span></div><span class="intel-toggle">Chỉ số & nâng cấp</span></summary>`;
    if (tower && game.selectedTower === tower && type !== 'barracks') {
      const priorities = [
        ['first', 'Gần thành', 'Quái còn ít đường nhất để vào thành.'],
        ['strongest', 'Máu cao', 'Quái còn nhiều máu nhất trong tầm bắn.'],
        ['nearest', 'Gần tháp', 'Quái gần tháp nhất, ngoài điểm mù.'],
      ];
      html += `<fieldset class="target-priorities"><legend>Ưu tiên mục tiêu</legend>${priorities.map(([key, label, hint]) => `<button type="button" data-target-priority="${key}" aria-pressed="${tower.targetPriority === key}" title="${hint}" ${game.paused ? 'disabled' : ''}>${label}</button>`).join('')}</fieldset>`;
      html += `<p class="target-hint">${priorities.find(([key]) => key === tower.targetPriority)[2]}</p>`;
    }
    const current = `<p class="intel-desc">${branch ? stats.desc : cfg.desc}</p>${statsHtml(rows)}`;
    html += tower?.canChooseBranch ? `<details class="intel-current"><summary>Xem chỉ số cấp hiện tại</summary>${current}</details>` : current;
    html += `<p class="intel-note">${flying ? 'Đánh được quái bay' : 'Không đánh quái bay'}${blind ? ' · Điểm mù ' + blind + 'px' : ''}${modifiers.rangeMult < 1 || modifiers.rateMult > 1 ? ' · Đang chịu hiệu ứng giảm chỉ số' : ''}</p>`;
    if (tower && !branch && tower.level < 3) {
      const next = cfg.levels[tower.level];
      const future = TacticalInfo.statRows(type, next, modifiers);
      const differences = rows.map(([label, value], i) => value !== future[i][1] ? `<li>${label}: <strong>${value} → ${future[i][1]}</strong></li>` : '').join('');
      html += `<div class="intel-upgrade"><strong>Cấp ${tower.level + 1} · ${next.cost} vàng</strong><ul>${differences}</ul></div>`;
    }
    if (!branch) {
      html += `<details class="intel-branches" ${tower?.canChooseBranch ? 'open' : ''}><summary>${tower?.canChooseBranch ? 'Chọn nhánh A hoặc B ở thanh nâng cấp' : 'Xem trước hai nhánh cấp 4'}</summary><p>Chỉ chọn một nhánh, không đổi lại được.</p><div class="intel-branch-grid">`;
      for (const key of ['A', 'B']) {
        const b = cfg.branches[key];
        html += `<section><h3>${key} · ${b.label}</h3><strong>${b.cost} vàng</strong>${statsHtml(TacticalInfo.statRows(type, b, modifiers))}<p class="intel-note">${TacticalInfo.canHitFlying(type, b) ? "Đánh quái bay" : "Không đánh quái bay"}${(b.minRange ?? cfg.minRange ?? 0) ? " · Điểm mù " + (b.minRange ?? cfg.minRange) + "px" : ""}</p><p>${b.desc}</p></section>`;
      }
      html += '</div></details>';
    }
    html += '</details>';
    const focusPriority = document.activeElement?.dataset.targetPriority;
    els.branchInfoPanel.innerHTML = html;
    if (focusPriority) els.branchInfoPanel.querySelector(`[data-target-priority="${focusPriority}"]`)?.focus({ preventScroll: true });
  }
  return { renderWavePreview, renderTowerIntel };
})();
