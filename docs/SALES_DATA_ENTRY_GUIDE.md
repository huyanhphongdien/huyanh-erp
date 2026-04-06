# Hướng dẫn nhập liệu Đơn hàng bán — Theo bộ phận

> Module: Đơn hàng bán quốc tế (Sales Orders)
> Phiên bản: v4 — Slide-in Detail Panel
> Cập nhật: 06/04/2026

---

## Tổng quan quy trình

```
Sale tạo đơn → Khóa HĐ → SX nhập tiến độ → LOG nhập vận chuyển → KT nhập tài chính → Hoàn tất
```

### Luồng trạng thái

```
Nháp → Đã xác nhận → Đang SX → Sẵn sàng → Đóng gói → Đã xuất → Đã giao → Đã lập HĐ → Đã TT
```

### Ai nhập ở giai đoạn nào?

```
 Nháp    Đã XN    Đang SX    Sẵn sàng    Đóng gói    Đã xuất    Đã giao    Đã lập HĐ    Đã TT
  │                                                                                         │
  ├── SALE ──┤                                                                              │
  │  (HĐ)   │                                                                              │
             ├──── SX ──────────────────────────┤                                           │
             │  (SX sẵn, container)             │                                           │
                   ├──── LOG ──────────────────────────────────────┤                         │
                   │  (BK, BL, ETD, LC, CK, DHL)                  │                         │
                                                      ├──── KT ───────────────────┤         │
                                                      │  (tỷ giá, TT, DT ròng)   │         │
```

---

## Màu dòng trên danh sách — Nhìn vào biết ngay thiếu gì

| Màu nền | Viền trái | Ý nghĩa | Cần làm gì? |
|---------|-----------|---------|-------------|
| 🟢 Xanh lá nhạt | Xanh lá | Đã thanh toán | Xong — không cần làm gì |
| 🔵 Xanh dương nhạt | Xanh dương | Đã xuất/giao | KT cần nhập tỷ giá + thanh toán |
| 🟡 Vàng nhạt | Vàng | Thiếu LOG | LOG cần nhập BK / B/L / ETD |
| 🔴 Đỏ nhạt | Đỏ | Quá hạn giao hoặc L/C hết | Xử lý gấp! |
| 🟠 Cam nhạt | — | L/C sắp hết hạn (≤ 7 ngày) | Cần gia hạn hoặc xuất gấp |
| ⚪ Trắng | Xanh đậm | Đang SX — bình thường | Chờ SX xong |
| 🩶 Xám nhạt | Xám | Nháp / Đã hủy | Sale cần xác nhận hoặc bỏ qua |

### Ý nghĩa 4 chấm tiến độ

```
●●●● = Đã thanh toán (xong tất cả 4 BP)
●●●○ = Đã xuất — chờ KT nhập tài chính
●●○○ = Sẵn sàng/đóng gói — chờ LOG
●○○○ = Đã xác nhận — đang SX
○○○○ = Nháp (mới tạo)
 HỦY = Đã hủy (tag đỏ)
```

Chấm: 🟢 HĐ (Sale) → 🔵 SX → 🟡 LOG → 🔴 KT

---

## 1. Bộ phận Kinh doanh (Sale)

**Email:** `sales@huyanhrubber.com`
**Tab:** Hợp đồng
**Sửa được khi:** Trạng thái = **Nháp** + **Chưa khóa**

### 1.1. Tạo đơn hàng mới

**Đơn hàng bán → Tạo đơn hàng** (nút xanh góc phải)

#### Bước 1 — Nhập thông tin (3 card)

**Card 1: Thông tin Hợp đồng**

| Trường | Bắt buộc | Ví dụ | Ghi chú |
|--------|:--------:|-------|---------|
| Số hợp đồng | ✅ | `LTC2026/HA-BRS05` | Số HĐ trên giấy |
| Ngày hợp đồng | | `05/04/2026` | Ngày ký HĐ |
| PO# khách hàng | | `PO-BRS-20260405` | Số PO bên mua |
| Khách hàng (Buyer) | ✅ | `Bridgestone` | Tự điền Incoterm, tiền tệ, thanh toán |

**Card 2: Sản phẩm & Giá**

| Trường | Bắt buộc | Ví dụ | Ghi chú |
|--------|:--------:|-------|---------|
| Grade SVR | ✅ | `SVR 3L` | Tự điền chỉ tiêu kỹ thuật |
| Số lượng (tấn) | ✅ | `725.76` | Theo HĐ |
| Đơn giá (USD/MT) | ✅ | `1,850` | Giá FOB/CIF |
| Tiền tệ | | `USD` | USD / EUR / JPY / CNY |
| Quy cách bành | | `35 kg` | Chọn: **33.333 kg** hoặc **35 kg** |
| Bành/container | | `576` | Theo HĐ thực tế (mặc định 576) |
| Đóng gói | | `SW Pallet` | Chọn: **Loose Bale / SW Pallet / Wooden Pallet / Metal Box** |

> **Tự động tính:** Tổng bành, Số container, Giá trị USD, Hoa hồng

**Card 3: Điều khoản & Ngân hàng**

| Trường | Bắt buộc | Ví dụ | Ghi chú |
|--------|:--------:|-------|---------|
| Thanh toán | | `L/C at sight` | Điều khoản TT |
| Incoterm | | `FOB` | Mặc định FOB |
| Ngày giao dự kiến | | `30/05/2026` | Deadline giao hàng |
| Cảng xếp hàng (POL) | | `Cát Lái` | Cảng VN |
| Cảng đích | | `Yokohama, Japan` | Cảng bên mua |
| Hoa hồng (%) | | `2` | 0-20%, tính trên tổng giá trị |
| Ngân hàng | | `Vietcombank CN Huế` | Điền sẵn |
| Số tài khoản | | `0071001046372` | Điền sẵn |
| SWIFT Code | | `BFTVVNVX` | Điền sẵn |

#### Bước 2 — Xác nhận + Chỉ tiêu kỹ thuật

Xem lại toàn bộ thông tin đã nhập. **Chỉ tiêu kỹ thuật** được tự động điền từ Grade, sửa nếu khách yêu cầu khác:

| Chỉ tiêu | Ví dụ SVR 3L | Đơn vị |
|-----------|-------------|--------|
| DRC min | 60.0 | % |
| Moisture max | 0.80 | % |
| Dirt max | 0.020 | % |
| Ash max | 0.50 | % |
| Nitrogen max | 0.60 | % |
| Volatile max | 0.20 | % |
| PRI min | 40 | |
| Color max | 6.0 | Lovibond |

Nhấn **"Lưu nháp"** hoặc **"Xác nhận đơn hàng"**

### 1.2. Khóa hợp đồng

Sau khi xác nhận xong:
1. Click đơn hàng trong danh sách → Panel mở ra
2. Nhấn **"Khóa HĐ"** (góc phải header)
3. Xác nhận → Thông tin HĐ bị khóa, Sale không sửa được nữa

> ⚠️ **Mở khóa:** Chỉ **Admin** mới mở khóa được

### 1.3. Chỉnh sửa đơn nháp

Click đơn nháp → Tab **Hợp đồng** → **"Chỉnh sửa"** → Sửa → **"Lưu"**

---

## 2. Bộ phận Sản xuất (SX)

**Email:** `trunglxh@huyanhrubber.com`
**Tab:** Sản xuất
**Sửa được khi:** Trạng thái = **Đã xác nhận → Đóng gói**

### 2.1. Nhập ngày sẵn sàng

1. Click đơn hàng → Tab **Sản xuất**
2. Dòng **"Ngày sẵn sàng"** → Chọn ngày → **"Lưu"**

> Ngày này báo cho LOG biết khi nào hàng sẵn sàng để book tàu.

### 2.2. Quản lý Container

| Thao tác | Cách làm |
|----------|----------|
| Tạo tự động | Nhấn **"Tạo tự động"** → Tạo đủ số container theo đơn |
| Thêm thủ công | Điền Container No., Seal No., Bành, KL → **"Thêm"** |
| Sửa inline | Nhấn 🖊 → sửa trực tiếp → nhấn ra ngoài để lưu |
| Xóa | Nhấn 🗑 → xác nhận |

**Thông tin container:**

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| Container No. | `ABCU1234567` | 11 ký tự |
| Seal No. | `SL123456` | Số seal |
| Số bành | `576` | Bành trong container |
| KL net (kg) | `20,160` | Khối lượng net |

### 2.3. Theo dõi tiến độ sản xuất

Tự động hiện:
- **5 giai đoạn:** Rửa → Tán/Kéo → Sấy → Ép → Đóng gói
- **Thanh tiến độ** (%)
- **Link lệnh SX** → nhấn để sang module Sản xuất

---

## 3. Bộ phận Xuất nhập khẩu (LOG)

**Email:** `logistics@huyanhrubber.com`, `anhlp@huyanhrubber.com`
**Tab:** Vận chuyển
**Sửa được khi:** Trạng thái = **Đang SX → Đã giao**

### 3.1. Nhập thông tin vận chuyển

Click đơn hàng → Tab **Vận chuyển** → **"Chỉnh sửa"** → Điền → **"Lưu"**

#### Booking & Tàu

| Trường | Ví dụ |
|--------|-------|
| Hãng tàu | `Maersk` |
| Booking Ref | `BK-260407-001` |
| Tên tàu | `MSC ANNA` |
| Voyage | `VY2604E` |

#### Vận đơn (B/L)

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| B/L Number | `OOCL-BL-2026001` | Số vận đơn |
| B/L Type | `Original` | Original / Telex Release / Surrendered |

#### Ngày tháng

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| ETD | `10/04/2026` | Ngày tàu chạy |
| ETA | `25/04/2026` | Ngày tàu đến |
| Cutoff | `08/04/2026` | Hạn đóng hàng |

#### DHL & L/C

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| DHL Tracking | `1234567890` | Số tracking chứng từ |
| Số L/C | `LC-2026-001` | Thư tín dụng |
| NH phát hành | `Mizuho Bank` | Ngân hàng bên mua |
| Hạn L/C | `10/07/2026` | ⚠️ Cảnh báo khi ≤ 20 ngày |
| Số tiền L/C | `925,000` | USD |

#### Chiết khấu Ngân hàng

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| NH chiết khấu | `Vietcombank` | NH CK bộ chứng từ |
| Ngày CK | `15/04/2026` | |
| Số tiền CK (USD) | `920,000` | Số tiền NH chuyển |
| Phí NH (USD) | `500` | Phí ngân hàng |

> ⚠️ **Tỷ giá chiết khấu** do **Kế toán** nhập — LOG không sửa được trường này.

**Tổng hợp tự động:**
```
Tổng HĐ → Chiết khấu → Phí NH → Còn lại
```

---

## 4. Bộ phận Kế toán (KT)

**Email:** `yendt@huyanhrubber.com`
**Tab:** Tài chính
**Sửa được khi:** Trạng thái = **Đã xuất → Đã lập HĐ**

### 4.1. Nhập tỷ giá & thanh toán

Click đơn hàng → Tab **Tài chính** → **"Chỉnh sửa"** → Điền → **"Lưu"**

#### Tỷ giá

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| Tỷ giá USD/VND | `25,400` | Tỷ giá quy đổi chính |
| Tỷ giá CK | `25,350` | Tỷ giá chiết khấu (có thể khác) |

#### Thanh toán

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| Trạng thái TT | `Đã TT đủ` | Chưa TT / TT một phần / Đã TT đủ |
| Ngày tiền về | `20/04/2026` | Ngày NH báo có |
| Thực nhận (USD) | `919,500` | Số tiền thực tế nhận |
| Phí NH (USD) | `500` | Phí ngân hàng |
| NH nhận | `Vietcombank` | Ngân hàng nhận tiền |

### 4.2. Tổng hợp tài chính (tự động)

```
Tổng giá trị HĐ (USD)      $925,000
- Chiết khấu NH             -$920,000
- Phí ngân hàng                -$500
- Hoa hồng (2%)             -$18,500
──────────────────────────────────────
Còn lại (sau CK + phí)        $4,500
Doanh thu ròng               -$14,000
Quy đổi VND                   23.49 tỷ
```

---

## 5. Quản trị (Admin)

**Email:** `minhld@huyanhrubber.com`, `thuyht@huyanhrubber.com`, `huylv@huyanhrubber.com`

| Quyền | Chi tiết |
|-------|---------|
| Xem | **Tất cả** tab, mọi đơn hàng |
| Sửa | **Tất cả** tab, ở **mọi** trạng thái |
| Khóa HĐ | Có |
| Mở khóa HĐ | **Chỉ Admin** |
| Executive Dashboard | **Chỉ Admin** |

---

## Bảng tổng hợp phân quyền

### Ai xem được gì?

| Tab | Sale | SX | LOG | KT | Admin |
|-----|:----:|:--:|:---:|:--:|:-----:|
| Hợp đồng | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sản xuất | ✅ | ✅ | ✅ | ❌ | ✅ |
| Vận chuyển | ✅ | ❌ | ✅ | ✅ | ✅ |
| Chứng từ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Tài chính | ❌ | ❌ | ❌ | ✅ | ✅ |

### Ai sửa được gì, khi nào?

| Tab | Role sửa | Trạng thái cho phép | Điều kiện thêm |
|-----|----------|--------------------|---------| 
| Hợp đồng | Sale | Nháp | + Chưa khóa |
| Sản xuất | SX | Đã XN → Đóng gói | |
| Vận chuyển | LOG | Đang SX → Đã giao | Tỷ giá CK: chỉ KT |
| Tài chính | KT | Đã xuất → Đã lập HĐ | |
| *Tất cả* | **Admin** | *Mọi lúc* | |

### Khóa / Mở khóa

| Thao tác | Ai được | Khi nào |
|----------|---------|---------|
| Khóa HĐ | Sale, Admin | Trạng thái = Nháp |
| Mở khóa | **Chỉ Admin** | Bất kỳ lúc nào |

---

## Hệ thống cảnh báo

### Cảnh báo trên giao diện (realtime)

| Cảnh báo | Điều kiện | Hiển thị |
|----------|-----------|----------|
| L/C hết hạn | Hạn L/C ≤ 0 ngày | 🔴 Tag đỏ + dòng đỏ |
| L/C sắp hết | Hạn L/C ≤ 7 ngày | 🔴 Tag đỏ + Alert đỏ trong tab KT |
| L/C cảnh báo | Hạn L/C ≤ 20 ngày | 🟠 Tag cam + Alert cam trong tab KT |
| Quá hạn giao | Ngày giao < hôm nay, chưa xuất | 🔴 Dòng đỏ nhạt |
| Thiếu LOG | Sẵn sàng nhưng thiếu BK/BL/ETD | 🟡 Dòng vàng nhạt |
| Chờ tiền | Đã xuất/giao, chưa TT | 🔵 Dòng xanh dương |

### Cảnh báo email hàng ngày (17:30)

Gửi cho: **Giám đốc, Trợ lý BGĐ, QL Sản xuất, IT Manager**

| Loại cảnh báo | Điều kiện | Mức độ |
|--------------|-----------|--------|
| L/C sắp hết hạn | Còn ≤ 20 ngày | ⚠️ Warning / 🚨 Critical (≤ 7 ngày) |
| Giao hàng trễ hạn | ETD đã qua, chưa xuất | 🚨 Critical |
| Thanh toán quá hạn | Đã giao > 30 ngày, chưa TT | 🚨 Critical |
| Đơn nháp tồn đọng | Nháp > 3 ngày | ⚠️ Warning |

### Bảng ngưỡng cảnh báo

| Chỉ số | Ngưỡng | Hành động |
|--------|--------|-----------|
| L/C hết hạn | ≤ 20 ngày | Cảnh báo cam trên UI + email |
| L/C hết hạn | ≤ 7 ngày | Cảnh báo đỏ trên UI + email khẩn |
| L/C hết hạn | ≤ 0 ngày | Dòng đỏ + email khẩn |
| Giao hàng | Quá hạn | Dòng đỏ + email |
| Thanh toán | > 30 ngày | Email khẩn |
| Đơn nháp | > 3 ngày | Email nhắc |

---

## Thao tác nhanh trên danh sách

| Thao tác | Cách |
|----------|------|
| Xem chi tiết | Click vào dòng → Panel trượt ra |
| Xác nhận đơn nháp | Click ✅ ở cột cuối |
| Lọc theo trạng thái | Click tab: Nháp / Đã XN / Đang SX... |
| Tìm kiếm | Gõ mã đơn, tên KH, PO# |
| Lọc khách hàng | Dropdown Khách hàng |
| Lọc grade | Dropdown Grade |
| Lọc ngày | Chọn khoảng ngày |

### Chú thích cột (nhóm màu)

| Nhóm | Cột | Ai nhập |
|------|-----|---------|
| **Chung** (cố định trái) | #, Mã HĐ, Buyer | Tự động |
| **Sale** 🟢 | Grade, Tấn, $/tấn, Tổng USD, Thanh toán, Giao | Sale |
| **SX** 🔵 | SX sẵn, Cont | SX |
| **LOG** 🟡 | BK, B/L, ETD, L/C hạn, CK $ | LOG |
| **KT** 🔴 | Tỷ giá, Tiền về, TT | KT |
| **Tiến độ** | 4 chấm ●●●● | Tự động |

---

## Câu hỏi thường gặp

**Q: Tôi không thấy nút "Chỉnh sửa"?**
A: Tab đã bị khóa do trạng thái đơn hàng vượt qua giai đoạn của bạn. Liên hệ Admin để mở khóa nếu cần sửa.

**Q: Tại sao dòng có màu đỏ?**
A: Đơn hàng quá hạn giao hoặc L/C đã hết hạn → cần xử lý gấp.

**Q: Tại sao dòng có màu vàng?**
A: Hàng sẵn sàng nhưng thiếu thông tin LOG (Booking, B/L, ETD) → LOG cần nhập.

**Q: Làm sao biết đơn nào chờ tiền?**
A: Dòng **xanh dương nhạt** = đã xuất/giao, KT cần nhập tỷ giá + thanh toán.

**Q: Sale có sửa được tỷ giá không?**
A: Không. Tỷ giá USD/VND và tỷ giá CK chỉ KT nhập.

**Q: LOG có sửa được hoa hồng không?**
A: Không. Hoa hồng do Sale nhập khi tạo đơn, hiện trong tab Hợp đồng.

**Q: Admin có sửa đơn đã thanh toán không?**
A: Có. Admin luôn sửa được mọi tab ở mọi trạng thái.

**Q: Email cảnh báo gửi lúc mấy giờ?**
A: 17:30 hàng ngày, gửi cho Giám đốc + Trợ lý BGĐ + QL Sản xuất + IT Manager.
