# 🎥 Video 1: Nhập kho NVL tự động từ trạm cân

> **Thời lượng**: ~6 phút
> **Đối tượng**: Nhân viên cân + Nhân viên kho NVL
> **Mục tiêu**: Hiểu được khi cân xe nhập NVL → hệ thống tự sinh phiếu nhập kho, không cần nhập tay 2 lần

---

## 0. Pre-recording (off-camera, ~5 phút setup)

### Data cần có sẵn

- ✅ 1 Deal B2B active với 1 đại lý — VD: Deal "DL-25-001 với NCC Phạm Văn A, RSS-3, đơn giá 35.000 đ/kg"
  - Nếu chưa có → tạo trước qua: ERP → B2B → Deals → Tạo deal mới
- ✅ 1 Đại lý/NCC trực tiếp (không qua deal) — VD: "NCC Trần Văn B"
  - ERP → KHO → Cài đặt → NCC trực tiếp
- ✅ Feature flag `VITE_AUTO_WEIGHBRIDGE_SYNC=true` đã bật trên Vercel project `huyanh-weighbridge`
  - Nếu chưa: Vercel → huyanh-weighbridge → Settings → Environment Variables → add → Redeploy

### Tabs chuẩn bị

| Tab | URL | Account |
|---|---|---|
| 1 | `huyanhrubber.vn/wms/stock-in` | Lê Duy Minh |
| 2 | `can.huyanhrubber.vn` (Phong Điền) | Operator PIN 1234 |
| 3 | (optional) `huyanhrubber.vn/b2b/deals/[deal-id]` | Lê Duy Minh |

### Test data số liệu

- Xe biển số: `75H-12345`, tài xế `Nguyễn Văn A`, SĐT `0901234567`
- Cân Gross 1: 8,500 kg, Tare 1: 2,500 kg → NET 1: 6,000 kg (xuất phát từ deal)
- Cân Gross 2: 5,200 kg, Tare 2: 2,200 kg → NET 2: 3,000 kg (từ NCC trực tiếp)

---

## 🎬 PHÂN CẢNH

### Cảnh 1 — Intro (0:00–0:25)

**Hiển thị**: Trang `huyanhrubber.vn/wms` (Tồn kho dashboard)

🎙️ *"Xin chào. Trước đây, mỗi khi xe nguyên liệu vào nhà máy, bạn phải làm 2 việc tách rời:
một là cân xe ở trạm cân, hai là vào ERP nhập tay phiếu nhập kho — gấp đôi công việc và dễ sai số.*

*Trong video này tôi sẽ hướng dẫn cách mới: chỉ cần cân ở trạm cân, ERP tự động sinh phiếu nhập kho.
Có 2 trường hợp: nhập từ Deal B2B và nhập từ Đại lý trực tiếp."*

**`[CALLOUT]`** highlight box "Nhập kho hôm nay: 0 phiếu" để show trạng thái ban đầu

---

### Cảnh 2 — Tình huống 1: Nhập từ Deal B2B (0:25–2:30)

#### 2.1. Mở app trạm cân (0:25–0:35)

**Hiển thị**: chuyển sang Tab 2 — `can.huyanhrubber.vn`

🎙️ *"Đầu tiên, tôi mở ứng dụng trạm cân Phong Điền. Header trên cùng cho biết tôi đang ở trạm cân nào và operator nào đang trực."*

**`[CALLOUT]`** highlight header "TRẠM CÂN PHONG ĐIỀN (HQ)" + badge "🏭 PD"

#### 2.2. Tạo phiếu cân mới (0:35–1:00)

**`[CLICK]`** nút **"+ Tạo phiếu cân mới"** (góc phải trên)

🎙️ *"Click 'Tạo phiếu cân mới'. Mặc định là cân NHẬP — đúng chế độ chúng ta cần. Cân nhập là cân 2 lần: một lần xe đầy, một lần xe rỗng."*

**`[CLICK]`** ô "Biển số xe" → **`[NHẬP]`** `75H-12345`
**`[CLICK]`** ô "Tài xế" → **`[NHẬP]`** `Nguyễn Văn A`

#### 2.3. Chọn Deal B2B (1:00–1:30)

**`[ZOOM]`** vào Card "Nguồn mủ"

🎙️ *"Đây là phần quan trọng — chọn nguồn của lô hàng này. Có 2 tab: 'Theo Deal' nếu xe đến theo deal đã ký, hoặc 'Theo NCC' nếu nhập trực tiếp từ đại lý lẻ."*

**`[CLICK]`** tab **"Theo Deal"** (mặc định đã chọn)
**`[CLICK]`** dropdown "Chọn Deal" → chọn `DL-25-001 — Phạm Văn A — RSS-3`

🎙️ *"Khi chọn deal, hệ thống tự fill loại mủ, đơn giá, và DRC kỳ vọng từ thông tin trong deal."*

**`[CALLOUT]`** highlight 2-3 field auto-fill (Loại mủ = "Mủ đông", Đơn giá = "35,000 đ/kg")

#### 2.4. Cân lần 1 (Gross) (1:30–1:55)

**`[CLICK]`** nút **"Tạo phiếu"** (xanh đậm)

🎙️ *"Tạo phiếu xong, giờ cân lần 1 — xe đầy hàng. Nếu trạm có nối cân điện tử, số sẽ tự về. Đây tôi nhập tay để demo."*

**`[CLICK]`** ô "Nhập trọng lượng thủ công" → **`[NHẬP]`** `8500`
**`[CLICK]`** nút cam **"⚡ GHI CÂN LẦN 1"**

🎙️ *"Gross 8.500 kg — đây là cân xe + hàng."*

**`[CALLOUT]`** banner xanh "Cân lần 1 (Gross): 8.500 kg"

#### 2.5. Cân lần 2 (Tare) — sau khi xe đổ hàng (1:55–2:15)

🎙️ *"Sau khi xe đổ hàng xong, tài xế quay lại trạm cân lần 2 — xe rỗng."*

**`[CLICK]`** ô input → **`[NHẬP]`** `2500`
**`[CLICK]`** nút cam **"⚡ GHI CÂN LẦN 2"**

🎙️ *"Tare 2.500 kg — xe rỗng. NET tự tính = 8.500 − 2.500 = 6.000 kg, đây là khối lượng nguyên liệu thực."*

**`[ZOOM]`** card NET hiển thị `6.000 kg`

#### 2.6. Hoàn tất + auto-sync ERP (2:15–2:30)

**`[CLICK]`** nút xanh **"✓ HOÀN TẤT"**

🎙️ *"Click Hoàn tất. Đây là điểm quan trọng — chú ý màn hình."*

**`[ZOOM]`** vào toast notification (góc phải trên)

🎙️ *"Toast hiện: 'Đã tạo phiếu nhập NVL: NK-NVL-YYYYMMDD-001'. Phiếu nhập kho đã tự động được tạo trong ERP, KHÔNG cần phải vào ERP nhập tay nữa."*

---

### Cảnh 3 — Verify ở ERP (2:30–3:15)

**Hiển thị**: chuyển sang Tab 1 — `huyanhrubber.vn/wms/stock-in`

**`[CLICK]`** nút Reload (icon C)

🎙️ *"Quay lại ERP, vào Phiếu nhập kho. Refresh — và đây, phiếu mới NK-NVL-YYYYMMDD-001 đã xuất hiện ở đầu danh sách."*

**`[CALLOUT]`** highlight phiếu mới với:
- Mã `NK-NVL-...`
- Loại `NVL` (cam)
- Nguồn `Mua hàng` + tag cyan `⚖ CX-...` (mã phiếu cân)
- Trọng lượng `6.000 kg`
- Trạng thái `Xác nhận` (xanh)

**`[CLICK]`** vào row để mở inline detail

🎙️ *"Click vào để xem nhanh: kho nhận, deal liên kết, batch mới được tạo. Tất cả đã sẵn sàng — kho NVL của bạn vừa nhận thêm 6 tấn."*

---

### Cảnh 4 — Tình huống 2: Nhập từ NCC trực tiếp (3:15–4:30)

🎙️ *"Bây giờ trường hợp thứ 2: nhập trực tiếp từ đại lý — không qua deal. Làm tương tự nhưng chọn tab 'Theo NCC'."*

#### 4.1. Tạo phiếu cân mới (3:15–3:35)

Quay lại Tab 2 (`can.huyanhrubber.vn`):

**`[CLICK]`** nút "+ Tạo phiếu cân mới"
**`[NHẬP]`** biển số `75H-99999`, tài xế `Trần Văn B`

#### 4.2. Chọn NCC (3:35–4:00)

**`[CLICK]`** tab **"Theo NCC"** trong Card "Nguồn mủ"

🎙️ *"Tab 'Theo NCC' dùng cho đại lý lẻ — không có hợp đồng deal cố định. Operator chọn tên NCC từ danh sách."*

**`[CLICK]`** dropdown "Chọn NCC" → chọn `Trần Văn B`

🎙️ *"Vì không có deal nên loại mủ + đơn giá phải nhập tay theo phiếu cân giấy của khách."*

**`[NHẬP]`** loại mủ: `Mủ đông`, DRC kỳ vọng: `30`, đơn giá: `28000`, đơn vị giá: `Ướt`

#### 4.3. Cân + Hoàn tất (4:00–4:30)

Cân Gross `5,200` → Tare `2,200` → NET `3,000`
Click **"Hoàn tất"**

🎙️ *"NET 3 tấn. Hoàn tất — toast lại hiện phiếu NK-NVL mới."*

**`[ZOOM]`** vào toast

---

### Cảnh 5 — Đối soát cuối (4:30–5:30)

**Hiển thị**: Tab 1 — refresh `/wms/stock-in`

🎙️ *"Vào lại danh sách phiếu nhập — bây giờ có 2 phiếu mới, một từ deal, một từ NCC trực tiếp. Cả 2 đều có badge ⚖ chỉ rõ phiếu cân nguồn."*

**`[CALLOUT]`** so sánh 2 phiếu:
- Phiếu 1: Deal `DL-25-001 / Phạm Văn A` cột Deal/NCC
- Phiếu 2: NCC `Trần Văn B`

#### Open inline detail mỗi phiếu để show:

🎙️ *"Mở chi tiết — phiếu 1 có liên kết Deal, hệ thống tự cập nhật phần đã giao của deal. Phiếu 2 không có deal, chỉ có thông tin NCC."*

**`[CLICK]`** vào nút "Xem chi tiết đầy đủ →" của 1 phiếu

🎙️ *"Detail page — đầy đủ batch, QC chờ kiểm, kho nhập (KHO-NVL Phong Điền), người tạo. Mọi thứ đều khớp với phiếu cân."*

---

### Cảnh 6 — Outro (5:30–6:00)

🎙️ *"Tóm tắt: thay vì cân + nhập kho thủ công 2 lần, giờ chỉ cân 1 lần ở trạm — ERP tự đồng bộ. Lợi ích:*

*1. Tiết kiệm 50% thời gian nhập liệu*
*2. Không sai số do nhập tay 2 nơi*
*3. Truy vết hoàn chỉnh từ phiếu cân về phiếu nhập, batch, deal*
*4. Báo cáo realtime cho BGD*

*Cảm ơn các bạn. Video tiếp theo: Xuất kho tự động từ Sales Order."*

**`[OUTRO]`** logo + slogan công ty

---

## ✅ Verify checklist sau khi quay

- [ ] 2 phiếu nhập NK-NVL hiển thị trong list
- [ ] Phiếu 1 có deal_id link
- [ ] Phiếu 2 có supplier_name
- [ ] Cả 2 status = 'confirmed'
- [ ] Stock_levels KHO-NVL tăng đúng tổng kg
- [ ] Inventory_transactions có 2 entries 'in'

## ⚠️ Nếu cần quay lại sau khi xong

Trước khi quay lần 2, **Claude cleanup data test** qua service_role:
- Xóa 2 phiếu cân CX
- Xóa 2 phiếu nhập NK-NVL
- Xóa 2 batches mới
- Reset stock_levels về số ban đầu

Báo Claude: "cleanup video 1" — sẽ làm trong 30s.

---

## 🎬 Edge cases bonus (quay version 2 nếu muốn)

### Case A: Cân không kết nối scale → nhập tay
Đã quay rồi, đó chính là demo này (manual input).

### Case B: Cân nối Keli scale → số tự về
- Cài đặt trong Settings → IP cân
- Khi cân đứng yên → số xanh hiện trong card "Live weight"
- Click "Lấy số từ cân" thay vì gõ tay

### Case C: Camera tự chụp ảnh xe
- Trong Settings → IP camera (3 góc: Trước, Sau, Trên)
- Khi cân lần 1 → tự chụp 3 ảnh L1
- Khi cân lần 2 → tự chụp 3 ảnh L2
- Phiếu cân lưu 6 ảnh để đối soát sau
