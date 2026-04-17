# 📝 Text overlays cho Video 2 — Xuất kho tự động từ Đơn hàng bán

## Quy trình thực tế (5 bước)

```
BƯỚC 1: Mở đơn hàng → Tab Sản xuất → Click "⚡ Cấp phát nhanh (FIFO)"
         ↓
BƯỚC 2: Hệ thống tự chọn batch RSS_3 → Click "Cấp phát" → Status → Sẵn sàng
         ↓
BƯỚC 3: Tạo Container 20ft (tự fill Bành + KL) → Gắn Seal
         ↓
BƯỚC 4: Trạm cân Phong Điền → Cân XUẤT (chọn SO + Container) → NET tự tính
         ↓
BƯỚC 5: Hoàn tất → 5 việc tự động (phiếu xuất + trừ kho + container shipped + SO shipped)
```

---

## Setup OBS — 3 text source (màu cam chủ đạo — XUẤT)

| Source name | Vị trí | Style |
|---|---|---|
| **`V2_TITLE`** | Trên cùng giữa | Roboto Bold 48, trắng, nền cam `#E8A838` opacity 90, viền đen 3px |
| **`V2_CAPTION`** | Đáy giữa | Arial 28, trắng, nền đen opacity 70 |
| **`V2_HIGHLIGHT`** | Giữa hoặc cạnh phải | Bold 42, vàng `#FFD54F`, viền đen 4px |

---

## 📋 TEXT THEO TỪNG CẢNH

---

### CẢNH 1 — INTRO (0:00 – 0:20)

**V2_TITLE:**
```
🎬 XUẤT KHO TỰ ĐỘNG TỪ ĐƠN HÀNG BÁN
```

**V2_CAPTION:**
```
Từ đơn hàng đã xác nhận → Cấp phát kho → Tạo container → Cân ship
Tất cả trên 1 hệ thống — không nhập tay nhiều nơi
```

---

### CẢNH 2 — MỞ ĐƠN HÀNG + TIMELINE (0:20 – 0:45)

**V2_TITLE:**
```
📋 BƯỚC 1: MỞ ĐƠN HÀNG BÁN
```

**V2_CAPTION:**
```
SO-2026-0004 · Coelsin Elastomeros · RSS_3 · 576 bành · 20.16 tấn
Status: Đã xác nhận — sẵn sàng lấy hàng
```

**V2_HIGHLIGHT:**
```
576 bành × 35 kg = 20.160 kg
```

**Thao tác:**
- [CLICK] Sidebar → Đơn hàng bán → chọn SO-2026-0004
- [CALLOUT] Timeline mới: "Nháp → ●Xác nhận → Sản xuất → ..."
- [CALLOUT] Hint xanh: "💡 Bước tiếp: Lấy hàng — chọn 1 trong 2 cách"
- [CLICK] nút "→ Mở tab Sản xuất"

🎙️ *"Đây là đơn hàng SO-2026-0004 cho khách Coelsin, 576 bành RSS_3 — 20.16 tấn. Timeline phía trên cho biết đơn đang ở bước Đã xác nhận. Hệ thống gợi ý: tiếp theo cần lấy hàng — cấp phát từ kho hoặc tạo lệnh sản xuất."*

---

### CẢNH 3 — CẤP PHÁT NHANH FIFO (0:45 – 1:30)

**V2_TITLE:**
```
⚡ BƯỚC 2: CẤP PHÁT TỪ KHO (FIFO)
```

**V2_CAPTION (3a — trước click):**
```
Kho có 2 lô RSS_3: 11.111 kg + 11.111 kg = 22.222 kg
Đơn cần 20.160 kg — ĐỦ để cấp phát từ kho, không cần sản xuất thêm
```

**Thao tác:**
- [ZOOM] Section "Cấp phát từ kho thành phẩm (Make-to-Stock)"
- [CALLOUT] 4 ô summary: Cần 20.160 / Đã cấp 0 / Đang chọn 0 / Còn thiếu 20.160
- [CALLOUT] 2 batch trong bảng: TP-RSS3-260415-001 + 002

🎙️ *"Tab Sản xuất có 2 cách lấy hàng. Cách 1: Cấp phát từ kho — nếu kho đã có sẵn thành phẩm cùng grade. Hiện kho có 2 lô RSS_3, tổng 22 tấn — đủ cho đơn 20 tấn."*

**V2_CAPTION (3b — click nút):**
```
Click "⚡ Cấp phát nhanh (FIFO)" → hệ thống tự chọn theo thứ tự nhập
Lô 1: lấy hết 11.111 kg | Lô 2: lấy 9.049 kg (phần còn thiếu)
```

**Thao tác:**
- [CLICK] nút cam **"⚡ Cấp phát nhanh (FIFO)"**
- [ZOOM] 2 ô input tự fill: 11.111 + 9.049
- [CALLOUT] Toast: "⚡ Tự chọn 20.160 kg từ 2 lô — đủ cho đơn"

🎙️ *"Click Cấp phát nhanh. Hệ thống theo nguyên tắc FIFO — lô nhập trước lấy trước. Lô 1 lấy hết 11 ngàn, lô 2 lấy đúng 9 ngàn cho đủ 20 tấn. Tất cả tự động, không cần gõ tay."*

**V2_HIGHLIGHT:**
```
Lô 1: 11.111 kg (hết)
Lô 2: 9.049 kg (phần thiếu)
Tổng: 20.160 kg ✓
```

---

### CẢNH 4 — XÁC NHẬN CẤP PHÁT (1:30 – 2:00)

**V2_TITLE:**
```
✅ XÁC NHẬN CẤP PHÁT
```

**V2_CAPTION:**
```
Click "Cấp phát 20.160 kg" → kho giữ hàng cho đơn này
Status đơn tự chuyển → Sẵn sàng
```

**Thao tác:**
- [CLICK] nút xanh **"Cấp phát 20.160 kg"**
- [CLICK] Popconfirm → **Đồng ý**
- [CALLOUT] Toast success
- [CALLOUT] Status badge đổi: "Đã xác nhận" → "Sẵn sàng"
- [CALLOUT] Timeline update: step "Sẵn sàng" sáng lên

🎙️ *"Click Cấp phát — hệ thống trừ 20 tấn RSS_3 khỏi kho và giữ riêng cho đơn này. Status tự chuyển sang Sẵn sàng. Timeline cũng cập nhật — bây giờ bước tiếp là đóng gói container."*

---

### CẢNH 5 — TẠO CONTAINER (2:00 – 2:45)

**V2_TITLE:**
```
📦 BƯỚC 3: TẠO CONTAINER
```

**V2_CAPTION (5a — mở modal):**
```
Click "Thêm container" → Modal tự fill:
Số bành = 576 | KL = 20.160 kg (từ thông tin đơn)
```

**Thao tác:**
- [SCROLL] xuống section Container
- [CLICK] **"+ Thêm container"**
- [CALLOUT] Modal mở với 2 ô đã fill sẵn: bale_count=576, net_weight=20160

🎙️ *"Xuống phần Container — click Thêm. Modal mở ra, 2 trường Bành và Khối lượng đã tự fill từ đơn: 576 bành, 20.160 kg. Chỉ cần nhập Container No và Seal."*

**V2_CAPTION (5b — nhập info):**
```
Container No: MSCU1234567
Seal No: SL-001234 (seal kế hoạch — có thể đổi khi cân)
```

**Thao tác:**
- [NHẬP] Container No: `MSCU1234567`
- [NHẬP] Seal No: `SL-001234`
- [CLICK] **"Thêm"**
- [CALLOUT] Container xuất hiện trong bảng: status "Lên kế hoạch"

🎙️ *"Nhập số container MSCU1234567, seal SL-001234. Click Thêm. Container đã tạo với status Lên kế hoạch — chờ xe đến trạm cân."*

**V2_HIGHLIGHT:**
```
📦 MSCU1234567 · 20ft · 576 bành
```

---

### CẢNH 6 — CHUYỂN SANG TRẠM CÂN (2:45 – 3:15)

**V2_TITLE:**
```
⚖ BƯỚC 4: CÂN TẠI TRẠM PHONG ĐIỀN
```

**V2_CAPTION:**
```
Xe chở container đến trạm cân Phong Điền
Operator mở app cân → Toggle XUẤT → Chọn đơn hàng + Container
```

**Thao tác:**
- [CHUYỂN TAB] sang `can.huyanhrubber.vn`
- [CALLOUT] Header: "TRẠM CÂN PHONG ĐIỀN (HQ) · 🏭 PD"
- [CLICK] **"+ Tạo phiếu cân mới"**
- [CLICK] toggle **📤 XUẤT (ra kho)**

🎙️ *"Tài xế chở container đến trạm cân. Operator mở app — header cho biết đây là trạm Phong Điền. Click Tạo phiếu cân mới, toggle sang XUẤT. Cân xuất chỉ cân 1 lần — không cần 2 lần như cân nhập."*

---

### CẢNH 7 — CHỌN ĐƠN HÀNG + CONTAINER (3:15 – 4:00)

**V2_TITLE:**
```
🎯 CHỌN ĐƠN HÀNG + CONTAINER
```

**V2_CAPTION (7a — chọn SO):**
```
Card "Đơn hàng xuất" chỉ hiện ở trạm PD (NM xuất khẩu)
Trạm Tân Lâm / Lào không có Card này — vì không ship trực tiếp
```

**Thao tác:**
- [ZOOM] Card "Đơn hàng xuất" (viền cam)
- [CLICK] dropdown SO → chọn `SO-2026-0004 — Coelsin — RSS3 — 20.2T`
- [CALLOUT] Hộp vàng hiện: Coelsin Elastomeros, RSS_3, 1×20ft, Đà Nẵng

🎙️ *"Card Đơn hàng xuất xuất hiện — lưu ý card này chỉ có ở trạm Phong Điền vì chỉ PD mới xuất khẩu trực tiếp. Chọn đơn hàng SO-2026-0004 — hệ thống tự load thông tin khách, grade, port."*

**V2_CAPTION (7b — chọn Container):**
```
Chọn container MSCU1234567 · 20ft · 576 bành
Tare cố định 20ft = 2.300 kg (hệ thống tự fill)
```

**Thao tác:**
- [CLICK] dropdown Container → chọn `MSCU1234567 · 20ft · 576 bành`
- [CALLOUT] Hộp xanh: "Tare cố định: 2.300 kg (20ft)"

🎙️ *"Chọn container MSCU đã tạo lúc nãy. Tare 20ft = 2.300 kg cố định — đây là cân nặng vỏ container rỗng, hệ thống tự trừ."*

**V2_CAPTION (7c — seal + biển số):**
```
Seal thực tế: nếu cảng yêu cầu đổi seal, nhập seal mới ở đây
Biển số xe: 51K-12345 · Tài xế: Trần Văn Container
```

**Thao tác:**
- [NHẬP] Seal thực tế: `XYZ789` (giả lập đổi seal)
- [NHẬP] Biển số: `51K-12345`
- [NHẬP] Tài xế: `Trần Văn Container`

---

### CẢNH 8 — CÂN + HOÀN TẤT (4:00 – 5:00)

**V2_TITLE:**
```
⚖ CÂN 1 LẦN → AUTO-CONFIRM
```

**V2_CAPTION (8a — cân):**
```
Cân scale: tổng = 22.460 kg (xe + container đầy)
NET tự tính = 22.460 − 2.300 (tare 20ft) = 20.160 kg
```

**Thao tác:**
- [CLICK] **"Tạo phiếu"**
- [NHẬP] trọng lượng: `22460` (giả lập scale)
- [CLICK] **"⚡ GHI CÂN"**
- [CALLOUT] NET hiện: `20.160 kg`

🎙️ *"Tạo phiếu, cân scale ra 22.460 kg — đây là tổng xe cộng container đầy hàng. Hệ thống tự trừ tare container 20ft bằng 2.300 kg. NET = 20.160 kg — đúng khối lượng hàng xuất."*

**V2_CAPTION (8b — hoàn tất):**
```
Click Hoàn tất → CHÚ Ý: 3-4 toast notification liên tiếp!
Mỗi toast = 1 việc tự động hoàn thành
```

**Thao tác:**
- [CLICK] **"✓ HOÀN TẤT"**
- [ZOOM] toasts (chậm lại, từng cái):

🎙️ *"Click Hoàn tất — chú ý góc phải trên. Sẽ có 3-4 toast liên tiếp:"*

**V2_HIGHLIGHT (hiện lần lượt):**

Toast 1:
```
✅ Hoàn tất — NET: 20.160 kg
```

Toast 2:
```
📋 Phiếu xuất XK-TP-001 (auto-confirm)
```

Toast 3:
```
📦 Container MSCU1234567 → SHIPPED
```

Toast 4 (nếu là container cuối):
```
✅ SO-2026-0004 → SHIPPED
```

🎙️ *"Toast 1: phiếu cân hoàn tất. Toast 2: phiếu xuất XK-TP tự tạo VÀ tự confirm — trừ kho 576 bành luôn. Toast 3: container chuyển status shipped. Toast cuối: đơn hàng chuyển sang Đã xuất. Tất cả trong chưa đầy 1 giây."*

---

### CẢNH 9 — KIỂM TRA ERP: PHIẾU XUẤT (5:00 – 5:30)

**V2_TITLE:**
```
🔍 KIỂM TRA: PHIẾU XUẤT KHO
```

**V2_CAPTION:**
```
ERP → Kho → Xuất kho → Phiếu XK-TP-001 đầu danh sách
Status: "Đã xuất" (KHÔNG phải Nháp — tự confirm vì có allocation)
Badge ⚖ link về phiếu cân nguồn
```

**Thao tác:**
- [CHUYỂN TAB] ERP → Sidebar KHO → Xuất kho
- [CALLOUT] phiếu mới XK-TP-...: TP · Bán hàng · Coelsin · 576 bành · 20.160 kg · Đã xuất
- [CLICK] mở inline detail

🎙️ *"Vào ERP kiểm tra. Phiếu xuất mới xuất hiện — status Đã xuất, không phải Nháp. Vì đơn có allocation đầy đủ nên hệ thống auto-confirm: trừ kho thật, không cần duyệt thêm."*

---

### CẢNH 10 — KIỂM TRA: CONTAINER + SO (5:30 – 6:15)

**V2_TITLE:**
```
📦 CONTAINER: SHIPPED ✓
```

**V2_CAPTION:**
```
Container MSCU1234567: planned → shipped
Seal thực tế XYZ789 (ghi lúc cân) thay cho seal kế hoạch SL-001234
SO-2026-0004: Đã xuất — nếu là container cuối thì toàn đơn shipped
```

**Thao tác:**
- [CHUYỂN TAB] SO Detail → Tab Sản xuất hoặc Vận chuyển
- [CALLOUT] Container status: `shipped` (xanh) thay vì `planned`
- [CALLOUT] Seal: XYZ789
- [CALLOUT] SO header status: "Đã xuất"
- [CALLOUT] Timeline: bước "Đã xuất" sáng xanh ✅

🎙️ *"Quay lại đơn hàng. Container MSCU chuyển sang shipped — seal thực tế XYZ789 đã được ghi lại thay cho seal kế hoạch. Đơn hàng cũng chuyển sang Đã xuất. Timeline đã cập nhật — bước tiếp theo là logistics nhập BL và theo dõi tàu."*

---

### CẢNH 11 — TỒN KHO (6:15 – 6:45)

**V2_TITLE:**
```
📊 TỒN KHO ĐÃ TRỪ
```

**V2_CAPTION:**
```
KHO-B Phong Điền: RSS_3 giảm 576 bành = 20.160 kg
Batch TP-RSS3-260415-001: tồn giảm
Batch TP-RSS3-260415-002: tồn giảm
Traceability: khách báo lỗi → click 1 cái biết batch nào, kho nào, NCC nào
```

**Thao tác:**
- [CHUYỂN TAB] ERP → Kho → Tồn kho
- [CALLOUT] So sánh số tồn trước/sau

🎙️ *"Tồn kho cũng cập nhật tự động. KHO-B vừa giảm 576 bành RSS_3. Nếu mai mốt khách Coelsin phản ánh chất lượng container MSCU này — click 1 cái biết ngay: hàng từ batch nào, sản xuất ngày nào, NVL từ NCC nào. Truy vết 3 giây."*

---

### CẢNH 12 — OUTRO (6:45 – 7:15)

**V2_TITLE:**
```
🎯 TÓM TẮT: 5 BƯỚC XUẤT KHO
```

**V2_CAPTION:**
```
1. Mở đơn → Tab Sản xuất → ⚡ Cấp phát nhanh
2. Tạo Container (tự fill Bành + KL)
3. Trạm cân PD → Cân XUẤT (chọn SO + Container)
4. Hoàn tất → 4 việc tự động:
   • Phiếu xuất XK-TP auto-confirm
   • Kho trừ 576 bành
   • Container → shipped + seal thực tế
   • SO → shipped
5. Kiểm tra: phiếu xuất + container + tồn kho — tất cả khớp

Tiết kiệm 80% thời gian. Audit trail đầy đủ.
```

🎙️ *"Tóm tắt quy trình xuất kho tự động:

Bước 1 — mở đơn hàng, vào tab Sản xuất, click Cấp phát nhanh FIFO.
Bước 2 — tạo container, hệ thống tự fill bành và khối lượng.
Bước 3 — tài xế đến trạm cân Phong Điền, cân 1 lần.
Bước 4 — click Hoàn tất, 4 việc tự động chạy: phiếu xuất, trừ kho, container shipped, đơn shipped.
Bước 5 — kiểm tra trên ERP, mọi thứ đều khớp.

Tiết kiệm 80% thời gian so với nhập tay. Audit trail đầy đủ — từ phiếu cân về đơn hàng, về batch, về NCC ban đầu.

Video tiếp theo: Chuyển kho liên nhà máy — Tân Lâm về Phong Điền."*

---

## 🔑 Checklist trước khi quay

- [ ] SO-2026-0004 status = `confirmed` (Claude đã reset)
- [ ] Kho có 2 batch RSS_3 đủ 22.222 kg
- [ ] Container chưa tạo (xóa nếu đã tạo test trước)
- [ ] Flag `VITE_AUTO_WEIGHBRIDGE_OUT_SYNC=true` trên Vercel `huyanh-weighbridge`
- [ ] App cân PD login sẵn
- [ ] Browser fullscreen, ẩn bookmark bar
- [ ] Mic test OK

## 🧹 Cleanup sau quay

Báo Claude: **"cleanup video 2"** → Claude xóa phiếu xuất, phiếu cân, restore allocation + container + stock + SO status.
