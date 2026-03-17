// ============================================================================
// STOCK OUT DETAIL PAGE — Ant Design
// File: src/pages/wms/stock-out/StockOutDetailPage.tsx
// Rewrite: Tailwind -> Ant Design v6, add rubber fields (GradeBadge, DRC, dry weight)
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Descriptions,
  Table,
  Timeline,
  Progress,
  Row,
  Col,
  Statistic,
  Result,
  Collapse,
  Alert,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  UserOutlined,
  ExportOutlined,
  PrinterOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import GradeBadge from '../../../components/wms/GradeBadge'
import { QCBadge } from '../../../components/wms/QCInputForm'
import type { RubberGrade } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface OutDetail {
  id: string
  material_id: string
  material_name: string
  material_sku: string
  material_unit: string
  batch_id: string
  batch_no: string
  quantity: number
  weight: number | null
  location_code: string | null
  drc_value: number | null
  dry_weight: number | null
  qc_status: string
  picking_status: string
  picked_at: string | null
  picked_by_name: string | null
  rubber_grade: RubberGrade | null
}

interface OutOrderData {
  id: string
  code: string
  type: string
  warehouse_name: string
  warehouse_code: string
  reason: string
  customer_name: string | null
  customer_order_ref: string | null
  status: string
  notes: string | null
  total_quantity: number | null
  total_weight: number | null
  created_by_name: string
  confirmed_by_name: string | null
  created_at: string
  confirmed_at: string | null
  details: OutDetail[]
  svr_grade: RubberGrade | null
  required_drc_min: number | null
  required_drc_max: number | null
  container_type: string | null
}

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Nháp' },
  picking: { color: 'processing', label: 'Đang lấy hàng' },
  picked: { color: 'warning', label: 'Đã lấy hàng' },
  confirmed: { color: 'success', label: 'Đã xuất kho' },
  cancelled: { color: 'error', label: 'Đã hủy' },
}

const REASON_LABELS: Record<string, string> = {
  sale: 'Bán hàng', production: 'Sản xuất', transfer: 'Chuyển kho',
  blend: 'Phối trộn', adjust: 'Điều chỉnh', return: 'Trả hàng',
}

const QC_TAG_CONFIG: Record<string, { color: string; label: string }> = {
  passed: { color: 'success', label: 'Đạt' },
  warning: { color: 'warning', label: 'Cảnh báo' },
  failed: { color: 'error', label: 'Không đạt' },
  needs_blend: { color: 'purple', label: 'Cần phối trộn' },
  pending: { color: 'default', label: 'Chờ QC' },
}

const PICKING_TAG_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: 'Chờ lấy' },
  picking: { color: 'processing', label: 'Đang lấy' },
  picked: { color: 'success', label: 'Đã lấy' },
  skipped: { color: 'orange', label: 'Bỏ qua' },
}

const monoStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDT(dateStr: string): string {
  return `${fmt(dateStr)} ${new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
}
function fmtN(n: number): string { return n.toLocaleString('vi-VN') }

async function getEmpName(empId: string | null): Promise<string> {
  if (!empId) return '—'
  const { data } = await supabase.from('employees').select('full_name').eq('id', empId).maybeSingle()
  if (data) return data.full_name
  const { data: d2 } = await supabase.from('employees').select('full_name').eq('user_id', empId).maybeSingle()
  return d2?.full_name || empId.slice(0, 8) + '...'
}

// ============================================================================
// DRC DISPLAY
// ============================================================================
function DRCDisplay({ value, status }: { value: number; status: string }) {
  const color = status === 'passed' ? '#16A34A' : status === 'warning' ? '#F59E0B' : '#DC2626'
  const pct = Math.max(0, Math.min(100, ((value - 55) / 10) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Text strong style={{ ...monoStyle, color, fontSize: 14 }}>{value.toFixed(1)}%</Text>
      <Progress
        percent={pct}
        size="small"
        showInfo={false}
        strokeColor={color}
        style={{ width: 60, margin: 0 }}
      />
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================
export default function StockOutDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OutOrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      try {
        const { data: raw, error: err } = await supabase
          .from('stock_out_orders')
          .select(`
            *,
            warehouse:warehouses(id, code, name),
            details:stock_out_details(
              id, material_id, batch_id, quantity, weight, location_id,
              picking_status, picked_at, picked_by, notes,
              material:materials(id, sku, name, unit),
              batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status, rubber_grade, dry_weight),
              location:warehouse_locations(id, code)
            )
          `)
          .eq('id', id)
          .single()

        if (err) throw err

        // Resolve names
        const [createdName, confirmedName] = await Promise.all([
          getEmpName(raw.created_by),
          getEmpName(raw.confirmed_by),
        ])

        // Resolve picked_by names for each detail
        const pickerMap = new Map<string, string>()
        for (const d of (raw.details || []) as any[]) {
          const pid = d.picked_by as string | null
          if (pid && !pickerMap.has(pid)) {
            pickerMap.set(pid, await getEmpName(pid))
          }
        }

        const details: OutDetail[] = (raw.details || []).map((d: any) => ({
          id: d.id,
          material_id: d.material_id,
          material_name: d.material?.name || '—',
          material_sku: d.material?.sku || '—',
          material_unit: d.material?.unit || 'banh',
          batch_id: d.batch_id,
          batch_no: d.batch?.batch_no || '—',
          quantity: d.quantity,
          weight: d.weight,
          location_code: d.location?.code || null,
          drc_value: d.batch?.latest_drc ?? d.batch?.initial_drc ?? null,
          dry_weight: d.batch?.dry_weight ?? null,
          qc_status: d.batch?.qc_status || 'pending',
          picking_status: d.picking_status || 'pending',
          picked_at: d.picked_at,
          picked_by_name: d.picked_by ? (pickerMap.get(d.picked_by) || null) : null,
          rubber_grade: d.batch?.rubber_grade || null,
        }))

        setOrder({
          id: raw.id, code: raw.code, type: raw.type,
          warehouse_name: raw.warehouse?.name || '—',
          warehouse_code: raw.warehouse?.code || '—',
          reason: raw.reason || 'sale',
          customer_name: raw.customer_name, customer_order_ref: raw.customer_order_ref,
          status: raw.status, notes: raw.notes,
          total_quantity: raw.total_quantity, total_weight: raw.total_weight,
          created_by_name: createdName, confirmed_by_name: confirmedName,
          created_at: raw.created_at, confirmed_at: raw.confirmed_at,
          details,
          svr_grade: raw.svr_grade || null,
          required_drc_min: raw.required_drc_min ?? null,
          required_drc_max: raw.required_drc_max ?? null,
          container_type: raw.container_type || null,
        })
      } catch (e: any) {
        console.error('Loi load phiếu xuất:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const statusCfg = STATUS_CONFIG[order?.status || 'draft'] || STATUS_CONFIG.draft

  // Timeline events
  const timelineItems = useMemo(() => {
    if (!order) return []

    const items: any[] = []

    // Created
    items.push({
      color: order.status !== 'draft' ? '#1B4D3E' : '#E8A838',
      children: (
        <div>
          <Text strong>Tạo phiếu nhap</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{fmtDT(order.created_at)}</Text></div>
          <div><Text type="secondary" style={{ fontSize: 12 }}><UserOutlined /> {order.created_by_name}</Text></div>
        </div>
      ),
    })

    // Picking
    const isPicked = ['picked', 'confirmed'].includes(order.status)
    items.push({
      color: isPicked ? '#1B4D3E' : order.status === 'picking' ? '#E8A838' : '#d9d9d9',
      children: (
        <Text strong style={{ color: isPicked || order.status === 'picking' ? undefined : '#bfbfbf' }}>
          Lay hang hoan tat
        </Text>
      ),
    })

    // Confirmed / Cancelled
    if (order.status === 'confirmed') {
      items.push({
        color: '#1B4D3E',
        dot: <CheckCircleOutlined style={{ color: '#1B4D3E' }} />,
        children: (
          <div>
            <Text strong>Xác nhận xuất kho</Text>
            {order.confirmed_at && (
              <div><Text type="secondary" style={{ fontSize: 12 }}>{fmtDT(order.confirmed_at)}</Text></div>
            )}
            {order.confirmed_by_name && (
              <div><Text type="secondary" style={{ fontSize: 12 }}><UserOutlined /> {order.confirmed_by_name}</Text></div>
            )}
          </div>
        ),
      })
    } else if (order.status === 'cancelled') {
      items.push({
        color: 'red',
        dot: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
        children: <Text strong style={{ color: '#ff4d4f' }}>Đã hủy</Text>,
      })
    } else {
      items.push({
        color: '#d9d9d9',
        dot: <ClockCircleOutlined style={{ color: '#d9d9d9' }} />,
        children: <Text style={{ color: '#bfbfbf' }}>Cho xac nhan</Text>,
      })
    }

    return items
  }, [order])

  const pickingSummary = useMemo(() => {
    if (!order) return { picked: 0, pending: 0, skipped: 0, total: 0 }
    return {
      picked: order.details.filter(d => d.picking_status === 'picked').length,
      pending: order.details.filter(d => d.picking_status === 'pending' || d.picking_status === 'picking').length,
      skipped: order.details.filter(d => d.picking_status === 'skipped').length,
      total: order.details.length,
    }
  }, [order])

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Spin size="large" tip="Đang tải phiếu xuất..." />
      </div>
    )
  }

  // Error state
  if (error || !order) {
    return (
      <Result
        status="error"
        title={error || 'Không tìm thấy phieu'}
        extra={
          <Button type="primary" onClick={() => navigate('/wms/stock-out')}
            style={{ backgroundColor: '#2D8B6E', borderColor: '#2D8B6E' }}>
            Quay lại
          </Button>
        }
      />
    )
  }

  // Detail table columns
  const detailColumns: ColumnsType<OutDetail> = [
    {
      title: '#',
      key: 'index',
      width: 50,
      render: (_: any, __: any, idx: number) => idx + 1,
    },
    {
      title: 'Mã lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      width: 140,
      render: (batch_no: string) => (
        <Text strong style={monoStyle}>{batch_no}</Text>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'rubber_grade',
      width: 90,
      render: (grade: RubberGrade | null) => <GradeBadge grade={grade} size="small" />,
    },
    {
      title: 'Sản phẩm',
      key: 'material',
      width: 200,
      render: (_: any, record: OutDetail) => (
        <div>
          <Text style={{ fontSize: 12, ...monoStyle }}>{record.material_sku}</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{record.material_name}</Text></div>
        </div>
      ),
    },
    {
      title: 'Vị trí',
      dataIndex: 'location_code',
      key: 'location_code',
      width: 100,
      render: (loc: string | null) => loc || '—',
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc_status',
      width: 110,
      render: (status: string) => {
        const cfg = QC_TAG_CONFIG[status] || QC_TAG_CONFIG.pending
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'DRC',
      dataIndex: 'drc_value',
      key: 'drc_value',
      width: 140,
      render: (drc: number | null, record: OutDetail) =>
        drc != null ? <DRCDisplay value={drc} status={record.qc_status} /> : '—',
    },
    {
      title: 'KL kho (kg)',
      dataIndex: 'dry_weight',
      key: 'dry_weight',
      width: 100,
      align: 'right',
      render: (dw: number | null) =>
        dw != null ? <Text style={monoStyle}>{fmtN(dw)}</Text> : '—',
    },
    {
      title: 'Số lượng',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (qty: number, record: OutDetail) => (
        <div>
          <Text strong style={{ ...monoStyle, color: '#1B4D3E' }}>{fmtN(qty)}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{record.material_unit}</Text></div>
        </div>
      ),
    },
    {
      title: 'KL (kg)',
      dataIndex: 'weight',
      key: 'weight',
      width: 90,
      align: 'right',
      render: (w: number | null) => w ? <Text style={monoStyle}>{fmtN(w)}</Text> : '—',
    },
    {
      title: 'Picking',
      dataIndex: 'picking_status',
      key: 'picking_status',
      width: 100,
      render: (status: string) => {
        const cfg = PICKING_TAG_CONFIG[status] || PICKING_TAG_CONFIG.pending
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Người lấy',
      dataIndex: 'picked_by_name',
      key: 'picked_by_name',
      width: 120,
      render: (name: string | null) => name || '—',
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/stock-out')} />
          <div>
            <Title level={4} style={{ margin: 0, ...monoStyle, color: '#1B4D3E' }}>
              {order.code}
            </Title>
            <Text type="secondary">Chi tiết phiếu xuất kho</Text>
          </div>
          <Tag color={statusCfg.color} style={{ fontSize: 14, padding: '2px 12px' }}>
            {statusCfg.label}
          </Tag>
        </Space>
        <Space>
          {order.status === 'picking' && (
            <Button
              type="primary"
              onClick={() => navigate(`/wms/stock-out/${order.id}/picking`)}
              style={{ backgroundColor: '#E8A838', borderColor: '#E8A838' }}
            >
              Picking List
            </Button>
          )}
          <Button icon={<PrinterOutlined />}>In phiếu</Button>
        </Space>
      </div>

      <Row gutter={24}>
        {/* Left Column */}
        <Col xs={24} lg={16}>
          {/* Order Info */}
          <Card
            title={<><FileTextOutlined style={{ marginRight: 8 }} />Thong tin phiếu xuất</>}
            style={{ marginBottom: 24 }}
            styles={{
              header: {
                borderTop: `3px solid ${order.status === 'confirmed' ? '#1B4D3E' : order.status === 'cancelled' ? '#ff4d4f' : '#d9d9d9'}`,
              },
            }}
          >
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Kho xuất">
                <Text strong>{order.warehouse_name}</Text>
                <Text type="secondary" style={{ ...monoStyle, marginLeft: 8, fontSize: 12 }}>
                  {order.warehouse_code}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Lý do">
                {REASON_LABELS[order.reason] || order.reason}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">{fmt(order.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Người tạo">{order.created_by_name}</Descriptions.Item>
              {order.confirmed_by_name && (
                <Descriptions.Item label="Người duyệt">{order.confirmed_by_name}</Descriptions.Item>
              )}
              {order.confirmed_at && (
                <Descriptions.Item label="Ngày duyệt">{fmtDT(order.confirmed_at)}</Descriptions.Item>
              )}
              {order.customer_name && (
                <Descriptions.Item label="Khách hàng">
                  <Text strong>{order.customer_name}</Text>
                  {order.customer_order_ref && (
                    <Text type="secondary" style={{ ...monoStyle, marginLeft: 8, fontSize: 12 }}>
                      {order.customer_order_ref}
                    </Text>
                  )}
                </Descriptions.Item>
              )}
              {order.svr_grade && (
                <Descriptions.Item label="SVR Grade">
                  <GradeBadge grade={order.svr_grade} />
                </Descriptions.Item>
              )}
              {(order.required_drc_min != null || order.required_drc_max != null) && (
                <Descriptions.Item label="DRC yêu cầu">
                  <Text style={monoStyle}>
                    {order.required_drc_min != null ? `${order.required_drc_min}%` : '—'}
                    {' ~ '}
                    {order.required_drc_max != null ? `${order.required_drc_max}%` : '—'}
                  </Text>
                </Descriptions.Item>
              )}
              {order.container_type && (
                <Descriptions.Item label="Container">{order.container_type}</Descriptions.Item>
              )}
              {order.notes && (
                <Descriptions.Item label="Ghi chú" span={2}>{order.notes}</Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* Summary Stats */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col xs={8}>
              <Card size="small">
                <Statistic
                  title="Tổng SL"
                  value={order.total_quantity || 0}
                  suffix="banh"
                  valueStyle={{ ...monoStyle, color: '#1B4D3E' }}
                />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic
                  title="Tong KL"
                  value={order.total_weight || 0}
                  suffix="kg"
                  valueStyle={{ ...monoStyle, color: '#1B4D3E' }}
                  formatter={(val) => fmtN(val as number)}
                />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic
                  title="Số lô"
                  value={order.details.length}
                  suffix="lô hàng"
                  valueStyle={{ ...monoStyle, color: '#1B4D3E' }}
                />
              </Card>
            </Col>
          </Row>

          {/* Picking Progress */}
          {pickingSummary.total > 0 && (
            <Card size="small" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Text strong>Picking:</Text>
                <Progress
                  percent={Math.round(((pickingSummary.picked + pickingSummary.skipped) / pickingSummary.total) * 100)}
                  strokeColor="#1B4D3E"
                  style={{ flex: 1 }}
                />
                <Space>
                  <Tag color="success">{pickingSummary.picked} da lay</Tag>
                  {pickingSummary.pending > 0 && <Tag>{pickingSummary.pending} cho</Tag>}
                  {pickingSummary.skipped > 0 && <Tag color="orange">{pickingSummary.skipped} bo qua</Tag>}
                </Space>
              </div>
            </Card>
          )}

          {/* Detail Table */}
          <Card
            title={<><ExportOutlined style={{ marginRight: 8 }} />Chi tiết xuất kho ({order.details.length} lo)</>}
          >
            <Table<OutDetail>
              columns={detailColumns}
              dataSource={order.details}
              rowKey="id"
              pagination={false}
              scroll={{ x: 1400 }}
              size="small"
            />
          </Card>
        </Col>

        {/* Right Column — Timeline */}
        <Col xs={24} lg={8}>
          <Card title={<><ClockCircleOutlined style={{ marginRight: 8 }} />Lịch sử</>}>
            <Timeline items={timelineItems} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
