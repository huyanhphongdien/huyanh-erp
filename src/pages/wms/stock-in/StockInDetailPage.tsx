// ============================================================================
// STOCK IN DETAIL PAGE — Ant Design + Rubber Info
// File: src/pages/wms/stock-in/StockInDetailPage.tsx
// Rewrite: Tailwind -> Ant Design v6, them rubber supplier/grade/dry weight
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  Timeline,
  Spin,
  Empty,
  Alert,
  Divider,
} from 'antd'
import {
  ArrowLeftOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  InboxOutlined,
  FileTextOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import GradeBadge from '../../../components/wms/GradeBadge'
import { QCBadge } from '../../../components/wms/QCInputForm'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface OrderDetail {
  id: string
  material_id: string
  material_name: string
  material_sku: string
  batch_id: string
  batch_no: string
  quantity: number
  weight: number | null
  unit: string
  location_code: string | null
  drc_value: number | null
  qc_status: string
  rubber_grade: string | null
  dry_weight: number | null
}

interface DealInfo {
  id: string
  deal_number: string
  partner_name?: string
  product_name?: string
  quantity_kg?: number
  unit_price?: number
}

interface OrderData {
  id: string
  code: string
  type: string
  warehouse_name: string
  warehouse_code: string
  source_type: string
  status: 'draft' | 'confirmed' | 'cancelled'
  notes: string | null
  total_quantity: number | null
  total_weight: number | null
  created_by: string | null
  created_by_name: string
  confirmed_by: string | null
  confirmed_by_name: string | null
  created_at: string
  confirmed_at: string | null
  details: OrderDetail[]
  deal: DealInfo | null
  // Rubber
  supplier_name: string | null
  supplier_region: string | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE_LABELS: Record<string, string> = {
  production: 'Sản xuất',
  purchase: 'Mua hàng',
  blend: 'Phối trộn',
  transfer: 'Chuyển kho',
  adjust: 'Điều chỉnh',
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Nháp' },
  confirmed: { color: 'success', label: 'Đã nhập kho' },
  cancelled: { color: 'error', label: 'Đã hủy' },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function getEmployeeName(empId: string | null): Promise<string> {
  if (!empId) return '—'
  const { data } = await supabase.from('employees').select('full_name').eq('id', empId).maybeSingle()
  if (data?.full_name) return data.full_name
  const { data: d2 } = await supabase.from('employees').select('full_name').eq('user_id', empId).maybeSingle()
  return d2?.full_name || '—'
}

// ============================================================================
// COMPONENT
// ============================================================================

// Accept optional id prop cho tab mode — fallback useParams cho direct URL
interface StockInDetailPageProps {
  id?: string
}

const StockInDetailPage = ({ id: propId }: StockInDetailPageProps = {}) => {
  const { id: paramId } = useParams<{ id: string }>()
  const id = propId || paramId
  const navigate = useNavigate()

  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchErr } = await supabase
          .from('stock_in_orders')
          .select(`
            id, code, type, source_type, status, notes,
            total_quantity, total_weight, created_by, confirmed_by, confirmed_at, created_at,
            warehouse:warehouses!warehouse_id(name, code),
            deal:b2b_deals!deal_id(id, deal_number, product_name, quantity_kg, unit_price),
            details:stock_in_details(
              id, material_id, quantity, weight, unit, notes,
              batch:stock_batches!batch_id(
                id, batch_no, initial_drc, latest_drc, qc_status, rubber_grade, dry_weight
              ),
              material:materials!material_id(id, sku, name),
              location:warehouse_locations!location_id(id, code)
            )
          `)
          .eq('id', id)
          .single()

        if (fetchErr) throw fetchErr

        const raw = data as any
        const creatorName = await getEmployeeName(raw.created_by)
        const confirmerName = raw.confirmed_by ? await getEmployeeName(raw.confirmed_by) : null

        // Get supplier info from first batch
        let supplierName: string | null = null
        let supplierRegion: string | null = null
        if (raw.details?.length > 0) {
          const firstBatchId = raw.details[0]?.batch?.id
          if (firstBatchId) {
            const { data: batchData } = await supabase
              .from('stock_batches')
              .select('supplier_name, supplier_region')
              .eq('id', firstBatchId)
              .maybeSingle()
            supplierName = batchData?.supplier_name || null
            supplierRegion = batchData?.supplier_region || null
          }
        }

        setOrder({
          id: raw.id,
          code: raw.code,
          type: raw.type,
          warehouse_name: raw.warehouse?.name || '—',
          warehouse_code: raw.warehouse?.code || '',
          source_type: raw.source_type,
          status: raw.status,
          notes: raw.notes,
          total_quantity: raw.total_quantity,
          total_weight: raw.total_weight,
          created_by: raw.created_by,
          created_by_name: creatorName,
          confirmed_by: raw.confirmed_by,
          confirmed_by_name: confirmerName,
          created_at: raw.created_at,
          confirmed_at: raw.confirmed_at,
          deal: raw.deal ? {
            id: raw.deal.id,
            deal_number: raw.deal.deal_number,
            product_name: raw.deal.product_name,
            quantity_kg: raw.deal.quantity_kg,
            unit_price: raw.deal.unit_price,
          } : null,
          supplier_name: supplierName,
          supplier_region: supplierRegion,
          details: (raw.details || []).map((d: any) => ({
            id: d.id,
            material_id: d.material_id,
            material_name: d.material?.name || '—',
            material_sku: d.material?.sku || '',
            batch_id: d.batch?.id || '',
            batch_no: d.batch?.batch_no || '',
            quantity: d.quantity,
            weight: d.weight,
            unit: d.unit || 'kg',
            location_code: d.location?.code || null,
            drc_value: d.batch?.latest_drc || d.batch?.initial_drc || null,
            qc_status: d.batch?.qc_status || 'pending',
            rubber_grade: d.batch?.rubber_grade || null,
            dry_weight: d.batch?.dry_weight || null,
          })),
        })
      } catch (err: any) {
        setError(err.message || 'Không thể tải du lieu')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>
  }

  if (!order) {
    return (
      <div style={{ padding: 24 }}>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        <Empty description="Không tìm thấy phiếu nhập kho" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/wms/stock-in')}>Quay lại</Button>
        </div>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
  const totalDryWeight = order.details.reduce((s, d) => s + (d.dry_weight || 0), 0)

  // QC summary
  const qcCounts = { passed: 0, warning: 0, failed: 0, pending: 0 }
  order.details.forEach(d => {
    const s = d.qc_status as keyof typeof qcCounts
    if (s in qcCounts) qcCounts[s]++
  })

  // Supplier DRC discrepancy (check first batch)
  // This would need supplier_reported_drc from batch — future enhancement

  // Detail table columns
  const detailColumns = [
    {
      title: 'Lo',
      dataIndex: 'batch_no',
      key: 'batch_no',
      render: (v: string) => <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Vật liệu',
      key: 'material',
      render: (_: any, r: OrderDetail) => (
        <div>
          <Text style={{ fontSize: 13 }}>{r.material_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{r.material_sku}</Text>
        </div>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'rubber_grade',
      render: (v: string | null) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'SL',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right' as const,
      render: (v: number, r: OrderDetail) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {v.toLocaleString()} {r.unit}
        </Text>
      ),
    },
    {
      title: 'KL (kg)',
      dataIndex: 'weight',
      key: 'weight',
      align: 'right' as const,
      render: (v: number | null) => v ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v.toLocaleString()}</Text>
      ) : '—',
    },
    {
      title: 'DRC',
      dataIndex: 'drc_value',
      key: 'drc_value',
      align: 'right' as const,
      render: (v: number | null) => v ? (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{v}%</Text>
      ) : '—',
    },
    {
      title: 'Kho (kg)',
      dataIndex: 'dry_weight',
      key: 'dry_weight',
      align: 'right' as const,
      render: (v: number | null) => v ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#2D8B6E' }}>{v.toLocaleString()}</Text>
      ) : '—',
    },
    {
      title: 'Vị trí',
      dataIndex: 'location_code',
      key: 'location_code',
      render: (v: string | null) => v ? <Tag style={{ margin: 0 }}><EnvironmentOutlined /> {v}</Tag> : '—',
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc_status',
      render: (v: string) => <QCBadge result={v} size="sm" />,
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/stock-in')}>
          Quay lại
        </Button>
      </Space>

      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space align="center" size="middle">
            <Title level={4} style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
              {order.code}
            </Title>
            <Tag color={statusCfg.color} style={{ fontSize: 14 }}>{statusCfg.label}</Tag>
          </Space>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {order.warehouse_name} · {SOURCE_LABELS[order.source_type] || order.source_type} · {formatDateTime(order.created_at)}
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<PrinterOutlined />}>In phiếu</Button>
          </Space>
        </Col>
      </Row>

      {/* Info */}
      <Card style={{ marginBottom: 16, borderRadius: 12 }}>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" bordered>
          <Descriptions.Item label="Kho">{order.warehouse_name}</Descriptions.Item>
          <Descriptions.Item label="Nguồn nhập">
            <Tag>{SOURCE_LABELS[order.source_type] || order.source_type}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Ngày tạo">{formatDateTime(order.created_at)}</Descriptions.Item>
          <Descriptions.Item label="Người tạo">{order.created_by_name}</Descriptions.Item>
          {order.confirmed_by_name && (
            <Descriptions.Item label="Người xác nhận">{order.confirmed_by_name}</Descriptions.Item>
          )}
          {order.confirmed_at && (
            <Descriptions.Item label="Ngày xác nhận">{formatDateTime(order.confirmed_at)}</Descriptions.Item>
          )}
          {order.supplier_name && (
            <Descriptions.Item label="Đại lý">{order.supplier_name}</Descriptions.Item>
          )}
          {order.supplier_region && (
            <Descriptions.Item label="Vùng">{order.supplier_region}</Descriptions.Item>
          )}
          {order.notes && (
            <Descriptions.Item label="Ghi chú" span={3}>{order.notes}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Deal card */}
      {order.deal && (
        <Card
          size="small"
          style={{ marginBottom: 16, borderRadius: 12, borderLeft: '3px solid #1890ff' }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Deal: {order.deal.deal_number}
                </Text>
                {order.deal.product_name && <Tag>{order.deal.product_name}</Tag>}
              </Space>
              {order.deal.quantity_kg && (
                <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  SL Deal: {(order.deal.quantity_kg / 1000).toFixed(1)} T · Don gia: {order.deal.unit_price?.toLocaleString()} d/kg
                </Text>
              )}
            </Col>
            <Col>
              <Button type="link" onClick={() => navigate(`/b2b/deals/${order.deal!.id}`)}>
                Xem Deal →
              </Button>
            </Col>
          </Row>
        </Card>
      )}

      {/* Summary cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Tổng SL" value={order.total_quantity || 0} suffix="kg"
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Trọng lượng" value={((order.total_weight || 0) / 1000).toFixed(1)} suffix="T"
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="TL kho (dry)" value={(totalDryWeight / 1000).toFixed(1)} suffix="T"
              valueStyle={{ fontSize: 18, color: '#2D8B6E', fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Số lô" value={order.details.length} suffix="lo"
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
      </Row>

      {/* QC Summary alert */}
      {(qcCounts.warning > 0 || qcCounts.failed > 0 || qcCounts.pending > 0) && (
        <Alert
          type={qcCounts.failed > 0 ? 'error' : qcCounts.warning > 0 ? 'warning' : 'info'}
          message={
            <Space>
              <span>QC:</span>
              {qcCounts.passed > 0 && <Tag color="success">{qcCounts.passed} dat</Tag>}
              {qcCounts.warning > 0 && <Tag color="warning">{qcCounts.warning} canh bao</Tag>}
              {qcCounts.failed > 0 && <Tag color="error">{qcCounts.failed} khong dat</Tag>}
              {qcCounts.pending > 0 && <Tag>{qcCounts.pending} cho</Tag>}
            </Space>
          }
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      {/* Detail table */}
      <Card title={<Space><FileTextOutlined /> Chi tiết lô hàng ({order.details.length})</Space>} style={{ marginBottom: 16, borderRadius: 12 }}>
        <Table
          dataSource={order.details}
          columns={detailColumns}
          rowKey="id"
          size="small"
          pagination={false}
        />
      </Card>

      {/* Timeline */}
      <Card title="Lịch sử" style={{ borderRadius: 12 }}>
        <Timeline
          items={[
            {
              color: 'green',
              children: (
                <div>
                  <Text strong>Tạo phiếu nhap</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDateTime(order.created_at)} — {order.created_by_name}
                  </Text>
                </div>
              ),
            },
            ...(order.status === 'confirmed' && order.confirmed_at ? [{
              color: 'blue' as const,
              children: (
                <div>
                  <Text strong>Xác nhận nhập kho</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDateTime(order.confirmed_at)} — {order.confirmed_by_name || '—'}
                  </Text>
                </div>
              ),
            }] : []),
            ...(order.status === 'cancelled' ? [{
              color: 'red' as const,
              children: <Text strong>Đã hủy phiếu</Text>,
            }] : []),
            ...(order.status === 'draft' ? [{
              color: 'gray' as const,
              children: (
                <div>
                  <Text type="secondary">Cho xac nhan...</Text>
                </div>
              ),
            }] : []),
          ]}
        />
      </Card>
    </div>
  )
}

export default StockInDetailPage
