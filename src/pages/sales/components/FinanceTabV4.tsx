// ============================================================================
// FINANCE TAB v4 — Tab Tài chính trong Detail Panel v4
// File: src/pages/sales/components/FinanceTabV4.tsx
// BP Kế toán nhập: tỷ giá, payment, net revenue
// ============================================================================

import { useState } from 'react'
import {
  Descriptions,
  Tag,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Button,
  Divider,
  Alert,
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
import { PAYMENT_TERMS_LABELS, type PaymentTerms } from '../../../services/sales/salesTypes'
import type { SalesRole } from '../../../services/sales/salesPermissionService'

// ============================================================================
// HELPERS
// ============================================================================

const fmtDate = (d: string | undefined | null) => d ? dayjs(d).format('DD/MM/YYYY') : '—'

const fmtUSD = (v: number | undefined | null) => {
  if (v == null) return '—'
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

const fmtVND = (v: number | undefined | null) => {
  if (v == null || v === 0) return '—'
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} tỷ`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} tr`
  return v.toLocaleString('vi-VN') + ' đ'
}

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Chưa TT' },
  { value: 'partial', label: 'TT một phần' },
  { value: 'paid', label: 'Đã TT đủ' },
]

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid: 'orange',
  partial: 'blue',
  paid: 'green',
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

// ============================================================================
// COMPONENT
// ============================================================================

export default function FinanceTabV4({ order, salesRole, editable, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const canEdit = editable && (salesRole === 'accounting' || salesRole === 'admin')

  // ── Computed ──
  const totalUSD = order.total_value_usd || (order.quantity_tons * order.unit_price)
  const exchangeRate = order.exchange_rate || 0
  const totalVND = exchangeRate > 0 ? totalUSD * exchangeRate : (order.total_value_vnd || 0)
  const deposit = order.deposit_amount || 0
  const discount = order.discount_amount || 0
  const bankCharges = order.bank_charges || 0
  const commissionAmt = order.commission_amount
    || ((order.commission_usd_per_mt || 0) > 0
        ? (order.quantity_tons || 0) * (order.commission_usd_per_mt || 0)
        : totalUSD * (order.commission_pct || 0) / 100)
  const remainingAmount = order.remaining_amount ?? (totalUSD - deposit - discount - bankCharges)
  const netRevenue = order.net_revenue ?? (totalUSD - deposit - discount - bankCharges - commissionAmt)
  const discountExRate = order.discount_exchange_rate || 0

  // L/C warning
  const lcDaysLeft = order.lc_expiry_date
    ? Math.ceil((new Date(order.lc_expiry_date).getTime() - Date.now()) / 86400000)
    : null

  const startEdit = () => {
    form.setFieldsValue({
      exchange_rate: order.exchange_rate,
      discount_exchange_rate: order.discount_exchange_rate,
      payment_status: order.payment_status || 'unpaid',
      payment_received_date: order.payment_received_date ? dayjs(order.payment_received_date) : null,
      actual_payment_amount: order.actual_payment_amount,
      bank_charges: order.bank_charges,
      bank_name: order.bank_name,
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

      const exRate = vals.exchange_rate || 0
      const discExRate = vals.discount_exchange_rate || 0
      const charges = vals.bank_charges || 0

      // Recalc
      const totalVndCalc = exRate > 0 ? totalUSD * exRate : null
      const discountVnd = discExRate > 0 && discount > 0 ? discount * discExRate : null
      const dep = order.deposit_amount || 0
      const netRev = totalUSD - dep - discount - charges - commissionAmt

      const updateData: Record<string, any> = {
        exchange_rate: exRate || null,
        discount_exchange_rate: discExRate || null,
        total_value_vnd: totalVndCalc,
        payment_status: vals.payment_status || 'unpaid',
        payment_received_date: vals.payment_received_date?.format('YYYY-MM-DD') || null,
        actual_payment_amount: vals.actual_payment_amount || null,
        bank_charges: charges || null,
        bank_name: vals.bank_name || null,
        net_revenue: netRev,
        remaining_amount: totalUSD - dep - discount - charges,
      }

      await salesOrderService.updateFields(order.id, updateData)
      message.success('Đã cập nhật tài chính')
      setEditing(false)
      onSaved()
    } catch (e: any) {
      if (e.errorFields) return
      message.error(e.message || 'Lỗi cập nhật')
    } finally {
      setSaving(false)
    }
  }

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
            style={{ background: '#cf1322' }}
          >
            Lưu
          </Button>
        </div>

        {/* Tỷ giá */}
        <SectionHeader title="Tỷ giá" color="#cf1322" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Tỷ giá USD/VND" name="exchange_rate">
            <InputNumber min={0} step={100} style={{ width: '100%' }} placeholder="VD: 25,400" />
          </Form.Item>
          <Form.Item label="Tỷ giá CK (chiết khấu)" name="discount_exchange_rate">
            <InputNumber min={0} step={100} style={{ width: '100%' }} placeholder="VD: 25,350" />
          </Form.Item>
        </div>

        {/* Thanh toán */}
        <SectionHeader title="Thanh toán" color="#cf1322" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Trạng thái TT" name="payment_status">
            <Select options={PAYMENT_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label="Ngày tiền về" name="payment_received_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Số tiền thực nhận (USD)" name="actual_payment_amount">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" />
          </Form.Item>
          <Form.Item label="Phí NH (USD)" name="bank_charges">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" />
          </Form.Item>
        </div>

        <Form.Item label="Ngân hàng nhận" name="bank_name">
          <Input placeholder="Tên ngân hàng" />
        </Form.Item>
      </Form>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // VIEW MODE
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '8px 0' }}>
      {/* L/C warning */}
      {lcDaysLeft !== null && lcDaysLeft <= 20 && (
        <Alert
          type={lcDaysLeft <= 7 ? 'error' : 'warning'}
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 12 }}
          message={
            lcDaysLeft <= 0
              ? `L/C đã hết hạn ${Math.abs(lcDaysLeft)} ngày!`
              : `L/C còn ${lcDaysLeft} ngày — hết hạn ${fmtDate(order.lc_expiry_date)}`
          }
        />
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {canEdit && (
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={startEdit}>
            Chỉnh sửa
          </Button>
        )}
      </div>

      {/* Tỷ giá */}
      <SectionHeader title="Tỷ giá" color="#cf1322" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Tỷ giá USD/VND">
          {exchangeRate > 0
            ? <strong>{exchangeRate.toLocaleString('vi-VN')}</strong>
            : <span style={{ color: '#ccc' }}>Chưa nhập</span>}
        </Descriptions.Item>
        <Descriptions.Item label="Tỷ giá CK">
          {discountExRate > 0
            ? discountExRate.toLocaleString('vi-VN')
            : <span style={{ color: '#ccc' }}>Chưa nhập</span>}
        </Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Thanh toán */}
      <SectionHeader title="Thanh toán" color="#cf1322" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Điều khoản">
          {PAYMENT_TERMS_LABELS[order.payment_terms as PaymentTerms] || order.payment_terms || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Trạng thái">
          <Tag color={PAYMENT_STATUS_COLORS[order.payment_status || 'unpaid'] || 'default'}>
            {PAYMENT_STATUS_OPTIONS.find(o => o.value === (order.payment_status || 'unpaid'))?.label || 'Chưa TT'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Ngày tiền về">{fmtDate(order.payment_received_date)}</Descriptions.Item>
        <Descriptions.Item label="Thực nhận">{fmtUSD(order.actual_payment_amount)}</Descriptions.Item>
        <Descriptions.Item label="Phí NH">{fmtUSD(order.bank_charges)}</Descriptions.Item>
        <Descriptions.Item label="NH nhận">{order.bank_name || '—'}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Tổng hợp tài chính */}
      <SectionHeader title="Tổng hợp" color="#cf1322" />
      <div style={{
        background: '#fafafa',
        borderRadius: 8,
        padding: 16,
        border: '1px solid #f0f0f0',
      }}>
        {/* Summary table */}
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            <SummaryRow label="Tổng giá trị HĐ (USD)" value={fmtUSD(totalUSD)} />
            <SummaryRow label="Đặt cọc" value={deposit > 0 ? `- ${fmtUSD(deposit)}` : '—'} color="#722ed1" />
            <SummaryRow label="Chiết khấu NH" value={discount > 0 ? `- ${fmtUSD(discount)}` : '—'} color="#d48806" />
            <SummaryRow label="Phí ngân hàng" value={bankCharges > 0 ? `- ${fmtUSD(bankCharges)}` : '—'} color="#cf1322" />
            <SummaryRow label="Hoa hồng" value={commissionAmt > 0
              ? `- ${fmtUSD(commissionAmt)} (${(order.commission_usd_per_mt || 0) > 0 ? `$${order.commission_usd_per_mt}/MT` : `${order.commission_pct || 0}%`})`
              : '—'} color="#722ed1" />
            <tr><td colSpan={2}><Divider style={{ margin: '6px 0' }} /></td></tr>
            <SummaryRow label="Còn lại (sau CK + phí)" value={fmtUSD(remainingAmount)} bold />
            <SummaryRow label="Doanh thu ròng (sau hoa hồng)" value={fmtUSD(netRevenue)} bold color="#1B4D3E" />
            {totalVND > 0 && (
              <SummaryRow label="Quy đổi VND" value={fmtVND(totalVND)} color="#666" />
            )}
          </tbody>
        </table>
      </div>

      {/* L/C info */}
      {order.lc_number && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <SectionHeader title="L/C" color="#666" />
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Số L/C"><Tag color="purple">{order.lc_number}</Tag></Descriptions.Item>
            <Descriptions.Item label="NH phát hành">{order.lc_bank || '—'}</Descriptions.Item>
            <Descriptions.Item label="Hạn L/C">
              {lcDaysLeft !== null ? (
                lcDaysLeft <= 0
                  ? <Tag color="red">Hết hạn</Tag>
                  : lcDaysLeft <= 7
                  ? <Tag color="red">{fmtDate(order.lc_expiry_date)} ({lcDaysLeft}d)</Tag>
                  : lcDaysLeft <= 20
                  ? <Tag color="orange">{fmtDate(order.lc_expiry_date)} ({lcDaysLeft}d)</Tag>
                  : <span>{fmtDate(order.lc_expiry_date)}</span>
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Số tiền L/C">{fmtUSD(order.lc_amount)}</Descriptions.Item>
          </Descriptions>
        </>
      )}
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

function SummaryRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <tr>
      <td style={{ padding: '4px 0', color: '#666' }}>{label}</td>
      <td style={{
        padding: '4px 0',
        textAlign: 'right',
        fontWeight: bold ? 700 : 500,
        fontSize: bold ? 15 : 13,
        color: color || '#333',
        fontFamily: 'monospace',
      }}>
        {value}
      </td>
    </tr>
  )
}
