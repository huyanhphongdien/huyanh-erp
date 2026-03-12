# BookingCard Component - Ant Design (Phia Dai ly)

> Copy component nay vao du an B2B phia Dai ly.
> Su dung Ant Design, giao dien giong hoan toan phia ERP Nha may.

---

## 1. Dependencies

```bash
npm install antd @ant-design/icons date-fns
```

---

## 2. File: `src/components/chat/BookingCard.tsx`

Copy nguyen file nay:

```tsx
// ============================================================================
// BOOKING CARD — Hien thi phieu chot mu trong chat
// File: src/components/chat/BookingCard.tsx
// Dung chung cho ca Partner va Factory side
// ============================================================================

import { Card, Tag, Space, Button, Row, Col, Divider, Typography } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons'

const { Text } = Typography

// ============================================
// TYPES
// ============================================

export interface BookingMetadata {
  code: string
  product_type: 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to'
  quantity_tons: number
  drc_percent: number
  price_per_kg: number
  price_unit: 'wet' | 'dry'
  estimated_value: number
  delivery_date: string
  notes?: string
  status: 'pending' | 'confirmed' | 'negotiating' | 'rejected'
  counter_price?: number
  negotiation_notes?: string
}

// ============================================
// CONSTANTS
// ============================================

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  mu_nuoc: 'Mu nuoc',
  mu_tap: 'Mu tap',
  mu_dong: 'Mu dong',
  mu_chen: 'Mu chen',
  mu_to: 'Mu to',
}

const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: 'Cho xac nhan',
  confirmed: 'Da xac nhan',
  negotiating: 'Dang thuong luong',
  rejected: 'Da tu choi',
}

const BOOKING_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  confirmed: 'green',
  negotiating: 'blue',
  rejected: 'red',
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

// ============================================
// COMPONENT PROPS
// ============================================

interface BookingCardProps {
  /** Du lieu booking tu message.metadata.booking */
  booking: BookingMetadata
  /** ID cua tin nhan chua booking */
  messageId: string
  /**
   * true = tin nhan nay tu phia doi dien (hien thi nut hanh dong)
   * - Phia Dai ly: true khi sender_type === 'factory'
   * - Phia Factory: true khi sender_type === 'partner'
   */
  isFromOpposite: boolean
  /** Callback khi nhan "Xac nhan phieu" */
  onConfirm: () => void
  /** Callback khi nhan "Tu choi" */
  onReject: () => void
  /** Callback khi nhan "Thuong luong" */
  onNegotiate: () => void
}

// ============================================
// COMPONENT
// ============================================

const BookingCard = ({
  booking,
  messageId,
  isFromOpposite,
  onConfirm,
  onReject,
  onNegotiate,
}: BookingCardProps) => {
  if (!booking) {
    return (
      <Card size="small" style={{ width: 320, borderRadius: 12 }}>
        <Text type="secondary">Khong co du lieu phieu chot</Text>
      </Card>
    )
  }

  const isPending = booking.status === 'pending'
  const isNegotiating = booking.status === 'negotiating'
  const isConfirmed = booking.status === 'confirmed'
  const isRejected = booking.status === 'rejected'

  return (
    <Card
      size="small"
      style={{
        width: 320,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 12,
        border: 'none',
      }}
      styles={{ body: { padding: 16 } }}
    >
      {/* ===== HEADER ===== */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text strong style={{ color: '#fff', fontSize: 14 }}>
            {'\u{1F4CB}'} Phieu chot mu
          </Text>
          <Tag color={BOOKING_STATUS_COLORS[booking.status]}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </Tag>
        </div>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
          {booking.code}
        </Text>
      </div>

      {/* ===== CONTENT ===== */}
      <div
        style={{
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Row gutter={[8, 8]}>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              Loai mu
            </Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {PRODUCT_TYPE_LABELS[booking.product_type] || booking.product_type}
            </Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              So luong
            </Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {booking.quantity_tons} tan
            </Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              DRC
            </Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {booking.drc_percent}%
            </Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              Don gia ({booking.price_unit === 'dry' ? 'kho' : 'uot'})
            </Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {booking.price_per_kg?.toLocaleString() || '—'} d/kg
            </Text>
          </Col>
        </Row>

        <Divider
          style={{ margin: '12px 0', borderColor: 'rgba(255,255,255,0.2)' }}
        />

        {/* Gia tri uoc tinh */}
        <div style={{ textAlign: 'right' }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
            Gia tri uoc tinh
          </Text>
          <br />
          <Text strong style={{ color: '#ffd700', fontSize: 16 }}>
            {formatCurrency(booking.estimated_value)}
          </Text>
        </div>

        {/* Thong tin thuong luong */}
        {isNegotiating && booking.counter_price && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 6,
            }}
          >
            <Text style={{ color: '#ffd700', fontSize: 12 }}>
              {'\u{1F4B0}'} Gia de xuat: {booking.counter_price?.toLocaleString()} d/kg
            </Text>
            {booking.negotiation_notes && (
              <div>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {booking.negotiation_notes}
                </Text>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== NOTES ===== */}
      {booking.notes && (
        <div style={{ marginBottom: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
            {'\u{1F4DD}'} {booking.notes}
          </Text>
        </div>
      )}

      {/* ===== CONFIRMED / REJECTED BADGE ===== */}
      {isConfirmed && (
        <div
          style={{
            textAlign: 'center',
            padding: '8px 0',
            background: 'rgba(82,196,26,0.15)',
            borderRadius: 10,
          }}
        >
          <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
          <Text strong style={{ color: '#52c41a', fontSize: 13 }}>
            Da xac nhan - Deal da duoc tao
          </Text>
        </div>
      )}

      {isRejected && (
        <div
          style={{
            textAlign: 'center',
            padding: '8px 0',
            background: 'rgba(239,68,68,0.15)',
            borderRadius: 10,
          }}
        >
          <CloseCircleOutlined style={{ color: '#ff6b6b', marginRight: 6 }} />
          <Text strong style={{ color: '#ff6b6b', fontSize: 13 }}>
            Da tu choi
          </Text>
        </div>
      )}

      {/* ===== ACTION BUTTONS (2 hang) ===== */}
      {isFromOpposite && (isPending || isNegotiating) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Hang 1: Xac nhan (noi bat, full-width) */}
          <Button
            type="primary"
            block
            icon={<CheckCircleOutlined />}
            style={{
              background: '#52c41a',
              borderColor: '#52c41a',
              borderRadius: 10,
              height: 38,
              fontWeight: 600,
            }}
            onClick={onConfirm}
          >
            Xac nhan phieu
          </Button>

          {/* Hang 2: Thuong luong + Tu choi */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              block
              icon={<DollarOutlined />}
              style={{
                flex: 1,
                borderRadius: 10,
                height: 36,
                background: 'rgba(255,255,255,0.15)',
                borderColor: 'rgba(255,255,255,0.3)',
                color: '#fff',
              }}
              onClick={onNegotiate}
            >
              Thuong luong
            </Button>
            <Button
              block
              danger
              icon={<CloseCircleOutlined />}
              style={{
                flex: 1,
                borderRadius: 10,
                height: 36,
                background: 'rgba(239,68,68,0.15)',
                borderColor: 'rgba(239,68,68,0.4)',
                color: '#ff6b6b',
              }}
              onClick={onReject}
            >
              Tu choi
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default BookingCard
```

---

## 3. Cach su dung trong ChatRoomPage

### 3.1. Import

```tsx
import BookingCard from '../../components/chat/BookingCard'
import type { BookingMetadata } from '../../components/chat/BookingCard'
```

### 3.2. Render trong MessageBubble

```tsx
// Trong ham renderContent() cua MessageBubble:

case 'booking': {
  // Doc booking data (ho tro ca nested va flat format)
  const bookingData = (message.metadata?.booking || message.metadata) as BookingMetadata

  return (
    <BookingCard
      booking={bookingData}
      messageId={message.id}
      isFromOpposite={message.sender_type === 'factory'}  // Phia dai ly: factory la doi dien
      onConfirm={() => onBookingAction(message.id, 'confirm')}
      onReject={() => onBookingAction(message.id, 'reject')}
      onNegotiate={() => onBookingAction(message.id, 'negotiate')}
    />
  )
}
```

### 3.3. Luu y khi render MessageBubble chua BookingCard

BookingCard co gradient background rieng, nen MessageBubble **khong can** background:

```tsx
// Trong MessageBubble wrapper:
<div
  style={{
    maxWidth: '70%',
    // Neu la booking -> bo nen + padding
    padding: message.message_type === 'booking' ? 0 : '8px 12px',
    borderRadius: 12,
    backgroundColor: message.message_type === 'booking'
      ? 'transparent'
      : isOwn ? '#1677ff' : '#f0f0f0',
    color: isOwn && message.message_type !== 'booking' ? '#fff' : 'inherit',
  }}
>
  {renderContent()}
</div>
```

---

## 4. Handler xu ly booking actions

```tsx
// State
const [negotiateModal, setNegotiateModal] = useState<{
  visible: boolean
  messageId: string | null
}>({ visible: false, messageId: null })
const [negotiateForm] = Form.useForm()

// Handler chinh
const handleBookingAction = async (
  messageId: string,
  action: 'confirm' | 'reject' | 'negotiate'
) => {
  if (action === 'negotiate') {
    setNegotiateModal({ visible: true, messageId })
    return
  }

  try {
    if (action === 'confirm') {
      // currentPartnerId = ID cua dai ly dang login
      const { deal } = await chatMessageService.confirmBooking(messageId, currentPartnerId)
      message.success(`Da xac nhan & tao Deal ${deal.deal_number}`)
    } else {
      await chatMessageService.rejectBooking(messageId)
      message.success('Da tu choi phieu chot mu')
    }
  } catch (error) {
    console.error('Booking action error:', error)
    message.error('Khong the cap nhat phieu chot mu')
  }
}

// Handler thuong luong
const handleNegotiateSubmit = async () => {
  if (!negotiateModal.messageId) return

  try {
    const values = await negotiateForm.validateFields()
    await chatMessageService.negotiateBooking(
      negotiateModal.messageId,
      values.counterPrice,
      values.notes
    )
    message.success('Da gui de xuat gia')
    setNegotiateModal({ visible: false, messageId: null })
    negotiateForm.resetFields()
  } catch (error) {
    message.error('Khong the gui de xuat')
  }
}
```

---

## 5. Modal thuong luong

```tsx
import { Modal, Form, InputNumber, Input } from 'antd'

const { TextArea } = Input

// Trong JSX:
<Modal
  title="Thuong luong gia"
  open={negotiateModal.visible}
  onOk={handleNegotiateSubmit}
  onCancel={() => {
    setNegotiateModal({ visible: false, messageId: null })
    negotiateForm.resetFields()
  }}
  okText="Gui de xuat"
  cancelText="Huy"
>
  <Form form={negotiateForm} layout="vertical">
    <Form.Item
      name="counterPrice"
      label="Gia de xuat (d/kg)"
      rules={[{ required: true, message: 'Vui long nhap gia de xuat' }]}
    >
      <InputNumber<number>
        style={{ width: '100%' }}
        min={0}
        formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, '')) || 0}
        placeholder="Nhap gia de xuat"
      />
    </Form.Item>
    <Form.Item name="notes" label="Ghi chu">
      <TextArea rows={3} placeholder="Ly do thuong luong..." />
    </Form.Item>
  </Form>
</Modal>
```

---

## 6. Ant Design imports tong hop

Tat ca imports can dung cho BookingCard va cac handler:

```tsx
import {
  Card,
  Tag,
  Space,
  Button,
  Row,
  Col,
  Divider,
  Typography,
  Modal,
  Form,
  InputNumber,
  Input,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons'
```

---

## 7. Style summary

| Thanh phan | Gia tri |
|------------|---------|
| Card width | 320px |
| Card background | `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` |
| Card border-radius | 12px |
| Content box bg | `rgba(255,255,255,0.15)` |
| Label color | `rgba(255,255,255,0.7)`, font 11px |
| Value color | `#fff`, font 13px, bold |
| Estimated value | `#ffd700` (gold), font 16px, bold |
| Divider color | `rgba(255,255,255,0.2)` |
| Confirm button | bg `#52c41a`, height 38, radius 10, bold |
| Negotiate button | bg `rgba(255,255,255,0.15)`, border `rgba(255,255,255,0.3)`, text `#fff` |
| Reject button | bg `rgba(239,68,68,0.15)`, border `rgba(239,68,68,0.4)`, text `#ff6b6b` |
| Button layout | 2 hang: Confirm full-width tren, Negotiate + Reject chia doi duoi |
| Status tag | pending=orange, confirmed=green, negotiating=blue, rejected=red |
