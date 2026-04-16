# 📝 Text overlays cho Video 2 — Xuất kho tự động từ Sales Order

## Setup OBS — 3 text source

| Source name | Mục đích | Vị trí | Style |
|---|---|---|---|
| **`V2_TITLE`** | Tiêu đề bước | Trên cùng giữa | Roboto Bold 56, trắng, viền đen 4px, nền cam `#E8A838` opacity 90 |
| **`V2_CAPTION`** | Mô tả ngắn | Đáy giữa | Arial 32, trắng, nền đen opacity 70 |
| **`V2_HIGHLIGHT`** | Số liệu nổi bật | Giữa hoặc cạnh phải | Bold 48, vàng `#FFD54F`, viền đen 5px |

> **Màu chủ đạo**: CAM — để phân biệt video 2 (XUẤT) với video 1 (NHẬP, xanh lá).

---

## 📋 Danh sách text — sao chép từng đoạn

### 🟠 V2_TITLE (tiêu đề theo cảnh)

| # | Cảnh | Hiện lúc | Text (copy) |
|---|---|---|---|
| 1 | Intro | 0:00 | `🎬 VIDEO 2: XUẤT KHO TỰ ĐỘNG` |
| 2 | Sales Order | 0:30 | `📋 BƯỚC 1: SALES ORDER + CONTAINER` |
| 3 | Mở app cân | 1:15 | `⚖ BƯỚC 2: CÂN TẠI TRẠM PHONG ĐIỀN` |
| 4 | Toggle XUẤT | 1:30 | `📤 CHỌN CHẾ ĐỘ CÂN XUẤT` |
| 5 | Chọn SO + Container | 1:50 | `🎯 CHỌN ĐƠN HÀNG + CONTAINER` |
| 6 | Seal thực tế | 2:30 | `🔒 GHI SEAL THỰC TẾ` |
| 7 | Cân | 3:00 | `⚖ CÂN 1 LẦN — TARE CỐ ĐỊNH` |
| 8 | Hoàn tất auto | 3:30 | `✨ HOÀN TẤT — 5 VIỆC TỰ ĐỘNG` |
| 9 | Verify phiếu xuất | 4:30 | `🔍 KIỂM TRA PHIẾU XUẤT KHO` |
| 10 | Verify container | 5:00 | `📦 CONTAINER STATUS: SHIPPED` |
| 11 | Verify SO | 5:30 | `✅ SALES ORDER ĐÃ SHIP` |
| 12 | Tồn kho | 6:00 | `📊 TỒN KHO CẬP NHẬT` |
| 13 | Outro | 6:30 | `🎯 TÓM TẮT WORKFLOW` |

---

### 🟡 V2_CAPTION (mô tả — đáy màn hình)

#### Cảnh 1 — Intro (0:00–0:30)
```
Trước: Cân + Nhập phiếu xuất + Update container + Update SO = 4 thao tác
Sau: Cân 1 lần — ERP tự làm hết 4 việc
```

#### Cảnh 2 — Sales Order detail (0:30–1:15)
```
SO-25-001 · China Rubber Co. · RSS3 · 1× container 20ft
Đã allocate: 740 bành RSS3 từ KHO-B
Status: ready — sẵn sàng ship
```

#### Cảnh 3 — Mở app cân (1:15–1:30)
```
Trạm cân Phong Điền (PD) — nơi duy nhất ship hàng cho khách
Header: 🏭 PD ⭐ can_ship_to_customer = true
```

#### Cảnh 3.2 — Toggle XUẤT (1:30–1:50)
```
Cân XUẤT = cân 1 lần (khác cân NHẬP = 2 lần)
Tare container cố định theo loại (20ft=2.300, 40ft=3.800)
```

#### Cảnh 3.3 — Chọn SO (1:50–2:30)
```
Dropdown list tất cả SO trạng thái ready/packing/producing
Khi chọn → tự fill khách, grade, container, port
```

#### Cảnh 3.3b — Chọn Container
```
1 SO có thể có nhiều container — chỉ chọn container đang cân
Tare 20ft tự fill 2.300 kg (hình vuông xanh info)
```

#### Cảnh 3.4 — Seal thực tế (2:30–2:50)
```
Seal thực tế có thể khác seal kế hoạch
(cảng yêu cầu đổi seal an ninh)
Ghi vào để đối soát vận đơn
```

#### Cảnh 3.6 — Cân (3:00–3:30)
```
Cân scale: 27.000 kg (xe + container đầy)
NET tự tính = 27.000 − 2.300 (tare 20ft) = 24.700 kg
Khối lượng hàng xuất thực
```

#### Cảnh 4 — Hoàn tất auto (3:30–4:30)
```
1 click → 5 việc:
1. Phiếu xuất XK-TP-... created + confirmed
2. Batch 740 bành RSS3 trừ kho
3. Container → shipped (seal thực tế lưu)
4. Sales Order → shipped (nếu container cuối)
5. Inventory transaction logged
```

#### Cảnh 5.1 — Phiếu xuất (4:30–5:00)
```
Status "Đã xuất" (không phải "Nháp")
→ Tự confirm vì SO có allocation đầy đủ
Badge ⚖ link về phiếu cân nguồn
```

#### Cảnh 5.2 — Container (5:00–5:30)
```
Container: planned → shipped ✓
Seal actual (ghi lúc cân) thay cho seal planned
Shipped_at: timestamp đúng phút cân xong
```

#### Cảnh 5.3 — Sales Order (5:30–6:00)
```
Nếu đây là container CUỐI của SO → SO auto → shipped
Còn nhiều container → SO vẫn ở status cũ, đợi đủ
```

#### Cảnh 6 — Tồn kho (6:00–6:30)
```
KHO-B Phong Điền giảm 740 bành RSS3
Batch RSS3-... quantity_remaining update
Traceability đầy đủ — khách phản ánh lỗi → tìm nhanh
```

#### Cảnh 7 — Outro (6:30–7:00)
```
✓ Tiết kiệm 80% thời gian xuất hàng
✓ Audit trail: phiếu cân ↔ phiếu xuất ↔ batch ↔ SO ↔ container
✓ Không sai số do nhập tay nhiều nơi
✓ Khách báo lỗi → truy vết 3 giây
```

---

### 🟢 V2_HIGHLIGHT (số liệu — hiện 3-5s)

| # | Hiện lúc | Text (copy) |
|---|---|---|
| 1 | 0:45 (SO info) | `SO-25-001 · 24.7T · Đà Nẵng` |
| 2 | 1:00 (container) | `CONT-001 · 20ft · 740 bành` |
| 3 | 2:40 (seal) | `🔒 Seal thực: XYZ789` |
| 4 | 3:00 (tare info) | `Tare 20ft: 2.300 kg (cố định)` |
| 5 | 3:20 (cân) | `Scale: 27.000 kg` |
| 6 | 3:25 (NET) | `NET = 24.700 kg ✓` |
| 7 | 3:40 (toast 1) | `📋 XK-TP-001 (auto-confirm)` |
| 8 | 3:50 (toast 2) | `📦 Container → SHIPPED` |
| 9 | 4:00 (toast 3) | `✅ SO-25-001 → SHIPPED` |
| 10 | 5:15 (container) | `🔒 Seal XYZ789 · Shipped ✓` |
| 11 | 6:15 (kho) | `KHO-B: −740 bành RSS3` |

---

## 🎬 Bonus: 3 overlay đặc biệt cho scene quan trọng

### A. "5 việc tự động" — hiện lúc 4:00 (giây highlight)

Tạo 1 text source riêng `V2_AUTO_FLOW`, mặc định ẨN. Khi quay đến lúc click Hoàn tất → bật:

```
🤖 AUTO WORKFLOW:

1️⃣ Phiếu xuất XK-TP-001
2️⃣ Trừ kho 740 bành
3️⃣ Container shipped
4️⃣ SO shipped
5️⃣ Inventory log

Tất cả trong <1 giây
```

Style: font lớn 36, 5 dòng, box nền đen opacity 80, viền vàng.

### B. "Nhập tay vs Tự động" — Intro so sánh

Tạo source `V2_COMPARISON`, dùng cho cảnh 1:

```
CÁCH CŨ                    CÁCH MỚI
─────────                  ─────────
📝 Cân thủ công         →  ⚖ Cân 1 lần
📝 Nhập phiếu xuất       →  🤖 Auto
📝 Update container      →  🤖 Auto
📝 Update SO             →  🤖 Auto
📝 Inventory log         →  🤖 Auto
─────────                  ─────────
⏱ 10-15 phút             ⏱ 30 giây
```

### C. "Traceability" — hiện cuối Outro

Source `V2_TRACE` — timeline trace:

```
🔍 AUDIT TRAIL CHAIN:

📦 Khách hàng
  ↓ SO-25-001
📋 Phiếu xuất XK-TP-001
  ↓ batch RSS3-batch-001
📊 Lô sản xuất ngày X
  ↓ batch NVL-Y
🧪 NCC: Trần Văn A (deal DL-25-001)
```

---

## 🎨 Tips visual riêng cho Video 2

### Phân biệt màu với Video 1

- Video 1 (NHẬP): chủ đạo **XANH LÁ** `#1B4D3E` — cho cảm giác "input/growth"
- Video 2 (XUẤT): chủ đạo **CAM** `#E8A838` — cho cảm giác "output/action"

Áp dụng cho `V2_TITLE` background, nút nhấn highlight trong video.

### Highlight logic "1 click = 5 việc"

Là điểm WOW của video — nên:
- Slow motion khi click Hoàn tất (post-edit trong CapCut)
- Zoom vào toast notifications (3 toast liên tiếp)
- Overlay "5 việc tự động" fade-in
- Sound effect: chime nhẹ mỗi lần toast xuất hiện

### Side-by-side compare (nếu có thời gian edit)

Split screen 2 nửa:
- Nửa trái: quay màn hình user thao tác
- Nửa phải: diagram animated "5 việc tự động" chạy realtime

Dùng DaVinci Resolve hoặc CapCut Pro.

---

## 📁 Alternative: 3 file .txt cho Read from file

Nếu muốn đổi text qua Notepad (không mở OBS dialog):

```
d:/Videos/OBS_text/
├── v2_title.txt      ← mỗi lần cảnh mới, mở file, sửa, save
├── v2_caption.txt
└── v2_highlight.txt
```

OBS text source → tick **"Read from file"** → Browse chọn 1 trong 3 file trên.

Tôi có thể tạo sẵn 3 file `.txt` ban đầu rỗng + 1 file `.md` chứa tất cả đoạn để copy. Báo tôi nếu muốn.

---

## ⚡ Checklist sau khi quay Video 2

- [ ] Phiếu xuất XK-TP-... có trong /wms/stock-out
- [ ] Container status = 'shipped', seal_no_actual = XYZ789
- [ ] SO status = 'shipped' (nếu container cuối)
- [ ] Stock batch RSS3 giảm 740
- [ ] Stock_levels KHO-B giảm 24.700 kg
- [ ] Toast "đã auto-confirm" hiện trong video

## Cleanup sau quay

Báo Claude: **"cleanup video 2"** → xóa phiếu xuất test + restore container/SO về 'ready' + trả lại stock batch.
