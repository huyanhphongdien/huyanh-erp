// ============================================================================
// BLEND DETAIL PAGE — Ant Design + Tabs
// File: src/pages/wms/blending/BlendDetailPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
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
  Tabs,
  Spin,
  Empty,
  Alert,
  Modal,
  InputNumber,
  Select,
  Input,
  Progress,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import blendingService from '../../../services/wms/blendingService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type {
  BlendOrder,
  BlendOrderItem,
  BlendQCResult,
  BlendStatus,
} from '../../../services/wms/wms.types'
import {
  BLEND_STATUS_LABELS,
  BLEND_STATUS_COLORS,
} from '../../../services/wms/wms.types'
import { supabase } from '../../../lib/supabase'

const { Title, Text } = Typography

// ============================================================================
// HELPERS
// ============================================================================

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ============================================================================
// COMPONENT
// ============================================================================

const BlendDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [order, setOrder] = useState<BlendOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Complete modal
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeQty, setCompleteQty] = useState<number | null>(null)
  const [completeWarehouse, setCompleteWarehouse] = useState<string>('')
  const [completeLocation, setCompleteLocation] = useState<string>('')
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([])

  // QC modal
  const [showQCModal, setShowQCModal] = useState(false)
  const [qcDrc, setQcDrc] = useState<number | null>(null)
  const [qcMoisture, setQcMoisture] = useState<number | null>(null)
  const [qcNotes, setQcNotes] = useState('')

  const loadOrder = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await blendingService.getById(id)
      setOrder(data)
    } catch (err: any) {
      setError(err.message || 'Không thể tải du lieu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrder()
  }, [id])

  // Load warehouses for complete modal
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('warehouses')
          .select('id, name, code')
          .eq('is_active', true)
          .order('code')
        if (data) setWarehouses(data)
      } catch (err) { console.error(err) }
    }
    load()
  }, [])

  // Actions
  const handleSimulate = async () => {
    if (!id) return
    setActionLoading(true)
    try {
      await blendingService.simulate(id)
      message.success('Đã mô phỏng thành công')
      loadOrder()
    } catch (err: any) {
      message.error(err.message || 'Không thể mô phỏng')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!id) return
    Modal.confirm({
      title: 'Duyet lenh phoi tron?',
      content: 'Lenh se chuyen sang trang thai "Đã duyệt".',
      okText: 'Duyệt',
      okButtonProps: { style: { background: '#1B4D3E', borderColor: '#1B4D3E' } },
      onOk: async () => {
        setActionLoading(true)
        try {
          await blendingService.approve(id, 'system')
          message.success('Đã duyệt lệnh phối trộn')
          loadOrder()
        } catch (err: any) {
          message.error(err.message || 'Không thể duyệt')
        } finally {
          setActionLoading(false)
        }
      },
    })
  }

  const handleStartBlending = async () => {
    if (!id) return
    Modal.confirm({
      title: 'Bắt đầu phoi tron?',
      content: 'Lenh se chuyen sang trang thai "Đang trộn".',
      okText: 'Bắt đầu',
      okButtonProps: { style: { background: '#1B4D3E', borderColor: '#1B4D3E' } },
      onOk: async () => {
        setActionLoading(true)
        try {
          await blendingService.startBlending(id, 'system')
          message.success('Đã bắt đầu phối trộn')
          loadOrder()
        } catch (err: any) {
          message.error(err.message || 'Không thể bắt đầu')
        } finally {
          setActionLoading(false)
        }
      },
    })
  }

  const handleCompleteBlending = async () => {
    if (!id || !completeQty || !completeWarehouse) return
    setActionLoading(true)
    try {
      await blendingService.completeBlending(id, {
        actual_quantity_kg: completeQty,
        output_warehouse_id: completeWarehouse,
        output_location_id: completeLocation || undefined,
      })
      message.success('Đã hoàn thành phối trộn')
      setShowCompleteModal(false)
      loadOrder()
    } catch (err: any) {
      message.error(err.message || 'Không thể hoàn thành')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!id) return
    Modal.confirm({
      title: 'Hủy lệnh phoi tron?',
      content: 'Lenh se bi huy va khong the khoi phuc.',
      okText: 'Hủy lệnh',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionLoading(true)
        try {
          await blendingService.cancelBlending(id)
          message.success('Đã hủy lệnh phối trộn')
          loadOrder()
        } catch (err: any) {
          message.error(err.message || 'Không thể hủy')
        } finally {
          setActionLoading(false)
        }
      },
    })
  }

  const handleRecordQC = async () => {
    if (!id) return
    setActionLoading(true)
    try {
      await blendingService.recordQC(id, {
        drc_value: qcDrc ?? undefined,
        moisture_content: qcMoisture ?? undefined,
        notes: qcNotes || undefined,
      })
      message.success('Đã ghi nhận QC')
      setShowQCModal(false)
      setQcDrc(null)
      setQcMoisture(null)
      setQcNotes('')
      loadOrder()
    } catch (err: any) {
      message.error(err.message || 'Không thể ghi nhận QC')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>
  }

  if (!order) {
    return (
      <div style={{ padding: 24 }}>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        <Empty description="Không tìm thấy lenh phoi tron" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/wms/blending')}>Quay lại</Button>
        </div>
      </div>
    )
  }

  const items = order.items || []
  const qcResults = order.qc_results || []
  const totalInputQty = items.reduce((s, i) => s + i.quantity_kg, 0)

  // Simulate from current items for display
  const simulationItems = items.map(item => ({
    batch_id: item.source_batch_id,
    batch_no: item.batch_no || (item.source_batch as any)?.batch_no || '',
    quantity_kg: item.quantity_kg,
    drc: item.batch_drc || (item.source_batch as any)?.latest_drc || (item.source_batch as any)?.initial_drc || 0,
    rubber_grade: item.rubber_grade || (item.source_batch as any)?.rubber_grade || undefined,
  }))
  const liveSimulation = simulationItems.length > 0
    ? blendingService.simulateFromItems(simulationItems, order.target_drc, order.target_grade)
    : null

  // ── Tab: Tổng quan ──
  const OverviewTab = (
    <div>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Grade mục tiêu">
          <GradeBadge grade={order.target_grade} size="small" />
        </Descriptions.Item>
        <Descriptions.Item label="DRC mục tiêu">
          <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{order.target_drc}%</Text>
        </Descriptions.Item>
        <Descriptions.Item label="SL mục tiêu">
          <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{order.target_quantity_kg?.toLocaleString()} kg</Text>
        </Descriptions.Item>
        <Descriptions.Item label="DRC mô phỏng">
          <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>
            {order.simulated_drc != null ? `${order.simulated_drc}%` : '—'}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="DRC thực tế">
          <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8A838' }}>
            {order.actual_drc != null ? `${order.actual_drc}%` : '—'}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Grade thực tế">
          {order.result_grade ? <GradeBadge grade={order.result_grade} size="small" /> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="SL thực tế">
          <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {order.actual_quantity_kg != null ? `${order.actual_quantity_kg.toLocaleString()} kg` : '—'}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Đạt mục tiêu">
          {order.grade_meets_target === true && <Tag color="success">Dat</Tag>}
          {order.grade_meets_target === false && <Tag color="error">Không đạt</Tag>}
          {order.grade_meets_target == null && <Text type="secondary">—</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="Lô thành phẩm">
          {order.output_batch ? (
            <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E', cursor: 'pointer' }}>
              {order.output_batch.batch_no}
            </Text>
          ) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Người duyệt">{order.approved_by || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày duyệt">{formatDateTime(order.approved_at)}</Descriptions.Item>
        <Descriptions.Item label="Người trộn">{order.blended_by || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày trộn">{formatDateTime(order.blended_at)}</Descriptions.Item>
        <Descriptions.Item label="Ngày tạo">{formatDateTime(order.created_at)}</Descriptions.Item>
        {order.notes && <Descriptions.Item label="Ghi chú" span={3}>{order.notes}</Descriptions.Item>}
      </Descriptions>

      {/* DRC comparison card */}
      {liveSimulation && (
        <Card
          size="small"
          title={<Space><ExperimentOutlined /> So sanh DRC</Space>}
          style={{
            borderRadius: 8,
            marginBottom: 16,
            border: liveSimulation.meets_target ? '1px solid #b7eb8f' : '1px solid #ffa39e',
            background: liveSimulation.meets_target ? '#f6ffed' : '#fff2f0',
          }}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="DRC mục tiêu" value={order.target_drc} suffix="%"
                valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
            </Col>
            <Col span={6}>
              <Statistic title="DRC mô phỏng" value={liveSimulation.simulated_drc} suffix="%"
                valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#1B4D3E' }} />
            </Col>
            <Col span={6}>
              <Statistic title="DRC thực tế" value={order.actual_drc ?? '—'} suffix={order.actual_drc != null ? '%' : ''}
                valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'", color: '#E8A838' }} />
            </Col>
            <Col span={6}>
              <div style={{ paddingTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Muc tieu: {order.target_drc}%</Text>
                <Progress
                  percent={Math.min(100, Math.round((liveSimulation.simulated_drc / order.target_drc) * 100))}
                  strokeColor={liveSimulation.meets_target ? '#16A34A' : '#DC2626'}
                  format={() => `${liveSimulation.simulated_drc}%`}
                  size="small"
                />
              </div>
            </Col>
          </Row>
        </Card>
      )}

      <Row gutter={16}>
        <Col span={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Tong NL (kg)" value={totalInputQty.toLocaleString()}
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Số lô nguyen lieu" value={items.length}
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="SL mo phong (kg)" value={order.simulated_quantity_kg?.toLocaleString() || '—'}
              valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
      </Row>
    </div>
  )

  // ── Tab: Nguyên liệu ──
  const itemColumns = [
    {
      title: 'Lo',
      key: 'batch_no',
      render: (_: any, r: BlendOrderItem) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          {r.batch_no || (r.source_batch as any)?.batch_no || '—'}
        </Text>
      ),
    },
    {
      title: 'Nguyên liệu',
      key: 'material',
      render: (_: any, r: BlendOrderItem) => (
        <Text style={{ fontSize: 12 }}>{r.material_name || (r.source_batch as any)?.material?.name || '—'}</Text>
      ),
    },
    {
      title: 'Grade',
      key: 'grade',
      render: (_: any, r: BlendOrderItem) => (
        <GradeBadge grade={r.rubber_grade || (r.source_batch as any)?.rubber_grade} size="small" />
      ),
    },
    {
      title: 'DRC %',
      dataIndex: 'batch_drc',
      key: 'batch_drc',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{v}%</Text>
      ) : '—',
    },
    {
      title: 'SL (kg)',
      dataIndex: 'quantity_kg',
      key: 'quantity_kg',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v?.toLocaleString()}</Text>
      ),
    },
    {
      title: '% tong',
      dataIndex: 'percentage',
      key: 'percentage',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8A838' }}>{v}%</Text>
      ) : '—',
    },
    {
      title: 'Đóng góp DRC',
      dataIndex: 'drc_contribution',
      key: 'drc_contribution',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
      ) : '—',
    },
  ]

  const ItemsTab = (
    <Table
      dataSource={items}
      columns={itemColumns}
      rowKey="id"
      size="small"
      pagination={false}
    />
  )

  // ── Tab: QC ──
  const qcColumns = [
    {
      title: 'DRC %',
      dataIndex: 'drc_value',
      key: 'drc_value',
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{v}%</Text>
      ) : '—',
    },
    {
      title: 'Do am %',
      dataIndex: 'moisture_content',
      key: 'moisture_content',
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}%</Text>
      ) : '—',
    },
    {
      title: 'Grade',
      dataIndex: 'grade_determined',
      key: 'grade_determined',
      render: (v: string | null) => v ? <GradeBadge grade={v} size="small" /> : '—',
    },
    {
      title: 'Đạt mục tiêu',
      dataIndex: 'grade_meets_target',
      key: 'grade_meets_target',
      render: (v: boolean | null) => {
        if (v === true) return <Tag color="success">Dat</Tag>
        if (v === false) return <Tag color="error">Không đạt</Tag>
        return '—'
      },
    },
    {
      title: 'Kết quả',
      dataIndex: 'result',
      key: 'result',
      render: (v: string) => {
        const colorMap: Record<string, string> = { passed: 'success', warning: 'warning', failed: 'error' }
        const labelMap: Record<string, string> = { passed: 'Đạt', warning: 'Cảnh báo', failed: 'Không đạt' }
        return <Tag color={colorMap[v] || 'default'}>{labelMap[v] || v}</Tag>
      },
    },
    {
      title: 'Ngay',
      dataIndex: 'tested_at',
      key: 'tested_at',
      render: (v: string | null) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(v)}</Text>,
    },
    {
      title: 'Ghi chú',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
    },
  ]

  const QCTab = (
    <div>
      <Row justify="end" style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          onClick={() => setShowQCModal(true)}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
        >
          Ghi nhan QC
        </Button>
      </Row>
      {qcResults.length === 0 ? (
        <Empty description="Chưa có ket qua QC" />
      ) : (
        <Table
          dataSource={qcResults}
          columns={qcColumns}
          rowKey="id"
          size="small"
          pagination={false}
        />
      )}
    </div>
  )

  // Action buttons
  const canSimulate = order.status === 'draft'
  const canApprove = order.status === 'draft' || order.status === 'simulated'
  const canStart = order.status === 'approved'
  const canComplete = order.status === 'in_progress'
  const canCancel = order.status !== 'completed' && order.status !== 'cancelled'

  return (
    <div style={{ padding: 24 }}>
      {/* Back */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/blending')}>
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
            <Tag color={BLEND_STATUS_COLORS[order.status]} style={{ fontSize: 14 }}>
              {BLEND_STATUS_LABELS[order.status]}
            </Tag>
            <GradeBadge grade={order.target_grade} size="small" />
          </Space>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {formatDateTime(order.created_at)}
          </Text>
        </Col>
        <Col>
          <Space>
            {canSimulate && (
              <Button icon={<ExperimentOutlined />} onClick={handleSimulate} loading={actionLoading}>
                Mô phỏng
              </Button>
            )}
            {canApprove && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleApprove}
                loading={actionLoading}
                style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Duyet
              </Button>
            )}
            {canStart && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStartBlending}
                loading={actionLoading}
                style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Bắt đầu tron
              </Button>
            )}
            {canComplete && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  setCompleteQty(order.simulated_quantity_kg || null)
                  setShowCompleteModal(true)
                }}
                loading={actionLoading}
                style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Hoàn thành
              </Button>
            )}
            {canCancel && (
              <Button danger icon={<StopOutlined />} onClick={handleCancel} loading={actionLoading}>
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
            { key: 'items', label: `Nguyên liệu (${items.length})`, children: ItemsTab },
            { key: 'qc', label: `QC (${qcResults.length})`, children: QCTab },
          ]}
        />
      </Card>

      {/* Complete modal */}
      <Modal
        title="Hoàn thành phoi tron"
        open={showCompleteModal}
        onCancel={() => setShowCompleteModal(false)}
        onOk={handleCompleteBlending}
        okText="Hoàn thành"
        okButtonProps={{ disabled: !completeQty || !completeWarehouse, loading: actionLoading }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>San luong thuc te (kg) *</Text>
          <InputNumber
            value={completeQty}
            onChange={v => setCompleteQty(v)}
            min={1}
            style={{ width: '100%' }}
            size="large"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Kho xuat *</Text>
          <Select
            value={completeWarehouse || undefined}
            onChange={setCompleteWarehouse}
            placeholder="Chọn kho"
            style={{ width: '100%' }}
            options={warehouses.map(w => ({
              value: w.id,
              label: `${w.name} (${w.code})`,
            }))}
          />
        </div>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Vị trí (tuy chon)</Text>
          <Input
            value={completeLocation}
            onChange={e => setCompleteLocation(e.target.value)}
            placeholder="Vị trí kho..."
          />
        </div>
      </Modal>

      {/* QC modal */}
      <Modal
        title="Ghi nhận kết quả QC"
        open={showQCModal}
        onCancel={() => setShowQCModal(false)}
        onOk={handleRecordQC}
        okText="Lưu"
        okButtonProps={{ loading: actionLoading }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>DRC (%)</Text>
          <InputNumber
            value={qcDrc}
            onChange={v => setQcDrc(v)}
            min={0}
            max={100}
            step={0.1}
            style={{ width: '100%' }}
            size="large"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Do am (%)</Text>
          <InputNumber
            value={qcMoisture}
            onChange={v => setQcMoisture(v)}
            min={0}
            max={100}
            step={0.01}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Ghi chú</Text>
          <Input.TextArea
            value={qcNotes}
            onChange={e => setQcNotes(e.target.value)}
            rows={2}
          />
        </div>
      </Modal>
    </div>
  )
}

export default BlendDetailPage
