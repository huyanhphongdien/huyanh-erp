// ============================================================================
// SHIPPING TAB — Tab Vận chuyển trong Detail Panel v4
// File: src/pages/sales/components/ShippingTab.tsx
// BP Logistics nhập: Booking, B/L, ETD/ETA, L/C, Chiết khấu, DHL
// ============================================================================

import { useState } from 'react'
import {
  Card,
  Descriptions,
  Tag,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Button,
  Space,
  Divider,
  message,
} from 'antd'
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import type { SalesRole } from '../../../services/sales/salesPermissionService'
import { isFieldEditableV4 } from '../../../services/sales/salesPermissionService'
import OrderActionButtons from './OrderActionButtons'

// ============================================================================
// HELPERS
// ============================================================================

const fmtDate = (d: string | undefined | null) => {
  if (!d) return '—'
  return dayjs(d).format('DD/MM/YYYY')
}

const fmtCurrency = (v: number | undefined | null) => {
  if (!v) return '—'
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

// L/C expiry warning
function lcExpiryTag(expiryDate: string | undefined | null) {
  if (!expiryDate) return <span style={{ color: '#ccc' }}>—</span>
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000)
  if (days <= 0) return <Tag color="red">Đã hết hạn ({Math.abs(days)} ngày)</Tag>
  if (days <= 7) return <Tag icon={<WarningOutlined />} color="red">{fmtDate(expiryDate)} — còn {days} ngày</Tag>
  if (days <= 20) return <Tag icon={<WarningOutlined />} color="orange">{fmtDate(expiryDate)} — còn {days} ngày</Tag>
  return <span>{fmtDate(expiryDate)}</span>
}

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  order: SalesOrder
  salesRole: SalesRole | null
  editable: boolean
  onSaved: () => void
}

const BL_TYPE_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: 'telex', label: 'Telex Release' },
  { value: 'surrendered', label: 'Surrendered' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function ShippingTab({ order, salesRole, editable, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const canEditLogistics = editable && (salesRole === 'logistics' || salesRole === 'admin')
  const canEditFinanceFields = isFieldEditableV4(salesRole, 'discount_exchange_rate') || salesRole === 'admin'

  const startEdit = () => {
    form.setFieldsValue({
      // Vận chuyển
      shipping_line: order.shipping_line,
      vessel_name: order.vessel_name,
      voyage_number: order.voyage_number,
      booking_reference: order.booking_reference,
      bl_number: order.bl_number,
      bl_type: order.bl_type,
      etd: order.etd ? dayjs(order.etd) : null,
      eta: order.eta ? dayjs(order.eta) : null,
      cutoff_date: order.cutoff_date ? dayjs(order.cutoff_date) : null,
      dhl_number: order.dhl_number,
      // L/C
      lc_number: order.lc_number,
      lc_bank: order.lc_bank,
      lc_expiry_date: order.lc_expiry_date ? dayjs(order.lc_expiry_date) : null,
      lc_amount: order.lc_amount,
      // Đặt cọc
      deposit_amount: order.deposit_amount,
      deposit_date: order.deposit_date ? dayjs(order.deposit_date) : null,
      deposit_note: order.deposit_note,
      // Chiết khấu
      discount_bank: order.discount_bank,
      discount_date: order.discount_date ? dayjs(order.discount_date) : null,
      discount_amount: order.discount_amount,
      bank_charges: order.bank_charges,
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    form.resetFields()
  }

  const handleSave = async () => {
    try {
      const vals = await form.validateFields()
      setSaving(true)

      const updateData: Record<string, any> = {
        shipping_line: vals.shipping_line || null,
        vessel_name: vals.vessel_name || null,
        voyage_number: vals.voyage_number || null,
        booking_reference: vals.booking_reference || null,
        bl_number: vals.bl_number || null,
        bl_type: vals.bl_type || null,
        etd: vals.etd?.format('YYYY-MM-DD') || null,
        eta: vals.eta?.format('YYYY-MM-DD') || null,
        cutoff_date: vals.cutoff_date?.format('YYYY-MM-DD') || null,
        dhl_number: vals.dhl_number || null,
        lc_number: vals.lc_number || null,
        lc_bank: vals.lc_bank || null,
        lc_expiry_date: vals.lc_expiry_date?.format('YYYY-MM-DD') || null,
        lc_amount: vals.lc_amount || null,
        deposit_amount: vals.deposit_amount || null,
        deposit_date: vals.deposit_date?.format('YYYY-MM-DD') || null,
        deposit_note: vals.deposit_note || null,
        discount_bank: vals.discount_bank || null,
        discount_date: vals.discount_date?.format('YYYY-MM-DD') || null,
        discount_amount: vals.discount_amount || null,
        bank_charges: vals.bank_charges || null,
      }

      // Auto calc: Còn lại = Thành tiền - Đặt cọc - Chiết khấu - Phí NH
      const totalUSD = order.total_value_usd || (order.quantity_tons * order.unit_price)
      const deposit = vals.deposit_amount || 0
      const discount = vals.discount_amount || 0
      const bankCharges = vals.bank_charges || 0
      updateData.remaining_amount = totalUSD - deposit - discount - bankCharges

      await salesOrderService.updateFields(order.id, updateData)
      message.success('Đã cập nhật vận chuyển')
      setEditing(false)
      onSaved()
    } catch (e: any) {
      if (e.errorFields) return
      message.error(e.message || 'Lỗi cập nhật')
    } finally {
      setSaving(false)
    }
  }

  // ── Computed ──
  const totalUSD = order.total_value_usd || (order.quantity_tons * order.unit_price)
  // Còn lại = Tổng HĐ - Đặt cọc - Chiết khấu - Phí NH
  const remainingAmount = (order.remaining_amount != null)
    ? order.remaining_amount
    : totalUSD - (order.deposit_amount || 0) - (order.discount_amount || 0) - (order.bank_charges || 0)

  // ══════════════════════════════════════════════════════════════
  // EDIT MODE
  // ══════════════════════════════════════════════════════════════

  if (editing) {
    return (
      <Form form={form} layout="vertical" size="small" style={{ padding: '8px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <Button icon={<CloseOutlined />} onClick={cancelEdit}>Hủy</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            style={{ background: '#d48806' }}
          >
            Lưu
          </Button>
        </div>

        {/* Booking & Tàu */}
        <SectionHeader title="Booking & Tàu" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Hãng tàu" name="shipping_line">
            <Input placeholder="Maersk, MSC..." />
          </Form.Item>
          <Form.Item label="Booking Ref" name="booking_reference">
            <Input placeholder="Booking number" />
          </Form.Item>
          <Form.Item label="Tàu / Chuyến" name="vessel_name">
            <Input placeholder="VD: MSC ANNA / VY2604E" />
          </Form.Item>
        </div>

        {/* B/L */}
        <SectionHeader title="Vận đơn (B/L)" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="B/L Number" name="bl_number">
            <Input placeholder="B/L number" />
          </Form.Item>
          <Form.Item label="B/L Type" name="bl_type">
            <Select allowClear options={BL_TYPE_OPTIONS} placeholder="Chọn..." />
          </Form.Item>
        </div>

        {/* Ngày */}
        <SectionHeader title="Ngày tháng" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="ETD" name="etd">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="ETA" name="eta">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Cutoff" name="cutoff_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </div>

        {/* DHL */}
        <Form.Item label="DHL Tracking" name="dhl_number">
          <Input placeholder="DHL tracking number" />
        </Form.Item>

        {/* L/C */}
        <SectionHeader title="L/C (Thư tín dụng)" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Số L/C" name="lc_number">
            <Input placeholder="L/C number" />
          </Form.Item>
          <Form.Item label="Ngân hàng phát hành" name="lc_bank">
            <Input placeholder="Issuing bank" />
          </Form.Item>
          <Form.Item label="Hạn L/C" name="lc_expiry_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Số tiền L/C (USD)" name="lc_amount">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" />
          </Form.Item>
        </div>

        {/* Đặt cọc */}
        <SectionHeader title="Đặt cọc" color="#722ed1" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Số tiền đặt cọc (USD)" name="deposit_amount">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" />
          </Form.Item>
          <Form.Item label="Ngày đặt cọc" name="deposit_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Ghi chú" name="deposit_note">
            <Input placeholder="VD: T/T 30% trước giao hàng" />
          </Form.Item>
        </div>

        {/* Chiết khấu */}
        <SectionHeader title="Chiết khấu Ngân hàng" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="NH chiết khấu" name="discount_bank">
            <Input placeholder="Ngân hàng" />
          </Form.Item>
          <Form.Item label="Ngày CK" name="discount_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Số tiền CK (USD)" name="discount_amount">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" />
          </Form.Item>
          <Form.Item label="Phí NH (USD)" name="bank_charges">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" />
          </Form.Item>
        </div>
      </Form>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // VIEW MODE
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <OrderActionButtons order={order} salesRole={salesRole} onSaved={onSaved} tab="shipping" size="small" />
        <div style={{ display: 'flex', gap: 8 }}>
          {canEditLogistics && (
            <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={startEdit}>
              Chỉnh sửa
            </Button>
          )}
        </div>
      </div>

      {/* Booking & Tàu */}
      <SectionHeader title="Booking & Tàu" color="#d48806" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Hãng tàu">{order.shipping_line || '—'}</Descriptions.Item>
        <Descriptions.Item label="Booking Ref">{order.booking_reference || '—'}</Descriptions.Item>
        <Descriptions.Item label="Tàu / Chuyến">{order.vessel_name || '—'}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* B/L */}
      <SectionHeader title="Vận đơn (B/L)" color="#d48806" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="B/L Number">
          {order.bl_number ? <Tag color="blue">{order.bl_number}</Tag> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="B/L Type">
          {BL_TYPE_OPTIONS.find(o => o.value === order.bl_type)?.label || order.bl_type || '—'}
        </Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Ngày tháng */}
      <SectionHeader title="Ngày tháng" color="#d48806" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="ETD">{fmtDate(order.etd)}</Descriptions.Item>
        <Descriptions.Item label="ETA">{fmtDate(order.eta)}</Descriptions.Item>
        <Descriptions.Item label="Cutoff">{fmtDate(order.cutoff_date)}</Descriptions.Item>
      </Descriptions>

      {/* DHL */}
      {order.dhl_number && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="DHL Tracking">{order.dhl_number}</Descriptions.Item>
          </Descriptions>
        </>
      )}

      <Divider style={{ margin: '12px 0' }} />

      {/* L/C */}
      <SectionHeader title="L/C (Thư tín dụng)" color="#d48806" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Số L/C">
          {order.lc_number ? <Tag color="purple">{order.lc_number}</Tag> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="NH phát hành">{order.lc_bank || '—'}</Descriptions.Item>
        <Descriptions.Item label="Hạn L/C">{lcExpiryTag(order.lc_expiry_date)}</Descriptions.Item>
        <Descriptions.Item label="Số tiền L/C">{fmtCurrency(order.lc_amount)}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Đặt cọc */}
      <SectionHeader title="Đặt cọc" color="#722ed1" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="Số tiền">{fmtCurrency(order.deposit_amount)}</Descriptions.Item>
        <Descriptions.Item label="Ngày">{fmtDate(order.deposit_date)}</Descriptions.Item>
        <Descriptions.Item label="Ghi chú">{order.deposit_note || '—'}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Chiết khấu */}
      <SectionHeader title="Chiết khấu Ngân hàng" color="#d48806" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="NH chiết khấu">{order.discount_bank || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày CK">{fmtDate(order.discount_date)}</Descriptions.Item>
        <Descriptions.Item label="Số tiền CK">{fmtCurrency(order.discount_amount)}</Descriptions.Item>
        <Descriptions.Item label="Phí NH">{fmtCurrency(order.bank_charges)}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Tổng hợp */}
      <SectionHeader title="Tổng hợp" color="#666" />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        padding: 12,
        background: '#fafafa',
        borderRadius: 8,
      }}>
        <SummaryCard label="Tổng HĐ" value={fmtCurrency(totalUSD)} color="#1B4D3E" />
        <SummaryCard label="Đặt cọc" value={fmtCurrency(order.deposit_amount)} color="#722ed1" />
        <SummaryCard label="Chiết khấu" value={fmtCurrency(order.discount_amount)} color="#d48806" />
        <SummaryCard label="Phí NH" value={fmtCurrency(order.bank_charges)} color="#cf1322" />
        <SummaryCard label="Còn lại" value={fmtCurrency(remainingAmount)} color="#1677ff" bold />
      </div>
    </div>
  )
}

// ── Helpers ──

function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
      color, letterSpacing: 1, marginBottom: 8, marginTop: 4,
    }}>
      {title}
    </div>
  )
}

function SummaryCard({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 700 : 600, color }}>{value}</div>
    </div>
  )
}
