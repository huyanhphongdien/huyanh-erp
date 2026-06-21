// ============================================================================
// CONTAINER PACKING PAGE — Trang quản lý đóng gói container
// File: src/pages/sales/ContainerPackingPage.tsx
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Button,
  Space,
  Typography,
  Statistic,
  Spin,
  Empty,
  Breadcrumb,
  Tag,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Collapse,
  Popconfirm,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  LockOutlined,
  ContainerOutlined,
  InboxOutlined,
  AppstoreAddOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { salesOrderService } from '../../services/sales/salesOrderService'
import { containerService } from '../../services/sales/containerService'
import type { ContainerSummary } from '../../services/sales/containerService'
import { dispatchService, type DeliveryState } from '../../services/logistics/dispatchService'
import { LOT_STAGES, buildLotTrackRows, lotDeliveryStats } from '../../services/sales/lotTracking'
import type {
  SalesOrder,
  SalesOrderContainer,
  SalesOrderContainerItem,
  ContainerStatus,
} from '../../services/sales/salesTypes'
import {
  CONTAINER_STATUS_LABELS,
  CONTAINER_STATUS_COLORS,
  CONTAINER_TYPE_LABELS,
  SVR_GRADE_OPTIONS,
  soDisplayCode,
} from '../../services/sales/salesTypes'

const { Title, Text } = Typography

// ============================================================================
// HELPERS
// ============================================================================

const formatNumber = (v: number | null | undefined): string => {
  if (v == null) return '-'
  return v.toLocaleString('vi-VN')
}


// ============================================================================
// COMPONENT
// ============================================================================

function ContainerPackingPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()

  // State
  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [containers, setContainers] = useState<SalesOrderContainer[]>([])
  const [summary, setSummary] = useState<ContainerSummary | null>(null)
  const [deliveryMap, setDeliveryMap] = useState<Record<string, DeliveryState>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Modals
  const [addContainerOpen, setAddContainerOpen] = useState(false)
  const [addContainerForm] = Form.useForm()

  const [sealModalOpen, setSealModalOpen] = useState(false)
  const [sealContainerId, setSealContainerId] = useState<string | null>(null)
  const [sealForm] = Form.useForm()

  const [addBalesModalOpen, setAddBalesModalOpen] = useState(false)
  const [addBalesContainerId, setAddBalesContainerId] = useState<string | null>(null)
  const [addBalesForm] = Form.useForm()

  // Chia lô: chọn nhiều cont để gán lô (Cách A) + tạo container theo lô (Cách B)
  const [lotSelectedKeys, setLotSelectedKeys] = useState<string[]>([])
  const [bulkLotOpen, setBulkLotOpen] = useState(false)
  const [bulkLotForm] = Form.useForm()
  const [createLotOpen, setCreateLotOpen] = useState(false)
  const [createLotForm] = Form.useForm()
  const [availableBatches, setAvailableBatches] = useState<Array<{
    id: string
    batch_no: string
    grade: string
    drc: number
    total_bales: number
    total_weight_kg: number
    assigned_bales: number
    remaining_bales: number
  }>>([])

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!orderId) return
    try {
      setLoading(true)
      const [o, c, s] = await Promise.all([
        salesOrderService.getById(orderId),
        containerService.getContainers(orderId),
        containerService.getContainerSummary(orderId),
      ])
      setOrder(o)
      setContainers(c)
      setSummary(s)
      // Trạng thái giao của từng container (theo lệnh điều động) — cho cột Giao hàng + tiến độ lô.
      try { setDeliveryMap(await dispatchService.getDeliveryStatus(c.map((x) => x.id))) }
      catch { /* best-effort */ }
    } catch (err) {
      console.error(err)
      message.error('Không thể tải dữ liệu đóng gói')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Load available batches ──
  const loadAvailableBatches = useCallback(async () => {
    if (!orderId) return
    try {
      const batches = await containerService.getAvailableBatches(orderId)
      setAvailableBatches(batches)
    } catch (err) {
      console.error(err)
    }
  }, [orderId])

  // ══════════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════════

  const handleAutoCreateContainers = async () => {
    if (!orderId) return
    try {
      setActionLoading(true)
      await containerService.autoCreateContainers(orderId)
      message.success('Đã tạo container tự động')
      loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể tạo container tự động')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAutoAssignBales = async () => {
    if (!orderId) return
    try {
      setActionLoading(true)
      await containerService.autoAssignBales(orderId)
      message.success('Đã phân bổ bành tự động vào các container')
      loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể phân bổ bành tự động')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddContainer = async () => {
    try {
      const vals = await addContainerForm.validateFields()
      if (!orderId) return
      await containerService.addContainer(orderId, vals)
      message.success('Đã thêm container')
      setAddContainerOpen(false)
      addContainerForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể thêm container')
    }
  }

  const handleDeleteContainer = async (containerId: string) => {
    try {
      setActionLoading(true)
      await containerService.deleteContainer(containerId)
      message.success('Đã xóa container')
      loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể xóa container')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSealContainer = async () => {
    if (!sealContainerId) return
    try {
      const vals = await sealForm.validateFields()
      await containerService.sealContainer(sealContainerId, vals.seal_no)
      message.success('Đã niêm phong container')
      setSealModalOpen(false)
      setSealContainerId(null)
      sealForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể niêm phong container')
    }
  }

  const handleOpenAddBales = async (containerId: string) => {
    setAddBalesContainerId(containerId)
    setAddBalesModalOpen(true)
    await loadAvailableBatches()
  }

  const handleAddBales = async () => {
    if (!addBalesContainerId) return
    try {
      const vals = await addBalesForm.validateFields()

      // Tìm batch info
      const batch = availableBatches.find((b) => b.id === vals.batch_id)
      if (!batch) {
        message.error('Vui lòng chọn lô hàng')
        return
      }

      const baleFrom = vals.bale_from || 1
      const baleTo = vals.bale_to || vals.bale_count
      const baleCount = vals.bale_count || (baleTo - baleFrom + 1)
      const weightPerBale = batch.total_weight_kg / batch.total_bales
      const weight = Math.round(baleCount * weightPerBale)

      await containerService.addContainerItems(addBalesContainerId, [
        {
          batch_id: batch.id,
          batch_no: batch.batch_no,
          bale_from: baleFrom,
          bale_to: baleTo,
          bale_count: baleCount,
          weight_kg: weight,
          grade: batch.grade,
          drc: batch.drc,
        },
      ])

      message.success(`Đã thêm ${baleCount} bành vào container`)
      setAddBalesModalOpen(false)
      setAddBalesContainerId(null)
      addBalesForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể thêm bành')
    }
  }

  // Gán lô / hạn giao cho container (lưu ngay). Đặt hạn 1 cont → tự áp cho cả lô cùng số.
  const handleSetContainerLot = async (
    containerId: string,
    patch: { lot_no?: number | null; lot_deadline?: string | null },
  ) => {
    setContainers((prev) => prev.map((c) => (c.id === containerId ? { ...c, ...patch } : c)))
    try {
      await containerService.updateContainer(containerId, patch as any)
      if (patch.lot_deadline !== undefined) {
        const cur = containers.find((c) => c.id === containerId)
        const lot = patch.lot_no ?? cur?.lot_no
        if (lot != null) {
          const sameLot = containers.filter((c) => c.lot_no === lot && c.id !== containerId)
          if (sameLot.length) {
            setContainers((prev) => prev.map((c) => (c.lot_no === lot ? { ...c, lot_deadline: patch.lot_deadline ?? undefined } : c)))
            for (const c of sameLot) await containerService.updateContainer(c.id, { lot_deadline: patch.lot_deadline } as any)
          }
        }
      }
    } catch (e: any) {
      message.error('Lỗi lưu lô: ' + (e?.message || e))
    }
  }

  // Cách A — gán Lô/Hạn cho nhiều container đã chọn 1 lần.
  const handleBulkSetLot = async () => {
    try {
      const vals = await bulkLotForm.validateFields()
      const patch: { lot_no?: number | null; lot_deadline?: string | null } = { lot_no: vals.lot_no ?? null }
      if (vals.lot_deadline) patch.lot_deadline = vals.lot_deadline.format('YYYY-MM-DD')
      await containerService.bulkSetLot(lotSelectedKeys, patch)
      message.success(`Đã gán Lô ${vals.lot_no} cho ${lotSelectedKeys.length} container`)
      setBulkLotOpen(false)
      setLotSelectedKeys([])
      bulkLotForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể gán lô')
    }
  }

  // Cách B — tạo container placeholder theo lô (chưa cần số cont/seal).
  const handleCreateByLot = async () => {
    try {
      const vals = await createLotForm.validateFields()
      const baleWeight = order?.bale_weight_kg || 35
      const ctype = (order?.container_type as any) || '20ft'
      const lots = (vals.lots || [])
        .filter((l: any) => l && l.count > 0)
        .map((l: any) => ({
          lot_no: l.lot_no,
          count: l.count,
          lot_deadline: l.deadline ? l.deadline.format('YYYY-MM-DD') : null,
          container_type: ctype,
          bale_count: l.bales || null,
          net_weight_kg: l.bales ? Math.round(l.bales * baleWeight) : null,
        }))
      if (lots.length === 0) { message.warning('Chưa khai báo lô nào'); return }
      const created = await containerService.createPlannedContainers(orderId!, lots)
      message.success(`Đã tạo ${created} container theo ${lots.length} lô`)
      setCreateLotOpen(false)
      createLotForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể tạo theo lô')
    }
  }

  const handleRemoveItem = async (itemId: string) => {
    try {
      await containerService.removeContainerItem(itemId)
      message.success('Đã xóa bành khỏi container')
      loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể xóa bành')
    }
  }

  // ══════════════════════════════════════════════════════════════
  // LOADING / NOT FOUND
  // ══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!order) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Không tìm thấy đơn hàng" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/sales/orders')}>Quay lại danh sách</Button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // DERIVED DATA
  // ══════════════════════════════════════════════════════════════

  const gradeLabel =
    SVR_GRADE_OPTIONS.find((g) => g.value === order.grade)?.label || order.grade
  const customerName = order.customer?.name || '-'

  // ══════════════════════════════════════════════════════════════
  // CONTAINER ITEM COLUMNS
  // ══════════════════════════════════════════════════════════════

  const itemColumns: ColumnsType<SalesOrderContainerItem> = [
    {
      title: 'Mã lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{v || '-'}</Text>,
    },
    {
      title: 'Bành',
      key: 'bale_range',
      render: (_: unknown, record) => {
        if (record.bale_from && record.bale_to) {
          return `${record.bale_from} - ${record.bale_to}`
        }
        return '-'
      },
    },
    {
      title: 'Số bành',
      dataIndex: 'bale_count',
      key: 'bale_count',
      align: 'right' as const,
      render: (v) => formatNumber(v),
    },
    {
      title: 'KL (kg)',
      dataIndex: 'weight_kg',
      key: 'weight_kg',
      align: 'right' as const,
      render: (v) => formatNumber(v),
    },
    {
      title: 'Cấp mủ',
      dataIndex: 'grade',
      key: 'grade',
      render: (v) => v ? <Tag color="blue">{v}</Tag> : '-',
    },
    {
      title: 'DRC (%)',
      dataIndex: 'drc',
      key: 'drc',
      align: 'right' as const,
      render: (v) => v ? `${v}%` : '-',
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record) => (
        <Popconfirm
          title="Xóa bành này khỏi container?"
          onConfirm={() => handleRemoveItem(record.id)}
          okText="Xóa"
          cancelText="Hủy"
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  // ══════════════════════════════════════════════════════════════
  // AVAILABLE BATCHES COLUMNS
  // ══════════════════════════════════════════════════════════════

  const batchSelectOptions = availableBatches
    .filter((b) => b.remaining_bales > 0)
    .map((b) => ({
      value: b.id,
      label: `${b.batch_no} — ${b.grade} — Còn ${b.remaining_bales} bành (${formatNumber(b.total_weight_kg)} kg)`,
    }))

  // ══════════════════════════════════════════════════════════════
  // RENDER CONTAINER PANELS
  // ══════════════════════════════════════════════════════════════

  const containerPanels = containers.map((c, idx) => {
    const items = c.items || []
    const totalBales = items.reduce((sum, i) => sum + (i.bale_count || 0), 0)
    const totalWeight = items.reduce((sum, i) => sum + (i.weight_kg || 0), 0)

    const headerLabel = (
      <Space size="middle" wrap>
        <Text strong>Container #{idx + 1}</Text>
        {c.container_no && <Text type="secondary">{c.container_no}</Text>}
        {c.seal_no && (
          <Tag color="blue" icon={<LockOutlined />}>
            Seal: {c.seal_no}
          </Tag>
        )}
        <Tag color={CONTAINER_STATUS_COLORS[c.status as ContainerStatus]}>
          {CONTAINER_STATUS_LABELS[c.status as ContainerStatus]}
        </Tag>
        <Text type="secondary">
          Bành: {totalBales || c.bale_count || 0}
        </Text>
        <Text type="secondary">
          KL: {formatNumber(totalWeight || c.net_weight_kg || 0)} kg
        </Text>
        {c.container_type && (
          <Tag>{CONTAINER_TYPE_LABELS[c.container_type as keyof typeof CONTAINER_TYPE_LABELS]}</Tag>
        )}
      </Space>
    )

    return {
      key: c.id,
      label: headerLabel,
      children: (
        <div>
          {/* Items table */}
          {items.length > 0 ? (
            <Table
              dataSource={items}
              columns={itemColumns}
              rowKey="id"
              pagination={false}
              size="small"
              bordered
            />
          ) : (
            <Empty
              description="Chưa có bành nào trong container"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: '16px 0' }}
            />
          )}

          {/* Footer actions */}
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => handleOpenAddBales(c.id)}
              >
                Thêm bành
              </Button>
              {c.status !== 'sealed' && c.status !== 'shipped' && (
                <Button
                  size="small"
                  icon={<LockOutlined />}
                  style={{ color: '#1B4D3E', borderColor: '#1B4D3E' }}
                  onClick={() => {
                    setSealContainerId(c.id)
                    setSealModalOpen(true)
                  }}
                >
                  Seal container
                </Button>
              )}
            </Space>
            {c.status === 'planning' && (
              <Popconfirm
                title="Xóa container này?"
                description="Tất cả bành trong container sẽ bị xóa."
                onConfirm={() => handleDeleteContainer(c.id)}
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  Xóa
                </Button>
              </Popconfirm>
            )}
          </div>
        </div>
      ),
    }
  })

  // ══════════════════════════════════════════════════════════════
  // CHIA LÔ — cột bảng + tiến độ giao
  // ══════════════════════════════════════════════════════════════

  const deliveredCount = containers.filter((c) => deliveryMap[c.id] === 'delivered').length
  const dispatchingCount = containers.filter((c) => deliveryMap[c.id] === 'dispatching').length
  const lotNumbers = Array.from(
    new Set(containers.map((c) => c.lot_no).filter((v): v is number => v != null)),
  ).sort((a, b) => a - b)

  // Lưu 1 field container ra DB (số cont/seal/bành/KL). Cập nhật cục bộ onChange, lưu onBlur.
  const persistField = async (id: string, patch: Record<string, any>) => {
    try { await containerService.updateContainer(id, patch as any) }
    catch (e: any) { message.error('Lỗi lưu: ' + (e?.message || e)) }
  }
  const patchLocal = (id: string, patch: Record<string, any>) =>
    setContainers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const lotColumns: ColumnsType<SalesOrderContainer> = [
    { title: '#', key: 'idx', width: 40, render: (_: unknown, __: unknown, i: number) => <Text strong>#{i + 1}</Text> },
    {
      title: 'Số container',
      key: 'container_no',
      width: 150,
      render: (_: unknown, r) => (
        <Input size="small" value={r.container_no ?? ''} placeholder="(chưa có)"
          onChange={(e) => patchLocal(r.id, { container_no: e.target.value })}
          onBlur={(e) => persistField(r.id, { container_no: e.target.value.trim() || null })} />
      ),
    },
    {
      title: 'Số seal',
      key: 'seal_no',
      width: 140,
      render: (_: unknown, r) => (
        <Input size="small" value={r.seal_no ?? ''} placeholder="(chưa có)"
          onChange={(e) => patchLocal(r.id, { seal_no: e.target.value })}
          onBlur={(e) => persistField(r.id, { seal_no: e.target.value.trim() || null })} />
      ),
    },
    {
      title: 'Số bành',
      key: 'bale_count',
      width: 86,
      align: 'right' as const,
      render: (_: unknown, r) => (
        <InputNumber size="small" min={0} controls={false} style={{ width: 72 }} placeholder="—"
          value={r.bale_count ?? undefined}
          onChange={(v) => patchLocal(r.id, { bale_count: (v as number) ?? null })}
          onBlur={() => { const c = containers.find((x) => x.id === r.id); persistField(r.id, { bale_count: c?.bale_count ?? null }) }} />
      ),
    },
    {
      title: 'KL (kg)',
      key: 'net_weight_kg',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, r) => (
        <InputNumber size="small" min={0} controls={false} style={{ width: 86 }} placeholder="—"
          value={r.net_weight_kg ?? undefined}
          onChange={(v) => patchLocal(r.id, { net_weight_kg: (v as number) ?? null })}
          onBlur={() => { const c = containers.find((x) => x.id === r.id); persistField(r.id, { net_weight_kg: c?.net_weight_kg ?? null }) }} />
      ),
    },
    {
      title: 'Lô',
      key: 'lot_no',
      width: 80,
      render: (_: unknown, r) => (
        <InputNumber size="small" min={1} value={r.lot_no ?? undefined} placeholder="—" controls={false}
          style={{ width: 66 }} onChange={(v) => handleSetContainerLot(r.id, { lot_no: (v as number) ?? null })} />
      ),
    },
    {
      title: 'Hạn giao',
      key: 'lot_deadline',
      width: 140,
      render: (_: unknown, r) => (
        <DatePicker size="small" value={r.lot_deadline ? dayjs(r.lot_deadline) : undefined} format="DD/MM/YYYY"
          placeholder="—" style={{ width: 124 }}
          onChange={(d) => handleSetContainerLot(r.id, { lot_no: r.lot_no ?? null, lot_deadline: d ? d.format('YYYY-MM-DD') : null })} />
      ),
    },
    {
      title: 'Giao hàng',
      key: 'delivery',
      width: 120,
      render: (_: unknown, r) => {
        const d = deliveryMap[r.id]
        if (d === 'delivered') return <Tag color="green">✅ Đã giao</Tag>
        if (d === 'dispatching') return <Tag color="orange">🚚 Đang điều động</Tag>
        return <Tag>Chưa giao</Tag>
      },
    },
    {
      title: '',
      key: 'del',
      width: 44,
      render: (_: unknown, r) => r.status === 'planning'
        ? (
          <Popconfirm title="Xóa container này?" description="Bành trong cont (nếu có) sẽ bị xóa theo."
            onConfirm={() => handleDeleteContainer(r.id)} okText="Xóa" cancelText="Hủy">
            <Button danger type="text" size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        )
        : <Tag color="default" style={{ fontSize: 11 }}>khoá</Tag>,
    },
  ]

  // ══════════════════════════════════════════════════════════════
  // THEO DÕI LÔ — gộp container theo lô + giai đoạn
  // ══════════════════════════════════════════════════════════════

  // Theo dõi lô: gom container theo lô + giai đoạn (util chung với tab Đóng gói).
  const lotTrackRows = buildLotTrackRows(containers, deliveryMap)
  const { lotsTotal, lotsDelivered } = lotDeliveryStats(lotTrackRows)

  const lotTrackColumns: ColumnsType<typeof lotTrackRows[number]> = [
    { title: 'Lô', key: 'lo', width: 110, render: (_: unknown, r) =>
        r.lotNo != null ? <Text strong>Lô {r.lotNo}</Text> : <Text type="secondary">Chưa gán lô</Text> },
    { title: 'Hạn giao', key: 'hg', width: 110, render: (_: unknown, r) =>
        r.deadline ? dayjs(r.deadline).format('DD/MM/YYYY') : '—' },
    { title: 'Số cont', key: 'sc', width: 70, align: 'center' as const, render: (_: unknown, r) => r.total },
    { title: 'Tiến độ', key: 'td', render: (_: unknown, r) => (
        <Space size={[4, 4]} wrap>
          {LOT_STAGES.filter((s) => r.counts[s.key] > 0).map((s) => (
            <Tag key={s.key} color={s.color}>{s.icon} {s.short}: {r.counts[s.key]}</Tag>
          ))}
        </Space>
      ) },
    { title: 'Trạng thái lô', key: 'tt', width: 160, render: (_: unknown, r) => {
        if (r.counts.delivered === r.total) return <Tag color="green">🟢 Đã giao xong</Tag>
        const ov = LOT_STAGES.find((s) => r.counts[s.key] > 0)
        return ov ? <Tag color={ov.color}>{ov.icon} {ov.label}</Tag> : '—'
      } },
  ]

  // ══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/sales/orders')}>Đơn hàng</a> },
          { title: <a onClick={() => navigate(`/sales/orders/${orderId}`)}>{soDisplayCode(order)}</a> },
          { title: 'Đóng gói' },
        ]}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/sales/orders/${orderId}`)}
          />
          <Title level={4} style={{ margin: 0 }}>
            <ContainerOutlined style={{ marginRight: 8 }} />
            Đóng gói — {soDisplayCode(order)}
          </Title>
        </Space>
      </div>

      {/* Order summary */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={12} sm={6}>
            <Statistic
              title="Khách hàng"
              value={customerName}
              valueStyle={{ fontSize: 14 }}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Statistic
              title="Cấp mủ"
              value={gradeLabel}
              valueStyle={{ fontSize: 14, color: '#1890ff' }}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Statistic
              title="Số lượng"
              value={order.quantity_tons}
              suffix="tấn"
              valueStyle={{ fontSize: 14 }}
            />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic
              title="Tổng bành cần"
              value={order.total_bales || 0}
              suffix="bành"
              valueStyle={{ fontSize: 14, color: '#1B4D3E' }}
            />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic
              title="KL bành"
              value={order.bale_weight_kg}
              suffix="kg"
              valueStyle={{ fontSize: 14 }}
            />
          </Col>
        </Row>
      </Card>

      {/* Container summary stats */}
      {summary && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={12} sm={4}>
              <Statistic
                title="Tổng container"
                value={summary.total_containers}
                valueStyle={{ color: '#1B4D3E' }}
              />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic
                title="Đã đóng"
                value={summary.packed}
                suffix={`/ ${summary.total_containers}`}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic
                title="Đã seal"
                value={summary.sealed}
                suffix={`/ ${summary.total_containers}`}
                valueStyle={{ color: '#1890ff' }}
              />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic
                title="Tổng bành"
                value={summary.total_bales}
                suffix={`/ ${order.total_bales || '?'}`}
                valueStyle={{
                  color: summary.total_bales >= (order.total_bales || 0)
                    ? '#52c41a'
                    : '#fa8c16',
                }}
              />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic
                title="Tổng KL"
                value={summary.total_weight_kg}
                suffix="kg"
                valueStyle={{ color: '#1B4D3E' }}
                formatter={(v) => formatNumber(Number(v))}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* Actions bar */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleAutoCreateContainers}
            loading={actionLoading}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            disabled={containers.length > 0}
          >
            Tạo container tự động
          </Button>
          <Button
            icon={<InboxOutlined />}
            onClick={handleAutoAssignBales}
            loading={actionLoading}
            disabled={containers.length === 0}
            style={{ color: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Phân bổ bành tự động
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => setAddContainerOpen(true)}
          >
            Thêm container
          </Button>
          <Button
            icon={<AppstoreAddOutlined />}
            onClick={() => {
              createLotForm.setFieldsValue({
                lots: [{ lot_no: 1, count: order.container_count || undefined, bales: order.bales_per_container || undefined, deadline: undefined }],
              })
              setCreateLotOpen(true)
            }}
            style={{ color: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Tạo theo lô
          </Button>
        </Space>
      </Card>

      {/* Theo dõi lô — giai đoạn từng lô */}
      {containers.length > 0 && lotTrackRows.length > 0 && (
        <Card
          size="small"
          title={<span>📋 Theo dõi lô — đến đâu rồi?</span>}
          style={{ marginBottom: 16 }}
        >
          <Table
            dataSource={lotTrackRows}
            columns={lotTrackColumns}
            rowKey="key"
            size="small"
            pagination={false}
            bordered
          />
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            <b>Trạng thái lô</b> = giai đoạn thấp nhất trong lô (còn 1 cont đang sản xuất → cả lô tính là "đang sản xuất"). Giai đoạn: 🏭 SX → 📦 Đóng gói → ✅ Sẵn sàng → 🚚 Điều động → 🟢 Đã giao.
          </Text>
        </Card>
      )}

      {/* Chia lô giao hàng */}
      {containers.length > 0 && (
        <Card
          size="small"
          title={<span><InboxOutlined style={{ marginRight: 6 }} />Chia lô giao hàng</span>}
          style={{ marginBottom: 16 }}
        >
          <Space size={[8, 8]} wrap style={{ marginBottom: 12 }}>
            <Text strong>📦 Tiến độ:</Text>
            {lotsTotal > 0 && <Tag color="green" style={{ fontWeight: 600 }}>🟢 Đã giao {lotsDelivered}/{lotsTotal} lô</Tag>}
            <Tag color="green">✅ {deliveredCount}/{containers.length} cont đã giao</Tag>
            <Tag color="orange">🚚 Đang điều động {dispatchingCount}</Tag>
            <Tag>Chưa giao {containers.length - deliveredCount - dispatchingCount}</Tag>
            {lotNumbers.length > 0 && <span style={{ borderLeft: '1px solid #d9d9d9', height: 18 }} />}
            {lotNumbers.map((lot) => {
              const ls = containers.filter((c) => c.lot_no === lot)
              const done = ls.filter((c) => deliveryMap[c.id] === 'delivered').length
              const dl = ls.find((c) => c.lot_deadline)?.lot_deadline
              return (
                <Tag key={lot} color={done === ls.length ? 'green' : 'blue'}>
                  Lô {lot}: {done}/{ls.length}{dl ? ` · hạn ${dayjs(dl).format('DD/MM/YYYY')}` : ''}
                </Tag>
              )
            })}
          </Space>

          {/* Cách A — gán lô cho nhiều cont đã chọn */}
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="primary" size="small" icon={<TagsOutlined />}
              disabled={lotSelectedKeys.length === 0}
              onClick={() => { bulkLotForm.resetFields(); setBulkLotOpen(true) }}
              style={{ background: lotSelectedKeys.length ? '#1B4D3E' : undefined, borderColor: lotSelectedKeys.length ? '#1B4D3E' : undefined }}
            >
              Gán Lô cho {lotSelectedKeys.length || ''} cont đã chọn
            </Button>
            {lotSelectedKeys.length > 0 && (
              <Button size="small" type="link" onClick={() => setLotSelectedKeys([])}>Bỏ chọn</Button>
            )}
          </div>

          <Table
            dataSource={containers}
            columns={lotColumns}
            rowKey="id"
            size="small"
            pagination={false}
            bordered
            scroll={{ x: 980 }}
            rowSelection={{ selectedRowKeys: lotSelectedKeys, onChange: (keys) => setLotSelectedKeys(keys as string[]) }}
          />
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            <b>Sửa</b>: gõ thẳng Số container / Seal / Bành / KL / Lô / Hạn vào ô (tự lưu khi rời ô). <b>Xóa</b>: nút 🗑 cuối dòng (chỉ cont đang lên kế hoạch; cont đã seal/giao thì <i>khoá</i>). Tích nhiều dòng → <b>Gán Lô</b> 1 lần. <b>Không cần số cont/seal để chia lô</b> — điền sau khi có booking. Cột Giao hàng tự cập nhật khi điều động + cân.
          </Text>
        </Card>
      )}

      {/* Container list */}
      {containers.length > 0 ? (
        <Collapse
          items={containerPanels}
          defaultActiveKey={containers.map((c) => c.id)}
          style={{ marginBottom: 24 }}
        />
      ) : (
        <Card>
          <Empty
            description="Chưa có container nào"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleAutoCreateContainers}
              loading={actionLoading}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Tạo container tự động
            </Button>
          </Empty>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODALS                                                    */}
      {/* ══════════════════════════════════════════════════════════ */}

      {/* Add container modal */}
      <Modal
        title="Thêm Container"
        open={addContainerOpen}
        onOk={handleAddContainer}
        onCancel={() => {
          setAddContainerOpen(false)
          addContainerForm.resetFields()
        }}
        okText="Thêm"
        cancelText="Hủy"
      >
        <Form form={addContainerForm} layout="vertical">
          <Form.Item label="Container No." name="container_no">
            <Input placeholder="Vd: MRKU1234567" />
          </Form.Item>
          <Form.Item
            label="Loại container"
            name="container_type"
            initialValue={order.container_type || '20ft'}
          >
            <Select
              options={Object.entries(CONTAINER_TYPE_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Số bành" name="bale_count">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="KL net (kg)" name="net_weight_kg">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Ghi chú" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Seal container modal */}
      <Modal
        title="Niêm phong Container"
        open={sealModalOpen}
        onOk={handleSealContainer}
        onCancel={() => {
          setSealModalOpen(false)
          setSealContainerId(null)
          sealForm.resetFields()
        }}
        okText="Niêm phong"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <Form form={sealForm} layout="vertical">
          <Form.Item
            label="Số Seal"
            name="seal_no"
            rules={[{ required: true, message: 'Vui lòng nhập số seal' }]}
          >
            <Input placeholder="Vd: SEAL123456" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add bales modal */}
      <Modal
        title="Thêm bành vào Container"
        open={addBalesModalOpen}
        onOk={handleAddBales}
        onCancel={() => {
          setAddBalesModalOpen(false)
          setAddBalesContainerId(null)
          addBalesForm.resetFields()
        }}
        okText="Thêm bành"
        cancelText="Hủy"
        width={600}
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <Form form={addBalesForm} layout="vertical">
          <Form.Item
            label="Lô hàng"
            name="batch_id"
            rules={[{ required: true, message: 'Vui lòng chọn lô hàng' }]}
          >
            <Select
              placeholder="Chọn lô hàng..."
              options={batchSelectOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="Bành từ"
                name="bale_from"
                rules={[{ required: true, message: 'Nhập số' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Bành đến"
                name="bale_to"
                rules={[{ required: true, message: 'Nhập số' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Số bành"
                name="bale_count"
                rules={[{ required: true, message: 'Nhập số' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Cách A — Gán Lô cho nhiều container đã chọn */}
      <Modal
        title={<span><TagsOutlined style={{ marginRight: 6 }} />Gán Lô cho {lotSelectedKeys.length} container</span>}
        open={bulkLotOpen}
        onOk={handleBulkSetLot}
        onCancel={() => { setBulkLotOpen(false); bulkLotForm.resetFields() }}
        okText="Áp dụng"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <Form form={bulkLotForm} layout="vertical">
          <Form.Item label="Số Lô" name="lot_no" rules={[{ required: true, message: 'Nhập số lô' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="Vd: 2" />
          </Form.Item>
          <Form.Item label="Hạn giao (tuỳ chọn — bỏ trống thì không đổi)" name="lot_deadline">
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Áp Lô (và hạn) cho <b>{lotSelectedKeys.length}</b> container đang chọn.
          </Text>
        </Form>
      </Modal>

      {/* Cách B — Tạo container placeholder theo lô (chưa cần số cont/seal) */}
      <Modal
        title={<span><AppstoreAddOutlined style={{ marginRight: 6 }} />Tạo container theo lô</span>}
        open={createLotOpen}
        onOk={handleCreateByLot}
        onCancel={() => { setCreateLotOpen(false); createLotForm.resetFields() }}
        okText="Tạo"
        cancelText="Hủy"
        width={680}
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <Form form={createLotForm} layout="vertical">
          <Form.List name="lots">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, idx) => (
                  <Row gutter={8} key={field.key} align="middle">
                    <Col span={4}>
                      <Form.Item label={idx === 0 ? 'Lô' : undefined} name={[field.name, 'lot_no']} rules={[{ required: true, message: '!' }]}>
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label={idx === 0 ? 'Số container' : undefined} name={[field.name, 'count']} rules={[{ required: true, message: 'Nhập số' }]}>
                        <InputNumber min={1} style={{ width: '100%' }} placeholder="vd 5" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label={idx === 0 ? 'Số bành/cont' : undefined} name={[field.name, 'bales']}>
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="vd 576" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label={idx === 0 ? 'Hạn giao' : undefined} name={[field.name, 'deadline']}>
                        <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={2} style={{ paddingTop: idx === 0 ? 30 : 0 }}>
                      {fields.length > 1 && (
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                      )}
                    </Col>
                  </Row>
                ))}
                <Button
                  type="dashed" block icon={<PlusOutlined />}
                  onClick={() => add({ lot_no: fields.length + 1, count: undefined, bales: order?.bales_per_container || undefined, deadline: undefined })}
                >
                  Thêm lô
                </Button>
              </>
            )}
          </Form.List>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
            Mỗi lô sinh ra <b>N container rỗng</b> (chưa số cont/seal) đã gán sẵn <b>Lô + Hạn giao</b>. Số cont/seal điền sau khi có booking hãng tàu.
          </Text>
        </Form>
      </Modal>
    </div>
  )
}

export default ContainerPackingPage
