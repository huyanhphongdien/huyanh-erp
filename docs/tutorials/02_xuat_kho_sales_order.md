# 🎥 Video 2: Xuất kho tự động từ Sales Order

> **Thời lượng**: ~7 phút
> **Đối tượng**: NV cân Phong Điền + NV xuất khẩu + BGD theo dõi
> **Mục tiêu**: Hiểu workflow đóng container ship cho khách: cân 1 lần, hệ thống auto-confirm phiếu xuất + đánh dấu container "shipped" + cập nhật Sales Order

---

## 0. Pre-recording (off-camera, ~10 phút setup)

### Data cần có sẵn

- ✅ 1 Sales Order active với container assigned — VD: `SO-25-001` cho khách "China Rubber Co.", grade SVR_10, 1 container 20ft, port Đà Nẵng
  - Status: `producing` hoặc `ready` hoặc `packing`
  - Đã có `sales_order_containers` với container_no, seal_no_planned, container_type
  - Đã có `sales_order_stock_allocations` (allocate batch RSS3/SVR cho container)
- ✅ Stock TP đủ trong KHO-A hoặc KHO-B Phong Điền cho batches đã allocate
- ✅ Feature flag `VITE_AUTO_WEIGHBRIDGE_OUT_SYNC=true` (Vercel huyanh-weighbridge)
  - Note: per memory, flag này có thể chưa active — kiểm tra trước khi quay

### Tabs

| Tab | URL | Account |
|---|---|---|
| 1 | `huyanhrubber.vn/sales/orders/[so-id]` | Lê Duy Minh |
| 2 | `huyanhrubber.vn/wms/stock-out` | Lê Duy Minh |
| 3 | `can.huyanhrubber.vn` (PD) | Operator PIN 1234 |

### Test data số liệu

- Xe biển số: `51K-12345`, tài xế `Trần Văn Container`, SĐT `0911223344`
- Container: 20ft, tare cố định 2,300 kg
- Cân Gross (xe + container đầy): `27,000 kg` → NET = 27,000 - 2,300 = **24,700 kg**

---

## 🎬 PHÂN CẢNH

### Cảnh 1 — Intro: Bài toán xuất khẩu (0:00–0:30)

**Hiển thị**: Tab 1 — `huyanhrubber.vn/sales/orders/[so-id]` (Sales Order Detail)

🎙️ *"Khi xuất khẩu cao su cho khách, mỗi đơn hàng có thể chia thành nhiều container ship đi cảng.
Trước đây, bộ phận xuất hàng phải:*

*- Cân container ở trạm cân*
*- Vào ERP tạo phiếu xuất tay*
*- Đối chiếu với hợp đồng/Sales Order*
*- Cập nhật trạng thái container 'đã ship'*
*- Báo BGD*

*Giờ chỉ cần 1 thao tác cân — tất cả tự động. Cùng xem demo."*

**`[CALLOUT]`** highlight Sales Order info: code SO-25-001, customer, grade, container assigned

---

### Cảnh 2 — Mở Sales Order detail xem container (0:30–1:15)

**Hiển thị**: scroll xuống tab "Container" của SO

🎙️ *"Mở SO-25-001 — đơn hàng cho China Rubber Co., 1 container 20ft, hàng RSS3, đã sản xuất xong.*

*Tab Container cho thấy: container CONT-001, seal kế hoạch ABC123, dự kiến 24.7 tấn, status 'planned'."*

**`[CALLOUT]`** highlight container row với:
- Container No: `CONT-001`
- Type: `20ft`
- Status: `planned` (vàng)
- Bale count: 740 bành
- Allocate: `RSS3-batch-001 (740 bành / 24.7 tấn)`

🎙️ *"Trong tab 'Phân bổ batch' đã allocate sẵn 740 bành RSS3 từ KHO-B. Hệ thống biết container này dùng batch nào — quan trọng cho truy vết sau này."*

---

### Cảnh 3 — Cân tại trạm Phong Điền (1:15–3:30)

#### 3.1. Mở app cân (1:15–1:30)

**Hiển thị**: Tab 3 — `can.huyanhrubber.vn`

🎙️ *"Tài xế chở container đầy đến trạm cân Phong Điền. Operator mở app trạm cân."*

**`[CALLOUT]`** header "TRẠM CÂN PHONG ĐIỀN (HQ)" + badge `🏭 PD`

#### 3.2. Tạo phiếu cân + chọn XUẤT (1:30–1:50)

**`[CLICK]`** "+ Tạo phiếu cân mới"
**`[CLICK]`** toggle **📤 XUẤT (ra kho)** (cam)

🎙️ *"Mặc định là NHẬP. Click sang XUẤT — vì đây là container ra cảng. Hệ thống chuyển sang chế độ cân 1 lần: weight đọc được = tổng cân, sau đó trừ tare cố định của container."*

**`[CALLOUT]`** highlight hint "Cân 1 lần: weight = net trực tiếp..."

#### 3.3. Chọn Sales Order + Container (1:50–2:30)

**`[ZOOM]`** vào Card mới hiện ra: **"Đơn hàng xuất"** (viền cam)

🎙️ *"Card 'Đơn hàng xuất' xuất hiện — chỉ cho XUẤT. Operator chọn Sales Order từ dropdown."*

**`[CLICK]`** dropdown "Sales Order" → chọn `SO-25-001 — China Rubber Co. — RSS3 — 24.7T`

🎙️ *"Khi chọn SO, hệ thống tự load thông tin: khách hàng, grade, container info, port. Hộp vàng hiện chi tiết đơn để operator xác nhận."*

**`[CALLOUT]`** hộp vàng: customer name, grade, container, port

**`[CLICK]`** dropdown "Container" → chọn `CONT-001 · 20ft · 740 bành · planned`

🎙️ *"Tiếp tục chọn container. Một SO có thể có nhiều container — chỉ chọn cái đang cân. Tare 20ft tự fill 2.300 kg."*

**`[CALLOUT]`** hộp xanh "Tare cố định: 2,300 kg (20ft)"

#### 3.4. Seal số thực tế (2:30–2:50)

🎙️ *"Trước khi cân, kiểm tra seal trên container. Seal kế hoạch là ABC123 — nhưng cảng có thể yêu cầu seal khác do an ninh. Operator nhập seal thực tế ở đây."*

**`[CLICK]`** ô "Số seal thực tế" → **`[NHẬP]`** `XYZ789` (giả lập đổi seal)

#### 3.5. Thông tin xe (2:50–3:00)

**`[NHẬP]`** biển số `51K-12345`, tài xế `Trần Văn Container`

#### 3.6. Tạo phiếu + Cân (3:00–3:30)

**`[CLICK]`** **"Tạo phiếu"**
**`[NHẬP]`** trọng lượng `27000` (tổng cân từ scale)
**`[CLICK]`** **"⚡ GHI CÂN"**

🎙️ *"Cân scale ra 27.000 kg — đây là tổng xe + container đầy. Hệ thống tự tính:*
*NET = 27.000 − 2.300 (tare 20ft) = 24.700 kg — chính là khối lượng hàng xuất."*

**`[ZOOM]`** card NET = `24.700 kg`

---

### Cảnh 4 — Hoàn tất + Auto-confirm (3:30–4:30)

**`[CLICK]`** **"✓ HOÀN TẤT"**

🎙️ *"Click Hoàn tất — chú ý 2-3 toast notification liên tiếp:"*

**`[ZOOM]`** vào toasts (góc phải trên):

1. 🟢 *"Hoàn tất — NET: 24.700 kg"* (cân xong)
2. 🟢 *"Đã tạo phiếu xuất draft: XK-TP-..."* (auto-sync OUT)
3. 🟢 *"Đã auto-confirm phiếu xuất — KHO-B trừ 740 bành, container CONT-001 sealed XYZ789, SO chuyển sang shipped"* (full auto)

🎙️ *"3 việc tự động xảy ra trong 1 click:*

*1. Phiếu xuất XK-TP-... được tạo + tự confirm (vì có SO + có allocation đầy đủ)*
*2. Container CONT-001 đổi status 'shipped' với seal thực tế XYZ789*
*3. Sales Order tự cập nhật trạng thái 'shipped' nếu là container cuối"*

---

### Cảnh 5 — Verify ở ERP (3 nơi) (4:30–6:00)

#### 5.1. Phiếu xuất kho (4:30–5:00)

**Hiển thị**: Tab 2 — `/wms/stock-out` (refresh)

🎙️ *"Vào Phiếu xuất kho — phiếu mới XK-TP-... ở đầu danh sách."*

**`[CALLOUT]`** highlight phiếu mới:
- Mã `XK-TP-...`
- Loại `TP` (xanh)
- Lý do `Bán hàng` (xanh) + tag cyan `⚖ CX-...`
- Khách hàng `China Rubber Co.` + ref `SO-25-001`
- Số lượng `740 bành` / Trọng lượng `24.7T`
- Trạng thái `Đã xuất` (xanh, KHÔNG phải Nháp)

**`[CLICK]`** mở inline detail

🎙️ *"Click mở chi tiết — phiếu đã có batch picked: RSS3-batch-001 với 740 bành, picking_status đã 'picked', và confirmed_at là thời gian tôi vừa cân."*

#### 5.2. Sales Order container (5:00–5:30)

**Hiển thị**: Tab 1 — refresh SO detail

**`[CLICK]`** tab "Container"

🎙️ *"Quay lại Sales Order. Tab Container — CONT-001 giờ đã đổi sang status 'shipped'."*

**`[CALLOUT]`** so sánh với Cảnh 2:
- Trước: `planned` (vàng)
- Sau: `shipped` (xanh)
- Seal: hiện `XYZ789` (= seal thực tế đã ghi)
- Shipped at: timestamp vừa cân

#### 5.3. Sales Order header (5:30–6:00)

**`[CLICK]`** scroll lên top SO

🎙️ *"SO header — nếu đây là container cuối của đơn → SO tự đổi sang status 'shipped' luôn. Bộ phận xuất khẩu chỉ còn việc gửi vận đơn cho khách."*

**`[CALLOUT]`** SO status badge (nếu shipped) hoặc remaining containers

---

### Cảnh 6 — Tồn kho cập nhật + Outro (6:00–7:00)

#### 6.1. Tồn kho

**Hiển thị**: `/wms` (Tồn kho)

🎙️ *"Cuối cùng — tồn kho. KHO-B vừa giảm 740 bành RSS3, batch RSS3-batch-001 còn lại bao nhiêu cũng update tự động."*

**`[CALLOUT]`** so sánh số tồn trước/sau

#### 6.2. Outro

🎙️ *"Tóm tắt workflow ship container:*

*1. Cân 1 lần ở trạm — chọn SO + Container + nhập seal*
*2. Hoàn tất → 5 việc tự động:*
   *• Tạo phiếu xuất*
   *• Confirm phiếu xuất (trừ kho thật)*
   *• Container chuyển 'shipped'*
   *• SO update*
   *• Inventory transaction log*

*Tiết kiệm 80% thời gian. Audit trail đầy đủ — nếu khách báo lỗi container nào, click 1 cái biết ngay batch nào ở kho nào, ngày nào, NCC nào.*

*Video tiếp theo: Chuyển kho liên nhà máy."*

---

## ✅ Verify checklist sau khi quay

- [ ] Phiếu xuất XK-TP-... với reason='sale', status='confirmed'
- [ ] stock_out_details có 1 row với batch_id, picking_status='picked'
- [ ] Container.status = 'shipped', seal_no_actual = `XYZ789`
- [ ] sales_order.status = 'shipped' (nếu container cuối) hoặc unchanged (còn nhiều)
- [ ] stock_batches RSS3 quantity_remaining giảm 740
- [ ] stock_levels KHO-B giảm 24,700 kg
- [ ] inventory_transactions có 1 row 'out'

## ⚠️ Cleanup sau quay

Báo Claude: "cleanup video 2" → xóa phiếu cân, phiếu xuất, reset SO container về 'planned', restore stock.

---

## 🎬 Edge cases bonus

### Case A: SO chưa có allocation → phiếu xuất draft (chưa confirm)
- Operator vẫn cân được
- Toast hiện: *"Tạo phiếu xuất DRAFT — cần BGD vào ERP allocate batch + confirm thủ công"*
- Quay scenario này nếu muốn show full flow manual confirm

### Case B: Cân nhưng KHÔNG chọn SO (xuất lẻ)
- Operator skip Card "Đơn hàng xuất"
- Cân xong → tạo phiếu xuất với customer = "Khách lẻ"
- Phù hợp khi: bán nhỏ, mẫu, hỏng phải hủy

### Case C: Container 40ft thay vì 20ft
- Tare cố định = 3,800 kg (thay 2,300)
- Hộp xanh hint hiện đúng tare theo type chọn
