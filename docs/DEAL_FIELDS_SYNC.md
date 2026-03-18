# ĐỒNG BỘ TRƯỜNG DỮ LIỆU DEAL — ERP ↔ Portal

**Ngày:** 18/03/2026
**Vấn đề:** Deal thiếu các trường quan trọng: `expected_drc`, `source_region`, `rubber_type`, `pickup_location_name`
**Ảnh hưởng:** Cả ERP lẫn Portal

---

## 1. VẤN ĐỀ HIỆN TẠI

Khi xác nhận Deal từ Booking, form có đầy đủ thông tin:

```
ConfirmDealFormData {
  expected_drc: 32          ← CÓ trong form
  product_type: 'mu_dong'   ← CÓ trong form
  pickup_location: 'BP-001' ← CÓ trong form
}
```

Nhưng khi lưu vào `b2b.deals`, chỉ lưu:

```sql
INSERT INTO b2b.deals (
  product_name,    -- 'Mủ đông' (text label, không phải code)
  product_code,    -- 'mu_dong'
  notes            -- 'DRC dự kiến: 32%\nĐịa điểm: BP-001'  ← NHÉT VÀO NOTES!
)
```

**Kết quả:**
- ❌ `expected_drc` = NULL → DrcVarianceCard không tính được chênh lệch
- ❌ `source_region` = NULL → Không truy xuất được vùng mủ
- ❌ `rubber_type` = NULL → Phải parse từ `product_name` text
- ❌ `pickup_location` chỉ nằm trong notes text

---

## 2. SQL MIGRATION

Chạy trên **Supabase SQL Editor**:

```sql
-- ============================================================================
-- DEAL FIELDS SYNC — Thêm trường vào b2b.deals
-- ============================================================================

-- 1. Thêm cột mới vào bảng gốc b2b.deals
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS expected_drc NUMERIC(5,2);
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS source_region VARCHAR(100);
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS rubber_type VARCHAR(50);
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS pickup_location_name VARCHAR(200);
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS price_unit VARCHAR(10) DEFAULT 'wet';
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS delivery_date DATE;

-- 2. Cập nhật VIEW b2b_deals
CREATE OR REPLACE VIEW public.b2b_deals AS
SELECT
    id,
    deal_number,
    partner_id,
    deal_type,
    warehouse_id,
    product_name,
    product_code,
    quantity_kg,
    unit_price,
    total_amount,
    currency,
    status,
    notes,
    created_at,
    updated_at,
    created_by,
    demand_id,
    offer_id,
    final_price,
    exchange_rate,
    total_value_vnd,
    delivery_terms,
    transport_fee,
    transport_by,
    payment_terms,
    delivery_schedule,
    processing_fee_per_ton,
    expected_output_rate,
    booking_id,
    -- Phase 4: WMS fields
    actual_drc,
    actual_weight_kg,
    final_value,
    stock_in_count,
    qc_status,
    -- MỚI: Deal detail fields
    expected_drc,
    source_region,
    rubber_type,
    pickup_location_name,
    price_unit,
    delivery_date
FROM b2b.deals;

-- 3. Backfill: cập nhật deals cũ từ notes (nếu có)
-- (Tùy chọn, chạy 1 lần)
-- UPDATE b2b.deals SET rubber_type = product_code WHERE rubber_type IS NULL AND product_code IS NOT NULL;

-- 4. Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'deals'
  AND column_name IN ('expected_drc', 'source_region', 'rubber_type', 'pickup_location_name', 'price_unit', 'delivery_date')
ORDER BY column_name;
```

---

## 3. CẬP NHẬT ERP (huyanh-erp-8)

### 3.1 Deal interface — `src/services/b2b/dealService.ts`

```typescript
// Thêm vào interface Deal:
export interface Deal {
  // ... existing fields ...

  // MỚI: Deal detail fields
  expected_drc: number | null
  source_region: string | null
  rubber_type: string | null
  pickup_location_name: string | null
  price_unit: string | null        // 'wet' | 'dry'
  delivery_date: string | null
}
```

### 3.2 dealConfirmService — `src/services/b2b/dealConfirmService.ts`

```typescript
// Sửa Step 1: Tạo Deal — THÊM các trường mới vào INSERT
const { data: deal, error: dealError } = await supabase
  .from('b2b_deals')
  .insert({
    deal_number: dealNumber,
    partner_id: context.partnerId,
    deal_type: 'purchase',
    product_name: productName,
    product_code: formData.product_type,
    quantity_kg: formData.agreed_quantity_tons * 1000,
    unit_price: formData.agreed_price,
    total_value_vnd: estimatedValue,
    currency: 'VND',
    status: 'processing',
    // MỚI: Lưu trực tiếp vào cột riêng, không nhét notes
    expected_drc: formData.expected_drc,
    rubber_type: formData.product_type,
    price_unit: formData.price_unit,
    pickup_location_name: formData.pickup_location || null,
    delivery_date: formData.delivery_date || null,
    // notes chỉ chứa ghi chú thực sự
    notes: formData.deal_notes || null,
  })
```

### 3.3 DealCreatePage — `src/pages/b2b/deals/DealCreatePage.tsx`

```
Thêm fields vào form tạo deal thủ công:
- expected_drc: InputNumber (DRC dự kiến %)
- rubber_type: Select (từ PRODUCT_TYPE_OPTIONS)
- source_region: Input (Vùng thu mua)
- price_unit: Radio (Giá ướt / Giá khô)
```

### 3.4 DealDetailPage — `src/pages/b2b/deals/DealDetailPage.tsx`

```
Tab "Thông tin" → Descriptions → Thêm rows:
- DRC dự kiến: deal.expected_drc + '%'
- Loại mủ: PRODUCT_TYPE_LABELS[deal.rubber_type]
- Vùng thu mua: deal.source_region
- Loại giá: deal.price_unit === 'dry' ? 'Giá khô' : 'Giá ướt'
- Ngày giao dự kiến: deal.delivery_date
- Địa điểm chốt: deal.pickup_location_name
```

### 3.5 DrcVarianceCard — `src/components/b2b/DrcVarianceCard.tsx`

```
Hiện đang lấy expected_drc từ đâu? Kiểm tra:
- Nếu dùng (deal as any).expected_drc → sẽ hoạt động sau migration
- expected_value = quantity_kg × (expected_drc/100) × unit_price
```

### 3.6 DealWmsTab + DealQcTab

```
Hiện DRC comparison:
- expected_drc vs actual_drc → variance
- Nếu expected_drc = null → hiện "Chưa có DRC dự kiến"
```

### 3.7 App Cân Xe — `apps/weighbridge/src/pages/WeighingPage.tsx`

```
Khi chọn Deal → auto fill expected_drc từ deal
Hiện tại đã lấy nhưng deal.expected_drc = null
Sau migration sẽ có data
```

---

## 4. CẬP NHẬT PORTAL (huyanh-b2b-portal)

### 4.1 ConfirmDealModal — `src/components/chat/ConfirmDealModal.tsx`

```
Không cần sửa — Portal đã gửi expected_drc, product_type, pickup_location
trong ConfirmDealFormData. Chỉ cần ERP lưu đúng.
```

### 4.2 PartnerDealDetailPage — `src/pages/partner/PartnerDealDetailPage.tsx`

```
Thêm hiển thị:
- DRC dự kiến: deal.expected_drc
- Loại mủ: deal.rubber_type → label
- Vùng: deal.source_region
- Địa điểm chốt: deal.pickup_location_name
- Loại giá: deal.price_unit
```

### 4.3 DealCard (Portal) — `src/components/chat/DealCard.tsx`

```
Thêm hiển thị DRC dự kiến trên card:
"DRC: 32% (dự kiến)"
```

### 4.4 PartnerDealsPage — `src/pages/partner/PartnerDealsPage.tsx`

```
Thêm cột/info:
- Loại mủ (rubber_type label)
- DRC dự kiến
- Vùng
```

---

## 5. BẢNG SO SÁNH TRƯỚC/SAU

### Trước (hiện tại)

| Trường | Lưu ở | Vấn đề |
|--------|-------|--------|
| expected_drc | `notes` text | Không query được, DrcVariance fail |
| product_type | `product_code` | OK nhưng không có `rubber_type` riêng |
| pickup_location | `notes` text | Không hiển thị riêng |
| source_region | Không có | Không truy xuất được vùng |
| price_unit | Không có | Không biết giá ướt/khô |
| delivery_date | `delivery_schedule` text | Không phải date type |

### Sau (migration)

| Trường | Lưu ở | Dùng cho |
|--------|-------|---------|
| `expected_drc` | Cột riêng NUMERIC | DrcVariance, QC comparison |
| `rubber_type` | Cột riêng VARCHAR | Filter, báo cáo, đồng bộ WMS |
| `source_region` | Cột riêng VARCHAR | Truy xuất, báo cáo vùng |
| `pickup_location_name` | Cột riêng VARCHAR | Hiển thị, route planning |
| `price_unit` | Cột riêng VARCHAR | Tính giá trị chính xác |
| `delivery_date` | Cột riêng DATE | Lịch giao, tracking |

---

## 6. CHECKLIST TRIỂN KHAI

### Database
```
□ Chạy SQL ALTER TABLE b2b.deals (6 cột mới)
□ Chạy CREATE OR REPLACE VIEW b2b_deals
□ Verify: 6 cột xuất hiện trong VIEW
□ (Optional) Backfill: rubber_type = product_code cho deals cũ
```

### ERP (huyanh-erp-8)
```
□ Cập nhật Deal interface (dealService.ts)
□ Sửa dealConfirmService — lưu expected_drc, rubber_type, price_unit vào cột riêng
□ Sửa DealCreatePage — thêm fields mới
□ Sửa DealDetailPage — hiện fields mới trong Descriptions
□ Verify DrcVarianceCard hoạt động (expected_drc có data)
□ Build + Test
```

### Portal (huyanh-b2b-portal)
```
□ Cập nhật Deal interface (nếu có riêng)
□ Sửa PartnerDealDetailPage — hiện fields mới
□ Sửa DealCard — hiện DRC dự kiến
□ Sửa PartnerDealsPage — thêm cột loại mủ, DRC
□ Build + Test
```

### App Cân Xe
```
□ Verify: chọn Deal → expected_drc auto fill (sau migration sẽ có data)
□ Không cần sửa code — đã lấy deal.expected_drc
```

---

## 7. LUỒNG DỮ LIỆU SAU CẬP NHẬT

```
Booking (Chat):
  product_type: 'mu_dong'
  expected_drc: 32
  pickup_location: 'Bình Phước'
       ↓
ConfirmDealFormData:
  product_type: 'mu_dong'
  expected_drc: 32
  price_unit: 'wet'
  pickup_location: 'Bình Phước'
       ↓
b2b.deals (INSERT):
  product_name: 'Mủ đông'       ← label
  product_code: 'mu_dong'       ← code (cũ)
  rubber_type: 'mu_dong'        ← code (MỚI, đồng bộ WMS)
  expected_drc: 32               ← số (MỚI)
  price_unit: 'wet'              ← (MỚI)
  source_region: 'Bình Phước'    ← (MỚI, từ partner hoặc booking)
  pickup_location_name: '...'    ← (MỚI)
       ↓
DealDetail (ERP):
  Tab Thông tin → expected_drc: 32%
  Tab QC → DrcVarianceCard: 32% vs actual_drc → chênh lệch
       ↓
App Cân Xe:
  Chọn Deal → DRC kỳ vọng: 32% (auto fill)
       ↓
Stock-In:
  Quét QR phiếu cân → Deal → expected_drc: 32%
       ↓
QC:
  actual_drc: 33.5%
  variance: +1.5% (xanh)
       ↓
Settlement:
  expected_value = 10,000 × (32/100) × 45,000 = 144,000,000
  actual_value   = 9,300 × (33.5/100) × 45,000 = 140,152,500
  variance       = -3,847,500 VNĐ
```

---

*Huy Anh Rubber ERP v8 — Deal Fields Sync*
*Ngày: 18/03/2026*
