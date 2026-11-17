// ============================================================================
// STOCK IN DETAIL PAGE — Ant Design + Rubber Info
// File: src/pages/wms/stock-in/StockInDetailPage.tsx
// Rewrite: Tailwind -> Ant Design v6, them rubber supplier/grade/dry weight
// Đợt 3 audit UI (17/11/2026): nút "In phiếu" in thật (bản A4 @media print), nhãn/màu
// trạng thái + nguồn nhập dùng chung stockInLabels, "Kho (kg)" → "KL khô (kg)" (dry_weight).
// ============================================================================

import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useOpenDealTab } from '../../../hooks/useB2BTabs'
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
  Modal,
  message,
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
import stockInService from '../../../services/wms/stockInService'
import { useAuthStore } from '../../../stores/authStore'
import GradeBadge from '../../../components/wms/GradeBadge'
import { QCBadge } from '../../../components/wms/QCInputForm'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'
import { RUBBER_GRADE_LABELS, type RubberGrade } from '../../../services/wms/wms.types'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtDateTime, fmtKg, fmtNum, fmtVnd } from '../../../utils/format'
import {
  STOCK_IN_SOURCE_LABELS, STOCK_IN_STATUS_LABELS, STOCK_IN_STATUS_COLORS,
} from './stockInLabels'
import { BATCH_QC_STATUS_LABELS } from '../qc/qcLabels'
import PhieuKhoPrintPortal from '../PhieuKhoPrintPortal'
import PageState from '../../../components/common/PageState'

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

// Một nguồn nhãn với Sổ nhập kho (bản cũ ở đây thiếu 'Khách trả' / 'Đóng gói lại' → hiện mã thô)
const SOURCE_LABELS = STOCK_IN_SOURCE_LABELS

// ============================================================================
// HELPERS
// ============================================================================

// Chuẩn ngày-giờ toàn hệ (format.ts): 'DD/MM HH:mm', thêm /YYYY khi khác năm nay
const formatDateTime = (d: string): string => fmtDateTime(d)

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
  const openDealTab = useOpenDealTab()
  const { user } = useAuthStore()

  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // Gốc trang — PhieuKhoPrintPortal dựa vào nó để biết trang có đang hiện khi in
  const rootRef = useRef<HTMLDivElement>(null)

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
        setError(dichLoiHeThong(err, 'Không thể tải dữ liệu phiếu nhập'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, reloadKey])

  // Xác nhận nhập kho (phiếu Nháp) — theo mẫu handleConfirm của StockOutDetailPage
  const handleConfirm = () => {
    if (!order) return
    Modal.confirm({
      title: 'Xác nhận nhập kho?',
      content: `Phiếu ${order.code} sẽ được xác nhận nhập, tồn kho sẽ tăng tương ứng. Hành động này KHÔNG thể hoàn tác.`,
      okText: 'Xác nhận nhập',
      cancelText: 'Huỷ',
      okButtonProps: { style: { background: '#1B4D3E', borderColor: '#1B4D3E' } },
      onOk: async () => {
        setConfirming(true)
        try {
          await stockInService.confirmStockIn(order.id, user?.employee_id || user?.id || 'system')
          message.success(`Đã xác nhận nhập phiếu ${order.code}`)
          setReloadKey(k => k + 1)
        } catch (err: any) {
          message.error(dichLoiHeThong(err, 'Không thể xác nhận nhập kho'))
        } finally {
          setConfirming(false)
        }
      },
    })
  }

  // Huỷ phiếu nhập kho (chỉ phiếu Nháp)
  const handleCancelOrder = () => {
    if (!order) return
    Modal.confirm({
      title: 'Huỷ phiếu nhập kho?',
      content: `Phiếu ${order.code} sẽ bị huỷ, các lô hàng chưa nhập kèm theo sẽ bị xoá. Hành động này KHÔNG thể hoàn tác.`,
      okText: 'Huỷ phiếu',
      cancelText: 'Không',
      okButtonProps: { danger: true },
      onOk: async () => {
        setCancelling(true)
        try {
          await stockInService.cancelStockIn(order.id)
          message.success(`Đã huỷ phiếu ${order.code}`)
          setReloadKey(k => k + 1)
        } catch (err: any) {
          message.error(dichLoiHeThong(err, 'Không thể huỷ phiếu nhập kho'))
        } finally {
          setCancelling(false)
        }
      },
    })
  }

  if (loading) {
    return <div style={{ padding: 24 }}><PageState loading minHeight={240} /></div>
  }

  if (!order) {
    return (
      <div style={{ padding: 24 }}>
        {error && <Alert type="error" message="Không tải được phiếu nhập kho" description={error} style={{ marginBottom: 16 }} showIcon />}
        {!error && <Empty description="Không tìm thấy phiếu nhập kho" />}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Space>
            {error && <Button onClick={() => setReloadKey(k => k + 1)}>Thử lại</Button>}
            <Button onClick={() => navigate('/wms/stock-in')}>Quay lại</Button>
          </Space>
        </div>
      </div>
    )
  }

  const statusCfg = {
    color: STOCK_IN_STATUS_COLORS[order.status] || 'default',
    label: STOCK_IN_STATUS_LABELS[order.status] || order.status,
  }
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
      title: 'Mã lô',
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
          {fmtNum(v)} {r.unit}
        </Text>
      ),
    },
    {
      title: 'KL (kg)',
      dataIndex: 'weight',
      key: 'weight',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtKg(v)}</Text>
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
      // dry_weight = khối lượng KHÔ (trước ghi "Kho (kg)" — đọc thành "khối lượng kho")
      title: 'KL khô (kg)',
      dataIndex: 'dry_weight',
      key: 'dry_weight',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#2D8B6E' }}>{fmtKg(v)}</Text>
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
    <div ref={rootRef} style={{ padding: 24 }}>
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
            {order.status === 'draft' && (
              <>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={handleConfirm}
                  loading={confirming}
                  style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
                >
                  Xác nhận nhập kho
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={handleCancelOrder}
                  loading={cancelling}
                >
                  Huỷ phiếu
                </Button>
              </>
            )}
            {/* In thật: bản A4 ở cuối trang, chỉ hiện khi in (trước đây nút không có onClick) */}
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>In phiếu</Button>
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
                  SL Deal: {fmtNum(order.deal.quantity_kg / 1000, 1)} tấn · Đơn giá: {fmtVnd(order.deal.unit_price)}/kg
                </Text>
              )}
            </Col>
            <Col>
              <Button type="link" onClick={() => openDealTab({ id: order.deal!.id, deal_number: order.deal!.deal_number })}>
                Xem Deal →
              </Button>
            </Col>
          </Row>
        </Card>
      )}

      {/* Summary cards */}
      {(() => null)()}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic
              title="Tổng SL"
              value={order.total_quantity || 0}
              // F3 polish: dùng unit thật từ details (bành/kiện/kg) thay vì hardcode "kg"
              suffix={(() => {
                const units = Array.from(new Set((order.details || []).map(d => d.unit).filter(Boolean)))
                return units.length === 1 ? units[0] : 'đv'
              })()}
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }}
              formatter={(v) => fmtNum(Number(v))}
            />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Trọng lượng" value={fmtNum((order.total_weight || 0) / 1000, 1)} suffix="tấn"
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="KL khô" value={fmtNum(totalDryWeight / 1000, 1)} suffix="tấn"
              valueStyle={{ fontSize: 18, color: '#2D8B6E', fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Số lô" value={order.details.length} suffix="lô"
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
              {qcCounts.passed > 0 && <Tag color="green">{qcCounts.passed} đạt</Tag>}
              {qcCounts.warning > 0 && <Tag color="gold">{qcCounts.warning} cảnh báo</Tag>}
              {qcCounts.failed > 0 && <Tag color="red">{qcCounts.failed} không đạt</Tag>}
              {qcCounts.pending > 0 && <Tag>{qcCounts.pending} chờ QC</Tag>}
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
                  <Text strong>Tạo phiếu nhập</Text>
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
                  <Text type="secondary">Chờ xác nhận…</Text>
                </div>
              ),
            }] : []),
          ]}
        />
      </Card>

      {/* ===== BẢN IN A4 — portal ra <body>, chỉ hiện khi in từ CHÍNH trang này ===== */}
      <PhieuKhoPrintPortal rootRef={rootRef}><StockInPrintSheet order={order} /></PhieuKhoPrintPortal>
    </div>
  )
}

// ============================================================================
// BẢN IN A4 — phiếu nhập kho (nội dung theo khuôn phiếu cân của WeighbridgeDetailPage — Đợt 1;
// cơ chế in ở PhieuKhoPrintPortal)
// ============================================================================

const MONO = "'JetBrains Mono', monospace"
const P_TD_LABEL: CSSProperties = { border: '1px solid #D1D5DB', background: '#F9FAFB', padding: '5px 8px', fontWeight: 600, color: '#374151', width: 110 }
const P_TD_VALUE: CSSProperties = { border: '1px solid #D1D5DB', padding: '5px 8px' }
const P_TH: CSSProperties = { border: '1px solid #9CA3AF', background: '#F3F4F6', padding: '5px 6px', fontWeight: 700, fontSize: 11.5, textAlign: 'center' }
const P_TD: CSSProperties = { border: '1px solid #D1D5DB', padding: '4px 6px', fontSize: 12 }
const P_NUM: CSSProperties = { ...P_TD, textAlign: 'right', fontFamily: MONO }
// Giấy lưu trữ → LUÔN in đủ năm (fmtDateTime bỏ năm khi cùng năm nay, đọc lại năm sau là mất mốc)
const fmtNgayGioIn = (v: string | Date | null | undefined): string => {
  const d = v ? dayjs(v) : null
  return d && d.isValid() ? d.format('DD/MM/YYYY HH:mm') : '—'
}

function StockInPrintSheet({ order }: { order: OrderData }) {
  const totalQty = order.details.reduce((s, d) => s + (d.quantity || 0), 0)
  const totalWeight = order.details.reduce((s, d) => s + (d.weight || 0), 0)
  const totalDry = order.details.reduce((s, d) => s + (d.dry_weight || 0), 0)
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
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>PHIẾU NHẬP KHO</div>
        <div style={{ fontSize: 13, marginTop: 2 }}>Số: <strong style={{ fontFamily: MONO, color: '#92400E' }}>{order.code}</strong></div>
        <div style={{ fontSize: 12, color: '#6B7280' }}>Ngày tạo: {fmtNgayGioIn(order.created_at)}</div>
        {order.status !== 'confirmed' && (
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: order.status === 'cancelled' ? '#DC2626' : '#B45309' }}>
            ({STOCK_IN_STATUS_LABELS[order.status] || order.status})
          </div>
        )}
      </div>

      {/* Thông tin phiếu */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={P_TD_LABEL}>Kho nhập</td>
            <td style={P_TD_VALUE}>{order.warehouse_name}{order.warehouse_code ? ` (${order.warehouse_code})` : ''}</td>
            <td style={P_TD_LABEL}>Nguồn nhập</td>
            <td style={P_TD_VALUE}>{STOCK_IN_SOURCE_LABELS[order.source_type] || order.source_type}</td>
          </tr>
          <tr>
            <td style={P_TD_LABEL}>Đại lý / NCC</td>
            <td style={P_TD_VALUE}>{order.supplier_name || '—'}{order.supplier_region ? ` · ${order.supplier_region}` : ''}</td>
            <td style={P_TD_LABEL}>Deal</td>
            <td style={P_TD_VALUE}>{order.deal?.deal_number || '—'}</td>
          </tr>
          <tr>
            <td style={P_TD_LABEL}>Người lập</td>
            <td style={P_TD_VALUE}>{order.created_by_name}</td>
            <td style={P_TD_LABEL}>Ngày nhập</td>
            <td style={P_TD_VALUE}>{fmtNgayGioIn(order.confirmed_at)}</td>
          </tr>
          {order.notes && (
            <tr>
              <td style={P_TD_LABEL}>Ghi chú</td>
              <td style={{ ...P_TD_VALUE, whiteSpace: 'pre-wrap' }} colSpan={3}>{order.notes}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Chi tiết lô nhập */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <thead>
          <tr>
            <th style={{ ...P_TH, width: 28 }}>#</th>
            <th style={P_TH}>Mã lô</th>
            <th style={P_TH}>Vật liệu</th>
            <th style={P_TH}>Grade</th>
            <th style={P_TH}>Vị trí</th>
            <th style={P_TH}>QC</th>
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
              <td style={{ ...P_TD, fontFamily: MONO }}>{d.batch_no}</td>
              <td style={P_TD}>{d.material_sku ? `${d.material_sku} — ` : ''}{d.material_name}</td>
              <td style={{ ...P_TD, textAlign: 'center' }}>{d.rubber_grade ? (RUBBER_GRADE_LABELS[d.rubber_grade as RubberGrade] || d.rubber_grade) : '—'}</td>
              <td style={{ ...P_TD, textAlign: 'center' }}>{d.location_code || '—'}</td>
              <td style={{ ...P_TD, textAlign: 'center' }}>{BATCH_QC_STATUS_LABELS[d.qc_status] || d.qc_status}</td>
              <td style={P_NUM}>{d.drc_value != null ? `${fmtNum(d.drc_value, 1)}%` : '—'}</td>
              <td style={P_NUM}>{fmtNum(d.quantity)} {d.unit}</td>
              <td style={P_NUM}>{fmtKg(d.weight)}</td>
              <td style={P_NUM}>{fmtKg(d.dry_weight)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...P_TD, fontWeight: 700 }} colSpan={7}>Tổng cộng ({order.details.length} lô)</td>
            <td style={{ ...P_NUM, fontWeight: 700 }}>{fmtNum(totalQty)}</td>
            <td style={{ ...P_NUM, fontWeight: 700 }}>{fmtKg(totalWeight)}</td>
            <td style={{ ...P_NUM, fontWeight: 700 }}>{fmtKg(totalDry)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Chữ ký */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, textAlign: 'center', gap: 12, fontSize: 13 }}>
        {['Người lập phiếu', 'Người giao hàng', 'Thủ kho'].map(t => (
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

export default StockInDetailPage
