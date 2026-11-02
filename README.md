# Thủ Thành

Game tower defense bằng HTML, CSS và JavaScript thuần. Mở `index.html` trong trình duyệt để chơi; không cần build.

Menu hỗ trợ điện thoại dọc. Khi vào trận, xoay ngang để có bản đồ và nút chơi lớn hơn.

- Phím 1–4: chọn tháp. Q: chiêu tướng. Space: tạm dừng. Escape: hủy thao tác đang chọn.
- Có thể xây và nâng cấp trong lúc tướng di chuyển. Khi chuyển tab, game tự dừng và chờ người chơi tiếp tục.
- Âm lượng được lưu trên trình duyệt. Trong Cài đặt, dùng **Sao lưu tiến độ** / **Khôi phục từ tệp** cho tiến độ chiến dịch, nghiên cứu và kỷ lục vô tận. Khôi phục sẽ thay thế dữ liệu hiện tại.

Bảng Đợt tiếp theo cho biết loại quái, số lượng, đường vào và cảnh báo hầm/boss. Đợt đầu chờ người chơi bấm gọi; nút tự động vẫn có thể nối tiếp các đợt. Chọn tháp hoặc chuẩn bị xây để xem chỉ số, so sánh cấp tiếp theo và hai nhánh cấp 4.

Tháp Cung, Pháp Sư và Pháo Đài có ba ưu tiên mục tiêu: **Gần thành** (quãng đường còn lại ngắn nhất), **Máu cao** (máu hiện tại cao nhất), **Gần tháp**. Lựa chọn áp dụng cho phát bắn tiếp theo và giữ nguyên khi nâng cấp. Doanh Trại tiếp tục điều khiển bằng điểm tập kết.

Cơ chế địa hình (vòng giới hạn và nhãn hiện trực tiếp trên bản đồ):

- **Miệng Núi Lửa (màn 8):** khe nhiệt gây 8 sát thương chuẩn mỗi 0,5 giây lên quái mặt đất trong vùng khi phun. Không hại quân mình, quái bay hoặc quái dưới hầm.
- **Đầm Lầy Sương Mù (màn 10):** bùn giảm 25% tốc độ di chuyển quái mặt đất, không ảnh hưởng quân mình hoặc quái bay.
- **Mùa đông (màn 13–16):** gió lạnh giảm 28% tốc độ di chuyển của cả quái, Hero và lính trong vùng, kể cả quái bay. Tốc độ đánh không đổi.

Khe nhiệt và gió lạnh có chu kỳ 14 giây (nghỉ 9, cảnh báo 2, hoạt động 3), lệch nhịp giữa các vùng. Đồng hồ bắt đầu từ đợt đầu, dừng khi tạm dừng và chạy theo tốc độ trận. Hiệu ứng chậm hết ngay khi rời vùng, không cộng dồn giữa các vùng. Cảnh nền ngoài các vòng này chỉ mang tính trang trí.

Kiểm tra hồi quy dữ liệu lưu và thông tin chiến thuật:

```sh
node tools/regression-test.js
node tools/tactical-test.cjs
node tools/combat-test.cjs
node tools/environment-test.cjs
```

Kiểm tra luồng chơi và giao diện bằng Chromium (cần Playwright và trình duyệt của nó):

```sh
npm install --no-save playwright
npx playwright install chromium
node tools/ui-smoke.cjs
node tools/campaign-smoke.cjs
node tools/scenery-smoke.cjs
```

Có thể đặt `TD_PLAYWRIGHT_PATH` trỏ tới module Playwright đã cài sẵn và `PLAYWRIGHT_BROWSERS_PATH` trỏ tới thư mục trình duyệt để dùng lại môi trường hiện có.

`campaign-smoke.cjs` kiểm tra khởi tạo, hiển thị và mô phỏng ngắn trên cả 16 màn với mọi loại quái và hai nhánh tháp. Đây là kiểm tra lỗi chạy, không thay thế việc chơi hết chiến dịch để đánh giá cân bằng.

Website: https://mastermind-kappa-ashen.vercel.app/
