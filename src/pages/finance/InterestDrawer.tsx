// ============================================================================
// VỐN VAY — Drawer LỊCH TRẢ LÃI của 1 khoản vay
// File: src/pages/finance/InterestDrawer.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Drawer, Card, Table, Button, Form, InputNumber, DatePicker, Select, Space,
  Typography, message, Popconfirm, Row, Col, Statistic, Divider, Modal,
} from 'antd'
import { ThunderboltOutlined, CheckOutlined, UndoOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  interestService, buildSchedule, FREQ_LABEL, IALERT_LABEL, IALERT_COLOR,
  type FinInterestComputed, type InterestFreq,
} from '../../services/finance/interestService'
import type { FinLoanComputed } from '../../services/finance/loanService'

const { Text } = Typography
const fmtVnd = (n?: number | null) => (n || 0).toLocaleString('vi-VN')
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const numFmt = (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numParse = (v?: string) => (v || '').replace(/\./g, '')
const pill = (bg: string, txt: string) => (
  <span style={{ display: 'inline-block', background: bg, color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>{txt}</span>
)

export default function InterestDrawer({ loan, open, onClose, onChanged }: {
  loan: FinLoanComputed | null
  open: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<FinInterestComputed[]>([])
  const [loading, setLoading] = useState(false)
  const [genForm] = Form.useForm()
  const [generating, setGenerating] = useState(false)
  const [payRow, setPayRow] = useState<FinInterestComputed | null>(null)
  const [payForm] = Form.useForm()

  const load = useCallback(async () => {
    if (!loan) return
    setLoading(true)
    try { setRows(await interestService.listByLoan(loan.id)) } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    setLoading(false)
  }, [loan])

  useEffect(() => {
    if (open && loan) {
      load()
      genForm.setFieldsValue({
        freq: (loan as any).interest_freq || 'monthly',
        base: loan.remaining || loan.principal || 0,
        rate: loan.interest_rate || 0,
        payDay: (loan as any).interest_day || undefined,
        startDate: loan.disbursed_date ? dayjs(loan.disbursed_date) : dayjs(),
        endDate: loan.due_date ? dayjs(loan.due_date) : null,
      })
    }
  }, [open, loan, load, genForm])

  const k = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.interest_amount || 0), 0)
    const paid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + (r.paid_amount || r.interest_amount || 0), 0)
    const pendingDue = rows.filter((r) => r.status === 'pending' && (r.alert === 'overdue' || r.alert === 'due' || r.alert === 'soon'))
    return { total, paid, remaining: total - paid, pendingDue: pendingDue.length }
  }, [rows])

  // Preview lịch khi nhập config
  const preview = () => {
    const v = genForm.getFieldsValue()
    return buildSchedule({
      freq: v.freq, startDate: v.startDate?.format('YYYY-MM-DD'), endDate: v.endDate?.format('YYYY-MM-DD'),
      base: v.base, rate: v.rate, payDay: v.payDay,
    })
  }

  const handleGenerate = async () => {
    if (!loan) return
    try {
      const v = await genForm.validateFields()
      const o = { freq: v.freq as InterestFreq, startDate: v.startDate.format('YYYY-MM-DD'), endDate: v.endDate.format('YYYY-MM-DD'), base: v.base, rate: v.rate, payDay: v.payDay }
      const n = buildSchedule(o).length
      if (!n) { message.warning('Không sinh được kỳ nào — kiểm tra ngày bắt đầu/đáo hạn'); return }
      setGenerating(true)
      const created = await interestService.generate(loan.id, o)
      message.success(`Đã sinh ${created} kỳ lãi (giữ nguyên kỳ đã trả)`)
      load(); onChanged?.()
    } catch (e: any) { if (e?.errorFields) return; message.error('Lỗi sinh lịch: ' + (e?.message || e)) }
    finally { setGenerating(false) }
  }

  const openPay = (r: FinInterestComputed) => {
    setPayRow(r)
    payForm.setFieldsValue({ paid_date: dayjs(), paid_amount: r.interest_amount })
  }
  const confirmPay = async () => {
    if (!payRow) return
    try {
      const v = await payForm.validateFields()
      await interestService.markPaid(payRow.id, { paid_date: v.paid_date.format('YYYY-MM-DD'), paid_amount: v.paid_amount || 0 })
      message.success('Đã ghi nhận trả lãi'); setPayRow(null); load(); onChanged?.()
    } catch (e: any) { if (e?.errorFields) return; message.error('Lỗi: ' + (e?.message || e)) }
  }
  const unpay = async (r: FinInterestComputed) => { await interestService.unpay(r.id); load(); onChanged?.() }
  const del = async (r: FinInterestComputed) => { await interestService.remove(r.id); load(); onChanged?.() }
  const addManual = async () => {
    if (!loan) return
    await interestService.create({ loan_id: loan.id, due_date: dayjs().format('YYYY-MM-DD'), interest_amount: 0, base_amount: loan.remaining, rate: loan.interest_rate })
    load(); onChanged?.()
  }

  const columns = [
    { title: 'Kỳ', dataIndex: 'period_no', width: 48, align: 'center' as const, render: (v: number | null) => v ?? '—' },
    { title: 'Từ → đến', key: 'range', width: 160, render: (_: any, r: FinInterestComputed) => <span style={{ fontSize: 12 }}>{fDate(r.from_date)} → {fDate(r.to_date)}</span> },
    { title: 'Đến hạn', dataIndex: 'due_date', width: 100, render: (v: string, r: FinInterestComputed) => (
      <span>{fDate(v)}{r.status === 'pending' && r.days_to_due < 0 ? <div style={{ fontSize: 11, color: '#dc2626' }}>quá {-r.days_to_due}d</div> : (r.status === 'pending' && r.days_to_due <= 7 ? <div style={{ fontSize: 11, color: '#ca8a04' }}>còn {r.days_to_due}d</div> : null)}</span>) },
    { title: 'Lãi (đ)', dataIndex: 'interest_amount', width: 120, align: 'right' as const, render: (v: number) => <b style={{ color: '#92400E' }}>{fmtVnd(v)}</b> },
    { title: 'Trạng thái', key: 'al', width: 100, align: 'center' as const, render: (_: any, r: FinInterestComputed) => (
      <span>{pill(IALERT_COLOR[r.alert], IALERT_LABEL[r.alert])}{r.status === 'paid' && r.paid_date ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{fDate(r.paid_date)}</div> : null}</span>) },
    { title: '', key: 'act', width: 96, align: 'right' as const, render: (_: any, r: FinInterestComputed) => (
      <Space size={2}>
        {r.status === 'pending'
          ? <Button type="text" size="small" icon={<CheckOutlined style={{ color: '#16a34a' }} />} title="Đánh dấu đã trả" onClick={() => openPay(r)} />
          : <Button type="text" size="small" icon={<UndoOutlined />} title="Bỏ đã trả" onClick={() => unpay(r)} />}
        <Popconfirm title="Xoá kỳ này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => del(r)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>) },
  ]

  return (
    <Drawer open={open} onClose={onClose} width={780}
      title={loan ? <span>💵 Lịch trả lãi — <b style={{ color: '#1E3A5F' }}>{loan.bank}</b>{loan.loan_no ? <Text type="secondary"> · {loan.loan_no}</Text> : ''}</span> : 'Lịch trả lãi'}>
      {!loan ? null : <>
        <Row gutter={[10, 10]}>
          <Col span={8}><Card size="small"><Statistic title="Tổng lãi" value={fmtVnd(k.total)} valueStyle={{ color: '#92400E', fontWeight: 800, fontSize: 18 }} /></Card></Col>
          <Col span={8}><Card size="small"><Statistic title="Đã trả" value={fmtVnd(k.paid)} valueStyle={{ color: '#16a34a', fontWeight: 800, fontSize: 18 }} /></Card></Col>
          <Col span={8}><Card size="small" style={{ background: k.pendingDue ? '#fff7ed' : undefined }}><Statistic title="Còn phải trả" value={fmtVnd(k.remaining)} valueStyle={{ color: '#dc2626', fontWeight: 800, fontSize: 18 }} /></Card></Col>
        </Row>

        {/* Sinh lịch */}
        <Card size="small" style={{ marginTop: 12 }} title={<span><ThunderboltOutlined /> Tự sinh lịch lãi</span>}>
          <Form form={genForm} layout="vertical" size="small">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Form.Item name="freq" label="Kỳ trả lãi" rules={[{ required: true }]}>
                <Select options={Object.entries(FREQ_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
              <Form.Item name="payDay" label="Ngày trả (1–28)"><InputNumber min={1} max={28} style={{ width: '100%' }} placeholder="vd 25" /></Form.Item>
              <Form.Item name="rate" label="Lãi suất %/năm" rules={[{ required: true }]}><InputNumber min={0} step={0.1} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="startDate" label="Từ ngày" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="endDate" label="Đến ngày (đáo hạn)" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="base" label="Dư nợ gốc tính lãi" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
            </div>
            <Space>
              <Popconfirm title="Sinh lại lịch?" description="Xoá các kỳ CHƯA trả rồi sinh mới (giữ kỳ đã trả)." okText="Sinh" cancelText="Huỷ" onConfirm={handleGenerate}>
                <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} style={{ background: '#1E3A5F', borderColor: '#1E3A5F' }}>Sinh lịch</Button>
              </Popconfirm>
              <Text type="secondary" style={{ fontSize: 12 }}>Lãi mỗi kỳ = dư nợ × LS/năm × (1/12, 1/4, 1, hoặc theo ngày với "cuối kỳ").</Text>
            </Space>
          </Form>
        </Card>

        <Divider style={{ margin: '14px 0 8px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text strong>Các kỳ lãi ({rows.length})</Text>
          <Button size="small" icon={<PlusOutlined />} onClick={addManual}>Thêm kỳ thủ công</Button>
        </div>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={rows} pagination={false}
          locale={{ emptyText: 'Chưa có kỳ lãi. Nhập cấu hình trên rồi bấm "Sinh lịch".' }} />
      </>}

      <Modal open={!!payRow} title="Ghi nhận trả lãi" onCancel={() => setPayRow(null)} onOk={confirmPay} okText="Lưu" cancelText="Huỷ"
        okButtonProps={{ style: { background: '#16a34a', borderColor: '#16a34a' } }} destroyOnClose>
        <Form form={payForm} layout="vertical" size="small">
          <Form.Item name="paid_date" label="Ngày trả" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="paid_amount" label="Số tiền lãi đã trả (đ)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
        </Form>
      </Modal>
    </Drawer>
  )
}
