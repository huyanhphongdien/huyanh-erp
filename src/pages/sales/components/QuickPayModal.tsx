// ============================================================================
// QUICK PAY MODAL — "Ghi nhận đã thu" dùng chung (trang Công nợ khách + kéo-thả Kanban)
// File: src/pages/sales/components/QuickPayModal.tsx
//
// Ghi 1 khoản thu qua salesOrderPaymentService (Cách A: thu đủ → đơn tự 'paid').
// Prefill số tiền = phần còn nợ. Gọi onDone() sau khi ghi thành công.
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { Modal, InputNumber, DatePicker, Select, Alert, Input, Typography, message } from 'antd'
import { DollarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  salesOrderPaymentService, PAYMENT_TYPE_LABELS, type PaymentType, type OrderPaymentBreakdown,
} from '../../../services/sales/salesOrderPaymentService'
import { fmtUsd, usdInputProps } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
// Luật chọn lô / còn nợ / loại khoản thu DÙNG CHUNG với PaymentHistorySection (audit 17/11/2026)
import { LotSelect, oldestUnpaidLot, lotOutstanding, defaultPaymentType } from './payments/LotPaymentFields'

const { Text } = Typography

/** USD giữ cent: đây là số dư/số tiền về đối chiếu sao kê ngân hàng. */
const fmtUSD = (v: number): string => fmtUsd(v, 2)

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
  // Người nhập đã tự chọn "Loại" → thôi gợi ý lại theo số tiền/lô.
  // REF (không phải state): .then() của getLotBreakdown bên dưới là closure từ lúc mở modal — đọc state
  // ở đó luôn ra false cũ, nên người dùng đổi Loại trong lúc bóc tách đang tải vẫn bị ghi đè.
  const typeTouchedRef = useRef(false)
  const [bankRef, setBankRef] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [breakdown, setBreakdown] = useState<OrderPaymentBreakdown | null>(null)
  const [lotNo, setLotNo] = useState<number | null>(null)   // null = cả đơn

  /** Gợi ý loại khoản thu theo luật chung (defaultPaymentType) — trước đây màn này luôn 'final'. */
  const suggestType = (b: OrderPaymentBreakdown | null, amt: number, lot: number | null): PaymentType =>
    defaultPaymentType({
      totalPaid: b?.totalPaid ?? 0,
      orderOutstanding: b ? b.totalValue - b.totalPaid : (target?.outstanding ?? 0),
      amount: amt,
      lotNo: lot,
    })

  // Nạp bóc tách theo lô khi mở modal (để cho chọn lô + prefill còn nợ theo lô)
  useEffect(() => {
    if (!target) return
    const preset = target.presetLotNo ?? null
    const startAmount = Math.round(target.outstanding * 100) / 100
    setBreakdown(null)
    setLotNo(preset)
    setAmount(startAmount)
    setDate(dayjs())
    typeTouchedRef.current = false
    setType(defaultPaymentType({ totalPaid: 0, orderOutstanding: target.outstanding, amount: startAmount, lotNo: preset }))
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
        const lotOut = lotOutstanding(b, chosen)
        const amt = lotOut ?? startAmount
        if (lotOut != null) setAmount(lotOut)
        if (!typeTouchedRef.current) setType(suggestType(b, amt, chosen))
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  // Còn nợ theo lựa chọn hiện tại (cả đơn hay 1 lô)
  const lotRow = lotNo != null ? breakdown?.lots.find((l) => l.lotNo === lotNo) : null
  const currentOutstanding = lotRow
    ? (lotOutstanding(breakdown, lotNo) ?? 0)
    : target?.outstanding ?? 0

  // Khi đổi lô → prefill số tiền = còn nợ của lô đó
  const onLotChange = (v: number | null) => {
    setLotNo(v)
    const out = lotOutstanding(breakdown, v) ?? (breakdown ? breakdown.totalValue - breakdown.totalPaid : target?.outstanding ?? 0)
    const amt = Math.round(out * 100) / 100
    setAmount(amt)
    if (!typeTouchedRef.current) setType(suggestType(breakdown, amt, v))
  }

  const onAmountChange = (v: number) => {
    setAmount(v)
    if (!typeTouchedRef.current) setType(suggestType(breakdown, v, lotNo))
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
    } catch (e: unknown) {
      message.error(dichLoiHeThong(e, 'Lỗi ghi nhận thu'))
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
            <LotSelect
              breakdown={breakdown}
              value={lotNo}
              onChange={onLotChange}
              onGotoPacking={onGotoPacking ? () => onGotoPacking(target.id) : undefined}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Số tiền đã thu (USD)</div>
            {/* usdInputProps: phẩy ngăn nghìn, CHẤM thập phân — giữ cent như ô ở tab Tài chính */}
            <InputNumber
              value={amount}
              onChange={(v) => onAmountChange(Number(v) || 0)}
              prefix="$"
              {...usdInputProps}
              min={0} step={100} style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Ngày tiền về</div>
              <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD/MM/YYYY" style={{ width: '100%' }} allowClear={false} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Loại</div>
              <Select value={type} onChange={(v) => { setType(v); typeTouchedRef.current = true }} style={{ width: '100%' }}
                options={Object.entries(PAYMENT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Số tham chiếu NH (tùy chọn)</div>
            <Input
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              placeholder="VD: MT103 ref / số UNC"
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
