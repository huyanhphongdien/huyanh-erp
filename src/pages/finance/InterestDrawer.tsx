// ============================================================================
// VỐN VAY — Drawer LỊCH TRẢ LÃI của 1 khoản vay
// File: src/pages/finance/InterestDrawer.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Drawer, Card, Table, Button, Form, InputNumber, DatePicker, Select, Space,
  Typography, message, Popconfirm, Row, Col, Statistic, Divider, Modal,
} from 'antd'
import { ThunderboltOutlined, CheckOutlined, UndoOutlined, DeleteOutlined, PlusOutlined, PaperClipOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import FinanceAttachments from './FinanceAttachments'
import {
  interestService, buildSchedule, FREQ_LABEL, IALERT_LABEL, IALERT_COLOR,
  type FinInterestComputed, type InterestFreq,
} from '../../services/finance/interestService'
import type { FinLoanComputed } from '../../services/finance/loanService'
import { fmtVnd, fmtVndNum, fmtDate, vndInputProps } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import PageState from '../../components/common/PageState'
import { pill, hanText } from './finUi'

const { Text } = Typography

export default function InterestDrawer({ loan, open, onClose, onChanged }: {
  loan: FinLoanComputed | null
  open: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<FinInterestComputed[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [genForm] = Form.useForm()
  const [generating, setGenerating] = useState(false)
  const [payRow, setPayRow] = useState<FinInterestComputed | null>(null)
  const [payForm] = Form.useForm()
  const [attachRow, setAttachRow] = useState<FinInterestComputed | null>(null)
  // Kỳ lãi nhập tay / sửa kỳ (trước 17/11/2026: bấm "Thêm kỳ thủ công" tạo ngay kỳ 0 ₫ hạn hôm nay, không sửa được)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [periodEditing, setPeriodEditing] = useState<FinInterestComputed | null>(null)
  const [periodSaving, setPeriodSaving] = useState(false)
  const [periodForm] = Form.useForm()

  const load = useCallback(async () => {
    if (!loan) return
    setLoading(true); setLoadError(null)
    try { setRows(await interestService.listByLoan(loan.id)) } catch (e) { setLoadError(e) }
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
    return { total, paid, remaining: total - paid, pendingDue: pendingDue.length, hasOverdue: rows.some((r) => r.alert === 'overdue') }
  }, [rows])

  // Xem trước lịch theo cấu hình đang nhập (chưa ghi DB) — hiện ngay dưới form, trước khi bấm Sinh
  const genValues = Form.useWatch([], genForm)
  const pv = useMemo(() => {
    const v = genValues || {}
    if (!v.freq || !v.startDate || !v.endDate) return null
    const list = buildSchedule({
      freq: v.freq, startDate: v.startDate.format('YYYY-MM-DD'), endDate: v.endDate.format('YYYY-MM-DD'),
      base: v.base, rate: v.rate, payDay: v.payDay,
    })
    return { n: list.length, total: list.reduce((s, r) => s + (r.interest_amount || 0), 0) }
  }, [genValues])

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
    } catch (e: any) { if (e?.errorFields) return; message.error(dichLoiHeThong(e, 'Sinh lịch lãi thất bại')) }
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
    } catch (e: any) { if (e?.errorFields) return; message.error(dichLoiHeThong(e, 'Ghi nhận trả lãi thất bại')) }
  }
  const unpay = async (r: FinInterestComputed) => {
    try { await interestService.unpay(r.id); message.success('Đã đưa kỳ về CHƯA TRẢ'); load(); onChanged?.() }
    catch (e) { message.error(dichLoiHeThong(e, 'Bỏ đã trả thất bại')) }
  }
  const del = async (r: FinInterestComputed) => {
    try { await interestService.remove(r.id); message.success('Đã xoá kỳ lãi'); load(); onChanged?.() }
    catch (e) { message.error(dichLoiHeThong(e, 'Xoá kỳ lãi thất bại')) }
  }

  // ── Kỳ nhập tay / sửa kỳ ──
  const openAddPeriod = () => {
    setPeriodEditing(null); periodForm.resetFields()
    const nextNo = rows.reduce((m, r) => Math.max(m, r.period_no || 0), 0) + 1
    periodForm.setFieldsValue({ period_no: nextNo, due_date: dayjs() })
    setPeriodOpen(true)
  }
  const openEditPeriod = (r: FinInterestComputed) => {
    setPeriodEditing(r); periodForm.resetFields()
    periodForm.setFieldsValue({
      period_no: r.period_no ?? undefined, interest_amount: r.interest_amount,
      due_date: r.due_date ? dayjs(r.due_date) : null,
      from_date: r.from_date ? dayjs(r.from_date) : null, to_date: r.to_date ? dayjs(r.to_date) : null,
    })
    setPeriodOpen(true)
  }
  const savePeriod = async () => {
    if (!loan) return
    let v: any
    try { v = await periodForm.validateFields() } catch { return }
    const d = (x: any): string | null => (x ? x.format('YYYY-MM-DD') : null)
    const patch = {
      period_no: v.period_no ?? null, due_date: v.due_date.format('YYYY-MM-DD'),
      from_date: d(v.from_date), to_date: d(v.to_date), interest_amount: Number(v.interest_amount) || 0,
    }
    setPeriodSaving(true)
    try {
      if (periodEditing) await interestService.update(periodEditing.id, patch)
      else await interestService.create({ loan_id: loan.id, ...patch, base_amount: loan.remaining, rate: loan.interest_rate })
      message.success(periodEditing ? 'Đã sửa kỳ lãi' : 'Đã thêm kỳ lãi')
      setPeriodOpen(false); load(); onChanged?.()
    } catch (e) { message.error(dichLoiHeThong(e, 'Lưu kỳ lãi thất bại')) }
    finally { setPeriodSaving(false) }
  }

  const columns = [
    { title: 'Kỳ', dataIndex: 'period_no', width: 48, align: 'center' as const, render: (v: number | null) => v ?? '—' },
    { title: 'Từ → đến', key: 'range', width: 160, render: (_: any, r: FinInterestComputed) => <span style={{ fontSize: 12 }}>{fmtDate(r.from_date)} → {fmtDate(r.to_date)}</span> },
    { title: 'Đến hạn', dataIndex: 'due_date', width: 100, render: (v: string, r: FinInterestComputed) => (
      <span>{fmtDate(v)}{r.status === 'pending' && r.days_to_due < 0 ? <div style={{ fontSize: 11, color: '#dc2626' }}>{hanText(r.days_to_due)}</div> : (r.status === 'pending' && r.days_to_due <= 7 ? <div style={{ fontSize: 11, color: '#ca8a04' }}>{hanText(r.days_to_due)}</div> : null)}</span>) },
    { title: 'Lãi (₫)', dataIndex: 'interest_amount', width: 120, align: 'right' as const, render: (v: number) => <b style={{ color: '#92400E' }}>{fmtVndNum(v)}</b> },
    { title: 'Trạng thái', key: 'al', width: 100, align: 'center' as const, render: (_: any, r: FinInterestComputed) => (
      <span>{pill(IALERT_COLOR[r.alert], IALERT_LABEL[r.alert])}{r.status === 'paid' && r.paid_date ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDate(r.paid_date)}</div> : null}</span>) },
    { title: '', key: 'act', width: 140, align: 'right' as const, render: (_: any, r: FinInterestComputed) => (
      <Space size={0}>
        <Button type="text" size="small" icon={<PaperClipOutlined />} title="Chứng từ trả lãi" onClick={() => setAttachRow(r)} />
        <Button type="text" size="small" icon={<EditOutlined />} title="Sửa kỳ (ngày, số lãi)" onClick={() => openEditPeriod(r)} />
        {r.status === 'pending'
          ? <Button type="text" size="small" icon={<CheckOutlined style={{ color: '#16a34a' }} />} title="Đánh dấu đã trả" onClick={() => openPay(r)} />
          : (
            <Popconfirm title="Bỏ đánh dấu đã trả?" description={`Kỳ sẽ về CHƯA TRẢ, xoá ngày trả + số đã trả${r.paid_amount != null ? ` (${fmtVnd(r.paid_amount)})` : ''}.`}
              okText="Bỏ đã trả" cancelText="Không" okButtonProps={{ danger: true }} onConfirm={() => unpay(r)}>
              <Button type="text" size="small" icon={<UndoOutlined />} title="Bỏ đã trả" />
            </Popconfirm>
          )}
        <Popconfirm title="Xoá kỳ này?" description="Kỳ lãi bị xoá hẳn khỏi lịch, không hoàn tác được."
          okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => del(r)}>
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
          <Col span={8}><Card size="small" style={{ background: k.pendingDue ? '#fff7ed' : undefined }}><Statistic title="Còn phải trả" value={fmtVnd(k.remaining)} valueStyle={{ color: k.hasOverdue ? IALERT_COLOR.overdue : '#92400E', fontWeight: 800, fontSize: 18 }} /></Card></Col>
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
              <Form.Item name="base" label="Dư nợ gốc tính lãi" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} {...vndInputProps} /></Form.Item>
            </div>
            <Space wrap>
              <Popconfirm title="Sinh lại lịch?" description="Xoá các kỳ CHƯA trả (kể cả kỳ nhập tay) rồi sinh mới — giữ kỳ đã trả." okText="Sinh" cancelText="Huỷ" onConfirm={handleGenerate}>
                <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} style={{ background: '#1E3A5F', borderColor: '#1E3A5F' }}>Sinh lịch</Button>
              </Popconfirm>
              {/* Đúng công thức buildSchedule: lãi theo SỐ NGÀY THỰC của kỳ (actual/365) cho mọi kỳ trả */}
              <Text type="secondary" style={{ fontSize: 12 }}>Lãi mỗi kỳ = dư nợ × LS/năm × số ngày thực của kỳ ÷ 365.</Text>
            </Space>
            {pv && (
              <div style={{ marginTop: 8, fontSize: 12, color: pv.n ? '#475569' : '#dc2626' }}>
                {pv.n
                  ? <>Xem trước: sẽ sinh <b>{pv.n}</b> kỳ · tổng lãi ≈ <b>{fmtVnd(pv.total)}</b>{rows.some((r) => r.status === 'pending') ? ' (thay các kỳ chưa trả hiện có)' : ''}</>
                  : 'Xem trước: không sinh được kỳ nào — kiểm tra ngày bắt đầu / đáo hạn.'}
              </div>
            )}
          </Form>
        </Card>

        <Divider style={{ margin: '14px 0 8px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text strong>Các kỳ lãi ({rows.length})</Text>
          <Button size="small" icon={<PlusOutlined />} onClick={openAddPeriod}>Thêm kỳ thủ công</Button>
        </div>
        <PageState error={loadError} onRetry={load} minHeight={120}>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={rows} pagination={false}
          locale={{ emptyText: 'Chưa có kỳ lãi. Nhập cấu hình trên rồi bấm "Sinh lịch".' }} />
        </PageState>
      </>}

      <Modal open={!!payRow} title="Ghi nhận trả lãi" onCancel={() => setPayRow(null)} onOk={confirmPay} okText="Lưu" cancelText="Huỷ"
        okButtonProps={{ style: { background: '#16a34a', borderColor: '#16a34a' } }} destroyOnClose>
        <Form form={payForm} layout="vertical" size="small">
          <Form.Item name="paid_date" label="Ngày trả" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="paid_amount" label="Số tiền lãi đã trả (₫)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} {...vndInputProps} /></Form.Item>
        </Form>
      </Modal>

      <Modal open={periodOpen} title={periodEditing ? `Sửa kỳ lãi${periodEditing.period_no != null ? ` — kỳ ${periodEditing.period_no}` : ''}` : 'Thêm kỳ lãi thủ công'}
        onCancel={() => setPeriodOpen(false)} onOk={savePeriod} okText="Lưu" cancelText="Huỷ" confirmLoading={periodSaving} destroyOnHidden>
        <Form form={periodForm} layout="vertical" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="due_date" label="Ngày đến hạn trả lãi" rules={[{ required: true, message: 'Chọn ngày đến hạn' }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="period_no" label="Kỳ số"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="from_date" label="Tính lãi từ ngày"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="to_date" label="Đến ngày"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="interest_amount" label="Số tiền lãi (₫)" tooltip="Theo thông báo lãi của ngân hàng"
            rules={[{ required: true, message: 'Nhập số tiền lãi' },
              { validator: (_, v) => (v == null || v === '' || Number(v) > 0 ? Promise.resolve() : Promise.reject(new Error('Số lãi phải lớn hơn 0'))) }]}>
            <InputNumber min={0} style={{ width: '100%' }} {...vndInputProps} placeholder="vd 125.000.000" />
          </Form.Item>
          {periodEditing?.status === 'paid' && (
            <Text type="secondary" style={{ fontSize: 12 }}>Kỳ này đã trả — sửa ở đây không đổi số đã trả ({fmtVnd(periodEditing.paid_amount)}); cần thì "Bỏ đã trả" rồi ghi lại.</Text>
          )}
        </Form>
      </Modal>

      <Modal open={!!attachRow} title={`📎 Chứng từ trả lãi — kỳ ${attachRow?.period_no ?? '—'} · đến hạn ${fmtDate(attachRow?.due_date)}`}
        footer={null} onCancel={() => setAttachRow(null)} destroyOnClose width={560}>
        {attachRow && <FinanceAttachments entityType="interest" entityId={attachRow.id} />}
      </Modal>
    </Drawer>
  )
}
