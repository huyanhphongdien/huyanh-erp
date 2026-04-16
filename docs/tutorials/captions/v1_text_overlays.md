# 📝 Text overlays cho Video 1 — Nhập kho NVL tự động từ Deal B2B

## Setup OBS — 3 text source

Tạo trong Sources panel (mỗi cái là 1 text source riêng):

| Source name | Mục đích | Vị trí mặc định | Style |
|---|---|---|---|
| **`V1_TITLE`** | Tiêu đề bước hiện tại | Trên cùng giữa | Roboto Bold 56, trắng, viền đen 4px, nền xanh #1B4D3E opacity 90 |
| **`V1_CAPTION`** | Mô tả ngắn dưới video | Đáy giữa | Arial 32, trắng, nền đen opacity 70, padding 12px |
| **`V1_HIGHLIGHT`** | Highlight số liệu/badge | Tự do (giữa hoặc cạnh phải) | Bold 48, vàng #FFD54F, viền đen 5px |

→ Sau khi tạo 3 source, **mặc định ẩn** (click 👁 để toggle). Khi quay đến cảnh nào, đổi text rồi hiện ra.

---

## 📋 Danh sách text — sao chép từng đoạn

### 🟢 V1_TITLE (đổi theo từng cảnh)

| # | Cảnh | Hiện lúc | Text (copy) |
|---|---|---|---|
| 1 | Intro | 0:00 | `🎬 VIDEO 1: NHẬP KHO NVL TỰ ĐỘNG` |
| 2 | Tình huống 1 | 0:25 | `BƯỚC 1: NHẬP TỪ DEAL B2B` |
| 3 | Cân lần 1 | 1:30 | `📥 CÂN LẦN 1 — Xe đầy (Gross)` |
| 4 | Cân lần 2 | 1:55 | `📤 CÂN LẦN 2 — Xe rỗng (Tare)` |
| 5 | Hoàn tất | 2:15 | `✅ HOÀN TẤT — ERP TỰ ĐỘNG TẠO PHIẾU` |
| 6 | Verify ERP | 2:30 | `🔍 KIỂM TRA TRÊN ERP` |
| 7 | Tình huống 2 | 3:15 | `BƯỚC 2: NHẬP TỪ NCC TRỰC TIẾP` |
| 8 | Đối soát | 4:30 | `📊 ĐỐI SOÁT 2 PHIẾU NHẬP` |
| 9 | Outro | 5:30 | `🎯 TÓM TẮT LỢI ÍCH` |

---

### 🟡 V1_CAPTION (caption mô tả — đáy màn hình)

#### Cảnh Intro (0:00–0:25)
```
Trước đây: Cân thủ công + Nhập kho thủ công = 2 lần thao tác
Bây giờ: Cân 1 lần — ERP tự động sinh phiếu nhập
```

#### Cảnh 2.2 — Tạo phiếu cân (0:35)
```
Mặc định là cân NHẬP — đúng cho hàng vào kho
Cân NHẬP = 2 lần: xe đầy → xe rỗng
```

#### Cảnh 2.3 — Chọn Deal (1:00)
```
Tab "Theo Deal" — dùng cho hàng theo hợp đồng đã ký
Hệ thống tự fill: loại mủ, đơn giá, DRC từ deal
```

#### Cảnh 2.4 — Cân Gross (1:30)
```
Cân lần 1: xe + hàng = 8.500 kg
Có thể đọc tự động từ cân điện tử (Keli)
hoặc nhập tay nếu chưa nối cân
```

#### Cảnh 2.5 — Cân Tare (1:55)
```
Cân lần 2: xe rỗng = 2.500 kg
NET tự tính = Gross − Tare = 6.000 kg
Đây là khối lượng nguyên liệu thực
```

#### Cảnh 2.6 — Hoàn tất (2:15)
```
✨ 1 click — 3 việc tự động:
1. Phiếu cân lưu vào lịch sử
2. Phiếu nhập NK-NVL được tạo + xác nhận
3. Stock kho NVL tăng đúng số kg
```

#### Cảnh 3 — Verify ERP (2:30)
```
Phiếu mới xuất hiện trong Phiếu nhập kho
Badge ⚖ chỉ rõ phiếu cân nguồn
Trạng thái "Xác nhận" = đã trừ kho thật
```

#### Cảnh 4.2 — Chọn NCC (3:35)
```
Tab "Theo NCC" — đại lý lẻ, không có deal
Operator nhập tay loại mủ + đơn giá theo phiếu cân giấy
```

#### Cảnh 5 — Đối soát (4:30)
```
Phiếu 1: Có Deal → tự cập nhật phần đã giao của deal
Phiếu 2: Không Deal → chỉ track NCC
Cả 2 đều có audit trail đầy đủ
```

#### Cảnh 6 — Outro (5:30)
```
✓ Tiết kiệm 50% thời gian nhập liệu
✓ Không sai số do nhập tay 2 nơi
✓ Truy vết hoàn chỉnh phiếu cân ↔ phiếu nhập ↔ batch ↔ deal
✓ Báo cáo realtime cho BGD
```

---

### 🟠 V1_HIGHLIGHT (số liệu nổi bật — chỉ hiện 3-5s)

| # | Hiện lúc | Text (copy) |
|---|---|---|
| 1 | 1:35 (sau Gross) | `Gross: 8.500 kg` |
| 2 | 2:00 (sau Tare) | `Tare: 2.500 kg` |
| 3 | 2:10 (NET) | `NET = 6.000 kg ✓` |
| 4 | 2:20 (toast hiện) | `📋 NK-NVL-...001 (auto)` |
| 5 | 4:15 (NET case 2) | `NET = 3.000 kg ✓` |
| 6 | 4:45 (so sánh) | `2 phiếu nhập = 9.000 kg NVL` |

---

## 🎨 Recommend OBS Filter cho text (đẹp hơn)

### Tăng độ contrast trên video nền

Right-click text source → **Filters** → **+ Effect Filter** → **Color Correction**:
- Brightness: +0.05
- Saturation: +0.2

### Fade in/out khi hiện/ẩn text

Cần plugin **Move Source** (free):
- Tải: https://obsproject.com/forum/resources/move.913/
- Sau khi cài → right-click text → Filters → + Move Value
- Set duration 0.3s

---

## ⚡ Workflow nhanh khi quay

1. **Trước khi quay**: tạo 3 text source ở trên với style đúng, mặc định **ẨN** (click 👁 → eye-off)
2. **Khi quay đến cảnh có title mới**:
   - Pause record (nếu cần) → double-click `V1_TITLE` → đổi text → OK → click 👁 hiện
   - Resume record → đợi 1-2s cho viewer đọc → tiếp tục thao tác
3. **Khi sang cảnh tiếp**: ẩn text cũ → đổi text mới → hiện
4. **Sau quay**: nếu muốn mượt hơn → import vào CapCut/DaVinci edit transitions

---

## 🎬 Alternative: Read from file (text dynamic)

Nếu bạn không muốn double-click đổi text mỗi lần:

1. Tạo file `v1_title.txt`, `v1_caption.txt`, `v1_highlight.txt` trong folder bất kỳ
2. Trong text source properties → tick **"Read from file"** → Browse chọn file
3. Khi quay → **mở file .txt → sửa → save** → text trong OBS tự update sau ~0.5s

Lợi: không cần mở properties dialog, chỉ ALT+TAB sang Notepad sửa nhanh hơn.

Tôi có thể tạo sẵn 3 file `.txt` với text đầy đủ — bạn muốn?
