# HƯỚNG DẪN TEST SALE ORDER — THEO TỪNG BỘ PHẬN

> **Ngày:** 30/03/2026
> **URL:** huyanhrubber.vn
> **Lưu ý:** Mỗi BP chỉ test phần MÌNH quản lý + kiểm tra xem được phần BP KHÁC

---

## CHUẨN BỊ

### Tài khoản test theo bộ phận

| BP | Email | Mật khẩu | Phòng ban | Ghi chú |
|----|-------|----------|----------|---------|
| **Sale** | (tài khoản BP Kinh doanh) | — | Phòng Kinh doanh | Tạo + sửa đơn hàng |
| **Sản xuất** | (tài khoản BP SX) | — | Phòng Sản xuất / QC | Chỉ tab SX |
| **Logistics** | (tài khoản BP XNK) | — | Phòng XNK | Đóng gói + chứng từ |
| **Kế toán** | (tài khoản BP KT) | — | Phòng Kế toán | Tab Tài chính |
| **Admin** | minhld@huyanhrubber.com | — | Admin | Full quyền |

> Nếu chưa có tài khoản cho từng BP, dùng tài khoản Admin để test.
> Phân quyền dựa trên **phòng ban** của nhân viên trong hệ thống.

### Dữ liệu test

- 25 khách hàng thật đã import (JK, PIX, TOWER GLOBAL...)
- 10 sản phẩm: SVR3L, SVR5, SVR10, SVR20, SVR CV60, RSS1, RSS3, SBR1502, Compound

---

## 1. TEST CHO BP SALE (Kinh doanh)

### 1.1 Tạo đơn hàng mới

```
Đường dẫn: Đơn hàng bán → Đơn hàng → + Tạo đơn hàng
```

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|------------------|
| 1 | Bước 1: Chọn KH "JK Tyre" | Auto fill: FOB, USD, IN |
| 2 | Chọn Grade "SVR10" | Auto fill specs (DRC≥50, Dirt≤0.08...) |
| 3 | Nhập: 100.8 tấn, $1,650/MT | Tự tính: $166,320, ~3,024 bành, 5 container |
| 4 | Nhập PO#: 4100013100 | — |
| 5 | Nhập số HĐ: LTC2026/PD-JK/MAR | — |
| 6 | Bước 2: Kiểm tra specs đã auto fill | DRC, Moisture, Dirt, Ash, PRI... |
| 7 | Chọn đóng gói: Bale 35kg, Loose | — |
| 8 | Bước 3: Incoterms FOB, Cảng Đà Nẵng | — |
| 9 | Cảng đích: CHENNAI | — |
| 10 | Thanh toán: DP, Ngân hàng AGRI | — |
| 11 | Hoa hồng: 0 (không có broker) | — |
| 12 | Bước 4: Xem tóm tắt → "Xác nhận" | Đơn tạo thành công, status "Đã xác nhận" |

### 1.2 Xem danh sách đơn hàng

```
Đường dẫn: Đơn hàng bán → Đơn hàng
```

| Kiểm tra | Kết quả mong đợi |
|----------|------------------|
| Thấy tất cả đơn hàng | ✅ |
| Filter theo KH, Grade, trạng thái | Hoạt động |
| Tab trạng thái (Tất cả, Nháp, Xác nhận...) | Số đếm đúng |
| Nút "Xác nhận" cho đơn Nháp | ✅ Hiện |
| Nút "Hủy" | ✅ Hiện |

### 1.3 Xem chi tiết đơn hàng

```
Đường dẫn: Click vào 1 đơn hàng
```

| Tab | Sale thấy | Sale sửa được |
|-----|----------|--------------|
| Thông tin | ✅ Thấy đầy đủ | ✅ Sửa được |
| Chất lượng | ✅ Thấy specs | ✅ Sửa được |
| Sản xuất | ✅ Thấy tiến độ | ❌ KHÔNG sửa (chỉ xem) |
| Đóng gói | ✅ Thấy container | ❌ KHÔNG sửa (chỉ xem) |
| Chứng từ | ✅ Thấy + in | ❌ KHÔNG tạo (chỉ xem + in) |
| Tài chính | ❌ KHÔNG THẤY | ❌ |

### 1.4 Quản lý khách hàng

```
Đường dẫn: Đơn hàng bán → Khách hàng
```

| Kiểm tra | Kết quả |
|----------|---------|
| Thấy 25+ khách hàng | ✅ |
| Tạo KH mới | ✅ Được |
| Sửa KH | ✅ Được |
| Cờ quốc gia hiện đúng | 🇮🇳 🇸🇬 🇨🇳 🇮🇩 ... |

### 1.5 Dashboard

```
Đường dẫn: Đơn hàng bán → Tổng quan
```

| Kiểm tra | Kết quả |
|----------|---------|
| KPI cards hiện số liệu | ✅ |
| Pipeline hiện đơn theo trạng thái | ✅ |
| Top khách hàng | ✅ |

---

## 2. TEST CHO BP SẢN XUẤT

### 2.1 Xem đơn hàng (chỉ đọc)

```
Đường dẫn: Đơn hàng bán → Đơn hàng → Click 1 đơn
```

| Tab | SX thấy | SX sửa được |
|-----|---------|------------|
| Thông tin | ✅ Chỉ đọc | ❌ KHÔNG sửa |
| Chất lượng | ✅ Xem specs | ❌ KHÔNG sửa |
| Sản xuất | ✅ **ĐẦY ĐỦ** | ✅ **SỬA ĐƯỢC** |
| Đóng gói | ✅ Xem (nếu có) | ❌ KHÔNG sửa |
| Chứng từ | ❌ Không thấy | ❌ |
| Tài chính | ❌ Không thấy | ❌ |

### 2.2 Tab Sản xuất — Thao tác chính

```
Đường dẫn: Chi tiết đơn → Tab "Sản xuất"
```

| Bước | Thao tác | Kết quả |
|------|---------|---------|
| 1 | Nhấn "Kiểm tra NVL" | Hiện: cần bao nhiêu T, tồn kho bao nhiêu, thiếu bao nhiêu |
| 2 | Chọn batches NVL phù hợp | Checkbox chọn lô |
| 3 | Nhấn "Tạo lệnh sản xuất" | LSX tạo, đơn → "Đang SX" |
| 4 | Cập nhật tiến độ 5 công đoạn | Progress bar tăng |
| 5 | Nhấn "Xác nhận sẵn sàng" | Đơn → "Sẵn sàng" |

### 2.3 Những gì SX KHÔNG được làm

| Thao tác | Kết quả |
|----------|---------|
| Tạo đơn hàng mới | ❌ Không thấy nút "Tạo đơn hàng" |
| Sửa giá/KH/specs | ❌ Các trường bị disabled |
| Xem tab Tài chính | ❌ Tab không hiện |
| Tạo container | ❌ Không thấy nút |
| Hủy đơn hàng | ❌ Không thấy nút "Hủy" |

---

## 3. TEST CHO BP LOGISTICS (Xuất nhập khẩu)

### 3.1 Xem đơn hàng + Tab Đóng gói

```
Đường dẫn: Đơn hàng bán → Đơn hàng → Click đơn status "Sẵn sàng"
```

| Tab | Logistics thấy | Logistics sửa được |
|-----|---------------|-------------------|
| Thông tin | ✅ Chỉ đọc | ❌ KHÔNG sửa |
| Chất lượng | ✅ Chỉ đọc | ❌ KHÔNG sửa |
| Sản xuất | ✅ Xem tiến độ | ❌ KHÔNG sửa |
| Đóng gói | ✅ **ĐẦY ĐỦ** | ✅ **SỬA ĐƯỢC** |
| Chứng từ | ✅ COA + PL | ✅ Tạo COA, PL (không Invoice) |
| Tài chính | ❌ Không thấy | ❌ |

### 3.2 Tab Đóng gói — Thao tác chính

| Bước | Thao tác | Kết quả |
|------|---------|---------|
| 1 | Nhấn "Tạo container tự động" | 5 container tạo (20T mỗi container) |
| 2 | Nhấn "Phân bổ bành tự động" | ~576 bành/container |
| 3 | Nhập Booking No: DADF09xxxx | Lưu thành công |
| 4 | Nhập Hãng tàu: ONE | — |
| 5 | Nhập ETD: 15/04/2026 | — |
| 6 | Seal từng container | Nhập seal number → status "Sealed" |
| 7 | Nhập B/L: AP-26EXxxxx | — |
| 8 | Nhập DHL: xx xxxx xxxx | — |

### 3.3 Tab Chứng từ — Thao tác

| Bước | Thao tác | Kết quả |
|------|---------|---------|
| 1 | Nhấn "Tạo COA" | COA hiện với QC data |
| 2 | Nhấn "Tạo Packing List" | PL hiện với container data |
| 3 | Nhấn "Tạo Invoice" | ❌ **KHÔNG ĐƯỢC** — chỉ KT tạo |
| 4 | In COA / PL | ✅ In A4 tiếng Anh |

### 3.4 Trang Theo dõi lô hàng

```
Đường dẫn: Đơn hàng bán → Theo dõi lô hàng
```

| Kiểm tra | Kết quả |
|----------|---------|
| Bảng hiện giống Excel | ✅ Tất cả cột |
| Sửa Booking, B/L, ETD, DHL | ✅ Inline edit |
| Sửa Chiết khấu, Bank, Payment | ❌ KHÔNG ĐƯỢC (chỉ KT) |
| Export Excel | ✅ Tải file CSV |
| Dòng quá hạn hiện đỏ | ✅ |

### 3.5 Những gì Logistics KHÔNG được làm

| Thao tác | Kết quả |
|----------|---------|
| Tạo đơn hàng | ❌ |
| Sửa KH/giá/specs | ❌ |
| Tạo Invoice | ❌ |
| Xem/sửa tab Tài chính | ❌ Tab không hiện |
| Nhập thanh toán/chiết khấu | ❌ |

---

## 4. TEST CHO BP KẾ TOÁN

### 4.1 Xem đơn hàng + Tab Tài chính

```
Đường dẫn: Đơn hàng bán → Đơn hàng → Click 1 đơn
```

| Tab | KT thấy | KT sửa được |
|-----|---------|------------|
| Thông tin | ✅ Chỉ đọc | ❌ KHÔNG sửa |
| Chất lượng | ❌ Không thấy | ❌ |
| Sản xuất | ❌ Không thấy | ❌ |
| Đóng gói | ❌ Không thấy | ❌ |
| Chứng từ | ✅ Invoice only | ✅ Tạo Invoice |
| Tài chính | ✅ **ĐẦY ĐỦ** | ✅ **SỬA ĐƯỢC** |

### 4.2 Tab Tài chính — Thao tác chính

| Bước | Thao tác | Kết quả |
|------|---------|---------|
| 1 | Chọn phương thức TT: DP | — |
| 2 | Nhập số L/C: 0273NMLCxxxxxxx | — |
| 3 | Chọn ngân hàng nhận: AGRI | — |
| 4 | Nhập hạn L/C: 30/06/2026 | ⚠️ Cảnh báo nếu < 7 ngày |
| 5 | Nhập ngày TT: 26/08/2026 | — |
| 6 | Nhập số tiền nhận: $161,769.89 | — |
| 7 | Nhập chiết khấu: $145,592.90 | — |
| 8 | Nhập ngày CK: 04/09/2026 | — |
| 9 | Nhập ngày trình BTC: 05/09/2026 | — |
| 10 | Nhập hoa hồng: 20 USD/MT | Tổng tự tính = $2,016 |
| 11 | Nhấn "Lưu thay đổi" | Dữ liệu lưu thành công |

### 4.3 Tab Chứng từ — Tạo Invoice

| Bước | Thao tác | Kết quả |
|------|---------|---------|
| 1 | Tab Chứng từ → "Tạo Invoice" | ✅ Invoice hiện ra |
| 2 | In Invoice | ✅ A4 tiếng Anh |
| 3 | Tạo COA / Packing List | ❌ **KHÔNG ĐƯỢC** — chỉ Logistics |

### 4.4 Trang Theo dõi lô hàng

```
Đường dẫn: Đơn hàng bán → Theo dõi lô hàng
```

| Kiểm tra | Kết quả |
|----------|---------|
| Sửa Chiết khấu, Bank, Payment Date | ✅ Inline edit |
| Sửa Booking, B/L, ETD, DHL | ❌ KHÔNG ĐƯỢC (chỉ Logistics) |
| Export Excel | ✅ |

### 4.5 Những gì KT KHÔNG được làm

| Thao tác | Kết quả |
|----------|---------|
| Tạo/sửa đơn hàng | ❌ |
| Tạo/sửa KH | ❌ (chỉ xem) |
| Tạo COA / PL | ❌ |
| Sửa booking/B/L/ETD | ❌ |
| Xem tab SX / Đóng gói | ❌ Tab không hiện |

---

## 5. TEST CHO ADMIN (minhld@)

### 5.1 Full quyền

| Kiểm tra | Kết quả |
|----------|---------|
| Thấy TẤT CẢ 6 tabs | ✅ |
| Sửa tất cả fields | ✅ |
| Tạo/hủy đơn hàng | ✅ |
| Tạo/sửa KH | ✅ |
| Tạo COA + PL + Invoice | ✅ |
| Sửa tài chính | ✅ |
| Xem Executive Dashboard | ✅ |

### 5.2 Executive Dashboard

```
Đường dẫn: Đơn hàng bán → Điều hành BGĐ
```

| Kiểm tra | Kết quả |
|----------|---------|
| 4 KPI cards (doanh thu, đã thu, đơn hàng, chưa thu) | ✅ |
| Cảnh báo (đỏ/vàng/xanh) | ✅ |
| Pipeline (đơn theo trạng thái) | ✅ |
| Top 5 khách hàng | ✅ |
| Doanh thu 6 tháng (chart) | ✅ |
| Shipment gần đây | ✅ |
| Click cảnh báo → mở đơn hàng | ✅ |

---

## 6. TEST CẢNH BÁO TỰ ĐỘNG

### Tạo dữ liệu để trigger cảnh báo

| # | Cảnh báo | Cách tạo data test | Ai thấy |
|---|---------|-------------------|---------|
| 1 | L/C sắp hết hạn | Tạo đơn có `lc_expiry_date = ngày mai` | KT + Sale |
| 2 | Đơn sắp tới hạn giao | Tạo đơn có `delivery_date = 3 ngày nữa`, status "Đã xác nhận" | Sale + Logistics |
| 3 | Chưa TT > 30 ngày | Tạo đơn đã xuất 31 ngày trước, `payment_date = null` | KT + Sale |
| 4 | Đơn nháp > 3 ngày | Tạo đơn nháp cách đây 4 ngày | Sale |

---

## 7. TEST TIẾNG VIỆT

Kiểm tra tất cả trang Sales — mọi text phải có dấu:

| Trang | Những chỗ cần kiểm tra |
|-------|----------------------|
| Danh sách đơn | Tabs: Tất cả, Nháp, Đã xác nhận, Đang SX... |
| Tạo đơn | Labels: Khách hàng, Số lượng, Đơn giá, Tỷ giá... |
| Chi tiết đơn | Tabs: Thông tin, Chất lượng, Sản xuất, Đóng gói... |
| Tab Tài chính | Labels: Thanh toán, Chiết khấu, Hoa hồng... |
| Theo dõi lô hàng | Headers: Khách hàng, Số HĐ, Lô, Booking... |
| Dashboard | KPI labels, chart labels |
| Cảnh báo | "L/C sắp hết hạn", "Đơn sắp tới hạn giao"... |

**Nếu thấy text KHÔNG DẤU (VD: "Khach hang" thay vì "Khách hàng") → báo lại.**

---

## 8. CHECKLIST TỔNG HỢP

### BP Sale
- [ ] Tạo đơn hàng 4 bước
- [ ] Xem đơn hàng — 4 tab đầu (Info, Quality, SX, Packing) hiện đúng
- [ ] Tab Tài chính KHÔNG hiện
- [ ] Sửa KH
- [ ] Dashboard hiện đúng

### BP Sản xuất
- [ ] Xem đơn hàng — chỉ đọc
- [ ] Tab Sản xuất: kiểm tra NVL + tạo LSX
- [ ] KHÔNG tạo/sửa/hủy đơn hàng
- [ ] KHÔNG thấy tab Tài chính

### BP Logistics
- [ ] Tab Đóng gói: tạo container + seal
- [ ] Nhập booking, B/L, ETD, DHL
- [ ] Tạo COA + PL (không Invoice)
- [ ] Shipment Following: sửa cột logistics
- [ ] KHÔNG sửa cột tài chính

### BP Kế toán
- [ ] Tab Tài chính: L/C, chiết khấu, hoa hồng, TT
- [ ] Tạo Invoice (không COA/PL)
- [ ] Shipment Following: sửa cột tài chính
- [ ] KHÔNG sửa đơn hàng/specs/booking

### Admin
- [ ] Full 6 tabs
- [ ] Executive Dashboard hiện đúng
- [ ] Cảnh báo hiện đúng
- [ ] Tất cả quyền hoạt động

### Tiếng Việt
- [ ] Toàn bộ text có dấu

---

> Hướng dẫn test Sale Order V2 — Theo từng bộ phận
> Huy Anh Rubber ERP v8 — 30/03/2026
