# CONFIRM DEAL MODAL — Spec đồng bộ ERP ↔ B2B Portal

**Module:** B2B Chat → Deal Confirmation
**Version:** 1.0
**Ngày:** 16/03/2026
**Phạm vi:** ERP (nhà máy) + B2B Portal (đại lý)

---

## 1. TỔNG QUAN

### 1.1 Vấn đề hiện tại

Khi nhấn "Xác nhận" trên BookingCard trong chat, hệ thống **auto-tạo Deal ngầm** mà không qua modal nào. Điều này thiếu:
- Không cho phép **điều chỉnh thông tin** trước khi tạo Deal (giá thỏa thuận cuối, DRC, số lượng)
- Không có tùy chọn **tạm ứng ngay** tại thời điểm xác nhận
- Không ghi **sổ công nợ** (debt_ledger) khi tạm ứng
- Không có **DealCard** hiển thị trên chat sau khi tạo Deal

### 1.2 Mục tiêu

Thay thế auto-confirm bằng **ConfirmDealModal** — modal 2 phần:
1. **Xác nhận thông tin Deal** (cho phép điều chỉnh)
2. **Tạm ứng ngay** (tùy chọn)

Sau khi submit → tạo Deal + Advance + Debt Ledger + gửi DealCard trên chat.

---

## 2. CƠ CHẾ XÁC NHẬN — AI XÁC NHẬN AI?

### 2.1 Nguyên tắc: XÁC NHẬN 1 CHIỀU

```
Bên GỬI booking  →  Bên NHẬN có quyền: Xác nhận / Thương lượng / Từ chối
```

| Kịch bản | Bên gửi Booking | Bên xác nhận | Nơi hiện ConfirmDealModal |
|-----------|-----------------|--------------|---------------------------|
| A | Đại lý (Portal) | Nhà máy (ERP) | ERP - B2BChatRoomPage |
| B | Nhà máy (ERP) | Đại lý (Portal) | Portal - ChatRoomPage |

**KHÔNG cần xác nhận 2 chiều.** Bên gửi đã đồng ý khi gửi phiếu chốt. Bên nhận xác nhận = Deal được tạo.

### 2.2 Sau khi xác nhận

- **Cả 2 bên** đều thấy DealCard trên chat (realtime)
- **Cả 2 bên** đều thấy Deal trong danh sách `/b2b/deals`
- Booking gốc chuyển status → `confirmed`
- Deal mới có status → `processing`

### 2.3 Quyền trên DealCard

| Hành động | ERP (Nhà máy) | Portal (Đại lý) |
|-----------|--------------|-----------------|
| Xem chi tiết Deal | ✅ | ✅ |
| Ứng thêm | ✅ | ❌ (chỉ xem) |
| Ghi nhận giao hàng | ✅ | ✅ (báo đã giao) |
| Hủy Deal | ✅ (với lý do) | ❌ (yêu cầu qua chat) |

---

## 3. LUỒNG CHI TIẾT

### 3.1 Sequence Diagram

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│  Đại lý  │          │  Chat    │          │ Nhà máy  │
│ (Portal) │          │ (Server) │          │  (ERP)   │
└────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │
     │ 1. Gửi Booking      │                     │
     │ ──────────────────►  │                     │
     │                     │  2. Realtime push    │
     │                     │ ──────────────────►  │
     │                     │                     │
     │                     │  3. Click "Xác nhận" │
     │                     │                     │ ──► Mở ConfirmDealModal
     │                     │                     │
     │                     │  4. Submit Modal     │
     │                     │ ◄──────────────────  │
     │                     │                     │
     │                     │  ┌─────────────────┐ │
     │                     │  │ Backend xử lý:  │ │
     │                     │  │ a. Tạo Deal     │ │
     │                     │  │ b. Tạo Advance  │ │
     │                     │  │ c. Ghi Ledger   │ │
     │                     │  │ d. Update Booking│ │
     │                     │  │ e. Gửi DealCard │ │
     │                     │  └─────────────────┘ │
     │                     │                     │
     │  5. Realtime push   │                     │
     │ ◄──────────────────  │                     │
     │                     │                     │
     │  Thấy DealCard +   │                     │
     │  Booking confirmed  │                     │
     ▼                     ▼                     ▼
```

### 3.2 Chiều ngược (Nhà máy gửi, Đại lý xác nhận)

Luồng tương tự nhưng đảo vai trò. ConfirmDealModal hiển thị bên Portal.

---

## 4. UI SPEC — ConfirmDealModal

### 4.1 Khi nào hiện Modal?

- User click nút **"Xác nhận phiếu"** trên BookingCard
- Thay vì gọi `confirmBooking()` trực tiếp → mở `ConfirmDealModal`

### 4.2 Props Interface

```typescript
interface ConfirmDealModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (data: ConfirmDealFormData) => Promise<void>
  loading?: boolean

  // Dữ liệu từ Booking gốc
  booking: BookingMetadata
  bookingMessageId: string
  partnerId: string
  partnerName?: string
  roomId: string
}

interface ConfirmDealFormData {
  // === Phần 1: Thông tin Deal ===
  agreed_price: number           // Giá thỏa thuận cuối (có thể khác giá booking)
  agreed_quantity_tons: number   // Số lượng thỏa thuận cuối
  expected_drc: number           // DRC dự kiến ban đầu (giữ nguyên từ booking)
  price_unit: 'wet' | 'dry'     // Loại giá
  product_type: string           // Loại mủ
  pickup_location: string        // Địa điểm
  delivery_date?: string         // Ngày giao dự kiến
  deal_notes?: string            // Ghi chú Deal

  // === Phần 2: Tạm ứng (optional) ===
  has_advance: boolean
  advance_amount?: number
  advance_payment_method?: 'cash' | 'bank_transfer'
  advance_receiver_name?: string
  advance_receiver_phone?: string
  advance_notes?: string
}
```

### 4.3 Layout Modal

```
╔══════════════════════════════════════════════════════════╗
║ ✅ Xác nhận tạo Deal                              [X]  ║
║ 🏷️ Đại lý: Nguyễn Văn A (DL-001)                      ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║ ┌─── THÔNG TIN DEAL ──────────────────────────────────┐ ║
║ │                                                      │ ║
║ │  Loại mủ        [Mủ đông          ▼]                │ ║
║ │                                                      │ ║
║ │  Số lượng (tấn)  [ 5.0            ]                 │ ║
║ │  DRC dự kiến (%) [ 32             ] ⚠️ DRC ban đầu  │ ║
║ │                                                      │ ║
║ │  ┌────────────────┐  ┌────────────────┐             │ ║
║ │  │ Đơn giá (đ/kg) │  │ Loại giá       │             │ ║
║ │  │ [ 45,000      ] │  │ [Giá ướt    ▼] │             │ ║
║ │  └────────────────┘  └────────────────┘             │ ║
║ │                                                      │ ║
║ │  📍 Địa điểm: Cam Lộ, Quảng Trị                    │ ║
║ │  📅 Giao dự kiến: 20/03/2026                        │ ║
║ │                                                      │ ║
║ │  ┌────────────────────────────────────────────────┐ │ ║
║ │  │  💰 Giá trị ước tính:  225,000,000 VNĐ        │ │ ║
║ │  └────────────────────────────────────────────────┘ │ ║
║ │                                                      │ ║
║ │  Ghi chú Deal:  [                              ]    │ ║
║ └──────────────────────────────────────────────────────┘ ║
║                                                          ║
║ ┌─── TẠM ỨNG ─────────────────────────────────────────┐ ║
║ │                                                      │ ║
║ │  💰 Tạm ứng ngay?                                   │ ║
║ │                                                      │ ║
║ │  ○ Không, ghi nợ toàn bộ                            │ ║
║ │  ● Có, tạm ứng ngay                                 │ ║
║ │                                                      │ ║
║ │  ┌─ Hiện khi chọn "Có" ──────────────────────────┐ │ ║
║ │  │                                                │ │ ║
║ │  │  Số tiền ứng:     [ 20,000,000          ] VNĐ │ │ ║
║ │  │  Hình thức:       [ Tiền mặt          ▼]      │ │ ║
║ │  │  Người nhận:      [ Nguyễn Văn A        ]     │ │ ║
║ │  │  SĐT:             [ 0905 xxx xxx       ]      │ │ ║
║ │  │  Ghi chú ứng:     [ Ứng tại vườn       ]      │ │ ║
║ │  │                                                │ │ ║
║ │  └────────────────────────────────────────────────┘ │ ║
║ └──────────────────────────────────────────────────────┘ ║
║                                                          ║
║ ┌─── TÓM TẮT ─────────────────────────────────────────┐ ║
║ │  Giá trị Deal:        225,000,000 VNĐ               │ ║
║ │  Tạm ứng:            - 20,000,000 VNĐ               │ ║
║ │  ─────────────────────────────────                   │ ║
║ │  Còn phải trả:        205,000,000 VNĐ               │ ║
║ └──────────────────────────────────────────────────────┘ ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                      [Hủy]    [✅ Tạo Deal]             ║
║                               (+ Ghi tạm ứng nếu có)    ║
╚══════════════════════════════════════════════════════════╝
```

### 4.4 DRC — Lưu ý quan trọng

```
⚠️ DRC dự kiến ≠ DRC thực tế

- DRC trên phiếu chốt là DRC BAN ĐẦU, phụ thuộc vào nhiều yếu tố
  (vùng, mùa, nhà cung cấp, loại mủ, thời tiết...)
- DRC này KHÔNG phải DRC chuẩn — chỉ dùng để ước tính giá trị
- DRC thực tế chỉ có SAU KHI ra thành phẩm (qua QC)
- Cần GIỮ CẢ 2 để tính lãi lỗ sau này

Trong database:
  expected_drc = DRC từ booking/deal (dự kiến)
  actual_drc   = DRC sau QC (thực tế) — cập nhật sau
```

Trên UI Modal:
- DRC field hiển thị với **tooltip/warning** nhắc đây là DRC dự kiến
- Cho phép chỉnh sửa nhưng **không bắt buộc** phải khớp với DRC mặc định của location
- Label: **"DRC dự kiến (%)"** thay vì chỉ "DRC"

### 4.5 Tính toán giá trị ước tính

```typescript
// Công thức giống BookingFormModal
function calculateEstimatedValue(data: {
  quantity_tons: number
  price_per_kg: number
  price_unit: 'wet' | 'dry'
  drc_percent: number
}): number {
  const { quantity_tons, price_per_kg, price_unit, drc_percent } = data

  if (price_unit === 'wet') {
    // Giá ướt: qty(tấn) × 1000(kg) × giá/kg
    return quantity_tons * 1000 * price_per_kg
  } else {
    // Giá khô: qty(tấn) × 1000(kg) × DRC% × giá/kg
    return quantity_tons * 1000 * (drc_percent / 100) * price_per_kg
  }
}
```

### 4.6 Validation Rules

| Field | Rule | Message |
|-------|------|---------|
| agreed_price | required, min: 100 | "Nhập đơn giá" |
| agreed_quantity_tons | required, min: 0.1 | "Nhập số lượng" |
| expected_drc | required, min: 1, max: 100 | "DRC từ 1-100%" |
| advance_amount | required if has_advance, min: 1, max: estimated_value | "Số tiền ứng không hợp lệ" |
| advance_payment_method | required if has_advance | "Chọn hình thức" |
| advance_receiver_name | required if has_advance | "Nhập người nhận" |

---

## 5. BACKEND — Service xử lý

### 5.1 confirmDealFromChat()

Hàm mới trong `dealService.ts` hoặc tạo file riêng `dealConfirmService.ts`:

```typescript
interface ConfirmDealResult {
  deal: Deal
  advance?: Advance
  ledgerEntry?: LedgerEntry
  dealMessage?: ChatMessage
}

async function confirmDealFromChat(
  formData: ConfirmDealFormData,
  context: {
    bookingMessageId: string
    partnerId: string
    roomId: string
    confirmedBy: string  // employee_id hoặc partner_user_id
    confirmerType: 'factory' | 'partner'
  }
): Promise<ConfirmDealResult>
```

### 5.2 Các bước xử lý (theo thứ tự)

```
Step 1: Tạo Deal (b2b_deals)
  ├── deal_number = generateDealNumber()        // DL2603-0001
  ├── booking_message_id = context.bookingMessageId
  ├── partner_id = context.partnerId
  ├── product_type = formData.product_type
  ├── quantity_kg = formData.agreed_quantity_tons * 1000
  ├── expected_drc = formData.expected_drc       // DRC dự kiến
  ├── actual_drc = NULL                          // Chưa có, cập nhật sau QC
  ├── agreed_price = formData.agreed_price
  ├── price_unit = formData.price_unit
  ├── estimated_value = calculateEstimatedValue(formData)
  ├── final_value = NULL                         // Tính sau khi có actual_drc
  ├── status = 'processing'
  └── created_by = context.confirmedBy

Step 2: Tạo Advance (nếu has_advance = true)
  ├── advance_number = generateAdvanceNumber()   // TU2603-0001
  ├── partner_id = context.partnerId
  ├── deal_id = deal.id                          // FK từ Step 1
  ├── stage = 'booking'                          // Ứng tại thời điểm chốt
  ├── amount = formData.advance_amount
  ├── payment_method = formData.advance_payment_method
  ├── receiver_name = formData.advance_receiver_name
  ├── receiver_phone = formData.advance_receiver_phone
  ├── notes = formData.advance_notes
  ├── status = 'paid'                            // Ứng ngay = đã chi
  └── created_by = context.confirmedBy

Step 3: Ghi Debt Ledger (nếu có Advance)
  ├── partner_id = context.partnerId
  ├── deal_id = deal.id
  ├── advance_id = advance.id
  ├── entry_type = 'advance'
  ├── credit_amount = formData.advance_amount    // Credit = tiền đã ứng
  ├── description = "Tạm ứng khi xác nhận deal {deal_number}"
  ├── reference_code = advance.advance_number
  └── entry_date = today

Step 4: Update Booking message metadata
  ├── status = 'confirmed'
  ├── deal_id = deal.id
  └── deal_number = deal.deal_number

Step 5: Gửi DealCard message trong chat
  ├── room_id = context.roomId
  ├── sender_type = context.confirmerType
  ├── sender_id = context.confirmedBy
  ├── message_type = 'deal'                      // Type mới
  ├── content = "Deal {deal_number} đã được tạo"
  └── metadata = {
        deal_id, deal_number, status,
        product_type, quantity_kg, expected_drc,
        agreed_price, estimated_value,
        total_advanced, balance_due
      }

Step 6: Update Deal totals
  ├── total_advanced = advance?.amount || 0
  └── balance_due = estimated_value - total_advanced
```

### 5.3 Error Handling

```typescript
// Kiểm tra trước khi tạo
1. Booking phải có status = 'pending' hoặc 'negotiating'
   → Nếu đã confirmed/rejected → throw "Phiếu chốt đã được xử lý"

2. Kiểm tra duplicate deal cho booking
   → getDealByBookingId(bookingMessageId)
   → Nếu đã có → throw "Deal đã tồn tại cho phiếu chốt này"

3. Nếu advance thất bại → vẫn giữ Deal (advance có thể tạo sau)
   → Log warning, trả về deal without advance
```

---

## 6. DEAL CARD — Hiển thị trên Chat

### 6.1 DealCard Component

Sau khi Deal được tạo, một message mới type `'deal'` xuất hiện trên chat.

```
╔═══════════════════════════════════════════════════╗
║ 🤝 DEAL DL-2603-001                  Đang xử lý ║
╠═══════════════════════════════════════════════════╣
║ 📋 Từ: BK260316-AB12                             ║
║ Mủ đông | 5 tấn | DRC dự kiến: 32%               ║
║ 📍 Cam Lộ, Quảng Trị                             ║
║ 💰 45,000đ/kg | Ước tính: 225,000,000đ           ║
╠═══════════════════════════════════════════════════╣
║ 💵 Đã tạm ứng: 20,000,000đ                      ║
║ 📊 Còn lại:    205,000,000đ                      ║
╠═══════════════════════════════════════════════════╣
║ [+ Ứng thêm]  [📦 Giao hàng]  [Chi tiết →]      ║
╚═══════════════════════════════════════════════════╝
```

### 6.2 DealCard Actions (phân quyền)

```typescript
interface DealCardProps {
  metadata: DealMetadata
  viewerType: 'factory' | 'partner'   // Ai đang xem
  onAddAdvance?: () => void            // Chỉ factory
  onRecordDelivery?: () => void        // Cả 2 bên
  onViewDetails?: () => void           // Cả 2 bên
}
```

| Nút | ERP (factory) | Portal (partner) |
|-----|---------------|-----------------|
| + Ứng thêm | ✅ Hiện | ❌ Ẩn |
| 📦 Giao hàng | ✅ Hiện | ✅ Hiện (báo giao) |
| Chi tiết → | ✅ → `/b2b/deals/:id` | ✅ → `/deals/:id` |

### 6.3 DealMetadata (trong chat message)

```typescript
interface DealMetadata {
  deal_id: string
  deal_number: string
  status: DealStatus
  booking_code?: string

  // Denormalized để hiển thị nhanh
  product_type: string
  quantity_kg: number
  expected_drc: number
  agreed_price: number
  price_unit: 'wet' | 'dry'
  estimated_value: number
  pickup_location?: string

  // Tài chính
  total_advanced: number
  balance_due: number
}
```

---

## 7. ĐỒNG BỘ ERP ↔ PORTAL

### 7.1 Cùng dùng chung

| Thành phần | ERP | Portal | Ghi chú |
|-----------|-----|--------|---------|
| BookingCard | ✅ | ✅ | UI khác nhau, logic giống |
| ConfirmDealModal | ✅ | ✅ | **Cùng interface, cùng fields** |
| DealCard | ✅ | ✅ | Actions khác theo viewer_type |
| BookingMetadata | ✅ | ✅ | **Cùng interface** |
| DealMetadata | ✅ | ✅ | **Cùng interface** |
| confirmDealFromChat() | ✅ | ✅ | **Cùng logic**, khác confirmerType |

### 7.2 Khác nhau

| Aspect | ERP (Nhà máy) | Portal (Đại lý) |
|--------|--------------|-----------------|
| sender_type | `'factory'` | `'partner'` |
| confirmerType | `'factory'` | `'partner'` |
| confirmedBy | `employee_id` | `partner_user_id` |
| Advance section | Đầy đủ (tạo + ghi nợ) | Chỉ xem (nhà máy quản lý tiền) |
| Sau confirm | Tạo Deal + Advance + Ledger | Tạo Deal only (không tạm ứng) |

### 7.3 Advance: Ai tạm ứng?

```
⚠️ QUAN TRỌNG: Chỉ NHÀ MÁY mới tạm ứng tiền cho đại lý

Kịch bản A: Đại lý gửi booking → Nhà máy xác nhận
  → ConfirmDealModal CÓ phần tạm ứng (nhà máy ứng tiền cho đại lý)

Kịch bản B: Nhà máy gửi booking → Đại lý xác nhận
  → ConfirmDealModal KHÔNG CÓ phần tạm ứng
  → Đại lý chỉ xác nhận thông tin Deal
  → Nhà máy ứng tiền sau qua nút "Ứng thêm" trên DealCard
```

### 7.4 Shared Types (file dùng chung)

Tạo file types dùng chung cho cả 2 repo:

```typescript
// === shared/deal-confirm.types.ts ===

export interface ConfirmDealFormData {
  agreed_price: number
  agreed_quantity_tons: number
  expected_drc: number
  price_unit: 'wet' | 'dry'
  product_type: string
  pickup_location?: string
  delivery_date?: string
  deal_notes?: string

  // Chỉ có khi confirmerType = 'factory'
  has_advance: boolean
  advance_amount?: number
  advance_payment_method?: 'cash' | 'bank_transfer'
  advance_receiver_name?: string
  advance_receiver_phone?: string
  advance_notes?: string
}

export interface DealMetadata {
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
}

export interface ConfirmDealResult {
  deal: {
    id: string
    deal_number: string
    status: string
    estimated_value: number
  }
  advance?: {
    id: string
    advance_number: string
    amount: number
  }
  ledgerEntry?: {
    id: string
    credit_amount: number
    running_balance: number
  }
}
```

---

## 8. DATABASE — Kiểm tra & bổ sung

### 8.1 Các bảng đã có (services tương ứng)

| Bảng | Service | Status |
|------|---------|--------|
| b2b_deals | dealService.ts | ✅ Đã có |
| b2b_advances | advanceService.ts | ✅ Đã có |
| b2b_debt_ledger | ledgerService.ts | ✅ Đã có (tên: b2b_ledger_entries) |
| b2b_chat_messages | chatMessageService.ts | ✅ Đã có |

### 8.2 Fields cần thêm/kiểm tra trên b2b_deals

```sql
-- Kiểm tra các field này đã có chưa:
ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  booking_message_id UUID;          -- FK tới b2b_chat_messages

ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  expected_drc NUMERIC(5,2);        -- DRC dự kiến (từ booking)

ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  actual_drc NUMERIC(5,2);          -- DRC thực tế (sau QC)

ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  price_unit VARCHAR(10);           -- 'wet' hoặc 'dry'

ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  pickup_location TEXT;             -- Địa điểm chốt hàng

ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  estimated_value NUMERIC(15,2);    -- Giá trị ước tính (từ expected_drc)

ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  final_value NUMERIC(15,2);        -- Giá trị thực tế (từ actual_drc)

ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  total_advanced NUMERIC(15,2) DEFAULT 0;

ALTER TABLE b2b_deals ADD COLUMN IF NOT EXISTS
  balance_due NUMERIC(15,2);
```

### 8.3 Fields cần thêm trên b2b_advances

```sql
ALTER TABLE b2b_advances ADD COLUMN IF NOT EXISTS
  stage VARCHAR(20) DEFAULT 'booking';
  -- 'booking': Ứng khi chốt deal
  -- 'delivery': Ứng khi giao hàng
  -- 'other': Ứng khác

ALTER TABLE b2b_advances ADD COLUMN IF NOT EXISTS
  receiver_name VARCHAR(100);

ALTER TABLE b2b_advances ADD COLUMN IF NOT EXISTS
  receiver_phone VARCHAR(20);
```

---

## 9. MESSAGE TYPE MỚI: 'deal'

### 9.1 Thêm vào MessageType

```typescript
// chatMessageService.ts
type MessageType = 'text' | 'image' | 'file' | 'audio' | 'booking' | 'deal' | 'quotation' | 'system'
//                                                                      ^^^^^ MỚI
```

### 9.2 Render trong MessageBubble

```typescript
// Trong B2BChatRoomPage.tsx → MessageBubble → renderContent()
case 'deal':
  return (
    <DealCard
      metadata={message.metadata?.deal as DealMetadata}
      viewerType="factory"  // hoặc 'partner' bên Portal
      onAddAdvance={() => handleDealAction(message.id, 'add_advance')}
      onRecordDelivery={() => handleDealAction(message.id, 'delivery')}
      onViewDetails={() => navigate(`/b2b/deals/${message.metadata?.deal?.deal_id}`)}
    />
  )
```

---

## 10. FILES CẦN TẠO / SỬA

### 10.1 Tạo mới

| File | Mô tả |
|------|--------|
| `src/components/b2b/ConfirmDealModal.tsx` | Modal xác nhận Deal + tạm ứng |
| `src/components/b2b/DealCard.tsx` | Card hiển thị Deal trong chat |
| `src/services/b2b/dealConfirmService.ts` | Service xử lý confirm deal flow |

### 10.2 Sửa

| File | Thay đổi |
|------|----------|
| `src/pages/b2b/B2BChatRoomPage.tsx` | Thay auto-confirm → mở ConfirmDealModal; thêm render DealCard trong MessageBubble |
| `src/services/b2b/chatMessageService.ts` | Thêm `'deal'` vào MessageType; cập nhật `confirmBooking()` |
| `src/types/b2b.types.ts` | Thêm `DealMetadata`, `ConfirmDealFormData` interfaces |
| `src/services/b2b/dealService.ts` | Thêm fields mới (expected_drc, actual_drc, price_unit, pickup_location...) |

---

## 11. THỨ TỰ TRIỂN KHAI

```
Phase 1: ConfirmDealModal (ERP side)
  1.1 Tạo ConfirmDealModal.tsx component
  1.2 Tạo dealConfirmService.ts
  1.3 Sửa B2BChatRoomPage.tsx (thay auto-confirm → modal)
  1.4 Test luồng: Booking → Confirm → Deal created

Phase 2: DealCard (ERP side)
  2.1 Tạo DealCard.tsx component
  2.2 Thêm message_type 'deal' vào MessageBubble render
  2.3 Test: Deal card hiển thị đúng trong chat

Phase 3: Sync Portal
  3.1 Copy shared types sang Portal repo
  3.2 Tạo ConfirmDealModal.tsx (Portal version — không có advance)
  3.3 Tạo DealCard.tsx (Portal version — actions khác)
  3.4 Cập nhật Portal ChatRoomPage

Phase 4: DealCard Actions
  4.1 "Ứng thêm" → AddAdvanceModal (ERP only)
  4.2 "Giao hàng" → RecordDeliveryModal (cả 2 bên)
  4.3 "Chi tiết" → Navigate to deal detail page
```

---

*ConfirmDealModal Spec v1.0*
*Huy Anh Rubber ERP v8 — B2B Module*
*16/03/2026*
