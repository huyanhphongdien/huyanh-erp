# 🎥 Video 3: Chuyển kho liên nhà máy (TL/LAO → PD)

> **Thời lượng**: ~8 phút
> **Đối tượng**: Quản lý kho TL/LAO + NV cân TL + NV cân PD + BGD
> **Mục tiêu**: Hiểu workflow CORE multi-facility — chuyển TP từ nhà máy vệ tinh về Phong Điền để xuất khẩu, có cân 2 đầu, đối soát hao hụt, BGD duyệt nếu vượt ngưỡng

---

## 0. Pre-recording (off-camera, ~10 phút setup)

### Data cần có sẵn (Claude làm hộ qua service_role)

- ✅ Batch SVR_10 trong KHO-TL-TP: **`TL-SEED-F3-001` 750 bành / 25,000.05 kg**
- ✅ Stock TL-TP empty trừ batch trên (clean state)
- ✅ Stock KHO-A PD: 888.01 kg cũ (để demo "cộng thêm")
- ✅ Migration F3 đã chạy (5 file SQL)

Báo Claude: **"setup data video 3"** → seed batch + clean transfers cũ trong 30 giây.

### Tabs

| Tab | URL | Account | Note |
|---|---|---|---|
| 1 | `huyanhrubber.vn/wms/transfer` | Lê Duy Minh | Chuyển kho list |
| 2 | `can-tl.huyanhrubber.vn` | Operator PIN 1234 | Trạm cân **TL** |
| 3 | `can.huyanhrubber.vn` | Operator PIN 1234 | Trạm cân **PD** |
| 4 | `huyanhrubber.vn/wms?tab=overview` | Lê Duy Minh | Tồn kho (verify cuối) |

### Test data số liệu

- Phiếu chuyển: 200 bành SVR_10 = 6,666.7 kg planned
- Xe đi: biển số `75H1-9999`, tài xế `Nguyễn Văn Đi`
- Cân scale TL: gross **9,000 kg** (xe + hàng) → tare auto = 9000 - 6666.7 = 2,333.3
- Cân scale PD: Gross **8,950 kg**, Tare **2,335 kg** → NET = 6,615 kg
- Hao hụt: 6,666.7 - 6,615 = 51.7 kg = **0.78%** > 0.5% → **cần BGD duyệt**

---

## 🎬 PHÂN CẢNH

### Cảnh 1 — Intro: Bài toán multi-facility (0:00–0:45)

**Hiển thị**: animation hoặc slide "3 nhà máy: PD - TL - LAO"

🎙️ *"Công ty Huy Anh có 3 nhà máy: Phong Điền là HQ, Tân Lâm và Lào là 2 vệ tinh sản xuất.
Tất cả khách quốc tế đều ship từ Phong Điền vì có cảng Đà Nẵng.*

*Vấn đề: hàng SVR-10 sản xuất ở Tân Lâm phải chuyển về Phong Điền để xuất khẩu.
Mỗi chuyến xe có thể vài tấn, mỗi tháng chuyển hàng chục chuyến — cần workflow tracking chặt:*

*- Hàng đi đúng số lượng ban đầu*
*- Hàng về đúng số đối soát*
*- Hao hụt vận chuyển trong giới hạn cho phép*
*- Nếu hao hụt cao → BGD duyệt, không tự động cộng kho*

*Đây chính là chức năng 'Chuyển kho liên nhà máy' tôi sẽ demo hôm nay."*

**`[CALLOUT]`** logo TL → arrow → logo PD, kèm số "200 bành SVR-10 = 6.6 tấn"

---

### Cảnh 2 — Tạo phiếu chuyển ở ERP (0:45–2:30)

#### 2.1. Vào module Chuyển kho NM (0:45–1:00)

**Hiển thị**: Tab 1 — `huyanhrubber.vn/wms`

**`[CLICK]`** Sidebar → **KHO** → **Chuyển kho NM**

🎙️ *"Vào module Chuyển kho NM. Đây là danh sách các phiếu chuyển — hiện đang trống."*

**`[CALLOUT]`** highlight 4 stat cards: Đang vận chuyển, Đã đến, Cần duyệt, Hoàn tất

#### 2.2. Tạo phiếu mới (1:00–2:30)

**`[CLICK]`** **"+ Tạo phiếu chuyển"**

🎙️ *"Click 'Tạo phiếu chuyển' — form 4 phần:"*

##### 2.2.1. Người chuyển (1:10–1:25)

**`[CALLOUT]`** Card **"Phương tiện & Người yêu cầu"**

🎙️ *"Trường 'Người chuyển' tự động lấy từ tài khoản đăng nhập — Lê Duy Minh — và KHÓA, không sửa được. Đảm bảo audit chính xác ai khởi tạo phiếu."*

**`[CALLOUT]`** highlight 👤 Lê Duy Minh + 🔒 hint

##### 2.2.2. Tuyến chuyển (1:25–1:50)

**`[CLICK]`** dropdown "Từ nhà máy (gửi)" → chọn **🇻🇳 Tân Lâm**

🎙️ *"Chọn NM gửi: Tân Lâm. Hệ thống lọc kho TP của Tân Lâm — chỉ có 1 kho KHO-TL-TP, tự fill."*

**`[CALLOUT]`** kho gửi auto-fill = `KHO-TL-TP — Kho TP Tân Lâm`

**`[CLICK]`** dropdown "Đến nhà máy" → chọn **🇻🇳 Phong Điền (HQ) ⭐**

🎙️ *"NM nhận: Phong Điền — có dấu sao ⭐ vì là NM duy nhất xuất khẩu trực tiếp."*

**`[CLICK]`** dropdown "Kho nhận" → chọn `KHO-A — Kho thành phẩm A`

##### 2.2.3. Phương tiện dự kiến (1:50–2:10)

**`[CALLOUT]`** Alert info "Xe dự kiến (không bắt buộc)"

🎙️ *"Phần phương tiện — quan trọng: chỉ là DỰ KIẾN. Có thể bỏ trống. Vì xe vận chuyển từ Tân Lâm về Phong Điền có thể là bất kỳ xe tải nào — đôi khi đổi xe trên đường."*

**`[NHẬP]`** Biển số: `75H1-9999`, Tài xế: `Nguyễn Văn Đi`, SĐT: `0901234567`

##### 2.2.4. Hàng cần chuyển (2:10–2:30)

**`[CLICK]`** **"+ Thêm batch"**

🎙️ *"Click 'Thêm batch' — modal hiện danh sách batch SVR_10 đang có trong KHO-TL-TP. Hiện chỉ có 1 batch TL-SEED-F3-001 với 750 bành 25 tấn."*

**`[CLICK]`** nút "Chọn" trên batch `TL-SEED-F3-001`

🎙️ *"Default pick toàn bộ 750 bành. Nhưng tôi chỉ muốn chuyển 200 bành thôi — chỉnh số."*

**`[CLICK]`** ô "Pick" → đổi `750` thành `200`

🎙️ *"KL tự cập nhật: 200 bành × 33.33 kg = 6.666,7 kg. Đây là số planned — số ban đầu, dùng cho đối soát sau này."*

**`[CALLOUT]`** highlight summary "SL: 200 | 6.666,7 kg"

#### 2.3. Submit (2:30–2:40)

**`[CLICK]`** **"Tạo phiếu chuyển"**

🎙️ *"Tạo phiếu — chuyển sang Detail page với code TR-YYYYMMDD-001, status Nháp."*

**`[CALLOUT]`** highlight code `TR-...` + tag `Nháp`

---

### Cảnh 3 — Cân XUẤT tại Tân Lâm (2:40–4:30)

#### 3.1. Mở app cân TL (2:40–3:00)

**Hiển thị**: Tab 2 — `can-tl.huyanhrubber.vn`

🎙️ *"Tài xế đến trạm cân Tân Lâm. Operator mở app cân — header rõ 'TRẠM CÂN TÂN LÂM' và badge 🏭 TL."*

**`[CALLOUT]`** header so sánh với app PD (khác facility)

🎙️ *"Lưu ý: ở TL, KHÔNG có Card 'Đơn hàng xuất' — vì TL không xuất khách trực tiếp. Tân Lâm chỉ có 1 luồng XUẤT duy nhất là transfer về PD."*

#### 3.2. Tạo phiếu cân + chọn transfer (3:00–3:30)

**`[CLICK]`** "+ Tạo phiếu cân mới"
**`[CLICK]`** toggle **📤 XUẤT (ra kho)**

🎙️ *"Toggle XUẤT — ngay lập tức Card 'Phiếu chuyển kho' xuất hiện với phiếu vừa tạo TR-..."*

**`[ZOOM]`** Card **"🔀 Phiếu chuyển kho (cân xuất tại NM gửi)"**

**`[CLICK]`** dropdown chọn `TR-... — TL→PD — 75H1-9999`

🎙️ *"Chọn phiếu — biển số xe + tài xế tự fill từ phiếu chuyển. Hộp xanh hiện thông tin chi tiết:"*

**`[ZOOM]`** hộp xanh:
- `[TL]→[PD] | Mã: TR-... | 📦 KL hàng: 6.666,7 kg`
- 💡 hint *"Cân scale cho ra TỔNG (xe + hàng). Hệ thống tự tính: TARE xe = TỔNG cân − 6.666,7 kg"*

🎙️ *"Phần này quan trọng — cách cân ở Tân Lâm rất đơn giản:*

*Hàng có 200 bành = 6.666,7 kg đã biết chắc chắn từ planned.
Operator chỉ cần đặt xe lên cân, cân ra TỔNG (gross = xe + hàng).
Hệ thống tự tính:*

*- NET hàng = 6.666,7 kg (đã biết)*
*- TARE xe = Gross − 6.666,7"*

#### 3.3. Cân + Hoàn tất (3:30–4:00)

**`[CLICK]`** **"Tạo phiếu"**
**`[NHẬP]`** weight: `9000`
**`[CLICK]`** **"⚡ GHI CÂN"**

🎙️ *"Cân scale ra 9.000 kg. Toast hiện rõ:*
*Cân OUT: gross 9.000 kg | transfer: TARE xe = 2.333,3 kg, NET hàng = 6.666,7 kg → NET 6.666,7 kg"*

**`[ZOOM]`** card NET = `6.666,7 kg`

**`[CLICK]`** **"✓ HOÀN TẤT"**

🎙️ *"Hoàn tất — toast tiếp: 'Phiếu chuyển: hàng đã rời Tân Lâm → đang vận chuyển'."*

**`[ZOOM]`** toast notification

#### 3.4. Verify ở ERP (4:00–4:30)

**Hiển thị**: Tab 1 — refresh transfer detail

🎙️ *"Quay lại ERP — phiếu chuyển đã chuyển sang trạng thái 'Đang vận chuyển'.*

*Timeline 5 bước cập nhật: Tạo phiếu ✅, Cân xuất ✅, đang ở bước 3 (vận chuyển)."*

**`[CALLOUT]`** Steps timeline + status tag changed

🎙️ *"Stats cũng cập nhật: Cân xuất 6.666,7 kg, Cân nhận và Hao hụt vẫn '—' vì chưa cân nhận."*

---

### Cảnh 4 — Hàng đang vận chuyển (giả lập 1-2 giờ trên đường) (4:30–4:50)

🎙️ *"Trong thực tế, xe chạy 1-2 tiếng từ Tân Lâm về Phong Điền. BGD theo dõi qua Dashboard 'Đang vận chuyển'.*

*Trên đường có thể đổi xe — đó là lý do trường biển số ở phiếu chuyển chỉ là 'dự kiến'."*

**`[CALLOUT]`** transfer list: stat card "🚛 Đang vận chuyển: 1 phiếu"

---

### Cảnh 5 — Cân NHẬN tại Phong Điền (4:50–6:30)

#### 5.1. Mở app cân PD (4:50–5:00)

**Hiển thị**: Tab 3 — `can.huyanhrubber.vn`

🎙️ *"Xe về đến Phong Điền. Operator trạm PD mở app — header 'TRẠM CÂN PHONG ĐIỀN (HQ)', badge 🏭 PD."*

#### 5.2. Tạo phiếu cân NHẬP (5:00–5:30)

**`[CLICK]`** "+ Tạo phiếu cân mới"

🎙️ *"Toggle mặc định là NHẬP — đúng. Tại Phong Điền cân NHẬP làm 2 lần: một lần xe đầy, một lần xe rỗng — chính xác cao."*

**`[CALLOUT]`** Card **"🔀 Phiếu chuyển kho (cân nhận tại NM đến)"** xuất hiện

**`[CLICK]`** dropdown chọn `TR-... — TL→PD`

🎙️ *"Chọn phiếu chuyển. Hộp xanh hiện info: cân xuất TL là 6.666,7 kg — đây là số cần đối soát."*

**`[ZOOM]`** hộp xanh: `[TL]→[PD] | Mã: TR-... | Cân xuất TL: 6.666,7 kg`

#### 5.3. Đổi xe (case thực tế) (5:30–5:45)

🎙️ *"Lưu ý — biển số xe vừa fill là từ phiếu chuyển: 75H1-9999. Nhưng trên đường tài xế đổi xe — xe thực về PD là 51K-88888 với tài xế khác."*

**`[CLICK]`** ô biển số → xóa → **`[NHẬP]`** `51K-88888`
**`[CLICK]`** tài xế → xóa → **`[NHẬP]`** `Lê Văn Về`

🎙️ *"Operator tự sửa — pattern này được hỗ trợ. Cuối cùng Detail page sẽ track cả 2 xe: xe đi và xe về."*

#### 5.4. Cân Gross + Tare (5:45–6:15)

**`[CLICK]`** **"Tạo phiếu"**
**`[NHẬP]`** Gross: `8950` → **"GHI CÂN LẦN 1"**
**`[NHẬP]`** Tare: `2335` → **"GHI CÂN LẦN 2"**

🎙️ *"Cân lần 1 — xe đầy: 8.950 kg.*
*Cân lần 2 — xe rỗng (sau khi dỡ hàng): 2.335 kg.*
*NET = 8.950 − 2.335 = 6.615 kg.*

*So với cân xuất TL 6.666,7 → hao hụt 51,7 kg = 0,78%."*

**`[ZOOM]`** card NET = `6.615 kg`

#### 5.5. Hoàn tất + Cảnh báo (6:15–6:30)

**`[CLICK]`** **"✓ HOÀN TẤT"**

🎙️ *"Hoàn tất — toast cảnh báo: 'Hao hụt 0,78% vượt ngưỡng 0,5% — cần BGD duyệt'."*

**`[ZOOM]`** toast màu vàng/cam

---

### Cảnh 6 — BGD duyệt hao hụt (6:30–7:30)

#### 6.1. Mở Detail page (6:30–6:45)

**Hiển thị**: Tab 1 — refresh transfer detail

🎙️ *"BGD nhận thông báo, vào ERP. Phiếu chuyển trạng thái 'Đã đến — chờ duyệt' (vàng), có Alert đỏ ở trên cùng."*

**`[CALLOUT]`** Alert vàng/cam:
> ⚠ Hao hụt 0,78% vượt ngưỡng 0,5% — cần BGD duyệt
> Cân xuất: 6.666,7 kg → Cân nhận: 6.615 kg | Hao hụt: 51,7 kg
> [Duyệt] [Từ chối]

#### 6.2. Quyết định (6:45–7:15)

🎙️ *"BGD có 2 lựa chọn:*

*A. **Duyệt**: chấp nhận hao hụt (vd do thời tiết, đường xa), điền lý do, hoàn tất phiếu.*

*B. **Từ chối**: hao hụt bất thường, cần điều tra. Hàng KHÔNG được nhập vào kho — phải xác minh trước."*

**`[CLICK]`** **"Duyệt"** (xanh)

**`[ZOOM]`** Modal "Duyệt phiếu chuyển"

**`[NHẬP]`** ghi chú: `Hao hụt do quãng đường xa, thời tiết nắng — chấp nhận`

**`[CLICK]`** **"Duyệt + Hoàn tất"**

#### 6.3. Hoàn tất (7:15–7:30)

🎙️ *"Sau khi duyệt — toast 'Đã duyệt — phiếu chuyển hoàn tất'. Status đổi sang 'Hoàn tất' xanh.*

*Tất cả 5 bước trong timeline đều ✅. Kho-A Phong Điền vừa cộng 6.615 kg SVR_10."*

**`[CALLOUT]`** Steps timeline full ✅ + Hao hụt stats hiển thị 0.78%

---

### Cảnh 7 — Verify đối soát toàn công ty (7:30–8:00)

**Hiển thị**: Tab 4 — `huyanhrubber.vn/wms?tab=overview`

**`[CLICK]`** FacilityPicker → "Tất cả nhà máy"

🎙️ *"Vào Tồn kho cấp công ty — chọn 'Tất cả nhà máy'. Bảng pivot hiện cả 3 cột TL, PD, LAO cho mỗi material."*

**`[CALLOUT]`** highlight row SVR_10:
- TL: `18,33 T` (giảm từ 25.0)
- PD: `7,50 T` (tăng từ 0.89)
- TỔNG: 25,84 T (giảm 51,7 kg = đúng hao hụt vận chuyển)

🎙️ *"Đối soát: tổng SVR_10 toàn công ty giảm đúng 51,7 kg — chính là hao hụt được track trong phiếu chuyển. Không kho nào ăn gian, không hàng nào 'biến mất' không lý do."*

#### 7.1. Cross-link traceability

**`[CLICK]`** từ Detail transfer → click "Phiếu nhập NK-TR-...→"

🎙️ *"Click vào Phiếu nhập — mở tab mới với chi tiết. Batch mới TR-YYYYMMDD-001-... có parent_batch_id trỏ về batch TL gốc.*

*Sau này nếu khách báo lỗi chất lượng → click 1 cái biết được hàng từ Tân Lâm chuyến nào, ngày nào, NCC ban đầu nào."*

---

### Cảnh 8 — Outro (8:00–8:30)

🎙️ *"Tóm tắt workflow chuyển kho liên nhà máy:*

*1. Quản lý kho tạo phiếu chuyển trên ERP — chọn batch, kho gửi/nhận, xe dự kiến*
*2. Cân ở Tân Lâm 1 lần — đơn giản, NET = planned, TARE compute*
*3. Hàng đang vận chuyển — BGD theo dõi qua dashboard*
*4. Cân ở Phong Điền 2 lần — chốt số chính xác*
*5. Hệ thống tính hao hụt:*
   *• ≤ 0,5% → auto-hoàn tất*
   *• > 0,5% → BGD duyệt/từ chối*

*Lợi ích lớn nhất: hàng "không trốn đi đâu được" — mọi gram chuyển từ TL về PD đều có audit trail. Hao hụt vận chuyển bất thường được phát hiện ngay.*

*Cảm ơn các bạn đã xem. Chúc team vận hành thuận lợi!"*

**`[OUTRO]`** logo HUYANH + slogan

---

## ✅ Verify checklist sau khi quay

- [ ] Transfer status = 'received'
- [ ] needs_approval = true, approved_by/at có giá trị
- [ ] weight_out_kg = 6,666.7, weight_in_kg = 6,615, loss_kg = 51.7, loss_pct = 0.78
- [ ] XK-TR-* status='confirmed', stock_out_details có batch
- [ ] NK-TR-* status='confirmed', stock_in_details có batch mới
- [ ] Batch mới TR-YYYYMMDD-001-* trong KHO-A với parent_batch_id link
- [ ] KHO-TL-TP SVR_10 = 25,000 - 6,666.68 = 18,333.32 kg
- [ ] KHO-A PD SVR_10 = 888.01 + 6,615 = 7,503.01 kg
- [ ] Tổng giảm = 51.7 kg (= hao hụt)

## ⚠️ Cleanup sau quay

Báo Claude: **"cleanup video 3"** → 30 giây xóa toàn bộ test data, reset stocks về ban đầu.

---

## 🎬 Edge cases bonus (quay version 2 nếu có thời gian)

### Case A: Hao hụt rất nhỏ (< 0.5%) — auto-confirm
- Cân nhận 6,650 kg → hao hụt 16.7 kg = 0.25%
- Skip cảnh 6 (BGD duyệt) — toast "Hoàn tất — hao hụt 0.25% (OK)"
- Phù hợp cho training operator: 95% trường hợp như thế này

### Case B: Hao hụt rất lớn (> 5%) — Từ chối
- Cân nhận 6,000 kg → hao hụt 666 kg = 10%
- BGD click "Từ chối" với lý do "Bất thường, cần điều tra"
- Status = 'rejected', kho KHÔNG cộng
- Quay scenario này để training BGD cách xử lý case xấu

### Case C: Hủy phiếu giữa chừng
- Tạo phiếu, nhưng kho gửi quyết định không chuyển nữa
- Detail page → button "Hủy phiếu" (chỉ available khi status draft/picking/picked)
- Status = 'cancelled', không trừ kho

### Case D: Chuyển từ LAO về PD (sau khi setup LAO)
- Workflow giống TL→PD, chỉ đổi facility
- Nhấn mạnh "đa nhà máy" — có thể mở rộng dễ dàng

### Case E: Đổi xe trên đường
- Đã quay sơ ở Cảnh 5.3
- Có thể quay phiên bản dài hơn: tài xế A chở từ TL → đến trạm trung chuyển X → đổi sang xe B → về PD
- Cảnh báo: với hàng quan trọng, nên có biên bản giao nhận
