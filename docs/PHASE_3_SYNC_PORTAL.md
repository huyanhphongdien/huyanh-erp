# PHASE 3 — SYNC B2B PORTAL (Đại lý)

**Module:** B2B Chat → Deal Confirmation + DealCard Actions
**Version:** 1.0
**Ngày:** 16/03/2026
**Phạm vi:** Portal (đại lý) — đồng bộ từ ERP (nhà máy)

---

## MỤC LỤC

1. [Tổng quan](#1-tổng-quan)
2. [Shared Types — Copy nguyên](#2-shared-types--copy-nguyên)
3. [Component 1: ConfirmDealModal (Portal)](#3-component-1-confirmdealmodal-portal)
4. [Component 2: DealCard (Portal)](#4-component-2-dealcard-portal)
5. [Component 3: RecordDeliveryModal (Portal)](#5-component-3-recorddeliverymodal-portal)
6. [Service: dealConfirmService (Portal)](#6-service-dealconfirmservice-portal)
7. [Service: dealChatActionsService (Portal)](#7-service-dealchatactionsservice-portal)
8. [Tích hợp ChatRoomPage (Portal)](#8-tích-hợp-chatroompage-portal)
9. [Constants dùng chung](#9-constants-dùng-chung)
10. [Checklist triển khai](#10-checklist-triển-khai)

---

## 1. TỔNG QUAN

### 1.1 ERP đã làm xong

| File ERP | Mô tả | Portal cần? |
|----------|--------|-------------|
| `ConfirmDealModal.tsx` | Modal xác nhận Deal + tạm ứng | ✅ Copy + **bỏ advance section** |
| `DealCard.tsx` | Card Deal trong chat | ✅ Copy + **đổi viewerType = 'partner'** |
| `AddAdvanceModal.tsx` | Modal ứng thêm | ❌ **KHÔNG CẦN** (chỉ factory ứng tiền) |
| `RecordDeliveryModal.tsx` | Modal ghi nhận giao hàng | ✅ Copy nguyên |
| `dealConfirmService.ts` | Service confirm deal 6 bước | ✅ Copy + **bỏ advance logic** |
| `dealChatActionsService.ts` | Service actions trên DealCard | ✅ Copy + **chỉ giữ recordDelivery** |

### 1.2 Khác biệt chính ERP vs Portal

| Aspect | ERP (Nhà máy) | Portal (Đại lý) |
|--------|---------------|-----------------|
| `sender_type` | `'factory'` | `'partner'` |
| `confirmerType` | `'factory'` | `'partner'` |
| `confirmedBy` | `employee_id` | `partner_user_id` |
| ConfirmDealModal | Có advance section | **KHÔNG có advance** |
| DealCard "Ứng thêm" | ✅ Hiện | ❌ Ẩn |
| DealCard "Giao hàng" | ✅ Hiện | ✅ Hiện |
| DealCard "Chi tiết" | → `/b2b/deals/:id` | → `/deals/:id` |

### 1.3 Khi nào Portal cần ConfirmDealModal?

```
Kịch bản B: NHÀ MÁY gửi booking → ĐẠI LÝ nhận và xác nhận
                                     ^^^^^^^^^^^^^^^^^^^^^^^^
                                     Portal mở ConfirmDealModal
```

Kịch bản A (đại lý gửi, nhà máy xác nhận) thì Portal KHÔNG cần modal — chỉ thấy DealCard sau khi nhà máy confirm.

---

## 2. SHARED TYPES — Copy nguyên

Copy các types này từ ERP sang Portal **không thay đổi gì**:

### 2.1 File: `src/types/deal-confirm.types.ts`

```typescript
// ============================================================================
// SHARED TYPES — Dùng chung ERP ↔ Portal
// ============================================================================

export interface ConfirmDealFormData {
  // === Phần 1: Thông tin Deal ===
  agreed_price: number
  agreed_quantity_tons: number
  expected_drc: number
  price_unit: 'wet' | 'dry'
  product_type: string
  pickup_location?: string
  delivery_date?: string
  deal_notes?: string

  // === Phần 2: Tạm ứng (PORTAL: luôn false) ===
  has_advance: boolean
  advance_amount?: number
  advance_payment_method?: 'cash' | 'bank_transfer'
  advance_receiver_name?: string
  advance_receiver_phone?: string
  advance_notes?: string
}

export interface DealCardMetadata {
  deal_id: string
  deal_number: string
  status: string
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
    credit: number
  }
}
```

### 2.2 RecordDeliveryFormData

```typescript
export interface RecordDeliveryFormData {
  quantity_kg: number
  drc_at_delivery?: number
  vehicle_plate?: string
  driver_name?: string
  driver_phone?: string
  delivery_date: string
  notes?: string
}
```

---

## 3. COMPONENT 1: ConfirmDealModal (Portal)

### 3.1 Khác biệt so với ERP

| Phần | ERP | Portal |
|------|-----|--------|
| Props `showAdvanceSection` | `true` | **`false` (hardcode)** |
| Phần "Tạm ứng" | Hiện đầy đủ | **ẨN hoàn toàn** |
| Tóm tắt tài chính | Giá trị - Tạm ứng = Còn nợ | **Chỉ hiện Giá trị ước tính** |
| `has_advance` khi submit | true/false | **Luôn false** |
| OK button text | "Tạo Deal + Ghi tạm ứng" / "Tạo Deal" | **"Xác nhận Deal"** |

### 3.2 Cách đơn giản nhất

Copy nguyên `ConfirmDealModal.tsx` từ ERP, khi sử dụng truyền:

```tsx
<ConfirmDealModal
  open={...}
  onCancel={...}
  onConfirm={handleConfirmDeal}
  loading={loading}
  booking={booking}
  partnerName={partnerName}
  showAdvanceSection={false}   // ← Portal: luôn false
/>
```

Component ERP đã xử lý `showAdvanceSection={false}` → ẩn toàn bộ advance section.

### 3.3 Nếu muốn Portal-specific version

Nếu muốn clean hơn, tạo version riêng **bỏ hẳn advance code**:

```typescript
// Portal ConfirmDealModal — bỏ advance section
// Giữ nguyên phần Deal Info (loại mủ, số lượng, DRC, giá, loại giá)
// Giữ nguyên validation rules
// Giữ nguyên calculateEstimatedValue()
// Bỏ: Radio group tạm ứng, advance fields, tóm tắt tài chính
// OK button: "Xác nhận Deal"
```

### 3.4 Fields & Validation (giống ERP)

| Field | Rule | Message |
|-------|------|---------|
| `product_type` | required | "Chọn loại mủ" |
| `agreed_quantity_tons` | required, min: 0.1 | "Tối thiểu 0.1 tấn" |
| `expected_drc` | required, min: 1, max: 100 | "1-100%" |
| `agreed_price` | required, min: 100 | "Giá không hợp lệ" |
| `price_unit` | required | — |

### 3.5 Công thức tính giá trị ước tính (giống ERP)

```typescript
function calculateEstimatedValue(data: {
  quantity_tons: number
  price_per_kg: number
  price_unit: 'wet' | 'dry'
  drc_percent: number
}): number {
  const { quantity_tons, price_per_kg, price_unit, drc_percent } = data
  if (price_unit === 'wet') {
    return Math.round(quantity_tons * 1000 * price_per_kg)
  } else {
    return Math.round(quantity_tons * 1000 * (drc_percent / 100) * price_per_kg)
  }
}
```

---

## 4. COMPONENT 2: DealCard (Portal)

### 4.1 Khác biệt so với ERP

Copy nguyên `DealCard.tsx`, khi sử dụng truyền `viewerType="partner"`:

```tsx
<DealCard
  metadata={dealMeta}
  viewerType="partner"                        // ← Portal
  onAddAdvance={undefined}                     // ← KHÔNG truyền (ẩn nút)
  onRecordDelivery={() => handleDelivery()}    // ← Có
  onViewDetails={() => navigate(`/deals/${dealId}`)}  // ← Route portal
/>
```

### 4.2 Kết quả hiển thị

| Nút | Hiện? | Lý do |
|-----|-------|-------|
| "Ứng thêm" | ❌ Ẩn | `viewerType !== 'factory'` → không render |
| "Giao hàng" | ✅ Hiện | Đại lý báo đã giao hàng |
| "Chi tiết" | ✅ Hiện | Navigate `/deals/:dealId` |

### 4.3 Logic ẩn/hiện trong DealCard (đã có sẵn)

```typescript
// DealCard.tsx đã check:
{viewerType === 'factory' && onAddAdvance && (
  <Button onClick={onAddAdvance}>Ứng thêm</Button>
)}
// → Portal truyền viewerType="partner" → nút này tự ẩn
```

---

## 5. COMPONENT 3: RecordDeliveryModal (Portal)

### 5.1 Copy nguyên từ ERP

`RecordDeliveryModal.tsx` **dùng nguyên không thay đổi**. Portal và ERP cùng UI.

### 5.2 Props

```typescript
interface RecordDeliveryModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (data: RecordDeliveryFormData) => Promise<void>
  loading?: boolean
  deal: DealCardMetadata | null
  partnerName?: string
}
```

### 5.3 Fields

| Field | Required | Mô tả |
|-------|----------|-------|
| `quantity_kg` | ✅ | Khối lượng giao (kg), min: 1 |
| `drc_at_delivery` | ❌ | DRC tại giao (%), 1-100 |
| `delivery_date` | ✅ | Ngày giao (DatePicker) |
| `vehicle_plate` | ❌ | Biển số xe |
| `driver_name` | ❌ | Tên tài xế |
| `driver_phone` | ❌ | SĐT tài xế |
| `notes` | ❌ | Ghi chú |

---

## 6. SERVICE: dealConfirmService (Portal)

### 6.1 Khác biệt so với ERP

```
ERP:  6 bước (tạo deal → advance → ledger → update booking → send DealCard → update totals)
Portal: 4 bước (tạo deal → update booking → send DealCard → DONE)
         ↑ KHÔNG có advance, KHÔNG có ledger
```

### 6.2 Code Portal version

```typescript
// src/services/b2b/dealConfirmService.ts (Portal version)

import { supabase } from '../../lib/supabase'
import type { ConfirmDealFormData, ConfirmDealResult, DealCardMetadata } from '../../types/deal-confirm.types'
import { PRODUCT_TYPE_LABELS } from './chatMessageService'

// ============================================
// HELPERS
// ============================================

const generateDealNumber = (): string => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `DL${year}${month}-${random}`
}

export function calculateEstimatedValue(data: {
  quantity_tons: number
  price_per_kg: number
  price_unit: 'wet' | 'dry'
  drc_percent: number
}): number {
  const { quantity_tons, price_per_kg, price_unit, drc_percent } = data
  if (price_unit === 'wet') {
    return Math.round(quantity_tons * 1000 * price_per_kg)
  } else {
    return Math.round(quantity_tons * 1000 * (drc_percent / 100) * price_per_kg)
  }
}

// ============================================
// TYPES
// ============================================

export interface ConfirmDealContext {
  bookingMessageId: string
  partnerId: string
  roomId: string
  confirmedBy: string        // partner_user_id
  confirmerType: 'partner'   // Portal luôn = 'partner'
  bookingCode?: string
}

// ============================================
// SERVICE
// ============================================

export const dealConfirmService = {

  async confirmDealFromChat(
    formData: ConfirmDealFormData,
    context: ConfirmDealContext,
  ): Promise<ConfirmDealResult> {

    // === Pre-check ===
    const { data: existingMsg } = await supabase
      .from('b2b_chat_messages')
      .select('metadata')
      .eq('id', context.bookingMessageId)
      .single()

    if (existingMsg?.metadata?.booking?.status === 'confirmed') {
      throw new Error('Phiếu chốt này đã được xác nhận trước đó')
    }

    const { data: existingDeal } = await supabase
      .from('b2b_deals')
      .select('id, deal_number')
      .eq('booking_id', context.bookingMessageId)
      .maybeSingle()

    if (existingDeal) {
      throw new Error(`Deal ${existingDeal.deal_number} đã tồn tại cho phiếu chốt này`)
    }

    // === Step 1: Tạo Deal ===
    const dealNumber = generateDealNumber()
    const productName = PRODUCT_TYPE_LABELS[formData.product_type] || formData.product_type
    const estimatedValue = calculateEstimatedValue({
      quantity_tons: formData.agreed_quantity_tons,
      price_per_kg: formData.agreed_price,
      price_unit: formData.price_unit,
      drc_percent: formData.expected_drc,
    })

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
        notes: [
          `DRC dự kiến: ${formData.expected_drc}%`,
          `Loại giá: ${formData.price_unit === 'wet' ? 'Giá ướt' : 'Giá khô'}`,
          formData.pickup_location ? `Địa điểm: ${formData.pickup_location}` : '',
          formData.delivery_date ? `Giao dự kiến: ${formData.delivery_date}` : '',
          formData.deal_notes || '',
        ].filter(Boolean).join('. '),
        booking_id: context.bookingMessageId,
      })
      .select('*')
      .single()

    if (dealError) throw new Error(`Không thể tạo Deal: ${dealError.message}`)

    // === Step 2: Update booking message → confirmed ===
    try {
      const { data: bookingMsg } = await supabase
        .from('b2b_chat_messages')
        .select('metadata')
        .eq('id', context.bookingMessageId)
        .single()

      if (bookingMsg) {
        await supabase
          .from('b2b_chat_messages')
          .update({
            metadata: {
              ...bookingMsg.metadata,
              booking: {
                ...bookingMsg.metadata?.booking,
                status: 'confirmed',
                deal_id: deal.id,
                deal_number: dealNumber,
              },
            },
          })
          .eq('id', context.bookingMessageId)
      }
    } catch (err) {
      console.error('Update booking message error:', err)
    }

    // === Step 3: Gửi DealCard message ===
    const dealMetadata: DealCardMetadata = {
      deal_id: deal.id,
      deal_number: dealNumber,
      status: 'processing',
      booking_code: context.bookingCode,
      product_type: formData.product_type,
      quantity_kg: formData.agreed_quantity_tons * 1000,
      expected_drc: formData.expected_drc,
      agreed_price: formData.agreed_price,
      price_unit: formData.price_unit,
      estimated_value: estimatedValue,
      pickup_location: formData.pickup_location,
      total_advanced: 0,            // Portal: không tạm ứng
      balance_due: estimatedValue,   // Portal: nợ toàn bộ
    }

    try {
      await supabase
        .from('b2b_chat_messages')
        .insert({
          room_id: context.roomId,
          sender_type: 'partner',      // Portal luôn = partner
          sender_id: context.confirmedBy,
          message_type: 'deal',
          content: `🤝 Deal ${dealNumber} đã được tạo`,
          metadata: { deal: dealMetadata },
          attachments: [],
        })

      await supabase
        .from('b2b_chat_rooms')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', context.roomId)
    } catch (err) {
      console.error('Send deal message error:', err)
    }

    // === Return ===
    return {
      deal: {
        id: deal.id,
        deal_number: dealNumber,
        status: 'processing',
        estimated_value: estimatedValue,
      },
      // Portal: KHÔNG có advance, KHÔNG có ledgerEntry
    }
  },
}
```

### 6.3 So sánh ERP vs Portal service

```
ERP dealConfirmService.confirmDealFromChat():
  Step 1: Tạo Deal ──────────────────── ✅ Portal giống
  Step 2: Tạo Advance (nếu có) ──────── ❌ Portal BỎ
  Step 3: Ghi Ledger (nếu có advance) ─ ❌ Portal BỎ
  Step 4: Update booking → confirmed ─── ✅ Portal giống
  Step 5: Gửi DealCard message ──────── ✅ Portal giống (total_advanced = 0)
  Step 6: Update deal totals ────────── ❌ Portal BỎ (không có advance)
```

---

## 7. SERVICE: dealChatActionsService (Portal)

### 7.1 Portal CHỈ CẦN recordDeliveryFromChat

```
ERP dealChatActionsService:
  addAdvanceFromChat()     ❌ Portal KHÔNG CẦN (chỉ factory ứng tiền)
  recordDeliveryFromChat() ✅ Portal CẦN (đại lý báo giao hàng)
```

### 7.2 Code Portal version

```typescript
// src/services/b2b/dealChatActionsService.ts (Portal version)

import { supabase } from '../../lib/supabase'
import type { RecordDeliveryFormData } from '../../types/deal-confirm.types'

export interface DealChatActionContext {
  dealId: string
  dealNumber: string
  partnerId: string
  roomId: string
  actionBy: string          // partner_user_id
  actionByType: 'partner'   // Portal luôn = 'partner'
}

export interface RecordDeliveryResult {
  delivery_id: string
  quantity_kg: number
  delivery_date: string
}

const formatCurrency = (value: number): string => {
  return value.toLocaleString('vi-VN')
}

export const dealChatActionsService = {

  async recordDeliveryFromChat(
    formData: RecordDeliveryFormData,
    context: DealChatActionContext,
  ): Promise<RecordDeliveryResult> {

    // Step 1: Check deal status
    const { data: deal, error: dealError } = await supabase
      .from('b2b_deals')
      .select('id, deal_number, status, notes')
      .eq('id', context.dealId)
      .single()

    if (dealError || !deal) throw new Error('Không tìm thấy Deal')
    if (deal.status === 'settled' || deal.status === 'cancelled') {
      throw new Error('Deal đã quyết toán hoặc đã hủy')
    }

    // Step 2: Gửi message giao hàng
    const deliveryInfo = [
      `📦 Ghi nhận giao hàng — Deal ${context.dealNumber}`,
      `Khối lượng: ${formatCurrency(formData.quantity_kg)} kg`,
      formData.drc_at_delivery ? `DRC tại giao: ${formData.drc_at_delivery}%` : '',
      `Ngày giao: ${formData.delivery_date}`,
      formData.vehicle_plate ? `Xe: ${formData.vehicle_plate}` : '',
      formData.driver_name ? `Tài xế: ${formData.driver_name}` : '',
      formData.notes || '',
    ].filter(Boolean).join('\n')

    const { data: msg, error: msgError } = await supabase
      .from('b2b_chat_messages')
      .insert({
        room_id: context.roomId,
        sender_type: 'partner',
        sender_id: context.actionBy,
        message_type: 'system',
        content: deliveryInfo,
        metadata: {
          delivery: {
            deal_id: context.dealId,
            deal_number: context.dealNumber,
            quantity_kg: formData.quantity_kg,
            drc_at_delivery: formData.drc_at_delivery,
            delivery_date: formData.delivery_date,
            vehicle_plate: formData.vehicle_plate,
            driver_name: formData.driver_name,
            driver_phone: formData.driver_phone,
            notes: formData.notes,
          },
        },
        attachments: [],
      })
      .select('id')
      .single()

    if (msgError) throw new Error(`Không thể ghi nhận giao hàng: ${msgError.message}`)

    await supabase
      .from('b2b_chat_rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', context.roomId)

    // Step 3: Update deal notes
    try {
      const deliveryNote = [
        `[Giao ${formData.delivery_date}]`,
        `${formatCurrency(formData.quantity_kg)} kg`,
        formData.drc_at_delivery ? `DRC ${formData.drc_at_delivery}%` : '',
        formData.vehicle_plate ? `Xe ${formData.vehicle_plate}` : '',
      ].filter(Boolean).join(' — ')

      const updatedNotes = deal.notes
        ? `${deal.notes}\n${deliveryNote}`
        : deliveryNote

      await supabase
        .from('b2b_deals')
        .update({
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', context.dealId)
    } catch (err) {
      console.error('Update deal notes error:', err)
    }

    return {
      delivery_id: msg.id,
      quantity_kg: formData.quantity_kg,
      delivery_date: formData.delivery_date,
    }
  },
}
```

---

## 8. TÍCH HỢP ChatRoomPage (Portal)

### 8.1 Imports cần thêm

```typescript
import ConfirmDealModal from '../components/b2b/ConfirmDealModal'
import DealCard from '../components/b2b/DealCard'
import RecordDeliveryModal from '../components/b2b/RecordDeliveryModal'
import { dealConfirmService } from '../services/b2b/dealConfirmService'
import { dealChatActionsService } from '../services/b2b/dealChatActionsService'
import type { ConfirmDealFormData, DealCardMetadata, RecordDeliveryFormData } from '../types/deal-confirm.types'
```

### 8.2 State cần thêm

```typescript
// Confirm Deal Modal
const [confirmDealModal, setConfirmDealModal] = useState<{
  visible: boolean
  booking: BookingMetadata | null
  messageId: string | null
}>({ visible: false, booking: null, messageId: null })
const [confirmDealLoading, setConfirmDealLoading] = useState(false)

// Record Delivery Modal
const [deliveryModal, setDeliveryModal] = useState<{
  visible: boolean
  deal: DealCardMetadata | null
}>({ visible: false, deal: null })
const [deliveryLoading, setDeliveryLoading] = useState(false)

// ⚠️ KHÔNG CẦN addAdvanceModal state (Portal không ứng tiền)
```

### 8.3 Render DealCard trong MessageBubble

```typescript
case 'deal':
  const dealMeta = message.metadata?.deal as DealCardMetadata
  return (
    <DealCard
      metadata={dealMeta}
      viewerType="partner"                    // ← PORTAL
      // onAddAdvance={undefined}             // ← KHÔNG truyền
      onRecordDelivery={() => handleDealAction(dealMeta?.deal_id, 'delivery')}
      onViewDetails={() => handleDealAction(dealMeta?.deal_id, 'view_details')}
    />
  )
```

### 8.4 handleBookingAction — Mở ConfirmDealModal

```typescript
const handleBookingAction = async (messageId: string, action: 'confirm' | 'reject' | 'negotiate') => {
  if (action === 'confirm') {
    const msg = messages.find(m => m.id === messageId)
    const booking = msg?.metadata?.booking as BookingMetadata | undefined
    if (booking) {
      setConfirmDealModal({ visible: true, booking, messageId })
    }
    return
  }
  // ... reject, negotiate giống cũ
}
```

**Lưu ý quan trọng:** Portal chỉ hiện nút "Xác nhận" trên BookingCard khi **nhà máy gửi booking cho đại lý** (tức `isFromFactory === true`). Nếu đại lý tự gửi booking thì KHÔNG hiện nút xác nhận trên phía đại lý.

### 8.5 handleConfirmDeal — Gọi service

```typescript
const handleConfirmDeal = async (formData: ConfirmDealFormData) => {
  if (!confirmDealModal.messageId || !partnerId || !partnerUserId || !roomId) return

  try {
    setConfirmDealLoading(true)

    // Portal: has_advance luôn = false
    formData.has_advance = false

    const result = await dealConfirmService.confirmDealFromChat(formData, {
      bookingMessageId: confirmDealModal.messageId,
      partnerId: partnerId,
      roomId: roomId,
      confirmedBy: partnerUserId,      // ← partner_user_id
      confirmerType: 'partner',        // ← PORTAL
      bookingCode: confirmDealModal.booking?.code,
    })

    message.success(`Deal ${result.deal.deal_number} đã tạo`)
    setConfirmDealModal({ visible: false, booking: null, messageId: null })
    fetchMessages()
  } catch (error: any) {
    message.error(error?.message || 'Không thể tạo Deal')
  } finally {
    setConfirmDealLoading(false)
  }
}
```

### 8.6 handleDealAction

```typescript
const handleDealAction = (dealId: string, action: 'delivery' | 'view_details') => {
  if (action === 'view_details') {
    navigate(`/deals/${dealId}`)        // ← Route portal
    return
  }

  if (action === 'delivery') {
    const dealMsg = messages.find(m =>
      m.message_type === 'deal' && (m.metadata as any)?.deal?.deal_id === dealId
    )
    const dealMeta = (dealMsg?.metadata as any)?.deal as DealCardMetadata | undefined
    if (dealMeta) {
      setDeliveryModal({ visible: true, deal: dealMeta })
    }
  }

  // ⚠️ KHÔNG CÓ 'add_advance' action ở Portal
}
```

### 8.7 handleRecordDelivery

```typescript
const handleRecordDelivery = async (formData: RecordDeliveryFormData) => {
  if (!deliveryModal.deal || !partnerId || !partnerUserId || !roomId) return

  try {
    setDeliveryLoading(true)
    await dealChatActionsService.recordDeliveryFromChat(formData, {
      dealId: deliveryModal.deal.deal_id,
      dealNumber: deliveryModal.deal.deal_number,
      partnerId: partnerId,
      roomId: roomId,
      actionBy: partnerUserId,
      actionByType: 'partner',
    })

    message.success(`Đã ghi nhận giao hàng ${formData.quantity_kg.toLocaleString('vi-VN')} kg`)
    setDeliveryModal({ visible: false, deal: null })
    fetchMessages()
  } catch (error: any) {
    message.error(error?.message || 'Không thể ghi nhận giao hàng')
  } finally {
    setDeliveryLoading(false)
  }
}
```

### 8.8 JSX — Modals

```tsx
{/* Confirm Deal Modal — Portal: KHÔNG có advance */}
<ConfirmDealModal
  open={confirmDealModal.visible}
  onCancel={() => setConfirmDealModal({ visible: false, booking: null, messageId: null })}
  onConfirm={handleConfirmDeal}
  loading={confirmDealLoading}
  booking={confirmDealModal.booking}
  partnerName={factoryName}          // Portal hiện tên nhà máy
  showAdvanceSection={false}          // ← PORTAL: không có advance
/>

{/* Record Delivery Modal */}
<RecordDeliveryModal
  open={deliveryModal.visible}
  onCancel={() => setDeliveryModal({ visible: false, deal: null })}
  onConfirm={handleRecordDelivery}
  loading={deliveryLoading}
  deal={deliveryModal.deal}
  partnerName={factoryName}
/>

{/* ⚠️ KHÔNG CÓ AddAdvanceModal ở Portal */}
```

### 8.9 Realtime — Nhận Deal khi ERP confirm

Khi nhà máy confirm booking của đại lý (kịch bản A), Portal cần nhận DealCard qua realtime:

```typescript
// Trong realtime subscription handler
const handleRealtimeMessage = (payload: any) => {
  const newMsg = payload.new

  // Message mới (bao gồm DealCard từ ERP)
  if (payload.eventType === 'INSERT') {
    setMessages(prev => [...prev, newMsg])
  }

  // Booking được update → confirmed (ERP đã xác nhận)
  if (payload.eventType === 'UPDATE') {
    setMessages(prev => prev.map(m => m.id === newMsg.id ? newMsg : m))
  }
}
```

Portal không cần tự tạo Deal khi nhận realtime update — ERP đã tạo Deal và gửi DealCard message. Portal chỉ cần hiển thị messages mới.

---

## 9. CONSTANTS DÙNG CHUNG

### 9.1 PRODUCT_TYPE_LABELS

```typescript
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  mu_nuoc: 'Mủ nước',
  mu_tap: 'Mủ tạp',
  mu_dong: 'Mủ đông',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ',
}
```

### 9.2 DEAL_STATUS_LABELS

```typescript
export const DEAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  accepted: 'Đã duyệt',
  settled: 'Đã quyết toán',
  cancelled: 'Đã hủy',
}

export const DEAL_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  processing: 'blue',
  accepted: 'green',
  settled: 'purple',
  cancelled: 'default',
}
```

### 9.3 BOOKING_STATUS_LABELS

```typescript
export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  negotiating: 'Đang thương lượng',
  rejected: 'Đã từ chối',
}
```

---

## 10. CHECKLIST TRIỂN KHAI

### Step 1: Copy shared types
- [ ] Tạo `src/types/deal-confirm.types.ts` (Section 2)
- [ ] Copy `PRODUCT_TYPE_LABELS`, `DEAL_STATUS_LABELS` vào constants

### Step 2: Copy components
- [ ] Copy `ConfirmDealModal.tsx` từ ERP (dùng `showAdvanceSection={false}`)
- [ ] Copy `DealCard.tsx` từ ERP (dùng `viewerType="partner"`)
- [ ] Copy `RecordDeliveryModal.tsx` từ ERP (không thay đổi)

### Step 3: Tạo services (Portal version)
- [ ] Tạo `dealConfirmService.ts` — bỏ advance + ledger steps (Section 6)
- [ ] Tạo `dealChatActionsService.ts` — chỉ giữ `recordDeliveryFromChat` (Section 7)

### Step 4: Tích hợp ChatRoomPage
- [ ] Import components + services
- [ ] Thêm state (confirmDealModal, deliveryModal)
- [ ] Render DealCard trong message bubble (`viewerType="partner"`)
- [ ] Xử lý BookingCard "Xác nhận" → mở ConfirmDealModal
- [ ] Xử lý DealCard "Giao hàng" → mở RecordDeliveryModal
- [ ] Xử lý DealCard "Chi tiết" → navigate `/deals/:id`
- [ ] Thêm modals vào JSX

### Step 5: Test
- [ ] Kịch bản A: Đại lý gửi booking → Nhà máy xác nhận (ERP) → Portal thấy DealCard
- [ ] Kịch bản B: Nhà máy gửi booking → Đại lý xác nhận (Portal) → ERP thấy DealCard
- [ ] "Giao hàng" từ Portal → ERP thấy message
- [ ] "Chi tiết" navigate đúng route

### Step 6: Verify realtime
- [ ] DealCard xuất hiện realtime ở cả 2 bên
- [ ] Booking status update realtime
- [ ] Delivery message realtime

---

## THAM KHẢO — Files ERP gốc

| File ERP | Đường dẫn |
|----------|-----------|
| ConfirmDealModal | `src/components/b2b/ConfirmDealModal.tsx` |
| DealCard | `src/components/b2b/DealCard.tsx` |
| AddAdvanceModal | `src/components/b2b/AddAdvanceModal.tsx` (Portal KHÔNG cần) |
| RecordDeliveryModal | `src/components/b2b/RecordDeliveryModal.tsx` |
| dealConfirmService | `src/services/b2b/dealConfirmService.ts` |
| dealChatActionsService | `src/services/b2b/dealChatActionsService.ts` |
| B2BChatRoomPage | `src/pages/b2b/B2BChatRoomPage.tsx` |
| Types | `src/types/b2b.types.ts` |

---

*Phase 3 Sync Portal Spec v1.0*
*Huy Anh Rubber ERP v8 — B2B Module*
*16/03/2026*
