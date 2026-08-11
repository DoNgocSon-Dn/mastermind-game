// ============================================================
// ASSETS.JS — AssetLoader trung tâm: load toàn bộ ảnh/âm thanh
// trước khi vào Menu, hiển thị màn hình loading (%).
// Toàn bộ đồ hoạ (nhân vật, quái, tháp, map) chỉ dùng DUY NHẤT 1 gói:
// "Tiny Swords (Free Pack)" — Buildings/Units/Terrain/Decorations/Particle FX.
// Âm thanh vẫn dùng SFX có sẵn từ "Kenney Desert Shooter Pack" (không phải đồ hoạ).
// Phần Tiny Swords không có sẵn (đạn phép/pháo, tia điện Tesla, thanh HP...)
// dùng placeholder hình học vẽ bằng Canvas API, đánh dấu bằng comment
// "// TODO: thay bằng sprite thật khi có asset".
// ============================================================

const AssetLoader = (() => {
  const images = {};
  const sounds = {};
  let total = 0;
  let loaded = 0;

  const imageList = {
    // ---- Units (nhân vật) ----
    heroIdle: 'assets/units/blue_warrior_idle.png',
    heroRun: 'assets/units/blue_warrior_run.png',
    heroAttack: 'assets/units/blue_warrior_attack1.png',
    // Hero Cung Thủ: tái dùng đúng sprite Cung Thủ đứng trên tháp Archer (đã có sẵn màu
    // xanh dương — cùng phe với Hero mặc định) — không có sprite "run" riêng cho Cung
    // Thủ trong pack nên lúc di chuyển vẫn dùng khung Idle (xem hero.js: spriteRun).
    heroArcherIdle: 'assets/units/blue_archer_idle.png',
    heroArcherShoot: 'assets/units/blue_archer_shoot.png',
    // Hero Lính Giáo: pack không có sprite "lancer" màu xanh dương (chỉ có đen/tím —
    // vốn dùng cho phe địch/trung lập), nên mượn tạm bản tím rồi nhuộm xanh bằng
    // ctx.filter lúc vẽ (xem hero.js _drawSprite) để khớp tông phe người chơi.
    heroSpearIdle: 'assets/units/purple_lancer_idle.png',
    heroSpearRun: 'assets/units/purple_lancer_run.png',

    soldierBaseIdle: 'assets/units/blue_warrior_idle.png',
    soldierBaseRun: 'assets/units/blue_warrior_run.png',
    soldierBaseAttack: 'assets/units/blue_warrior_attack1.png',
    paladinIdle: 'assets/units/yellow_monk_idle.png',
    paladinRun: 'assets/units/yellow_monk_run.png',
    paladinHeal: 'assets/units/yellow_monk_heal.png',
    barbarianIdle: 'assets/units/red_warrior_idle.png',
    barbarianRun: 'assets/units/red_warrior_run.png',
    barbarianAttack: 'assets/units/red_warrior_attack2.png',

    // ---- Quái: sprite QUÁI THẬT từ "Tiny Swords (Enemy Pack)" ----
    // Trước đây quái là unit NGƯỜI của phe Black/Purple bị nhuộm tối để giả làm quái;
    // giờ mỗi loại là một sinh vật riêng nên bỏ được cả lớp nhuộm lẫn "mắt đỏ" chắp vá.
    enemyNormalIdle: 'assets/enemies/goblin_idle.png',   // Spear Goblin — lính bộ cơ bản
    enemyNormalRun: 'assets/enemies/goblin_run.png',
    enemyFastIdle: 'assets/enemies/thief_idle.png',      // Thief — nhỏ, nhanh nhẹn
    enemyFastRun: 'assets/enemies/thief_run.png',
    enemyTankIdle: 'assets/enemies/turtle_idle.png',     // Turtle — mai dày, chậm chạp
    enemyTankRun: 'assets/enemies/turtle_walk.png',
    enemyFlyingIdle: 'assets/enemies/bombfish_idle.png', // Bomb Fish — sinh vật tròn nhỏ, hợp dáng lơ lửng
    enemyFlyingRun: 'assets/enemies/bombfish_run.png',
    enemyBossIdle: 'assets/enemies/minotaur_idle.png',   // Minotaur — boss dùng chung
    enemyBossRun: 'assets/enemies/minotaur_walk.png',
    golemIdle: 'assets/enemies/bear_idle.png',           // Bear — quái to xác
    golemRun: 'assets/enemies/bear_run.png',

    // ---- Boss riêng từng mùa (mỗi mùa 1 sinh vật khác hẳn, không chỉ khác màu) ----
    bossSpringIdle: 'assets/enemies/troll_idle.png',     // Xuân: Troll — khổng lồ cây cối
    bossSpringRun: 'assets/enemies/troll_walk.png',
    bossSummerIdle: 'assets/enemies/minotaur_idle.png',  // Hạ: Minotaur — chúa tể lửa
    bossSummerRun: 'assets/enemies/minotaur_walk.png',
    bossAutumnIdle: 'assets/enemies/skull_idle.png',     // Thu: Skull — vong hồn sương mù
    bossAutumnRun: 'assets/enemies/skull_run.png',
    bossWinterIdle: 'assets/enemies/shaman_idle.png',    // Đông: Hex Shaman — pháp sư băng
    bossWinterRun: 'assets/enemies/shaman_run.png',

    arrow: 'assets/units/blue_arrow.png',
    // Đạn pháo (Tiny Swords Update 010 — Goblins/TNT/Dynamite): thỏi thuốc nổ
    // 6 khung hình (tia lửa ngòi nổ nhấp nháy), thay placeholder hình tròn đen.
    dynamite: 'assets/units/dynamite.png',

    // ---- Nhân vật đứng trên/cạnh tháp (theo phe màu building: blue/yellow(4A)/red(4B)) ----
    towerArcherIdleBlue: 'assets/units/blue_archer_idle.png',
    towerArcherShootBlue: 'assets/units/blue_archer_shoot.png',
    towerArcherIdleYellow: 'assets/units/yellow_archer_idle.png',
    towerArcherShootYellow: 'assets/units/yellow_archer_shoot.png',
    towerArcherIdleRed: 'assets/units/red_archer_idle.png',
    towerArcherShootRed: 'assets/units/red_archer_shoot.png',

    towerMageIdleBlue: 'assets/units/blue_monk_idle.png',
    towerMageCastBlue: 'assets/units/blue_monk_heal.png',
    towerMageIdleYellow: 'assets/units/yellow_monk_idle.png',
    towerMageCastYellow: 'assets/units/yellow_monk_heal.png',
    towerMageIdleRed: 'assets/units/red_monk_idle.png',
    towerMageCastRed: 'assets/units/red_monk_heal.png',

    towerGunnerIdleBlue: 'assets/units/blue_pawn_idle_hammer.png',
    towerGunnerFireBlue: 'assets/units/blue_pawn_interact_hammer.png',
    towerGunnerIdleYellow: 'assets/units/yellow_pawn_idle_hammer.png',
    towerGunnerFireYellow: 'assets/units/yellow_pawn_interact_hammer.png',
    towerGunnerIdleRed: 'assets/units/red_pawn_idle_hammer.png',
    towerGunnerFireRed: 'assets/units/red_pawn_interact_hammer.png',

    // ---- Particle FX ----
    explosion1: 'assets/particlefx/explosion1.png',
    explosion2: 'assets/particlefx/explosion2.png',
    fire1: 'assets/particlefx/fire1.png',
    fire2: 'assets/particlefx/fire2.png',
    fire3: 'assets/particlefx/fire3.png',
    dust1: 'assets/particlefx/dust1.png',
    // Tiny Swords Update 010: nổ khói bụi rõ nét hơn (dùng riêng cho pháo/AOE splash),
    // lửa cháy mặt đất khung hình lớn hơn (128px, thay fire1-3 vốn là đốm nổ nhỏ,
    // không hợp hình lửa cháy lan trên đất).
    explosion3: 'assets/particlefx/explosion3.png',
    fireBig: 'assets/particlefx/fire_big.png',

    // ---- Terrain / Decorations ----
    tsTerrain: 'assets/tiles/ts_terrain.png',
    waterBg: 'assets/tiles/water_bg.png',
    waterFoam: 'assets/tiles/water_foam.png',
    bush1: 'assets/decorations/bush1.png',
    bush2: 'assets/decorations/bush2.png',
    bush3: 'assets/decorations/bush3.png',
    bush4: 'assets/decorations/bush4.png',
    rock1: 'assets/decorations/rock1.png',
    rock2: 'assets/decorations/rock2.png',
    rock3: 'assets/decorations/rock3.png',
    rock4: 'assets/decorations/rock4.png',
    waterRock1: 'assets/decorations/water_rock1.png',
    waterRock2: 'assets/decorations/water_rock2.png',
    waterRock3: 'assets/decorations/water_rock3.png',
    waterRock4: 'assets/decorations/water_rock4.png',
    cloudA1: 'assets/decorations/cloud_a1.png',
    cloudA2: 'assets/decorations/cloud_a2.png',
    cloudA3: 'assets/decorations/cloud_a3.png',
    cloudA4: 'assets/decorations/cloud_a4.png',
    cloudB1: 'assets/decorations/cloud_b1.png',
    cloudB2: 'assets/decorations/cloud_b2.png',
    cloudB3: 'assets/decorations/cloud_b3.png',
    cloudB4: 'assets/decorations/cloud_b4.png',
    tree1: 'assets/decorations/tree1.png',
    tree2: 'assets/decorations/tree2.png',
    tree3: 'assets/decorations/tree3.png',
    tree4: 'assets/decorations/tree4.png',
    sheepIdle: 'assets/decorations/sheep_idle.png',
    sheepMove: 'assets/decorations/sheep_move.png',
    sheepGrass: 'assets/decorations/sheep_grass.png',
    villagerIdle: 'assets/decorations/villager_idle.png',
    villagerRun: 'assets/decorations/villager_run.png',
    house1: 'assets/buildings/house1.png',
    house2: 'assets/buildings/house2.png',
    house3: 'assets/buildings/house3.png',
    // Tiny Swords Update 010 — Resources/Terrain, thêm biến thể cho map đỡ lặp lại.
    treeSet: 'assets/decorations/tree_set.png', // lưới 4x3 ô 192x192 — 6 cây tĩnh + 1 gốc cây
    goldMine: 'assets/decorations/gold_mine.png',
    sheepBouncing: 'assets/decorations/sheep_bouncing.png',
    deco1: 'assets/decorations/deco_01.png', deco2: 'assets/decorations/deco_02.png',
    deco3: 'assets/decorations/deco_03.png', deco4: 'assets/decorations/deco_04.png',
    deco5: 'assets/decorations/deco_05.png', deco6: 'assets/decorations/deco_06.png',
    deco7: 'assets/decorations/deco_07.png', deco8: 'assets/decorations/deco_08.png',
    deco9: 'assets/decorations/deco_09.png', deco10: 'assets/decorations/deco_10.png',
    deco11: 'assets/decorations/deco_11.png', deco12: 'assets/decorations/deco_12.png',
    deco13: 'assets/decorations/deco_13.png', deco14: 'assets/decorations/deco_14.png',
    deco15: 'assets/decorations/deco_15.png', deco16: 'assets/decorations/deco_16.png',
    deco17: 'assets/decorations/deco_17.png', deco18: 'assets/decorations/deco_18.png',
    // Tiny Swords Update 010 — Knights/Buildings/*_Construction: khung giàn giáo gỗ
    // thay cho hiệu ứng chỉ giảm alpha lúc tháp đang xây.
    // Trại quái ở điểm spawn + cọc đầu lâu trang trí quanh trại
    goblinCamp: 'assets/buildings/goblin_camp.png',
    skullSpike: 'assets/decorations/skull_spike.png',
    towerConstruction: 'assets/buildings/tower_construction.png', // tháp tròn (Pháo Đài)
    houseConstruction: 'assets/buildings/house_construction.png', // nền vuông (Cung Thủ/Doanh Trại/Pháp Sư)

    // ---- UI chrome ----
    btnBigBlueRegular: 'assets/ui/btn_big_blue_regular.png',
    btnBigBluePressed: 'assets/ui/btn_big_blue_pressed.png',
    btnBigRedRegular: 'assets/ui/btn_big_red_regular.png',
    btnBigRedPressed: 'assets/ui/btn_big_red_pressed.png',
    btnTinyRoundBlue: 'assets/ui/btn_tiny_round_blue.png',
    btnTinyRoundRed: 'assets/ui/btn_tiny_round_red.png',
    btnTinySquareBlue: 'assets/ui/btn_tiny_square_blue.png',
    paperRegular: 'assets/ui/paper_regular.png',
    banner: 'assets/ui/banner.png',
    woodTable: 'assets/ui/wood_table.png',
    barBase: 'assets/ui/bar_base.png',
    barFill: 'assets/ui/bar_fill.png',
    iconCoin: 'assets/ui/icon_coin.png',
    iconClose: 'assets/ui/icon_close.png',
    iconGear: 'assets/ui/icon_gear.png',
    iconMusic: 'assets/ui/icon_music.png',
    iconSlash: 'assets/ui/icon_slash.png',
    iconInfo: 'assets/ui/icon_info.png',
    iconSword: 'assets/ui/icon_sword.png',

    // ---- Buildings (tháp) ----
    blueCastle: 'assets/buildings/blue_castle.png',
    blueArchery: 'assets/buildings/blue_archery.png',
    blueBarracks: 'assets/buildings/blue_barracks.png',
    blueTower: 'assets/buildings/blue_tower.png',
    blueMonastery: 'assets/buildings/blue_monastery.png',
    yellowArchery: 'assets/buildings/yellow_archery.png',
    yellowBarracks: 'assets/buildings/yellow_barracks.png',
    yellowTower: 'assets/buildings/yellow_tower.png',
    yellowMonastery: 'assets/buildings/yellow_monastery.png',
    redArchery: 'assets/buildings/red_archery.png',
    redBarracks: 'assets/buildings/red_barracks.png',
    redTower: 'assets/buildings/red_tower.png',
    redMonastery: 'assets/buildings/red_monastery.png',
  };

  const soundList = {
    shoot: 'assets/sfx/shoot.ogg',
    explosion: 'assets/sfx/explosion.ogg',
    coin: 'assets/sfx/coin.ogg',
    hurt: 'assets/sfx/hurt.ogg',
    // Đổi sang tiếng click Kenney (cùng họ với bộ SFX gốc) cho đỡ lệch tông
    // so với select.ogg cũ.
    select: 'assets/sfx/addons_kenney_ui_audio_click1.wav',
    // Đổi sang tiếng thua mixkit — rõ và "đúng cảm xúc" hơn bản lose.ogg cũ.
    lose: 'assets/sfx/mixkit-player-losing-or-failing-2042.wav',
    build: 'assets/sfx/build.ogg',
    error: 'assets/sfx/error.ogg',
    // Tiếng đóng đinh liên tục, phát suốt lúc tháp đang xây (buildTimer > 0),
    // dừng ngay khi xây xong — xem tower.js update() và main.js tryBuildTower().
    hammer: 'assets/sfx/Am_thanh_tieng_Dong_dinh_tren_van_go-www_tiengdong_com.mp3',
    win: 'assets/sfx/mixkit-game-level-completed-2059.wav',
    unlock: 'assets/sfx/mixkit-unlock-game-notification-253.wav',
    upgrade: 'assets/sfx/upgrade.wav',
    boost: 'assets/sfx/boost.wav',
  };

  function loadImage(key, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images[key] = img; loaded++; resolve(); };
      img.onerror = () => { console.warn('Không load được ảnh:', src); images[key] = null; loaded++; resolve(); };
      img.src = src;
    });
  }

  function loadSound(key, src) {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.oncanplaythrough = () => { sounds[key] = audio; loaded++; resolve(); };
      audio.onerror = () => { console.warn('Không load được âm thanh:', src); sounds[key] = null; loaded++; resolve(); };
      audio.src = src;
      audio.load();
      // fallback nếu event không bắn (một số trình duyệt/file://)
      setTimeout(() => { if (!sounds[key] && sounds[key] !== null) { sounds[key] = audio; loaded++; resolve(); } }, 1500);
    });
  }

  async function loadAll(onProgress) {
    total = Object.keys(imageList).length + Object.keys(soundList).length;
    loaded = 0;
    const tasks = [];
    for (const k in imageList) tasks.push(loadImage(k, imageList[k]).then(() => onProgress && onProgress(loaded / total)));
    for (const k in soundList) tasks.push(loadSound(k, soundList[k]).then(() => onProgress && onProgress(loaded / total)));
    await Promise.all(tasks);
  }

  function playSound(key, opts = {}) {
    const base = sounds[key];
    if (!base) return;
    try {
      const s = base.cloneNode();
      s.volume = (opts.volume !== undefined ? opts.volume : 1) * SoundSettings.sfxVolume;
      if (!SoundSettings.muted) s.play().catch(() => {});
    } catch (e) { /* ignore autoplay restrictions */ }
  }

  // Giống playSound nhưng trả về chính node Audio đang phát (loop mặc định),
  // để nơi gọi có thể ngắt ngay lập tức bằng stopSound() — dùng cho SFX kéo dài
  // theo một khoảng thời gian (ví dụ tiếng đóng đinh suốt lúc xây tháp).
  function playSustained(key, opts = {}) {
    const base = sounds[key];
    if (!base) return null;
    try {
      const s = base.cloneNode();
      s.loop = opts.loop !== undefined ? opts.loop : true;
      s.volume = (opts.volume !== undefined ? opts.volume : 1) * SoundSettings.sfxVolume;
      if (!SoundSettings.muted) s.play().catch(() => {});
      return s;
    } catch (e) { return null; }
  }

  function stopSound(instance) {
    if (!instance) return;
    try { instance.pause(); instance.currentTime = 0; } catch (e) { /* ignore */ }
  }

  function getImage(key) { return images[key] || null; }

  return { loadAll, getImage, playSound, playSustained, stopSound, images, sounds };
})();

// Cài đặt âm lượng đơn giản, có thể bật/tắt trong màn Cài đặt.
const SoundSettings = {
  muted: false,
  sfxVolume: 0.6,
  musicMuted: false,
  musicVolume: 0.35,
};

// Nhạc nền: 1 file loop riêng, tách khỏi hệ thống SFX (không chờ load trước khi
// vào menu). Trình duyệt chặn autoplay có âm thanh trước khi người dùng tương
// tác, nên start() chỉ thật sự phát nhạc sau cú click/phím đầu tiên (xem menu.js).
const MusicPlayer = (() => {
  let audio = null;
  let started = false;

  function _ensure() {
    if (!audio) {
      audio = new Audio('assets/sfx/time_for_adventure.mp3');
      audio.loop = true;
      audio.volume = SoundSettings.musicVolume;
    }
    return audio;
  }

  function start() {
    if (started) return;
    started = true;
    const a = _ensure();
    if (!SoundSettings.musicMuted) a.play().catch(() => {});
  }

  function applySettings() {
    if (!audio) return;
    audio.volume = SoundSettings.musicVolume;
    if (SoundSettings.musicMuted) audio.pause();
    else if (started) audio.play().catch(() => {});
  }

  return { start, applySettings };
})();
