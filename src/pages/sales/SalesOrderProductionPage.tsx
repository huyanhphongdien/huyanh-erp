// ============================================================================
// SALES ORDER PRODUCTION PAGE — Trang tạo/quản lý Lệnh sản xuất cho 1 đơn bán
// File: src/pages/sales/SalesOrderProductionPage.tsx
// Tách từ tab "Sản xuất" (bản đầy đủ, luồng MTO: kiểm tra NVL → chọn lô → tạo
// lệnh SX). Tab Sản xuất trong 2 dạng xem giờ dùng bản GỌN (ProductionTab) và
// link ra trang này khi cần tạo lệnh. Primary color: #1B4D3E
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
  Progress,
  Steps,
  Result,
  Alert,
  Checkbox,
  Popconfirm,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { salesOrderService } from '../../services/sales/salesOrderService'
import { salesProductionService } from '../../services/sales/salesProductionService'
import type { NvlAvailability, ProductionProgress } from '../../services/sales/salesProductionService'
import type { SalesOrder, SalesOrderStatus } from '../../services/sales/salesTypes'
import { ORDER_STATUS_LABELS, soDisplayCode } from '../../services/sales/salesTypes'
import { getSalesRole } from '../../services/sales/salesPermissionService'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography

const formatDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '')

export default function SalesOrderProductionPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const [nvlAvailability, setNvlAvailability] = useState<NvlAvailability | null>(null)
  const [nvlLoading, setNvlLoading] = useState(false)
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([])
  const [createProdLoading, setCreateProdLoading] = useState(false)
  const [productionProgress, setProductionProgress] = useState<ProductionProgress | null>(null)
  const [progressLoading, setProgressLoading] = useState(false)

  // ── Load order ──
  const loadOrder = useCallback(async () => {
    if (!orderId) return
    try {
      setLoading(true)
      const o = await salesOrderService.getById(orderId)
      setOrder(o)
    } catch (err) {
      console.error(err)
      message.error('Không thể tải thông tin đơn hàng')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  // ── Auto-load progress khi đơn đã có lệnh SX ──
  const handleLoadProgress = useCallback(async () => {
    if (!orderId) return
    try {
      setProgressLoading(true)
      const result = await salesProductionService.getProductionProgress(orderId)
      setProductionProgress(result)
    } catch (err: any) {
      message.error(err?.message || 'Không thể tải tiến độ sản xuất')
    } finally {
      setProgressLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (order?.production_order_id) handleLoadProgress()
  }, [order?.production_order_id, handleLoadProgress])

  // ── Handlers ──
  const handleCheckNvl = async () => {
    if (!orderId) return
    try {
      setNvlLoading(true)
      const result = await salesProductionService.checkNvlAvailability(orderId)
      setNvlAvailability(result)
      setSelectedBatchIds(result.suitable_batches.map((b) => b.batch_id))
    } catch (err: any) {
      message.error(err?.message || 'Không thể kiểm tra NVL')
    } finally {
      setNvlLoading(false)
    }
  }

  const handleCreateProduction = async () => {
    if (!orderId) return
    try {
      setCreateProdLoading(true)
      const prodOrder = await salesProductionService.createProductionFromSalesOrder(
        orderId,
        selectedBatchIds.length > 0 ? selectedBatchIds : undefined,
      )
      message.success(`Đã tạo lệnh sản xuất: ${prodOrder.code}`)
      loadOrder()
    } catch (err: any) {
      message.error(err?.message || 'Không thể tạo lệnh sản xuất')
    } finally {
      setCreateProdLoading(false)
    }
  }

  const handleMarkReady = async () => {
    if (!order) return
    try {
      setActionLoading(true)
      await salesOrderService.updateStatus(order.id, 'ready', {
        actor: { id: user?.employee_id || user?.id || null, name: user?.full_name || user?.email || null },
      })
      message.success('Đã chuyển trạng thái: Sẵn sàng giao hàng')
      loadOrder()
    } catch (err: any) {
      message.error(err?.message || 'Không thể cập nhật trạng thái')
    } finally {
      setActionLoading(false)
    }
  }

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
  // BODY — luồng đầy đủ (Case 1: đã có lệnh SX · Case 2: chưa có)
  // ══════════════════════════════════════════════════════════════
  const renderBody = () => {
    // ── Case 1: Has production order ──
    if (order.production_order_id) {
      if (progressLoading) {
        return (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" tip="Đang tải tiến độ sản xuất..." />
          </div>
        )
      }

      const po = productionProgress?.production_order
      const stages = productionProgress?.stages || []
      const progress = productionProgress?.overall_progress || 0
      const isCompleted = productionProgress?.is_completed || false

      const getStepStatus = (status: string): 'wait' | 'process' | 'finish' | 'error' => {
        switch (status) {
          case 'completed': return 'finish'
          case 'in_progress': return 'process'
          case 'failed': return 'error'
          default: return 'wait'
        }
      }

      const currentStepIdx = stages.findIndex((s) => s.status === 'in_progress')

      return (
        <Row gutter={[16, 16]}>
          {/* Production info */}
          <Col xs={24}>
            <Card
              title="Lệnh sản xuất"
              size="small"
              extra={
                <Button
                  type="link"
                  icon={<LinkOutlined />}
                  onClick={() => navigate(`/wms/production/${order.production_order_id}`)}
                >
                  Xem chi tiết lệnh SX &rarr;
                </Button>
              }
            >
              <Row gutter={16}>
                <Col xs={12} sm={6}>
                  <Statistic title="Mã lệnh SX" value={po?.code || order.production_order_id || ''} valueStyle={{ fontSize: 14, color: '#1B4D3E' }} />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic title="Cấp mủ" value={po?.target_grade || order.grade} valueStyle={{ fontSize: 14, color: '#1890ff' }} />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic title="SL mục tiêu" value={po?.target_quantity || order.quantity_kg || 0} suffix="kg" valueStyle={{ fontSize: 14 }} />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Trạng thái SX"
                    value={
                      po?.status === 'completed' ? 'Hoàn thành' :
                      po?.status === 'in_progress' ? 'Đang SX' :
                      po?.status === 'cancelled' ? 'Đã hủy' :
                      po?.status || 'Nháp'
                    }
                    valueStyle={{
                      fontSize: 14,
                      color: po?.status === 'completed' ? '#52c41a' :
                             po?.status === 'in_progress' ? '#fa8c16' :
                             po?.status === 'cancelled' ? '#ff4d4f' : '#666',
                    }}
                  />
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Progress bar */}
          <Col xs={24}>
            <Card title="Tiến độ tổng thể" size="small">
              <Progress
                percent={progress}
                status={isCompleted ? 'success' : 'active'}
                strokeColor={isCompleted ? '#52c41a' : '#1B4D3E'}
                style={{ marginBottom: 24 }}
              />
              <Steps
                current={currentStepIdx >= 0 ? currentStepIdx : (isCompleted ? 5 : 0)}
                size="small"
                items={stages.map((stage) => ({
                  title: stage.name,
                  status: getStepStatus(stage.status),
                  description: stage.completed_at
                    ? `Xong: ${formatDate(stage.completed_at)}`
                    : stage.started_at
                    ? `Bắt đầu: ${formatDate(stage.started_at)}`
                    : undefined,
                }))}
              />
            </Card>
          </Col>

          {/* Completed state */}
          {isCompleted && (
            <Col xs={24}>
              <Result
                status="success"
                title="Sản xuất hoàn thành!"
                subTitle={`Lệnh sản xuất ${po?.code || ''} đã hoàn thành. Sản phẩm sẵn sàng để đóng gói và giao hàng.`}
                extra={
                  order.status === 'producing' ? (
                    <Button
                      type="primary"
                      size="large"
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                      onClick={handleMarkReady}
                      loading={actionLoading}
                      icon={<CheckCircleOutlined />}
                    >
                      Chuyển trạng thái &rarr; Sẵn sàng
                    </Button>
                  ) : (
                    <Tag color="green" style={{ fontSize: 14, padding: '4px 16px' }}>
                      Đã sẵn sàng giao hàng
                    </Tag>
                  )
                }
              />
            </Col>
          )}

          {/* Actual output info if completed */}
          {isCompleted && po?.actual_quantity && (
            <Col xs={24}>
              <Card title="Kết quả sản xuất" size="small">
                <Row gutter={16}>
                  <Col xs={12} sm={6}>
                    <Statistic title="SL thực tế" value={po.actual_quantity} suffix="kg" valueStyle={{ color: '#1B4D3E' }} />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="Cấp mủ đạt" value={po.final_grade || '-'} valueStyle={{ color: '#1890ff' }} />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="DRC" value={po.final_drc || '-'} suffix="%" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="Hiệu suất" value={po.yield_percent || '-'} suffix="%" />
                  </Col>
                </Row>
              </Card>
            </Col>
          )}
        </Row>
      )
    }

    // ── Case 2: No production order yet ──
    const canCreate = ['confirmed', 'draft'].includes(order.status)

    const nvlBatchColumns: ColumnsType<NvlAvailability['suitable_batches'][0]> = [
      {
        title: '',
        key: 'select',
        width: 40,
        render: (_: unknown, record) => (
          <Checkbox
            checked={selectedBatchIds.includes(record.batch_id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedBatchIds((prev) => [...prev, record.batch_id])
              } else {
                setSelectedBatchIds((prev) => prev.filter((id) => id !== record.batch_id))
              }
            }}
          />
        ),
      },
      {
        title: 'Mã lô',
        dataIndex: 'batch_no',
        key: 'batch_no',
        render: (v: string) => <Text strong style={{ color: '#1B4D3E' }}>{v}</Text>,
      },
      {
        title: 'Khối lượng (kg)',
        dataIndex: 'weight_kg',
        key: 'weight_kg',
        align: 'right' as const,
        render: (v: number) => v.toLocaleString('vi-VN'),
      },
      {
        title: 'DRC (%)',
        dataIndex: 'drc',
        key: 'drc',
        align: 'right' as const,
        render: (v: number) => <Tag color="blue">{v}%</Tag>,
      },
      {
        title: 'QC',
        dataIndex: 'qc_status',
        key: 'qc_status',
        render: (v: string) => (
          <Tag color={v === 'passed' ? 'green' : v === 'failed' ? 'red' : 'default'}>
            {v === 'passed' ? 'Đạt' : v === 'failed' ? 'Không đạt' : v}
          </Tag>
        ),
      },
      { title: 'Kho', dataIndex: 'warehouse_name', key: 'warehouse_name' },
      {
        title: 'Ngày tồn',
        dataIndex: 'days_in_stock',
        key: 'days_in_stock',
        align: 'right' as const,
        render: (v: number) => `${v} ngày`,
      },
    ]

    const selectedWeight = nvlAvailability
      ? nvlAvailability.suitable_batches
          .filter((b) => selectedBatchIds.includes(b.batch_id))
          .reduce((sum, b) => sum + b.weight_kg, 0)
      : 0

    return (
      <Row gutter={[16, 16]}>
        {/* NVL Check Card */}
        <Col xs={24}>
          <Card
            title="Kiểm tra nguyên vật liệu (NVL)"
            size="small"
            extra={
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleCheckNvl}
                loading={nvlLoading}
                style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Kiểm tra NVL
              </Button>
            }
          >
            {!nvlAvailability && !nvlLoading && (
              <Empty description="Nhấn 'Kiểm tra NVL' để xem nguyên vật liệu khả dụng" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}

            {nvlLoading && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin tip="Đang kiểm tra NVL khả dụng..." />
              </div>
            )}

            {nvlAvailability && !nvlLoading && (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={12} sm={6}>
                    <Statistic title="NVL cần (kg)" value={nvlAvailability.required_kg} valueStyle={{ color: '#1B4D3E' }} suffix="kg" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="NVL khả dụng (kg)" value={nvlAvailability.available_kg} valueStyle={{ color: nvlAvailability.is_sufficient ? '#52c41a' : '#fa8c16' }} suffix="kg" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="Đã chọn (kg)" value={selectedWeight} valueStyle={{ color: '#1890ff' }} suffix="kg" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="Thiếu (kg)" value={nvlAvailability.shortage_kg} valueStyle={{ color: nvlAvailability.shortage_kg > 0 ? '#ff4d4f' : '#52c41a' }} suffix="kg" />
                  </Col>
                </Row>

                {nvlAvailability.is_sufficient ? (
                  <Alert
                    type="success"
                    showIcon
                    message="Đủ nguyên vật liệu"
                    description={`Có đủ ${nvlAvailability.available_kg.toLocaleString('vi-VN')} kg NVL trong kho để sản xuất ${nvlAvailability.required_kg.toLocaleString('vi-VN')} kg cần thiết.`}
                    style={{ marginBottom: 16 }}
                  />
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    message="Thiếu nguyên vật liệu"
                    description={`Còn thiếu ${nvlAvailability.shortage_kg.toLocaleString('vi-VN')} kg NVL. Có thể vẫn tạo lệnh SX với số lượng hiện có.`}
                    style={{ marginBottom: 16 }}
                  />
                )}

                {nvlAvailability.suitable_batches.length > 0 ? (
                  <Table
                    dataSource={nvlAvailability.suitable_batches}
                    columns={nvlBatchColumns}
                    rowKey="batch_id"
                    pagination={false}
                    size="small"
                    bordered
                    title={() => (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong>Lô NVL phù hợp ({nvlAvailability.suitable_batches.length} lô)</Text>
                        <Space>
                          <Button size="small" onClick={() => setSelectedBatchIds(nvlAvailability.suitable_batches.map((b) => b.batch_id))}>Chọn tất cả</Button>
                          <Button size="small" onClick={() => setSelectedBatchIds([])}>Bỏ chọn</Button>
                        </Space>
                      </div>
                    )}
                  />
                ) : (
                  <Alert
                    type="error"
                    showIcon
                    message="Không tìm thấy lô NVL phù hợp"
                    description="Không có lô nguyên vật liệu nào đạt yêu cầu DRC và QC trong kho."
                  />
                )}
              </>
            )}
          </Card>
        </Col>

        {/* Create production button */}
        {canCreate && nvlAvailability && (
          <Col xs={24}>
            <Card size="small">
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <Space direction="vertical" size={12}>
                  <Text type="secondary">
                    Đã chọn {selectedBatchIds.length} lô — Tổng {selectedWeight.toLocaleString('vi-VN')} kg
                  </Text>
                  <Popconfirm
                    title="Tạo lệnh sản xuất?"
                    description={`Sẽ tạo lệnh SX cho đơn hàng ${soDisplayCode(order)} với ${selectedBatchIds.length} lô NVL đã chọn.`}
                    onConfirm={handleCreateProduction}
                    okText="Tạo lệnh SX"
                    cancelText="Hủy"
                  >
                    <Button
                      type="primary"
                      size="large"
                      icon={<ThunderboltOutlined />}
                      loading={createProdLoading}
                      disabled={selectedBatchIds.length === 0}
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                    >
                      Tạo lệnh sản xuất
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
            </Card>
          </Col>
        )}

        {/* Info if not in correct status */}
        {!canCreate && !order.production_order_id && (
          <Col xs={24}>
            <Alert
              type="info"
              showIcon
              message="Chưa thể tạo lệnh sản xuất"
              description={`Đơn hàng đang ở trạng thái "${ORDER_STATUS_LABELS[order.status as SalesOrderStatus]}". Cần xác nhận đơn hàng trước khi tạo lệnh sản xuất.`}
            />
          </Col>
        )}
      </Row>
    )
  }

  const canManage = salesRole === 'production' || salesRole === 'admin'

  return (
    <div style={{ padding: 24 }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/sales/orders')}>Đơn hàng</a> },
          { title: <a onClick={() => navigate(`/sales/orders/${orderId}`)}>{soDisplayCode(order)}</a> },
          { title: 'Sản xuất' },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/sales/orders/${orderId}`)} />
          <Title level={4} style={{ margin: 0 }}>
            <ToolOutlined style={{ marginRight: 8 }} />
            Sản xuất — {soDisplayCode(order)}
          </Title>
        </Space>
      </div>

      {!canManage && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Chỉ xem"
          description="Chỉ Bộ phận Sản xuất hoặc Quản trị mới tạo/điều chỉnh lệnh sản xuất."
        />
      )}

      {renderBody()}
    </div>
  )
}
