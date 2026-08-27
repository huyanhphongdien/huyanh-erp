// ============================================================================
// PAYMENT HISTORY SECTION — Timeline lịch sử thanh toán cho 1 đơn hàng
// File: src/pages/sales/components/PaymentHistorySection.tsx
//
// Dùng trong Tab Tài chính (FinanceTabV4). Hiển thị danh sách payment +
// modal thêm/sửa. Sau mỗi action, gọi onSaved() để parent reload order
// (vì service đã auto-update aggregate + bump status).
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Button, Modal, Form, InputNumber, DatePicker, Input, Select, Tag, Empty, Spin,
  Popconfirm, message, Tooltip, Space,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined,
  WarningOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  salesOrderPaymentService,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_COLORS,
  type SalesOrderPayment,
  type PaymentType,
  type CreatePaymentInput,
  type OrderPaymentBreakdown,
} from '../../../services/sales/salesOrderPaymentService'

interface Props {
  orderId: string
  totalValueUsd: number
  canEdit: boolean
  onSaved: () => void
}

const fmtUSD = (v: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
}).format(v)

const fmtDate = (d: string | undefined | null) => d ? dayjs(d).format('DD/MM/YYYY') : '—'

export default function PaymentHistorySection({ orderId, totalValueUsd, canEdit, onSaved }: Props) {
  const [payments, setPayments] = useState<SalesOrderPayment[]>([])
  const [breakdown, setBreakdown] = useState<OrderPaymentBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SalesOrderPayment | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [data, bd] = await Promise.all([
        salesOrderPaymentService.listByOrder(orderId),
        salesOrderPaymentService.getLotBreakdown(orderId).catch(() => null),
      ])
      setPayments(data)
      setBreakdown(bd)
    } catch (e: any) {
      message.error(e.message || 'Không thể tải lịch sử thanh toán')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

  // Aggregates (loại fee_offset không tính tiền thu)
  const realPayments = payments.filter(p => p.payment_type !== 'fee_offset')
  const totalPaid = realPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const remaining = Math.max(0, totalValueUsd - totalPaid)
  const isPaid = totalValueUsd > 0 && totalPaid >= totalValueUsd
  const totalFee = payments.reduce((s, p) => s + Number(p.fee_amount || 0), 0)

  /**
   * Lô còn nợ CŨ NHẤT — mặc định khi mở form thêm khoản thu.
   * Cùng luật với QuickPayModal; hai màn lệch nhau là hai thói quen nhập khác nhau.
   * ⚠ Không chia đều tiền cho các lô: chia ĐỀU chính là prorata đội tên khác.
   */
  const oldestUnpaidLot = (): number | null => {
    if (!breakdown?.hasLots) return null
    const owing = breakdown.lots
      .filter((l) => l.lotValue - l.paidAmount > 0.01)
      .sort((a, b) => a.lotNo - b.lotNo)
    return owing.length ? owing[0].lotNo : null
  }

  const openAdd = () => {
    setEditing(null)
    form.resetFields()
    // Chọn sẵn lô nợ cũ nhất: bỏ trống ô lô KHÔNG được là đường dễ nhất nữa. Trước đây
    // mặc định là "cả đơn" nên chưa khoản thu nào trong hệ thống có số lô.
    const lot = oldestUnpaidLot()
    form.setFieldsValue({
      payment_date: dayjs(),
      currency: 'USD',
      lot_no: lot,
      payment_type: remaining > 0 ? (totalPaid === 0 ? 'deposit' : 'installment') : 'other',
    })
    setModalOpen(true)
  }

  const openEdit = (p: SalesOrderPayment) => {
    setEditing(p)
    form.setFieldsValue({
      ...p,
      payment_date: dayjs(p.payment_date),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const vals = await form.validateFields()
      setSaving(true)
      const payload: CreatePaymentInput = {
        sales_order_id: orderId,
        lot_no: vals.lot_no ?? null,
        payment_date: vals.payment_date.format('YYYY-MM-DD'),
        amount: vals.amount,
        currency: vals.currency || 'USD',
        exchange_rate: vals.exchange_rate || null,
        payment_type: vals.payment_type as PaymentType,
        bank_name: vals.bank_name || null,
        bank_reference: vals.bank_reference || null,
        swift_code: vals.swift_code || null,
        fee_amount: vals.fee_amount || 0,
        notes: vals.notes || null,
      }
      if (editing) {
        await salesOrderPaymentService.update(editing.id, payload)
        message.success('Đã cập nhật khoản thu')
      } else {
        await salesOrderPaymentService.create(payload)
        message.success('Đã thêm khoản thu')
      }
      setModalOpen(false)
      load()
      onSaved()
    } catch (e: any) {
      if (e.errorFields) return
      message.error(e.message || 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await salesOrderPaymentService.delete(id)
      message.success('Đã xóa khoản thu')
      load()
      onSaved()
    } catch (e: any) {
      message.error(e.message || 'Không thể xóa')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#cf1322', letterSpacing: 1 }}>
          Lịch sử thanh toán {payments.length > 0 && `(${payments.length})`}
        </span>
        {canEdit && (
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Thêm khoản thu
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
      ) : payments.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có khoản thu nào" style={{ margin: '12px 0' }} />
      ) : (
        <div style={{ background: '#fafafa', borderRadius: 8, padding: 12, border: '1px solid #f0f0f0' }}>
          {payments.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                gap: 12,
                padding: '8px 4px',
                borderBottom: '1px solid #f0f0f0',
                alignItems: 'flex-start',
              }}
            >
              <div style={{
                width: 4, alignSelf: 'stretch', borderRadius: 2,
                background: PAYMENT_TYPE_COLORS[p.payment_type],
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Tag color={PAYMENT_TYPE_COLORS[p.payment_type]} style={{ margin: 0 }}>
                    {PAYMENT_TYPE_LABELS[p.payment_type]}
                  </Tag>
                  {p.lot_no != null && <Tag color="geekblue" style={{ margin: 0 }}>Lô {p.lot_no}</Tag>}
                  <span style={{ fontWeight: 600, color: '#1B4D3E' }}>{fmtUSD(Number(p.amount))}</span>
                  {p.fee_amount && Number(p.fee_amount) > 0 && (
                    <Tooltip title="Phí ngân hàng">
                      <span style={{ color: '#cf1322', fontSize: 11 }}>− {fmtUSD(Number(p.fee_amount))} phí</span>
                    </Tooltip>
                  )}
                  <span style={{ color: '#666', fontSize: 12, marginLeft: 'auto' }}>{fmtDate(p.payment_date)}</span>
                </div>
                {(p.bank_name || p.bank_reference) && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    <BankOutlined /> {p.bank_name || ''} {p.bank_reference && `· ${p.bank_reference}`}
                  </div>
                )}
                {p.notes && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2, fontStyle: 'italic' }}>
                    {p.notes}
                  </div>
                )}
              </div>
              {canEdit && (
                <Space size={2}>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(p)} />
                  <Popconfirm title="Xóa khoản thu?" onConfirm={() => handleDelete(p.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              )}
            </div>
          ))}

          {/* Summary footer */}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '2px solid #d9d9d9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#666' }}>Tổng đã thu</span>
              <span style={{ fontWeight: 600, color: '#1B4D3E' }}>{fmtUSD(totalPaid)}</span>
            </div>
            {totalFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cf1322' }}>
                <span>Tổng phí NH</span>
                <span>{fmtUSD(totalFee)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
              <span style={{ color: '#666' }}>Còn lại</span>
              <span style={{ fontWeight: 700, color: isPaid ? '#52c41a' : '#cf1322' }}>
                {isPaid ? (
                  <><CheckCircleOutlined /> Đã thanh toán đủ</>
                ) : (
                  fmtUSD(remaining)
                )}
              </span>
            </div>
            {totalPaid > totalValueUsd && totalValueUsd > 0 && (
              <div style={{ fontSize: 11, color: '#fa8c16', marginTop: 4 }}>
                <WarningOutlined /> Đã thu vượt {fmtUSD(totalPaid - totalValueUsd)} so với HĐ
              </div>
            )}
            {breakdown?.hasLots && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #d9d9d9' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                  Thu theo lô: <b>{breakdown.lotsPaid}/{breakdown.lotsTotal}</b> lô đã thu đủ
                  {breakdown.unattributedPaid > 0 && <span style={{ color: '#999' }}> · {fmtUSD(breakdown.unattributedPaid)} chưa gán lô</span>}
                </div>
                {breakdown.lots.map((l) => {
                  const c = l.status === 'paid' ? 'green' : l.status === 'partial' ? 'gold' : 'red'
                  const lbl = l.status === 'paid' ? 'đã thu' : l.status === 'partial' ? 'thu 1 phần' : 'chưa thu'
                  return (
                    <div key={l.lotNo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '1px 0' }}>
                      <span>Lô {l.lotNo} <Tag color={c} style={{ margin: 0 }}>{lbl}</Tag></span>
                      <span style={{ color: '#666' }}>{fmtUSD(l.paidAmount)} / {fmtUSD(l.lotValue)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal thêm/sửa payment */}
      <Modal
        open={modalOpen}
        title={editing ? 'Sửa khoản thu' : 'Thêm khoản thu'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={560}
      >
        <Form form={form} layout="vertical" size="small">
          {/* ⚠ LUÔN hiện ô này. Bản cũ ẩn hẳn khi đơn chưa chia lô — mà đó là đa số đơn,
              nên hầu hết người nhập chưa từng thấy ô này và không ai có thói quen ghi thu
              kèm lô. Đơn chưa chia lô thì khoá ô + chỉ đường, VẪN CHO LƯU. */}
          {breakdown?.hasLots ? (
            <Form.Item label="Thu cho lô nào?" name="lot_no"
              tooltip="Đã chọn sẵn lô còn nợ cũ nhất. Đổi nếu khách trả cho lô khác; chọn 'Cả đơn' khi tiền gộp nhiều lô.">
              <Select
                options={[
                  ...breakdown.lots.map((l) => ({
                    value: l.lotNo,
                    label: `Lô ${l.lotNo} — trị giá ${fmtUSD(l.lotValue)} · còn nợ ${fmtUSD(Math.max(0, l.lotValue - l.paidAmount))}`,
                  })),
                  // "Cả đơn" xuống CUỐI: vẫn chọn được, chỉ thôi làm mặc định.
                  { value: null, label: 'Cả đơn — chưa quy được về lô' },
                ]} />
            </Form.Item>
          ) : (
            <Form.Item label="Thu cho lô nào?"
              tooltip="Đơn chưa chia lô nên khoản thu chỉ ghi được ở mức cả đơn.">
              <Select disabled placeholder="Đơn này chưa chia lô" />
            </Form.Item>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Form.Item label="Ngày trả" name="payment_date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item label="Loại khoản thu" name="payment_type" rules={[{ required: true }]}>
              <Select
                options={Object.entries(PAYMENT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              />
            </Form.Item>
            <Form.Item label="Số tiền" name="amount" rules={[{ required: true, type: 'number', min: 0.01 }]}>
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="0.00" />
            </Form.Item>
            <Form.Item label="Currency" name="currency" initialValue="USD">
              <Select options={[
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
                { value: 'JPY', label: 'JPY' },
                { value: 'CNY', label: 'CNY' },
                { value: 'VND', label: 'VND' },
              ]} />
            </Form.Item>
            <Form.Item label="Tỷ giá USD/VND (nếu cần)" name="exchange_rate">
              <InputNumber style={{ width: '100%' }} min={0} step={1} placeholder="25000" />
            </Form.Item>
            <Form.Item label="Phí NH (USD)" name="fee_amount">
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="0" />
            </Form.Item>
          </div>
          <Form.Item label="Ngân hàng nhận" name="bank_name">
            <Input placeholder="Vietcombank, Agribank..." />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Form.Item label="Số tham chiếu (sao kê)" name="bank_reference">
              <Input placeholder="VCB20260415-001" />
            </Form.Item>
            <Form.Item label="SWIFT code" name="swift_code">
              <Input placeholder="BFTVVNVX" />
            </Form.Item>
          </div>
          <Form.Item label="Ghi chú" name="notes">
            <Input.TextArea rows={2} placeholder="vd: Cọc 10% theo HĐ" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
