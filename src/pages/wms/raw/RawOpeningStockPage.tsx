// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Tồn đầu / mở sổ (GĐ1 v3)
// File: src/pages/wms/raw/RawOpeningStockPage.tsx
// Route: /wms/nvl/ton-dau
// Nhập tồn đầu LINH ĐỘNG: thêm từng lô (hoặc một dòng gộp theo loại) bất cứ lúc nào,
// sửa/xóa khi chưa ghi sổ, rồi "Ghi vào sổ" theo đợt. Dòng đã ghi sổ khóa lại;
// sau đó sửa bằng cân lại / kiểm kê (GĐ2). Dữ liệu nằm ở raw_opening_stock_staging.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Typography, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { rawStockService, type OpeningStagingRow } from '../../../services/wms/rawStockService'
import { RAW_RUBBER_TYPES, RAW_RUBBER_TYPE_LABELS, RAW_RUBBER_TYPE_GROUP, RAW_RUBBER_TYPE_DEFAULT_DRC, type RawRubberType } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography

const fmtKg = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits })

interface FormValues {
  facility_code: string
  rubber_type: RawRubberType
  batch_code?: string
  wet_kg: number
  drc_pct?: number
  drc_estimated: boolean
  intake_date?: dayjs.Dayjs
  supplier_name?: string
  ticket_code?: string
  note?: string
}

export default function RawOpeningStockPage() {
  const navigate = useNavigate()
  const rawRole = useRawRole()
  const { data: facilities } = useActiveFacilities()
  const [form] = Form.useForm<FormValues>()
  const [rows, setRows] = useState<OpeningStagingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [facilityCode, setFacilityCode] = useState<string>('PD')

  const canWrite = rawRole.perms.receive || rawRole.isBGD

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await rawStockService.getOpeningStaging()) }
    catch (e: any) { setError(e?.message || 'Không tải được bảng tồn đầu') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => rows.filter((r) => r.facility_code.toUpperCase() === facilityCode.toUpperCase()), [rows, facilityCode])
  const pending = visible.filter((r) => !r.processed_at)
  const pendingOk = pending.filter((r) => r.loi.length === 0)
  const pendingErr = pending.filter((r) => r.loi.length > 0)
  const done = visible.filter((r) => !!r.processed_at)

  const watchedType = Form.useWatch('rubber_type', form)
  const defaultDrc = watchedType ? RAW_RUBBER_TYPE_DEFAULT_DRC[watchedType] : null

  const handleAdd = async (v: FormValues) => {
    setSaving(true)
    try {
      await rawStockService.addOpeningRow({
        facility_code: v.facility_code,
        batch_code: v.batch_code?.trim() || null,
        rubber_type: v.rubber_type,
        wet_kg: v.wet_kg,
        drc_pct: v.drc_pct ?? (defaultDrc ?? null),
        drc_estimated: v.drc_estimated,
        intake_date: v.intake_date ? v.intake_date.format('YYYY-MM-DD') : null,
        supplier_name: v.supplier_name?.trim() || null,
        ticket_code: v.ticket_code?.trim() || null,
        note: v.note?.trim() || null,
      })
      message.success('Đã thêm dòng tồn đầu (chưa ghi sổ)')
      form.resetFields(['batch_code', 'wet_kg', 'drc_pct', 'supplier_name', 'ticket_code', 'note'])
      await load()
    } catch (e: any) {
      message.error(e?.message || 'Không thêm được')
    } finally { setSaving(false) }
  }

  const handleDelete = (r: OpeningStagingRow) => {
    Modal.confirm({
      title: `Xóa dòng ${r.batch_code}?`, okText: 'Xóa', okButtonProps: { danger: true }, cancelText: 'Hủy',
      onOk: async () => {
        try { await rawStockService.deleteOpeningRow(r.id); message.success('Đã xóa'); await load() }
        catch (e: any) { message.error(e?.message || 'Không xóa được') }
      },
    })
  }

  const handleCommit = () => {
    if (pendingOk.length === 0) return
    const wet = pendingOk.reduce((s, r) => s + r.wet_kg, 0), dry = pendingOk.reduce((s, r) => s + r.dry_kg, 0)
    Modal.confirm({
      title: `Ghi ${pendingOk.length} dòng tồn đầu vào sổ kho khô (${facilityCode})?`,
      content: (
        <div>
          <p>{fmtKg(wet)} kg ướt · {fmtKg(dry)} kg khô. {pendingErr.length > 0 && <Text type="danger">{pendingErr.length} dòng lỗi sẽ bị bỏ qua, sửa rồi ghi đợt sau.</Text>}</p>
          <Text type="secondary">Mỗi dòng thành một lô với bút toán "Tồn đầu mở sổ". Sau khi ghi, chỉ sửa bằng cân lại / kiểm kê.</Text>
        </div>
      ),
      okText: 'Ghi vào sổ', cancelText: 'Hủy',
      onOk: async () => {
        try {
          const res = await rawStockService.moSoTonDau(facilityCode)
          message.success(`Đã ghi ${res.so_lo} lô · ${fmtKg(res.kho_kg)} kg khô vào sổ`)
          await load()
        } catch (e: any) { message.error(e?.message || 'Ghi sổ thất bại') }
      },
    })
  }

  const columns: ColumnsType<OpeningStagingRow> = [
    { title: 'Mã lô', dataIndex: 'batch_code', key: 'batch_code', render: (v, r) => r.batch_id ? <a onClick={() => navigate(`/wms/nvl/lo/${r.batch_id}`)}><Text code>{v}</Text></a> : <Text code>{v}</Text> },
    { title: 'Loại hàng', dataIndex: 'ma_chuan', key: 'ma_chuan', render: (v: RawRubberType, r) => RAW_RUBBER_TYPE_LABELS[v] ?? r.rubber_type },
    { title: 'Ướt (kg)', dataIndex: 'wet_kg', key: 'wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'DRC', dataIndex: 'drc_pct', key: 'drc_pct', align: 'right', render: (v, r) => v === null ? <Text type="danger">—</Text> : <span>{v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} %{r.drc_estimated && <Tag color="gold" style={{ marginLeft: 6 }}>ước</Tag>}</span> },
    { title: 'Khô (kg)', dataIndex: 'dry_kg', key: 'dry_kg', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
    { title: 'Ngày nhập gốc', dataIndex: 'intake_date', key: 'intake_date', render: (v) => v ? dayjs(v).format('DD/MM/YYYY') : <Text type="secondary">ngày ghi sổ</Text> },
    { title: 'Trạng thái', key: 'tt', render: (_, r) => r.processed_at
      ? <Tag color="green" icon={<CheckCircleOutlined />}>Đã ghi sổ {dayjs(r.processed_at).format('DD/MM')}</Tag>
      : r.loi.length ? <Space direction="vertical" size={0}>{r.loi.map((l, i) => <Tag key={i} color="red">{l}</Tag>)}</Space>
      : <Tag color="blue">Chờ ghi sổ</Tag> },
    { title: '', key: 'x', width: 48, render: (_, r) => !r.processed_at && canWrite ? <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} /> : null },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Tồn đầu kho nguyên liệu</Title>
                <Text type="secondary">Nhập linh động, nhiều đợt: thêm dòng khi có số thật, "Ghi vào sổ" theo đợt. Chưa có mã lô thì để trống, hệ thống tự đặt TD-…</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Select value={facilityCode} onChange={setFacilityCode} style={{ minWidth: 180 }}
                options={(facilities ?? []).map((f) => ({ value: f.code, label: `${f.code} · ${f.name}` }))} />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} disabled={!canWrite || pendingOk.length === 0} onClick={handleCommit}>
                Ghi vào sổ ({pendingOk.length})
              </Button>
            </Space>
          </Col>
        </Row>

        {error && <Alert type="error" showIcon message={error} />}
        {!canWrite && !rawRole.loading && <Alert type="warning" showIcon message="Chỉ thủ kho NVL hoặc BGĐ mới thêm / ghi sổ tồn đầu." />}

        <Card size="small" title="Thêm dòng tồn đầu">
          <Form<FormValues> form={form} layout="vertical" onFinish={handleAdd} disabled={!canWrite}
            initialValues={{ facility_code: facilityCode, rubber_type: 'mu_dong', drc_estimated: false }}>
            <Row gutter={12}>
              <Col xs={24} md={6}><Form.Item name="facility_code" label="Nhà máy" rules={[{ required: true }]}>
                <Select onChange={(v) => setFacilityCode(v)} options={(facilities ?? []).map((f) => ({ value: f.code, label: f.code }))} /></Form.Item></Col>
              <Col xs={24} md={6}><Form.Item name="rubber_type" label="Loại hàng" rules={[{ required: true }]}>
                <Select options={RAW_RUBBER_TYPES.filter((t) => t !== 'khac').map((t) => ({ value: t, label: `${RAW_RUBBER_TYPE_LABELS[t]} (${RAW_RUBBER_TYPE_GROUP[t] === 'mu_tho' ? 'mủ thô' : 'thành phẩm'})` }))} /></Form.Item></Col>
              <Col xs={24} md={6}><Form.Item name="wet_kg" label="Khối lượng ướt (kg)" rules={[{ required: true, type: 'number', min: 1 }]}>
                <InputNumber style={{ width: '100%' }} min={1} step={10} /></Form.Item></Col>
              <Col xs={16} md={4}><Form.Item name="drc_pct" label={defaultDrc !== null && defaultDrc !== undefined ? `DRC % (mặc định ${defaultDrc})` : 'DRC %'} rules={defaultDrc === null || defaultDrc === undefined ? [{ required: true, type: 'number', min: 1, max: 100, message: 'Mủ thô phải có DRC' }] : []}>
                <InputNumber style={{ width: '100%' }} min={1} max={100} step={0.1} placeholder={defaultDrc !== null && defaultDrc !== undefined ? String(defaultDrc) : 'đo mẫu'} /></Form.Item></Col>
              <Col xs={8} md={2}><Form.Item name="drc_estimated" label="DRC ước" valuePropName="checked"><Switch /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col xs={24} md={6}><Form.Item name="batch_code" label="Mã lô (để trống = tự đặt)"><Input placeholder="TD-PD-DONG-…" /></Form.Item></Col>
              <Col xs={24} md={5}><Form.Item name="intake_date" label="Ngày nhập gốc (tính tuổi lô)"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
              <Col xs={24} md={6}><Form.Item name="supplier_name" label="Nhà cung cấp"><Input /></Form.Item></Col>
              <Col xs={24} md={4}><Form.Item name="ticket_code" label="Phiếu cân gốc"><Input placeholder="CX-…" /></Form.Item></Col>
              <Col xs={24} md={3}><Form.Item label=" "><Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saving} block>Thêm</Button></Form.Item></Col>
            </Row>
            <Form.Item name="note" label="Ghi chú" style={{ marginBottom: 0 }}><Input placeholder="Ví dụ: số gộp theo kiểm kê sơ bộ, sẽ tách lô sau" /></Form.Item>
          </Form>
        </Card>

        <Card size="small" title={<Space>Chờ ghi sổ<Tag color="blue">{pendingOk.length} sẵn sàng</Tag>{pendingErr.length > 0 && <Tag color="red">{pendingErr.length} lỗi</Tag>}</Space>}
          extra={<Text type="secondary">{fmtKg(pendingOk.reduce((s, r) => s + r.wet_kg, 0))} kg ướt · {fmtKg(pendingOk.reduce((s, r) => s + r.dry_kg, 0))} kg khô</Text>}>
          <Table<OpeningStagingRow> rowKey="id" columns={columns} dataSource={pending} size="small" pagination={false} loading={loading}
            locale={{ emptyText: 'Chưa có dòng nào chờ ghi sổ' }} />
        </Card>

        <Card size="small" title={<Space>Đã ghi sổ<Tag color="green">{done.length}</Tag></Space>}>
          <Table<OpeningStagingRow> rowKey="id" columns={columns} dataSource={done} size="small" pagination={{ pageSize: 20 }} loading={loading}
            locale={{ emptyText: 'Chưa ghi sổ đợt nào' }} />
        </Card>
      </Space>
    </div>
  )
}
