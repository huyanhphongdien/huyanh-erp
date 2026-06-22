// ============================================================================
// VỐN VAY — HỢP ĐỒNG TIỀN GỬI (HĐTG) — Đợt 2
// File: src/pages/finance/FinanceDepositListPage.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Card, Table, Button, Tag, Typography, Modal, Form, Input, InputNumber, DatePicker,
  Select, AutoComplete, Space, message, Popconfirm, Segmented, Tooltip, Row, Col, Statistic, Alert,
} from 'antd'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  depositService, ALERT_LABEL, ALERT_COLOR, ALERT_BG,
  type FinDepositComputed,
} from '../../services/finance/depositService'
import { loanService, BANKS, type FinLoanComputed } from '../../services/finance/loanService'
import LinkDrawer from './LinkDrawer'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography
const fmtVnd = (n?: number | null) => (n || 0).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const numFmt = (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numParse = (v?: string) => (v || '').replace(/\./g, '')

export default function FinanceDepositListPage() {
  const user = useAuthStore((s) => s.user)
  const actorId = user?.employee_id || user?.id || null
  const [rows, setRows] = useState<FinDepositComputed[]>([])
  const [loans, setLoans] = useState<FinLoanComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FinDepositComputed | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  // Drawer liên kết
  const [linkLoan, setLinkLoan] = useState<FinLoanComputed | null>(null)
  const [highlightDep, setHighlightDep] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, l] = await Promise.all([depositService.list(), loanService.list()])
      setRows(d); setLoans(l)
    } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const loanMap = useMemo(() => new Map(loans.map((l) => [l.id, l])), [loans])
  const loanOptions = useMemo(() => loans.filter((l) => l.status !== 'paid')
    .map((l) => ({ value: l.id, label: `${l.bank} · ${fmtVnd(l.principal)} · đến hạn ${fDate(l.due_date)}` })), [loans])

  const k = useMemo(() => {
    const active = rows.filter((d) => d.status !== 'closed')
    const total = active.reduce((s, d) => s + (d.amount || 0), 0)
    const secure = active.filter((d) => d.purpose === 'dam_bao_vay').reduce((s, d) => s + (d.amount || 0), 0)
    const near = active.filter((d) => d.alert === 'due' || d.alert === 'overdue' || d.alert === 'soon')
    return { total, secure, nearCount: near.length, urgent: active.filter((d) => d.alert === 'due' || d.alert === 'overdue') }
  }, [rows])

  const view = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'near') return rows.filter((d) => d.alert === 'due' || d.alert === 'overdue' || d.alert === 'soon')
    if (filter === 'active') return rows.filter((d) => d.status === 'active')
    if (filter === 'closed') return rows.filter((d) => d.status === 'closed')
    return rows
  }, [rows, filter])

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ currency: 'VND', purpose: 'dam_bao_vay', status: 'active', term: '12 tháng' }); setOpen(true) }
  const openEdit = (d: FinDepositComputed) => {
    setEditing(d)
    form.setFieldsValue({
      ...d,
      deposit_date: d.deposit_date ? dayjs(d.deposit_date) : null,
      maturity_date: d.maturity_date ? dayjs(d.maturity_date) : null,
      extended_to: d.extended_to ? dayjs(d.extended_to) : null,
    })
    setOpen(true)
  }
  const handleSave = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const payload = {
        bank: v.bank, deposit_no: v.deposit_no || null, holder: v.holder || null,
        amount: v.amount || 0, currency: v.currency || 'VND',
        deposit_date: v.deposit_date ? v.deposit_date.format('YYYY-MM-DD') : null,
        maturity_date: v.maturity_date ? v.maturity_date.format('YYYY-MM-DD') : null,
        extended_to: v.extended_to ? v.extended_to.format('YYYY-MM-DD') : null,
        interest_rate: v.interest_rate ?? null, term: v.term || null,
        expected_interest: v.expected_interest ?? null, purpose: v.purpose || 'dam_bao_vay',
        secured_loan_id: v.secured_loan_id || null,
        status: v.status || 'active', note: v.note || null,
      }
      if (editing) await depositService.update(editing.id, payload)
      else await depositService.create({ ...payload, created_by: actorId })
      message.success('Đã lưu HĐTG'); setOpen(false); load()
    } catch (e: any) { if (e?.errorFields) return; message.error('Lỗi lưu: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }
  const handleDelete = async (d: FinDepositComputed) => {
    try { await depositService.remove(d.id); message.success('Đã xoá'); load() }
    catch (e: any) { message.error('Lỗi xoá: ' + (e?.message || e)) }
  }

  const pill = { display: 'inline-block', color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' as const }
  const alertTag = (d: FinDepositComputed) => (
    <span style={{ ...pill, background: ALERT_COLOR[d.alert] }}>
      {d.days_to_maturity != null && d.alert !== 'closed' && d.alert !== 'ok'
        ? (d.days_to_maturity >= 0 ? `còn ${d.days_to_maturity}d · ` : `quá ${-d.days_to_maturity}d · `) : ''}
      {ALERT_LABEL[d.alert]}
    </span>
  )

  const columns = [
    { title: 'Ngân hàng', dataIndex: 'bank', width: 140, render: (v: string, r: FinDepositComputed) => (
      <span><b>{v}</b>{r.holder ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.holder}</div> : null}{r.deposit_no ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.deposit_no}</div> : null}</span>) },
    { title: 'Số tiền', dataIndex: 'amount', width: 130, align: 'right' as const, render: (v: number) => <b>{fmtVnd(v)}</b> },
    { title: 'LS', dataIndex: 'interest_rate', width: 70, align: 'right' as const, render: (v: number | null) => v != null ? `${v}%` : '—' },
    { title: 'Kỳ hạn', dataIndex: 'term', width: 90, render: (v: string | null) => v || '—' },
    { title: 'Ngày gửi', dataIndex: 'deposit_date', width: 100, align: 'center' as const, render: fDate },
    { title: 'Đáo hạn', dataIndex: 'effective_maturity', width: 110, align: 'center' as const, render: (v: string, r: FinDepositComputed) => (
      <span>{fDate(v)}{r.extended_to ? <div style={{ fontSize: 10, color: '#16a34a' }}>(gia hạn)</div> : null}</span>) },
    { title: 'Mục đích', dataIndex: 'purpose', width: 110, render: (v: string) => v === 'dam_bao_vay' ? <Tag color="blue">Đảm bảo vay</Tag> : <Tag>Thường</Tag> },
    { title: 'Đảm bảo cho khoản vay', key: 'secured', width: 170, render: (_: any, r: FinDepositComputed) => {
      const ln = r.secured_loan_id ? loanMap.get(r.secured_loan_id) : null
      return ln
        ? <Button type="link" size="small" style={{ padding: 0, fontSize: 12, height: 'auto', textAlign: 'left', whiteSpace: 'normal' }} onClick={() => { setLinkLoan(ln); setHighlightDep(r.id) }}>
            🔗 {ln.bank} · <b>{fmtTy(ln.principal)}</b> <span style={{ color: '#9ca3af' }}>· xem ›</span>
          </Button>
        : <Text type="secondary" style={{ fontSize: 12 }}>— chưa nối</Text>
    } },
    { title: 'Trạng thái', key: 'alert', width: 160, render: (_: any, r: FinDepositComputed) => alertTag(r) },
    { title: '', key: 'act', width: 70, fixed: 'right' as const, render: (_: any, r: FinDepositComputed) => (
      <Space size={2}>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Xoá HĐTG này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelete(r)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>) },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}><SafetyCertificateOutlined /> Hợp đồng tiền gửi (HĐTG)</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Thêm HĐTG</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng tiền gửi" value={fmtTy(k.total)} valueStyle={{ color: '#1B4D3E', fontWeight: 800 }} /><Text type="secondary" style={{ fontSize: 12 }}>{fmtVnd(k.total)} đ</Text></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Đảm bảo khoản vay" value={fmtTy(k.secure)} valueStyle={{ color: '#1677ff', fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ background: k.urgent.length ? '#fff7ed' : undefined }}><Statistic title="Cần tái tục gấp (≤7d/quá hạn)" value={k.urgent.length} suffix="HĐ" valueStyle={{ color: k.urgent.length ? '#dc2626' : '#16a34a', fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Sắp đáo hạn (≤30d)" value={k.nearCount} suffix="HĐ" valueStyle={{ color: '#ca8a04', fontWeight: 800 }} /></Card></Col>
      </Row>

      {k.urgent.length > 0 && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }}
          message={`${k.urgent.length} HĐTG cần TÁI TỤC gấp — quên là bị tất toán ép (đảm bảo khoản vay sẽ hụt).`} />
      )}

      <Segmented style={{ marginBottom: 12 }} value={filter} onChange={(v) => setFilter(v as string)}
        options={[
          { label: `Tất cả (${rows.length})`, value: 'all' },
          { label: `⚠ Sắp/quá đáo hạn (${rows.filter((d) => d.alert === 'due' || d.alert === 'overdue' || d.alert === 'soon').length})`, value: 'near' },
          { label: 'Đang gửi', value: 'active' },
          { label: 'Đã tất toán', value: 'closed' },
        ]} />

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={view}
          pagination={{ pageSize: 30, showSizeChanger: false }} scroll={{ x: 1380 }}
          onRow={(r) => ({ style: { background: ALERT_BG[r.alert] } })} />
      </Card>

      <Modal title={editing ? 'Sửa HĐTG' : 'Thêm HĐTG'} open={open} onCancel={() => setOpen(false)}
        onOk={handleSave} okText="Lưu" cancelText="Huỷ" confirmLoading={saving} width={680} destroyOnClose
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}>
        <Form form={form} layout="vertical" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="bank" label="Ngân hàng" rules={[{ required: true }]}>
              <AutoComplete options={BANKS.map((b) => ({ value: b }))} placeholder="Vietinbank…" filterOption={(i, o) => (o?.value || '').toLowerCase().includes(i.toLowerCase())} />
            </Form.Item>
            <Form.Item name="deposit_no" label="Số HĐTG / cầm cố"><Input placeholder="vd: 1012/2024/HĐTG" /></Form.Item>
            <Form.Item name="holder" label="Chủ sổ"><Input placeholder="vd: Công ty / Sổ TK anh Huy" /></Form.Item>
            <Form.Item name="amount" label="Số tiền (VNĐ)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
            <Form.Item name="interest_rate" label="Lãi suất (%/năm)"><InputNumber min={0} step={0.1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="term" label="Kỳ hạn"><Input placeholder="12 tháng" /></Form.Item>
            <Form.Item name="deposit_date" label="Ngày gửi"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="maturity_date" label="Ngày đến hạn"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="extended_to" label="Gia hạn đến" tooltip="Nếu đã tái tục/gia hạn → đèn tính theo ngày này"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="expected_interest" label="Lãi cuối kỳ dự kiến"><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
            <Form.Item name="purpose" label="Mục đích">
              <Select options={[{ value: 'dam_bao_vay', label: 'Đảm bảo khoản vay' }, { value: 'thuong', label: 'Tiền gửi thường' }]} />
            </Form.Item>
            <Form.Item name="secured_loan_id" label="🔗 Đảm bảo cho khoản vay" style={{ gridColumn: '1 / -1' }}
              tooltip="HĐTG này cầm cố bảo lãnh cho khoản vay nào — để thấy rõ cái nào chống lưng cái nào">
              <Select allowClear showSearch optionFilterProp="label"
                placeholder={loanOptions.length ? 'Chọn khoản vay được đảm bảo…' : 'Chưa có khoản vay — thêm ở tab Khoản vay trước'}
                options={loanOptions} notFoundContent="Chưa có khoản vay" />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={[{ value: 'active', label: 'Đang gửi' }, { value: 'closed', label: 'Đã tất toán' }]} />
            </Form.Item>
            <Form.Item name="currency" hidden initialValue="VND"><Input /></Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>
        </Form>
      </Modal>

      <LinkDrawer loan={linkLoan} deposits={rows} open={!!linkLoan}
        onClose={() => { setLinkLoan(null); setHighlightDep(null) }} highlightDepositId={highlightDep} from="deposits" />
    </div>
  )
}
