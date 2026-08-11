// ============================================================
// ECONOMY.JS — Vàng, giá xây/nâng cấp, thưởng vàng khi giết quái.
// ============================================================
class Economy {
  constructor(startGold) {
    this.gold = startGold;
  }
  canAfford(cost) { return (typeof DevMode !== 'undefined' && DevMode.enabled) || this.gold >= cost; }
  // Dev Mode: tiêu vẫn "thành công" nhưng KHÔNG trừ vàng thật — vô hạn theo đúng
  // nghĩa đen, không phải chỉ set 1 số cực lớn rồi vẫn có thể tiêu hết.
  spend(cost) {
    if (!this.canAfford(cost)) return false;
    if (!(typeof DevMode !== 'undefined' && DevMode.enabled)) this.gold -= cost;
    return true;
  }
  earn(amount) { this.gold += amount; }
  refund(amount) { this.gold += Math.round(amount * CONFIG.economy.sellRefundRatio); }
}
