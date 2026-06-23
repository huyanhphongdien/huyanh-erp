// ============================================================================
// VỐN VAY / TÀI CHÍNH — PHẢI THU KHÁCH HÀNG (Đợt 4)
// File: src/pages/finance/FinanceReceivablePage.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Card, Table, Button, Typography, Modal, Form, Input, InputNumber, DatePicker,
  Select, Space, message, Popconfirm, Row, Col, Statistic, Badge, Drawer, Tooltip, Segmented, Alert,
} from 'antd'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, PaperClipOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  receivableService, AR_ALERT_LABEL, AR_ALERT_COLOR, AGING_LABEL,
  type FinReceivableComputed, type AgingBucket,
} from '../../services/finance/receivableService'
import { attachmentService } from '../../services/finance/attachmentService'
import FinanceAttachments from './FinanceAttachments'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography
const fmtMoney = (n?: number | null, ccy = 'USD') => {
  const v = Number(n) || 0
  return ccy === 'VND' ? v.toLocaleString('vi-VN') + ' đ' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtUsd = (n: number) => '$' + (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const numFmt = (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numParse = (v?: string) => (v || '').replace(/\./g, '')
const pill = (bg: string, txt: string) => (
  <span style={{ display: 'inline-block', background: bg, color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>{txt}</span>
)
const BUCKETS: AgingBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90p']
const BUCKET_COLOR: Record<AgingBucket, string> = { current: '#475569', d1_30: '#ca8a04', d31_60: '#ea580c', d61_90: '#dc2626', d90p: '#991b1b' }

export default function FinanceReceivablePage() {
  const user = useAuthStore((s) => s.user)
  const actorId = user?.employee_id || user?.id || null
  const [rows, setRows] = useState<FinReceivableComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FinReceivableComputed | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [attach, setAttach] = useState<FinReceivableComputed | null>(null)
  const [attachCounts, setAttachCounts] = useState<Map<string, number>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await receivableService.list()
      setRows(data)
      try { setAttachCounts(await attachmentService.countFor('receivable', data.map((x) => x.id))) } catch { /* chưa migrate file */ }
    } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const k = useMemo(() => {
    const openR = rows.filter((r) => r.alert !== 'received')
    const aging: Record<AgingBucket, number> = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 }
    openR.forEach((r) => { aging[r.aging] += r.remaining })
    return {
      total: openR.reduce((s, r) => s + r.remaining, 0),
      overdue: openR.filter((r) => r.alert === 'overdue').reduce((s, r) => s + r.remaining, 0),
      overdueN: openR.filter((r) => r.alert === 'overdue').length,
      soon: openR.filter((r) => r.alert === 'due' || r.alert === 'soon').reduce((s, r) => s + r.remaining, 0),
      buyers: new Set(openR.map((r) => r.buyer_name)).size,
      aging,
    }
  }, [rows])

  const view = useMemo(() => {
    if (filter === 'open') return rows.filter((r) => r.alert !== 'received')
    if (filter === 'overdue') return rows.filter((r) => r.alert === 'overdue')
    if (filter === 'received') return rows.filter((r) => r.alert === 'received')
    return rows
  }, [rows, filter])

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ currency: 'USD', status: 'pending', term_days: 90 }); setOpen(true) }
  const openEdit = (r: FinReceivableComputed) => {
    setEditing(r)
    form.setFieldsValue({
      ...r, etd: r.etd ? dayjs(r.etd) : null, atd: r.atd ? dayjs(r.atd) : null, due_date: r.due_date ? dayjs(r.due_date) : null,
      doc_sent_date: r.doc_sent_date ? dayjs(r.doc_sent_date) : null, received_date: r.received_date ? dayjs(r.received_date) : null,
    })
    setOpen(true)
  }
  const handleSave = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const d = (x: any) => (x ? x.format('YYYY-MM-DD') : null)
      const payload = {
        buyer_name: v.buyer_name, contract_no: v.contract_no || null, commodity: v.commodity || null,
        currency: v.currency || 'USD', amount: v.amount || 0, amount_received: v.amount_received ?? 0,
        etd: d(v.etd), atd: d(v.atd), term_days: v.term_days ?? null, due_date: d(v.due_date),
        doc_sent_date: d(v.doc_sent_date), doc_tracking: v.doc_tracking || null, bank: v.bank || null,
        received_date: d(v.received_date), status: v.received_date ? 'received' : (v.status || 'pending'), note: v.note || null,
      }
      if (editing) await receivableService.update(editing.id, payload)
      else await receivableService.create({ ...payload, created_by: actorId })
      message.success('Đã lưu phải thu'); setOpen(false); load()
    } catch (e: any) { if (e?.errorFields) return; message.error('Lỗi lưu: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }
  const handleDelete = async (r: FinReceivableComputed) => {
    try { await receivableService.remove(r.id); message.success('Đã xoá'); load() }
    catch (e: any) { message.error('Lỗi xoá: ' + (e?.message || e)) }
  }
  const markReceived = async (r: FinReceivableComputed) => {
    try {
      await receivableService.update(r.id, { status: 'received', received_date: dayjs().format('YYYY-MM-DD'), amount_received: r.amount } as any)
      message.success('Đã ghi nhận đã thu'); load()
    } catch (e: any) { message.error('Lỗi: ' + (e?.message || e)) }
  }

  const columns = [
    { title: 'Khách hàng (Buyer)', dataIndex: 'buyer_name', width: 180, render: (v: string, r: FinReceivableComputed) => (
      <span><b>{v}</b>{r.contract_no ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.contract_no}</div> : null}</span>) },
    { title: 'Hàng', dataIndex: 'commodity', width: 90, render: (v: string) => v || '—' },
    { title: 'Giá trị', dataIndex: 'amount', width: 120, align: 'right' as const, render: (v: number, r: FinReceivableComputed) => <b>{fmtMoney(v, r.currency)}</b> },
    { title: 'Còn thu', dataIndex: 'remaining', width: 120, align: 'right' as const, render: (v: number, r: FinReceivableComputed) => v > 0 ? <b style={{ color: '#1677ff' }}>{fmtMoney(v, r.currency)}</b> : <Text type="secondary">—</Text> },
    { title: 'ETD/ATD', key: 'etd', width: 100, render: (_: any, r: FinReceivableComputed) => <span style={{ fontSize: 12 }}>{fDate(r.atd || r.etd)}</span> },
    { title: 'Hạn thu', dataIndex: 'effective_due', width: 110, render: (v: string, r: FinReceivableComputed) => (
      <span><b>{fDate(v)}</b>{r.alert !== 'received' && r.days_to_due < 0 ? <div style={{ fontSize: 11, color: '#dc2626' }}>quá {-r.days_to_due}d</div> : (r.alert !== 'received' && r.days_to_due <= 30 ? <div style={{ fontSize: 11, color: '#ca8a04' }}>còn {r.days_to_due}d</div> : null)}</span>) },
    { title: 'Trạng thái', key: 'al', width: 120, align: 'center' as const, render: (_: any, r: FinReceivableComputed) => (
      <span>{pill(AR_ALERT_COLOR[r.alert], AR_ALERT_LABEL[r.alert])}{r.received_date ? <div style={{ fontSize: 11, color: '#9ca3af' }}>về {fDate(r.received_date)}</div> : null}</span>) },
    { title: '', key: 'act', width: 140, fixed: 'right' as const, render: (_: any, r: FinReceivableComputed) => (
      <Space size={0}>
        {r.alert !== 'received' && <Tooltip title="Đánh dấu đã thu đủ"><Button type="text" size="small" icon={<DownloadOutlined style={{ color: '#16a34a' }} />} onClick={() => markReceived(r)} /></Tooltip>}
        <Tooltip title="Bộ chứng từ"><Badge count={attachCounts.get(r.id) || 0} size="small" offset={[-2, 2]}>
          <Button type="text" size="small" icon={<PaperClipOutlined style={{ color: '#1E3A5F' }} />} onClick={() => setAttach(r)} />
        </Badge></Tooltip>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Xoá phải thu này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelete(r)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>) },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>💵 Phải thu khách hàng</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ background: '#1E3A5F', borderColor: '#1E3A5F' }}>Thêm phải thu</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng phải thu (USD)" value={fmtUsd(k.total)} valueStyle={{ color: '#1677ff', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ background: k.overdueN ? '#fef2f2' : undefined }}><Statistic title={`Quá hạn (${k.overdueN})`} value={fmtUsd(k.overdue)} valueStyle={{ color: '#dc2626', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Sắp về ≤30 ngày" value={fmtUsd(k.soon)} valueStyle={{ color: '#ea580c', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Số khách còn nợ" value={k.buyers} valueStyle={{ color: '#1E3A5F', fontWeight: 800 }} suffix="KH" /></Card></Col>
      </Row>

      {/* Tuổi nợ */}
      <Card size="small" style={{ marginBottom: 12 }} title="Tuổi nợ (aging) — số còn phải thu (USD)">
        <Row gutter={8}>
          {BUCKETS.map((b) => (
            <Col key={b} xs={12} md={24 / 5 as any} style={{ flex: 1 }}>
              <div style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 8, background: k.aging[b] ? BUCKET_COLOR[b] + '14' : '#f8fafc' }}>
                <div style={{ fontSize: 12, color: BUCKET_COLOR[b], fontWeight: 600 }}>{AGING_LABEL[b]}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: k.aging[b] ? BUCKET_COLOR[b] : '#cbd5e1' }}>{fmtUsd(k.aging[b])}</div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {k.overdue > 0 && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }}
          message={<span><b>{k.overdueN} khoản phải thu QUÁ HẠN</b> — tổng {fmtUsd(k.overdue)}. Cần đốc thu / kiểm tra bộ chứng từ.</span>} />
      )}

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 10 }}>
          <Segmented value={filter} onChange={(v) => setFilter(v as string)}
            options={[
              { label: `Chưa thu (${rows.filter((r) => r.alert !== 'received').length})`, value: 'open' },
              { label: `Quá hạn (${k.overdueN})`, value: 'overdue' },
              { label: 'Đã thu', value: 'received' },
              { label: 'Tất cả', value: 'all' },
            ]} />
        </div>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={view}
          pagination={{ pageSize: 30, showSizeChanger: false }} scroll={{ x: 1180 }}
          locale={{ emptyText: 'Chưa có phải thu. Bấm "Thêm phải thu" hoặc import từ Excel.' }} />
      </Card>

      <Modal title={editing ? 'Sửa phải thu' : 'Thêm phải thu khách hàng'} open={open} onCancel={() => setOpen(false)}
        onOk={handleSave} okText="Lưu" cancelText="Huỷ" confirmLoading={saving} width={720} destroyOnClose
        okButtonProps={{ style: { background: '#1E3A5F', borderColor: '#1E3A5F' } }}>
        <Form form={form} layout="vertical" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="buyer_name" label="Khách hàng (Buyer)" rules={[{ required: true }]} style={{ gridColumn: '1 / 3' }}><Input placeholder="vd: JIANGSU…" /></Form.Item>
            <Form.Item name="commodity" label="Mặt hàng"><Input placeholder="SVR / RSS…" /></Form.Item>
            <Form.Item name="contract_no" label="Số hợp đồng" style={{ gridColumn: '1 / 3' }}><Input placeholder="vd: HA2026… / LTC2025/PD-…" /></Form.Item>
            <Form.Item name="bank" label="Bank xử lý"><Input placeholder="VTB / Eximbank…" /></Form.Item>
            <Form.Item name="currency" label="Tiền tệ"><Select options={[{ value: 'USD', label: 'USD' }, { value: 'VND', label: 'VND' }]} /></Form.Item>
            <Form.Item name="amount" label="Giá trị hóa đơn" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
            <Form.Item name="amount_received" label="Đã thu"><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
            <Form.Item name="etd" label="ETD (dự kiến)"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="atd" label="ATD (tàu chạy thực)"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="term_days" label="Term (ngày)" tooltip="Số ngày thanh toán kể từ ATD/ETD"><InputNumber min={0} style={{ width: '100%' }} placeholder="90" /></Form.Item>
            <Form.Item name="due_date" label="Hạn thu (để trống = tự tính)"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="doc_sent_date" label="Ngày gửi BCT (DHL)"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="doc_tracking" label="Số DHL"><Input placeholder="55 7671…" /></Form.Item>
            <Form.Item name="received_date" label="Ngày tiền về" tooltip="Nhập = tự đánh dấu ĐÃ THU"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="status" hidden initialValue="pending"><Input /></Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={attach ? `📎 Bộ chứng từ — ${attach.buyer_name}${attach.contract_no ? ' · ' + attach.contract_no : ''}` : ''}
        open={!!attach} onClose={() => { setAttach(null); load() }} width={520} destroyOnClose>
        {attach && <FinanceAttachments entityType="receivable" entityId={attach.id} />}
      </Drawer>
    </div>
  )
}
