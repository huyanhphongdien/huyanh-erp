// ============================================================================
// STOCK OUT DETAIL PAGE — Ant Design
// File: src/pages/wms/stock-out/StockOutDetailPage.tsx
// Rewrite: Tailwind -> Ant Design v6, add rubber fields (GradeBadge, DRC, dry weight)
// Đợt 3 audit UI (17/11/2026): nút "In phiếu" in thật (bản A4 @media print), tải lại sau
// "Xác nhận xuất" đi đúng đường map dữ liệu, nhãn/màu trạng thái dùng chung stockOutLabels.
// ============================================================================

import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useOpenTab } from '../../../hooks/useOpenTab'
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
  Modal,
  message,
} from 'antd'
import stockOutService from '../../../services/wms/stockOutService'
import { useAuthStore } from '../../../stores/authStore'
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
import { RUBBER_GRADE_LABELS } from '../../../services/wms/wms.types'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtDate, fmtDateTime, fmtKg, fmtNum } from '../../../utils/format'
import {
  STOCK_OUT_STATUS_LABELS, STOCK_OUT_STATUS_COLORS, STOCK_OUT_REASON_LABELS,
  PICKING_STATUS_LABELS, PICKING_STATUS_COLORS,
} from './stockOutLabels'
import { BATCH_QC_STATUS_LABELS, BATCH_QC_STATUS_COLORS } from '../qc/qcLabels'
import PhieuKhoPrintPortal from '../PhieuKhoPrintPortal'

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

const REASON_LABELS = STOCK_OUT_REASON_LABELS

const monoStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

// Định dạng chung format.ts: ngày 'DD/MM/YYYY', ngày-giờ 'DD/MM HH:mm', số vi-VN
const fmt = (dateStr: string): string => fmtDate(dateStr)
const fmtDT = (dateStr: string): string => fmtDateTime(dateStr)
const fmtN = (n: number): string => fmtNum(n)

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
interface StockOutDetailPageProps {
  id?: string
}

export default function StockOutDetailPage({ id: propId }: StockOutDetailPageProps = {}) {
  const { id: paramId } = useParams()
  const id = propId || paramId
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const { user } = useAuthStore()
  const [order, setOrder] = useState<OutOrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  // Tải lại sau khi xác nhận: chạy LẠI đúng hàm load (map tên người, chi tiết lô…).
  // Trước đây ghi thẳng dòng DB thô vào state → bảng chi tiết mất mã lô/sản phẩm, kho thành "—".
  const reloadOrder = async () => { setReloadKey(k => k + 1) }

  const handleConfirm = async () => {
    if (!order) return
    Modal.confirm({
      title: 'Xác nhận xuất kho?',
      content: `Phiếu ${order.code} sẽ được xác nhận xuất, tồn kho sẽ giảm tương ứng. Hành động này KHÔNG thể hoàn tác.`,
      okText: 'Xác nhận xuất',
      cancelText: 'Huỷ',
      okButtonProps: { style: { background: '#1B4D3E', borderColor: '#1B4D3E' } },
      onOk: async () => {
        setConfirming(true)
        try {
          await stockOutService.confirmStockOut(order.id, user?.employee_id || user?.id)
          message.success(`Đã xác nhận xuất phiếu ${order.code}`)
          await reloadOrder()
        } catch (err: any) {
          message.error(dichLoiHeThong(err, 'Không thể xác nhận xuất kho'))
        } finally {
          setConfirming(false)
        }
      },
    })
  }

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      setError(null)
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
          material_unit: d.material?.unit || 'bành',
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
        console.error('Lỗi tải phiếu xuất:', e)
        setError(dichLoiHeThong(e, 'Không tải được phiếu xuất'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, reloadKey])

  const statusKey = order?.status || 'draft'
  const statusCfg = {
    color: STOCK_OUT_STATUS_COLORS[statusKey] || 'default',
    label: STOCK_OUT_STATUS_LABELS[statusKey] || statusKey,
  }

  // Timeline events
  const timelineItems = useMemo(() => {
    if (!order) return []

    const items: any[] = []

    // Created
    items.push({
      color: order.status !== 'draft' ? '#1B4D3E' : '#E8A838',
      children: (
        <div>
          <Text strong>Tạo phiếu xuất</Text>
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
          Lấy hàng hoàn tất
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
        children: <Text style={{ color: '#bfbfbf' }}>Chờ xác nhận</Text>,
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
        title={error ? 'Không tải được phiếu xuất' : 'Không tìm thấy phiếu'}
        subTitle={error || undefined}
        extra={
          <Space>
            {error && <Button onClick={() => setReloadKey(k => k + 1)}>Thử lại</Button>}
            <Button type="primary" onClick={() => navigate('/wms/stock-out')}
              style={{ backgroundColor: '#2D8B6E', borderColor: '#2D8B6E' }}>
              Quay lại
            </Button>
          </Space>
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
      render: (status: string) => (
        <Tag color={BATCH_QC_STATUS_COLORS[status] || 'default'}>{BATCH_QC_STATUS_LABELS[status] || BATCH_QC_STATUS_LABELS.pending}</Tag>
      ),
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
      // dry_weight = khối lượng KHÔ (không phải "KL kho")
      title: 'KL khô (kg)',
      dataIndex: 'dry_weight',
      key: 'dry_weight',
      width: 100,
      align: 'right',
      render: (dw: number | null) =>
        dw != null ? <Text style={monoStyle}>{fmtKg(dw)}</Text> : '—',
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
      render: (w: number | null) => w != null ? <Text style={monoStyle}>{fmtKg(w)}</Text> : '—',
    },
    {
      title: 'Lấy hàng',
      dataIndex: 'picking_status',
      key: 'picking_status',
      width: 100,
      render: (status: string) => (
        <Tag color={PICKING_STATUS_COLORS[status] || 'default'}>{PICKING_STATUS_LABELS[status] || PICKING_STATUS_LABELS.pending}</Tag>
      ),
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
    <div ref={rootRef} style={{ padding: 24 }}>
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
          {(order.status === 'draft' || order.status === 'picking') && (
            <Button
              type="primary"
              onClick={() => openTab({
                key: `picking-${order.id}`,
                title: `Lấy hàng ${order.code || order.id.slice(0, 8)}`,
                componentId: 'picking-list',
                props: { stockOutId: order.id },
                path: `/wms/stock-out/${order.id}/pick`,
              })}
              style={{ backgroundColor: '#E8A838', borderColor: '#E8A838' }}
            >
              Phiếu lấy hàng
            </Button>
          )}
          {(order.status === 'picked' || order.status === 'picking') && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleConfirm}
              loading={confirming}
              style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Xác nhận xuất
            </Button>
          )}
          {/* In thật: bản A4 ở cuối trang, chỉ hiện khi in (trước đây nút không có onClick) */}
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>In phiếu</Button>
        </Space>
      </div>

      <Row gutter={24}>
        {/* Left Column */}
        <Col xs={24} lg={16}>
          {/* Order Info */}
          <Card
            title={<><FileTextOutlined style={{ marginRight: 8 }} />Thông tin phiếu xuất</>}
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
                  suffix="bành"
                  valueStyle={{ ...monoStyle, color: '#1B4D3E' }}
                  formatter={(val) => fmtN(Number(val))}
                />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic
                  title="Tổng KL"
                  value={order.total_weight || 0}
                  suffix="kg"
                  valueStyle={{ ...monoStyle, color: '#1B4D3E' }}
                  formatter={(val) => fmtKg(Number(val))}
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
                <Text strong>Lấy hàng:</Text>
                <Progress
                  percent={Math.round(((pickingSummary.picked + pickingSummary.skipped) / pickingSummary.total) * 100)}
                  strokeColor="#1B4D3E"
                  style={{ flex: 1 }}
                />
                <Space>
                  <Tag color="green">{pickingSummary.picked} đã lấy</Tag>
                  {pickingSummary.pending > 0 && <Tag>{pickingSummary.pending} chờ lấy</Tag>}
                  {pickingSummary.skipped > 0 && <Tag color="orange">{pickingSummary.skipped} bỏ qua</Tag>}
                </Space>
              </div>
            </Card>
          )}

          {/* Detail Table */}
          <Card
            title={<><ExportOutlined style={{ marginRight: 8 }} />Chi tiết xuất kho ({order.details.length} lô)</>}
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

      {/* ===== BẢN IN A4 — portal ra <body>, chỉ hiện khi in từ CHÍNH trang này ===== */}
      <PhieuKhoPrintPortal rootRef={rootRef}><StockOutPrintSheet order={order} /></PhieuKhoPrintPortal>
    </div>
  )
}

// ============================================================================
// BẢN IN A4 — phiếu xuất kho (nội dung theo khuôn phiếu cân của WeighbridgeDetailPage — Đợt 1;
// cơ chế in ở PhieuKhoPrintPortal)
// ============================================================================

const P_TD_LABEL: CSSProperties = { border: '1px solid #D1D5DB', background: '#F9FAFB', padding: '5px 8px', fontWeight: 600, color: '#374151', width: 110 }
const P_TD_VALUE: CSSProperties = { border: '1px solid #D1D5DB', padding: '5px 8px' }
const P_TH: CSSProperties = { border: '1px solid #9CA3AF', background: '#F3F4F6', padding: '5px 6px', fontWeight: 700, fontSize: 11.5, textAlign: 'center' }
const P_TD: CSSProperties = { border: '1px solid #D1D5DB', padding: '4px 6px', fontSize: 12 }
const P_NUM: CSSProperties = { ...P_TD, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }
// Giấy lưu trữ → LUÔN in đủ năm (fmtDateTime bỏ năm khi cùng năm nay, đọc lại năm sau là mất mốc)
const fmtNgayGioIn = (v: string | Date | null | undefined): string => {
  const d = v ? dayjs(v) : null
  return d && d.isValid() ? d.format('DD/MM/YYYY HH:mm') : '—'
}

function StockOutPrintSheet({ order }: { order: OutOrderData }) {
  const totalQty = order.details.reduce((s, d) => s + (d.quantity || 0), 0)
  const totalWeight = order.details.reduce((s, d) => s + (d.weight || 0), 0)
  const totalDry = order.details.reduce((s, d) => s + (d.dry_weight || 0), 0)
  const drcReq = order.required_drc_min != null || order.required_drc_max != null
    ? `${order.required_drc_min != null ? `${order.required_drc_min}%` : '—'} ~ ${order.required_drc_max != null ? `${order.required_drc_max}%` : '—'}`
    : '—'
  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 13, color: '#111' }}>
      {/* Header công ty */}
      <div style={{ borderBottom: '2px solid #1B4D3E', paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1B4D3E' }}>CAO SU HUY ANH PHONG ĐIỀN</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế · MST: 3301549896</div>
      </div>

      {/* Tiêu đề */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>PHIẾU XUẤT KHO</div>
        <div style={{ fontSize: 13, marginTop: 2 }}>Số: <strong style={{ ...monoStyle, color: '#92400E' }}>{order.code}</strong></div>
        <div style={{ fontSize: 12, color: '#6B7280' }}>Ngày tạo: {fmtNgayGioIn(order.created_at)}</div>
        {order.status !== 'confirmed' && (
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: order.status === 'cancelled' ? '#DC2626' : '#B45309' }}>
            ({STOCK_OUT_STATUS_LABELS[order.status] || order.status})
          </div>
        )}
      </div>

      {/* Thông tin phiếu */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={P_TD_LABEL}>Kho xuất</td>
            <td style={P_TD_VALUE}>{order.warehouse_name}{order.warehouse_code && order.warehouse_code !== '—' ? ` (${order.warehouse_code})` : ''}</td>
            <td style={P_TD_LABEL}>Lý do</td>
            <td style={P_TD_VALUE}>{STOCK_OUT_REASON_LABELS[order.reason] || order.reason}</td>
          </tr>
          <tr>
            <td style={P_TD_LABEL}>Khách hàng</td>
            <td style={P_TD_VALUE}>{order.customer_name || '—'}</td>
            <td style={P_TD_LABEL}>Số đơn / Ref</td>
            <td style={P_TD_VALUE}>{order.customer_order_ref || '—'}</td>
          </tr>
          <tr>
            <td style={P_TD_LABEL}>Grade</td>
            <td style={P_TD_VALUE}>{order.svr_grade ? (RUBBER_GRADE_LABELS[order.svr_grade] || order.svr_grade) : '—'}</td>
            <td style={P_TD_LABEL}>DRC yêu cầu</td>
            <td style={P_TD_VALUE}>{drcReq}</td>
          </tr>
          <tr>
            <td style={P_TD_LABEL}>Người lập</td>
            <td style={P_TD_VALUE}>{order.created_by_name}</td>
            <td style={P_TD_LABEL}>Ngày xuất</td>
            <td style={P_TD_VALUE}>{fmtNgayGioIn(order.confirmed_at)}</td>
          </tr>
          {(order.container_type || order.notes) && (
            <tr>
              <td style={P_TD_LABEL}>Container</td>
              <td style={P_TD_VALUE}>{order.container_type || '—'}</td>
              <td style={P_TD_LABEL}>Ghi chú</td>
              <td style={{ ...P_TD_VALUE, whiteSpace: 'pre-wrap' }}>{order.notes || '—'}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Chi tiết lô xuất */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <thead>
          <tr>
            <th style={{ ...P_TH, width: 28 }}>#</th>
            <th style={P_TH}>Mã lô</th>
            <th style={P_TH}>Sản phẩm</th>
            <th style={P_TH}>Grade</th>
            <th style={P_TH}>Vị trí</th>
            <th style={P_TH}>DRC</th>
            <th style={P_TH}>Số lượng</th>
            <th style={P_TH}>KL (kg)</th>
            <th style={P_TH}>KL khô (kg)</th>
          </tr>
        </thead>
        <tbody>
          {order.details.map((d, i) => (
            <tr key={d.id}>
              <td style={{ ...P_TD, textAlign: 'center' }}>{i + 1}</td>
              <td style={{ ...P_TD, ...monoStyle }}>{d.batch_no}</td>
              <td style={P_TD}>{d.material_sku} — {d.material_name}</td>
              <td style={{ ...P_TD, textAlign: 'center' }}>{d.rubber_grade ? (RUBBER_GRADE_LABELS[d.rubber_grade] || d.rubber_grade) : '—'}</td>
              <td style={{ ...P_TD, textAlign: 'center' }}>{d.location_code || '—'}</td>
              <td style={P_NUM}>{d.drc_value != null ? `${fmtNum(d.drc_value, 1)}%` : '—'}</td>
              <td style={P_NUM}>{fmtNum(d.quantity)} {d.material_unit}</td>
              <td style={P_NUM}>{fmtKg(d.weight)}</td>
              <td style={P_NUM}>{fmtKg(d.dry_weight)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...P_TD, fontWeight: 700 }} colSpan={6}>Tổng cộng ({order.details.length} lô)</td>
            <td style={{ ...P_NUM, fontWeight: 700 }}>{fmtNum(totalQty)}</td>
            <td style={{ ...P_NUM, fontWeight: 700 }}>{fmtKg(totalWeight)}</td>
            <td style={{ ...P_NUM, fontWeight: 700 }}>{fmtKg(totalDry)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Chữ ký */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, textAlign: 'center', gap: 12, fontSize: 13 }}>
        {['Người lập phiếu', 'Thủ kho', 'Người nhận hàng'].map(t => (
          <div key={t} style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 56 }}>{t}</div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, textAlign: 'center', fontSize: 10, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: 6 }}>
        In từ hệ thống ERP Huy Anh — {fmtNgayGioIn(new Date())}
      </div>
    </div>
  )
}
