# THU THẬP THÔNG TIN & PHÂN QUYỀN — 4 BỘ PHẬN

> **Ngày:** 30/03/2026
> **Mục đích:** Xác định rõ mỗi BP quản lý dữ liệu gì, để phân quyền chính xác trên ERP
> **Nguồn:** Yêu cầu thu thập từ Phòng IT + Dữ liệu Excel thực tế

---

## 1. BP SALE — KINH DOANH (6 mục)

### 1.1 Danh sách khách hàng

| Trường | Kiểu | Bắt buộc | Ví dụ | Cột DB |
|--------|------|---------|-------|--------|
| Tên công ty đầy đủ | Text | ✅ | JK Tyre & Industries Ltd | `sales_customers.name` |
| Tên viết tắt | Text | ✅ | JK | `short_name` |
| Quốc gia | Select | ✅ | Ấn Độ (IN) | `country` |
| Khu vực | Text | | South Asia | `region` |
| Người liên hệ | Text | | Mr. Yamamoto | `contact_person` |
| Email | Email | | purchase@jktyre.com | `email` |
| Điện thoại | Text | | +91-xxx | `phone` |
| Địa chỉ | Text | | Chennai, India | `address` |
| Mã số thuế | Text | | GSTIN-xxx | `tax_id` |
| Hạng khách hàng | Select | | Strategic / Premium / Standard | `tier` |
| Broker/Đại lý trung gian | Text | | Bimla Trading | `broker_name` |
| Hoa hồng broker | Number | | 20 USD/MT | `broker_commission` |

**Quyền:**
```
Sale:    ✅ Tạo  ✅ Sửa  ✅ Xem  ❌ Xóa
SX:      ❌ Tạo  ❌ Sửa  ❌ Xem  ❌ Xóa
Logis:   ❌ Tạo  ❌ Sửa  ❌ Xem  ❌ Xóa
KT:      ❌ Tạo  ❌ Sửa  ✅ Xem  ❌ Xóa
Admin:   ✅ Tạo  ✅ Sửa  ✅ Xem  ✅ Xóa
```

### 1.2 Thông tin hợp đồng

| Trường | Kiểu | Bắt buộc | Ví dụ | Cột DB |
|--------|------|---------|-------|--------|
| Số hợp đồng | Text | ✅ | 01/PD-JK/2026 hoặc HA20260001 | `sales_orders.contract_no` |
| Lot / Lô xuất | Number | | 3 | `lot_number` |
| PO# khách hàng | Text | | 4100012942 | `customer_po` |
| Ngày hợp đồng | Date | ✅ | 07/01/2026 | `order_date` |
| Trạng thái | Select | ✅ | Nháp / Xác nhận / Cancel | `status` |
| Lý do hủy (nếu cancel) | Text | | CANCEL LATE DEPOSIT | `cancel_reason` |

### 1.3 Yêu cầu chất lượng (Specs)

| Trường | Kiểu | Bắt buộc | Ví dụ | Cột DB |
|--------|------|---------|-------|--------|
| Sản phẩm / Grade | Select | ✅ | SVR10, SVR3L, RSS3... | `grade` |
| Mô tả hàng hóa | Text | | NATURAL RUBBER SVR10 | `commodity_description` |
| DRC min (%) | Number | | 50 | `drc_min` |
| DRC max (%) | Number | | 55 | `drc_max` |
| Moisture max (%) | Number | | 0.80 | `moisture_max` |
| Dirt max (%) | Number | | 0.08 | `dirt_max` |
| Ash max (%) | Number | | 0.60 | `ash_max` |
| Nitrogen max (%) | Number | | 0.60 | `nitrogen_max` |
| Volatile max (%) | Number | | 0.20 | `volatile_max` |
| PRI min | Number | | 30 | `pri_min` |
| Mooney max | Number | | — | `mooney_max` |
| Ghi chú chất lượng | Text | | "CHÚ Ý CHẤT LƯỢNG — SHIP CHO ADIDAS" | `notes` |

### 1.4 Đóng gói

| Trường | Kiểu | Bắt buộc | Ví dụ | Cột DB |
|--------|------|---------|-------|--------|
| Loại đóng gói | Select | ✅ | Bale / SW Pallet / Wooden Pallet | `packing_type` |
| KL bành | Number | ✅ | 33.33 hoặc 35 kg | `bale_weight_kg` |
| Shrink wrap | Boolean | | ☑ / ☐ | `shrink_wrap` |
| Loại pallet | Select | | Plastic / Wooden / None | `pallet_required` |
| Thick poly bag | Boolean | | ☐ | Ghi trong `packing_description` |
| Mô tả đóng gói đầy đủ | Text | | "35 Kgs/Bale; 576 bales / 16 SW plastic pallets" | `packing_description` |
| Marking instructions | Text | | HUY ANH / SVR10 / LOT 3 | `marking_instructions` |

### 1.5 Incoterms & Giá

| Trường | Kiểu | Bắt buộc | Ví dụ | Cột DB |
|--------|------|---------|-------|--------|
| Incoterms | Select | ✅ | FOB / CIF / CFR | `incoterm` |
| Cảng xếp hàng | Select | ✅ | DAD (Đà Nẵng) / HCM | `port_of_loading` |
| Cảng đích | Text | ✅ | CHENNAI / NHAVA / SHANGHAI | `port_of_destination` |
| Số lượng (tấn) | Number | ✅ | 100.8 | `quantity_tons` |
| Giá chốt (USD/MT) | Number | ✅ | 1,604.86 | `unit_price` |
| Giá hợp đồng (USD/MT) | Number | | 1,620.00 | `contract_price` |
| Tiền tệ | Select | | USD | `currency` |
| Tỷ giá | Number | | 25,500 | `exchange_rate` |
| Thời gian giao | Text | ✅ | JAN 2026 / ETD 24/2 / PROMPT SHIPMENT | `delivery_date` |

### 1.6 Mẫu PO / Contract

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| File HĐ scan | Upload | PDF hợp đồng ký → Supabase Storage |
| File PO từ KH | Upload | PO gốc từ khách hàng |

**Quyền toàn bộ mục 1.2 — 1.6:**
```
Sale:    ✅ Tạo  ✅ Sửa  ✅ Xem
SX:      ❌ Tạo  ❌ Sửa  👁 Xem (chỉ đọc)
Logis:   ❌ Tạo  ❌ Sửa  👁 Xem (chỉ đọc)
KT:      ❌ Tạo  ❌ Sửa  👁 Xem (chỉ đọc)
Admin:   ✅ Tạo  ✅ Sửa  ✅ Xem
```

---

## 2. BP SẢN XUẤT (5 mục)

### 2.1 Công suất theo grade

| Trường | Kiểu | Ví dụ | Nơi nhập |
|--------|------|-------|---------|
| Dây chuyền | Select | Line 01 | Quản lý SX |
| Grade sản xuất được | Multi-select | SVR3L, SVR10, RSS3 | Cấu hình dây chuyền |
| Công suất tối đa (tấn/ngày) | Number | 20 | Cấu hình dây chuyền |
| Đang SX cho đơn nào | Auto | SO-2026-0005 | Từ lệnh SX |

### 2.2 Tỷ lệ thu hồi (Yield)

| Trường | Kiểu | Ví dụ | Cột DB |
|--------|------|-------|--------|
| Yield dự kiến (%) | Number | 80 | `production_material_specs.expected_yield_percent` |
| Yield thực tế (%) | Number | 82.5 | `production_orders.yield_percent` |
| DRC NVL đầu vào | Number | 55% | `production_order_items.drc_at_intake` |
| DRC thành phẩm | Number | 97% | `production_output_batches.final_drc` |

### 2.3 Thời gian SX

| Trường | Kiểu | Ví dụ | Cột DB |
|--------|------|-------|--------|
| Ngày bắt đầu SX | Date | 15/03/2026 | `production_orders.actual_start_date` |
| Ngày dự kiến xong | Date | 25/03/2026 | `production_orders.scheduled_start_date` + duration |
| Ngày hoàn thành thực tế | Date | 24/03/2026 | `production_orders.actual_end_date` |

### 2.4 Công đoạn SX

| Công đoạn | Input | Output | Loss | Thời gian |
|-----------|-------|--------|------|-----------|
| 1. Rửa | 100T NVL | 97.5T | 2.5% | 3 giờ |
| 2. Tán/Kéo | 97.5T | 95T | 2.5% | 4 giờ |
| 3. Sấy | 95T | 83T | 12.6% | 10 ngày |
| 4. Ép | 83T | 81T | 2.4% | 3 giờ |
| 5. Đóng gói | 81T | 80T | 1.2% | 3 giờ |

### 2.5 Tồn kho thành phẩm

| Trường | Kiểu | Ví dụ | Nguồn |
|--------|------|-------|-------|
| Grade | Text | SVR10 | stock_batches |
| Tồn kho (tấn) | Number | 120T | stock_levels |
| Đã đặt (reserved) | Number | 80T | Từ sales_orders đang SX |
| Còn trống (available) | Number | 40T | Tồn - Reserved |

**Quyền:**
```
Sale:    ❌ Sửa  👁 Xem (chỉ xem tồn kho TP)
SX:      ✅ Sửa  ✅ Xem (tạo LSX, cập nhật tiến độ, QC)
Logis:   ❌ Sửa  👁 Xem (xem tiến độ SX để book tàu)
KT:      ❌ Sửa  ❌ Xem
Admin:   ✅ Sửa  ✅ Xem
```

---

## 3. BP LOGISTICS — XUẤT NHẬP KHẨU (6 mục)

### 3.1 Booking tàu

| Trường | Kiểu | Bắt buộc | Ví dụ | Cột DB |
|--------|------|---------|-------|--------|
| Booking No | Text | ✅ | DADF07281500 | `sales_orders.booking_reference` |
| Hãng tàu | Text | | ONE / EVERGREEN / MAERSK | `shipping_line` |
| Tên tàu | Text | | VSE251187 | `vessel_name` |
| ETD (ngày tàu chạy) | Date | ✅ | 02/08/2025 | `etd` |
| ETA (ngày tàu đến) | Date | | 15/08/2025 | `eta` |

### 3.2 Container

| Trường | Kiểu | Ví dụ | Cột DB |
|--------|------|-------|--------|
| Loại container | Select | 20ft / 40ft | `sales_order_containers.container_type` |
| Số container | Text | MSKU2001234 | `container_no` |
| Số seal | Text | HA-2026-001 | `seal_no` |
| Gross weight (kg) | Number | 22,200 | `gross_weight_kg` |
| Tare weight (kg) | Number | 2,200 | `tare_weight_kg` |
| Net weight (kg) | Number | 20,000 | `net_weight_kg` |
| Số bành | Number | 576 | `bale_count` |
| Trạng thái | Select | Planning / Packed / Sealed | `status` |

### 3.3 Chứng từ xuất

| Chứng từ | Ai tạo | Cột flag DB | Ghi chú |
|---------|--------|-----------|---------|
| COA (Certificate of Analysis) | Logistics | `coa_generated` | QC data → format COA |
| Packing List | Logistics | `packing_list_generated` | Container + bales |
| B/L (Bill of Lading) | Logistics nhập | `bl_number` | Từ hãng tàu |
| Invoice | **Kế toán** tạo | `invoice_generated` | Logistics KHÔNG tạo |

### 3.4 Chiết khấu / Phí

| Trường | Kiểu | Ví dụ | Cột DB |
|--------|------|-------|--------|
| Số tiền chiết khấu (USD) | Number | 145,592.90 | `discount_amount` |
| Ngày chiết khấu | Date | 04/09/2025 | `discount_date` |
| Ngày trình BTC (bộ chứng từ) | Date | 05/09/2025 | `doc_submission_date` |

### 3.5 DHL / Chuyển phát

| Trường | Kiểu | Ví dụ | Cột DB |
|--------|------|-------|--------|
| DHL Number | Text | 64 2774 3836 | `dhl_number` |
| Ngày gửi DHL | Date | 02/08/2025 | Ghi trong notes |

### 3.6 Lưu trữ chứng từ

| Chứng từ | Upload | Storage |
|---------|--------|---------|
| COA PDF | Logistics | Supabase Storage: `sales-docs/{order_id}/COA.pdf` |
| Packing List PDF | Logistics | `sales-docs/{order_id}/PL.pdf` |
| B/L scan | Logistics | `sales-docs/{order_id}/BL.pdf` |
| Invoice PDF | Kế toán | `sales-docs/{order_id}/INV.pdf` |
| HĐ scan | Sale | `sales-docs/{order_id}/CONTRACT.pdf` |

**Quyền:**
```
Sale:    ❌ Sửa  👁 Xem (xem booking, ETD, B/L — không sửa)
SX:      ❌ Sửa  👁 Xem (xem ETD để biết deadline SX)
Logis:   ✅ Sửa  ✅ Xem (sửa booking, B/L, container, DHL, COA, PL)
KT:      ❌ Sửa  👁 Xem (xem B/L, DHL để trình BTC)
Admin:   ✅ Sửa  ✅ Xem
```

---

## 4. BP KẾ TOÁN — TÀI CHÍNH (6 mục)

### 4.1 Phương thức thanh toán

| Mã | Mô tả | Ví dụ KH |
|----|-------|---------|
| `DP` | Documents against Payment | JK, ATC, KOHINOOR |
| `DP_AT_SIGHT` | DP trả ngay | PIX (một số đơn) |
| `TT_100` | Chuyển khoản 100% | PT ALPHEN, UKKO, MALAYA |
| `TT_SCAN` | TT 100% via scan docs | UKKO |
| `TT_BEFORE_ETD` | TT trước ngày ETD | VITRY |
| `LC_AT_SIGHT` | L/C trả ngay | RALSON, KARNAPHULI |
| `LC_30` | L/C 30 ngày | PIX |
| `LC_90` | L/C 90 ngày | GRI |
| `DEPOSIT_DP` | 10% cọc + 90% DP | PT AYUMAS |
| `DP_COMPLEX` | 10% TT + 90% DP | TOWER GLOBAL |
| `TT_30_70` | TT 30% + 70% | PT OKAMOTO |
| `ADVANCE_100` | Đặt cọc 100% | VITRY (advance payment) |

### 4.2 Thông tin L/C

| Trường | Kiểu | Ví dụ | Cột DB |
|--------|------|-------|--------|
| Số L/C | Text | 0273NMLC0003926 | `lc_number` |
| Ngân hàng phát hành | Text | — | `lc_bank` |
| Ngày hết hạn L/C | Date | 30/04/2026 | `lc_expiry_date` |
| ⚠️ Cảnh báo hết hạn | Auto | 7 ngày trước | Hệ thống cảnh báo |

### 4.3 Doanh thu / Tiền về

| Trường | Kiểu | Ví dụ | Cột DB |
|--------|------|-------|--------|
| Giá trị đơn hàng (USD) | Auto | $161,769.89 | `total_value_usd` |
| Giá trị VND | Auto | 4.13 tỷ | `total_value_vnd` |
| Ngày thanh toán | Date | 26/08/2025 | `payment_date` |
| Số tiền đã nhận | Number | $161,769.89 | `sales_invoices.paid_amount` |
| Trạng thái TT | Select | Chưa TT / Đã TT / TT 1 phần | `payment_status` |

### 4.4 Hợp đồng thế chấp (nếu có)

| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| Ngân hàng nhận | Select | AGRI / VTB / TP / EXIM / BIDV |
| File hợp đồng thế chấp | Upload | Supabase Storage |

Cột DB: `sales_orders.bank_name`

### 4.5 Công nợ

| Trường | Kiểu | Ví dụ |
|--------|------|-------|
| Tổng doanh thu tháng | Auto | $1.2M |
| Tổng đã thu | Auto | $850K |
| Tổng chưa thu | Auto | $350K |
| Quá hạn > 30 ngày | Auto + ⚠️ | $85K (JK lot 5) |

### 4.6 Mẫu Invoice

| Trường | Kiểu | Ví dụ | Cột DB |
|--------|------|-------|--------|
| Số hóa đơn | Text | INV-2026-0001 | `sales_invoices.code` |
| Ngày hóa đơn | Date | 05/08/2025 | `invoice_date` |
| Subtotal | Number | $161,769.89 | `subtotal` |
| Freight | Number | $0 (FOB) | `freight_charge` |
| Insurance | Number | $0 (FOB) | `insurance_charge` |
| Total | Auto | $161,769.89 | `total_amount` |
| Chiết khấu | Number | $145,592.90 | Từ `sales_orders.discount_amount` |
| Hoa hồng | Number | $2,016.00 | Từ `sales_orders.commission_total` |

**Quyền:**
```
Sale:    ❌ Sửa  ❌ Xem (KHÔNG xem tài chính)
SX:      ❌ Sửa  ❌ Xem
Logis:   ❌ Sửa  ❌ Xem
KT:      ✅ Sửa  ✅ Xem (FULL quyền tài chính)
Admin:   ✅ Sửa  ✅ Xem
```

---

## 5. TỔNG HỢP PHÂN QUYỀN

### 5.1 Ma trận quyền theo TRƯỜNG DỮ LIỆU

```
TRƯỜNG                          SALE   SX    LOG    KT    ADMIN
─────────────────────────────────────────────────────────────
Khách hàng                      ✎      —     —      👁     ✎
Hợp đồng (contract, PO)        ✎      👁    👁     👁     ✎
Specs chất lượng                ✎      👁    👁     —      ✎
Đóng gói                        ✎      —     👁     —      ✎
Giá (chốt + HĐ)                ✎      —     —      👁     ✎
Incoterms + Cảng                ✎      —     👁     —      ✎
Thời gian giao                  ✎      👁    👁     👁     ✎

Kế hoạch SX                     👁     ✎     👁     —      ✎
Tiến độ SX                      👁     ✎     👁     —      ✎
QC thành phẩm                   👁     ✎     👁     —      ✎
Tồn kho TP                      👁     ✎     👁     —      ✎

Booking tàu                     👁     —     ✎      👁     ✎
Container + Seal                 👁     —     ✎      —      ✎
B/L number                      👁     —     ✎      👁     ✎
ETD / ETA                       👁     👁    ✎      👁     ✎
DHL number                      —      —     ✎      👁     ✎
COA + Packing List               👁     —     ✎      👁     ✎
Ngày trình BTC                  —      —     ✎      👁     ✎

Invoice                         —      —     —      ✎      ✎
L/C (số, ngân hàng, hạn)        —      —     —      ✎      ✎
Thanh toán (ngày, số tiền)      —      —     —      ✎      ✎
Chiết khấu                      —      —     —      ✎      ✎
Hoa hồng                        —      —     —      ✎      ✎
Ngân hàng nhận                  —      —     —      ✎      ✎
Công nợ                         —      —     —      ✎      ✎

✎ = Đọc + Ghi (Read + Write)
👁 = Chỉ đọc (Read Only)
— = Không thấy (Hidden)
```

### 5.2 Ma trận quyền theo TAB trên chi tiết đơn hàng

```
TAB                    SALE   SX    LOG    KT    ADMIN
────────────────────────────────────────────────────
Tab Thông tin          ✎      👁    👁     👁     ✎
Tab Chất lượng         ✎      👁    👁     —      ✎
Tab Sản xuất           👁     ✎     👁     —      ✎
Tab Đóng gói           👁     —     ✎      —      ✎
Tab Chứng từ           👁     —     ✎(COA) ✎(INV) ✎
Tab Tài chính          —      —     —      ✎      ✎
```

### 5.3 Ma trận quyền theo TRANG

```
TRANG                   SALE   SX    LOG    KT    ADMIN
──────────────────────────────────────────────────────
/sales/dashboard         ✅     —     ✅     ✅     ✅
/sales/customers         ✅     —     —      👁     ✅
/sales/orders            ✅     👁    👁     ✅     ✅
/sales/orders/new        ✅     —     —      —      ✅
/sales/orders/:id        ✅     👁    👁     ✅     ✅
/sales/orders/:id/pack   👁     —     ✅     —      ✅
/sales/orders/:id/docs   👁     —     ✅     ✅     ✅
/sales/shipments         👁     —     ✅     ✅     ✅
/sales/reports           ✅     —     ✅     ✅     ✅
/executive               —      —     —      —      ✅+BGĐ
```

---

## 6. IMPLEMENTATION — CẤU TRÚC CODE

### 6.1 Service phân quyền

```typescript
// src/services/sales/salesPermissionService.ts

export type SalesRole = 'sale' | 'production' | 'logistics' | 'accounting' | 'admin'

// Mapping phòng ban → role
const DEPT_ROLE_MAP: Record<string, SalesRole> = {
  'Ban Giám đốc': 'admin',
  'Phòng Kinh doanh': 'sale',
  'Phòng Xuất nhập khẩu': 'logistics',
  'Phòng Kế toán': 'accounting',
  'Phòng Sản xuất': 'production',
  'Phòng QC': 'production',
  'Phòng Cơ Điện': 'production',
  'Phòng R&D': 'production',
}

// Admin override
const ADMIN_EMAILS = ['minhld@huyanhrubber.com']

export function getSalesRole(user): SalesRole {
  if (ADMIN_EMAILS.includes(user.email)) return 'admin'
  if (user.role === 'admin') return 'admin'
  return DEPT_ROLE_MAP[user.department_name] || 'sale'
}

// Permission checks
export const salesPermissions = {
  canEditCustomer: (role) => ['sale', 'admin'].includes(role),
  canEditOrder: (role) => ['sale', 'admin'].includes(role),
  canEditProduction: (role) => ['production', 'admin'].includes(role),
  canEditContainer: (role) => ['logistics', 'admin'].includes(role),
  canEditDocs: (role, docType) => {
    if (role === 'admin') return true
    if (docType === 'invoice') return role === 'accounting'
    return role === 'logistics' // COA, PL
  },
  canEditFinance: (role) => ['accounting', 'admin'].includes(role),
  canViewFinance: (role) => ['accounting', 'admin'].includes(role),
  canViewOrder: (role) => true, // ai cũng xem được (có thể readonly)
  canCreateOrder: (role) => ['sale', 'admin'].includes(role),
}
```

### 6.2 UI Component phân quyền

```tsx
// Trong SalesOrderDetailPage:

const role = getSalesRole(user)

<Tabs items={[
  // Tab Thông tin — Sale sửa, còn lại xem
  { key: 'info', label: 'Thông tin',
    children: <InfoTab readOnly={!salesPermissions.canEditOrder(role)} /> },

  // Tab Chất lượng — Sale sửa
  { key: 'quality', label: 'Chất lượng',
    children: <QualityTab readOnly={!salesPermissions.canEditOrder(role)} /> },

  // Tab Sản xuất — SX sửa
  { key: 'production', label: 'Sản xuất',
    children: <ProductionTab readOnly={!salesPermissions.canEditProduction(role)} /> },

  // Tab Đóng gói — Logistics sửa
  { key: 'packing', label: 'Đóng gói',
    children: <PackingTab readOnly={!salesPermissions.canEditContainer(role)} /> },

  // Tab Chứng từ — Logistics (COA, PL) + KT (Invoice)
  { key: 'docs', label: 'Chứng từ',
    children: <DocsTab role={role} /> },

  // Tab Tài chính — CHỈ KT + Admin thấy
  ...(salesPermissions.canViewFinance(role) ? [{
    key: 'finance', label: 'Tài chính',
    children: <FinanceTab readOnly={!salesPermissions.canEditFinance(role)} />
  }] : []),
]} />
```

---

## 7. CẢNH BÁO TỰ ĐỘNG

| # | Cảnh báo | Ai thấy | Điều kiện trigger |
|---|---------|---------|------------------|
| 1 | L/C sắp hết hạn | KT + Sale | `lc_expiry_date - today < 7 ngày` |
| 2 | ETD thay đổi | Sale + KT | Logistics sửa `etd` |
| 3 | Đơn sắp tới hạn giao | Sale + Logistics | `delivery_date - today < 7 ngày` AND chưa shipped |
| 4 | Container chưa seal | Logistics | `etd - today < 5 ngày` AND container status ≠ sealed |
| 5 | SX hoàn thành | Logistics | `production_orders.status = 'completed'` |
| 6 | Chưa thanh toán > 30 ngày | KT + Sale | `payment_date IS NULL` AND shipped > 30 ngày |
| 7 | Đơn cancel | Tất cả BP | `status = 'cancelled'` |

---

> Thu thập thông tin & Phân quyền 4 Bộ phận
> Huy Anh Rubber ERP v8 — 30/03/2026
