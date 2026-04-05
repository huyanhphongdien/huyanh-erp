# Huy Anh ERP — Hướng dẫn Module Đơn Hàng Bán (Sales)

> **Phiên bản:** v2.0 — Cập nhật 05/04/2026
> **Công ty:** TNHH MTV Cao su Huy Anh Phong Điền
> **Module:** Quản lý Đơn hàng Bán + Xuất khẩu Cao su

---

## 1. TỔNG QUAN

Module Đơn Hàng Bán quản lý toàn bộ quy trình bán hàng xuất khẩu cao su, từ lúc ký hợp đồng đến khi nhận thanh toán.

### Menu Sidebar
```
ĐƠN HÀNG BÁN
├── Dashboard              /sales/dashboard
├── Khách hàng             /sales/customers
├── Đơn hàng               /sales/orders
├── Shipment Following     /sales/shipments
├── Nợ phải thu (A/R)      /sales/ar-aging
├── Dòng tiền & LC         /sales/cash-flow
└── Executive Dashboard    /executive
```

### 5 Bộ phận tham gia
| BP | Vai trò (role) | Trách nhiệm |
|----|---------------|-------------|
| **Sale** | `sale` | Tạo hợp đồng, nhập KH, grade, giá, payment terms |
| **Sản xuất** | `production` | Kiểm tra NVL, theo dõi sản xuất |
| **Logistics** | `logistics` | Container, shipment, chứng từ, tờ khai HQ |
| **Kế toán** | `accounting` | Tài chính, LC, chiết khấu, dòng tiền |
| **Admin** | `admin` | Toàn quyền |

---

## 2. LUỒNG ĐƠN HÀNG (9 BƯỚC)

```
① Draft ──► ② Confirmed ──► ③ Producing ──► ④ Ready ──► ⑤ Packing
                                                              │
⑨ Paid ◄── ⑧ Invoiced ◄── ⑦ Delivered ◄── ⑥ Shipped ◄───────┘
```

| Bước | Trạng thái | BP | Hành động |
|------|-----------|-----|-----------|
| ① | Draft | Sale | Tạo đơn hàng, nhập thông tin |
| ② | Confirmed | Sale | Xác nhận đơn hàng |
| ③ | Producing | SX | Kiểm tra NVL, tạo lệnh SX, theo dõi 5 công đoạn |
| ④ | Ready | SX | SX hoàn tất, hàng sẵn sàng giao |
| ⑤ | Packing | LOG | Tạo container, gán bành, seal |
| ⑥ | Shipped | LOG | Xuất hàng, cập nhật vessel/B/L |
| ⑦ | Delivered | LOG | Hàng đến cảng đích |
| ⑧ | Invoiced | KT | Lập hóa đơn, nộp chứng từ NH |
| ⑨ | Paid | KT | Nhận thanh toán |

---

## 3. TẠO ĐƠN HÀNG (4 bước wizard)

### Bước 1: Khách hàng & Sản phẩm
| Field | Mô tả | Bắt buộc |
|-------|-------|---------|
| Khách hàng | Chọn từ danh sách KH | ✅ |
| Grade SVR | SVR 3L, SVR 5, SVR 10, SVR 20, RSS... (15+ loại) | ✅ |
| PO# khách hàng | Số PO của buyer | |
| Số lượng (tấn) | Khối lượng đặt hàng | ✅ |
| Quy cách bành | 33.33 kg (630 bành/cont) hoặc 35 kg (600 bành/cont) | ✅ |
| Đơn giá (USD/tấn) | Giá bán | ✅ |
| Tiền tệ | USD / EUR / JPY / CNY | |
| Tỷ giá VND | Để tính giá trị VND | |

**Tự động tính:**
- Tổng bành = `ceil(SL × 1000 / KL_bành)`
- Số container = `ceil(Tổng_bành / bành_per_cont)`
  - 33.33 kg: 630 bành/cont 20ft
  - 35 kg: 600 bành/cont 20ft
- Giá trị USD = SL × Đơn giá
- Giá trị VND = Giá trị USD × Tỷ giá

### Bước 2: Chất lượng & Đóng gói
| Field | Mô tả |
|-------|-------|
| Chỉ tiêu chất lượng | DRC, Moisture, Dirt, Ash, Nitrogen, Volatile, PRI, Mooney, Color |
| Loại đóng gói | Pallet, Shrink wrap |
| Container type | 20ft / 40ft |

### Bước 3: Vận chuyển & Thanh toán
| Field | Mô tả |
|-------|-------|
| Payment Terms | LC 30/60/90, TT 30/60, CAD, DP... (11 loại) |
| Incoterms | FOB, CIF, CNF, DDP, EXW |
| Shipping Line | Hãng tàu |
| ETD / ETA | Ngày tàu chạy / đến |
| LC Number | Số thư tín dụng |
| LC Bank | Ngân hàng phát hành |

### Bước 4: Xác nhận
- Review tất cả thông tin
- Bấm "Tạo đơn hàng"

---

## 4. QUẢN LÝ SẢN XUẤT (Tab Production)

### Kiểm tra NVL
- Check batch cao su có sẵn trong kho
- Nhóm theo DRC range phù hợp với grade
- Tính NVL cần = SL đặt / yield (mặc định 85%)
- Phân bổ batch FIFO (cũ nhất trước)

### Theo dõi sản xuất (5 công đoạn)
```
Rửa ──► Tán/Kéo ──► Sấy ──► Ép ──► Đóng gói
 20%      40%        60%     80%     100%
```

- Auto cập nhật status "Ready" khi SX xong
- Link trực tiếp đến lệnh sản xuất (production_orders)

---

## 5. CONTAINER & ĐÓNG GÓI (Tab Packing)

### Tạo container
- **Tự động:** Hệ thống tính số container từ SL + quy cách bành
- **Thủ công:** Thêm/bớt container

### Gán bành vào container
- Chọn batch từ kho → gán vào container
- Theo dõi số bành/container
- Cân nặng: Gross / Tare / Net

### Seal container
- Nhập số seal
- Trạng thái: Planning → Packing → Sealed → Shipped

---

## 6. SHIPMENT FOLLOWING

**Route:** `/sales/shipments`

Bảng theo dõi tất cả đơn hàng đang vận chuyển, inline-editable:

| Nhóm | Cột |
|------|-----|
| **Hợp đồng** | Buyer, Contract No, Lot, PO/LC, Booking No |
| **Hàng hóa** | Commodity (grade), QTY (MT), VOL (containers) |
| **Vận chuyển** | POL, POD, Vessel/Voyage, ETD, ETA, Cutoff, B/L No, B/L Type |
| **Tài chính** | Incoterms, Payment Term, Unit Price, Amount, Discount |
| **Ngân hàng** | Bank, NH chiết khấu, Phí NH, Thực nhận |
| **Hải quan** | Tờ khai HQ, Thông quan (Đã TQ/Chờ TQ/Từ chối) |
| **Theo dõi** | DHL No, Ngày trình BTC, Ngày CK, Payment Date |
| **Trạng thái** | Status (Đóng gói/Sẵn sàng/Đã xuất/Đã giao/Đã TT) |

**Tính năng:**
- Filter theo: trạng thái, khách hàng, grade, ngày ETD
- Export CSV
- Click vào ô → sửa trực tiếp (inline edit)
- Scroll ngang với cột cố định (Buyer + Status)

---

## 7. QUẢN LÝ CHỨNG TỪ (Tab Chứng từ)

### Sinh chứng từ (tự động)
| Chứng từ | Nguồn dữ liệu |
|----------|---------------|
| COA (Certificate of Analysis) | Từ batch QC + grade specs |
| Packing List | Container breakdown |
| Commercial Invoice | Đơn hàng + bank info |

### Upload chứng từ gốc (12 loại tiêu chuẩn)
```
✅ Bill of Lading (B/L)              [Bắt buộc]  [Upload] [Xem]
✅ Commercial Invoice                [Bắt buộc]  [Upload] [Xem]
⭕ Packing List                      [Bắt buộc]  [Upload]
⭕ Certificate of Analysis (COA)     [Bắt buộc]  [Upload]
⭕ Certificate of Origin (C/O)       [Bắt buộc]  [Upload]
⭕ Form A/E                                      [Upload]
⭕ Phytosanitary Certificate                     [Upload]
⭕ Fumigation Certificate                        [Upload]
⭕ LC Copy (Thư tín dụng)                        [Upload]
⭕ Insurance Certificate                         [Upload]
⭕ Weight Note (Phiếu cân)                       [Upload]
⭕ Chứng từ khác                                 [Upload]
```

**Quy tắc:**
- Upload file PDF/ảnh/Word/Excel (max 10MB)
- Chỉ upload khi đơn hàng đã Shipped/Delivered/Invoiced/Paid
- Đánh dấu "Đã nhận" (khi có bản cứng nhưng chưa scan)
- Thêm chứng từ tùy chỉnh
- Xem file đã upload (mở tab mới)
- Progress bar: X/12 đã nhận

---

## 8. BÁO CÁO NỢ PHẢI THU (A/R Aging)

**Route:** `/sales/ar-aging`

### Aging Buckets
| Khoảng | Màu | Ý nghĩa |
|--------|-----|---------|
| 0-30 ngày | 🟢 Xanh | Bình thường |
| 31-60 ngày | 🟡 Vàng | Theo dõi |
| 61-90 ngày | 🟠 Cam | Cảnh báo |
| > 90 ngày | 🔴 Đỏ | Quá hạn nghiêm trọng |

### Tính toán
- Ngày tính: từ `delivery_date` hoặc `etd` hoặc `confirmed_at`
- Nợ = `total_value_usd - actual_payment_amount`
- Nhóm theo khách hàng
- Filter theo tiền tệ (USD/EUR)

### Hiển thị
- KPI cards: Tổng nợ + từng bucket
- Thanh phân bố tuổi nợ (color bar)
- Bảng: KH, đơn hàng, tổng, đã thu, còn nợ, 4 aging cột, progress
- Dòng tổng (summary row)

---

## 9. DÒNG TIỀN & QUẢN LÝ LC

**Route:** `/sales/cash-flow`

### Tab 1: Dòng tiền (Cash Flow Projection)
- Hiển thị 6 tháng (2 quá khứ + hiện tại + 3 tương lai)
- **Dự kiến thu:** Tính từ `delivery_date + payment_terms`
  - LC 30 ngày → +30 ngày
  - LC 60 ngày → +60 ngày
  - TT → +7 ngày
- **Đã thu:** Từ `actual_payment_amount`
- **Chênh lệch:** Dự kiến - Đã thu (đỏ nếu > 0)

### Tab 2: LC Management
| Thông tin | Chi tiết |
|-----------|---------|
| Danh sách LC | Tất cả đơn hàng có LC number |
| Ngân hàng | NH phát hành LC |
| Giá trị LC | Số tiền |
| Hết hạn | Ngày + countdown (X ngày còn lại) |
| Cảnh báo | Badge đỏ nếu hết hạn, cam nếu ≤ 7 ngày |
| Thanh toán | Đã TT / Một phần / Chưa TT |

---

## 10. KHÁCH HÀNG

### Thông tin KH
- Mã (KH-XXX), tên, tên viết tắt
- Quốc gia, ngôn ngữ
- Liên hệ (email, phone, người đại diện)
- Hạng: Chiến lược / Vàng / Bạc / Thường / Mới

### Yêu cầu chất lượng theo KH
- Mỗi KH có quality standards riêng
- Auto-fill khi tạo đơn hàng

---

## 11. PHÂN QUYỀN CHI TIẾT

### Xem trang
| Trang | Sale | SX | LOG | KT | Admin |
|-------|------|-----|-----|-----|-------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Đơn hàng | ✅ | ✅ | ✅ | ✅ | ✅ |
| Khách hàng | ✅ | | | | ✅ |
| Shipment | ✅ | | ✅ | ✅ | ✅ |
| A/R Aging | | | | ✅ | ✅ |
| Cash Flow/LC | | | | ✅ | ✅ |
| Executive | | | | | ✅ |

### Sửa đơn hàng (theo tab)
| Tab | Sale | SX | LOG | KT | Admin |
|-----|------|-----|-----|-----|-------|
| Info + Quality | ✅ | | | | ✅ |
| Production | | ✅ | | | ✅ |
| Packing | | | ✅ | | ✅ |
| Documents | | | ✅ | | ✅ |
| Finance | | | | ✅ | ✅ |

---

## 12. CẢNH BÁO TỰ ĐỘNG

| Cảnh báo | Điều kiện | Hiện ở |
|---------|----------|--------|
| LC sắp hết hạn | < 7 ngày | Dashboard + LC tab |
| Giao hàng trễ | Quá ETD | Dashboard |
| Thanh toán quá hạn | > 30 ngày chưa TT | Dashboard + A/R |
| Đơn hàng pending | > 3 ngày ở Draft | Dashboard |

---

## 13. CÁC FILE HỆ THỐNG

### Pages (src/pages/sales/) — 12 trang
| File | Route | Chức năng |
|------|-------|----------|
| SalesDashboardPage.tsx | /sales/dashboard | Dashboard doanh thu |
| SalesOrderListPage.tsx | /sales/orders | Danh sách đơn hàng |
| SalesOrderCreatePage.tsx | /sales/orders/new | Tạo đơn (4 bước) |
| SalesOrderDetailPage.tsx | /sales/orders/:id | Chi tiết (6 tabs) |
| ContainerPackingPage.tsx | /sales/orders/:id/packing | Đóng gói container |
| ExportDocumentsPage.tsx | /sales/orders/:id/documents | Sinh COA/PL/Invoice |
| ShipmentFollowingPage.tsx | /sales/shipments | Theo dõi shipment |
| ARAgingReportPage.tsx | /sales/ar-aging | Nợ phải thu |
| CashFlowPage.tsx | /sales/cash-flow | Dòng tiền + LC |
| CustomerListPage.tsx | /sales/customers | Danh sách KH |
| CustomerDetailPage.tsx | /sales/customers/:id | Chi tiết KH |
| ExecutiveDashboardPage.tsx | /executive | Dashboard GĐ |

### Services (src/services/sales/) — 10 service
| File | Chức năng |
|------|----------|
| salesTypes.ts | Types + constants (500+ dòng) |
| salesOrderService.ts | CRUD đơn hàng |
| salesCustomerService.ts | CRUD khách hàng |
| containerService.ts | Quản lý container (590 dòng) |
| documentService.ts | Sinh chứng từ |
| salesDocumentUploadService.ts | Upload + checklist chứng từ |
| salesProductionService.ts | Tích hợp sản xuất |
| salesDashboardService.ts | Analytics |
| salesAlertService.ts | Cảnh báo |
| salesPermissionService.ts | Phân quyền 5 roles |

---

## 14. DATABASE — CỘT CHÍNH

### sales_orders (70+ cột)
```
-- Hợp đồng
id, code, customer_id, grade, quantity_tons, unit_price, currency,
exchange_rate, total_value_usd, total_value_vnd, total_bales,
bale_weight_kg, container_type, container_count, status,

-- Thanh toán
payment_terms, incoterm, payment_status, payment_date,
lc_number, lc_bank, lc_expiry_date, lc_amount,

-- Vận chuyển
etd, eta, vessel_name, voyage_number, booking_reference,
bl_number, bl_type, shipping_line, dhl_number,
port_of_loading, port_of_discharge, cutoff_date, freight_terms,

-- Hải quan
customs_declaration_no, customs_declaration_date, customs_clearance_status,

-- Tài chính
discount_date, discount_amount, discount_bank,
bank_name, bank_charges, actual_payment_amount,

-- Chất lượng
drc_spec, moisture_spec, dirt_spec, ash_spec, nitrogen_spec,
volatile_spec, pri_spec, mooney_spec, color_index_spec,

-- Đóng gói
packing_type, shrink_wrap, pallet_required,

-- Chứng từ
coa_generated, packing_list_generated, invoice_generated, bl_received,
doc_submission_date,

-- Meta
contract_no, lot_number, customer_po,
notes, created_at, updated_at, created_by, confirmed_by
```

### sales_order_documents
```
id, sales_order_id, doc_type, doc_name, file_url, file_name,
file_size, is_received, received_at, uploaded_by, notes, sort_order
```

### sales_order_containers
```
id, sales_order_id, container_no, seal_no, container_type,
status, gross_weight, tare_weight, net_weight, bale_count
```

---

> **Tài liệu hướng dẫn Module Đơn Hàng Bán — Huy Anh ERP**
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> Cập nhật: 05/04/2026
