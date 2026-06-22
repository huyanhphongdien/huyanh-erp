// ============================================================================
// VỐN VAY — KHOẢN VAY (Đợt 1): danh sách + thêm/sửa + ghi trả nợ
// File: src/pages/finance/FinanceLoanListPage.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Card, Table, Button, Tag, Typography, Modal, Form, Input, InputNumber, DatePicker,
  Select, AutoComplete, Space, message, Popconfirm, Drawer, Segmented, Tooltip,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, DollarOutlined, BankOutlined, RightOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  loanService, CIC_LABEL, CIC_COLOR, CIC_BG, BANKS,
  type FinLoanComputed, type FinRepayment,
} from '../../services/finance/loanService'
import { creditLineService, type FinCreditLineComputed } from '../../services/finance/creditLineService'
import FacilityDrawer from './FacilityDrawer'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography
const fmtVnd = (n?: number | null) => (n || 0).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const numFmt = (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numParse = (v?: string) => (v || '').replace(/\./g, '')

export default function FinanceLoanListPage() {
  const user = useAuthStore((s) => s.user)
  const actorId = user?.employee_id || user?.id || null
  const [sp] = useSearchParams()
  const focusId = sp.get('focus')

  const [loans, setLoans] = useState<FinLoanComputed[]>([])
  const [lines, setLines] = useState<FinCreditLineComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FinLoanComputed | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // Drawer trả nợ
  const [payLoan, setPayLoan] = useState<FinLoanComputed | null>(null)
  const [repays, setRepays] = useState<FinRepayment[]>([])
  const [payForm] = Form.useForm()
  // Drawer hạn mức
  const [drawerLine, setDrawerLine] = useState<FinCreditLineComputed | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, cl] = await Promise.all([loanService.list(), creditLineService.listComputed()])
      setLoans(l); setLines(cl)
    } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Cuộn tới dòng được mở từ Drawer Hạn mức (?focus=<id>)
  useEffect(() => {
    if (!focusId || loading) return
    const t = setTimeout(() => {
      document.querySelector(`[data-row-key="${focusId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
    return () => clearTimeout(t)
  }, [focusId, loading, loans])

  const lineMap = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines])
  const lineOptions = useMemo(() => lines.filter((l) => l.status === 'active')
    .map((l) => ({ value: l.id, label: `${l.bank}${l.contract_no ? ' · ' + l.contract_no : ''} · HM ${fmtTy(l.limit_amount || 0)} · còn ${fmtTy(l.room)}` })), [lines])

  const rows = useMemo(() => {
    if (filter === 'all') return loans
    if (filter === 'danger') return loans.filter((l) => l.cic === 'orange' || l.cic === 'red')
    if (filter === 'active') return loans.filter((l) => l.status === 'active')
    if (filter === 'paid') return loans.filter((l) => l.cic === 'paid')
    return loans
  }, [loans, filter])

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ currency: 'VND', status: 'active' }); setFormOpen(true) }
  const openEdit = (l: FinLoanComputed) => {
    setEditing(l)
    form.setFieldsValue({
      ...l,
      disbursed_date: l.disbursed_date ? dayjs(l.disbursed_date) : null,
      due_date: l.due_date ? dayjs(l.due_date) : null,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const payload = {
        bank: v.bank, loan_no: v.loan_no || null, credit_line_id: v.credit_line_id || null,
        principal: v.principal || 0, currency: v.currency || 'VND',
        disbursed_date: v.disbursed_date ? v.disbursed_date.format('YYYY-MM-DD') : null,
        due_date: v.due_date.format('YYYY-MM-DD'),
        interest_rate: v.interest_rate ?? null, purpose: v.purpose || null,
        note: v.note || null, status: v.status || 'active',
      }
      if (editing) await loanService.update(editing.id, payload)
      else await loanService.create({ ...payload, created_by: actorId })
      message.success('Đã lưu khoản vay')
      setFormOpen(false); load()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('Lỗi lưu: ' + (e?.message || e))
    } finally { setSaving(false) }
  }

  const handleDelete = async (l: FinLoanComputed) => {
    try { await loanService.remove(l.id); message.success('Đã xoá'); load() }
    catch (e: any) { message.error('Lỗi xoá: ' + (e?.message || e)) }
  }

  // ── Trả nợ ──
  const openPay = async (l: FinLoanComputed) => {
    setPayLoan(l); payForm.resetFields()
    payForm.setFieldsValue({ paid_date: dayjs(), amount: l.remaining, source: 'customer' })
    try { setRepays(await loanService.listRepayments(l.id)) } catch { setRepays([]) }
  }
  const handleAddPay = async () => {
    if (!payLoan) return
    try {
      const v = await payForm.validateFields()
      await loanService.addRepayment(payLoan.id, {
        paid_date: v.paid_date.format('YYYY-MM-DD'), amount: v.amount,
        source: v.source || null, note: v.note || null, created_by: actorId,
      })
      message.success('Đã ghi trả nợ')
      setRepays(await loanService.listRepayments(payLoan.id))
      payForm.resetFields(); payForm.setFieldsValue({ paid_date: dayjs(), source: 'customer' })
      load()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('Lỗi: ' + (e?.message || e))
    }
  }
  const handleDelPay = async (id: string) => {
    if (!payLoan) return
    try { await loanService.removeRepayment(id); setRepays(await loanService.listRepayments(payLoan.id)); load() }
    catch (e: any) { message.error('Lỗi: ' + (e?.message || e)) }
  }

  const cicTag = (l: FinLoanComputed) => (
    <span style={{ display: 'inline-block', background: CIC_COLOR[l.cic], color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>
      {(l.cic === 'red' || l.cic === 'orange') && l.overdue_days >= 0 ? `quá ${l.overdue_days}d · ` : ''}{CIC_LABEL[l.cic]}
    </span>
  )

  const columns = [
    { title: 'Ngân hàng', dataIndex: 'bank', width: 160, render: (v: string, r: FinLoanComputed) => (
      <span><b>{v}</b>{r.loan_no ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.loan_no}</div> : null}</span>) },
    { title: 'Số vay', dataIndex: 'principal', width: 130, align: 'right' as const, render: (v: number) => fmtVnd(v) },
    { title: 'Đã trả', dataIndex: 'paid_amount', width: 130, align: 'right' as const, render: (v: number) => v ? <Text type="success">{fmtVnd(v)}</Text> : '—' },
    { title: 'Còn lại', dataIndex: 'remaining', width: 130, align: 'right' as const, render: (v: number) => <b style={{ color: '#92400E' }}>{fmtVnd(v)}</b> },
    { title: 'Lãi suất', dataIndex: 'interest_rate', width: 80, align: 'right' as const, render: (v: number | null) => v != null ? `${v}%` : '—' },
    { title: 'Đến hạn', dataIndex: 'due_date', width: 110, align: 'center' as const, render: (v: string, r: FinLoanComputed) => (
      <span>{fDate(v)}<div style={{ fontSize: 11, color: '#9ca3af' }}>{r.overdue_days >= 0 ? `quá ${r.overdue_days}d` : `còn ${-r.overdue_days}d`}</div></span>) },
    { title: 'Nhảy nhóm', dataIndex: 'jump_date', width: 110, align: 'center' as const, render: (v: string, r: FinLoanComputed) =>
      r.cic === 'paid' ? '—' : <Tooltip title="Quá hạn ≥10 ngày → CIC nhóm 2"><Text type="danger">{fDate(v)}</Text></Tooltip> },
    { title: 'Trạng thái', key: 'cic', width: 150, render: (_: any, r: FinLoanComputed) => cicTag(r) },
    { title: 'Hạn mức (HĐTD)', key: 'line', width: 185, render: (_: any, r: FinLoanComputed) => {
      const cl = r.credit_line_id ? lineMap.get(r.credit_line_id) : null
      return cl
        ? <Button type="link" size="small" style={{ padding: 0, fontSize: 12, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setDrawerLine(cl)}>🏦 {cl.bank} · HM <b>{fmtTy(cl.limit_amount || 0)}</b>{cl.depositCount ? <span style={{ color: '#1677ff' }}> · 🔒{cl.depositCount}</span> : ''} <RightOutlined style={{ fontSize: 10 }} /></Button>
        : <Text type="secondary" style={{ fontSize: 12 }}>— chưa nối</Text>
    } },
    { title: '', key: 'act', width: 120, fixed: 'right' as const, render: (_: any, r: FinLoanComputed) => (
      <Space size={2}>
        <Tooltip title="Ghi trả nợ"><Button type="text" size="small" icon={<DollarOutlined style={{ color: '#16a34a' }} />} onClick={() => openPay(r)} /></Tooltip>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Xoá khoản vay này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelete(r)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>) },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}><BankOutlined /> Khoản vay ngân hàng</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Thêm khoản vay</Button>
        </Space>
      </div>

      <Segmented style={{ marginBottom: 12 }} value={filter} onChange={(v) => setFilter(v as string)}
        options={[
          { label: `Tất cả (${loans.length})`, value: 'all' },
          { label: `🔴 Nguy cơ (${loans.filter((l) => l.cic === 'orange' || l.cic === 'red').length})`, value: 'danger' },
          { label: 'Đang vay', value: 'active' },
          { label: 'Đã tất toán', value: 'paid' },
        ]} />

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={rows}
          pagination={{ pageSize: 30, showSizeChanger: false }} scroll={{ x: 1380 }}
          rowClassName={(r) => (r.id === focusId ? 'ant-table-row-selected' : '')}
          onRow={(r) => ({ style: { background: r.id === focusId ? '#fffbe6' : CIC_BG[r.cic] } })} />
      </Card>

      {/* Form thêm/sửa */}
      <Modal title={editing ? 'Sửa khoản vay' : 'Thêm khoản vay'} open={formOpen} onCancel={() => setFormOpen(false)}
        onOk={handleSave} okText="Lưu" cancelText="Huỷ" confirmLoading={saving} width={640} destroyOnClose
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}>
        <Form form={form} layout="vertical" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="bank" label="Ngân hàng" rules={[{ required: true, message: 'Chọn ngân hàng' }]}>
              <AutoComplete options={BANKS.map((b) => ({ value: b }))} placeholder="Agribank…" filterOption={(i, o) => (o?.value || '').toLowerCase().includes(i.toLowerCase())} />
            </Form.Item>
            <Form.Item name="loan_no" label="Số khế ước"><Input placeholder="vd: 4000-LCL-..." /></Form.Item>
            <Form.Item name="credit_line_id" label="🏦 Thuộc hạn mức (HĐTD)" style={{ gridColumn: '1 / -1' }}
              tooltip="Khoản vay này rút từ hạn mức nào — để tính room còn lại + tiền gửi đảm bảo">
              <Select allowClear showSearch optionFilterProp="label"
                placeholder={lineOptions.length ? 'Chọn hạn mức…' : 'Chưa có hạn mức — thêm ở tab Hạn mức'}
                options={lineOptions} notFoundContent="Chưa có hạn mức" />
            </Form.Item>
            <Form.Item name="principal" label="Số vay (VNĐ)" rules={[{ required: true, message: 'Nhập số vay' }]}>
              <InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} placeholder="0" />
            </Form.Item>
            <Form.Item name="interest_rate" label="Lãi suất (%/năm)"><InputNumber min={0} step={0.1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="disbursed_date" label="Ngày giải ngân"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="due_date" label="Ngày đến hạn" rules={[{ required: true, message: 'Nhập ngày đến hạn' }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={[{ value: 'active', label: 'Đang vay' }, { value: 'paid', label: 'Đã tất toán' }, { value: 'cancelled', label: 'Huỷ' }]} />
            </Form.Item>
            <Form.Item name="currency" label="Tiền tệ" hidden initialValue="VND"><Input /></Form.Item>
            <Form.Item name="purpose" label="Mục đích"><Input placeholder="vd: vốn lưu động" /></Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>
        </Form>
      </Modal>

      {/* Drawer trả nợ */}
      <Drawer title={payLoan ? `Trả nợ — ${payLoan.bank} (còn ${fmtVnd(payLoan.remaining)})` : ''} open={!!payLoan}
        onClose={() => setPayLoan(null)} width={520}>
        {payLoan && (
          <>
            <Form form={payForm} layout="vertical" size="small">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="paid_date" label="Ngày trả" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} />
                </Form.Item>
                <Form.Item name="source" label="Nguồn">
                  <Select options={[{ value: 'customer', label: 'Tiền hàng KH' }, { value: 'cash', label: 'Quỹ' }, { value: 'other', label: 'Khác' }]} />
                </Form.Item>
                <Form.Item name="note" label="Ghi chú"><Input /></Form.Item>
              </div>
              <Button type="primary" block icon={<DollarOutlined />} onClick={handleAddPay} style={{ background: '#16a34a', borderColor: '#16a34a' }}>Ghi trả nợ</Button>
            </Form>
            <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>Lịch sử trả nợ ({repays.length})</div>
            <Table rowKey="id" size="small" pagination={false} dataSource={repays}
              locale={{ emptyText: 'Chưa có lần trả nào' }}
              columns={[
                { title: 'Ngày', dataIndex: 'paid_date', render: fDate },
                { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v: number) => <b>{fmtVnd(v)}</b> },
                { title: 'Nguồn', dataIndex: 'source', render: (v: string) => v === 'customer' ? 'Tiền hàng' : v === 'cash' ? 'Quỹ' : (v || '—') },
                { title: '', key: 'd', width: 36, render: (_: any, r: FinRepayment) => (
                  <Popconfirm title="Xoá lần trả này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelPay(r.id)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>) },
              ] as any} />
          </>
        )}
      </Drawer>

      <FacilityDrawer line={drawerLine} open={!!drawerLine} onClose={() => setDrawerLine(null)} />
    </div>
  )
}
