# B2B Portal Sync — Thay đổi phía ERP cần đồng bộ

> **Ngày:** 03/04/2026
> **ERP version:** Commit `adadf4a` (latest)
> **Mục đích:** Brief cho team Portal đại lý (b2b.huyanhrubber.vn) về tất cả thay đổi phía ERP
> **Ưu tiên:** Cần đồng bộ trước khi release

---

## 1. THAY ĐỔI DATABASE (ĐÃ APPLY)

### 1.1 Bảng `b2b_demand_offers` — Thêm cột Lô

```sql
ALTER TABLE b2b_demand_offers
  ADD COLUMN lot_code VARCHAR(50),        -- Mã lô: "LL-A-0401"
  ADD COLUMN lot_description TEXT,         -- Mô tả: "Mủ đông vườn Bình Phước"
  ADD COLUMN lot_drc NUMERIC(5,2),         -- DRC riêng lô (%)
  ADD COLUMN lot_source VARCHAR(200);      -- Nguồn gốc: "Vườn A, Bình Phước"
```

**Impact Portal:** Form gửi chào giá cần thêm 4 field này.

### 1.2 Bảng `b2b.deals` (schema b2b) — Thêm cột Lô + Lý lịch mủ

```sql
ALTER TABLE b2b.deals
  ADD COLUMN lot_code VARCHAR(50),
  ADD COLUMN lot_description TEXT,
  ADD COLUMN rubber_intake_id UUID;
-- View public.b2b_deals đã cập nhật include 3 cột mới
```

**Impact Portal:** Trang xem Deal hiện thêm mã lô + link lý lịch mủ.

### 1.3 Bảng `rubber_intake_batches` — Thêm liên kết B2B

```sql
ALTER TABLE rubber_intake_batches
  ADD COLUMN deal_id UUID,
  ADD COLUMN b2b_partner_id UUID,
  ADD COLUMN lot_code VARCHAR(50),
  ADD COLUMN stock_in_id UUID;
```

**Impact Portal:** Trang lý lịch mủ cho đại lý xem.

### 1.4 Bảng `stock_batches` — Thêm truy xuất nguồn gốc

```sql
ALTER TABLE stock_batches
  ADD COLUMN source_lot_code VARCHAR(50),
  ADD COLUMN rubber_intake_id UUID;
```

**Impact Portal:** Không trực tiếp, nhưng đại lý có thể xem QC batch liên kết.

---

## 2. THAY ĐỔI BOOKING (PHIẾU CHỐT MỦ)

### 2.1 BookingMetadata — Thêm `lot_code`

**Interface mới:**
```typescript
interface BookingMetadata {
  code: string                    // Auto-gen: "NCM-20260403-XXXX"
  product_type: 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to'
  quantity_tons: number
  drc_percent: number
  price_per_kg: number
  price_unit: 'wet' | 'dry'
  estimated_value: number
  pickup_location?: string
  delivery_date: string           // "YYYY-MM-DD"
  lot_code?: string               // ★ MỚI: Mã lô, VD: "LL-A-0401"
  notes?: string
  status: 'pending' | 'confirmed' | 'negotiating' | 'rejected'
  counter_price?: number
  negotiation_notes?: string
}
```

**Cần đồng bộ Portal:**
- Form gửi phiếu chốt mủ thêm field **Mã lô** (optional)
- Hiện mã lô trên BookingCard khi hiển thị phiếu

### 2.2 Giao diện Phiếu chốt mủ (ERP)

```
┌────────────────────────────────────────────────────────┐
│ 📋 Phiếu chốt mủ                    Huy Anh B2B       │
│ Mã: NCM-20260403-A1B2                                 │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Loại mủ:     [Mủ đông          ▼]                     │
│ Số lượng:    [20         ] tấn                        │
│ DRC:         [55         ] %                          │
│ Giá:         [33,000     ] đ/kg                       │
│ Đơn vị giá:  ○ Giá tươi  ● Giá khô                   │
│                                                        │
│ Địa điểm:    [Quốc lộ 1A, Phong Điền      ▼]         │
│ Ngày giao:   [15/04/2026]                              │
│                                                        │
│ Mã lô:       [LL-A-0401     ]  (tùy chọn)  ★ MỚI     │
│                                                        │
│ Ghi chú:     [Mủ đông vườn Bình Phước          ]     │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Giá trị ước tính: 660,000,000 đ                  │  │
│ │ = 20T × 33,000 đ/kg                              │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│                              [Gửi phiếu chốt mủ]      │
└────────────────────────────────────────────────────────┘
```

### 2.3 BookingCard hiển thị trong chat

```
┌─────────────────────────────────────────┐
│ 📋 Phiếu chốt mủ  NCM-20260403-A1B2   │
│ ────────────────────────────────────    │
│ Mủ đông  |  20 tấn  |  DRC 55%        │
│ Giá: 33,000 đ/kg (tươi)               │
│ Lô: LL-A-0401                ★ MỚI    │
│ Giao: 15/04/2026                       │
│ Địa điểm: QL1A, Phong Điền            │
│ ────────────────────────────────────    │
│ Giá trị: 660,000,000 đ                │
│                                         │
│ Trạng thái: ⏳ Chờ xác nhận            │
│ [✅ Xác nhận] [💬 Thương lượng] [❌]   │
└─────────────────────────────────────────┘
```

**Portal cần:**
- Hiện `lot_code` trên BookingCard nếu có
- Form gửi phiếu cho phép nhập mã lô

---

## 3. THAY ĐỔI CHÀO GIÁ (DEMAND OFFERS)

### 3.1 Multi-lot — 1 đại lý gửi nhiều báo giá

**Trước:** 1 đại lý → 1 nhu cầu → 1 offer
**Sau:** 1 đại lý → 1 nhu cầu → **nhiều offer** (mỗi lô 1 offer)

**DB đã sẵn sàng:** Không có unique `(demand_id, partner_id)` → nhiều offer OK.

**Portal cần:**
```
┌───────────────────────────────────────────────────┐
│ 📋 Gửi báo giá: NCM-20260401-001                 │
│ "Cần 50 tấn SVR10, DRC 50-65%, giá 30-36k/kg"   │
│                                                   │
│ ┌── Lô 1 ─────────────────────────────────── ✕ ┐ │
│ │ Mã lô:      [LL-P-0401      ]               │ │
│ │ Mô tả:      [Mủ đông vườn Bình Phước   ]    │ │
│ │ Số lượng:   [20,000    ] kg                  │ │
│ │ DRC:        [55    ] %                       │ │
│ │ Giá:        [33,000    ] đ/kg                │ │
│ │ Nguồn gốc:  [Vườn A, Bình Phước     ]       │ │
│ │ Ngày giao:  [15/04/2026]                     │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ ┌── Lô 2 ─────────────────────────────────── ✕ ┐ │
│ │ Mã lô:      [LL-P-0402      ]               │ │
│ │ Mô tả:      [Mủ nước vườn Đồng Nai     ]    │ │
│ │ Số lượng:   [15,000    ] kg                  │ │
│ │ DRC:        [62    ] %                       │ │
│ │ Giá:        [36,000    ] đ/kg                │ │
│ │ Nguồn gốc:  [Vườn B, Đồng Nai       ]       │ │
│ │ Ngày giao:  [20/04/2026]                     │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ [+ Thêm lô khác]                                 │
│                                                   │
│ Tổng: 2 lô | 35 tấn | Giá TB: 34,286 đ/kg       │
│                                                   │
│                    [Gửi báo giá]                  │
└───────────────────────────────────────────────────┘
```

### 3.2 API gửi offer — Mỗi lô 1 INSERT

```typescript
// Portal gọi cho MỖI LÔ:
await supabase.from('b2b_demand_offers').insert({
  demand_id: demandId,
  partner_id: partnerId,
  offered_quantity_kg: 20000,
  offered_price: 33000,
  offered_drc: 55,
  offered_delivery_date: '2026-04-15',
  rubber_type: 'mu_dong',
  source_region: 'Bình Phước',
  // ★ MỚI: Lot fields
  lot_code: 'LL-P-0401',
  lot_description: 'Mủ đông vườn Bình Phước',
  lot_drc: 55,
  lot_source: 'Vườn A, Bình Phước',
  status: 'pending',
})
```

### 3.3 Khi ERP chấp nhận lô → Tự động tạo

```
ERP acceptOffer(offerId):
  1. Deal (lot_code, lot_description, source_region, expected_drc)
  2. Lý lịch mủ (rubber_intake_batch: deal_id, partner_id, lot_code, DRC)
  3. Link: deal.rubber_intake_id = intake.id
  4. Cập nhật demand.quantity_filled_kg
```

**Portal cần xử lý notification:**
- Offer accepted → hiện "Lô LL-P-0401 đã được chấp nhận! Deal DL2604-XXXX"
- Offer rejected → hiện "Lô LL-P-0402 bị từ chối. Lý do: ..."

---

## 4. THAY ĐỔI DEAL

### 4.1 Deal có thêm fields

```typescript
interface Deal {
  // ...existing fields...
  lot_code: string | null           // ★ MỚI
  lot_description: string | null    // ★ MỚI
  rubber_intake_id: string | null   // ★ MỚI
}
```

### 4.2 DealCard trong chat — Thêm lot_code

```typescript
interface DealCardMetadata {
  deal_id: string
  deal_number: string
  status: string
  booking_code?: string
  product_type: string
  quantity_kg: number
  expected_drc: number
  agreed_price: number
  price_unit: 'wet' | 'dry'
  estimated_value: number
  pickup_location?: string
  total_advanced: number
  balance_due: number
  lot_code?: string              // ★ MỚI (Portal hiện trên DealCard)
}
```

**Portal cần:** Hiện `lot_code` trên DealCard nếu có.

---

## 5. TRANG LÝ LỊCH MỦ CHO ĐẠI LÝ

### 5.1 Dữ liệu có sẵn

Portal có thể query `rubber_intake_batches` WHERE `b2b_partner_id = currentPartnerId`:

```typescript
const { data } = await supabase
  .from('rubber_intake_batches')
  .select('*, deal:b2b_deals(deal_number, status)')
  .eq('b2b_partner_id', partnerId)
  .order('intake_date', { ascending: false })
```

### 5.2 Giao diện đề xuất cho Portal

```
┌───────────────────────────────────────────────────────┐
│ 📦 Lý lịch mủ của bạn                                │
├───────────────────────────────────────────────────────┤
│                                                       │
│ ┌─────────────────────────────────────────────────┐  │
│ │ LL-P-0401  |  Mủ đông  |  Vườn A, Bình Phước    │  │
│ │ Deal: DL2604-0012  |  Giao: 15/04              │  │
│ │ KL: 20,000 kg  |  DRC gốc: 55%                │  │
│ │ Trạng thái: ✅ Đã xác nhận                      │  │
│ │                                                 │  │
│ │ ── Nhập kho ──                                  │  │
│ │ Phiếu: SI-260415-001  |  DRC thực tế: 54%      │  │
│ │ QC: ✅ Passed  |  Batch: NVL-MU-260415-001      │  │
│ │                                                 │  │
│ │ ── Thanh toán ──                                │  │
│ │ Tổng: 660,000,000 đ                            │  │
│ │ Tạm ứng: 200,000,000 đ                         │  │
│ │ Đã trả: 460,000,000 đ                          │  │
│ │ Còn nợ: 0 đ  ✅                                 │  │
│ │ ████████████████████████████████████ 100%        │  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│ ┌─────────────────────────────────────────────────┐  │
│ │ LL-P-0402  |  Mủ nước  |  Vườn B, Đồng Nai      │  │
│ │ Deal: DL2604-0013  |  Giao: 20/04              │  │
│ │ KL: 15,000 kg  |  DRC gốc: 62%                │  │
│ │ Trạng thái: ⏳ Chờ giao hàng                    │  │
│ └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

---

## 6. CHAT SPLIT-SCREEN (THAY ĐỔI UX)

### 6.1 ERP đã chuyển sang split-screen

```
Desktop:
┌──────────────┬────────────────────────────────┐
│  Room List   │     Chat Room                  │
│  (340px)     │     (messages + input)          │
│              │                                │
│  ● Đại lý A │     Chuyển room không mất list  │
│  ● Đại lý B │     Back = quay về list         │
│  ● Đại lý C │                                │
└──────────────┴────────────────────────────────┘

Mobile:
  List ⇄ Room (full-page, toggle)
```

**Portal cần xem xét:** Có nên áp dụng split-screen cho Portal không? Đại lý thường chỉ chat với 1 nhà máy nên có thể giữ full-page.

### 6.2 B2BChatRoomPage props mới

```typescript
// Component giờ nhận props (cho embedded mode):
interface B2BChatRoomPageProps {
  embedded?: boolean     // true = nằm trong split-screen
  onBack?: () => void    // callback thay vì navigate
  roomIdProp?: string    // roomId từ parent (thay vì useParams)
}
```

**Portal không ảnh hưởng** — Portal dùng standalone mode (không embedded).

---

## 7. NOTIFICATION CHAT TỰ ĐỘNG

### 7.1 System messages gửi vào chat

ERP tự động gửi tin nhắn `message_type: 'system'` vào chat room khi:

| Sự kiện | Nội dung | metadata.notification_type |
|---------|---------|--------------------------|
| Nhập kho xong | "Đã nhập kho {X} tấn cho Deal {number}" | `stock_in_confirmed` |
| QC hoàn thành | "QC hoàn thành — DRC = {X}%, Trạng thái: Đạt" | `qc_completed` |
| Tạo quyết toán | "Đã tạo phiếu quyết toán {code}, giá trị: {X} VNĐ" | `settlement_update` |
| Duyệt quyết toán | "Phiếu quyết toán {code} đã được duyệt" | `settlement_update` |
| Thanh toán | "Đã thanh toán quyết toán {code}, số tiền: {X} VNĐ" | `settlement_update` |
| Chi tạm ứng | "Đã chi tạm ứng {number} số tiền {X} VNĐ" | `advance_paid` |

**Portal cần:** Hiện các tin nhắn system này với UI khác biệt (không phải bubble chat thường).

### 7.2 Room lookup cải thiện

ERP giờ tìm room theo thứ tự: `deal` room → `general` room (trước đây chỉ tìm `general`).

---

## 8. IDEMPOTENCY — TRÁNH DUPLICATE

### 8.1 Accept Offer

ERP giờ check trước khi accept:
```typescript
if (offer.status === 'accepted') throw 'Đã chấp nhận trước đó'
if (offer.deal_id) throw 'Đã có Deal liên kết'
```

**Portal cần:** Disable nút "Rút chào giá" khi offer đã accepted.

### 8.2 Confirm Booking

ERP check:
```typescript
if (booking.status === 'confirmed') throw 'Đã xác nhận'
if (existingDeal with booking_id) throw 'Đã có Deal'
```

**Portal cần:** Hiện "Đã xác nhận" thay vì nút action khi booking confirmed.

---

## 9. DANH SÁCH THAY ĐỔI CHO PORTAL

### Ưu tiên cao (cần sync ngay)

| # | Thay đổi | Trang Portal |
|---|---------|-------------|
| 1 | Booking form thêm `lot_code` | Form gửi phiếu chốt mủ |
| 2 | BookingCard hiện `lot_code` | Chat — hiển thị phiếu |
| 3 | Multi-lot offer form | Trang chào giá nhu cầu |
| 4 | Offer hiện lot_code, lot_drc, lot_source | Lịch sử chào giá |
| 5 | DealCard hiện `lot_code` | Chat — hiển thị Deal |
| 6 | System messages UI | Chat — tin nhắn hệ thống |

### Ưu tiên trung bình (trang mới)

| # | Thay đổi | Trang Portal |
|---|---------|-------------|
| 7 | Trang Lý lịch mủ cho đại lý | `/rubber-intake` (mới) |
| 8 | Notification khi lô accepted/rejected | Thông báo |
| 9 | Notification khi nhập kho/QC/thanh toán | Thông báo |

### Ưu tiên thấp (cải thiện UX)

| # | Thay đổi | Trang Portal |
|---|---------|-------------|
| 10 | Split-screen chat (optional) | Chat |
| 11 | Offer status disabled khi accepted | Chào giá |

---

## 10. API REFERENCE — SUPABASE TABLES

### Đọc (SELECT)

```typescript
// Nhu cầu đang mở
supabase.from('b2b_demands')
  .select('*')
  .eq('status', 'published')

// Lịch sử offer của đại lý
supabase.from('b2b_demand_offers')
  .select('*, demand:b2b_demands(code, product_name, quantity_kg)')
  .eq('partner_id', myPartnerId)

// Deal của đại lý
supabase.from('b2b_deals')
  .select('*')
  .eq('partner_id', myPartnerId)

// Lý lịch mủ
supabase.from('rubber_intake_batches')
  .select('*')
  .eq('b2b_partner_id', myPartnerId)

// Công nợ
supabase.from('b2b_partner_ledger')
  .select('*')
  .eq('partner_id', myPartnerId)
```

### Ghi (INSERT)

```typescript
// Gửi offer (mỗi lô 1 row)
supabase.from('b2b_demand_offers').insert({
  demand_id, partner_id,
  offered_quantity_kg, offered_price, offered_drc,
  offered_delivery_date, rubber_type, source_region,
  lot_code, lot_description, lot_drc, lot_source,  // ★ MỚI
  status: 'pending',
})

// Gửi booking message
supabase.from('b2b_chat_messages').insert({
  room_id, sender_type: 'partner', message_type: 'booking',
  content: 'Phiếu chốt mủ',
  metadata: { booking: { ...BookingMetadata, lot_code } },  // ★ MỚI
})
```

---

## 11. REALTIME SUBSCRIPTIONS

Portal nên subscribe để nhận cập nhật real-time:

```typescript
// Tin nhắn mới (bao gồm system messages)
supabase.channel('messages').on('postgres_changes', {
  event: 'INSERT', schema: 'public', table: 'b2b_chat_messages',
  filter: `room_id=eq.${roomId}`
}, callback)

// Offer status thay đổi
supabase.channel('offers').on('postgres_changes', {
  event: 'UPDATE', schema: 'public', table: 'b2b_demand_offers',
  filter: `partner_id=eq.${myPartnerId}`
}, callback)

// Deal status thay đổi
supabase.channel('deals').on('postgres_changes', {
  event: '*', schema: 'public', table: 'b2b_deals',
  filter: `partner_id=eq.${myPartnerId}`
}, callback)
```

---

> **Tài liệu đồng bộ ERP → Portal đại lý**
> Tất cả thay đổi DB đã apply production.
> Portal cần update UI + API calls theo tài liệu này.
>
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> Cập nhật: 03/04/2026
