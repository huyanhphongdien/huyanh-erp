// ============================================================================
// VỐN VAY — KHOẢN VAY (Đợt 1): danh sách + thêm/sửa + ghi trả nợ
// File: src/pages/finance/FinanceLoanListPage.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Card, Table, Button, Typography, Modal, Form, Input, InputNumber, DatePicker,
  Select, AutoComplete, Space, message, Popconfirm, Drawer, Segmented, Tooltip, Badge, Alert,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, DollarOutlined, BankOutlined, RightOutlined, PercentageOutlined, PaperClipOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import FinanceLendingTabs from './FinanceLendingTabs'
import {
  loanService, CIC_BG, BANKS, LOAN_STATUS_LABELS, REPAYMENT_SOURCE_LABELS,
  type FinLoanComputed, type FinRepayment,
} from '../../services/finance/loanService'
import { creditLineService, type FinCreditLineComputed } from '../../services/finance/creditLineService'
import FacilityDrawer from './FacilityDrawer'
import InterestDrawer from './InterestDrawer'
import FinanceAttachments from './FinanceAttachments'
import { attachmentService } from '../../services/finance/attachmentService'
import { useAuthStore } from '../../stores/authStore'
import { fmtVnd, fmtVndNum, fmtTy, fmtDate, vndInputProps } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import PageState from '../../components/common/PageState'
import { stdPagination } from '../../components/common/tableDefaults'
import { enumLabel } from '../../components/common/EnumTag'
import { hanText, CicPill, useFocusRow } from './finUi'

const { Title, Text } = Typography

export default function FinanceLoanListPage() {
  const user = useAuthStore((s) => s.user)
  const actorId = user?.employee_id || user?.id || null
  const [sp] = useSearchParams()
  const focusId = sp.get('focus')

  const [loans, setLoans] = useState<FinLoanComputed[]>([])
  const [lines, setLines] = useState<FinCreditLineComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [filter, setFilter] = useState<string>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FinLoanComputed | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // Drawer trả nợ
  const [payLoan, setPayLoan] = useState<FinLoanComputed | null>(null)
  const payIdRef = useRef<string | null>(null)   // khoản đang mở — chặn kết quả tải muộn ghi đè drawer khác
  const [repays, setRepays] = useState<FinRepayment[]>([])
  const [repaysErr, setRepaysErr] = useState<unknown>(null)
  const [payForm] = Form.useForm()
  // Drawer hạn mức
  const [drawerLine, setDrawerLine] = useState<FinCreditLineComputed | null>(null)
  // Drawer lịch lãi
  const [interestLoan, setInterestLoan] = useState<FinLoanComputed | null>(null)
  // Modal đính kèm chứng từ trả nợ
  const [attachRepay, setAttachRepay] = useState<{ id: string; label: string } | null>(null)
  // Drawer tài liệu khoản vay
  const [attachLoan, setAttachLoan] = useState<FinLoanComputed | null>(null)
  const [attachCounts, setAttachCounts] = useState<Map<string, number>>(new Map())

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [l, cl] = await Promise.all([loanService.list(), creditLineService.listComputed()])
      setLoans(l); setLines(cl)
      try { setAttachCounts(await attachmentService.countFor('loan', l.map((x) => x.id))) } catch { /* bảng file chưa tạo */ }
    } catch (e) { setLoadError(e) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Cuộn tới dòng được mở từ Drawer Hạn mức / Tổng quan (?focus=<id>)
  useFocusRow(focusId, !loading, loans)

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
      message.error(dichLoiHeThong(e, 'Lưu khoản vay thất bại'))
    } finally { setSaving(false) }
  }

  const handleDelete = async (l: FinLoanComputed) => {
    try { await loanService.remove(l.id); message.success('Đã xoá'); load() }
    catch (e) { message.error(dichLoiHeThong(e, 'Xoá khoản vay thất bại')) }
  }

  // ── Trả nợ ──
  // Sau mỗi lần ghi / xoá: tải lại lịch sử VÀ số còn lại (trigger DB cộng lại paid_amount), điền sẵn số còn lại
  // vào ô Số tiền. Trước 17/11/2026 tiêu đề drawer giữ số "còn" CŨ tới khi đóng-mở lại → tưởng chưa lưu.
  const refreshPay = async (loanId: string) => {
    try {
      const [list, fresh] = await Promise.all([loanService.listRepayments(loanId), loanService.getById(loanId)])
      if (payIdRef.current !== loanId) return
      setRepays(list); setRepaysErr(null)
      if (fresh) {
        setPayLoan(fresh)
        payForm.setFieldsValue({ amount: fresh.remaining > 0 ? fresh.remaining : undefined })
      }
    } catch (e) { if (payIdRef.current === loanId) setRepaysErr(e) }
  }
  const openPay = async (l: FinLoanComputed) => {
    payIdRef.current = l.id
    setPayLoan(l); setRepays([]); setRepaysErr(null); payForm.resetFields()
    payForm.setFieldsValue({ paid_date: dayjs(), amount: l.remaining, source: 'customer' })
    try {
      const list = await loanService.listRepayments(l.id)
      if (payIdRef.current === l.id) setRepays(list)
    } catch (e) { if (payIdRef.current === l.id) setRepaysErr(e) }
  }
  const closePay = () => { payIdRef.current = null; setPayLoan(null) }
  const handleAddPay = async () => {
    if (!payLoan) return
    let v: any
    try { v = await payForm.validateFields() } catch { return }
    try {
      await loanService.addRepayment(payLoan.id, {
        paid_date: v.paid_date.format('YYYY-MM-DD'), amount: v.amount,
        source: v.source || null, note: v.note || null, created_by: actorId,
      })
    } catch (e) { message.error(dichLoiHeThong(e, 'Ghi trả nợ thất bại')); return }
    message.success('Đã ghi trả nợ')
    payForm.resetFields(); payForm.setFieldsValue({ paid_date: dayjs(), source: 'customer' })
    load()
    await refreshPay(payLoan.id)
  }
  const handleDelPay = async (id: string) => {
    if (!payLoan) return
    try { await loanService.removeRepayment(id) } catch (e) { message.error(dichLoiHeThong(e, 'Xoá lần trả thất bại')); return }
    message.success('Đã xoá lần trả')
    load()
    await refreshPay(payLoan.id)
  }

  const cicTag = (l: FinLoanComputed) => <CicPill loan={l} />

  const columns = [
    { title: 'Ngân hàng', dataIndex: 'bank', width: 160, render: (v: string, r: FinLoanComputed) => (
      <span><b>{v}</b>{r.loan_no ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.loan_no}</div> : null}</span>) },
    { title: 'Số vay', dataIndex: 'principal', width: 130, align: 'right' as const, render: (v: number) => fmtVndNum(v) },
    { title: 'Đã trả', dataIndex: 'paid_amount', width: 130, align: 'right' as const, render: (v: number) => v ? <Text type="success">{fmtVndNum(v)}</Text> : '—' },
    { title: 'Còn lại', dataIndex: 'remaining', width: 130, align: 'right' as const, render: (v: number) => <b style={{ color: '#92400E' }}>{fmtVndNum(v)}</b> },
    { title: 'Lãi suất', dataIndex: 'interest_rate', width: 80, align: 'right' as const, render: (v: number | null) => v != null ? `${v}%` : '—' },
    // Đúng ngày đến hạn = "hôm nay" (trước: "quá 0d"); khoản đã tất toán không còn đếm ngày quá hạn
    { title: 'Đến hạn', dataIndex: 'due_date', width: 110, align: 'center' as const, render: (v: string, r: FinLoanComputed) => (
      <span>{fmtDate(v)}{r.cic !== 'paid' ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{hanText(-r.overdue_days)}</div> : null}</span>) },
    { title: 'Nhảy nhóm', dataIndex: 'jump_date', width: 110, align: 'center' as const, render: (v: string, r: FinLoanComputed) =>
      r.cic === 'paid' ? '—' : <Tooltip title="Quá hạn ≥10 ngày → CIC nhóm 2"><Text type="danger">{fmtDate(v)}</Text></Tooltip> },
    { title: 'Trạng thái', key: 'cic', width: 220, render: (_: any, r: FinLoanComputed) => cicTag(r) },
    { title: 'Hạn mức (HĐTD)', key: 'line', width: 185, render: (_: any, r: FinLoanComputed) => {
      const cl = r.credit_line_id ? lineMap.get(r.credit_line_id) : null
      return cl
        ? <Button type="link" size="small" style={{ padding: 0, fontSize: 12, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setDrawerLine(cl)}>🏦 {cl.bank} · HM <b>{fmtTy(cl.limit_amount || 0)}</b>{cl.depositCount ? <span style={{ color: '#1677ff' }}> · 🔒{cl.depositCount}</span> : ''} <RightOutlined style={{ fontSize: 10 }} /></Button>
        : <Text type="secondary" style={{ fontSize: 12 }}>— chưa nối</Text>
    } },
    { title: '', key: 'act', width: 178, fixed: 'right' as const, render: (_: any, r: FinLoanComputed) => (
      <Space size={2}>
        <Tooltip title="Tài liệu (khế ước, sao kê…)"><Badge count={attachCounts.get(r.id) || 0} size="small" offset={[-2, 2]}>
          <Button type="text" size="small" icon={<PaperClipOutlined style={{ color: '#1E3A5F' }} />} onClick={() => setAttachLoan(r)} />
        </Badge></Tooltip>
        <Tooltip title="Lịch trả lãi"><Button type="text" size="small" icon={<PercentageOutlined style={{ color: '#92400E' }} />} onClick={() => setInterestLoan(r)} /></Tooltip>
        <Tooltip title="Ghi trả nợ"><Button type="text" size="small" icon={<DollarOutlined style={{ color: '#16a34a' }} />} onClick={() => openPay(r)} /></Tooltip>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Xoá khoản vay này?" description="Xoá luôn toàn bộ lịch sử trả nợ và lịch lãi của khoản — không hoàn tác được."
          okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(r)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>) },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <FinanceLendingTabs />
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
        <PageState error={loadError} onRetry={load}>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={rows}
          pagination={stdPagination(50)} scroll={{ x: 1450 }}
          rowClassName={(r) => (r.id === focusId ? 'ant-table-row-selected' : '')}
          onRow={(r) => ({ style: { background: r.id === focusId ? '#fffbe6' : CIC_BG[r.cic] } })} />
        </PageState>
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
              <InputNumber min={0} style={{ width: '100%' }} {...vndInputProps} placeholder="0" />
            </Form.Item>
            <Form.Item name="interest_rate" label="Lãi suất (%/năm)"><InputNumber min={0} step={0.1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="disbursed_date" label="Ngày giải ngân"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="due_date" label="Ngày đến hạn" rules={[{ required: true, message: 'Nhập ngày đến hạn' }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={Object.entries(LOAN_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="currency" label="Tiền tệ" hidden initialValue="VND"><Input /></Form.Item>
            <Form.Item name="purpose" label="Mục đích"><Input placeholder="vd: vốn lưu động" /></Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>
        </Form>
      </Modal>

      {/* Drawer trả nợ */}
      <Drawer title={payLoan ? `Trả nợ — ${payLoan.bank} (còn ${fmtVnd(payLoan.remaining)})` : ''} open={!!payLoan}
        onClose={closePay} width={520}>
        {payLoan && (
          <>
            {payLoan.remaining <= 0 && (
              <Alert type="success" showIcon style={{ marginBottom: 12 }} message="Đã trả đủ gốc — khoản vay đã tất toán." />
            )}
            <Form form={payForm} layout="vertical" size="small">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="paid_date" label="Ngày trả" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }]}>
                  <InputNumber min={0} style={{ width: '100%' }} {...vndInputProps} />
                </Form.Item>
                <Form.Item name="source" label="Nguồn">
                  <Select options={Object.entries(REPAYMENT_SOURCE_LABELS).map(([value, label]) => ({ value, label }))} />
                </Form.Item>
                <Form.Item name="note" label="Ghi chú"><Input /></Form.Item>
              </div>
              <Button type="primary" block icon={<DollarOutlined />} onClick={handleAddPay} style={{ background: '#16a34a', borderColor: '#16a34a' }}>Ghi trả nợ</Button>
            </Form>
            <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>Lịch sử trả nợ ({repays.length})</div>
            <PageState error={repaysErr} onRetry={() => refreshPay(payLoan.id)} minHeight={100}>
            <Table rowKey="id" size="small" pagination={false} dataSource={repays}
              locale={{ emptyText: 'Chưa có lần trả nào' }}
              columns={[
                { title: 'Ngày', dataIndex: 'paid_date', render: (v: string) => fmtDate(v) },
                { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v: number) => <b>{fmtVndNum(v)}</b> },
                { title: 'Nguồn', dataIndex: 'source', render: (v: string | null) => enumLabel(REPAYMENT_SOURCE_LABELS, v) },
                { title: '', key: 'd', width: 72, render: (_: any, r: FinRepayment) => (
                  <Space size={0}>
                    <Button type="text" size="small" icon={<PaperClipOutlined />} title="Chứng từ trả nợ" onClick={() => setAttachRepay({ id: r.id, label: `${fmtDate(r.paid_date)} · ${fmtVnd(r.amount)}` })} />
                    <Popconfirm title="Xoá lần trả này?" description="Số đã trả của khoản vay sẽ giảm lại tương ứng."
                      okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => handleDelPay(r.id)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>) },
              ] as any} />
            </PageState>
          </>
        )}
      </Drawer>

      <FacilityDrawer line={drawerLine} open={!!drawerLine} onClose={() => setDrawerLine(null)} />

      <InterestDrawer loan={interestLoan} open={!!interestLoan} onClose={() => setInterestLoan(null)} onChanged={load} />

      <Modal open={!!attachRepay} title={`📎 Chứng từ trả nợ — ${attachRepay?.label || ''}`} footer={null}
        onCancel={() => setAttachRepay(null)} destroyOnClose width={560}>
        {attachRepay && <FinanceAttachments entityType="repayment" entityId={attachRepay.id} />}
      </Modal>

      <Drawer title={attachLoan ? `📎 Tài liệu khoản vay — ${attachLoan.bank}${attachLoan.loan_no ? ' · ' + attachLoan.loan_no : ''}` : ''}
        open={!!attachLoan} onClose={() => { setAttachLoan(null); load() }} width={520} destroyOnClose>
        {attachLoan && <FinanceAttachments entityType="loan" entityId={attachLoan.id} />}
      </Drawer>
    </div>
  )
}
