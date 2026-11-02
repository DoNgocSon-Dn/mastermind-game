// ============================================================
// WAVE.JS — Spawn quái theo wave, dữ liệu wave định nghĩa trong map.js
// Mỗi wave: [{ type:'normal', count:10, interval:1.0, delay:0 }, ...]
// Mặc định mọi wave chờ xác nhận để người chơi xem trước và bố trí tháp.
// WaveManager chờ requestNextWaveNow() do
// người chơi bấm xác nhận — TRỪ KHI autoAdvance đang bật, khi đó wave kế tiếp
// tự bắt đầu ngay khi wave hiện tại spawn xong, nối tiếp liên tục hết toàn bộ
// các wave theo thứ tự cho tới khi người chơi bấm nút tắt lại.
// ============================================================

class WaveManager {
  // endlessGen (tuỳ chọn): hàm (waveIndex) -> mảng group cho 1 đợt mới. Có set =
  // CHẾ ĐỘ VÔ TẬN: hết waveDefs không "thắng" mà sinh thêm đợt mãi mãi (chơi tới khi
  // hết mạng). Xem systems/endless.js.
  constructor(waveDefs, onSpawn, onWaveStart, onAllWavesDone, endlessGen) {
    this.waveDefs = waveDefs;
    this.onSpawn = onSpawn;
    this.onWaveStart = onWaveStart;
    this.onAllWavesDone = onAllWavesDone;
    this.endlessGen = endlessGen || null;

    this.waveIndex = -1;
    this.active = false;
    this.finishedAllSpawns = false;
    this.timeToNextWave = 2.0; // thời gian nghỉ trước khi wave đầu tiên tự bắt đầu
    this.autoAdvance = false; // true = tự nối tiếp hết các wave, không chờ xác nhận
  }

  get endless() { return !!this.endlessGen; }
  get totalWaves() { return this.waveDefs.length; }
  get currentWaveNumber() { return this.endless ? this.waveIndex + 1 : Math.min(this.waveIndex + 1, this.totalWaves); }
  // Đã xong wave hiện tại (hoặc chưa xây gì) và còn wave sau — đang chờ người chơi xác nhận.
  get waitingForConfirm() { return !this.active && this.waveIndex >= 0 && !this.finishedAllSpawns; }

  previewNextWave() {
    const index = this.waveIndex + 1;
    if (this.finishedAllSpawns) return null;
    const groups = this.waveDefs[index] || (this.endlessGen ? this.endlessGen(index) : null);
    return groups ? { number: index + 1, groups: groups.map(group => ({ ...group })) } : null;
  }

  setAutoAdvance(on) {
    this.autoAdvance = on;
    // Đang chờ xác nhận sẵn (vừa xong 1 wave) mà bật auto lên -> bắn luôn wave kế tiếp.
    if (on && this.waitingForConfirm) this.startNextWave();
  }

  startNextWave() {
    this.waveIndex++;
    if (this.waveIndex >= this.waveDefs.length) {
      if (this.endlessGen) {
        // Vô tận: sinh thêm 1 đợt rồi chơi tiếp — không bao giờ "thắng".
        this.waveDefs.push(this.endlessGen(this.waveIndex));
      } else {
        this.finishedAllSpawns = true;
        this.onAllWavesDone && this.onAllWavesDone();
        return;
      }
    }
    this.active = true;
    this._groups = this.waveDefs[this.waveIndex].map(g => ({ ...g, spawned: 0, timer: g.delay || 0 }));
    this.onWaveStart && this.onWaveStart(this.waveIndex);
  }

  // Người chơi bấm nút "Wave tiếp theo": dùng để bỏ qua thời gian nghỉ trước wave
  // đầu, hoặc (từ wave 2 trở đi) là cách DUY NHẤT để bắt đầu wave kế tiếp.
  requestNextWaveNow() {
    if (!this.active && !this.finishedAllSpawns) {
      this.startNextWave();
    }
  }

  update(dt) {
    if (!this.active) {
      if (this.finishedAllSpawns) return;
      // Chỉ đếm giờ wave đầu khi bật tự động. Từ wave 2 trở đi, waitingForConfirm
      // sẽ đứng yên ở đây mãi cho tới khi requestNextWaveNow() được gọi.
      if (this.waveIndex === -1 && this.autoAdvance) {
        this.timeToNextWave -= dt;
        if (this.timeToNextWave <= 0) this.startNextWave();
      }
      return;
    }
    let allDone = true;
    for (const g of this._groups) {
      if (g.spawned >= g.count) continue;
      allDone = false;
      g.timer -= dt;
      if (g.timer <= 0) {
        // `tunnelChance` (tuỳ chọn, 0-1): mỗi con trong group tự tung xúc xắc riêng
        // xem có chui hầm hay không, thay vì CẢ group luôn chui/luôn không — tạo cảm
        // giác "dịch chuyển ngẫu nhiên" thay vì cố định. Không set = giữ hành vi cũ
        // (luôn chui khi có tunnelIndex).
        const useTunnel = g.tunnelIndex != null && (g.tunnelChance == null || Math.random() < g.tunnelChance);
        this.onSpawn(g.type, g.path || 0, useTunnel ? g.tunnelIndex : null);
        g.spawned++;
        g.timer = g.interval;
      }
    }
    if (allDone) {
      this.active = false; // -> waitingForConfirm = true
      // Chế độ VÔ TẬN: không bao giờ "hết wave" — luôn còn đợt sau để gọi.
      if (this.endlessGen) {
        if (this.autoAdvance) this.startNextWave();
        return;
      }
      // Wave CUỐI CÙNG vừa spawn xong: không còn đợt nào để chờ xác nhận nữa — tự
      // chốt finishedAllSpawns luôn, thay vì bắt người chơi bấm "gọi đợt" thêm 1 lần
      // (trước đây huy hiệu 💀 + trạng thái "Sẵn sàng đợt sau" vẫn hiện sau boss cuối,
      // gây hiểu lầm là còn wave). checkWinLose sẽ cho thắng khi quái cuối bị dọn sạch.
      if (this.waveIndex >= this.waveDefs.length - 1) {
        this.finishedAllSpawns = true;
        this.onAllWavesDone && this.onAllWavesDone();
      } else if (this.autoAdvance) {
        this.startNextWave(); // nối liên tục sang wave kế, không chờ xác nhận
      }
    }
  }
}
