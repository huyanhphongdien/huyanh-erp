// ============================================================================
// FILE: src/pages/logistics/dispatch/DispatchCreatePage.tsx
// MODULE: Vận tải / Lệnh điều động — Tạo mới + Sửa
// Chọn đầu kéo → tài xế tự điền; "Tạo từ Đơn hàng bán" đổ container thành dòng.
// 1 dòng = 1 container (seal riêng). 1 xe chở nhiều container.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Form, Select, Input, AutoComplete, DatePicker, Button, Space, Typography, Row, Col,
  Table, InputNumber, message, Breadcrumb, Divider, Tag, Modal, Empty,
} from 'antd'
import { SaveOutlined, ArrowLeftOutlined, PlusOutlined, DeleteOutlined, ImportOutlined, TruckOutlined, CarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { fleetService, VEHICLE_KIND_LABELS, type FleetVehicle, type FleetDriver } from '../../../services/logistics/fleetService'
import {
  dispatchService, TRIP_TYPE_LABELS,
  type TripType, type DispatchLineInput, type SalesOrderOption,
} from '../../../services/logistics/dispatchService'
import { useAuthStore } from '../../../stores/authStore'

const { Title } = Typography

interface LineRow extends DispatchLineInput {
  _key: string
  id?: string   // có khi đang sửa
}

let _keySeq = 1
const newKey = () => `L${_keySeq++}`

// Định dạng số có dấu chấm ngăn nghìn cho ô KL (gõ "20.160" hay "20160" đều ra 20160).
const numFmt = (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const numParse = (v?: string) => (v || '').replace(/\./g, '')
const BALE_KG = 35 // kg/bành chuẩn SVR — dùng để KL tự nhảy theo số kiện

// Gợi ý chọn nhanh (vẫn gõ tự do được — AutoComplete)
const ROUTE_PRESETS = [
  'Kho Phong Điền → Cảng Tiên Sa',
  'Kho Phong Điền → Cảng Đà Nẵng',
  'Kho Quảng Trị → Cảng Tiên Sa',
  'Kho Quảng Trị → Kho Phong Điền',
].map(v => ({ value: v }))
const GRADE_PRESETS = ['SVR 10', 'SVR 3L', 'SVR L', 'SVR 5', 'SVR 20', 'SVR CV50', 'SVR CV60', 'RSS 1', 'RSS 3', 'Latex 60'].map(v => ({ value: v }))
const acFilter = (input: string, opt?: { value: string }) => (opt?.value || '').toLowerCase().includes(input.toLowerCase())

export default function DispatchCreatePage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const user = useAuthStore(s => s.user)
  const [form] = Form.useForm()

  const [tractors, setTractors] = useState<FleetVehicle[]>([])
  const [trailers, setTrailers] = useState<FleetVehicle[]>([])
  const [drivers, setDrivers] = useState<FleetDriver[]>([])
  const [lines, setLines] = useState<LineRow[]>([])
  const [origLineIds, setOrigLineIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  // SO picker
  const [soModalOpen, setSoModalOpen] = useState(false)
  const [soOptions, setSoOptions] = useState<SalesOrderOption[]>([])
  const [soSearch, setSoSearch] = useState('')
  const [soLoading, setSoLoading] = useState(false)

  // ---- load danh mục xe/tài xế ----
  useEffect(() => {
    (async () => {
      try {
        const [t, tr, d] = await Promise.all([
          fleetService.listVehicles({ kind: 'tractor', active: true }),
          fleetService.listVehicles({ kind: 'trailer', active: true }),
          fleetService.listDrivers({ active: true }),
        ])
        setTractors(t); setTrailers(tr); setDrivers(d)
      } catch (e: any) {
        message.error('Lỗi tải đội xe: ' + (e?.message || e))
      }
    })()
  }, [])

  // ---- load lệnh khi sửa ----
  useEffect(() => {
    if (!isEdit) return
    (async () => {
      setLoading(true)
      try {
        const res = await dispatchService.getById(id!)
        if (!res) { message.error('Không tìm thấy lệnh'); navigate('/logistics/dispatch'); return }
        const { order, lines: ls } = res
        form.setFieldsValue({
          dispatch_date: order.dispatch_date ? dayjs(order.dispatch_date) : dayjs(),
          trip_type: order.trip_type,
          reason: order.reason,
          tractor_vehicle_id: order.tractor_vehicle_id,
          trailer_vehicle_id: order.trailer_vehicle_id,
          driver_id: order.driver_id,
          contract_ref: order.contract_ref,
          customer_name: order.customer_name,
          destination: order.destination,
          recipient_name: order.recipient_name,
          recipient_phone: order.recipient_phone,
          note: order.note,
          sales_order_id: order.sales_order_id,
        })
        setLines(ls.map(l => ({
          _key: newKey(), id: l.id,
          route: l.route, lot_code: l.lot_code, grade: l.grade, container_no: l.container_no,
          seal_no: l.seal_no, package_count: l.package_count, weight_kg: l.weight_kg,
          sales_order_container_id: l.sales_order_container_id, note: l.note,
        })))
        setOrigLineIds(ls.map(l => l.id))
      } catch (e: any) {
        message.error('Lỗi tải lệnh: ' + (e?.message || e))
      }
      setLoading(false)
    })()
  }, [id])

  // ---- chọn đầu kéo → auto điền tài xế cố định ----
  const onTractorChange = (vid: string) => {
    const t = tractors.find(x => x.id === vid)
    if (t?.default_driver_id) {
      form.setFieldValue('driver_id', t.default_driver_id)
      if (!drivers.find(d => d.id === t.default_driver_id) && t.default_driver) {
        setDrivers(prev => [...prev, t.default_driver as any])
      }
    }
  }

  // ---- lines helpers ----
  // Hàm ổn định (useCallback) → bảng dòng không re-tạo mỗi render → input giữ giá trị/focus ổn định.
  const addLine = useCallback(() => setLines(prev => [...prev, { _key: newKey() }]), [])
  const removeLineRow = useCallback((key: string) => setLines(prev => prev.filter(l => l._key !== key)), [])
  const patchLine = useCallback((key: string, patch: Partial<LineRow>) =>
    setLines(prev => prev.map(l => l._key === key ? { ...l, ...patch } : l)), [])

  // ---- SO picker ----
  const openSoPicker = useCallback(async () => {
    setSoModalOpen(true)
    setSoLoading(true)
    try { setSoOptions(await dispatchService.listSalesOrderOptions(soSearch || undefined)) }
    catch (e: any) { message.error('Lỗi tải đơn hàng: ' + (e?.message || e)) }
    setSoLoading(false)
  }, [soSearch])

  const chooseSo = async (so: SalesOrderOption) => {
    try {
      const { header, lines: soLines } = await dispatchService.buildFromSalesOrder(so.id)
      form.setFieldsValue({
        sales_order_id: header.sales_order_id,
        customer_name: header.customer_name,
        destination: header.destination,
        contract_ref: header.contract_ref,
        trip_type: header.trip_type || 'port',
      })
      setLines(soLines.map(l => ({ ...l, _key: newKey() })))
      setSoModalOpen(false)
      message.success(`Đã đổ ${soLines.length} container từ ${so.code}`)
    } catch (e: any) {
      message.error('Lỗi đổ container: ' + (e?.message || e))
    }
  }

  // ---- save ----
  const onSave = async () => {
    try {
      const v = await form.validateFields()
      if (lines.length === 0) { message.warning('Cần ít nhất 1 dòng container'); return }
      setSaving(true)
      const payload = {
        dispatch_date: dayjs(v.dispatch_date).format('YYYY-MM-DD'),
        trip_type: v.trip_type as TripType,
        reason: v.reason || null,
        tractor_vehicle_id: v.tractor_vehicle_id || null,
        trailer_vehicle_id: v.trailer_vehicle_id || null,
        driver_id: v.driver_id || null,
        contract_ref: v.contract_ref || null,
        customer_name: v.customer_name || null,
        destination: v.destination || null,
        recipient_name: v.recipient_name || null,
        recipient_phone: v.recipient_phone || null,
        sales_order_id: v.sales_order_id || null,
        note: v.note || null,
      }
      const lineInputs: DispatchLineInput[] = lines.map((l, i) => ({
        route: l.route, lot_code: l.lot_code, grade: l.grade, container_no: l.container_no,
        seal_no: l.seal_no, package_count: l.package_count, weight_kg: l.weight_kg || 0,
        sales_order_container_id: l.sales_order_container_id, note: l.note, sort_order: i,
      }))

      if (isEdit) {
        await dispatchService.update(id!, payload)
        // reconcile lines: xoá cũ → thêm mới (đơn giản, an toàn vì trigger tự tính tổng)
        for (const oid of origLineIds) await dispatchService.removeLine(oid)
        for (const li of lineInputs) await dispatchService.addLine(id!, li)
        message.success('Đã cập nhật lệnh điều động')
        navigate(`/logistics/dispatch/${id}`)
      } else {
        const order = await dispatchService.create({ ...payload, created_by: user?.id || null, lines: lineInputs })
        message.success('Đã tạo lệnh ' + order.code)
        navigate(`/logistics/dispatch/${order.id}`)
      }
    } catch (e: any) {
      if (e?.errorFields) { message.warning('Kiểm tra lại thông tin bắt buộc'); setSaving(false); return }
      message.error('Lỗi lưu: ' + (e?.message || e))
    }
    setSaving(false)
  }

  const lineColumns = useMemo(() => [
    { title: '#', key: 'idx', width: 44, render: (_: any, __: any, i: number) => i + 1 },
    { title: 'Hành trình', key: 'route', width: 210, render: (_: any, r: LineRow) => (
      <AutoComplete value={r.route || ''} style={{ width: '100%' }} options={ROUTE_PRESETS}
        placeholder="Chọn / gõ tuyến…" filterOption={acFilter as any}
        onChange={v => patchLine(r._key, { route: v })} />
    ) },
    { title: 'Lô hàng', key: 'lot', width: 130, render: (_: any, r: LineRow) => <Input value={r.lot_code || ''} onChange={e => patchLine(r._key, { lot_code: e.target.value })} /> },
    { title: 'Loại hàng', key: 'grade', width: 140, render: (_: any, r: LineRow) => (
      <AutoComplete value={r.grade || ''} style={{ width: '100%' }} options={GRADE_PRESETS}
        placeholder="SVR 10…" filterOption={acFilter as any}
        onChange={v => patchLine(r._key, { grade: v })} />
    ) },
    { title: 'Số container', key: 'cont', width: 160, render: (_: any, r: LineRow) => <Input value={r.container_no || ''} onChange={e => patchLine(r._key, { container_no: e.target.value })} /> },
    { title: 'Seal', key: 'seal', width: 140, render: (_: any, r: LineRow) => <Input value={r.seal_no || ''} onChange={e => patchLine(r._key, { seal_no: e.target.value })} /> },
    { title: 'Số kiện', key: 'pkg', width: 110, render: (_: any, r: LineRow) => (
      <InputNumber value={r.package_count ?? undefined} min={0} controls={false} style={{ width: '100%' }}
        onChange={v => {
          const pkg = (v as number) ?? null
          // KL TỰ NHẢY = số kiện × 35kg (chuẩn SVR) — chỉ khi ô KL còn trống, không đè giá trị đã nhập.
          const patch: Partial<LineRow> = { package_count: pkg }
          if (pkg && !r.weight_kg) patch.weight_kg = pkg * BALE_KG
          patchLine(r._key, patch)
        }} />
    ) },
    { title: 'KL (kg)', key: 'w', width: 140, render: (_: any, r: LineRow) => (
      <InputNumber value={r.weight_kg || undefined} min={0} controls={false} style={{ width: '100%' }}
        formatter={numFmt} parser={numParse as any} placeholder="0"
        onChange={v => patchLine(r._key, { weight_kg: (v as number) || 0 })} />
    ) },
    { title: '', key: 'act', width: 50, render: (_: any, r: LineRow) => <Button danger icon={<DeleteOutlined />} onClick={() => removeLineRow(r._key)} /> },
  ], [patchLine, removeLineRow])

  const totalWeight = lines.reduce((s, l) => s + (l.weight_kg || 0), 0)

  return (
    <div style={{ padding: 20, maxWidth: 1680, margin: '0 auto', fontSize: 15 }}>
      <Breadcrumb style={{ marginBottom: 8, fontSize: 14 }} items={[
        { title: <a onClick={() => navigate('/logistics/dispatch')}>Lệnh điều động</a> },
        { title: isEdit ? 'Sửa lệnh' : 'Tạo lệnh' },
      ]} />

      <Card loading={loading}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>{isEdit ? 'Sửa lệnh điều động' : 'Tạo lệnh điều động'}</Title>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/logistics/dispatch')}>Quay lại</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>Lưu lệnh</Button>
          </Space>
        </div>

        <Form form={form} layout="vertical" size="large" initialValues={{ dispatch_date: dayjs(), trip_type: 'port' }}>
          <Row gutter={16}>
            <Col xs={24} sm={8} md={5}>
              <Form.Item name="dispatch_date" label="Ngày điều động" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Form.Item name="trip_type" label="Loại chuyến" rules={[{ required: true }]}>
                <Select options={(['port', 'lao', 'internal', 'other'] as TripType[]).map(t => ({ value: t, label: TRIP_TYPE_LABELS[t] }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={13}>
              <Form.Item label="Đơn hàng bán (tuỳ chọn)">
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="sales_order_id" noStyle><Input readOnly placeholder="Chưa gắn đơn hàng" /></Form.Item>
                  <Button icon={<ImportOutlined />} onClick={openSoPicker}>Tạo từ Đơn hàng bán</Button>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="left" style={{ margin: '4px 0 16px' }}>Phương tiện &amp; tài xế</Divider>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="tractor_vehicle_id" label={<><TruckOutlined /> Đầu kéo</>}>
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn đầu kéo" onChange={onTractorChange}
                  options={tractors.map(t => ({ value: t.id, label: `${t.plate}${t.default_driver ? ` · ${t.default_driver.full_name}` : ''}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="trailer_vehicle_id" label={<><CarOutlined /> Rơ-moóc (đổi theo chuyến)</>}>
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn rơ-moóc"
                  options={trailers.map(t => ({ value: t.id, label: `${t.plate}${t.capacity_kg ? ` · ${t.capacity_kg.toLocaleString('vi-VN')}kg` : ''}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="driver_id" label="Tài xế">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn tài xế"
                  options={drivers.map(d => ({ value: d.id, label: d.full_name }))} />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="left" style={{ margin: '4px 0 16px' }}>Thông tin chuyến</Divider>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}><Form.Item name="customer_name" label="Khách hàng"><Input /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="destination" label="Điểm giao / Cảng"><Input placeholder="Cảng Tiên Sa" /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="contract_ref" label="Căn cứ HĐ / Booking"><Input /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="recipient_name" label="Người nhận"><Input /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="recipient_phone" label="SĐT người nhận"><Input /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="reason" label="Lý do điều động"><Input /></Form.Item></Col>
            <Col xs={24}><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>

        <Divider titlePlacement="left" style={{ margin: '4px 0 12px' }}>
          Danh sách container ({lines.length}) — tổng {totalWeight.toLocaleString('vi-VN')} kg
        </Divider>
        <Table rowKey="_key" size="middle" pagination={false} columns={lineColumns as any} dataSource={lines}
          scroll={{ x: 1180 }}
          locale={{ emptyText: <Empty description="Chưa có container — bấm 'Thêm dòng' hoặc 'Tạo từ Đơn hàng bán'" /> }} />
        <Button type="dashed" icon={<PlusOutlined />} onClick={addLine} style={{ marginTop: 12 }} block>Thêm dòng container</Button>
      </Card>

      {/* SO picker modal */}
      <Modal title="Chọn đơn hàng bán" open={soModalOpen} onCancel={() => setSoModalOpen(false)} footer={null} width={820}>
        <Input.Search placeholder="Tìm mã đơn / số HĐ / grade" allowClear style={{ marginBottom: 12 }}
          onSearch={(val) => { setSoSearch(val); openSoPicker() }} />
        <Table rowKey="id" size="small" loading={soLoading} dataSource={soOptions} pagination={{ pageSize: 8 }}
          columns={[
            { title: 'Mã đơn', dataIndex: 'code', render: (v: string, r: SalesOrderOption) => <span><b>{v}</b>{r.contract_no && <Tag style={{ marginLeft: 6 }}>{r.contract_no}</Tag>}</span> },
            { title: 'Khách', dataIndex: 'customer_name', render: (v: string) => v || '–' },
            { title: 'Grade', dataIndex: 'grade', width: 90, render: (v: string) => v || '–' },
            { title: 'Cảng đến', dataIndex: 'port_of_destination', render: (v: string) => v || '–' },
            { title: 'Cont', dataIndex: 'container_count', width: 60, align: 'center' as const },
            { title: '', width: 90, render: (_: any, r: SalesOrderOption) => <Button size="small" type="primary" onClick={() => chooseSo(r)}>Chọn</Button> },
          ] as any} />
      </Modal>
    </div>
  )
}
