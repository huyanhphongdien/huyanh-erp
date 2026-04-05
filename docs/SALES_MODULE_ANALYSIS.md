# Module Đơn Hàng Bán — Phân tích Yêu cầu & Thực trạng

> **Ngày:** 05/04/2026
> **Yêu cầu từ:** Khách hàng (ảnh chụp tay)
> **Phân tích:** Lê Duy Minh (IT/Phó phòng QLSX)
> **ERP version:** Commit `068e58f`

---

## 1. YÊU CẦU KHÁCH HÀNG (5 NHÓM)

### Nhóm 1: Quản lý Hợp đồng (Sales Contract) — BP Sale nhập
```
Thông tin hợp đồng, theo dõi số lượng, loại hàng, đơn giá,
điều khoản thanh toán, thời hạn giao hàng
```

### Nhóm 2: Tình hình hàng hóa dự kiến có thể giao — BP Sản xuất
```
Kiểm tra NVL có sẵn, tiến độ sản xuất, dự kiến giao được bao nhiêu
```

### Nhóm 3: Quản lý Logistics / Shipment — BP LOG
```
Thông tin booking, tàu chạy, tờ khai, chiết khấu, ngân hàng,
thời hạn thanh toán, DHL, ETA
```

### Nhóm 4: Quản lý Chứng từ — BP LOG
```
Upload chứng từ lưu trữ sau khi đơn hàng hoàn tất
(B/L, LC, CO, Form A/E, Invoice gốc, Packing list gốc...)
```

### Nhóm 5: Quản lý dòng tiền, hợp đồng thế chấp — BP Kế toán
```
Kiểm tra doanh thu, tiền về, nợ phải thu, LC guarantee,
hợp đồng thế chấp ngân hàng
```

---

## 2. THỰC TRẠNG HỆ THỐNG HIỆN TẠI

### 2.1 Quản lý Hợp đồng — ✅ ĐÃ CÓ ĐẦY ĐỦ

| Tính năng | Trạng thái | File |
|-----------|-----------|------|
| Tạo đơn hàng (wizard 4 bước) | ✅ | SalesOrderCreatePage.tsx |
| Mã đơn tự động (SO-2026-XXXX) | ✅ | salesOrderService.ts |
| Chọn khách hàng + profile | ✅ | CustomerListPage.tsx |
| Grade SVR (15+ loại) | ✅ | salesTypes.ts |
| Số lượng + đơn giá + tiền tệ | ✅ | SalesOrderCreatePage.tsx |
| Quy cách bành (33.33/35 kg) | ✅ | SalesOrderCreatePage.tsx |
| Tự động tính bành + container | ✅ | SalesOrderCreatePage.tsx |
| Payment terms (LC/TT/CAD/DP) | ✅ | salesTypes.ts (11 loại) |
| Incoterms (FOB/CIF/CNF/DDP/EXW) | ✅ | salesTypes.ts |
| Chất lượng (DRC, moisture, dirt...) | ✅ | 10 chỉ tiêu |
| Đóng gói (shrink wrap, pallet) | ✅ | SalesOrderCreatePage.tsx |
| Thời hạn giao hàng (ETD/ETA) | ✅ | SalesOrderDetailPage.tsx |
| Trạng thái đơn hàng (9 bước) | ✅ | draft→confirmed→producing→ready→packing→shipped→delivered→invoiced→paid |

**Kết luận: 100% hoàn thành**

### 2.2 Tình hình hàng hóa — ✅ ĐÃ CÓ ĐẦY ĐỦ

| Tính năng | Trạng thái | File |
|-----------|-----------|------|
| Kiểm tra NVL có sẵn | ✅ | salesProductionService.ts |
| Nhóm batch theo DRC | ✅ | checkNvlAvailability() |
| Tính NVL cần (yield 85%) | ✅ | salesProductionService.ts |
| Phân bổ batch FIFO | ✅ | salesProductionService.ts |
| Tạo lệnh sản xuất từ đơn hàng | ✅ | createProductionFromSalesOrder() |
| Theo dõi 5 công đoạn SX | ✅ | Rửa→Tán/Kéo→Sấy→Ép→Đóng gói |
| Auto cập nhật status "ready" | ✅ | checkAndUpdateStatus() |
| Tab Production trong đơn hàng | ✅ | SalesOrderDetailPage.tsx |

**Kết luận: 100% hoàn thành**

### 2.3 Quản lý Logistics / Shipment — ⚠️ CÓ 70%

| Tính năng | Trạng thái | File | Ghi chú |
|-----------|-----------|------|---------|
| Container management | ✅ | ContainerPackingPage.tsx | Auto/manual, seal, weight |
| Container packing (gán bành) | ✅ | containerService.ts | 590 dòng, đầy đủ |
| Shipment tracking page | ✅ | ShipmentFollowingPage.tsx | Filter, columns toggle |
| Booking reference field | ✅ | sales_orders.booking_ref | Chỉ là field text |
| Vessel name field | ✅ | sales_orders.vessel_name | Chỉ là field text |
| B/L number field | ✅ | sales_orders.bl_number | Chỉ là field text |
| DHL number field | ✅ | sales_orders.dhl_number | Chỉ là field text |
| ETD/ETA fields | ✅ | sales_orders.etd, eta | Nhập tay |
| Discount date/amount | ✅ | sales_orders.discount_date | Nhập tay |
| Bank name | ✅ | sales_orders.bank_name | Nhập tay |
| **Trang Booking riêng** | ❌ | — | Chưa có trang quản lý booking |
| **Quản lý tàu (vessel schedule)** | ❌ | — | Chỉ có field tên tàu |
| **Tờ khai hải quan** | ❌ | — | Chưa có |
| **Chiết khấu ngân hàng chi tiết** | ❌ | — | Chỉ có 2 field cơ bản |
| **DHL API tracking** | ❌ | — | Field có nhưng không có API |
| **ETA tự động cập nhật** | ❌ | — | Nhập tay |
| **Lịch sử shipment** | ❌ | — | Không track thay đổi |

**Thiếu chính:**
1. Trang quản lý Booking/Vessel riêng
2. Tờ khai hải quan
3. API tracking DHL/hãng tàu
4. Quản lý chiết khấu ngân hàng chi tiết

### 2.4 Quản lý Chứng từ — ⚠️ CÓ 60%

| Tính năng | Trạng thái | File | Ghi chú |
|-----------|-----------|------|---------|
| Sinh COA (Certificate of Analysis) | ✅ | ExportDocumentsPage.tsx | Từ batch QC |
| Sinh Packing List | ✅ | documentService.ts | Container breakdown |
| Sinh Commercial Invoice | ✅ | documentService.ts | Với bank info |
| Đánh dấu đã sinh (flag) | ✅ | coa_generated, packing_list_generated | Boolean flags |
| B/L received flag | ✅ | sales_orders.bl_received | Boolean |
| **Upload file chứng từ gốc** | ❌ | — | Không có |
| **Kho lưu trữ chứng từ** | ❌ | — | Không có storage |
| **Checklist chứng từ cần nộp** | ❌ | — | Không có |
| **Xem/download chứng từ cũ** | ❌ | — | Không có |
| **Phiên bản chứng từ** | ❌ | — | Không có versioning |

**Thiếu chính:**
1. Upload + lưu trữ file chứng từ (scan B/L, LC, CO, Form A/E...)
2. Checklist chứng từ theo đơn hàng (đã nộp / chưa nộp)
3. Gallery xem lại chứng từ đã lưu
4. Download chứng từ

### 2.5 Quản lý Dòng tiền & Hợp đồng Thế chấp — ⚠️ CÓ 40%

| Tính năng | Trạng thái | File | Ghi chú |
|-----------|-----------|------|---------|
| Payment status tracking | ✅ | sales_orders.payment_status | unpaid/partial/paid |
| LC number + expiry | ✅ | sales_orders.lc_number, lc_expiry_date | Fields có |
| LC bank | ✅ | sales_orders.lc_bank | Field có |
| Payment date | ✅ | sales_orders.payment_date | Field có |
| Alert LC sắp hết hạn | ✅ | salesAlertService.ts | < 7 ngày |
| Alert payment overdue | ✅ | salesAlertService.ts | > 30 ngày |
| Finance tab trong đơn hàng | ✅ | SalesOrderDetailPage.tsx | Tab riêng |
| Dashboard revenue tháng | ✅ | SalesDashboardPage.tsx | Biểu đồ |
| **Báo cáo A/R aging** | ❌ | — | Không có |
| **Dự báo cash flow** | ❌ | — | Không có |
| **Hợp đồng thế chấp** | ❌ | — | Không có |
| **Đối chiếu ngân hàng** | ❌ | — | Không có |
| **Dashboard công nợ bán** | ❌ | — | Không có |
| **Báo cáo doanh thu chi tiết** | ❌ | — | Chỉ có tổng tháng |

**Thiếu chính:**
1. Báo cáo nợ phải thu (A/R aging: 0-30, 31-60, 61-90, >90 ngày)
2. Dự báo dòng tiền (cash flow projection)
3. Quản lý hợp đồng thế chấp LC
4. Dashboard doanh thu + công nợ bán chi tiết

---

## 3. MA TRẬN TỔNG HỢP

```
             ┌─────────────────────────────────────────────────────┐
             │            MỨC ĐỘ HOÀN THÀNH                       │
             ├───────────┬───────────┬───────────┬─────────────────┤
             │  100%     │   70%     │   60%     │     40%         │
             │  ✅✅✅   │   ⚠️⚠️    │   ⚠️      │     ⚠️          │
             ├───────────┼───────────┼───────────┼─────────────────┤
 Nhóm 1      │ Hợp đồng  │           │           │                 │
 (BP Sale)   │ ███████   │           │           │                 │
             ├───────────┼───────────┼───────────┼─────────────────┤
 Nhóm 2      │ Hàng hóa  │           │           │                 │
 (BP SX)     │ ███████   │           │           │                 │
             ├───────────┼───────────┼───────────┼─────────────────┤
 Nhóm 3      │           │ Logistics │           │                 │
 (BP LOG)    │           │ █████     │           │                 │
             ├───────────┼───────────┼───────────┼─────────────────┤
 Nhóm 4      │           │           │ Chứng từ  │                 │
 (BP LOG)    │           │           │ ████      │                 │
             ├───────────┼───────────┼───────────┼─────────────────┤
 Nhóm 5      │           │           │           │ Dòng tiền       │
 (BP KT)     │           │           │           │ ███             │
             └───────────┴───────────┴───────────┴─────────────────┘
```

---

## 4. DANH SÁCH CẦN LÀM (GAP LIST)

### Ưu tiên 1: Upload chứng từ (BP LOG cần nhất) — 0.5 ngày
```
□ Tạo storage bucket "sales-documents"
□ Thêm tab "Chứng từ" trong SalesOrderDetailPage
□ Checklist chứng từ tiêu chuẩn xuất khẩu:
  □ B/L (Bill of Lading) gốc
  □ Commercial Invoice gốc
  □ Packing List gốc
  □ COA (Certificate of Analysis)
  □ CO (Certificate of Origin)
  □ Form A/E (nếu có)
  □ Phytosanitary Certificate
  □ Fumigation Certificate
  □ LC copy
  □ Insurance Certificate
□ Upload file (PDF/ảnh) cho mỗi loại
□ Xem/download file đã upload
□ Trạng thái: đã nộp / chưa nộp
```

### Ưu tiên 2: Trang Booking/Vessel (BP LOG) — 1 ngày
```
□ Trang /sales/shipments nâng cấp:
  □ Booking number + ngày booking
  □ Shipping line (hãng tàu)
  □ Vessel name + voyage number
  □ Port of Loading + Port of Discharge
  □ ETD (ngày tàu chạy) + ETA (ngày đến)
  □ Cut-off date (hạn đóng hàng)
  □ B/L type (Original / Telex release / Surrendered)
  □ Freight terms (Prepaid / Collect)
□ Timeline: Booking → Stuffing → Loaded → Sailed → Arrived → Delivered
□ Tờ khai hải quan:
  □ Số tờ khai
  □ Ngày đăng ký
  □ Trạng thái (đã thông quan / chưa)
```

### Ưu tiên 3: Chiết khấu ngân hàng (BP LOG + KT) — 0.5 ngày
```
□ Mở rộng ShipmentFollowingPage:
  □ Ngày chiết khấu (discount date)
  □ Số tiền chiết khấu
  □ Ngân hàng chiết khấu
  □ Ngày nhận tiền
  □ Số tiền thực nhận
  □ Phí ngân hàng
```

### Ưu tiên 4: Báo cáo A/R Aging (BP Kế toán) — 1 ngày
```
□ Trang /sales/ar-aging:
  □ Bảng nợ phải thu theo tuổi nợ:
    □ 0-30 ngày
    □ 31-60 ngày
    □ 61-90 ngày
    □ > 90 ngày
  □ Filter theo khách hàng, tiền tệ
  □ Tổng nợ phải thu
  □ Biểu đồ aging
```

### Ưu tiên 5: Cash Flow Projection (BP Kế toán) — 1 ngày
```
□ Trang /sales/cash-flow:
  □ Dự kiến tiền về theo tháng (từ payment_terms + delivery_date)
  □ Thực tế tiền đã nhận
  □ Chênh lệch
  □ Biểu đồ dự báo vs thực tế
```

### Ưu tiên 6: Hợp đồng thế chấp (BP Kế toán) — 1.5 ngày
```
□ Trang /sales/collateral:
  □ Danh sách LC đang mở
  □ LC amount vs collateral amount
  □ Ngân hàng phát hành
  □ Ngày hết hạn
  □ Trạng thái (active / expired / settled)
  □ Link tới đơn hàng
  □ Alert khi LC sắp hết hạn
```

---

## 5. FILE HỆ THỐNG HIỆN CÓ

### Pages (src/pages/sales/) — 10 trang
| File | Chức năng | Nhóm |
|------|----------|------|
| SalesDashboardPage.tsx | Dashboard doanh thu | Nhóm 5 |
| SalesOrderListPage.tsx | Danh sách đơn hàng | Nhóm 1 |
| SalesOrderCreatePage.tsx | Tạo đơn hàng (4 bước) | Nhóm 1 |
| SalesOrderDetailPage.tsx | Chi tiết đơn (6+ tabs) | Nhóm 1,2,3,4,5 |
| ContainerPackingPage.tsx | Đóng gói container | Nhóm 3 |
| ExportDocumentsPage.tsx | Sinh COA/PL/Invoice | Nhóm 4 |
| ShipmentFollowingPage.tsx | Theo dõi shipment | Nhóm 3 |
| CustomerListPage.tsx | Danh sách khách hàng | Nhóm 1 |
| CustomerDetailPage.tsx | Chi tiết khách hàng | Nhóm 1 |
| ExecutiveDashboardPage.tsx | Dashboard GĐ | Nhóm 5 |

### Services (src/services/sales/) — 9 service
| File | Chức năng | Dòng code |
|------|----------|----------|
| salesTypes.ts | Types + constants | 500+ |
| salesOrderService.ts | CRUD đơn hàng | 400+ |
| salesCustomerService.ts | CRUD khách hàng | 300+ |
| containerService.ts | Quản lý container | 590 |
| documentService.ts | Sinh chứng từ | 300+ |
| salesProductionService.ts | Tích hợp sản xuất | 400+ |
| salesDashboardService.ts | Analytics | 300+ |
| salesAlertService.ts | Cảnh báo | 200+ |
| salesPermissionService.ts | Phân quyền 5 roles | 200+ |

### Phân quyền 5 vai trò
| Role | Xem | Tạo/Sửa | Tabs |
|------|-----|---------|------|
| **sale** | Tất cả đơn | ✅ Step 1+2 | Info, Quality |
| **production** | Tất cả đơn | ❌ | Production |
| **logistics** | Tất cả đơn | ✅ Step 3 | Packing, Documents |
| **accounting** | Tất cả đơn | ✅ Finance | Finance |
| **admin** | Tất cả | ✅ Tất cả | Tất cả |

---

## 6. LUỒNG ĐƠN HÀNG HIỆN TẠI

```
                    BP SALE                    BP SẢN XUẤT              BP LOG                    BP KẾ TOÁN
                    ──────                     ──────────               ─────                     ─────────

① Tạo đơn hàng ─────────────────────────────────────────────────────────────────────────────────────────────
   (Draft)          Nhập KH, grade,
                    SL, giá, payment terms
                         │
② Xác nhận ──────────────┤
   (Confirmed)           │
                         ▼
③ Sản xuất ──────────────────────── Check NVL ──────────────────────────────────────────────────────────────
   (Producing)                      Tạo lệnh SX
                                    Theo dõi 5 công đoạn
                                    Auto "ready" khi xong
                                         │
④ Sẵn sàng giao ────────────────────────┤
   (Ready)                               │
                                         ▼
⑤ Đóng gói ─────────────────────────────────────────── Tạo container ──────────────────────────────────────
   (Packing)                                            Gán bành vào cont
                                                        Seal container
                                                        Cân nặng
                                                             │
⑥ Đã xuất ──────────────────────────────────────────────────┤
   (Shipped)                                                 │
                                                        [THIẾU: Booking/Vessel]
                                                        [THIẾU: Tờ khai HQ]
                                                             │
⑦ Đã giao ──────────────────────────────────────────────────┤
   (Delivered)                                               │
                                                        [THIẾU: Upload chứng từ]
                                                             │
⑧ Đã xuất hóa đơn ──────────────────────────────────────────────────────────────── Theo dõi payment ──────
   (Invoiced)                                                                      LC tracking
                                                                                   [THIẾU: A/R aging]
                                                                                        │
⑨ Đã thanh toán ────────────────────────────────────────────────────────────────────────┤
   (Paid)                                                                          [THIẾU: Cash flow]
                                                                                   [THIẾU: Thế chấp]
```

---

## 7. KẾ HOẠCH TRIỂN KHAI

### Phase 1: Upload Chứng từ (0.5 ngày) — Ưu tiên cao nhất
```
BP LOG cần nhất. Sau khi đơn hàng shipped/delivered, cần lưu trữ
chứng từ gốc để đối chiếu và nộp ngân hàng.
```

### Phase 2: Nâng cấp Shipment/Logistics (1 ngày)
```
Thêm booking management, vessel tracking, tờ khai HQ vào
ShipmentFollowingPage hoặc tạo trang riêng.
```

### Phase 3: Chiết khấu Ngân hàng (0.5 ngày)
```
Mở rộng ShipmentFollowingPage + Finance tab với chi tiết
chiết khấu, phí NH, số tiền thực nhận.
```

### Phase 4: A/R Aging Report (1 ngày)
```
Trang báo cáo nợ phải thu theo tuổi nợ, filter theo KH/tiền tệ.
```

### Phase 5: Cash Flow + Thế chấp (1.5 ngày)
```
Dashboard dự báo cash flow + quản lý LC/collateral.
```

**Tổng ước tính: 4.5 ngày phát triển**

---

## 8. DATABASE — CỘT HIỆN CÓ TRÊN SALES_ORDERS

```sql
-- Đã có:
id, code, customer_id, grade, quantity_tons, unit_price, currency, exchange_rate,
total_value_usd, total_value_vnd, total_bales, bale_weight_kg, container_type,
container_count, status, payment_terms, incoterms, payment_status,
delivery_date, etd, eta, vessel_name, booking_ref, bl_number, bl_received,
dhl_number, doc_submission_date, discount_date, discount_amount, bank_name,
payment_date, lc_number, lc_bank, lc_expiry_date, lc_amount,
contract_no, lot_number, customer_po, shipping_line,
coa_generated, packing_list_generated, invoice_generated,
-- Quality specs:
drc_spec, moisture_spec, dirt_spec, ash_spec, nitrogen_spec,
volatile_spec, pri_spec, mooney_spec, color_index_spec,
-- Packing:
packing_type, shrink_wrap, pallet_required,
-- Meta:
notes, created_at, updated_at, created_by, confirmed_by, confirmed_at

-- CẦN THÊM:
customs_declaration_no,     -- Số tờ khai HQ
customs_declaration_date,   -- Ngày đăng ký tờ khai
customs_clearance_status,   -- Trạng thái thông quan
bl_type,                    -- Original/Telex/Surrendered
freight_terms,              -- Prepaid/Collect
cutoff_date,                -- Hạn đóng hàng
voyage_number,              -- Số chuyến tàu
port_of_loading,            -- Cảng xếp
port_of_discharge,          -- Cảng dỡ
actual_payment_amount,      -- Số tiền thực nhận
bank_charges,               -- Phí ngân hàng
discount_bank,              -- NH chiết khấu
```

---

> **Tài liệu phân tích Module Đơn Hàng Bán — Huy Anh ERP**
> Dùng làm sườn để phát triển các tính năng còn thiếu.
> Cập nhật: 05/04/2026
