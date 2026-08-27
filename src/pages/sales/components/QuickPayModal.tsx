// ============================================================================
// QUICK PAY MODAL — "Ghi nhận đã thu" dùng chung (trang Công nợ khách + kéo-thả Kanban)
// File: src/pages/sales/components/QuickPayModal.tsx
//
// Ghi 1 khoản thu qua salesOrderPaymentService (Cách A: thu đủ → đơn tự 'paid').
// Prefill số tiền = phần còn nợ. Gọi onDone() sau khi ghi thành công.
// ============================================================================

import { useState, useEffect } from 'react'
import { Modal, InputNumber, DatePicker, Select, Alert, Tag, Typography, message } from 'antd'
import { DollarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  salesOrderPaymentService, PAYMENT_TYPE_LABELS, type PaymentType, type OrderPaymentBreakdown,
} from '../../../services/sales/salesOrderPaymentService'

const LOT_STATUS_TAG: Record<string, { color: string; label: string }> = {
  paid: { color: 'green', label: 'đã thu' },
  partial: { color: 'gold', label: 'thu 1 phần' },
  unpaid: { color: 'red', label: 'chưa thu' },
}

const { Text } = Typography

const fmtUSD = (v: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export interface QuickPayTarget {
  id: string
  label: string        // Số HĐ (hoặc mã đơn) hiển thị chính
  subLabel?: string     // Mã SO phụ (nếu có số HĐ)
  outstanding: number   // USD còn phải thu — prefill
  /**
   * Mở modal với lô này chọn sẵn (dùng từ trang Sổ lô, nơi người dùng bấm đúng dòng lô).
   * Bỏ trống = mặc định "cả đơn" như cũ. Số tiền vẫn prefill lại theo còn-nợ của lô
   * ngay khi bóc tách lô tải xong.
   */
  presetLotNo?: number | null
}

interface Props {
  target: QuickPayTarget | null
  onClose: () => void
  onDone: () => void    // gọi sau khi ghi thu thành công (parent tự reload + đóng)
  /** Mở tab Đóng gói của đơn để đi chia lô. Không truyền thì chỉ ẩn cái link. */
  onGotoPacking?: (orderId: string) => void
}

export default function QuickPayModal({ target, onClose, onDone, onGotoPacking }: Props) {
  const [amount, setAmount] = useState<number>(0)
  const [date, setDate] = useState<dayjs.Dayjs>(dayjs())
  const [type, setType] = useState<PaymentType>('final')
  const [bankRef, setBankRef] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [breakdown, setBreakdown] = useState<OrderPaymentBreakdown | null>(null)
  const [lotNo, setLotNo] = useState<number | null>(null)   // null = cả đơn

  /**
   * Lô còn nợ CŨ NHẤT (số lô nhỏ nhất còn dư) — mặc định hợp lý nhất khi tiền về mà
   * người nhập không nói rõ lô: khách trả theo thứ tự lô, và waterfall lấp lô cũ trước.
   * Trả null khi đơn chưa chia lô hoặc mọi lô đã thu đủ.
   *
   * ⚠ KHÔNG chia đều tiền cho các lô còn nợ. Chia ĐỀU chính là prorata đội tên khác —
   * xem luật cấm trong CLAUDE.md. Muốn rải nhiều lô thì ghi nhiều dòng thu.
   */
  const oldestUnpaidLot = (b: OrderPaymentBreakdown): number | null => {
    if (!b.hasLots) return null
    const owing = b.lots
      .filter((l) => l.lotValue - l.paidAmount > 0.01)
      .sort((a, c) => a.lotNo - c.lotNo)
    return owing.length ? owing[0].lotNo : null
  }

  // Nạp bóc tách theo lô khi mở modal (để cho chọn lô + prefill còn nợ theo lô)
  useEffect(() => {
    if (!target) return
    const preset = target.presetLotNo ?? null
    setBreakdown(null)
    setLotNo(preset)
    setAmount(Math.round(target.outstanding * 100) / 100)
    setDate(dayjs())
    setType('final')
    setBankRef('')
    let alive = true
    salesOrderPaymentService.getLotBreakdown(target.id)
      .then((b) => {
        if (!alive) return
        setBreakdown(b)
        // Bóc tách về sau khi modal đã mở → prefill lại số tiền theo còn-nợ của LÔ được
        // chọn sẵn. Không làm bước này thì ô tiền giữ nguyên số còn-nợ CẢ ĐƠN, dễ ghi thừa.
        //
        // ⚠ ĐƯỜNG ÍT TRỞ LỰC NHẤT PHẢI DẪN TỚI "CÓ LÔ".
        // Bản cũ mặc định lot_no = null và ô chọn lô còn bị ẩn hẳn với đơn chưa chia lô,
        // nên bỏ qua nó là hợp lệ và là thao tác dễ nhất — kết quả là 0 khoản thu nào
        // trong hệ thống có số lô. Nay nếu chỗ gọi không chỉ định lô thì tự chọn LÔ NỢ
        // CŨ NHẤT còn dư. Vẫn đổi sang "cả đơn" được, chỉ là phải bấm.
        const chosen = preset ?? oldestUnpaidLot(b)
        if (chosen !== preset) setLotNo(chosen)
        if (chosen != null) {
          const row = b.lots.find((l) => l.lotNo === chosen)
          if (row) setAmount(Math.max(0, Math.round((row.lotValue - row.paidAmount) * 100) / 100))
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [target])

  // Còn nợ theo lựa chọn hiện tại (cả đơn hay 1 lô)
  const lotRow = lotNo != null ? breakdown?.lots.find((l) => l.lotNo === lotNo) : null
  const currentOutstanding = lotRow
    ? Math.max(0, Math.round((lotRow.lotValue - lotRow.paidAmount) * 100) / 100)
    : target?.outstanding ?? 0

  // Khi đổi lô → prefill số tiền = còn nợ của lô đó
  const onLotChange = (v: number | null) => {
    setLotNo(v)
    const row = v != null ? breakdown?.lots.find((l) => l.lotNo === v) : null
    const out = row ? Math.max(0, row.lotValue - row.paidAmount) : (breakdown ? breakdown.totalValue - breakdown.totalPaid : target?.outstanding ?? 0)
    setAmount(Math.round(out * 100) / 100)
  }

  const submit = async () => {
    if (!target) return
    if (!amount || amount <= 0) { message.error('Nhập số tiền đã thu'); return }
    setSaving(true)
    try {
      await salesOrderPaymentService.create({
        sales_order_id: target.id,
        lot_no: lotNo,
        payment_date: date.format('YYYY-MM-DD'),
        amount,
        currency: 'USD',
        payment_type: type,
        bank_reference: bankRef.trim() || null,
      })
      message.success(`Đã ghi nhận thu ${fmtUSD(amount)} cho ${target.label}${lotNo != null ? ` · Lô ${lotNo}` : ''}`)
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
            {target.subLabel && <Text type="secondary" style={{ fontSize: 11 }}> ({target.subLabel})</Text>} · Còn nợ{lotRow ? ` Lô ${lotRow.lotNo}` : ' (cả đơn)'}:{' '}
            <strong style={{ color: '#f5222d' }}>{fmtUSD(currentOutstanding)}</strong>
          </div>
          {/* ⚠ Ô này LUÔN hiện, kể cả đơn chưa chia lô. Bản cũ ẩn hẳn nó khi !hasLots —
              mà 80/89 đơn công nợ chưa chia lô, nên hầu hết người nhập chưa từng THẤY
              ô này tồn tại, và không ai hình thành được thói quen ghi thu kèm lô.
              Đơn chưa chia lô thì khoá ô + chỉ đường đi chia, NHƯNG VẪN CHO LƯU:
              chặn ghi tiền ở đây là đẩy kế toán quay về gõ tay cột tiền trên đơn. */}
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Thu cho lô nào?</div>
            {breakdown?.hasLots ? (
              <>
                <Select
                  value={lotNo}
                  onChange={onLotChange}
                  style={{ width: '100%' }}
                  options={[
                    ...breakdown.lots.map((l) => ({
                      value: l.lotNo,
                      label: (
                        <span>Lô {l.lotNo} — trị giá {fmtUSD(l.lotValue)} · còn nợ <b>{fmtUSD(Math.max(0, l.lotValue - l.paidAmount))}</b>{' '}
                          <Tag color={LOT_STATUS_TAG[l.status].color} style={{ marginInlineEnd: 0 }}>{LOT_STATUS_TAG[l.status].label}</Tag></span>
                      ),
                    })),
                    // "Cả đơn" XUỐNG CUỐI và đổi nhãn. Nó vẫn là lựa chọn hợp lệ (tiền
                    // gộp nhiều lô, cọc trước khi chia lô…), chỉ thôi làm mặc định.
                    {
                      value: null,
                      label: <span style={{ color: '#8a5a05' }}>Cả đơn — chưa quy được về lô (còn nợ {fmtUSD(breakdown.totalValue - breakdown.totalPaid)})</span>,
                    },
                  ]}
                />
                <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                  {lotNo == null
                    ? '⚠ Khoản này sẽ KHÔNG gắn được vào lô nào — báo cáo công nợ sẽ xếp nó vào phần "chưa gắn lô".'
                    : 'Đã chọn sẵn lô còn nợ cũ nhất. Đổi được nếu khách trả cho lô khác.'}
                </div>
              </>
            ) : (
              <>
                <Select style={{ width: '100%' }} disabled placeholder="Đơn này chưa chia lô" />
                <div style={{ fontSize: 11, color: '#8a5a05', marginTop: 3 }}>
                  Đơn chưa chia lô nên khoản thu chỉ ghi được ở mức cả đơn.{' '}
                  {onGotoPacking && (
                    <a onClick={() => onGotoPacking(target.id)}>Chia lô ngay ↗</a>
                  )}
                </div>
              </>
            )}
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
          {lotRow
            ? amount >= currentOutstanding && currentOutstanding > 0 && (
                <Alert type="success" showIcon style={{ fontSize: 12 }}
                  message={`Thu ĐỦ Lô ${lotRow.lotNo}. Đơn chỉ chuyển 'đã thu đủ' khi TẤT CẢ lô thu xong.`} />
              )
            : amount >= currentOutstanding && currentOutstanding > 0 && (
                <Alert type="success" showIcon style={{ fontSize: 12 }}
                  message="Thu ĐỦ → đơn tự chuyển 'đã thu đủ' và rời cột 'Đã giao khách' trên Kanban." />
              )}
        </div>
      )}
    </Modal>
  )
}
