// ============================================================================
// QUICK PAY MODAL — "Ghi nhận đã thu" dùng chung (trang Công nợ khách + kéo-thả Kanban)
// File: src/pages/sales/components/QuickPayModal.tsx
//
// Ghi 1 khoản thu qua salesOrderPaymentService (Cách A: thu đủ → đơn tự 'paid').
// Prefill số tiền = phần còn nợ. Gọi onDone() sau khi ghi thành công.
// ============================================================================

import { useState, useEffect } from 'react'
import { Modal, InputNumber, DatePicker, Select, Alert, Typography, message } from 'antd'
import { DollarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  salesOrderPaymentService, PAYMENT_TYPE_LABELS, type PaymentType,
} from '../../../services/sales/salesOrderPaymentService'

const { Text } = Typography

const fmtUSD = (v: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export interface QuickPayTarget {
  id: string
  label: string        // Số HĐ (hoặc mã đơn) hiển thị chính
  subLabel?: string     // Mã SO phụ (nếu có số HĐ)
  outstanding: number   // USD còn phải thu — prefill
}

interface Props {
  target: QuickPayTarget | null
  onClose: () => void
  onDone: () => void    // gọi sau khi ghi thu thành công (parent tự reload + đóng)
}

export default function QuickPayModal({ target, onClose, onDone }: Props) {
  const [amount, setAmount] = useState<number>(0)
  const [date, setDate] = useState<dayjs.Dayjs>(dayjs())
  const [type, setType] = useState<PaymentType>('final')
  const [bankRef, setBankRef] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (target) {
      setAmount(Math.round(target.outstanding * 100) / 100)
      setDate(dayjs())
      setType('final')
      setBankRef('')
    }
  }, [target])

  const submit = async () => {
    if (!target) return
    if (!amount || amount <= 0) { message.error('Nhập số tiền đã thu'); return }
    setSaving(true)
    try {
      await salesOrderPaymentService.create({
        sales_order_id: target.id,
        payment_date: date.format('YYYY-MM-DD'),
        amount,
        currency: 'USD',
        payment_type: type,
        bank_reference: bankRef.trim() || null,
      })
      message.success(`Đã ghi nhận thu ${fmtUSD(amount)} cho ${target.label}`)
      onDone()
    } catch (e: any) {
      message.error(e?.message || 'Lỗi ghi nhận thu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={<span><DollarOutlined style={{ color: '#15803d' }} /> Ghi nhận đã thu — {target?.label}</span>}
      open={!!target}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      okText="Xác nhận đã thu"
      cancelText="Hủy"
      okButtonProps={{ style: { background: '#15803d', borderColor: '#15803d' } }}
      destroyOnClose
    >
      {target && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fafafa', borderRadius: 8, padding: 10, fontSize: 13 }}>
            Đơn <strong>{target.label}</strong>
            {target.subLabel && <Text type="secondary" style={{ fontSize: 11 }}> ({target.subLabel})</Text>} · Còn nợ:{' '}
            <strong style={{ color: '#f5222d' }}>{fmtUSD(target.outstanding)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Số tiền đã thu (USD)</div>
            <InputNumber
              value={amount}
              onChange={(v) => setAmount(Number(v) || 0)}
              min={0} step={100} style={{ width: '100%' }}
              formatter={(v) => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => Number((v || '').replace(/[$,\s]/g, ''))}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Ngày tiền về</div>
              <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD/MM/YYYY" style={{ width: '100%' }} allowClear={false} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Loại</div>
              <Select value={type} onChange={(v) => setType(v)} style={{ width: '100%' }}
                options={Object.entries(PAYMENT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Số tham chiếu NH (tùy chọn)</div>
            <input
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              placeholder="VD: MT103 ref / số UNC"
              style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6 }}
            />
          </div>
          {amount >= target.outstanding && target.outstanding > 0 && (
            <Alert type="success" showIcon style={{ fontSize: 12 }}
              message="Thu ĐỦ → đơn tự chuyển 'đã thu đủ' và rời cột 'Đã giao khách' trên Kanban." />
          )}
        </div>
      )}
    </Modal>
  )
}
