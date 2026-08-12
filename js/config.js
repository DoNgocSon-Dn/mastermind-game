// ============================================================
// CONFIG.JS — Toàn bộ số liệu cân bằng của game (không hardcode
// rải rác trong logic). Chỉnh số ở đây để cân bằng lại game.
// ============================================================
const CONFIG = {
  canvas: { width: 960, height: 600 },

  // ---------------- Kinh tế ----------------
  economy: {
    startGold: 250,
    startLives: 20,
    sellRefundRatio: 0.6,
  },

  // ---------------- Tốc độ game ----------------
  speedOptions: [1, 2, 3],

  // ---------------- 4 Loại Tháp ----------------
  // levels[0..2] = Level 1..3 (chỉ tăng chỉ số).
  // branches.A / branches.B = Level 4A / 4B (rẽ nhánh, không đảo ngược).
  towers: {
    archer: {
      label: 'Tháp Cung Thủ',
      desc: 'Tầm xa, bắn nhanh, sát thương Vật lý thấp.',
      buildTime: 1.5, // giây xây xong mới bắn được — nhẹ, dựng nhanh
      color: '#8a5a2b',
      projectileType: 'arrow',
      damageType: 'physical',
      canHitFlying: true,
      levels: [
        { cost: 60,  range: 95,  rate: 0.55, damage: 12 },
        { cost: 45,  range: 105, rate: 0.48, damage: 20 },
        { cost: 80,  range: 115, rate: 0.40, damage: 30 },
      ],
      branches: {
        A: {
          label: 'Crossbow Fort (4A)',
          cost: 140,
          desc: 'Sát thương cực cao + hay chí mạng, thỉnh thoảng bắn dồn 1 loạt 6 mũi vào 1 mục tiêu. Hợp để hạ boss/quái trâu máu.',
          range: 145, rate: 0.32, damage: 38,
          critChance: 0.15, critMult: 2.0,
          skill: { name: 'Barrage', cooldown: 8, burstCount: 6, burstInterval: 0.10, burstDamage: 16 },
        },
        B: {
          label: 'Ranger Hideout (4B)',
          cost: 140,
          desc: 'Trúng tên gây độc rỉ máu theo thời gian, thỉnh thoảng trói chân cả đàn quái trong tầm bắn. Hợp để cản một nhóm đông.',
          range: 125, rate: 0.45, damage: 24,
          poison: { damage: 7, duration: 3, tick: 0.5 }, // True damage DOT
          skill: { name: 'Wrath of Forest', cooldown: 11, rootDuration: 2 },
        },
      },
    },

    barracks: {
      label: 'Doanh Trại',
      desc: 'Sinh 3 lính chặn đường tại Rally Point.',
      buildTime: 2, // lính cần thời gian huấn luyện trước khi ra quân
      color: '#5b6b8c',
      damageType: 'physical',
      soldierCount: 3,
      levels: [
        { cost: 90,  hp: 70,  dmg: 9,  atkRate: 0.9, respawn: 13 },
        { cost: 60,  hp: 100, dmg: 13, atkRate: 0.85, respawn: 12 },
        { cost: 100, hp: 140, dmg: 18, atkRate: 0.8, respawn: 11 },
      ],
      branches: {
        A: {
          label: 'Paladin Chapter (4A)',
          cost: 170,
          desc: 'Lính trâu đòn, giáp rất cao, tự hồi máu cho cả đội và gây thêm sát thương phép quanh lính đang đánh. Hợp để chặn đường lâu dài, không cần thay lính.',
          hp: 260, dmg: 16, atkRate: 0.8, armor: 0.68, respawn: 10,
          skill: { name: 'Holy Strike', cooldown: 12, radius: 70, damage: 30 },
          heal:  { name: 'Healing Light', cooldown: 15, radius: 90, amount: 60 },
        },
        B: {
          label: 'Barbarian Hall (4B)',
          cost: 170,
          desc: 'Lính đánh mạnh hơn hẳn nhưng ít máu, có thể ném rìu trúng cả quái bay (lính thường không đánh được quái bay). Hợp để dứt điểm nhanh.',
          hp: 150, dmg: 30, atkRate: 0.6, armor: 0, respawn: 9,
          canHitFlying: true,
          skill: { name: 'Throwing Axes', cooldown: 6, damage: 22 },
        },
      },
    },

    mage: {
      label: 'Tháp Pháp Sư',
      desc: 'Bắn chậm, sát thương Phép, xuyên giáp Vật lý.',
      buildTime: 2.5, // khắc trận pháp mất thời gian hơn tháp thường
      color: '#5a3d7a',
      projectileType: 'bolt',
      damageType: 'magic',
      canHitFlying: true,
      levels: [
        { cost: 80,  range: 90,  rate: 1.3, damage: 26 },
        { cost: 55,  range: 98,  rate: 1.15, damage: 42 },
        { cost: 95,  range: 106, rate: 1.0, damage: 60 },
      ],
      branches: {
        A: {
          label: 'Arcane Wizard (4A)',
          cost: 190,
          desc: 'Thỉnh thoảng bắn tia "tử thần" giết gọn 1 mục tiêu bất kể máu trâu cỡ nào, kèm phép đẩy lùi cả nhóm quái gần. Hợp để hạ boss hoặc câu giờ khi quái dồn đông.',
          range: 115, rate: 0.9, damage: 75,
          skill: { name: 'Death Ray', cooldown: 20, trueDamage: 9999 },
          skill2: { name: 'Teleport', cooldown: 16, pushCount: 3, pushBack: 60 },
        },
        B: {
          label: 'Sorcerer (4B)',
          cost: 190,
          desc: 'Biến 1 quái thành cừu vô hại tạm thời. Hợp để khống chế đám đông.',
          range: 110, rate: 1.0, damage: 55,
          skill: { name: 'Polymorph', cooldown: 11, duration: 4 },
        },
      },
    },

    artillery: {
      label: 'Tháp Pháo Đài',
      desc: 'Bắn rất chậm, AOE, không bắn được quái bay.',
      buildTime: 3.5, // công trình nặng + phải nạp đạn nên xây lâu nhất trong 4 tháp
      color: '#7a3b3b',
      projectileType: 'shell',
      damageType: 'physical',
      canHitFlying: false,
      splash: 55,
      levels: [
        { cost: 100, range: 130, rate: 1.9, damage: 40 },
        { cost: 70,  range: 140, rate: 1.7, damage: 62 },
        { cost: 120, range: 150, rate: 1.5, damage: 88 },
      ],
      branches: {
        A: {
          label: 'Big Bertha (4A)',
          cost: 220,
          desc: 'Nổ diện rộng hơn hẳn, thỉnh thoảng thả bom chùm và tên lửa sát thương cực lớn. Hợp để dọn cả đàn quái đông cùng lúc.',
          range: 165, rate: 1.4, damage: 100, splash: 75,
          skill: { name: 'Cluster Bomb', cooldown: 10, miniCount: 8, miniDamage: 24, miniRadius: 30 },
          skill2: { name: 'Dragon Missile', cooldown: 12, damage: 130 },
        },
        B: {
          label: 'Tesla T200 (4B)',
          cost: 220,
          desc: 'Bắn nhanh hơn, sét lan liên tiếp sang nhiều mục tiêu và bắn được cả quái bay (tháp gốc không bắn được quái bay). Hợp khi quái bay hoặc đi thành hàng dài.',
          range: 150, rate: 0.9, damage: 46,
          canHitFlying: true,
          chain: { targets: 5, falloff: 0.82 },
        },
      },
    },
  },

  // ---------------- Quái vật ----------------
  enemies: {
    normal: { hp: 55,  speed: 37, armor: 0.10, magicResist: 0.05, reward: 8,  scale: 1.0,  dmg: 8,  atkRate: 1.0 },
    fast:   { hp: 32,  speed: 75, armor: 0,    magicResist: 0,    reward: 6,  scale: 0.85, dmg: 5,  atkRate: 0.8 },
    tank:   { hp: 230, speed: 21, armor: 0.45, magicResist: 0.25, reward: 15, scale: 1.25, dmg: 16, atkRate: 1.3 },
    flying: { hp: 45,  speed: 51, armor: 0,    magicResist: 0.30, reward: 11, scale: 0.95, isFlying: true, dmg: 7, atkRate: 1.0 },
    boss:   { hp: 2200, speed: 18, armor: 0.30, magicResist: 0.30, reward: 200, scale: 1.7, isBoss: true, dmg: 30, atkRate: 1.0 },

    // ---- Phân Thân (map 7 trở đi, xuất hiện ngẫu nhiên theo wave — xem map.js:
    // injectSplitterWaves) — quái to, máu trâu; đi được nửa đường (enemy.js:_split)
    // sẽ TỰ TÁCH thành 3 quái nhỏ "splitling" toả ra 3 hướng lệch nhau rồi tiếp tục
    // chạy vào Thành. reward=0 cho splitter: tách xong không tính là "hạ được nó"
    // (3 splitling mới thật sự cho vàng khi bị hạ) — nếu không sẽ ăn vàng 2 lần.
    splitter:  { hp: 480, speed: 24, armor: 0.25, magicResist: 0.15, reward: 0, scale: 1.55, dmg: 14, atkRate: 1.0 },
    splitling: { hp: 45,  speed: 58, armor: 0,    magicResist: 0.05, reward: 9, scale: 0.8,  dmg: 6,  atkRate: 0.9 },

    // ---- Boss riêng từng mùa (map thứ 4 mỗi mùa) — chỉ số base tăng nhẹ qua từng mùa,
    // phần lớn độ khó tăng đến từ difficulty/số wave của map (waveScaleFor nhân dồn),
    // mỗi boss có bossAbility riêng (xử lý trong enemy.js _updateBossAbility).
    bossSpring: {
      hp: 1800, speed: 16, armor: 0.35, magicResist: 0.20, reward: 220, scale: 1.8,
      isBoss: true, dmg: 22, atkRate: 1.1,
      bossAbility: { type: 'healAura', cooldown: 6, radius: 90, amount: 40 },
    },
    bossSummer: {
      hp: 2000, speed: 24, armor: 0.20, magicResist: 0.35, reward: 260, scale: 1.85,
      isBoss: true, dmg: 42, atkRate: 0.9,
      bossAbility: { type: 'burnNova', cooldown: 5, radius: 70, damage: 24 },
    },
    bossAutumn: {
      hp: 2200, speed: 19, armor: 0.35, magicResist: 0.40, reward: 300, scale: 1.9,
      isBoss: true, dmg: 26, atkRate: 1.0,
      bossAbility: { type: 'mistWeaken', cooldown: 7, radius: 100, rangeMult: 0.7, duration: 4 },
    },
    bossWinter: {
      hp: 2400, speed: 17, armor: 0.45, magicResist: 0.40, reward: 360, scale: 2.0,
      isBoss: true, dmg: 34, atkRate: 1.0,
      bossAbility: {
        type: 'frostSlow', cooldown: 7, radius: 100, rateMult: 1.8, duration: 4,
        rootChance: 0.4, rootRadius: 130, rootDuration: 1.5,
      },
    },
  },

  // ---------------- Hero (3 lớp nhân vật, chọn ở màn Chọn Tướng sau Chọn Map) ----------------
  // Mỗi hero: chỉ số nền + 1 passive (luôn bật) + 1 active skill (phím Q / nút HUD).
  heroTypes: {
    archer: {
      label: 'Cung Thủ',
      badge: 'Xạ Thủ Tầm Xa',
      desc: 'Bắn nhanh từ khoảng cách xa, chí mạng cực cao và xả bão tên diệt quái.',
      hp: 220, speed: 118, attackRange: 150, attackDamage: 16, attackRate: 0.55,
      damageType: 'physical', respawnTime: 15, ranged: true, projectileSpeed: 480,
      spriteIdle: 'heroArcherIdle', spriteRun: 'heroArcherIdle', spriteAttack: 'heroArcherShoot', frame: 192,
      passive: {
        name: 'Mắt Diều Hâu',
        desc: 'Tăng +25% Tỉ lệ Chí Mạng và x2.0 Sát Thương khi bắn chí mạng.',
        critChance: 0.25, critMult: 2.0
      },
      skill: {
        id: 'volley', name: 'Mưa Tên', key: 'Q', cooldown: 9,
        desc: 'Lộn né đòn 60px và bắn rải 10 mũi tên liên tiếp vào vùng chọn (18 ST/mũi).',
        dodgeDist: 60, radius: 72, arrows: 10, arrowDelay: 0.05, damage: 18,
      },
    },
    spear: {
      label: 'Lính Giáo',
      badge: 'Tiền Tuyến Xuyên Phá',
      desc: 'Tầm đâm xa vượt trội, khả năng lướt càn quét và làm choáng diện rộng.',
      hp: 320, speed: 116, attackRange: 68, attackDamage: 24, attackRate: 0.75,
      damageType: 'physical', respawnTime: 15, ranged: false,
      spriteIdle: 'heroSpearIdle', spriteRun: 'heroSpearRun', spriteAttack: 'heroSpearIdle', frame: 320,
      passive: {
        name: 'Mũi Giáo Xuyên Phá',
        desc: 'Tầm đâm xa (68px), đánh trúng nhiều quái vật đứng theo hàng trên đường.',
        trailColor: '#bfe8ff'
      },
      skill: {
        id: 'piercingRush', name: 'Cú Đâm Xuyên Phá', key: 'Q', cooldown: 8,
        desc: 'Lao tới 150px đâm xuyên đội hình, gây 45 ST, choáng 1.2s và đẩy lùi quái.',
        dashDist: 150, dashDuration: 0.22, width: 34, damage: 45, stunDuration: 1.2, knockback: 26,
      },
    },
    tank: {
      label: 'Khiên & Kiếm',
      badge: 'Đỡ Đòn & Hào Quang',
      desc: 'Máu trâu kiên cố, khả năng tự hồi máu và tỏa hào quang tăng giáp cho lính.',
      hp: 380, speed: 105, attackRange: 46, attackDamage: 22, attackRate: 0.7,
      damageType: 'physical', respawnTime: 15, ranged: false,
      spriteIdle: 'heroIdle', spriteRun: 'heroRun', spriteAttack: 'heroAttack', frame: 192,
      passive: {
        name: 'Thành Trì Kiên Cố',
        desc: 'Hào quang 95px: Tăng +30% Giáp và tự hồi 6 HP/s cho lính xung quanh.',
        aura: { radius: 95, armorBonus: 0.3, regenPerSec: 6 }
      },
      skill: {
        id: 'battleCry', name: 'Tiếng Hét Khích Lệ', key: 'Q', cooldown: 12,
        desc: 'Hú vang khích lệ (110px): Tăng +50% Tốc đánh & +30% ST cho đồng đội trong 6s.',
        radius: 110, atkRateMult: 1.5, dmgMult: 1.3, duration: 6,
      },
    },
  },

  // ---------------- Global Skills ----------------
  globalSkills: {
    reinforcement: {
      name: 'Gọi Tiếp Viện',
      cooldown: 25,
      unitCount: 2,
      unitHp: 90,
      unitDmg: 12,
      duration: 20,
    },
    rainOfFire: {
      name: 'Mưa Lửa',
      cooldown: 30,
      delay: 1.2,
      radius: 70,
      duration: 3,
      tick: 0.4,
      damagePerTick: 14,
    },
  },

  // ---------------- Damage Text màu ----------------
  damageColors: {
    physical: '#ffffff',
    magic: '#c07bff',
    true: '#ffd23f',
    crit: '#ffd23f',
    heal: '#5cff8a',
  },

  // ---------------- Thông báo cơ chế mới theo map ----------------
  // Key = map id (map.js MAPS[i].id). Hiện đúng 1 lần mỗi khi VÀO map đó (mỗi lần
  // chơi lại vẫn hiện lại) trừ khi người chơi tick "Không hiện lại" (xem
  // ui/guide.js + systems/tutorial.js). Chỉ gắn ở map thật sự đổi luật chơi.
  mechanicIntros: {
    1: {
      icon: '🌀',
      title: 'Quái Phân Thân',
      lines: [
        'Thân hình to, máu trâu hơn hẳn quái thường.',
        'Đi được nửa đường là TỰ TÁCH thành 3 quái nhỏ, toả 3 hướng rồi lao tiếp vào thành.',
        'Dàn hoả lực diện rộng (tháp AoE) quanh giữa đường để dọn gọn cả 3 con cùng lúc.',
      ],
    },
    4: {
      icon: '🧭',
      title: 'Tấn Công Nhiều Hướng',
      lines: [
        'Quái đổ bộ từ NHIỀU cổng ra quân cùng lúc, không còn chỉ 1 hướng.',
        'Các luồng quái chia nhánh rồi hội tụ lại tại một điểm trước khi đánh thẳng vào thành.',
        'Bố trí tháp ngay tại những "nút thắt" nơi các luồng quái gặp nhau để tối ưu hỏa lực.',
      ],
    },
    8: {
      icon: '🕳️',
      title: 'Hầm Bí Mật',
      lines: [
        'Một số quái chui vào hầm bí mật giữa đường, biến mất khỏi tầm bắn.',
        'Chúng bất ngờ chui lên ở vị trí khác gần cuối đường, rút ngắn quãng đường bị tháp bắn.',
        'Chú ý các cổng hầm phát sáng trên bản đồ, bố trí thêm hỏa lực gần khu vực cổng ra.',
      ],
    },
    10: {
      icon: '🔀',
      title: 'Đường Luân Phiên Đóng/Mở',
      lines: [
        'Không phải lúc nào cả 2 hướng đường cũng cùng mở.',
        'Mỗi đợt chỉ MỘT hướng được quái sử dụng, luân phiên qua lại giữa các đợt.',
        'Quan sát cổng nào đang mở trước khi dồn hết tháp vào 1 phía.',
      ],
    },
  },
};
