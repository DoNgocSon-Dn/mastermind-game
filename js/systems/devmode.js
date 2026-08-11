// ============================================================
// DEVMODE.JS — Chế độ dev ẩn: vàng vô hạn + mở hết map, chỉ bật được từ ô Dev Mode
// trong Cài đặt (ô đó chỉ hiện ra sau khi gõ "@@@" — xem menu.js).
// CỐ Ý KHÔNG lưu trạng thái BẬT qua localStorage — nếu lưu thì lỡ bật lên 1 lần là
// bật vĩnh viễn ở mọi lần tải trang sau, mà ô tắt lại nằm ẩn sau đúng mã "@@@" nên
// rất dễ bị kẹt bật mà không biết cách tắt. Luôn bắt đầu TẮT mỗi lần tải trang mới;
// phải gõ mã + tự tick lại mỗi phiên nếu muốn dùng.
// ============================================================
const DevMode = (() => {
  // Dọn cờ cũ (từ bản trước có lưu localStorage) — đảm bảo không còn sót trạng thái
  // BẬT ẩn nào từ trước ảnh hưởng tới phiên chơi hiện tại.
  try { localStorage.removeItem('td_devmode_v1'); } catch (e) { /* localStorage không khả dụng */ }

  let enabled = false;
  function set(v) { enabled = !!v; }

  return { get enabled() { return enabled; }, set };
})();
