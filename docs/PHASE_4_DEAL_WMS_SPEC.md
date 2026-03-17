# PHASE 4 — NHẬN MỦ TẠI KHO (Deal ↔ WMS)

**Module:** B2B Deals ↔ WMS Stock-In ↔ Weighbridge ↔ QC
**Version:** 1.0
**Ngày:** 16/03/2026
**UI Framework:** Ant Design v6

---

## MỤC LỤC

1. [Tổng quan & Mục tiêu](#1-tổng-quan--mục-tiêu)
2. [Luồng nghiệp vụ](#2-luồng-nghiệp-vụ)
3. [Database Changes](#3-database-changes)
4. [Sub-phase 4.1: Bridge Service](#4-sub-phase-41-bridge-service)
5. [Sub-phase 4.2: Stock-In ↔ Deal](#5-sub-phase-42-stock-in--deal)
6. [Sub-phase 4.3: Weighbridge ↔ Deal](#6-sub-phase-43-weighbridge--deal)
7. [Sub-phase 4.4: QC → Deal (actual_drc)](#7-sub-phase-44-qc--deal-actual_drc)
8. [Sub-phase 4.5: DealDetailPage nâng cấp](#8-sub-phase-45-dealdetailpage-nâng-cấp)
9. [Sub-phase 4.6: Chat notification](#9-sub-phase-46-chat-notification)
10. [Files tạo/sửa](#10-files-tạosửa)
11. [Checklist triển khai](#11-checklist-triển-khai)

---

## 1. TỔNG QUAN & MỤC TIÊU

### 1.1 Vấn đề hiện tại

- Deal B2B đã tạo được nhưng **không liên kết** với phiếu nhập kho (Stock-In)
- WMS Stock-In hoạt động độc lập, không biết phiếu nhập thuộc Deal nào
- QC đo DRC thực tế nhưng **không cập nhật `actual_drc` về Deal**
- Weighbridge (phiếu cân) không gắn được với Deal
- DealDetailPage chưa hiển thị thông tin kho, QC, cân

### 1.2 Mục tiêu

```
Deal B2B ──→ Stock-In Order ──→ Stock Batches ──→ QC Results
    ↓              ↓                                    ↓
    └──── Weighbridge Tickets              actual_drc → Deal
```

Sau Phase 4:
- Tạo phiếu nhập kho với `deal_id` → biết nhập cho deal nào
- Cân xe gắn với Stock-In → gián tiếp gắn với Deal
- QC đo DRC thực → tự động cập nhật `actual_drc` về Deal
- DealDetailPage hiện tab WMS: phiếu nhập, batches, QC, phiếu cân
- Chat nhận thông báo khi nhập kho / QC hoàn thành

### 1.3 Modules hiện có (không cần xây lại)

| Module | Tables | Pages | Services |
|--------|--------|-------|----------|
| Stock-In | `stock_in_orders`, `stock_in_details` | List, Create, Detail | `stockInService` |
| Weighbridge | `weighbridge_tickets`, `weighbridge_images` | Page, List, Detail | `weighbridgeService` |
| QC | `stock_batches`, `batch_qc_results`, `material_qc_standards` | Dashboard, Recheck, Standards, History | `qcService` |
| B2B Deals | `b2b_deals` | List, Create, Detail | `dealService` |

---

## 2. LUỒNG NGHIỆP VỤ

### 2.1 Sequence (sau Phase 4)

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│  B2B Deal │     │  Stock-In │     │Weighbridge│     │    QC     │
│  (Chat)   │     │   (WMS)   │     │  (Cân xe) │     │  (DRC)   │
└─────┬─────┘     └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
      │                 │                 │                 │
      │  1. Deal đã tạo │                 │                 │
      │─────────────────►                 │                 │
      │                 │                 │                 │
      │                 │  2. Xe mủ về    │                 │
      │                 │  ← ─ ─ ─ ─ ─ ─ ┤                 │
      │                 │                 │                 │
      │                 │  3. Tạo phiếu   │                 │
      │                 │  nhập kho       │                 │
      │                 │  (chọn Deal)    │                 │
      │                 │                 │                 │
      │                 │  4. Cân xe      │                 │
      │                 │────────────────►│                 │
      │                 │   gross/tare    │                 │
      │                 │◄────────────────│                 │
      │                 │   net_weight    │                 │
      │                 │                 │                 │
      │                 │  5. Thêm items  │                 │
      │                 │  (SL, DRC sơ bộ)│                 │
      │                 │                 │                 │
      │                 │  6. Confirm     │                 │
      │                 │  → Tạo batches  │                 │
      │                 │                 │                 │
      │                 │                 │  7. QC lấy mẫu  │
      │                 │                 │────────────────►│
      │                 │                 │                 │
      │                 │                 │  8. Đo DRC thực │
      │                 │                 │  → actual_drc   │
      │                 │                 │◄────────────────│
      │                 │                 │                 │
      │  9. Cập nhật    │                 │                 │
      │  actual_drc     │                 │                 │
      │◄────────────────┤                 │                 │
      │                 │                 │                 │
      │  10. Gửi thông  │                 │                 │
      │  báo vào chat   │                 │                 │
      │                 │                 │                 │
```

### 2.2 Dữ liệu chảy qua

```
Deal (expected_drc, quantity_kg, agreed_price)
  ↓ deal_id
Stock-In Order (warehouse_id, source_type='purchase')
  ↓ stock_in_id
Stock-In Details (material_id, quantity, weight, drc_value)
  ↓ batch_id
Stock Batches (initial_drc, latest_drc, qc_status)
  ↓ batch_id
QC Results (drc_value → actual_drc)
  ↓ actual_drc
Deal (actual_drc, actual_weight → final_value)
```

---

## 3. DATABASE CHANGES

### 3.1 Thêm cột `deal_id` vào `stock_in_orders`

```sql
-- Liên kết phiếu nhập kho với Deal B2B
ALTER TABLE stock_in_orders
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES b2b_deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_in_orders_deal_id
  ON stock_in_orders(deal_id);
```

### 3.2 Thêm các cột vào `b2b_deals`

```sql
-- DRC thực tế (cập nhật sau QC)
ALTER TABLE b2b_deals
  ADD COLUMN IF NOT EXISTS actual_drc NUMERIC(5,2);

-- Khối lượng thực nhận (từ phiếu cân/nhập kho)
ALTER TABLE b2b_deals
  ADD COLUMN IF NOT EXISTS actual_weight_kg NUMERIC(12,2);

-- Giá trị thực (tính từ actual_drc + actual_weight)
ALTER TABLE b2b_deals
  ADD COLUMN IF NOT EXISTS final_value NUMERIC(15,2);

-- Số lượt nhập kho (denormalized)
ALTER TABLE b2b_deals
  ADD COLUMN IF NOT EXISTS stock_in_count INTEGER DEFAULT 0;

-- Trạng thái QC tổng hợp
ALTER TABLE b2b_deals
  ADD COLUMN IF NOT EXISTS qc_status VARCHAR(20) DEFAULT 'pending';
  -- 'pending' | 'passed' | 'warning' | 'failed'
```

### 3.3 Không thay đổi

| Table | Lý do |
|-------|-------|
| `weighbridge_tickets` | Đã có `reference_type` + `reference_id` → link qua Stock-In |
| `stock_batches` | Đã có `initial_drc`, `latest_drc`, `qc_status` |
| `batch_qc_results` | Đã có `drc_value`, `result` |
| `stock_in_details` | Đã có `material_id`, `quantity`, `weight` |

---

## 4. SUB-PHASE 4.1: BRIDGE SERVICE

### 4.1 File: `src/services/b2b/dealWmsService.ts`

Service kết nối Deal ↔ WMS, cung cấp queries xuyên module.

```typescript
// ============================================================================
// DEAL-WMS BRIDGE SERVICE
// File: src/services/b2b/dealWmsService.ts
// Liên kết B2B Deals với WMS (Stock-In, Batches, QC, Weighbridge)
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export interface DealStockInSummary {
  stock_in_id: string
  code: string                    // NK-TP-20260316-001
  warehouse_name: string
  status: 'draft' | 'confirmed' | 'cancelled'
  total_quantity: number
  total_weight: number
  confirmed_at: string | null
  created_at: string
}

export interface DealBatchSummary {
  batch_id: string
  batch_no: string
  material_name: string
  initial_drc: number | null
  latest_drc: number | null
  qc_status: string              // 'pending' | 'passed' | 'warning' | 'failed'
  quantity_remaining: number
  received_date: string
  last_qc_date: string | null
}

export interface DealWeighbridgeSummary {
  ticket_id: string
  code: string                    // CX-20260316-001
  vehicle_plate: string
  net_weight: number | null
  status: string
  completed_at: string | null
}

export interface DealWmsOverview {
  deal_id: string
  stock_in_count: number
  total_received_kg: number
  batch_count: number
  avg_drc: number | null
  weighbridge_count: number
  total_weighed_kg: number
  qc_summary: {
    passed: number
    warning: number
    failed: number
    pending: number
  }
}

// ============================================
// SERVICE
// ============================================

export const dealWmsService = {

  /** Lấy tất cả phiếu nhập kho của 1 Deal */
  async getStockInsByDeal(dealId: string): Promise<DealStockInSummary[]> { ... },

  /** Lấy tất cả batches thuộc Deal (qua stock_in_details) */
  async getBatchesByDeal(dealId: string): Promise<DealBatchSummary[]> { ... },

  /** Lấy phiếu cân liên quan đến Deal (qua stock_in reference) */
  async getWeighbridgeByDeal(dealId: string): Promise<DealWeighbridgeSummary[]> { ... },

  /** Tổng hợp WMS data cho 1 Deal */
  async getDealWmsOverview(dealId: string): Promise<DealWmsOverview> { ... },

  /** Lấy danh sách Deals chưa hoàn tất nhập kho (cho dropdown chọn Deal) */
  async getActiveDealsForStockIn(partnerId?: string): Promise<Array<{
    id: string
    deal_number: string
    partner_name: string
    product_name: string
    quantity_kg: number
    received_kg: number           // Đã nhập
    remaining_kg: number          // Còn lại
  }>> { ... },

  /** Cập nhật actual_drc từ QC kết quả về Deal */
  async updateDealActualDrc(dealId: string): Promise<{
    actual_drc: number | null
    actual_weight_kg: number
    final_value: number | null
    qc_status: string
  }> { ... },

  /** Cập nhật deal totals sau khi confirm stock-in */
  async updateDealStockInTotals(dealId: string): Promise<void> { ... },
}
```

### 4.2 Query quan trọng: `getActiveDealsForStockIn`

```typescript
// Lấy deals đang xử lý, tính SL đã nhập vs còn lại
async getActiveDealsForStockIn(partnerId?: string) {
  // 1. Lấy deals status = 'processing' hoặc 'accepted'
  let query = supabase
    .from('b2b_deals')
    .select(`
      id, deal_number, product_name, quantity_kg,
      partner:b2b_partners!partner_id (id, name)
    `)
    .in('status', ['processing', 'accepted'])

  if (partnerId) {
    query = query.eq('partner_id', partnerId)
  }

  const { data: deals } = await query

  // 2. Lấy SL đã nhập cho mỗi deal
  const result = []
  for (const deal of (deals || [])) {
    const { data: stockIns } = await supabase
      .from('stock_in_orders')
      .select('total_weight')
      .eq('deal_id', deal.id)
      .eq('status', 'confirmed')

    const receivedKg = (stockIns || [])
      .reduce((sum, si) => sum + (si.total_weight || 0), 0)

    result.push({
      id: deal.id,
      deal_number: deal.deal_number,
      partner_name: deal.partner?.name || '',
      product_name: deal.product_name || '',
      quantity_kg: deal.quantity_kg || 0,
      received_kg: receivedKg,
      remaining_kg: Math.max(0, (deal.quantity_kg || 0) - receivedKg),
    })
  }

  return result.filter(d => d.remaining_kg > 0) // Chỉ deals còn SL cần nhập
}
```

### 4.3 Query quan trọng: `updateDealActualDrc`

```typescript
// Tính DRC trung bình từ tất cả batches thuộc Deal
async updateDealActualDrc(dealId: string) {
  // 1. Lấy tất cả batches qua stock_in
  const { data: stockIns } = await supabase
    .from('stock_in_orders')
    .select('id')
    .eq('deal_id', dealId)
    .eq('status', 'confirmed')

  const stockInIds = (stockIns || []).map(s => s.id)
  if (stockInIds.length === 0) return null

  const { data: details } = await supabase
    .from('stock_in_details')
    .select('batch_id, quantity, weight')
    .in('stock_in_id', stockInIds)

  const batchIds = (details || []).map(d => d.batch_id).filter(Boolean)
  if (batchIds.length === 0) return null

  const { data: batches } = await supabase
    .from('stock_batches')
    .select('latest_drc, quantity_remaining, qc_status')
    .in('id', batchIds)

  // 2. Tính weighted average DRC
  let totalDrcWeight = 0
  let totalWeight = 0
  const qcSummary = { passed: 0, warning: 0, failed: 0, pending: 0 }

  for (const batch of (batches || [])) {
    if (batch.latest_drc && batch.quantity_remaining > 0) {
      totalDrcWeight += batch.latest_drc * batch.quantity_remaining
      totalWeight += batch.quantity_remaining
    }
    const status = batch.qc_status || 'pending'
    if (status in qcSummary) qcSummary[status]++
  }

  const avgDrc = totalWeight > 0 ? Math.round((totalDrcWeight / totalWeight) * 100) / 100 : null

  // 3. Tính actual_weight từ stock-in confirmed
  const actualWeight = (details || []).reduce((sum, d) => sum + (d.weight || 0), 0)

  // 4. Tính final_value
  const { data: deal } = await supabase
    .from('b2b_deals')
    .select('unit_price, quantity_kg')
    .eq('id', dealId)
    .single()

  let finalValue = null
  if (deal && avgDrc && actualWeight > 0) {
    // Giá trị thực = trọng lượng thực × DRC thực × đơn giá
    finalValue = Math.round(actualWeight * (avgDrc / 100) * (deal.unit_price || 0))
  }

  // 5. Tổng hợp QC status
  let qcStatus = 'pending'
  if (qcSummary.failed > 0) qcStatus = 'failed'
  else if (qcSummary.warning > 0) qcStatus = 'warning'
  else if (qcSummary.passed > 0 && qcSummary.pending === 0) qcStatus = 'passed'

  // 6. Update deal
  await supabase
    .from('b2b_deals')
    .update({
      actual_drc: avgDrc,
      actual_weight_kg: actualWeight,
      final_value: finalValue,
      qc_status: qcStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)

  return { actual_drc: avgDrc, actual_weight_kg: actualWeight, final_value: finalValue, qc_status: qcStatus }
}
```

---

## 5. SUB-PHASE 4.2: STOCK-IN ↔ DEAL

### 5.1 Sửa StockInCreatePage — Thêm chọn Deal

**Vị trí:** Step 1 của wizard (chọn kho + source type)

**Khi `source_type = 'purchase'`** → Hiện thêm dropdown **"Chọn Deal B2B"**

```tsx
// Thêm vào Step 1 form
{sourceType === 'purchase' && (
  <Form.Item name="deal_id" label="Deal B2B (nếu có)">
    <Select
      showSearch
      allowClear
      placeholder="Chọn Deal để liên kết"
      optionFilterProp="label"
      loading={loadingDeals}
      options={activeDeals.map(d => ({
        value: d.id,
        label: `${d.deal_number} — ${d.partner_name} — ${d.product_name} — Còn ${(d.remaining_kg / 1000).toFixed(1)} tấn`,
      }))}
      size="large"
    />
  </Form.Item>
)}
```

**UI khi đã chọn Deal:**

```tsx
// Hiện Deal summary card (Ant Design Card)
{selectedDeal && (
  <Card size="small" style={{ marginBottom: 16, background: '#f0f5ff' }}>
    <Row gutter={16}>
      <Col span={6}>
        <Text type="secondary">Deal</Text><br />
        <Text strong>{selectedDeal.deal_number}</Text>
      </Col>
      <Col span={6}>
        <Text type="secondary">Đại lý</Text><br />
        <Text>{selectedDeal.partner_name}</Text>
      </Col>
      <Col span={6}>
        <Text type="secondary">SL theo Deal</Text><br />
        <Text>{(selectedDeal.quantity_kg / 1000).toFixed(1)} tấn</Text>
      </Col>
      <Col span={6}>
        <Text type="secondary">Còn lại</Text><br />
        <Text strong style={{ color: '#1890ff' }}>
          {(selectedDeal.remaining_kg / 1000).toFixed(1)} tấn
        </Text>
      </Col>
    </Row>
  </Card>
)}
```

### 5.2 Sửa stockInService.create — Nhận `deal_id`

```typescript
// Thêm deal_id vào StockInFormData
export interface StockInFormData {
  type: 'raw' | 'finished'
  warehouse_id: string
  source_type: StockInSourceType
  production_order_id?: string
  deal_id?: string               // ← MỚI
  notes?: string
}

// Trong create():
const { data, error } = await supabase
  .from('stock_in_orders')
  .insert({
    code,
    type: data.type,
    warehouse_id: data.warehouse_id,
    source_type: data.source_type,
    deal_id: data.deal_id || null,    // ← MỚI
    notes: data.notes,
    status: 'draft',
    created_by: createdBy,
  })
  .select('*')
  .single()
```

### 5.3 Sửa stockInService.confirmStockIn — Cập nhật Deal

```typescript
// Sau khi confirm thành công, nếu có deal_id → update deal totals
async confirmStockIn(stockInId: string, confirmedBy: string) {
  // ... existing logic ...

  // MỚI: Nếu có deal_id → cập nhật deal
  if (order.deal_id) {
    await dealWmsService.updateDealStockInTotals(order.deal_id)
  }

  return order
}
```

### 5.4 Sửa StockInListPage — Hiện Deal info

```tsx
// Thêm cột Deal vào Table (Ant Design Table)
{
  title: 'Deal',
  dataIndex: 'deal',
  key: 'deal',
  render: (deal: any) => deal ? (
    <Tag color="blue" style={{ cursor: 'pointer' }}
      onClick={() => navigate(`/b2b/deals/${deal.id}`)}>
      {deal.deal_number}
    </Tag>
  ) : <Text type="secondary">—</Text>,
}
```

### 5.5 Sửa StockInDetailPage — Hiện Deal card

```tsx
// Thêm section Deal info ở đầu trang
{order.deal && (
  <Card title="Deal B2B liên kết" size="small" style={{ marginBottom: 16 }}>
    <Descriptions column={3} size="small">
      <Descriptions.Item label="Mã Deal">{order.deal.deal_number}</Descriptions.Item>
      <Descriptions.Item label="Đại lý">{order.deal.partner_name}</Descriptions.Item>
      <Descriptions.Item label="Sản phẩm">{order.deal.product_name}</Descriptions.Item>
      <Descriptions.Item label="SL Deal">{order.deal.quantity_kg / 1000} tấn</Descriptions.Item>
      <Descriptions.Item label="DRC dự kiến">{order.deal.expected_drc}%</Descriptions.Item>
      <Descriptions.Item label="Đơn giá">{formatCurrency(order.deal.unit_price)} đ/kg</Descriptions.Item>
    </Descriptions>
    <Button type="link" onClick={() => navigate(`/b2b/deals/${order.deal.id}`)}>
      Xem Deal →
    </Button>
  </Card>
)}
```

---

## 6. SUB-PHASE 4.3: WEIGHBRIDGE ↔ DEAL

### 6.1 Liên kết gián tiếp

Weighbridge đã có `reference_type` + `reference_id` link tới `stock_in_orders`.
Sau khi Stock-In có `deal_id`, query Deal → Stock-In → Weighbridge.

```typescript
// Trong dealWmsService
async getWeighbridgeByDeal(dealId: string): Promise<DealWeighbridgeSummary[]> {
  // Lấy stock_in_ids thuộc deal
  const { data: stockIns } = await supabase
    .from('stock_in_orders')
    .select('id')
    .eq('deal_id', dealId)

  const stockInIds = (stockIns || []).map(s => s.id)
  if (stockInIds.length === 0) return []

  // Lấy weighbridge tickets linked tới các stock-in này
  const { data: tickets } = await supabase
    .from('weighbridge_tickets')
    .select('id, code, vehicle_plate, net_weight, status, completed_at')
    .eq('reference_type', 'stock_in')
    .in('reference_id', stockInIds)
    .order('created_at', { ascending: false })

  return (tickets || []).map(t => ({
    ticket_id: t.id,
    code: t.code,
    vehicle_plate: t.vehicle_plate,
    net_weight: t.net_weight,
    status: t.status,
    completed_at: t.completed_at,
  }))
}
```

### 6.2 Sửa WeighbridgeListPage — Filter by Deal (optional)

```tsx
// Thêm filter dropdown Deal (Ant Design Select)
<Select
  allowClear
  placeholder="Lọc theo Deal"
  style={{ width: 200 }}
  options={deals.map(d => ({ value: d.id, label: d.deal_number }))}
  onChange={(dealId) => setFilterDealId(dealId)}
/>
```

---

## 7. SUB-PHASE 4.4: QC → DEAL (actual_drc)

### 7.1 Trigger sau QC Recheck

Khi QC nhập DRC mới cho 1 batch → kiểm tra batch có thuộc Deal nào không → cập nhật Deal.

**Sửa QCRecheckPage — Sau khi submit QC result:**

```typescript
const handleSubmitRecheck = async () => {
  // ... existing QC submit logic ...

  // MỚI: Cập nhật Deal nếu batch thuộc Deal
  try {
    // Tìm stock_in_detail chứa batch này
    const { data: detail } = await supabase
      .from('stock_in_details')
      .select('stock_in_id')
      .eq('batch_id', batchId)
      .maybeSingle()

    if (detail?.stock_in_id) {
      const { data: stockIn } = await supabase
        .from('stock_in_orders')
        .select('deal_id')
        .eq('id', detail.stock_in_id)
        .maybeSingle()

      if (stockIn?.deal_id) {
        await dealWmsService.updateDealActualDrc(stockIn.deal_id)
      }
    }
  } catch (err) {
    console.error('Update deal DRC failed:', err)
    // Non-blocking: QC vẫn thành công
  }
}
```

### 7.2 UI hiển thị so sánh DRC

```tsx
// Trong DealDetailPage — So sánh DRC dự kiến vs thực tế
<Card title="DRC Tracking" size="small">
  <Row gutter={24}>
    <Col span={8}>
      <Statistic
        title="DRC dự kiến"
        value={deal.expected_drc}
        suffix="%"
        valueStyle={{ color: '#666' }}
      />
    </Col>
    <Col span={8}>
      <Statistic
        title="DRC thực tế (QC)"
        value={deal.actual_drc || '—'}
        suffix={deal.actual_drc ? '%' : ''}
        valueStyle={{
          color: deal.actual_drc
            ? (deal.actual_drc >= deal.expected_drc ? '#52c41a' : '#cf1322')
            : '#999'
        }}
      />
    </Col>
    <Col span={8}>
      <Statistic
        title="Chênh lệch"
        value={deal.actual_drc
          ? `${(deal.actual_drc - deal.expected_drc).toFixed(1)}%`
          : '—'}
        valueStyle={{
          color: deal.actual_drc && deal.actual_drc >= deal.expected_drc
            ? '#52c41a' : '#cf1322'
        }}
      />
    </Col>
  </Row>
</Card>
```

---

## 8. SUB-PHASE 4.5: DEALDETAILPAGE NÂNG CẤP

### 8.1 Thêm Tabs (Ant Design Tabs)

```tsx
<Tabs defaultActiveKey="info" items={[
  {
    key: 'info',
    label: 'Thông tin Deal',
    children: <DealInfoTab deal={deal} />,
  },
  {
    key: 'advances',
    label: `Tạm ứng (${advances.length})`,
    children: <DealAdvancesTab dealId={deal.id} partnerId={deal.partner_id} />,
  },
  {
    key: 'wms',
    label: `Nhập kho (${wmsOverview.stock_in_count})`,
    children: <DealWmsTab dealId={deal.id} />,
  },
  {
    key: 'qc',
    label: (
      <Space>
        QC
        <Badge status={qcBadgeStatus} />
      </Space>
    ),
    children: <DealQcTab dealId={deal.id} />,
  },
]} />
```

### 8.2 Tab "Nhập kho" — DealWmsTab

```tsx
// Component: src/components/b2b/DealWmsTab.tsx

const DealWmsTab = ({ dealId }: { dealId: string }) => {
  const [stockIns, setStockIns] = useState<DealStockInSummary[]>([])
  const [weighbridges, setWeighbridges] = useState<DealWeighbridgeSummary[]>([])
  const [overview, setOverview] = useState<DealWmsOverview | null>(null)

  // Load data via dealWmsService

  return (
    <div>
      {/* Tổng quan */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Statistic title="Phiếu nhập" value={overview?.stock_in_count || 0} />
        </Col>
        <Col span={6}>
          <Statistic title="Đã nhận" value={`${((overview?.total_received_kg || 0) / 1000).toFixed(1)} tấn`} />
        </Col>
        <Col span={6}>
          <Statistic title="Batches" value={overview?.batch_count || 0} />
        </Col>
        <Col span={6}>
          <Statistic title="Phiếu cân" value={overview?.weighbridge_count || 0} />
        </Col>
      </Row>

      {/* Danh sách phiếu nhập kho */}
      <Table
        dataSource={stockIns}
        columns={[
          { title: 'Mã phiếu', dataIndex: 'code', render: (code, r) => <a onClick={() => navigate(`/wms/stock-in/${r.stock_in_id}`)}>{code}</a> },
          { title: 'Kho', dataIndex: 'warehouse_name' },
          { title: 'SL (kg)', dataIndex: 'total_weight', render: (v) => formatCurrency(v) },
          { title: 'Trạng thái', dataIndex: 'status', render: (s) => <Tag>{s}</Tag> },
          { title: 'Ngày xác nhận', dataIndex: 'confirmed_at', render: (d) => d ? formatDate(d) : '—' },
        ]}
        size="small"
        pagination={false}
      />

      {/* Danh sách phiếu cân */}
      <Divider>Phiếu cân xe</Divider>
      <Table
        dataSource={weighbridges}
        columns={[
          { title: 'Mã cân', dataIndex: 'code' },
          { title: 'Biển số', dataIndex: 'vehicle_plate' },
          { title: 'Tịnh (kg)', dataIndex: 'net_weight', render: (v) => v ? formatCurrency(v) : '—' },
          { title: 'Trạng thái', dataIndex: 'status', render: (s) => <Tag>{s}</Tag> },
        ]}
        size="small"
        pagination={false}
      />
    </div>
  )
}
```

### 8.3 Tab "QC" — DealQcTab

```tsx
// Component: src/components/b2b/DealQcTab.tsx

const DealQcTab = ({ dealId }: { dealId: string }) => {
  const [batches, setBatches] = useState<DealBatchSummary[]>([])

  return (
    <div>
      {/* DRC so sánh card (expected vs actual) */}
      <DrcComparisonCard deal={deal} />

      {/* Danh sách batches */}
      <Table
        dataSource={batches}
        columns={[
          { title: 'Batch', dataIndex: 'batch_no' },
          { title: 'Vật liệu', dataIndex: 'material_name' },
          { title: 'DRC ban đầu', dataIndex: 'initial_drc', render: (v) => v ? `${v}%` : '—' },
          { title: 'DRC hiện tại', dataIndex: 'latest_drc', render: (v) => v ? `${v}%` : '—' },
          {
            title: 'QC Status',
            dataIndex: 'qc_status',
            render: (s) => {
              const colors = { passed: 'green', warning: 'orange', failed: 'red', pending: 'default' }
              const labels = { passed: 'Đạt', warning: 'Cảnh báo', failed: 'Không đạt', pending: 'Chờ' }
              return <Tag color={colors[s]}>{labels[s]}</Tag>
            },
          },
          { title: 'SL còn', dataIndex: 'quantity_remaining', render: (v) => formatCurrency(v) },
          {
            title: '',
            render: (_, r) => (
              <Button size="small" type="link"
                onClick={() => navigate(`/wms/qc/batch/${r.batch_id}`)}>
                Lịch sử QC
              </Button>
            ),
          },
        ]}
        size="small"
        pagination={false}
      />
    </div>
  )
}
```

### 8.4 Tab "Tạm ứng" — DealAdvancesTab

```tsx
// Component: src/components/b2b/DealAdvancesTab.tsx
// Hiển thị danh sách advances từ advanceService.getAdvancesByDeal(dealId)

const DealAdvancesTab = ({ dealId, partnerId }: { dealId: string; partnerId: string }) => {
  const [advances, setAdvances] = useState<Advance[]>([])

  return (
    <div>
      {/* Tổng hợp tài chính */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Statistic title="Giá trị Deal" value={formatCurrency(deal.total_value_vnd)} suffix="VNĐ" />
        </Col>
        <Col span={8}>
          <Statistic title="Đã tạm ứng" value={formatCurrency(deal.total_advanced)} suffix="VNĐ"
            valueStyle={{ color: '#52c41a' }} />
        </Col>
        <Col span={8}>
          <Statistic title="Còn nợ" value={formatCurrency(deal.balance_due)} suffix="VNĐ"
            valueStyle={{ color: '#cf1322' }} />
        </Col>
      </Row>

      {/* Table advances */}
      <Table
        dataSource={advances}
        columns={[
          { title: 'Mã phiếu', dataIndex: 'advance_number' },
          { title: 'Số tiền', dataIndex: 'amount', render: (v) => `${formatCurrency(v)} VNĐ` },
          { title: 'Hình thức', dataIndex: 'payment_method' },
          { title: 'Ngày chi', dataIndex: 'paid_at', render: (d) => d ? formatDate(d) : '—' },
          { title: 'Status', dataIndex: 'status', render: (s) => <Tag>{s}</Tag> },
        ]}
        size="small"
        pagination={false}
      />
    </div>
  )
}
```

---

## 9. SUB-PHASE 4.6: CHAT NOTIFICATION

### 9.1 Gửi message vào chat khi nhập kho confirm

```typescript
// Trong stockInService.confirmStockIn() hoặc dealWmsService

async notifyDealChatStockIn(dealId: string, stockInCode: string, totalWeight: number) {
  // Tìm room_id từ deal → partner → chat_room
  const { data: deal } = await supabase
    .from('b2b_deals')
    .select('partner_id, deal_number')
    .eq('id', dealId)
    .single()

  if (!deal) return

  const { data: room } = await supabase
    .from('b2b_chat_rooms')
    .select('id')
    .eq('partner_id', deal.partner_id)
    .eq('room_type', 'general')
    .maybeSingle()

  if (!room) return

  await supabase
    .from('b2b_chat_messages')
    .insert({
      room_id: room.id,
      sender_type: 'system',
      sender_id: 'system',
      message_type: 'system',
      content: `📥 Đã nhập kho ${(totalWeight / 1000).toFixed(1)} tấn cho Deal ${deal.deal_number} (${stockInCode})`,
      metadata: {
        notification_type: 'stock_in_confirmed',
        deal_id: dealId,
        stock_in_code: stockInCode,
        total_weight: totalWeight,
      },
      attachments: [],
    })

  await supabase
    .from('b2b_chat_rooms')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', room.id)
}
```

### 9.2 Gửi message khi QC hoàn thành

```typescript
async notifyDealChatQcUpdate(dealId: string, actualDrc: number, qcStatus: string) {
  // Tương tự trên, gửi message:
  // "🧪 QC hoàn thành — Deal DL2603-XXXX: DRC thực tế = 31.5%, Trạng thái: Đạt"
}
```

---

## 10. FILES TẠO/SỬA

### 10.1 Tạo mới

| File | Sub-phase | Mô tả |
|------|-----------|-------|
| `src/services/b2b/dealWmsService.ts` | 4.1 | Bridge service Deal ↔ WMS |
| `src/components/b2b/DealWmsTab.tsx` | 4.5 | Tab nhập kho trong DealDetail |
| `src/components/b2b/DealQcTab.tsx` | 4.5 | Tab QC trong DealDetail |
| `src/components/b2b/DealAdvancesTab.tsx` | 4.5 | Tab tạm ứng trong DealDetail |

### 10.2 Sửa

| File | Sub-phase | Thay đổi |
|------|-----------|----------|
| `src/services/wms/stockInService.ts` | 4.2 | Thêm `deal_id` vào create + confirmStockIn trigger |
| `src/services/wms/wms.types.ts` | 4.2 | Thêm `deal_id` vào StockInOrder, StockInFormData |
| `src/pages/wms/stock-in/StockInCreatePage.tsx` | 4.2 | Dropdown chọn Deal khi source_type='purchase' |
| `src/pages/wms/stock-in/StockInListPage.tsx` | 4.2 | Cột Deal trong table |
| `src/pages/wms/stock-in/StockInDetailPage.tsx` | 4.2 | Card deal info |
| `src/pages/wms/qc/QCRecheckPage.tsx` | 4.4 | Trigger updateDealActualDrc sau QC |
| `src/pages/b2b/deals/DealDetailPage.tsx` | 4.5 | Tabs: Info + Tạm ứng + Nhập kho + QC |
| `src/services/b2b/dealService.ts` | 4.1 | Thêm fields actual_drc, actual_weight, final_value |

---

## 11. CHECKLIST TRIỂN KHAI

### Sub-phase 4.1: Database + Service
- [ ] Chạy SQL migration (thêm deal_id, actual_drc, actual_weight_kg, final_value, qc_status)
- [ ] Tạo `dealWmsService.ts` với tất cả methods
- [ ] Test queries: getStockInsByDeal, getBatchesByDeal, getActiveDealsForStockIn

### Sub-phase 4.2: Stock-In ↔ Deal
- [ ] Sửa `wms.types.ts` — thêm `deal_id` vào StockInOrder + StockInFormData
- [ ] Sửa `stockInService.create()` — nhận deal_id
- [ ] Sửa `stockInService.confirmStockIn()` — trigger updateDealStockInTotals
- [ ] Sửa `StockInCreatePage.tsx` — dropdown chọn Deal khi source_type='purchase'
- [ ] Sửa `StockInListPage.tsx` — cột Deal trong table
- [ ] Sửa `StockInDetailPage.tsx` — card deal info

### Sub-phase 4.3: Weighbridge ↔ Deal
- [ ] Implement `getWeighbridgeByDeal()` trong dealWmsService
- [ ] (Optional) Sửa WeighbridgeListPage — filter by Deal

### Sub-phase 4.4: QC → Deal
- [ ] Sửa `QCRecheckPage.tsx` — trigger updateDealActualDrc sau submit
- [ ] Test: QC submit → Deal.actual_drc cập nhật → final_value tính đúng

### Sub-phase 4.5: DealDetailPage nâng cấp
- [ ] Tạo `DealWmsTab.tsx` — table stock-in + weighbridge
- [ ] Tạo `DealQcTab.tsx` — DRC comparison + batches table
- [ ] Tạo `DealAdvancesTab.tsx` — advances table + tài chính tổng hợp
- [ ] Sửa `DealDetailPage.tsx` — thêm Tabs layout

### Sub-phase 4.6: Chat notification
- [ ] Implement notifyDealChatStockIn trong dealWmsService
- [ ] Implement notifyDealChatQcUpdate trong dealWmsService
- [ ] Test: confirm stock-in → chat message xuất hiện

### Test end-to-end
- [ ] Tạo Deal từ chat → chọn Deal trong Stock-In Create → confirm
- [ ] Cân xe (weighbridge) liên kết đúng
- [ ] QC recheck → actual_drc cập nhật về Deal
- [ ] DealDetailPage hiện đầy đủ 3 tabs
- [ ] Chat nhận thông báo nhập kho + QC

---

*Phase 4 Spec v1.0*
*Huy Anh Rubber ERP v8 — B2B × WMS Integration*
*16/03/2026*
