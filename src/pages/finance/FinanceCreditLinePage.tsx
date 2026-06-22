// ============================================================================
// VỐN VAY — HẠN MỨC TÍN DỤNG (HĐTD) — Đợt 2b
// File: src/pages/finance/FinanceCreditLinePage.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Card, Table, Button, Tag, Typography, Modal, Form, Input, InputNumber, DatePicker,
  Select, AutoComplete, Space, message, Popconfirm, Row, Col, Statistic, Progress,
} from 'antd'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, BankOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  creditLineService, LINE_TYPE_LABEL, type FinCreditLineComputed,
} from '../../services/finance/creditLineService'
import { BANKS } from '../../services/finance/loanService'
import FacilityDrawer from './FacilityDrawer'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography
const fmtVnd = (n?: number | null) => (n || 0).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const numFmt = (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numParse = (v?: string) => (v || '').replace(/\./g, '')

export default function FinanceCreditLinePage() {
  const user = useAuthStore((s) => s.user)
  const actorId = user?.employee_id || user?.id || null
  const [rows, setRows] = useState<FinCreditLineComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FinCreditLineComputed | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [drawerLine, setDrawerLine] = useState<FinCreditLineComputed | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await creditLineService.listComputed()) } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const k = useMemo(() => ({
    limit: rows.reduce((s, r) => s + (Number(r.limit_amount) || 0), 0),
    used: rows.reduce((s, r) => s + r.used, 0),
    room: rows.reduce((s, r) => s + r.room, 0),
    secured: rows.reduce((s, r) => s + r.secured, 0),
  }), [rows])

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ currency: 'VND', line_type: 'vay', status: 'active' }); setOpen(true) }
  const openEdit = (r: FinCreditLineComputed) => {
    setEditing(r)
    form.setFieldsValue({ ...r, from_date: r.from_date ? dayjs(r.from_date) : null, to_date: r.to_date ? dayjs(r.to_date) : null })
    setOpen(true)
  }
  const handleSave = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const payload = {
        bank: v.bank, contract_no: v.contract_no || null, line_type: v.line_type || 'vay',
        limit_amount: v.limit_amount || 0, currency: v.currency || 'VND',
        from_date: v.from_date ? v.from_date.format('YYYY-MM-DD') : null,
        to_date: v.to_date ? v.to_date.format('YYYY-MM-DD') : null,
        interest_rate: v.interest_rate ?? null, status: v.status || 'active', note: v.note || null,
      }
      if (editing) await creditLineService.update(editing.id, payload)
      else await creditLineService.create({ ...payload, created_by: actorId })
      message.success('Đã lưu hạn mức'); setOpen(false); load()
    } catch (e: any) { if (e?.errorFields) return; message.error('Lỗi lưu: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }
  const handleDelete = async (r: FinCreditLineComputed) => {
    try { await creditLineService.remove(r.id); message.success('Đã xoá'); load() }
    catch (e: any) { message.error('Lỗi xoá: ' + (e?.message || e)) }
  }

  const columns = [
    { title: 'Ngân hàng', dataIndex: 'bank', width: 150, render: (v: string, r: FinCreditLineComputed) => (
      <span><b>{v}</b>{r.contract_no ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.contract_no}</div> : null}</span>) },
    { title: 'Loại', dataIndex: 'line_type', width: 110, render: (v: string) => <Tag>{LINE_TYPE_LABEL[v] || v || '—'}</Tag> },
    { title: 'Hạn mức', dataIndex: 'limit_amount', width: 140, align: 'right' as const, render: (v: number) => <b>{fmtVnd(v)}</b> },
    { title: 'Đang vay', dataIndex: 'used', width: 140, align: 'right' as const, render: (v: number) => <span style={{ color: '#92400E' }}>{fmtVnd(v)}</span> },
    { title: 'Room còn lại', dataIndex: 'room', width: 150, align: 'right' as const, render: (v: number, r: FinCreditLineComputed) => {
      const limit = Number(r.limit_amount) || 0
      const pct = limit > 0 ? Math.round((r.used / limit) * 100) : 0
      return <div><b style={{ color: v < 0 ? '#dc2626' : '#16a34a' }}>{fmtVnd(v)}</b>
        <Progress percent={Math.min(pct, 100)} size="small" showInfo={false} strokeColor={pct >= 90 ? '#dc2626' : '#1677ff'} /></div>
    } },
    { title: 'TG đảm bảo', key: 'secured', width: 150, align: 'right' as const, render: (_: any, r: FinCreditLineComputed) =>
      r.depositCount ? <span style={{ color: '#1677ff' }}>🔒 {r.depositCount} HĐ · <b>{fmtTy(r.secured)}</b></span> : <Text type="secondary">—</Text> },
    { title: 'Khoản vay', key: 'loans', width: 80, align: 'center' as const, render: (_: any, r: FinCreditLineComputed) => r.loanCount || '—' },
    { title: '', key: 'act', width: 90, fixed: 'right' as const, render: (_: any, r: FinCreditLineComputed) => (
      <Space size={2} onClick={(e) => e.stopPropagation()}>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Xoá hạn mức này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelete(r)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>) },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}><BankOutlined /> Hạn mức tín dụng (HĐTD)</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Thêm hạn mức</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng hạn mức" value={fmtTy(k.limit)} valueStyle={{ color: '#1B4D3E', fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng đang vay" value={fmtTy(k.used)} valueStyle={{ color: '#92400E', fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Room còn lại" value={fmtTy(k.room)} valueStyle={{ color: k.room < 0 ? '#dc2626' : '#16a34a', fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tiền gửi đảm bảo" value={fmtTy(k.secured)} valueStyle={{ color: '#1677ff', fontWeight: 800 }} /></Card></Col>
      </Row>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={rows}
          pagination={false} scroll={{ x: 1100 }}
          onRow={(r) => ({ onClick: () => setDrawerLine(r), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'Chưa có hạn mức. Bấm "Thêm hạn mức" để khai báo (vd Agribank 99 tỷ).' }} />
      </Card>

      <Modal title={editing ? 'Sửa hạn mức' : 'Thêm hạn mức tín dụng'} open={open} onCancel={() => setOpen(false)}
        onOk={handleSave} okText="Lưu" cancelText="Huỷ" confirmLoading={saving} width={640} destroyOnClose
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}>
        <Form form={form} layout="vertical" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="bank" label="Ngân hàng" rules={[{ required: true }]}>
              <AutoComplete options={BANKS.map((b) => ({ value: b }))} placeholder="Agribank…" filterOption={(i, o) => (o?.value || '').toLowerCase().includes(i.toLowerCase())} />
            </Form.Item>
            <Form.Item name="contract_no" label="Số HĐTD"><Input placeholder="vd: 4000-LCL-..." /></Form.Item>
            <Form.Item name="limit_amount" label="Hạn mức (VNĐ)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
            <Form.Item name="line_type" label="Loại hạn mức">
              <Select options={Object.entries(LINE_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
            <Form.Item name="interest_rate" label="Lãi suất (%/năm)"><InputNumber min={0} step={0.1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="status" label="Trạng thái"><Select options={[{ value: 'active', label: 'Hiệu lực' }, { value: 'expired', label: 'Hết hạn' }, { value: 'closed', label: 'Đã đóng' }]} /></Form.Item>
            <Form.Item name="from_date" label="Từ ngày"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="to_date" label="Đến ngày"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="currency" hidden initialValue="VND"><Input /></Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>
        </Form>
      </Modal>

      <FacilityDrawer line={drawerLine} open={!!drawerLine} onClose={() => setDrawerLine(null)} />
    </div>
  )
}
