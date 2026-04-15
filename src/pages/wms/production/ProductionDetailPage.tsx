// ============================================================================
// PRODUCTION DETAIL PAGE — Ant Design + Tabs
// File: src/pages/wms/production/ProductionDetailPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOpenTab } from '../../../hooks/useOpenTab'
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
  Tabs,
  Timeline,
  Spin,
  Empty,
  Alert,
  Modal,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  InboxOutlined,
  ApartmentOutlined,
} from '@ant-design/icons'
import productionService from '../../../services/wms/productionService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type {
  ProductionOrder,
  ProductionStageProgress,
  ProductionOutputBatch,
  ProductionStatus,
  StageStatus,
} from '../../../services/wms/wms.types'
import {
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
  STAGE_NAMES,
  STAGE_DESCRIPTIONS,
} from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// HELPERS
// ============================================================================

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function stageStatusColor(s: StageStatus): string {
  switch (s) {
    case 'completed': return 'success'
    case 'in_progress': return 'processing'
    case 'failed': return 'error'
    default: return 'default'
  }
}

function stageStatusLabel(s: StageStatus): string {
  switch (s) {
    case 'completed': return 'Hoàn thành'
    case 'in_progress': return 'Đang chạy'
    case 'failed': return 'Lỗi'
    default: return 'Chờ'
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

interface ProductionDetailPageProps {
  id?: string
}

const ProductionDetailPage = ({ id: propId }: ProductionDetailPageProps = {}) => {
  const { id: paramId } = useParams<{ id: string }>()
  const id = propId || paramId
  const navigate = useNavigate()
  const openTab = useOpenTab()

  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const loadOrder = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await productionService.getById(id)
      setOrder(data)
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrder()
  }, [id])

  const handleStartProduction = async () => {
    if (!id) return
    Modal.confirm({
      title: 'Bắt đầu sản xuất?',
      content: 'Lệnh sản xuất sẽ chuyển sang trạng thái "Đang SX" và tạo 5 công đoạn.',
      okText: 'Bắt đầu',
      okButtonProps: { style: { background: '#1B4D3E', borderColor: '#1B4D3E' } },
      onOk: async () => {
        setActionLoading(true)
        try {
          await productionService.startProduction(id)
          message.success('Đã bắt đầu sản xuất')
          loadOrder()
        } catch (err: any) {
          message.error(err.message || 'Không thể bắt đầu sản xuất')
        } finally {
          setActionLoading(false)
        }
      },
    })
  }

  const handleCancelProduction = async () => {
    if (!id) return
    Modal.confirm({
      title: 'Hủy lệnh sản xuất?',
      content: 'Lệnh sản xuất sẽ bị hủy và không thể khôi phục.',
      okText: 'Hủy lệnh',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionLoading(true)
        try {
          await productionService.cancelProduction(id)
          message.success('Đã hủy lệnh sản xuất')
          loadOrder()
        } catch (err: any) {
          message.error(err.message || 'Không thể hủy')
        } finally {
          setActionLoading(false)
        }
      },
    })
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>
  }

  if (!order) {
    return (
      <div style={{ padding: 24 }}>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        <Empty description="Không tìm thấy lệnh sản xuất" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/wms/production')}>Quay lại</Button>
        </div>
      </div>
    )
  }

  const stages = (order.stages || []).sort((a, b) => a.stage_number - b.stage_number)
  const items = order.items || []
  const outputBatches = order.output_batches || []
  const totalInput = items.reduce((s, i) => s + (i.required_quantity || 0), 0)

  // ── Tab: Tổng quan ──
  const OverviewTab = (
    <div>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Grade">
          <GradeBadge grade={order.target_grade} size="small" />
        </Descriptions.Item>
        <Descriptions.Item label="SL mục tiêu">
          <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {order.target_quantity?.toLocaleString()} kg
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="SL thực tế">
          <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {order.actual_quantity?.toLocaleString() || '—'} kg
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Nhà máy">{order.facility?.name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Giám sát">{order.supervisor?.full_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Công đoạn">
          {order.stage_current ? `${order.stage_current}/5 — ${STAGE_NAMES[order.stage_current]}` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="DRC mục tiêu">
          {order.target_drc_min && order.target_drc_max
            ? `${order.target_drc_min}% — ${order.target_drc_max}%`
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="DRC thực tế">
          {order.final_drc ? <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{order.final_drc}%</Text> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Grade thực tế">
          {order.final_grade ? <GradeBadge grade={order.final_grade} size="small" /> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Ngày bắt đầu">{formatDateTime(order.actual_start_date)}</Descriptions.Item>
        <Descriptions.Item label="Ngày hoàn thành">{formatDateTime(order.actual_end_date)}</Descriptions.Item>
        <Descriptions.Item label="Ngày dự kiến">{order.scheduled_start_date || '—'}</Descriptions.Item>
        {order.notes && <Descriptions.Item label="Ghi chú" span={3}>{order.notes}</Descriptions.Item>}
      </Descriptions>

      <Row gutter={16}>
        <Col span={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Tổng NL (kg)" value={totalInput.toLocaleString()}
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="SL thực tế" value={order.actual_quantity?.toLocaleString() || '—'}
              suffix="kg"
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Yield" value={order.yield_percent?.toFixed(1) || '—'} suffix="%"
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#E8A838' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Thành phẩm" value={outputBatches.length} suffix="lô"
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
      </Row>
    </div>
  )

  // ── Tab: Nguyên liệu ──
  const inputColumns = [
    {
      title: 'Lô',
      key: 'batch_no',
      render: (_: any, r: any) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          {r.source_batch?.batch_no || '—'}
        </Text>
      ),
    },
    {
      title: 'Grade',
      key: 'grade',
      render: (_: any, r: any) => <GradeBadge grade={r.source_batch?.rubber_grade} size="small" />,
    },
    {
      title: 'DRC %',
      key: 'drc',
      align: 'right' as const,
      render: (_: any, r: any) => {
        const drc = r.source_batch?.latest_drc || r.source_batch?.initial_drc
        return drc ? <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{drc}%</Text> : '—'
      },
    },
    {
      title: 'SL (kg)',
      dataIndex: 'required_quantity',
      key: 'required_quantity',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v?.toLocaleString()}</Text>
      ),
    },
    {
      title: 'QC',
      key: 'qc',
      render: (_: any, r: any) => {
        const s = r.source_batch?.qc_status
        const color = s === 'passed' ? 'success' : s === 'failed' ? 'error' : 'default'
        return <Tag color={color}>{s || 'pending'}</Tag>
      },
    },
  ]

  const InputTab = (
    <Table
      dataSource={items}
      columns={inputColumns}
      rowKey="id"
      size="small"
      pagination={false}
    />
  )

  // ── Tab: Công đoạn ──
  const StagesTab = (
    <div>
      <Timeline
        items={stages.map((stage) => ({
          color: stage.status === 'completed' ? 'green' : stage.status === 'in_progress' ? 'blue' : 'gray',
          children: (
            <Card
              size="small"
              style={{
                borderRadius: 8,
                borderLeft: stage.status === 'in_progress' ? '3px solid #1890ff' : undefined,
                background: stage.status === 'in_progress' ? '#f0f5ff' : undefined,
              }}
            >
              <Row justify="space-between" align="middle">
                <Col>
                  <Space>
                    <Text strong>{stage.stage_number}. {stage.stage_name}</Text>
                    <Tag color={stageStatusColor(stage.status)}>{stageStatusLabel(stage.status)}</Tag>
                  </Space>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {STAGE_DESCRIPTIONS[stage.stage_number]}
                    </Text>
                  </div>
                </Col>
                <Col>
                  {stage.status === 'in_progress' && (
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => openTab({
                        key: `production-${id}-stage-${stage.stage_number}`,
                        title: `SX ${order?.code || ''} — Stage ${stage.stage_number}`,
                        componentId: 'production-stage',
                        props: { id, stageNumber: String(stage.stage_number) },
                        path: `/wms/production/${id}/stage/${stage.stage_number}`,
                      })}
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                    >
                      Cập nhật
                    </Button>
                  )}
                  {stage.status === 'pending' && order.status === 'in_progress' && (
                    <Button
                      size="small"
                      disabled
                    >
                      Chờ
                    </Button>
                  )}
                </Col>
              </Row>
              {stage.status !== 'pending' && (
                <Row gutter={16} style={{ marginTop: 8 }}>
                  <Col span={4}>
                    <Text type="secondary" style={{ fontSize: 11 }}>NL vào</Text><br />
                    <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {stage.input_quantity?.toLocaleString() || '—'} kg
                    </Text>
                  </Col>
                  <Col span={4}>
                    <Text type="secondary" style={{ fontSize: 11 }}>NL ra</Text><br />
                    <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {stage.output_quantity?.toLocaleString() || '—'} kg
                    </Text>
                  </Col>
                  <Col span={4}>
                    <Text type="secondary" style={{ fontSize: 11 }}>DRC vào</Text><br />
                    <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {stage.input_drc != null ? `${stage.input_drc}%` : '—'}
                    </Text>
                  </Col>
                  <Col span={4}>
                    <Text type="secondary" style={{ fontSize: 11 }}>DRC ra</Text><br />
                    <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {stage.output_drc != null ? `${stage.output_drc}%` : '—'}
                    </Text>
                  </Col>
                  <Col span={4}>
                    <Text type="secondary" style={{ fontSize: 11 }}>Người thao tác</Text><br />
                    <Text style={{ fontSize: 12 }}>{stage.operator?.full_name || '—'}</Text>
                  </Col>
                  <Col span={4}>
                    <Text type="secondary" style={{ fontSize: 11 }}>Thời gian</Text><br />
                    <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {stage.duration_hours != null ? `${stage.duration_hours}h` : '—'}
                    </Text>
                  </Col>
                </Row>
              )}
            </Card>
          ),
        }))}
      />
      {stages.length === 0 && (
        <Empty description="Chưa có công đoạn. Bắt đầu sản xuất để tạo 5 công đoạn." />
      )}
    </div>
  )

  // ── Tab: Thành phẩm ──
  const outputColumns = [
    {
      title: 'Lô',
      key: 'batch',
      render: (_: any, r: ProductionOutputBatch) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          {r.output_batch_no || r.stock_batch?.batch_no || r.id.slice(0, 8)}
        </Text>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'final_grade',
      key: 'final_grade',
      render: (v: string | null) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'DRC %',
      dataIndex: 'final_drc',
      key: 'final_drc',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{v}%</Text>
      ) : '—',
    },
    {
      title: 'SL (kg)',
      dataIndex: 'quantity_produced',
      key: 'quantity_produced',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v?.toLocaleString()}</Text>
      ),
    },
    {
      title: 'Số bành',
      dataIndex: 'bale_count',
      key: 'bale_count',
      align: 'right' as const,
      render: (v: number | null) => v ?? '—',
    },
    {
      title: 'QC',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => {
        const colorMap: Record<string, string> = {
          created: 'default', qc_pending: 'processing', qc_passed: 'success', qc_failed: 'error', stored: 'blue',
        }
        const labelMap: Record<string, string> = {
          created: 'Mới', qc_pending: 'Chờ QC', qc_passed: 'Đạt', qc_failed: 'Không đạt', stored: 'Đã nhập kho',
        }
        return <Tag color={colorMap[v] || 'default'}>{labelMap[v] || v}</Tag>
      },
    },
  ]

  const OutputTab = (
    <div>
      <Row justify="end" style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<InboxOutlined />}
          onClick={() => openTab({
            key: `production-${id}-output`,
            title: `SX ${order?.code || ''} — Thành phẩm`,
            componentId: 'production-output',
            props: { id },
            path: `/wms/production/${id}/output`,
          })}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
        >
          Quản lý thành phẩm
        </Button>
      </Row>
      {outputBatches.length === 0 ? (
        <Empty description="Chưa có thành phẩm" />
      ) : (
        <Table
          dataSource={outputBatches}
          columns={outputColumns}
          rowKey="id"
          size="small"
          pagination={false}
        />
      )}
    </div>
  )

  // ── Tab: Truy xuất ──
  const TraceabilityTab = (
    <div>
      <Title level={5}><ApartmentOutlined /> Truy xuất nguồn gốc</Title>
      <Row gutter={24}>
        <Col span={8}>
          <Card title="Nguyên liệu đầu vào" size="small">
            {items.map((item, i) => (
              <div key={item.id} style={{ padding: '4px 0', borderBottom: i < items.length - 1 ? '1px solid #f0f0f0' : undefined }}>
                <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                  {item.source_batch?.batch_no || '—'}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {item.required_quantity?.toLocaleString()} kg
                </Text>
              </div>
            ))}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Công đoạn chế biến" size="small">
            {stages.map((stage) => (
              <div key={stage.id} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Space>
                  <Tag color={stageStatusColor(stage.status)} style={{ margin: 0 }}>
                    {stage.stage_number}
                  </Tag>
                  <Text style={{ fontSize: 12 }}>{stage.stage_name}</Text>
                </Space>
                {stage.weight_loss_kg != null && (
                  <Text type="secondary" style={{ display: 'block', fontSize: 11, marginLeft: 32 }}>
                    Hao hụt: {stage.weight_loss_kg} kg
                  </Text>
                )}
              </div>
            ))}
            {stages.length === 0 && <Text type="secondary">Chưa có</Text>}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Thành phẩm đầu ra" size="small">
            {outputBatches.map((batch, i) => (
              <div key={batch.id} style={{ padding: '4px 0', borderBottom: i < outputBatches.length - 1 ? '1px solid #f0f0f0' : undefined }}>
                <Space>
                  <GradeBadge grade={batch.final_grade} size="small" />
                  <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                    {batch.quantity_produced?.toLocaleString()} kg
                  </Text>
                </Space>
              </div>
            ))}
            {outputBatches.length === 0 && <Text type="secondary">Chưa có</Text>}
          </Card>
        </Col>
      </Row>
    </div>
  )

  const canStart = order.status === 'draft' || order.status === 'scheduled'
  const canCancel = order.status === 'draft' || order.status === 'scheduled' || order.status === 'in_progress'

  return (
    <div style={{ padding: 24 }}>
      {/* Back */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/production')}>
          Quay lại
        </Button>
      </Space>

      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space align="center" size="middle">
            <Title level={4} style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
              {order.code}
            </Title>
            <Tag color={PRODUCTION_STATUS_COLORS[order.status]} style={{ fontSize: 14 }}>
              {PRODUCTION_STATUS_LABELS[order.status]}
            </Tag>
            <GradeBadge grade={order.target_grade} size="small" />
          </Space>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {order.facility?.name || ''} · {formatDateTime(order.created_at)}
          </Text>
        </Col>
        <Col>
          <Space>
            {canStart && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStartProduction}
                loading={actionLoading}
                style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Bắt đầu SX
              </Button>
            )}
            {canCancel && (
              <Button danger icon={<StopOutlined />} onClick={handleCancelProduction} loading={actionLoading}>
                Hủy lệnh
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* Tabs */}
      <Card style={{ borderRadius: 12 }}>
        <Tabs
          defaultActiveKey="overview"
          items={[
            { key: 'overview', label: 'Tổng quan', children: OverviewTab },
            { key: 'input', label: `Nguyên liệu (${items.length})`, children: InputTab },
            { key: 'stages', label: `Công đoạn (${stages.length})`, children: StagesTab },
            { key: 'output', label: `Thành phẩm (${outputBatches.length})`, children: OutputTab },
            { key: 'trace', label: 'Truy xuất', children: TraceabilityTab },
          ]}
        />
      </Card>
    </div>
  )
}

export default ProductionDetailPage
