# Hướng dẫn nhập liệu Đơn hàng bán — Theo bộ phận

> Module: Đơn hàng bán quốc tế (Sales Orders)
> Phiên bản: v4 — Slide-in Detail Panel
> Cập nhật: 06/04/2026

---

## Tổng quan quy trình

```
Sale tạo đơn → Khóa HĐ → SX nhập tiến độ → LOG nhập vận chuyển → KT nhập tài chính → Hoàn tất
```

Mỗi bộ phận chỉ nhập phần của mình. Hệ thống tự khóa theo trạng thái đơn hàng.

### Luồng trạng thái

```
Nháp → Đã xác nhận → Đang SX → Sẵn sàng → Đóng gói → Đã xuất → Đã giao → Đã lập HĐ → Đã TT
```

### Màu dòng trên danh sách

| Màu nền | Ý nghĩa |
|---------|---------|
| Xanh lá nhạt | Đã thanh toán — hoàn tất |
| Xanh dương nhạt | Đã xuất/giao — đang chờ tiền về |
| Vàng nhạt | Sẵn sàng nhưng thiếu thông tin LOG (BK/BL/ETD) |
| Đỏ nhạt | Quá hạn giao hoặc L/C đã hết hạn |
| Xám nhạt | Nháp hoặc đã hủy |
| Trắng | Đang sản xuất — bình thường |

---

## 1. Bộ phận Kinh doanh (Sale)

**Email:** `sales@huyanhrubber.com`
**Tab:** Hợp đồng
**Khi nào nhập:** Khi có đơn hàng mới từ khách
**Sửa được khi:** Trạng thái = Nháp + Chưa khóa

### 1.1. Tạo đơn hàng mới

Vào **Đơn hàng bán → Tạo đơn hàng** (nút xanh góc phải)

**Bước 1 — Nhập thông tin (3 phần):**

#### Thông tin Hợp đồng
| Trường | Bắt buộc | Ví dụ | Ghi chú |
|--------|----------|-------|---------|
| Số hợp đồng | Có | `LTC2024/PD-ATC` | Số HĐ trên giấy |
| Ngày hợp đồng | Không | `15/03/2026` | Ngày ký HĐ |
| PO# khách hàng | Không | `PO-20260315` | Số PO bên mua |
| Khách hàng (Buyer) | Có | `Bridgestone` | Chọn từ danh sách |

#### Sản phẩm & Giá
| Trường | Bắt buộc | Ví dụ | Ghi chú |
|--------|----------|-------|---------|
| Grade SVR | Có | `SVR 3L` | Chọn từ danh sách |
| Số lượng (tấn) | Có | `725.76` | Khối lượng theo HĐ |
| Đơn giá (USD/MT) | Có | `1,924` | Giá FOB/CIF |
| Tiền tệ | Không | `USD` | Mặc định USD |
| Quy cách bành | Không | `35 kg/bành` | Chọn: 33.333 kg hoặc 35 kg |
| Bành/container | Không | `576` | Theo HĐ thực tế |
| Đóng gói | Không | `Loose Bale` | Chọn: Loose Bale / SW Pallet / Wooden Pallet / Metal Box |

> **Tự động tính:** Tổng bành, Số container, Giá trị USD, Hoa hồng

#### Điều khoản & Ngân hàng
| Trường | Bắt buộc | Ví dụ | Ghi chú |
|--------|----------|-------|---------|
| Thanh toán | Không | `L/C at sight` | Điều khoản thanh toán |
| Incoterm | Không | `FOB` | Mặc định FOB |
| Ngày giao dự kiến | Không | `30/04/2026` | Deadline giao hàng |
| Cảng xếp hàng | Không | `Cát Lái` | Cảng VN |
| Cảng đích | Không | `Shanghai` | Cảng bên mua |
| Hoa hồng (%) | Không | `2` | % trên tổng giá trị |
| Ngân hàng | Không | `Vietcombank CN Huế` | Đã điền sẵn |
| Số tài khoản | Không | `0071001046372` | Đã điền sẵn |
| SWIFT Code | Không | `BFTVVNVX` | Đã điền sẵn |

**Bước 2 — Xác nhận:**
- Xem lại tất cả thông tin
- Nhấn **"Lưu nháp"** để lưu tạm
- Nhấn **"Xác nhận đơn hàng"** để chuyển sang trạng thái Đã xác nhận

### 1.2. Khóa hợp đồng

Sau khi xác nhận thông tin đúng:
1. Click vào đơn hàng trong danh sách → Panel mở ra
2. Nhấn nút **"Khóa HĐ"** (góc phải header)
3. Xác nhận → Thông tin HĐ bị khóa, Sale không sửa được nữa

> **Mở khóa:** Chỉ Admin mới mở khóa được (nút "Mở khóa" màu đỏ)

### 1.3. Chỉnh sửa đơn nháp

1. Click vào đơn nháp trong danh sách
2. Chọn tab **Hợp đồng**
3. Nhấn **"Chỉnh sửa"** → Form edit hiện ra
4. Sửa xong nhấn **"Lưu"**

---

## 2. Bộ phận Sản xuất (SX)

**Email:** `trunglxh@huyanhrubber.com`
**Tab:** Sản xuất
**Khi nào nhập:** Khi đơn hàng đã xác nhận, bắt đầu sản xuất
**Sửa được khi:** Trạng thái = Đã xác nhận → Đóng gói

### 2.1. Nhập ngày sẵn sàng

1. Click vào đơn hàng → Tab **Sản xuất**
2. Tại dòng **"Ngày sẵn sàng"** → Chọn ngày
3. Nhấn **"Lưu"**

> Ngày này cho LOG biết khi nào hàng sẵn sàng để book tàu.

### 2.2. Quản lý Container

| Thao tác | Cách làm |
|----------|----------|
| Tạo tự động | Nhấn **"Tạo tự động"** → Hệ thống tạo đủ số container theo đơn |
| Thêm thủ công | Điền Container No., Seal No., Bành, KL → nhấn **"Thêm"** |
| Sửa container | Nhấn icon bút chì → sửa inline → nhấn ra ngoài để lưu |
| Xóa container | Nhấn icon thùng rác → xác nhận |

#### Thông tin container cần nhập
| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| Container No. | `ABCU1234567` | 11 ký tự |
| Seal No. | `SL123456` | Số seal container |
| Số bành | `576` | Bành trong container |
| KL net (kg) | `20,160` | Khối lượng net |

### 2.3. Theo dõi tiến độ sản xuất

Tab SX tự động hiện:
- **5 giai đoạn:** Rửa → Tán/Kéo → Sấy → Ép → Đóng gói
- **Thanh tiến độ:** % hoàn thành
- **Link lệnh SX:** Nhấn "Xem lệnh SX" để sang module Sản xuất

---

## 3. Bộ phận Xuất nhập khẩu (LOG)

**Email:** `logistics@huyanhrubber.com`, `anhlp@huyanhrubber.com`
**Tab:** Vận chuyển
**Khi nào nhập:** Khi hàng đang SX hoặc sẵn sàng xuất
**Sửa được khi:** Trạng thái = Đang SX → Đã giao

### 3.1. Nhập thông tin vận chuyển

1. Click vào đơn hàng → Tab **Vận chuyển**
2. Nhấn **"Chỉnh sửa"**
3. Điền các phần:

#### Booking & Tàu
| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| Hãng tàu | `Maersk` | |
| Booking Ref | `BK-260407-001` | Số booking |
| Tên tàu | `MSC ANNA` | Vessel name |
| Voyage | `VY2604E` | Voyage number |

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
| DHL Tracking | `1234567890` | Số tracking chứng từ gửi |
| Số L/C | `LC-2026-001` | Thư tín dụng |
| NH phát hành | `Mizuho Bank` | Ngân hàng bên mua |
| Hạn L/C | `10/07/2026` | Cảnh báo đỏ khi ≤ 7 ngày, cam khi ≤ 20 ngày |
| Số tiền L/C | `925,000` | USD |

#### Chiết khấu Ngân hàng
| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| NH chiết khấu | `Vietcombank` | NH chiết khấu bộ chứng từ |
| Ngày CK | `15/04/2026` | Ngày chiết khấu |
| Số tiền CK | `920,000` | USD — số tiền NH chuyển |
| Phí NH | `500` | USD — phí ngân hàng |

4. Nhấn **"Lưu"**

> **Lưu ý:** Tỷ giá chiết khấu do **Kế toán** nhập, LOG không sửa được trường này.

### 3.2. Cảnh báo L/C

Hệ thống tự động cảnh báo:
- **Đỏ:** L/C còn ≤ 7 ngày hoặc đã hết hạn
- **Cam:** L/C còn ≤ 20 ngày
- Email cảnh báo hàng ngày cho L/C sắp hết hạn

---

## 4. Bộ phận Kế toán (KT)

**Email:** `yendt@huyanhrubber.com`
**Tab:** Tài chính
**Khi nào nhập:** Khi hàng đã xuất, chờ tiền về
**Sửa được khi:** Trạng thái = Đã xuất → Đã lập HĐ

### 4.1. Nhập tỷ giá & thanh toán

1. Click vào đơn hàng → Tab **Tài chính**
2. Nhấn **"Chỉnh sửa"**

#### Tỷ giá
| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| Tỷ giá USD/VND | `25,400` | Tỷ giá quy đổi |
| Tỷ giá CK | `25,350` | Tỷ giá chiết khấu (có thể khác tỷ giá chính) |

#### Thanh toán
| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| Trạng thái TT | `Đã TT đủ` | Chưa TT / TT một phần / Đã TT đủ |
| Ngày tiền về | `20/04/2026` | Ngày NH báo có |
| Thực nhận (USD) | `919,500` | Số tiền thực tế nhận |
| Phí NH (USD) | `500` | Phí ngân hàng |
| NH nhận | `Vietcombank` | Ngân hàng nhận tiền |

3. Nhấn **"Lưu"**

### 4.2. Xem tổng hợp tài chính

Tab Tài chính tự động tính:

```
Tổng giá trị HĐ (USD)     $925,000
- Chiết khấu NH             -$920,000
- Phí ngân hàng              -$500
- Hoa hồng (2%)             -$18,500
─────────────────────────────────────
Còn lại (sau CK + phí)      $4,500
Doanh thu ròng              -$14,000
Quy đổi VND                 23.49 tỷ
```

---

## 5. Quản trị (Admin)

**Email:** `minhld@huyanhrubber.com`, `thuyht@huyanhrubber.com`, `huylv@huyanhrubber.com`

Admin có quyền:
- Xem và sửa **tất cả** các tab, ở **mọi** trạng thái
- **Mở khóa** đơn hàng đã khóa (nút đỏ "Mở khóa")
- Xem Executive Dashboard

---

## Bảng tổng hợp quyền

| Bộ phận | Tab xem được | Tab sửa được | Khi nào sửa |
|---------|-------------|-------------|-------------|
| Sale | HĐ, SX, LOG | HĐ | Nháp + chưa khóa |
| Sản xuất | HĐ, SX, LOG | SX | Đã XN → Đóng gói |
| Logistics | HĐ, SX, LOG, Chứng từ | LOG | Đang SX → Đã giao |
| Kế toán | HĐ, LOG, Chứng từ, KT | KT | Đã xuất → Đã lập HĐ |
| Admin | Tất cả | Tất cả | Mọi lúc |

---

## Thao tác trên danh sách

### Mở chi tiết đơn hàng
- Click vào **bất kỳ dòng nào** → Panel trượt từ bên phải
- Hoặc click **icon mắt** ở cột cuối

### Xác nhận đơn nháp
- Click **icon tick xanh** ở cột cuối → Xác nhận

### Chú thích cột

| Nhóm | Cột | Ý nghĩa |
|------|-----|---------|
| **Chung** | #, Mã HĐ, Buyer | Thông tin cơ bản (cố định bên trái) |
| **Sale** (xanh lá) | Grade, Tấn, $/tấn, Tổng USD, Thanh toán, Giao | Sale nhập |
| **SX** (xanh dương) | SX sẵn, Cont | SX nhập |
| **LOG** (vàng) | BK, B/L, ETD, L/C hạn, CK $ | LOG nhập |
| **KT** (đỏ) | Tỷ giá, Tiền về, TT | KT nhập |
| **Tiến độ** | 4 chấm tròn | HĐ ● SX ● LOG ● KT |

### Ý nghĩa 4 chấm tiến độ

```
●●●● = Đã thanh toán (xong tất cả)
●●●○ = Đã xuất, chờ KT nhập
●●○○ = Đang vận chuyển, chờ LOG
●○○○ = Đang sản xuất
○○○○ = Mới tạo (nháp)
HỦY  = Đã hủy
```

---

## Câu hỏi thường gặp

**Q: Tôi không thấy nút "Chỉnh sửa" trong tab?**
A: Tab đã bị khóa do trạng thái đơn hàng đã chuyển qua giai đoạn của bạn, hoặc bạn không có quyền sửa tab đó. Liên hệ Admin để mở khóa.

**Q: Tại sao dòng đơn hàng có màu đỏ?**
A: Đơn hàng đã quá hạn giao hoặc L/C đã hết hạn. Cần xử lý gấp.

**Q: Tại sao dòng có màu vàng?**
A: Hàng đã sẵn sàng nhưng thiếu thông tin vận chuyển (Booking, B/L, hoặc ETD). LOG cần nhập bổ sung.

**Q: Làm sao biết đơn nào đang chờ tiền?**
A: Dòng có màu **xanh dương nhạt** = đã xuất/giao, đang chờ KT nhập thông tin thanh toán.

**Q: Admin có thể sửa đơn đã thanh toán không?**
A: Có. Admin luôn sửa được mọi tab ở mọi trạng thái.
