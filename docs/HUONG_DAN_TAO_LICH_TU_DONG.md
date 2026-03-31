# HƯỚNG DẪN TẠO LỊCH CÔNG VIỆC TỰ ĐỘNG

> **Dành cho:** Trưởng phòng, Phó phòng
> **Mục đích:** Tạo công việc lặp lại tự động cho nhân viên, không cần giao thủ công mỗi ngày
> **Hệ thống tự tạo task lúc 6:00 AM mỗi sáng**

---

## 1. TỔNG QUAN

### Lịch tự động là gì?

Thay vì mỗi sáng phải tạo task "Trực ca điện" rồi giao cho từng nhân viên, bạn chỉ cần **tạo 1 lần**:

```
Tạo lịch tự động:
  Tên: "Trực ca Điện-Nước"
  Mẫu: Trực ca Điện-Nước (có checklist 4 bước)
  Tần suất: Hàng ngày
  Nhân viên: Hoài, Hòa, Sơn

→ Hệ thống TỰ ĐỘNG mỗi sáng:
  6:00 AM → Tạo 3 task → Giao cho 3 NV → Mỗi NV thấy trong "Công việc của tôi"
```

**Bạn tạo 1 lần — hệ thống chạy mãi mãi.**

---

## 2. TRƯỚC KHI TẠO LỊCH — CẦN CÓ MẪU CÔNG VIỆC

### Bước 1: Tạo mẫu công việc (nếu chưa có)

```
Đường dẫn: Quản lý công việc → Mẫu công việc → Tab "Mẫu công việc" → + Tạo mẫu mới
```

| Trường | Ví dụ | Giải thích |
|--------|-------|-----------|
| Tên mẫu | Trực ca Điện-Nước | Tên hiện trên task khi tạo |
| Mô tả | Trực ca Điện-Nước ngày theo lịch | Mô tả chi tiết |
| Danh mục | Chung | Phân loại mẫu |
| Ưu tiên | Trung bình | Mức ưu tiên mặc định |
| Thời gian (ngày) | 1 | Hạn hoàn thành (1 = trong ngày) |
| Công việc lặp lại | ☑ BẬT | Task từ mẫu này có trọng số 0.5 khi tính hiệu suất |

**Checklist (các bước nhân viên cần làm):**

```
1. Kiểm tra trạm bơm
2. Kiểm tra hệ thống điện        📷 ← tick nếu cần ảnh bằng chứng
3. Kiểm tra hệ thống nước
4. Kiểm tra hệ thống camera      📷
```

> 📷 = Nhân viên phải upload ảnh chứng minh trước khi tick hoàn thành

Nhấn **Lưu** → Mẫu sẵn sàng.

### Các mẫu có sẵn trong hệ thống

| Mẫu | Danh mục | Checklist | Lặp lại |
|-----|---------|-----------|---------|
| Nhập mủ đợt mới | Sản xuất | 5 bước | ☐ |
| Bảo trì lò sấy | Bảo trì | 6 bước | ☐ |
| QC định kỳ hàng tuần | QC / Kiểm tra | 5 bước | ☑ |
| Báo cáo sản lượng tuần | Báo cáo | 5 bước | ☑ |
| Kiểm kê kho định kỳ | Kho / Kiểm kê | 5 bước | ☐ |

---

## 3. TẠO LỊCH TỰ ĐỘNG

### Bước 2: Tạo lịch

```
Đường dẫn: Quản lý công việc → Mẫu công việc → Tab "Lịch tự động" → + Tạo lịch mới
```

### Điền thông tin

| Trường | Bắt buộc | Giải thích |
|--------|---------|-----------|
| **Tên lịch** | ✅ | VD: "Trực ca Điện-Nước ngày theo lịch" |
| **Mẫu công việc** | ✅ | Chọn mẫu đã tạo ở Bước 1 |
| **Tần suất** | ✅ | Xem bảng giải thích bên dưới |
| **Người được giao** | | Chọn 1 hoặc nhiều nhân viên |

### 4 loại tần suất

#### 🔄 Hàng ngày

```
Dùng khi: Công việc phải làm MỖI NGÀY
Ví dụ:    Trực ca, vệ sinh, kiểm tra an toàn
Cron:     6:00 AM mỗi sáng tạo task
Hạn:      Cuối ngày hôm đó (23:59)

Kết quả:
  31/03 → Task "Trực ca — 31/03" → hạn 31/03
  01/04 → Task "Trực ca — 01/04" → hạn 01/04
  02/04 → Task "Trực ca — 02/04" → hạn 02/04
  ... (lặp mãi)
```

#### 📅 Hàng tuần

```
Dùng khi: Công việc làm MỖI TUẦN 1 LẦN
Ví dụ:    QC định kỳ, báo cáo tuần, họp giao ban
Cron:     6:00 AM mỗi 7 ngày
Hạn:      +2 ngày (có 2 ngày để hoàn thành)

Kết quả:
  31/03 → Task "QC định kỳ — 31/03" → hạn 02/04
  07/04 → Task "QC định kỳ — 07/04" → hạn 09/04
  14/04 → Task "QC định kỳ — 14/04" → hạn 16/04
```

#### 📆 Hai tuần / lần

```
Dùng khi: Công việc làm 2 TUẦN 1 LẦN
Ví dụ:    Bảo trì thiết bị, đào tạo nội bộ
Cron:     6:00 AM mỗi 14 ngày
Hạn:      +3 ngày

Kết quả:
  31/03 → Task "Bảo trì — 31/03" → hạn 03/04
  14/04 → Task "Bảo trì — 14/04" → hạn 17/04
  28/04 → Task "Bảo trì — 28/04" → hạn 01/05
```

#### 🗓️ Hàng tháng

```
Dùng khi: Công việc làm MỖI THÁNG 1 LẦN
Ví dụ:    Kiểm kê kho, báo cáo tháng, sơ kết
Cron:     6:00 AM ngày đầu mỗi tháng
Hạn:      Theo mẫu (thường 7 ngày)

Kết quả:
  01/04 → Task "Kiểm kê kho — 01/04" → hạn 08/04
  01/05 → Task "Kiểm kê kho — 01/05" → hạn 08/05
  01/06 → Task "Kiểm kê kho — 01/06" → hạn 08/06
```

### Chọn nhân viên

```
Người được giao: [Chọn nhân viên ▼]

→ Chọn 1 người: Mỗi lần cron chạy → tạo 1 task cho người đó
→ Chọn 3 người: Mỗi lần cron chạy → tạo 3 task (mỗi NV 1 task riêng)
```

**Lưu ý phân quyền:**
- **Trưởng/Phó phòng:** Chỉ thấy nhân viên **phòng mình**
- **Ban Giám đốc / Admin:** Thấy **tất cả** nhân viên
- **Nhân viên:** Chỉ thấy **chính mình**

Nhấn **Lưu** → Lịch tạo thành công → Sáng hôm sau hệ thống tự chạy.

---

## 4. NHÂN VIÊN THẤY GÌ?

### Mỗi sáng mở "Công việc của tôi"

```
┌─────────────────────────────────────────────────────────┐
│ Đang làm (1)                                            │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Trực ca Điện-Nước — 31/03/2026         ⏰ Hôm nay  │ │
│ │ Phòng Cơ Điện • Trung bình • 1%                    │ │
│ │                                                     │ │
│ │ Checklist (0/4):                                    │ │
│ │   ☐ Kiểm tra trạm bơm                              │ │
│ │   ☐ Kiểm tra hệ thống điện          📷             │ │
│ │   ☐ Kiểm tra hệ thống nước                         │ │
│ │   ☐ Kiểm tra hệ thống camera        📷             │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Nhân viên cần làm

```
Bước 1: Tick từng checklist
  ☑ Kiểm tra trạm bơm              → tick thường
  ☑ Kiểm tra hệ thống điện 📷      → phải upload ảnh trước khi tick
  ☑ Kiểm tra hệ thống nước         → tick thường
  ☑ Kiểm tra hệ thống camera 📷    → phải upload ảnh

Bước 2: Checklist 100% → Popup đánh giá tự động hiện ra
  ⭐⭐⭐⭐☆ (chấm 4 sao)
  Ghi chú: "Hoàn thành đầy đủ, không có sự cố"
  → Gửi đánh giá

Bước 3: XONG — Task tự động duyệt (task lặp lại = auto approve)
  Điểm = 4 sao (80 điểm) × 80% = 64 điểm
```

---

## 5. QUẢN LÝ LỊCH ĐÃ TẠO

### Xem danh sách lịch

```
Đường dẫn: Mẫu công việc → Tab "Lịch tự động"

┌───────────────────────────────────────────────────────────────┐
│ Tên                    │ Mẫu        │ Tần suất │ Trạng thái  │
│────────────────────────┼────────────┼──────────┼─────────────│
│ Trực ca Điện-Nước      │ Trực ca... │ Hàng ngày│ [BẬT 🟢]    │
│ QC định kỳ             │ QC định... │ Hàng tuần│ [TẮT ⚪]    │
│ Kiểm kê kho tháng     │ Kiểm kê...│ Hàng tháng│ [BẬT 🟢]   │
└───────────────────────────────────────────────────────────────┘
```

### Bật / Tắt lịch

- **Bật (🟢):** Cron tạo task mỗi sáng theo tần suất
- **Tắt (⚪):** Cron bỏ qua, không tạo task
- → Bật/tắt bằng công tắc trên dòng lịch

### Sửa lịch

- Nhấn **✏️** → Sửa tên, mẫu, tần suất, nhân viên
- Thay đổi có hiệu lực từ **sáng hôm sau**

### Xóa lịch

- Nhấn **🗑️** → Xác nhận xóa
- ⚠️ Các task đã tạo trước đó **không bị xóa** — chỉ không tạo thêm task mới

---

## 6. CÂU HỎI THƯỜNG GẶP

### Task tạo tự động có khác task tạo thủ công không?

**Giống nhau:** Cùng checklist, cùng phân quyền, cùng đánh giá.

**Khác nhau:**

| | Task thủ công | Task tự động |
|--|-------------|-------------|
| Ai tạo | Manager bấm nút | Hệ thống tự tạo 6:00 AM |
| task_source | `assigned` | `recurring` |
| Trọng số hiệu suất | 1.0 (100%) | **0.5 (50%)** — vì là routine |
| Duyệt | Manager duyệt | **Tự động duyệt** |
| Điểm | NV×40% + Manager×60% | **NV × 80%** |

### Tại sao trọng số chỉ 0.5?

Vì task lặp lại là **công việc routine** (làm mỗi ngày giống nhau). Nếu weight = 1.0 thì:
- NV chỉ làm task routine cũng đạt điểm cao
- NV nhận task khó (từ Manager) bị "pha loãng" điểm
- → Không công bằng

**0.5 = đóng góp vào hiệu suất nhưng không chiếm quá nhiều.**

### Nếu nhân viên nghỉ phép thì sao?

- Task vẫn tạo → nhưng NV không làm → **quá hạn**
- Trưởng phòng có thể vào task đó → **hủy** hoặc **giao người khác**
- Hoặc: **tắt lịch** tạm thời cho NV đó

### Có giới hạn số lịch tự động không?

Không giới hạn. Nhưng nên tạo **vừa đủ** — quá nhiều task routine sẽ:
- NV mất thời gian tick mỗi ngày
- Điểm bị pha loãng (weight 0.5)

**Khuyến nghị:** 1-3 lịch tự động / phòng ban.

### Tôi có thể tạo lịch cho nhân viên phòng khác không?

- **Trưởng/Phó phòng:** Không — chỉ thấy NV phòng mình
- **Admin / BGĐ:** Có — thấy tất cả NV

---

## 7. VÍ DỤ THỰC TẾ THEO PHÒNG BAN

### Phòng Cơ Điện

| Lịch | Tần suất | Nhân viên | Checklist |
|------|----------|----------|-----------|
| Trực ca Điện-Nước | Hàng ngày | Hoài, Hòa, Sơn | 4 bước |
| Bảo trì thiết bị | Hai tuần/lần | Hoài | 6 bước (có 📷) |

### Phòng QC

| Lịch | Tần suất | Nhân viên | Checklist |
|------|----------|----------|-----------|
| QC định kỳ lô hàng | Hàng tuần | Ngân, Bé | 5 bước |
| Hiệu chuẩn thiết bị | Hàng tháng | Ngân | 3 bước (có 📷) |

### Phòng Sản xuất

| Lịch | Tần suất | Nhân viên | Checklist |
|------|----------|----------|-----------|
| Kiểm tra lò sấy | Hàng ngày | Nhân ca 1, Nhân ca 2 | 3 bước (có 📷) |
| Báo cáo sản lượng | Hàng tuần | Trưởng ca | 5 bước |

### Phòng Kho

| Lịch | Tần suất | Nhân viên | Checklist |
|------|----------|----------|-----------|
| Kiểm kê kho NVL | Hàng tháng | NV kho 1, NV kho 2 | 5 bước |
| Kiểm tra hao hụt | Hàng tuần | NV kho 1 | 3 bước |

---

## 8. TÓM TẮT

```
1. Tạo MẪU công việc (1 lần)
   → Tên + checklist + toggle "Lặp lại" + toggle "Cần ảnh 📷"

2. Tạo LỊCH tự động (1 lần)
   → Chọn mẫu + tần suất + nhân viên

3. Hệ thống TỰ LÀM mỗi sáng
   → 6:00 AM tạo task → NV mở app → tick checklist → chấm sao → XONG

4. Trưởng phòng CHỈ CẦN XEM
   → Dashboard hiệu suất → ai hoàn thành, ai quá hạn, điểm bao nhiêu
```

---

> Hướng dẫn tạo lịch công việc tự động
> Huy Anh Rubber ERP v8 — 31/03/2026
