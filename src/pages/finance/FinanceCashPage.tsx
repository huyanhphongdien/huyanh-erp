// ============================================================================
// TÀI CHÍNH — TỒN QUỸ 112 + KHOẢN PHẢI NỘP ĐỊNH KỲ (Đợt 5)
// File: src/pages/finance/FinanceCashPage.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Card, Table, Button, Typography, Modal, Form, Input, InputNumber, DatePicker,
  Select, Space, message, Popconfirm, Row, Col, Statistic, Tag, Switch,
} from 'antd'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, BankOutlined, CalendarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  cashService, CATEGORY_LABEL, PAY_ALERT_LABEL, PAY_ALERT_COLOR, type FinCashBalance, type FinPayableComputed,
} from '../../services/finance/cashService'
import { fmtVndNum, fmtNum, fmtUsd, fmtTy, fmtDate, vndInputProps, usdInputProps } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import PageState from '../../components/common/PageState'
import { pill, hanText } from './finUi'

const { Title, Text } = Typography

export default function FinanceCashPage() {
  const [balances, setBalances] = useState<FinCashBalance[]>([])
  const [payables, setPayables] = useState<FinPayableComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [bOpen, setBOpen] = useState(false)
  const [bEditing, setBEditing] = useState<FinCashBalance | null>(null)
  const [bForm] = Form.useForm()
  const [pOpen, setPOpen] = useState(false)
  const [pEditing, setPEditing] = useState<FinPayableComputed | null>(null)
  const [pForm] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [b, p] = await Promise.all([cashService.listBalances(), cashService.listPayables()])
      setBalances(b); setPayables(p)
    } catch (e) { setLoadError(e) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const tot = useMemo(() => ({
    vnd: balances.reduce((s, b) => s + (Number(b.vnd) || 0), 0),
    usd: balances.reduce((s, b) => s + (Number(b.usd) || 0), 0),
    kip: balances.reduce((s, b) => s + (Number(b.kip) || 0), 0),
    asOf: balances.map((b) => b.as_of_date).filter(Boolean).sort().slice(-1)[0],
  }), [balances])
  const payDue = useMemo(() => payables.filter((p) => p.active && p.alert !== 'ok').length, [payables])

  // ── Tồn quỹ ──
  const openAddB = () => { setBEditing(null); bForm.resetFields(); bForm.setFieldsValue({ as_of_date: dayjs() }); setBOpen(true) }
  const openEditB = (r: FinCashBalance) => { setBEditing(r); bForm.setFieldsValue({ ...r, as_of_date: r.as_of_date ? dayjs(r.as_of_date) : null }); setBOpen(true) }
  const saveB = async () => {
    try {
      const v = await bForm.validateFields(); setSaving(true)
      await cashService.saveBalance({ id: bEditing?.id, ...v, as_of_date: v.as_of_date ? v.as_of_date.format('YYYY-MM-DD') : null })
      message.success('Đã lưu'); setBOpen(false); load()
    } catch (e: any) { if (e?.errorFields) return; message.error(dichLoiHeThong(e, 'Lưu tài khoản thất bại')) } finally { setSaving(false) }
  }
  const delB = async (r: FinCashBalance) => {
    try { await cashService.removeBalance(r.id); message.success('Đã xoá'); load() } catch (e) { message.error(dichLoiHeThong(e, 'Xoá thất bại')) }
  }

  // ── Phải nộp ──
  const openAddP = () => { setPEditing(null); pForm.resetFields(); pForm.setFieldsValue({ active: true, category: 'khac' }); setPOpen(true) }
  const openEditP = (r: FinPayableComputed) => { setPEditing(r); pForm.setFieldsValue({ ...r }); setPOpen(true) }
  const saveP = async () => {
    try {
      const v = await pForm.validateFields(); setSaving(true)
      await cashService.savePayable({ id: pEditing?.id, ...v })
      message.success('Đã lưu'); setPOpen(false); load()
    } catch (e: any) { if (e?.errorFields) return; message.error(dichLoiHeThong(e, 'Lưu khoản phải nộp thất bại')) } finally { setSaving(false) }
  }
  const delP = async (r: FinPayableComputed) => {
    try { await cashService.removePayable(r.id); message.success('Đã xoá'); load() } catch (e) { message.error(dichLoiHeThong(e, 'Xoá thất bại')) }
  }

  // Số dư 0 hiện '—' có chủ ý: TK chỉ giữ USD thì cột VNĐ để trống cho dễ đọc (service lưu ô trống = 0)
  const balCols = [
    { title: 'Ngân hàng', dataIndex: 'bank', render: (v: string, r: FinCashBalance) => <span><b>{v}</b>{r.account_no ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.account_no}</div> : null}</span> },
    { title: 'Số dư VNĐ', dataIndex: 'vnd', align: 'right' as const, render: (v: number) => v ? <b>{fmtVndNum(v)}</b> : <Text type="secondary">—</Text> },
    { title: 'Số dư USD', dataIndex: 'usd', align: 'right' as const, render: (v: number) => v ? fmtUsd(v, 2) : <Text type="secondary">—</Text> },
    { title: 'Số dư KÍP', dataIndex: 'kip', align: 'right' as const, render: (v: number) => v ? fmtNum(v) : <Text type="secondary">—</Text> },
    { title: 'Cập nhật', dataIndex: 'as_of_date', width: 100, render: (v: string) => fmtDate(v) },
    { title: '', key: 'act', width: 70, render: (_: any, r: FinCashBalance) => (
      <Space size={2}>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditB(r)} />
        <Popconfirm title="Xoá tài khoản này?" description="Số dư của tài khoản sẽ không còn tính vào Tồn quỹ và Dòng tiền."
          okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => delB(r)}><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>) },
  ]

  const payCols = [
    { title: 'Khoản phải nộp', dataIndex: 'name', render: (v: string, r: FinPayableComputed) => (
      <span><b>{v}</b>{!r.active ? <Tag style={{ marginLeft: 6 }}>Tắt</Tag> : null}{r.bank ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.bank}</div> : null}</span>) },
    { title: 'Nhóm', dataIndex: 'category', width: 130, render: (v: string) => v ? <Tag>{CATEGORY_LABEL[v] || v}</Tag> : '—' },
    { title: 'Lịch nộp', key: 'sched', width: 180, render: (_: any, r: FinPayableComputed) => r.due_rule || (r.due_day ? `Ngày ${r.due_day} hàng tháng` : '—') },
    { title: 'Số tiền ước (₫)', dataIndex: 'amount_est', width: 130, align: 'right' as const, render: (v: number) => v ? fmtVndNum(v) : '—' },
    { title: 'Kỳ tới', dataIndex: 'next_due', width: 130, render: (v: string, r: FinPayableComputed) => v ? (
      <span><b>{fmtDate(v)}</b>{r.active && r.alert !== 'ok' ? <div style={{ fontSize: 11, color: PAY_ALERT_COLOR[r.alert] }}>{hanText(r.days_to_due)}</div> : null}</span>) : '—' },
    { title: 'Trạng thái', key: 'al', width: 185, align: 'center' as const, render: (_: any, r: FinPayableComputed) => r.active ? pill(PAY_ALERT_COLOR[r.alert], PAY_ALERT_LABEL[r.alert]) : <Tag>Tắt</Tag> },
    { title: '', key: 'act', width: 70, render: (_: any, r: FinPayableComputed) => (
      <Space size={2}>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditP(r)} />
        <Popconfirm title="Xoá khoản này?" description="Khoản sẽ biến khỏi dự báo Dòng tiền. Chỉ tạm dừng thì tắt 'Đang áp dụng' thay vì xoá."
          okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => delP(r)}><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>) },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}><BankOutlined /> Tồn quỹ &amp; Phải nộp định kỳ</Title>
        <Button icon={<ReloadOutlined />} onClick={load} />
      </div>

      {/* KPI tồn quỹ */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng tồn quỹ VNĐ" value={fmtTy(tot.vnd)} valueStyle={{ color: '#1E3A5F', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng tồn quỹ USD" value={fmtUsd(tot.usd, 2)} valueStyle={{ color: '#16a34a', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng tồn quỹ KÍP" value={fmtNum(tot.kip)} valueStyle={{ color: '#7c3aed', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ background: payDue ? '#fff7ed' : undefined }}><Statistic title="Phải nộp tới kỳ" value={payDue} valueStyle={{ color: payDue ? '#ea580c' : '#16a34a', fontWeight: 800 }} suffix="khoản" /></Card></Col>
      </Row>

      {/* Tồn quỹ */}
      <Card size="small" style={{ marginBottom: 16 }}
        title={<span><BankOutlined /> Tồn quỹ ngân hàng (112){tot.asOf ? <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}> · cập nhật {fmtDate(tot.asOf)}</Text> : null}</span>}
        extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAddB} style={{ background: '#1E3A5F', borderColor: '#1E3A5F' }}>Thêm TK</Button>}
        styles={{ body: { padding: 0 } }}>
        <PageState error={loadError} onRetry={load}>
        <Table rowKey="id" size="small" loading={loading} columns={balCols as any} dataSource={balances} pagination={false}
          locale={{ emptyText: 'Chưa có tài khoản. Bấm "Thêm TK".' }}
          summary={() => balances.length ? (
            <Table.Summary.Row style={{ background: '#f0fdf4', fontWeight: 800 }}>
              <Table.Summary.Cell index={0}>TỔNG CỘNG</Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">{fmtVndNum(tot.vnd)}</Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">{fmtUsd(tot.usd, 2)}</Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">{fmtNum(tot.kip)}</Table.Summary.Cell>
              <Table.Summary.Cell index={4} colSpan={2} />
            </Table.Summary.Row>) : null} />
        </PageState>
      </Card>

      {/* Phải nộp định kỳ */}
      <Card size="small"
        title={<span><CalendarOutlined /> Khoản phải nộp định kỳ</span>}
        extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAddP} style={{ background: '#1E3A5F', borderColor: '#1E3A5F' }}>Thêm khoản</Button>}
        styles={{ body: { padding: 0 } }}>
        <PageState error={loadError} onRetry={load}>
        <Table rowKey="id" size="small" loading={loading} columns={payCols as any} dataSource={payables} pagination={false}
          locale={{ emptyText: 'Chưa có khoản phải nộp. Bấm "Thêm khoản" (vd thuê TC, điện, bảo hiểm, lãi bank).' }} />
        </PageState>
      </Card>

      {/* Modal tồn quỹ */}
      <Modal title={bEditing ? 'Sửa tài khoản' : 'Thêm tài khoản'} open={bOpen} onCancel={() => setBOpen(false)} onOk={saveB}
        okText="Lưu" cancelText="Huỷ" confirmLoading={saving} destroyOnClose okButtonProps={{ style: { background: '#1E3A5F', borderColor: '#1E3A5F' } }}>
        <Form form={bForm} layout="vertical" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="bank" label="Ngân hàng" rules={[{ required: true }]}><Input placeholder="Agribank…" /></Form.Item>
            <Form.Item name="account_no" label="Số tài khoản"><Input /></Form.Item>
            <Form.Item name="vnd" label="Số dư VNĐ"><InputNumber min={0} style={{ width: '100%' }} {...vndInputProps} /></Form.Item>
            <Form.Item name="usd" label="Số dư USD"><InputNumber min={0} style={{ width: '100%' }} {...usdInputProps} /></Form.Item>
            <Form.Item name="kip" label="Số dư KÍP"><InputNumber min={0} style={{ width: '100%' }} {...vndInputProps} /></Form.Item>
            <Form.Item name="as_of_date" label="Cập nhật ngày"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú"><Input /></Form.Item>
        </Form>
      </Modal>

      {/* Modal phải nộp */}
      <Modal title={pEditing ? 'Sửa khoản phải nộp' : 'Thêm khoản phải nộp'} open={pOpen} onCancel={() => setPOpen(false)} onOk={saveP}
        okText="Lưu" cancelText="Huỷ" confirmLoading={saving} destroyOnClose okButtonProps={{ style: { background: '#1E3A5F', borderColor: '#1E3A5F' } }}>
        <Form form={pForm} layout="vertical" size="small">
          <Form.Item name="name" label="Tên khoản phải nộp" rules={[{ required: true }]}><Input placeholder="vd: Bảo hiểm AGR / Tiền điện…" /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="category" label="Nhóm"><Select options={Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l }))} /></Form.Item>
            <Form.Item name="bank" label="Ngân hàng / Đối tác"><Input /></Form.Item>
            <Form.Item name="due_day" label="Ngày nộp (1–28)" tooltip="Ngày trong tháng phải nộp"><InputNumber min={1} max={28} style={{ width: '100%' }} placeholder="25" /></Form.Item>
            <Form.Item name="amount_est" label="Số tiền ước (VNĐ)"><InputNumber min={0} style={{ width: '100%' }} {...vndInputProps} /></Form.Item>
          </div>
          <Form.Item name="due_rule" label="Mô tả lịch (nếu phức tạp)" tooltip="Dùng khi không phải 1 ngày cố định"><Input placeholder="vd: 3 kỳ — ngày 8, 18, 28" /></Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input /></Form.Item>
          <Form.Item name="active" label="Đang áp dụng" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
