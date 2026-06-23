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
  Table, InputNumber, message, Breadcrumb, Divider, Tag, Modal, Empty, Segmented,
} from 'antd'
import { SaveOutlined, ArrowLeftOutlined, PlusOutlined, DeleteOutlined, ImportOutlined, TruckOutlined, CarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { fleetService, VEHICLE_KIND_LABELS, type FleetVehicle, type FleetDriver } from '../../../services/logistics/fleetService'
import {
  dispatchService, TRIP_TYPE_LABELS,
  type TripType, type DispatchLineInput, type SalesOrderOption,
} from '../../../services/logistics/dispatchService'
import { soDisplayCode } from '../../../services/sales/salesTypes'
import { useAuthStore } from '../../../stores/authStore'

const { Title } = Typography

interface LineRow extends DispatchLineInput {
  _key: string
  id?: string   // có khi đang sửa
}

// Đơn hàng đã gắn vào lệnh — mỗi đơn 1 thẻ, gỡ được từng đơn (xoá container của đơn đó).
interface AttachedSo {
  id: string
  code: string
  contract_no: string | null
  customer_name: string | null
  destination: string | null
  contract_ref: string | null
  containerIds: string[]
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
  'Kho Phong Điền → Cảng Chu Lai',
  'Kho Quảng Trị → Cảng Tiên Sa',
  'Kho Quảng Trị → Kho Phong Điền',
].map(v => ({ value: v }))
const GRADE_PRESETS = ['SVR 10', 'SVR 3L', 'SVR L', 'SVR 5', 'SVR 20', 'SVR CV50', 'SVR CV60', 'RSS 1', 'RSS 3', 'Latex 60'].map(v => ({ value: v }))
const acFilter = (input: string, opt?: { value: string }) => (opt?.value || '').toLowerCase().includes(input.toLowerCase())

// Nhãn 1 xe trong dropdown: biển số · tài xế mặc định · tải/ghế.
const vehicleLabel = (v: FleetVehicle) => {
  const drv = v.default_driver ? ` · ${v.default_driver.full_name}` : ''
  const cap = v.capacity_note ? ` · ${v.capacity_note}` : (v.capacity_kg ? ` · ${v.capacity_kg.toLocaleString('vi-VN')}kg` : '')
  return `${v.plate}${drv}${cap}`
}

export default function DispatchCreatePage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const user = useAuthStore(s => s.user)
  const [form] = Form.useForm()

  const [tractors, setTractors] = useState<FleetVehicle[]>([])
  const [trailers, setTrailers] = useState<FleetVehicle[]>([])
  const [others, setOthers] = useState<FleetVehicle[]>([])   // xe con / bán tải / khách (kind='other')
  const [drivers, setDrivers] = useState<FleetDriver[]>([])
  const [lines, setLines] = useState<LineRow[]>([])
  const [origLineIds, setOrigLineIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  // SO picker
  const [soModalOpen, setSoModalOpen] = useState(false)
  const [soOptions, setSoOptions] = useState<SalesOrderOption[]>([])
  const [attachedSos, setAttachedSos] = useState<AttachedSo[]>([])  // các đơn đã gắn (mỗi đơn 1 thẻ)
  const [soSearch, setSoSearch] = useState('')
  const [soLoading, setSoLoading] = useState(false)
  // Picker BƯỚC 2: tích container cụ thể của 1 đơn để đi chuyến hôm nay (không đổ hết).
  const [pickerSo, setPickerSo] = useState<SalesOrderOption | null>(null)
  const [pickerContainers, setPickerContainers] = useState<DispatchLineInput[]>([])
  const [pickerChecked, setPickerChecked] = useState<string[]>([])
  const [pickerHeader, setPickerHeader] = useState<{ destination: string | null; contract_ref: string | null }>({ destination: null, contract_ref: null })

  // ---- load danh mục xe/tài xế ----
  useEffect(() => {
    (async () => {
      try {
        const [t, tr, ot, d] = await Promise.all([
          fleetService.listVehicles({ kind: 'tractor', active: true }),
          fleetService.listVehicles({ kind: 'trailer', active: true }),
          fleetService.listVehicles({ kind: 'other', active: true }),
          fleetService.listDrivers({ active: true }),
        ])
        setTractors(t); setTrailers(tr); setOthers(ot); setDrivers(d)
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
          is_hired: order.is_hired || false,
          hire_company: order.hire_company,
          hire_cost: order.hire_cost,
          tractor_vehicle_id: order.tractor_vehicle_id,
          trailer_vehicle_id: order.trailer_vehicle_id,
          driver_id: order.driver_id,
          tractor_plate: order.tractor_plate,
          trailer_plate: order.trailer_plate,
          driver_name: order.driver_name,
          driver_phone: order.driver_phone,
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
          gross_weight_kg: l.gross_weight_kg,
          sales_order_container_id: l.sales_order_container_id, note: l.note,
        })))
        setOrigLineIds(ls.map(l => l.id))
        // Dựng lại các thẻ đơn từ container đã gắn (để gỡ được từng đơn khi sửa).
        const cids = ls.map(l => l.sales_order_container_id).filter(Boolean) as string[]
        if (cids.length > 0) {
          try { setAttachedSos(await dispatchService.ordersFromContainerIds(cids)) } catch { /* best-effort */ }
        } else if (order.sales_order) {
          // Lệnh nhập tay (dòng không gắn container) nhưng có gắn đơn → vẫn hiện 1 thẻ.
          setAttachedSos([{
            id: order.sales_order.id, code: order.sales_order.code, contract_no: order.sales_order.contract_no,
            customer_name: order.customer_name,
            destination: order.destination, contract_ref: order.contract_ref, containerIds: [],
          }])
        }
      } catch (e: any) {
        message.error('Lỗi tải lệnh: ' + (e?.message || e))
      }
      setLoading(false)
    })()
  }, [id])

  // ---- chọn xe (đầu kéo / xe con) → auto điền tài xế cố định nếu có ----
  const allDriveable = useMemo(() => [...tractors, ...others], [tractors, others])
  const onTractorChange = (vid: string) => {
    const t = allDriveable.find(x => x.id === vid)
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
    setPickerSo(null)   // mở ở bước 1 (danh sách đơn)
    setSoLoading(true)
    try { setSoOptions(await dispatchService.listSalesOrderOptions(soSearch || undefined)) }
    catch (e: any) { message.error('Lỗi tải đơn hàng: ' + (e?.message || e)) }
    setSoLoading(false)
  }, [soSearch])

  // Đồng bộ header theo danh sách đơn đang gắn. NHIỀU khách/cảng/HĐ → GỘP (distinct)
  // để chứng từ không sót khách thứ 2. sales_order_id giữ đơn đầu làm tham chiếu chính.
  const applyHeaderFromAttached = useCallback((list: AttachedSo[]) => {
    const uniq = (arr: (string | null)[]) => [...new Set(arr.filter(Boolean) as string[])]
    form.setFieldsValue({
      sales_order_id: list[0]?.id ?? null,
      customer_name: uniq(list.map(s => s.customer_name)).join(' + ') || null,
      destination: uniq(list.map(s => s.destination)).join(' + ') || null,
      contract_ref: uniq(list.map(s => s.contract_ref)).join(' + ') || null,
    })
  }, [form])

  // BƯỚC 2: chọn 1 đơn → tải container CHƯA điều động để người dùng tích đúng cont/seal
  // đi chuyến HÔM NAY (thay vì đổ hết mọi container của đơn).
  const pickSo = async (so: SalesOrderOption) => {
    try {
      const { header, lines: soLines } = await dispatchService.buildFromSalesOrder(so.id)
      const already = new Set(lines.map(l => l.sales_order_container_id).filter(Boolean) as string[])
      const avail = soLines.filter(l => l.sales_order_container_id && !already.has(l.sales_order_container_id as string))
      if (avail.length === 0) {
        message.info(`${so.code}: không còn container chưa điều động (đã giao / đã thêm hết).`)
        return
      }
      setPickerHeader({ destination: header.destination ?? null, contract_ref: header.contract_ref ?? null })
      setPickerContainers(avail)
      setPickerChecked([])         // mặc định KHÔNG tích — user tự chọn cont đi hôm nay
      setPickerSo(so)
    } catch (e: any) {
      message.error('Lỗi tải container: ' + (e?.message || e))
    }
  }

  // Thêm/gộp 1 đơn vào danh sách thẻ + đồng bộ header.
  const upsertAttached = (so: SalesOrderOption, header: { destination: string | null; contract_ref: string | null }, containerIds: string[]) => {
    const exist = attachedSos.find(s => s.id === so.id)
    const next: AttachedSo[] = exist
      ? attachedSos.map(s => s.id === so.id ? { ...s, containerIds: [...new Set([...s.containerIds, ...containerIds])] } : s)
      : [...attachedSos, { id: so.id, code: so.code, contract_no: so.contract_no, customer_name: so.customer_name, destination: header.destination, contract_ref: header.contract_ref, containerIds }]
    setAttachedSos(next)
    applyHeaderFromAttached(next)
  }

  // Xác nhận các container đã tích → thêm vào bảng dòng lệnh.
  const confirmPicked = () => {
    if (!pickerSo) return
    const chosen = pickerContainers.filter(c => pickerChecked.includes(c.sales_order_container_id as string))
    if (chosen.length === 0) { message.warning('Chưa tích container nào để thêm'); return }
    if (attachedSos.length === 0 && !form.getFieldValue('trip_type')) form.setFieldValue('trip_type', 'port')
    setLines(prev => [...prev, ...chosen.map(c => ({ ...c, _key: newKey() }))])
    upsertAttached(pickerSo, pickerHeader, chosen.map(c => c.sales_order_container_id as string))
    message.success(`Đã thêm ${chosen.length} container từ ${pickerSo.code}`)
    setSoModalOpen(false)
    setPickerSo(null)
  }

  const closePicker = () => { setSoModalOpen(false); setPickerSo(null) }

  // Gom container của đơn theo LÔ → quick-select "Chọn cả Lot X" (máy móc),
  // vẫn giữ tích từng cont để chỉnh tay (theo ý).
  const lotGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; ids: string[] }>()
    for (const c of pickerContainers) {
      const key = c.lot_code || '__nolot__'
      if (!map.has(key)) map.set(key, { key, label: c.lot_code || 'Chưa gán lô', ids: [] })
      map.get(key)!.ids.push(c.sales_order_container_id as string)
    }
    return [...map.values()]
  }, [pickerContainers])

  const toggleLot = (ids: string[], allSelected: boolean) =>
    setPickerChecked(prev => allSelected
      ? prev.filter(x => !ids.includes(x))               // đang chọn hết → bỏ chọn cả lô
      : [...new Set([...prev, ...ids])])                 // chọn cả lô

  // Gỡ 1 đơn khỏi lệnh → xoá luôn container của đơn đó khỏi bảng.
  const removeAttachedSo = (soId: string) => {
    const target = attachedSos.find(s => s.id === soId)
    if (!target) return
    const next = attachedSos.filter(s => s.id !== soId)
    setAttachedSos(next)
    setLines(prev => prev.filter(l =>
      !l.sales_order_container_id || !target.containerIds.includes(l.sales_order_container_id as string)))
    applyHeaderFromAttached(next)
    message.success(`Đã gỡ đơn ${target.code}${target.containerIds.length ? ` (xoá ${target.containerIds.length} container)` : ''}`)
  }

  // ---- save ----
  const onSave = async () => {
    try {
      const v = await form.validateFields()
      // Đi cảng bắt buộc có container; chuyến thường (đón khách…) cho phép 0 dòng.
      if (isPort && lines.length === 0) { message.warning('Cần ít nhất 1 dòng container'); return }
      setSaving(true)
      const hired = !!v.is_hired
      const payload = {
        dispatch_date: dayjs(v.dispatch_date).format('YYYY-MM-DD'),
        trip_type: v.trip_type as TripType,
        reason: v.reason || null,
        is_hired: hired,
        hire_company: hired ? (v.hire_company || null) : null,
        hire_cost: hired ? (v.hire_cost ?? null) : null,
        tractor_vehicle_id: hired ? null : (v.tractor_vehicle_id || null),
        trailer_vehicle_id: hired ? null : (v.trailer_vehicle_id || null),
        driver_id: hired ? null : (v.driver_id || null),
        tractor_plate: hired ? (v.tractor_plate || null) : null,
        trailer_plate: hired ? (v.trailer_plate || null) : null,
        driver_name: hired ? (v.driver_name || null) : null,
        driver_phone: hired ? (v.driver_phone || null) : null,
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
        gross_weight_kg: l.gross_weight_kg ?? null,
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

  // Loại chuyến: 'port' = đi cảng (đủ cột container/seal + gắn Đơn hàng bán).
  // Khác (lao/internal/other) = chuyến thường (chở mủ, vật tư, nội bộ) → bảng GỌN.
  const watchedTripType = Form.useWatch('trip_type', form) as TripType | undefined
  const isPort = (watchedTripType ?? 'port') === 'port'
  const isHired = Form.useWatch('is_hired', form) === true   // xe thuê ngoài

  // Ô xe chính LỌC THEO LOẠI CHUYẾN (phiếu):
  //   • Xuất hàng đi cảng → chỉ Đầu kéo (kéo container).
  //   • Đi Lào → Đầu kéo trước (chở hàng), rồi Xe con/khách (đi công tác).
  //   • Nội bộ / Khác → Xe con/bán tải/khách trước (đón khách, việc vặt), rồi Đầu kéo.
  const primaryVehicleOptions = useMemo(() => {
    const tractorGrp = { label: '🚛 Đầu kéo', options: tractors.map(t => ({ value: t.id, label: vehicleLabel(t) })) }
    const otherGrp = { label: '🚗 Xe con / bán tải / khách', options: others.map(t => ({ value: t.id, label: vehicleLabel(t) })) }
    if (isPort) return tractorGrp.options
    const leadOther = watchedTripType === 'internal' || watchedTripType === 'other'
    return (leadOther ? [otherGrp, tractorGrp] : [tractorGrp, otherGrp]).filter(g => g.options.length > 0)
  }, [isPort, watchedTripType, tractors, others])

  const lineColumns = useMemo(() => {
    const col: Record<string, any> = {
      idx: { title: '#', key: 'idx', width: 44, render: (_: any, __: any, i: number) => i + 1 },
      route: { title: 'Hành trình', key: 'route', width: 210, render: (_: any, r: LineRow) => (
        <AutoComplete value={r.route || ''} style={{ width: '100%' }} options={ROUTE_PRESETS}
          placeholder="Chọn / gõ tuyến…" filterOption={acFilter as any}
          onChange={v => patchLine(r._key, { route: v })} />
      ) },
      lot: { title: 'Lô hàng', key: 'lot', width: 130, render: (_: any, r: LineRow) => <Input value={r.lot_code || ''} onChange={e => patchLine(r._key, { lot_code: e.target.value })} /> },
      grade: { title: isPort ? 'Loại hàng' : 'Nội dung / hàng hóa', key: 'grade', width: 180, render: (_: any, r: LineRow) => (
        <AutoComplete value={r.grade || ''} style={{ width: '100%' }} options={GRADE_PRESETS}
          placeholder={isPort ? 'SVR 10 / Mủ tờ…' : 'Đón khách / Mủ tờ / Vật tư…'} filterOption={acFilter as any}
          onChange={v => patchLine(r._key, { grade: v })} />
      ) },
      cont: { title: 'Số container', key: 'cont', width: 160, render: (_: any, r: LineRow) => <Input value={r.container_no || ''} onChange={e => patchLine(r._key, { container_no: e.target.value })} /> },
      seal: { title: 'Seal', key: 'seal', width: 140, render: (_: any, r: LineRow) => <Input value={r.seal_no || ''} onChange={e => patchLine(r._key, { seal_no: e.target.value })} /> },
      pkg: { title: 'Số kiện', key: 'pkg', width: 110, render: (_: any, r: LineRow) => (
        <InputNumber value={r.package_count ?? undefined} min={0} controls={false} style={{ width: '100%' }}
          onChange={v => {
            const pkg = (v as number) ?? null
            const patch: Partial<LineRow> = { package_count: pkg }
            if (pkg && !r.weight_kg) patch.weight_kg = pkg * BALE_KG
            patchLine(r._key, patch)
          }} />
      ) },
      w: { title: 'KL net (kg)', key: 'w', width: 130, render: (_: any, r: LineRow) => (
        <InputNumber value={r.weight_kg || undefined} min={0} controls={false} style={{ width: '100%' }}
          formatter={numFmt} parser={numParse as any} placeholder="0"
          onChange={v => patchLine(r._key, { weight_kg: (v as number) || 0 })} />
      ) },
      gw: { title: 'GW (kg)', key: 'gw', width: 130, render: (_: any, r: LineRow) => (
        <InputNumber value={r.gross_weight_kg ?? undefined} min={0} controls={false} style={{ width: '100%' }}
          formatter={numFmt} parser={numParse as any} placeholder="net + bì"
          onChange={v => patchLine(r._key, { gross_weight_kg: (v as number) ?? null })} />
      ) },
      note: { title: 'Ghi chú', key: 'note', width: 200, render: (_: any, r: LineRow) => (
        <Input value={r.note || ''} placeholder="vd: chở mủ tờ" onChange={e => patchLine(r._key, { note: e.target.value })} />
      ) },
      act: { title: '', key: 'act', width: 50, render: (_: any, r: LineRow) => <Button danger icon={<DeleteOutlined />} onClick={() => removeLineRow(r._key)} /> },
    }
    // Đi cảng: đủ cột container/seal. Chuyến thường: gọn (hành trình · loại hàng · KL · ghi chú).
    return isPort
      ? [col.idx, col.route, col.lot, col.grade, col.cont, col.seal, col.pkg, col.w, col.gw, col.act]
      : [col.idx, col.route, col.grade, col.w, col.note, col.act]
  }, [isPort, patchLine, removeLineRow])

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

        <Form form={form} layout="vertical" size="large" initialValues={{ dispatch_date: dayjs(), trip_type: 'port', is_hired: false }}>
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
              {isPort ? (
                <Form.Item label="Đơn hàng bán (gộp được nhiều đơn cho 1 xe)">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {attachedSos.length === 0 && <Typography.Text type="secondary">Chưa gắn đơn hàng</Typography.Text>}
                    {attachedSos.map(s => (
                      <Tag key={s.id} closable color="blue"
                        onClose={(e) => { e.preventDefault(); removeAttachedSo(s.id) }}
                        style={{ fontSize: 14, padding: '4px 10px', margin: 0, lineHeight: '22px' }}>
                        <b>{soDisplayCode(s)}</b>{s.customer_name ? ` — ${s.customer_name}` : ''}
                        {s.containerIds.length > 0 && <span style={{ opacity: 0.7 }}> · {s.containerIds.length} cont</span>}
                      </Tag>
                    ))}
                    <Button size="small" icon={<ImportOutlined />} onClick={openSoPicker}>
                      {attachedSos.length ? '+ Thêm đơn khác' : 'Tạo từ Đơn hàng bán'}
                    </Button>
                  </div>
                </Form.Item>
              ) : (
                <Form.Item label="Loại chuyến này">
                  <Typography.Text type="secondary">
                    Chuyến nội bộ/thường — không gắn Đơn hàng bán.<br />
                    • <b>Đón khách / công tác:</b> chỉ cần Lý do + Điểm đến (bảng dưới bỏ trống).<br />
                    • <b>Chở hàng:</b> bấm "Thêm dòng" khai Hành trình + Nội dung + KL.
                  </Typography.Text>
                </Form.Item>
              )}
              {/* sales_order_id giữ trong form để submit, KHÔNG hiển thị UUID cho người dùng */}
              <Form.Item name="sales_order_id" hidden><Input /></Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="left" style={{ margin: '4px 0 16px' }}>Phương tiện &amp; tài xế</Divider>
          <Form.Item name="is_hired" style={{ marginBottom: 16 }}>
            <Segmented options={[{ label: '🚛 Xe nhà', value: false }, { label: '🤝 Thuê ngoài', value: true }]} />
          </Form.Item>

          {!isHired ? (
            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item name="tractor_vehicle_id" label={isPort ? <><TruckOutlined /> Đầu kéo</> : <><CarOutlined /> Xe (đầu kéo / xe con / khách)</>}>
                  <Select allowClear showSearch optionFilterProp="label"
                    placeholder={isPort ? 'Chọn đầu kéo' : 'Chọn xe'} onChange={onTractorChange}
                    options={primaryVehicleOptions} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="trailer_vehicle_id" label={isPort ? <><CarOutlined /> Rơ-moóc (đổi theo chuyến)</> : <><CarOutlined /> Rơ-moóc (nếu kéo theo)</>}>
                  <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn rơ-moóc"
                    options={trailers.map(t => ({ value: t.id, label: vehicleLabel(t) }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="driver_id" label="Tài xế">
                  <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn tài xế"
                    options={drivers.map(d => ({ value: d.id, label: d.full_name }))} />
                </Form.Item>
              </Col>
            </Row>
          ) : (
            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item name="hire_company" label="🏢 Nhà xe / đơn vị vận tải" rules={[{ required: true, message: 'Nhập nhà xe thuê' }]}>
                  <Input placeholder="vd: Nhà xe Thành Công / Cty Vận tải ABC" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="tractor_plate" label={<><TruckOutlined /> Biển số đầu kéo</>}>
                  <Input placeholder="vd: 43C-123.45" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="trailer_plate" label={<><CarOutlined /> Biển số rơ-moóc</>}>
                  <Input placeholder="vd: 43R-678.90" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="driver_name" label="Tên tài xế (thuê ngoài)">
                  <Input placeholder="Họ tên tài xế nhà xe" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="driver_phone" label="SĐT tài xế">
                  <Input placeholder="09xx…" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="hire_cost" label="Cước thuê (VNĐ)">
                  <InputNumber min={0} style={{ width: '100%' }} formatter={numFmt} parser={numParse as any} placeholder="0" />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Divider titlePlacement="left" style={{ margin: '4px 0 16px' }}>Thông tin chuyến</Divider>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}><Form.Item name="customer_name" label="Khách hàng"><Input /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="destination" label={isPort ? 'Điểm giao / Cảng' : 'Điểm đến / nơi nhận'}><Input placeholder={isPort ? 'Cảng Tiên Sa' : 'vd: Gio Linh / Kho Quảng Trị'} /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="contract_ref" label="Căn cứ HĐ / Booking"><Input /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="recipient_name" label="Người nhận"><Input /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="recipient_phone" label="SĐT người nhận"><Input /></Form.Item></Col>
            <Col xs={24} sm={12} md={8}><Form.Item name="reason" label="Lý do điều động"><Input /></Form.Item></Col>
            <Col xs={24}><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>

        <Divider titlePlacement="left" style={{ margin: '4px 0 12px' }}>
          {isPort ? 'Danh sách container' : 'Chi tiết chuyến'} ({lines.length}) — tổng {totalWeight.toLocaleString('vi-VN')} kg
        </Divider>
        <Table rowKey="_key" size="middle" pagination={false} columns={lineColumns as any} dataSource={lines}
          scroll={{ x: isPort ? 1320 : 760 }}
          locale={{ emptyText: <Empty description={isPort ? "Chưa có container — bấm 'Thêm dòng' hoặc 'Tạo từ Đơn hàng bán'" : "Đón khách thì bỏ trống cũng được; chở hàng thì bấm 'Thêm dòng'"} /> }} />
        <Button type="dashed" icon={<PlusOutlined />} onClick={addLine} style={{ marginTop: 12 }} block>{isPort ? 'Thêm dòng container' : 'Thêm dòng'}</Button>
      </Card>

      {/* SO picker — 2 BƯỚC: (1) chọn đơn → (2) tích container đi chuyến hôm nay */}
      <Modal
        title={pickerSo ? `Chọn container đi chuyến này — ${soDisplayCode(pickerSo)}` : 'Chọn đơn hàng bán'}
        open={soModalOpen} onCancel={closePicker} width={860}
        footer={pickerSo ? [
          <Button key="back" onClick={() => setPickerSo(null)}>← Danh sách đơn</Button>,
          <Button key="add" type="primary" disabled={pickerChecked.length === 0} onClick={confirmPicked}>
            Thêm {pickerChecked.length || ''} container đã chọn
          </Button>,
        ] : null}
      >
        {!pickerSo ? (
          <>
            <Input.Search placeholder="Tìm mã đơn / số HĐ / grade" allowClear style={{ marginBottom: 12 }}
              onSearch={(val) => { setSoSearch(val); openSoPicker() }} />
            <Table rowKey="id" size="small" loading={soLoading} dataSource={soOptions} pagination={{ pageSize: 8 }}
              columns={[
                { title: 'Mã đơn', dataIndex: 'code', render: (_v: string, r: SalesOrderOption) => <span><b>{soDisplayCode(r)}</b>{r.contract_no && r.code && <Tag style={{ marginLeft: 6 }}>{r.code}</Tag>}</span> },
                { title: 'Khách', dataIndex: 'customer_name', render: (v: string) => v || '–' },
                { title: 'Grade', dataIndex: 'grade', width: 90, render: (v: string) => v || '–' },
                { title: 'Cảng đến', dataIndex: 'port_of_destination', render: (v: string) => v || '–' },
                { title: 'Cont', dataIndex: 'container_count', width: 60, align: 'center' as const },
                { title: '', width: 96, render: (_: any, r: SalesOrderOption) => <Button size="small" type="primary" onClick={() => pickSo(r)}>Chọn →</Button> },
              ] as any} />
          </>
        ) : (
          <>
            <div style={{ marginBottom: 10, fontSize: 13, color: '#555' }}>
              Tích chọn <b>container đi chuyến này</b> của <b>{soDisplayCode(pickerSo)}</b>
              {pickerSo.customer_name ? ` — ${pickerSo.customer_name}` : ''}. Chỉ hiện container <b>chưa điều động</b>.
            </div>
            {/* Quick-select theo lô: 1 cú chọn cả Lot, vẫn chỉnh tay được bằng checkbox */}
            <Space size={[8, 8]} wrap style={{ marginBottom: 10 }}>
              <Button size="small" onClick={() => setPickerChecked(pickerContainers.map(c => c.sales_order_container_id as string))}>Chọn tất cả</Button>
              <Button size="small" onClick={() => setPickerChecked([])}>Bỏ chọn</Button>
              {lotGroups.length > 0 && <span style={{ borderLeft: '1px solid #d9d9d9', height: 18 }} />}
              {lotGroups.map(g => {
                const sel = g.ids.filter(id => pickerChecked.includes(id)).length
                const allSel = sel === g.ids.length
                return (
                  <Button key={g.key} size="small" type={allSel ? 'primary' : 'default'}
                    onClick={() => toggleLot(g.ids, allSel)}>
                    {g.label} · {sel}/{g.ids.length}
                  </Button>
                )
              })}
            </Space>
            <Table rowKey={(r: DispatchLineInput) => r.sales_order_container_id as string}
              size="small" pagination={false} dataSource={pickerContainers} scroll={{ y: 360 }}
              rowSelection={{ selectedRowKeys: pickerChecked, onChange: (keys) => setPickerChecked(keys as string[]) }}
              columns={[
                { title: 'Lô', dataIndex: 'lot_code', width: 64, render: (v: string) => v || '–' },
                { title: 'Số container', dataIndex: 'container_no', render: (v: string) => v ? <b>{v}</b> : <Typography.Text type="warning">(chưa nhập số)</Typography.Text> },
                { title: 'Số seal', dataIndex: 'seal_no', render: (v: string) => v || '–' },
                { title: 'Loại hàng', dataIndex: 'grade', width: 108, render: (v: string) => v || '–' },
                { title: 'Số kiện', dataIndex: 'package_count', width: 70, align: 'right' as const, render: (v: number) => v ?? '–' },
                { title: 'KL (kg)', dataIndex: 'weight_kg', width: 92, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('vi-VN') : '–' },
              ] as any} />
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>Đã chọn {pickerChecked.length}/{pickerContainers.length} container.</div>
          </>
        )}
      </Modal>
    </div>
  )
}
