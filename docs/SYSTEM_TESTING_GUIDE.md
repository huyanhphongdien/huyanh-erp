# HƯỚNG DẪN TEST HỆ THỐNG HUY ANH ERP

> **Phiên bản:** 2.0 — Ngày: 25/03/2026
> **3 Apps:** ERP (huyanhrubber.vn) | Portal (b2b.huyanhrubber.vn) | Trạm cân (can.huyanhrubber.vn)

---

## MỤC LỤC

1. [Tài khoản test](#1-tài-khoản-test)
2. [Luồng 1: B2B → Cân → Nhập kho → QC](#2-luồng-1)
3. [Luồng 2: Sales Order → SX → Xuất khẩu](#3-luồng-2)
4. [Luồng 3: Sản xuất → Thành phẩm](#4-luồng-3)
5. [Luồng 4: Phối trộn](#5-luồng-4)
6. [Luồng 5: Công nợ → Quyết toán](#6-luồng-5)
7. [Luồng 6: Quản lý công việc](#7-luồng-6)
8. [Checklist tổng hợp](#8-checklist)

---

## 1. TÀI KHOẢN TEST

### ERP (huyanhrubber.vn)

| Email | Vai trò | Ghi chú |
|-------|---------|---------|
| minhld@huyanhrubber.com | Admin | Full quyền |
| minhdl@huyanhrubber.com | Phó phòng Cơ Điện | Lê Duy Minh |
| sonnqt@huyanhrubber.com | Nhân viên Cơ Điện | Ngô Quý Trường Sơn |
| tuongnguyen49026@gmail.com | Thực tập QC | Nguyễn Tưởng |

### Portal (b2b.huyanhrubber.vn)

| Đại lý | Hạng |
|--------|------|
| Nguyễn Thị Lệ (DL-NTL) | Silver |
| Nguyễn Văn Tính (DL-NVT) | Diamond |

### Trạm cân (can.huyanhrubber.vn)

| Nhân viên | PIN |
|-----------|-----|
| Nhân viên cân 1 | 1234 |
| Nhân viên cân 2 | 5678 |

---

## 2. LUỒNG 1: B2B → CÂN → NHẬP KHO → QC

**Dữ liệu mẫu:**
- Đại lý: Nguyễn Thị Lệ | Mủ nước | 30 tấn | DRC 32% | 25,000 đ/kg ướt
- Xe: 75C-12345 | Tài xế: Nguyễn Văn A

### Bước 1: Tạo Deal (từ Portal)

| # | Thao tác | App | Kết quả |
|---|---------|-----|---------|
| 1 | Đăng nhập Portal → Chat → "Chốt mủ" | Portal | Form chốt mủ |
| 2 | Điền: Mủ nước, 30T, DRC 32%, 25k, "Cam Lộ" | Portal | Giá trị: 750tr |
| 3 | Gửi đề xuất | Portal | Booking message trong chat |
| 4 | ERP → Chat → Xác nhận booking → Tạo Deal | ERP | Deal "Đang xử lý" |

### Bước 2: Cân xe

| # | Thao tác | App | Kết quả |
|---|---------|-----|---------|
| 1 | Login PIN 1234 → Tạo phiếu cân → Chọn Deal | Trạm cân | Auto fill đại lý, loại mủ |
| 2 | Nhập biển số, tài xế → Ghi cân L1 (Gross) | Trạm cân | Camera chụp 3 ảnh |
| 3 | Ghi cân L2 (Tare) → Hoàn tất | Trạm cân | NET hiện, auto in phiếu |

### Bước 3: Nhập kho

| # | Thao tác | App | Kết quả |
|---|---------|-----|---------|
| 1 | Nhập kho → Tạo phiếu → Quét QR phiếu cân | ERP | Auto fill Deal, đại lý, loại mủ |
| 2 | Chọn kho NVL → Thêm chi tiết → Xác nhận | ERP | Batch tạo, Deal cập nhật weight |

### Bước 4: QC

| # | Thao tác | App | Kết quả |
|---|---------|-----|---------|
| 1 | QC/DRC → Chọn lô → Nhập DRC 33.5% → Đạt | ERP | QC saved, Deal.actual_drc cập nhật |
| 2 | In nhãn QR (sau QC passed) | ERP | Nhãn A5 có QR, DRC, đại lý |

**Verify SQL:**
```sql
SELECT deal_number, actual_drc, actual_weight_kg, qc_status FROM b2b_deals ORDER BY created_at DESC LIMIT 1;
```

---

## 3. LUỒNG 2: SALES ORDER → SX → XUẤT KHẨU

**Dữ liệu mẫu:**
- KH: Michelin (KH-001) | SVR 3L | 200T | $1,900/T | FOB HCM | 15/04/2026

### Bước 1: Tạo đơn hàng

| # | Thao tác | Kết quả |
|---|---------|---------|
| 1 | Đơn hàng bán → Tạo → Chọn KH Michelin, SVR 3L, 200T, $1900 | Auto tính: $380k, 6000 bành, 10 container |
| 2 | Bước 2: Specs auto fill từ SVR 3L | DRC≥60, Dirt≤0.02, PRI≥40 |
| 3 | Bước 3: FOB HCM, L/C at sight | Thông tin vận chuyển |
| 4 | Xác nhận | Đơn "Đã xác nhận" |

### Bước 2: Sản xuất

| # | Thao tác | Kết quả |
|---|---------|---------|
| 1 | Tab Sản xuất → Kiểm tra NVL | Cần ~250T NVL (yield 80%) |
| 2 | Chọn batches → Tạo lệnh SX | LSX tạo, đơn → "Đang SX" |

### Bước 3: Đóng gói + Chứng từ

| # | Thao tác | Kết quả |
|---|---------|---------|
| 1 | Tab Đóng gói → Tạo container tự động | 10 containers |
| 2 | Phân bổ bành → Seal | 600 bành/container, sealed |
| 3 | Tab Chứng từ → COA + Packing List + Invoice | 3 docs tiếng Anh, in A4 |

---

## 4. LUỒNG 3: SẢN XUẤT

**Dữ liệu:** 3 lô NVL → SVR 10 → 80T target

| # | Thao tác | Kết quả |
|---|---------|---------|
| 1 | Tạo LSX: SVR 10, 80T, Line 01 | LSX tạo |
| 2 | Chọn 3 lô NVL | Batches linked |
| 3 | 5 công đoạn: Rửa → Tán → Sấy → Ép → Gói | Mỗi bước: weight loss, DRC tăng |
| 4 | Tạo lô TP | TP batch, yield % |
| 5 | QC thành phẩm | DRC 97%, PASS SVR 10 |

---

## 5. LUỒNG 4: PHỐI TRỘN

**Dữ liệu:** Lô A (45%, 10T) + Lô B (62%, 15T) → Target 55%

| # | Thao tác | Kết quả |
|---|---------|---------|
| 1 | Tạo lệnh trộn, chọn 2 lô | 2 lô trong list |
| 2 | Mô phỏng | DRC = (45×10+62×15)/25 = 55.2% |
| 3 | Duyệt → Thực hiện → QC | Lô mới 25T, DRC~55% |

---

## 6. LUỒNG 5: CÔNG NỢ → QUYẾT TOÁN

**Dữ liệu:** Deal 45T mủ nước, 35k/kg, giá trị 1.575 tỷ

| # | Thao tác | Kết quả |
|---|---------|---------|
| 1 | Tạm ứng 500tr | Ledger: CREDIT 500tr |
| 2 | Deal QC xong → Quyết toán | Ledger: DEBIT 1.575 tỷ |
| 3 | Duyệt QT → Thanh toán 1.075 tỷ | Ledger: CREDIT 1.075 tỷ |
| 4 | Kiểm tra Balance | **0 VNĐ** ✓ |

**Verify:**
```sql
SELECT entry_type, SUM(debit) d, SUM(credit) c
FROM b2b_partner_ledger WHERE partner_id = 'xxx'
GROUP BY entry_type;
-- DEBIT tổng = CREDIT tổng
```

---

## 7. LUỒNG 6: QUẢN LÝ CÔNG VIỆC

| # | Test | Kết quả |
|---|------|---------|
| 1 | 5 mẫu mặc định hiện đúng | ✓ |
| 2 | Tạo task từ mẫu → checklist auto fill | ✓ |
| 3 | Tick checklist → progress tăng | ✓ |
| 4 | Lịch tự động: chọn nhiều NV | Mỗi NV nhận task riêng |
| 5 | Phân quyền: PP thấy NV phòng mình | ✓ |

---

## 8. CHECKLIST TỔNG HỢP

### B2B + Cân + Kho + QC
- [ ] Portal: Tạo phiếu chốt mủ
- [ ] ERP: Xác nhận → Deal
- [ ] Trạm cân: Cân L1+L2 + camera + in
- [ ] ERP: Quét QR → nhập kho
- [ ] ERP: QC → DRC → in nhãn QR

### Sales Order
- [ ] Tạo KH + đơn hàng 4 bước
- [ ] Specs auto fill + NVL check
- [ ] Container + seal + COA + PL + Invoice

### Sản xuất + Phối trộn
- [ ] LSX 5 công đoạn → TP → QC
- [ ] Blend simulator → thực hiện → lô mới

### Công nợ
- [ ] Tạm ứng → QT → Duyệt → TT → Balance=0

### Công việc
- [ ] Template + checklist + lịch tự động

---

## DỮ LIỆU TEST SẴN CÓ

### 5 Khách hàng: Michelin, Bridgestone, Continental, Hankook, GT Radial
### 10 Đơn hàng: SO-2026-0001 → 0010 (đủ 10 trạng thái)
### 14 Đại lý B2B: DL-NTL, DL-NVT, DL-ADG...
### 5 Mẫu công việc: Nhập mủ, Bảo trì, QC, Báo cáo, Kiểm kê

---

> Huy Anh Rubber ERP v8 — System Testing Guide v2.0
