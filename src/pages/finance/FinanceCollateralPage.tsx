// ============================================================================
// VỐN VAY — TÀI SẢN ĐẢM BẢO (HĐBĐ) — Đợt 3c
// File: src/pages/finance/FinanceCollateralPage.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Card, Table, Button, Tag, Typography, Modal, Form, Input, InputNumber, DatePicker,
  Select, Space, message, Popconfirm, Row, Col, Statistic, Badge, Drawer, Tooltip,
} from 'antd'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, SafetyOutlined, PaperClipOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  collateralService, ASSET_TYPE_LABEL, COLLATERAL_STATUS_LABEL, type FinCollateral,
} from '../../services/finance/collateralService'
import { creditLineService, type FinCreditLineComputed } from '../../services/finance/creditLineService'
import { attachmentService } from '../../services/finance/attachmentService'
import FinanceAttachments from './FinanceAttachments'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography
const fmtVnd = (n?: number | null) => (n || 0).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const numFmt = (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numParse = (v?: string) => (v || '').replace(/\./g, '')

export default function FinanceCollateralPage() {
  const user = useAuthStore((s) => s.user)
  const actorId = user?.employee_id || user?.id || null
  const [rows, setRows] = useState<FinCollateral[]>([])
  const [lines, setLines] = useState<FinCreditLineComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FinCollateral | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [attach, setAttach] = useState<FinCollateral | null>(null)
  const [attachCounts, setAttachCounts] = useState<Map<string, number>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, l] = await Promise.all([collateralService.list(), creditLineService.listComputed()])
      setRows(c); setLines(l)
      try { setAttachCounts(await attachmentService.countFor('collateral', c.map((x) => x.id))) } catch { /* chưa migrate file */ }
    } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const lineOptions = useMemo(() => lines.filter((l) => l.status === 'active')
    .map((l) => ({ value: l.id, label: `${l.bank}${l.contract_no ? ' · ' + l.contract_no : ''} · HM ${fmtTy(l.limit_amount || 0)}` })), [lines])

  const k = useMemo(() => {
    const active = rows.filter((r) => r.status !== 'released')
    return {
      count: active.length,
      appraisal: active.reduce((s, r) => s + (Number(r.appraisal_value) || 0), 0),
      secured: active.reduce((s, r) => s + (Number(r.secured_value) || 0), 0),
      unlinked: active.filter((r) => !r.credit_line_id).length,
    }
  }, [rows])

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ asset_type: 'tscd', status: 'active' }); setOpen(true) }
  const openEdit = (r: FinCollateral) => {
    setEditing(r)
    form.setFieldsValue({ ...r, appraisal_date: r.appraisal_date ? dayjs(r.appraisal_date) : null })
    setOpen(true)
  }
  const handleSave = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const payload = {
        credit_line_id: v.credit_line_id || null, bank: v.bank || null, contract_ref: v.contract_ref || null,
        asset_name: v.asset_name, asset_type: v.asset_type || null,
        appraisal_date: v.appraisal_date ? v.appraisal_date.format('YYYY-MM-DD') : null,
        appraisal_value: v.appraisal_value ?? null, secured_value: v.secured_value ?? null,
        status: v.status || 'active', note: v.note || null,
      }
      if (editing) await collateralService.update(editing.id, payload)
      else await collateralService.create({ ...payload, created_by: actorId })
      message.success('Đã lưu tài sản'); setOpen(false); load()
    } catch (e: any) { if (e?.errorFields) return; message.error('Lỗi lưu: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }
  const handleDelete = async (r: FinCollateral) => {
    try { await collateralService.remove(r.id); message.success('Đã xoá'); load() }
    catch (e: any) { message.error('Lỗi xoá: ' + (e?.message || e)) }
  }

  const columns = [
    { title: 'Tài sản', dataIndex: 'asset_name', width: 240, render: (v: string, r: FinCollateral) => (
      <span><b>{v}</b>{r.asset_type ? <Tag style={{ marginLeft: 6 }}>{ASSET_TYPE_LABEL[r.asset_type] || r.asset_type}</Tag> : null}</span>) },
    { title: 'Đảm bảo cho hạn mức', key: 'line', width: 200, render: (_: any, r: FinCollateral) => (
      r.credit_line ? <span style={{ fontSize: 12 }}>🏦 <b>{r.credit_line.bank}</b>{r.credit_line.contract_no ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.credit_line.contract_no}</div> : null}</span>
        : (r.contract_ref ? <Text type="secondary" style={{ fontSize: 12 }}>HĐ {r.contract_ref}</Text> : <Text type="secondary">— chưa nối</Text>)) },
    { title: 'Ngày định giá', dataIndex: 'appraisal_date', width: 110, render: (v: string) => fDate(v) },
    { title: 'Giá trị định giá', dataIndex: 'appraisal_value', width: 140, align: 'right' as const, render: (v: number) => fmtVnd(v) },
    { title: 'Giá trị bảo đảm', dataIndex: 'secured_value', width: 140, align: 'right' as const, render: (v: number) => <b style={{ color: '#7c3aed' }}>{fmtVnd(v)}</b> },
    { title: 'Trạng thái', dataIndex: 'status', width: 120, align: 'center' as const, render: (v: string) => (
      <Tag color={v === 'released' ? 'default' : 'purple'}>{COLLATERAL_STATUS_LABEL[v as 'active'] || v}</Tag>) },
    { title: '', key: 'act', width: 110, fixed: 'right' as const, render: (_: any, r: FinCollateral) => (
      <Space size={2}>
        <Tooltip title="Hồ sơ tài sản"><Badge count={attachCounts.get(r.id) || 0} size="small" offset={[-2, 2]}>
          <Button type="text" size="small" icon={<PaperClipOutlined style={{ color: '#1E3A5F' }} />} onClick={() => setAttach(r)} />
        </Badge></Tooltip>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Xoá tài sản này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelete(r)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>) },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}><SafetyOutlined /> Tài sản đảm bảo (HĐBĐ)</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ background: '#1E3A5F', borderColor: '#1E3A5F' }}>Thêm tài sản</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Số tài sản" value={k.count} valueStyle={{ color: '#1E3A5F', fontWeight: 800 }} suffix="TS" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng định giá" value={fmtTy(k.appraisal)} valueStyle={{ color: '#475569', fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng giá trị bảo đảm" value={fmtTy(k.secured)} valueStyle={{ color: '#7c3aed', fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ background: k.unlinked ? '#fff7ed' : undefined }}><Statistic title="Chưa nối hạn mức" value={k.unlinked} valueStyle={{ color: k.unlinked ? '#ea580c' : '#16a34a', fontWeight: 800 }} suffix="TS" /></Card></Col>
      </Row>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={rows}
          pagination={{ pageSize: 30, showSizeChanger: false }} scroll={{ x: 1100 }}
          locale={{ emptyText: 'Chưa có tài sản đảm bảo. Bấm "Thêm tài sản".' }} />
      </Card>

      <Modal title={editing ? 'Sửa tài sản đảm bảo' : 'Thêm tài sản đảm bảo'} open={open} onCancel={() => setOpen(false)}
        onOk={handleSave} okText="Lưu" cancelText="Huỷ" confirmLoading={saving} width={640} destroyOnClose
        okButtonProps={{ style: { background: '#1E3A5F', borderColor: '#1E3A5F' } }}>
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="asset_name" label="Tên/mô tả tài sản" rules={[{ required: true }]}>
            <Input placeholder="vd: Hệ thống 08 silo chứa mủ / Xe ô tô tải ISUZU 75H-..." />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="asset_type" label="Loại tài sản">
              <Select options={Object.entries(ASSET_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={[{ value: 'active', label: 'Đang thế chấp' }, { value: 'released', label: 'Đã giải chấp' }]} />
            </Form.Item>
            <Form.Item name="credit_line_id" label="🏦 Đảm bảo cho hạn mức" style={{ gridColumn: '1 / -1' }}
              tooltip="Tài sản này thế chấp cho hạn mức (facility) nào">
              <Select allowClear showSearch optionFilterProp="label"
                placeholder={lineOptions.length ? 'Chọn hạn mức…' : 'Chưa có hạn mức — thêm ở tab Hạn mức'}
                options={lineOptions} notFoundContent="Chưa có hạn mức" />
            </Form.Item>
            <Form.Item name="contract_ref" label="Số HĐ bảo đảm (tham khảo)"><Input placeholder="vd: 4000-LCL-202500495" /></Form.Item>
            <Form.Item name="bank" label="Ngân hàng"><Input placeholder="vd: Agribank" /></Form.Item>
            <Form.Item name="appraisal_date" label="Ngày định giá"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="appraisal_value" label="Giá trị định giá (đ)"><InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} /></Form.Item>
            <Form.Item name="secured_value" label="Giá trị bảo đảm (đ)" style={{ gridColumn: '1 / -1' }}
              tooltip="Giá trị NH nhận làm tài sản đảm bảo (thường = định giá × tỷ lệ cho vay)">
              <InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} />
            </Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={attach ? `📎 Hồ sơ tài sản — ${attach.asset_name}` : ''} open={!!attach}
        onClose={() => { setAttach(null); load() }} width={520} destroyOnClose>
        {attach && <FinanceAttachments entityType="collateral" entityId={attach.id} />}
      </Drawer>
    </div>
  )
}
