// ============================================================================
// VỐN VAY — LỊCH TRẢ LÃI (nhắc kỳ lãi toàn bộ khoản vay) — Đợt 3a
// File: src/pages/finance/FinanceInterestPage.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Card, Table, Button, Typography, Segmented, Space, message, Row, Col, Statistic, Alert, Modal, Form, DatePicker, InputNumber,
} from 'antd'
import { ReloadOutlined, CheckOutlined, PercentageOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import FinanceLendingTabs from './FinanceLendingTabs'
import {
  interestService, IALERT_LABEL, IALERT_COLOR, type FinInterestComputed,
} from '../../services/finance/interestService'

const { Title, Text } = Typography
const fmtVnd = (n?: number | null) => (n || 0).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const numFmt = (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numParse = (v?: string) => (v || '').replace(/\./g, '')
const pill = (bg: string, txt: string) => (
  <span style={{ display: 'inline-block', background: bg, color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>{txt}</span>
)

export default function FinanceInterestPage() {
  const [rows, setRows] = useState<FinInterestComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('due')
  const [payRow, setPayRow] = useState<FinInterestComputed | null>(null)
  const [payForm] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await interestService.listAll()) } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const k = useMemo(() => {
    const pending = rows.filter((r) => r.status === 'pending')
    return {
      remaining: pending.reduce((s, r) => s + (r.interest_amount || 0), 0),
      overdue: pending.filter((r) => r.alert === 'overdue').length,
      due7: pending.filter((r) => r.alert === 'due' || r.alert === 'soon').length,
      overdueAmt: pending.filter((r) => r.alert === 'overdue').reduce((s, r) => s + (r.interest_amount || 0), 0),
    }
  }, [rows])

  const view = useMemo(() => {
    if (filter === 'due') return rows.filter((r) => r.status === 'pending' && (r.alert === 'overdue' || r.alert === 'due' || r.alert === 'soon'))
    if (filter === 'pending') return rows.filter((r) => r.status === 'pending')
    if (filter === 'paid') return rows.filter((r) => r.status === 'paid')
    return rows
  }, [rows, filter])

  const openPay = (r: FinInterestComputed) => { setPayRow(r); payForm.setFieldsValue({ paid_date: dayjs(), paid_amount: r.interest_amount }) }
  const confirmPay = async () => {
    if (!payRow) return
    try {
      const v = await payForm.validateFields()
      await interestService.markPaid(payRow.id, { paid_date: v.paid_date.format('YYYY-MM-DD'), paid_amount: v.paid_amount || 0 })
      message.success('Đã ghi nhận trả lãi'); setPayRow(null); load()
    } catch (e: any) { if (e?.errorFields) return; message.error('Lỗi: ' + (e?.message || e)) }
  }

  const columns = [
    { title: 'Khoản vay', key: 'loan', width: 200, render: (_: any, r: FinInterestComputed) => (
      <span><b>{r.loan?.bank || '—'}</b>{r.loan?.loan_no ? <span style={{ color: '#94a3b8' }}> · {r.loan.loan_no}</span> : ''}</span>) },
    { title: 'Kỳ', dataIndex: 'period_no', width: 50, align: 'center' as const, render: (v: number | null) => v ?? '—' },
    { title: 'Kỳ tính', key: 'range', width: 170, render: (_: any, r: FinInterestComputed) => <span style={{ fontSize: 12 }}>{fDate(r.from_date)} → {fDate(r.to_date)}</span> },
    { title: 'Đến hạn', dataIndex: 'due_date', width: 110, render: (v: string, r: FinInterestComputed) => (
      <span><b>{fDate(v)}</b>{r.status === 'pending' && r.days_to_due < 0 ? <div style={{ fontSize: 11, color: '#dc2626' }}>quá {-r.days_to_due} ngày</div> : (r.status === 'pending' && r.days_to_due <= 7 ? <div style={{ fontSize: 11, color: '#ca8a04' }}>còn {r.days_to_due} ngày</div> : null)}</span>) },
    { title: 'Lãi (đ)', dataIndex: 'interest_amount', width: 130, align: 'right' as const, render: (v: number) => <b style={{ color: '#92400E' }}>{fmtVnd(v)}</b> },
    { title: 'Trạng thái', key: 'al', width: 110, align: 'center' as const, render: (_: any, r: FinInterestComputed) => (
      <span>{pill(IALERT_COLOR[r.alert], IALERT_LABEL[r.alert])}{r.status === 'paid' && r.paid_date ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{fDate(r.paid_date)}</div> : null}</span>) },
    { title: '', key: 'act', width: 120, render: (_: any, r: FinInterestComputed) =>
      r.status === 'pending' ? <Button size="small" icon={<CheckOutlined />} onClick={() => openPay(r)} style={{ color: '#16a34a', borderColor: '#bbf7d0' }}>Đã trả</Button> : null },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <FinanceLendingTabs />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}><PercentageOutlined /> Lịch trả lãi vay</Title>
        <Button icon={<ReloadOutlined />} onClick={load} />
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Lãi còn phải trả" value={fmtVnd(k.remaining)} valueStyle={{ color: '#92400E', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ background: k.overdue ? '#fef2f2' : undefined }}><Statistic title="Kỳ QUÁ HẠN" value={k.overdue} valueStyle={{ color: '#dc2626', fontWeight: 800 }} suffix="kỳ" /></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ background: k.due7 ? '#fff7ed' : undefined }}><Statistic title="Đến hạn ≤7 ngày" value={k.due7} valueStyle={{ color: '#ea580c', fontWeight: 800 }} suffix="kỳ" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Lãi quá hạn (đ)" value={fmtVnd(k.overdueAmt)} valueStyle={{ color: '#dc2626', fontWeight: 800, fontSize: 20 }} /></Card></Col>
      </Row>

      {k.overdue > 0 && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }}
          message={<span><b>{k.overdue} kỳ lãi QUÁ HẠN</b> — tổng {fmtTy(k.overdueAmt)}. Trả ngay để tránh phạt + ảnh hưởng CIC.</span>} />
      )}

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 10 }}>
          <Segmented value={filter} onChange={(v) => setFilter(v as string)}
            options={[
              { label: `Sắp/quá hạn (${rows.filter((r) => r.status === 'pending' && r.alert !== 'ok').length})`, value: 'due' },
              { label: 'Tất cả chưa trả', value: 'pending' },
              { label: 'Đã trả', value: 'paid' },
              { label: 'Tất cả', value: 'all' },
            ]} />
        </div>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={view}
          pagination={{ pageSize: 30, showSizeChanger: false }} scroll={{ x: 1000 }}
          locale={{ emptyText: 'Không có kỳ lãi. Vào tab Khoản vay → biểu tượng % để sinh lịch lãi cho từng khoản.' }} />
      </Card>

      <Modal open={!!payRow} title="Ghi nhận trả lãi" onCancel={() => setPayRow(null)} onOk={confirmPay} okText="Lưu" cancelText="Huỷ"
        okButtonProps={{ style: { background: '#16a34a', borderColor: '#16a34a' } }} destroyOnClose>
        {payRow && <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>{payRow.loan?.bank} {payRow.loan?.loan_no || ''} · kỳ {payRow.period_no ?? '—'} · đến hạn {fDate(payRow.due_date)}</Text>}
        <Form form={payForm} layout="vertical" size="small">
          <Form.Item name="paid_date" label="Ngày trả" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="paid_amount" label="Số tiền lãi đã trả (đ)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
