# LIÊN KẾT B2B ↔ WMS — Huy Anh Rubber ERP v8

> **Ngày:** 17/03/2026
> **Mục tiêu:** Tài liệu hóa toàn bộ điểm kết nối giữa module B2B (Thu mua) và WMS (Kho)
> **Bridge Service:** `src/services/b2b/dealWmsService.ts`

---

## 1. TỔNG QUAN

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          LUỒNG NGHIỆP VỤ TỔNG                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║   ĐẠI LÝ (Portal)              NHÀ MÁY (ERP)              KHO (WMS)       ║
║                                                                             ║
║   1. Gửi booking ──────────→ 2. Xác nhận Deal                              ║
║                                     │                                       ║
║                                     │ deal_id                               ║
║                                     ▼                                       ║
║                              3. Xe mủ về ──────────→ 4. Cân xe (Gross)      ║
║                                                            │                ║
║                                                            ▼                ║
║                                                      5. Tạo phiếu nhập     ║
║                                                         (chọn Deal)        ║
║                                                            │                ║
║                                                            ▼                ║
║                                                      6. Nhập chi tiết      ║
║                                                         (SL, DRC sơ bộ)    ║
║                                                            │                ║
║                                                            ▼                ║
║                                                      7. Cân xe (Tare)       ║
║                                                            │                ║
║                                                            ▼                ║
║                                                      8. Xác nhận nhập kho  ║
║                                                         → Tạo Batches      ║
║                                                         → Cập nhật Deal    ║
║                                                         → Chat notify      ║
║                                                            │                ║
║                                                            ▼                ║
║                                                      9. QC lấy mẫu         ║
║                                                         Đo DRC thực        ║
║                                                         → Cập nhật Deal    ║
║                                                         → Chat notify      ║
║                                                            │                ║
║   10. Nhận thông báo ◄─────── actual_drc ◄───────────────┘                ║
║       DRC thực tế                                                           ║
║                                                            │                ║
║                                                            ▼                ║
║                                                     11. Sản xuất (P8)       ║
║                                                         5 công đoạn        ║
║                                                            │                ║
║                                                            ▼                ║
║                                                     12. Phối trộn (P9)     ║
║                                                         (nếu DRC lệch)     ║
║                                                            │                ║
║                                                            ▼                ║
║                                                     13. Xuất kho           ║
║                                                         COA + Container    ║
║                                                                             ║
║   14. Quyết toán ◄────────── final_value ◄──────────────────┘             ║
║       công nợ                                                               ║
║                                                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 2. DATABASE — ĐIỂM KẾT NỐI

### 2.1 Entity Relationship

```
╔═══════════════╗                    ╔══════════════════╗
║  b2b.deals    ║                    ║ stock_in_orders  ║
║ (schema b2b)  ║◄──── deal_id ────║ (schema public)  ║
╠═══════════════╣                    ╠══════════════════╣
║ id            ║                    ║ id               ║
║ deal_number   ║                    ║ code             ║
║ partner_id    ║                    ║ deal_id (FK) ────╫──→ b2b.deals.id
║ quantity_kg   ║                    ║ warehouse_id     ║
║ unit_price    ║                    ║ status           ║
║ expected_drc  ║                    ╚════════╤═════════╝
║               ║                             │
║ actual_drc ◄──╫──── QC recheck ────────────│
║ actual_weight ◄╫──── confirmStockIn ───────│
║ final_value ◄─╫──── calculated ────────────│
║ stock_in_count◄╫──── confirmStockIn ───────│
║ qc_status ◄──╫──── QC recheck ────────────│
╚═══════╤═══════╝                             │
        │                                     ▼
        │                            ╔══════════════════╗
        │                            ║ stock_in_details ║
        │                            ╠══════════════════╣
        │                            ║ batch_id ────────╫──→ stock_batches
        │                            ║ material_id      ║
        │                            ║ quantity, weight  ║
        │                            ╚════════╤═════════╝
        │                                     │
        │                                     ▼
        │                            ╔══════════════════╗
        │                            ║  stock_batches   ║
        │                            ╠══════════════════╣
        │                            ║ batch_no         ║
        │                            ║ initial_drc      ║
        │                            ║ latest_drc ──────╫──→ actual_drc (Deal)
        │                            ║ qc_status        ║
        │                            ║ rubber_grade     ║
        │                            ║ dry_weight       ║
        │                            ║ supplier_name    ║
        │                            ╚════════╤═════════╝
        │                                     │
        │                                     ▼
        │                            ╔══════════════════╗
        │                            ║ batch_qc_results ║
        │                            ╠══════════════════╣
        │                            ║ drc_value        ║
        │                            ║ grade_tested     ║
        │                            ║ moisture, dirt...║
        │                            ╚═════════════════╝
        │
        │                            ╔══════════════════╗
        │                            ║weighbridge_ticket║
        │                            ╠══════════════════╣
        │                            ║ reference_type   ║
        │                            ║ reference_id ────╫──→ stock_in_orders.id
        │                            ║ gross/tare/net   ║
        │                            ╚═════════════════╝
        │
        ▼
╔═══════════════╗
║b2b_chat_msgs  ║◄──── system notifications (nhập kho + QC)
╠═══════════════╣
║ room_id       ║
║ sender_type   ║ = 'system'
║ content       ║ = "Đã nhập X tấn cho Deal Y"
║ metadata      ║ = { notification_type, deal_id, ... }
╚═══════════════╝
```

### 2.2 SQL Migration (Phase 4)

```sql
-- File: docs/migrations/phase4_deal_wms.sql

-- 1. Liên kết stock_in → deal
ALTER TABLE stock_in_orders
  ADD COLUMN deal_id UUID REFERENCES b2b.deals(id) ON DELETE SET NULL;

-- 2. Thêm WMS tracking vào deals
ALTER TABLE b2b.deals
  ADD COLUMN actual_drc NUMERIC(5,2),
  ADD COLUMN actual_weight_kg NUMERIC(12,2),
  ADD COLUMN final_value NUMERIC(15,2),
  ADD COLUMN stock_in_count INTEGER DEFAULT 0,
  ADD COLUMN qc_status VARCHAR(20) DEFAULT 'pending';

-- 3. VIEW b2b_deals expose các cột mới
CREATE OR REPLACE VIEW public.b2b_deals AS
  SELECT *, actual_drc, actual_weight_kg, final_value, stock_in_count, qc_status
  FROM b2b.deals;
```

---

## 3. BRIDGE SERVICE — `dealWmsService.ts`

### 3.1 File: `src/services/b2b/dealWmsService.ts`

```
9 methods kết nối 2 module:

┌─────────────────────────────────────────────────────────────────────┐
│                      dealWmsService                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  QUERY (WMS → B2B UI):                                              │
│  ├─ getStockInsByDeal(dealId)      → DS phiếu nhập của Deal        │
│  ├─ getBatchesByDeal(dealId)       → DS lô hàng (batches) của Deal │
│  ├─ getWeighbridgeByDeal(dealId)   → DS phiếu cân của Deal        │
│  ├─ getDealWmsOverview(dealId)     → Tổng hợp WMS data            │
│  └─ getActiveDealsForStockIn()     → Deals cho dropdown nhập kho   │
│                                                                     │
│  UPDATE (WMS → B2B data):                                           │
│  ├─ updateDealActualDrc(dealId)    → Tính DRC TB + cập nhật Deal   │
│  └─ updateDealStockInTotals(dealId)→ Cập nhật stock_in_count       │
│                                                                     │
│  NOTIFY (WMS → B2B chat):                                           │
│  ├─ notifyDealChatStockIn(...)     → "Đã nhập X tấn cho Deal Y"   │
│  └─ notifyDealChatQcUpdate(...)    → "QC: DRC = X%, Status = Y"   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Query Flow

```
getStockInsByDeal(dealId):
  stock_in_orders WHERE deal_id = dealId
  JOIN warehouses → warehouse_name
  → DealStockInSummary[]

getBatchesByDeal(dealId):
  stock_in_orders WHERE deal_id = dealId, status = confirmed
  → stock_in_details WHERE stock_in_id IN (...)
  JOIN stock_batches → DRC, QC status
  JOIN materials → material_name
  → DealBatchSummary[]

getWeighbridgeByDeal(dealId):
  stock_in_orders WHERE deal_id = dealId
  → weighbridge_tickets WHERE reference_type = 'stock_in', reference_id IN (...)
  → DealWeighbridgeSummary[]

getDealWmsOverview(dealId):
  Promise.all([getStockIns, getBatches, getWeighbridges])
  → Calculate: stock_in_count, total_received_kg, batch_count, avg_drc,
    weighbridge_count, total_weighed_kg, qc_summary
  → DealWmsOverview
```

### 3.3 Update Flow

```
updateDealStockInTotals(dealId):
  ┌─ Query: stock_in_orders WHERE deal_id, status=confirmed
  ├─ Calculate: count + total_weight
  └─ UPDATE b2b_deals SET stock_in_count, actual_weight_kg

updateDealActualDrc(dealId):
  ┌─ Query: stock_in_orders → stock_in_details → stock_batches
  ├─ Calculate weighted average DRC:
  │    avg_drc = Σ(latest_drc × quantity_remaining) / Σ(quantity_remaining)
  ├─ Calculate: actual_weight, final_value = weight × (DRC/100) × unit_price
  ├─ Determine qc_status: failed > warning > passed > pending
  └─ UPDATE b2b_deals SET actual_drc, actual_weight_kg, final_value, qc_status
```

---

## 4. TRIGGER POINTS — KHI NÀO KẾT NỐI XẢYRA

### 4.1 Khi xác nhận nhập kho (confirmStockIn)

```
File: src/services/wms/stockInService.ts → confirmStockIn()

Sau bước 4 (update stock_levels, inventory_transactions):
  ┌─ Check: order có deal_id không?
  ├─ Nếu CÓ:
  │   ├─ dealWmsService.updateDealStockInTotals(deal_id)
  │   │   → Deal.stock_in_count += 1
  │   │   → Deal.actual_weight_kg = tổng weight confirmed
  │   │
  │   └─ dealWmsService.notifyDealChatStockIn(deal_id, code, total_weight)
  │       → Chat message: "Đã nhập kho X tấn cho Deal Y (NK-TP-...)"
  │       → room_id từ: deal → partner_id → b2b_chat_rooms
  │
  └─ Nếu KHÔNG: skip (phiếu nhập không liên kết Deal)

Lưu ý: Non-blocking (try/catch) — nếu deal update fail, nhập kho vẫn thành công
```

### 4.2 Khi QC recheck (addRecheckResult)

```
File: src/pages/wms/qc/QCRecheckPage.tsx → handleSubmit()

Sau khi qcService.addRecheckResult() thành công:
  ┌─ Query: stock_in_details WHERE batch_id = batchId → stock_in_id
  ├─ Query: stock_in_orders WHERE id = stock_in_id → deal_id
  ├─ Check: có deal_id không?
  ├─ Nếu CÓ:
  │   ├─ dealWmsService.updateDealActualDrc(deal_id)
  │   │   → Tính weighted average DRC từ TẤT CẢ batches của Deal
  │   │   → Deal.actual_drc = avg_drc
  │   │   → Deal.final_value = weight × (DRC/100) × price
  │   │   → Deal.qc_status = passed | warning | failed
  │   │
  │   └─ dealWmsService.notifyDealChatQcUpdate(deal_id, actual_drc, qc_status)
  │       → Chat message: "QC hoàn thành — Deal Y: DRC = X%, Status: Đạt"
  │
  └─ Nếu KHÔNG: skip

Lưu ý: Non-blocking — QC vẫn thành công dù deal update fail
```

### 4.3 Khi tạo phiếu nhập kho (StockInCreatePage)

```
File: src/pages/wms/stock-in/StockInCreatePage.tsx

Step 1 — Khi source_type = 'purchase':
  ┌─ Load: dealWmsService.getActiveDealsForStockIn()
  │   → Deals có status = processing | accepted
  │   → Chỉ deals còn remaining_kg > 0
  │
  ├─ Hiện: dropdown "Chọn Deal B2B"
  │   → Label: "DL2603-001 — Đại lý A — Còn 5.0 T"
  │
  └─ Khi chọn Deal:
      → Hiện Deal summary card (deal_number, partner, qty, remaining)
      → deal_id được truyền vào stockInService.create()
```

### 4.4 Khi xem Deal Detail (DealDetailPage)

```
File: src/pages/b2b/deals/DealDetailPage.tsx

Tab "Nhập kho" (DealWmsTab):
  ├─ dealWmsService.getStockInsByDeal(dealId)     → Table phiếu nhập
  ├─ dealWmsService.getWeighbridgeByDeal(dealId)  → Table phiếu cân
  └─ dealWmsService.getDealWmsOverview(dealId)     → KPI cards

Tab "QC" (DealQcTab):
  ├─ dealWmsService.getBatchesByDeal(dealId)        → Table batches + QC status
  └─ Deal fields: actual_drc vs expected_drc comparison

Tab "Tạm ứng" (DealAdvancesTab):
  └─ advanceService.getAdvancesByDeal(dealId)       → Financial summary
```

### 4.5 Khi lọc phiếu cân theo Deal (WeighbridgeListPage)

```
File: src/pages/wms/weighbridge/WeighbridgeListPage.tsx

Filter "Deal B2B":
  ┌─ Load: dealWmsService.getActiveDealsForStockIn()
  ├─ User chọn Deal
  ├─ Resolve: stock_in_orders WHERE deal_id → get stock_in IDs
  └─ Filter: weighbridge_tickets WHERE reference_id IN (stock_in IDs)
```

---

## 5. UI — LIÊN KẾT TRÊN GIAO DIỆN

### 5.1 Từ B2B → WMS (navigate)

| Từ trang | Hành động | Đến trang |
|----------|-----------|-----------|
| DealDetailPage → Tab WMS | Click phiếu nhập | `/wms/stock-in/:id` |
| DealDetailPage → Tab QC | Click "Lịch sử QC" | `/wms/qc/batch/:batchId` |
| DealDetailPage → Tab WMS | Click phiếu cân | `/wms/weighbridge/:id` |
| B2B Chat | Click notification nhập kho | Navigate tới Deal detail |

### 5.2 Từ WMS → B2B (navigate)

| Từ trang | Hành động | Đến trang |
|----------|-----------|-----------|
| StockInDetailPage | Click "Xem Deal →" | `/b2b/deals/:dealId` |
| StockInListPage | Click Deal tag | `/b2b/deals/:dealId` |
| WeighbridgeListPage | Filter by Deal | Hiện phiếu cân của Deal |

### 5.3 Giao diện có thông tin liên kết

```
StockInCreatePage (Step 1):
  ┌─────────────────────────────────────────────┐
  │ Nguồn nhập: [Mua hàng ▾]                    │
  │ Deal B2B:   [DL2603-001 — Đại lý A ▾]      │
  │ ┌─────────────────────────────────────────┐ │
  │ │ Deal: DL2603-001 │ Đại lý: Nguyễn A    │ │
  │ │ SL Deal: 15.0 T  │ Còn lại: 10.0 T     │ │
  │ └─────────────────────────────────────────┘ │
  └─────────────────────────────────────────────┘

StockInDetailPage:
  ┌─────────────────────────────────────────────┐
  │ Deal B2B liên kết                           │
  │ ├─ Mã Deal: DL2603-001                     │
  │ ├─ Sản phẩm: SVR 10                        │
  │ ├─ SL Deal: 15.0 T │ Đơn giá: 450k/kg     │
  │ └─ [Xem Deal →]                            │
  └─────────────────────────────────────────────┘

DealDetailPage (Tab WMS):
  ┌─────────────────────────────────────────────┐
  │ [Thông tin] [Nhập kho (3)] [QC ●] [Tạm ứng]│
  │                                             │
  │ Phiếu nhập: 3 │ Đã nhận: 10.5 T │ DRC: 52%│
  │ Phiếu cân:  2 │ Batches: 5                 │
  │                                             │
  │ Table: Mã phiếu │ Kho │ KL │ Trạng thái    │
  │ NK-TP-001        │ A   │ 5T │ ✅ Đã nhập   │
  │ NK-TP-002        │ A   │ 3T │ ✅ Đã nhập   │
  │ NK-TP-003        │ B   │ 2T │ 📝 Nháp      │
  └─────────────────────────────────────────────┘

DealDetailPage (Tab QC):
  ┌─────────────────────────────────────────────┐
  │ DRC Tracking                                │
  │ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
  │ │DRC dự kiến│ │DRC thực  │ │Chênh lệch│    │
  │ │  55.0%    │ │  52.5%   │ │  -2.5%   │    │
  │ └──────────┘ └──────────┘ └──────────┘    │
  │                                             │
  │ QC Status: ✅ Đạt                           │
  │                                             │
  │ Batches:                                    │
  │ Lô           │ DRC ban đầu → Hiện tại │ QC │
  │ TP-SVR10-001 │    52% → 53.5%         │ ✅ │
  │ TP-SVR10-002 │    51% → 52.8%         │ ⚠ │
  └─────────────────────────────────────────────┘
```

---

## 6. CHAT NOTIFICATIONS

### 6.1 Khi nhập kho xác nhận

```
Sender: system
Type: system
Content: "Đã nhập kho 5.0 tấn cho Deal DL2603-001 (NK-TP-20260317-001)"
Metadata: {
  notification_type: "stock_in_confirmed",
  deal_id: "uuid...",
  stock_in_code: "NK-TP-20260317-001",
  total_weight: 5000
}
```

### 6.2 Khi QC hoàn thành

```
Sender: system
Type: system
Content: "QC hoàn thành — Deal DL2603-001: DRC thực tế = 52.5%, Trạng thái: Đạt"
Metadata: {
  notification_type: "qc_completed",
  deal_id: "uuid...",
  actual_drc: 52.5,
  qc_status: "passed"
}
```

---

## 7. TÍNH TOÁN LIÊN MODULE

### 7.1 Weighted Average DRC

```
Khi Deal có nhiều batches (từ nhiều phiếu nhập):

  Batch 1: latest_drc = 53.5%, quantity_remaining = 300 kg
  Batch 2: latest_drc = 51.0%, quantity_remaining = 200 kg
  Batch 3: latest_drc = 55.0%, quantity_remaining = 500 kg

  actual_drc = (53.5×300 + 51.0×200 + 55.0×500) / (300+200+500)
             = (16050 + 10200 + 27500) / 1000
             = 53750 / 1000
             = 53.75%
```

### 7.2 Final Value

```
  final_value = actual_weight_kg × (actual_drc / 100) × unit_price
              = 1000 × (53.75 / 100) × 450000
              = 1000 × 0.5375 × 450000
              = 241,875,000 VNĐ
```

### 7.3 QC Status Aggregation

```
  Ưu tiên: failed > warning > passed > pending

  Nếu bất kỳ batch nào failed → Deal qc_status = 'failed'
  Nếu bất kỳ batch nào warning → Deal qc_status = 'warning'
  Nếu tất cả passed và không còn pending → Deal qc_status = 'passed'
  Còn lại → Deal qc_status = 'pending'
```

---

## 8. FILES LIÊN QUAN

### 8.1 Bridge Service

| File | Vai trò |
|------|---------|
| `src/services/b2b/dealWmsService.ts` | 9 methods kết nối B2B ↔ WMS |

### 8.2 B2B files bị ảnh hưởng bởi WMS

| File | Thay đổi |
|------|----------|
| `src/services/b2b/dealService.ts` | Thêm fields: actual_drc, actual_weight_kg, final_value, stock_in_count, qc_status |
| `src/pages/b2b/deals/DealDetailPage.tsx` | Thêm Tabs: WMS, QC, Advances |
| `src/components/b2b/DealWmsTab.tsx` | Tab nhập kho + phiếu cân |
| `src/components/b2b/DealQcTab.tsx` | Tab QC + DRC comparison |
| `src/components/b2b/DealAdvancesTab.tsx` | Tab tạm ứng |
| `src/types/b2b.types.ts` | Deal interface thêm WMS fields |

### 8.3 WMS files bị ảnh hưởng bởi B2B

| File | Thay đổi |
|------|----------|
| `src/services/wms/wms.types.ts` | StockInOrder + StockInFormData: thêm deal_id |
| `src/services/wms/stockInService.ts` | create(): nhận deal_id; confirmStockIn(): trigger deal update + chat |
| `src/pages/wms/stock-in/StockInCreatePage.tsx` | Dropdown chọn Deal khi source_type=purchase |
| `src/pages/wms/stock-in/StockInListPage.tsx` | Hiện Deal tag trên mỗi phiếu |
| `src/pages/wms/stock-in/StockInDetailPage.tsx` | Card Deal info + link "Xem Deal →" |
| `src/pages/wms/weighbridge/WeighbridgeListPage.tsx` | Filter phiếu cân theo Deal |
| `src/pages/wms/qc/QCRecheckPage.tsx` | Trigger updateDealActualDrc sau QC recheck |

### 8.4 Database Migration

| File | Nội dung |
|------|---------|
| `docs/migrations/phase4_deal_wms.sql` | deal_id trên stock_in_orders + WMS fields trên b2b.deals |

---

## 9. CÔNG THỨC GIÁ TRỊ

```
┌─────────────────────────────────────────────────────────────┐
│                    CÔNG THỨC CAO SU                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Trọng lượng khô (dry weight):                              │
│    dry_weight = total_weight × (actual_drc / 100)           │
│                                                             │
│  Giá trị thực (final value):                                │
│    final_value = dry_weight × unit_price                    │
│                = total_weight × (actual_drc/100) × price    │
│                                                             │
│  Chênh lệch DRC:                                           │
│    drc_variance = actual_drc - expected_drc                 │
│                                                             │
│  Chênh lệch giá trị:                                       │
│    value_variance = total_weight × (drc_variance/100)       │
│                     × unit_price                            │
│                                                             │
│  Ví dụ:                                                     │
│    Deal: 10T, expected_drc=55%, price=450,000 đ/kg          │
│    Thực tế: actual_drc=52.5%, actual_weight=10,200 kg       │
│                                                             │
│    dry_weight    = 10,200 × 0.525 = 5,355 kg                │
│    final_value   = 5,355 × 450,000 = 2,409,750,000 VNĐ     │
│    expected_value= 10,200 × 0.55 × 450,000 = 2,524,500,000 │
│    variance      = -114,750,000 VNĐ (-4.5%)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. TRẠNG THÁI HIỆN TẠI

| Liên kết | Status | Ghi chú |
|----------|--------|---------|
| Deal → Stock-In (deal_id) | ✅ Hoạt động | Phase 4 |
| confirmStockIn → Deal update | ✅ Hoạt động | Non-blocking |
| QC Recheck → Deal DRC update | ✅ Hoạt động | Non-blocking |
| Chat notifications | ✅ Hoạt động | 2 loại: nhập kho + QC |
| DealDetail → WMS tabs | ✅ Hoạt động | 3 tabs: WMS, QC, Advances |
| StockIn → Deal link UI | ✅ Hoạt động | Dropdown + card + tag |
| Weighbridge → Deal filter | ✅ Hoạt động | Client-side filter |
| Deal → Production (P8) | 🔲 Chưa liên kết | Cần B2B Phase 6 |
| Deal → Settlement auto | 🔲 Chưa liên kết | Cần B2B Phase 5 |

---

*Huy Anh Rubber ERP v8 — B2B ↔ WMS Integration Document*
*17/03/2026*
