# Tich hop Phieu chot mu hai chieu - Huong dan phia Dai ly

> Tai lieu danh cho dev phia du an B2B Dai ly (Partner side)
> Ngay: 2026-03-12

---

## Tong quan

Luong Phieu chot mu (Booking) hoat dong **hai chieu**:

| Chieu | Nguoi tao | Nguoi xac nhan | Tao Deal |
|-------|-----------|----------------|----------|
| 1 | Dai ly | Nha may (Factory) | Factory tao Deal |
| 2 | Nha may (Factory) | Dai ly | **Dai ly tao Deal** |

Phia ERP (Nha may) da hoan tat ca hai chieu. Phia Dai ly can bo sung logic cho **Chieu 2**: khi dai ly xac nhan phieu do Factory gui, tu dong tao Deal.

---

## 1. Cau truc du lieu Booking trong chat message

Khi mot phieu chot mu duoc gui, tin nhan co dang:

```typescript
{
  message_type: 'booking',
  sender_type: 'factory' | 'partner',
  metadata: {
    booking: {
      code: 'BK260312-AB1C',
      product_type: 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to',
      quantity_tons: 5,
      drc_percent: 60,
      price_per_kg: 12000,
      price_unit: 'wet' | 'dry',
      estimated_value: 60000000,
      delivery_date: '2026-03-15',
      notes: 'Ghi chu',
      status: 'pending' | 'confirmed' | 'negotiating' | 'rejected',
      counter_price?: number,       // Gia de xuat khi thuong luong
      negotiation_notes?: string,   // Ly do thuong luong
    }
  }
}
```

---

## 2. Thay doi trong `chatMessageService.ts`

### 2.1. Them method `confirmBooking`

Khi dai ly xac nhan phieu cua Factory, can:
1. Cap nhat `status` -> `confirmed`
2. Tu dong tao Deal tu booking data
3. Tra ve Deal da tao

```typescript
import { dealService } from './dealService'

// Trong chatMessageService object, them:

/**
 * Xac nhan booking va tu dong tao Deal
 * Dung khi DAI LY xac nhan phieu do Factory gui
 */
async confirmBooking(
  messageId: string,
  partnerId: string
): Promise<{ message: ChatMessage; deal: any }> {
  // 1. Cap nhat trang thai booking -> confirmed
  const confirmedMessage = await this.updateBookingStatus(messageId, 'confirmed')

  // 2. Lay booking data tu metadata
  const booking = confirmedMessage.metadata?.booking
  if (!booking) throw new Error('Khong co du lieu booking')

  // 3. Tu dong tao Deal tu booking (voi booking_id de tranh trung)
  const deal = await dealService.create({
    deal_type: 'purchase',
    partner_id: partnerId,
    booking_id: messageId,           // Lien ket voi tin nhan booking
    final_price: booking.price_per_kg,
    currency: 'VND',
    delivery_schedule: booking.delivery_date
      ? { expected_date: booking.delivery_date }
      : undefined,
    created_by: partnerId,
  })

  return { message: confirmedMessage, deal }
},
```

### 2.2. Them method `updateBookingStatus` (neu chua co)

```typescript
/**
 * Cap nhat trang thai booking trong metadata cua tin nhan
 */
async updateBookingStatus(
  messageId: string,
  status: 'pending' | 'confirmed' | 'negotiating' | 'rejected',
  counterPrice?: number,
  negotiationNotes?: string
): Promise<ChatMessage> {
  const original = await this.getById(messageId)
  if (!original) throw new Error('Tin nhan khong ton tai')
  if (original.message_type !== 'booking') throw new Error('Khong phai phieu chot mu')

  const booking = original.metadata?.booking
  if (!booking) throw new Error('Khong co du lieu booking')

  const { data, error } = await supabase
    .from('b2b_chat_messages')  // hoac 'b2b.chat_messages' tuy theo cach truy van
    .update({
      metadata: {
        ...original.metadata,
        booking: {
          ...booking,
          status,
          counter_price: counterPrice || booking.counter_price,
          negotiation_notes: negotiationNotes || booking.negotiation_notes,
        },
      },
    })
    .eq('id', messageId)
    .select()
    .single()

  if (error) throw error
  return data as ChatMessage
},
```

### 2.3. Them methods `rejectBooking` va `negotiateBooking`

```typescript
/**
 * Tu choi booking
 */
async rejectBooking(messageId: string, reason?: string): Promise<ChatMessage> {
  return this.updateBookingStatus(messageId, 'rejected', undefined, reason)
},

/**
 * Thuong luong booking (de xuat gia moi)
 */
async negotiateBooking(
  messageId: string,
  counterPrice: number,
  notes?: string
): Promise<ChatMessage> {
  return this.updateBookingStatus(messageId, 'negotiating', counterPrice, notes)
},
```

---

## 3. Thay doi trong `dealService.ts`

### 3.1. Them kiem tra trung truoc khi tao Deal

Truoc khi tao Deal, kiem tra da co Deal nao lien ket voi `booking_id` nay chua:

```typescript
// Them method moi:
async getDealByBookingId(bookingId: string): Promise<Deal | null> {
  const { data, error } = await supabase
    .from('b2b.deals')
    .select(DEAL_SELECT)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (error) {
    console.error('Error checking existing deal:', error)
    return null
  }
  return data as Deal | null
},
```

### 3.2. Cap nhat method `create` - kiem tra trung

Trong method `create()`, them kiem tra truoc khi insert:

```typescript
async create(input: DealInput): Promise<Deal> {
  // Kiem tra Deal da ton tai cho booking nay chua
  if (input.booking_id) {
    const existing = await this.getDealByBookingId(input.booking_id)
    if (existing) return existing  // Tra ve Deal cu, khong tao trung
  }

  // ... phan con lai giu nguyen ...
}
```

---

## 4. Thay doi trong ChatRoomPage (trang chat phia dai ly)

### 4.1. Hien thi nut hanh dong cho phieu cua Factory

Trong BookingCard component, **hien thi nut Xac nhan / Thuong luong / Tu choi** khi:
- Tin nhan do **Factory gui** (`sender_type === 'factory'`)
- Trang thai la `pending` hoac `negotiating`

```tsx
// Logic hien thi nut:
const isFromFactory = message.sender_type === 'factory'
const isPending = booking.status === 'pending'
const isNegotiating = booking.status === 'negotiating'

// Hien thi nut khi phieu tu Factory va dang cho xu ly
{isFromFactory && (isPending || isNegotiating) && (
  <Space>
    <Button type="primary" onClick={() => handleConfirm(message.id)}>
      Xac nhan
    </Button>
    <Button onClick={() => handleNegotiate(message.id)}>
      Thuong luong
    </Button>
    <Button danger onClick={() => handleReject(message.id)}>
      Tu choi
    </Button>
  </Space>
)}
```

### 4.2. Handler xac nhan booking

```tsx
const handleBookingAction = async (
  messageId: string,
  action: 'confirm' | 'reject' | 'negotiate'
) => {
  if (action === 'negotiate') {
    // Mo modal thuong luong
    setNegotiateModal({ visible: true, messageId })
    return
  }

  try {
    if (action === 'confirm') {
      // partnerId = ID cua dai ly hien tai
      const { deal } = await chatMessageService.confirmBooking(messageId, currentPartnerId)
      message.success(`Da xac nhan & tao Deal ${deal.deal_number}`)
    } else {
      await chatMessageService.rejectBooking(messageId)
      message.success('Da tu choi phieu chot mu')
    }
  } catch (error) {
    message.error('Khong the cap nhat phieu chot mu')
  }
}
```

### 4.3. Realtime: Phat hien Factory xac nhan phieu cua dai ly

Trong realtime subscription `onUpdate`, them logic:

```tsx
onUpdate: async (updatedMessage) => {
  // Cap nhat UI
  setMessages(prev => prev.map(m =>
    m.id === updatedMessage.id ? updatedMessage : m
  ))

  // Chieu nguoc: Dai ly gui booking -> Factory xac nhan -> thong bao
  if (
    updatedMessage.message_type === 'booking' &&
    updatedMessage.sender_type === 'partner' &&  // Dai ly gui
    updatedMessage.metadata?.booking?.status === 'confirmed'
  ) {
    // Factory da xac nhan va tao Deal roi (phia ERP xu ly)
    // Chi can thong bao cho dai ly
    message.success('Nha may da xac nhan phieu chot mu!')
  }
},
```

---

## 5. So do luong du lieu

```
=== CHIEU 1: Dai ly tao phieu ===

  [Dai ly App]                         [ERP / Nha may]
      |                                       |
  1.  Tao BookingFormModal                    |
  2.  sendMessage(booking, pending) -------->  |
      |                                  3. Hien thi BookingCard
      |                                     voi nut [Xac nhan]
      |                                  4. Click "Xac nhan"
      |                                  5. confirmBooking()
      |                                     -> status = confirmed
      |                                     -> createDealFromBooking()
      |  <-------- realtime UPDATE -----  6. Deal duoc tao
  7.  Nhan thong bao "Da xac nhan"           |


=== CHIEU 2: Factory tao phieu ===

  [ERP / Nha may]                      [Dai ly App]
      |                                       |
  1.  Tao BookingFormModal                    |
  2.  sendMessage(booking, pending) -------->  |
      |                                  3. Hien thi BookingCard
      |                                     voi nut [Xac nhan]
      |                                  4. Click "Xac nhan"
      |                                  5. confirmBooking()
      |                                     -> status = confirmed
      |                                     -> dealService.create()
      |  <-------- realtime UPDATE -----  6. Deal duoc tao
  7.  ERP phat hien confirmed                |
      -> auto createDealFromBooking()        |
      -> getDealByBookingId() kiem tra       |
      -> Deal da ton tai -> SKIP (khong trung)|
```

---

## 6. Chong trung Deal

Ca hai phia deu co the tao Deal khi booking duoc confirm. De tranh trung:

1. **`booking_id`** duoc luu vao bang `b2b.deals`, lien ket voi `message.id` cua tin nhan booking
2. Truoc khi tao Deal, **luon kiem tra** `getDealByBookingId(messageId)`:
   - Neu da co -> tra ve Deal cu
   - Neu chua co -> tao moi
3. DB column `booking_id` trong bang `b2b.deals` da co san (xac nhan tu `DealInput` phia dai ly)

---

## 7. Trang thai Booking

| Status | Label | Mau | Mo ta |
|--------|-------|-----|-------|
| `pending` | Cho xac nhan | Orange | Vua tao, cho ben kia phan hoi |
| `confirmed` | Da xac nhan | Green | Da dong y, Deal duoc tao tu dong |
| `negotiating` | Dang thuong luong | Blue | De xuat gia moi, cho phan hoi |
| `rejected` | Da tu choi | Red | Khong dong y, ket thuc |

---

## 8. Checklist

- [ ] Them `updateBookingStatus()` vao `chatMessageService`
- [ ] Them `confirmBooking()` vao `chatMessageService` (goi `dealService.create`)
- [ ] Them `rejectBooking()` vao `chatMessageService`
- [ ] Them `negotiateBooking()` vao `chatMessageService`
- [ ] Them `getDealByBookingId()` vao `dealService`
- [ ] Cap nhat `create()` trong `dealService` - kiem tra trung
- [ ] Hien thi nut hanh dong cho booking tu Factory (`sender_type === 'factory'`)
- [ ] Xu ly `handleBookingAction` (confirm/reject/negotiate)
- [ ] Them modal Thuong luong (counterPrice + notes)
- [ ] Realtime: thong bao khi Factory xac nhan phieu cua dai ly
- [ ] Test: Dai ly tao phieu -> Factory xac nhan -> Deal duoc tao
- [ ] Test: Factory tao phieu -> Dai ly xac nhan -> Deal duoc tao
- [ ] Test: Xac nhan 2 lan khong tao trung Deal
