// ============================================================================
// PRODUCTION TAB — Tab Sản xuất trong Detail Panel v4
// File: src/pages/sales/components/ProductionTab.tsx
// BP Sản xuất nhập: ready_date, quản lý container, theo dõi tiến độ
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Row,
  Col,
  Tag,
  Button,
  Space,
  Progress,
  Steps,
  DatePicker,
  Descriptions,
  Spin,
  Empty,
  Alert,
  Collapse,
  message,
} from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  SaveOutlined,
  CheckCircleOutlined,
  LinkOutlined,
  ThunderboltOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import { salesProductionService, type ProductionProgress } from '../../../services/sales/salesProductionService'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import type { SalesRole } from '../../../services/sales/salesPermissionService'
import OrderActionButtons from './OrderActionButtons'
import StockPickerSection from './StockPickerSection'

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  order: SalesOrder
  salesRole: SalesRole | null
  editable: boolean
  onSaved: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProductionTab({ order, salesRole, editable, onSaved }: Props) {
  const navigate = useNavigate()
  const [productionProgress, setProductionProgress] = useState<ProductionProgress | null>(null)
  const [progressLoading, setProgressLoading] = useState(false)
  const [readyDate, setReadyDate] = useState<dayjs.Dayjs | null>(
    order.ready_date ? dayjs(order.ready_date) : null,
  )
  const [savingReadyDate, setSavingReadyDate] = useState(false)

  const canEdit = editable && (salesRole === 'production' || salesRole === 'admin')

  // ── Load production progress ──
  const loadProgress = useCallback(async () => {
    if (!order.production_order_id) return
    setProgressLoading(true)
    try {
      const data = await salesProductionService.getProductionProgress(order.id)
      setProductionProgress(data)
    } catch {
      // silent — may not have production order
    } finally {
      setProgressLoading(false)
    }
  }, [order.id, order.production_order_id])

  useEffect(() => {
    loadProgress()
  }, [loadProgress])

  // ── Save ready date ──
  const handleSaveReadyDate = async () => {
    setSavingReadyDate(true)
    try {
      await salesOrderService.updateFields(order.id, {
        ready_date: readyDate?.format('YYYY-MM-DD') || null,
      } as any)
      message.success('Đã cập nhật ngày sẵn sàng')
      onSaved()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSavingReadyDate(false)
    }
  }

  // ── Computed ──
  const totalBales = order.total_bales || 0
  const containerCount = order.container_count || 0
  const balesPerContainer = order.bales_per_container || 576

  // ═══════════════════════════════��══════════════════════════════
  // PRODUCTION PROGRESS SECTION
  // ══════════════════════════════════════════════════════════════

  const renderProductionProgress = () => {
    if (!order.production_order_id) {
      // Cho phép tạo Lệnh SX ở 2 status:
      //  - confirmed: chưa start sản xuất, đang xếp hàng đợi
      //  - producing: đã chuyển status nhưng chưa có Lệnh SX (vd user revert
      //    từ packing về producing để cấp lại NVL/làm lại lô mới)
      const canCreate = ['confirmed', 'producing'].includes(order.status) &&
        (salesRole === 'production' || salesRole === 'admin')
      return (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có lệnh sản xuất"
          />
          {canCreate && (
            <Alert
              type="info"
              showIcon
              icon={<ThunderboltOutlined />}
              style={{ marginTop: 12 }}
              message="Tạo lệnh sản xuất cho đơn này"
              description="Tạo lệnh SX cần chọn các lô NVL (batch) trong kho. Mở trang chi tiết đầy đủ để check NVL và tạo lệnh."
              action={
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={() => navigate(`/sales/orders/${order.id}?tab=production`)}
                  style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                >
                  Mở trang chi tiết
                </Button>
              }
            />
          )}
        </Card>
      )
    }

    if (progressLoading) {
      return (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        </Card>
      )
    }

    if (!productionProgress) return null

    const po = productionProgress.production_order
    const stages = productionProgress.stages || []
    const progress = productionProgress.overall_progress || 0
    const isCompleted = productionProgress.is_completed || false
    const currentIdx = stages.findIndex(s => s.status === 'in_progress')

    const getStepStatus = (status: string): 'wait' | 'process' | 'finish' | 'error' => {
      switch (status) {
        case 'completed': return 'finish'
        case 'in_progress': return 'process'
        case 'failed': return 'error'
        default: return 'wait'
      }
    }

    return (
      <Card
        size="small"
        title="Tiến độ sản xuất"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => window.open(`/wms/production/${order.production_order_id}`, '_blank')}
          >
            Xem lệnh SX
          </Button>
        }
      >
        {/* Stats row */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <div style={{ fontSize: 11, color: '#999' }}>Mã lệnh SX</div>
            <div style={{ fontWeight: 600, color: '#1B4D3E' }}>{po?.code || '—'}</div>
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 11, color: '#999' }}>SL mục tiêu</div>
            <div style={{ fontWeight: 600 }}>{((po?.target_quantity || order.quantity_kg || 0) / 1000).toFixed(1)} tấn</div>
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 11, color: '#999' }}>Trạng thái</div>
            <Tag color={isCompleted ? 'green' : po?.status === 'in_progress' ? 'orange' : 'default'}>
              {isCompleted ? 'Hoàn thành' : po?.status === 'in_progress' ? 'Đang SX' : po?.status || 'Nháp'}
            </Tag>
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 11, color: '#999' }}>Tiến độ</div>
            <Progress percent={progress} size="small" status={isCompleted ? 'success' : 'active'} strokeColor="#1B4D3E" />
          </Col>
        </Row>

        {/* 5-stage progress */}
        <Steps
          current={currentIdx >= 0 ? currentIdx : (isCompleted ? stages.length : 0)}
          size="small"
          items={stages.map((stage) => ({
            title: stage.name,
            status: getStepStatus(stage.status),
            description: stage.completed_at
              ? dayjs(stage.completed_at).format('DD/MM')
              : stage.started_at
              ? `Bắt đầu ${dayjs(stage.started_at).format('DD/MM')}`
              : undefined,
          }))}
        />

        {/* Completion badge */}
        {isCompleted && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 13, padding: '4px 12px' }}>
              Sản xuất hoàn thành — Sẵn sàng đóng gói
            </Tag>
          </div>
        )}
      </Card>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // READY DATE + ORDER INFO
  // ══════════════════════════════════════════════════════════════

  const renderReadyDate = () => (
    <Card size="small" title="Thông tin sản xuất" style={{ marginBottom: 16 }}>
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Grade"><Tag color="green">{order.grade}</Tag></Descriptions.Item>
        <Descriptions.Item label="Số lượng">{order.quantity_tons} tấn ({(order.quantity_kg || order.quantity_tons * 1000).toLocaleString()} kg)</Descriptions.Item>
        <Descriptions.Item label="Tổng bành">{totalBales}</Descriptions.Item>
        <Descriptions.Item label="Bành/container">{balesPerContainer}</Descriptions.Item>
        <Descriptions.Item label="Container cần">{containerCount} x {order.container_type || '20ft'}</Descriptions.Item>
        <Descriptions.Item label="KL bành">{order.bale_weight_kg || 33.33} kg</Descriptions.Item>
        <Descriptions.Item label="Ngày sẵn sàng" span={2}>
          {canEdit ? (
            <Space>
              <DatePicker
                value={readyDate}
                onChange={setReadyDate}
                format="DD/MM/YYYY"
                placeholder="Chọn ngày..."
                size="small"
              />
              <Button
                type="primary"
                size="small"
                icon={<SaveOutlined />}
                loading={savingReadyDate}
                onClick={handleSaveReadyDate}
                disabled={
                  readyDate?.format('YYYY-MM-DD') === order.ready_date ||
                  (!readyDate && !order.ready_date)
                }
                style={{ background: '#1677ff' }}
              >
                Lưu
              </Button>
            </Space>
          ) : (
            <span>{order.ready_date ? dayjs(order.ready_date).format('DD/MM/YYYY') : '—'}</span>
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )

  // ══════════════════════════════════════════════════════════════
  // ĐÓNG GÓI — chuyển sang tab Đóng gói (tránh trùng nhập cont/seal)
  // ══════════════════════════════════════════════════════════════
  // Trước đây tab này cũng cho thêm/sửa/xóa container + "Tạo tự động",
  // trùng hệt với tab Đóng gói (chia lô + nhập cont/seal). Để 1 chỗ nhập
  // duy nhất (giảm sai sót), việc đó dồn về tab Đóng gói; ở đây chỉ còn lối tắt.

  const renderPackingLink = () => (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <Tag color="blue">Container {containerCount} × {order.container_type || '20ft'}</Tag>
          <span style={{ color: '#6b7280', fontSize: 13 }}>
            Chia lô · nhập số container / seal đã chuyển sang tab <b>Đóng gói</b> (nhập 1 chỗ, tránh sai sót).
          </span>
        </Space>
        <Button
          icon={<ArrowRightOutlined />}
          onClick={() => navigate(`/sales/orders/${order.id}/packing`)}
          style={{ borderColor: '#1B4D3E', color: '#1B4D3E' }}
        >
          Mở Đóng gói
        </Button>
      </div>
    </Card>
  )

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  // Hiển thị StockPickerSection (MTS flow) khi:
  //  - Đơn ở status confirmed/producing/ready
  //  - Đơn KHÔNG có production_order_id (nếu đã có Lệnh SX → đi flow MTO)
  //  - Role production hoặc admin
  const showStockPicker =
    order.status &&
    ['confirmed', 'producing', 'ready'].includes(order.status) &&
    !order.production_order_id &&
    (salesRole === 'production' || salesRole === 'admin')

  // ── Simple summary header — BP Sản xuất/QC nhìn vào biết ngay đơn cần gì ──
  const renderSimpleHeader = () => {
    const etdDays = order.etd
      ? Math.ceil((new Date(order.etd).getTime() - Date.now()) / 86400000)
      : null
    const etdColor = etdDays === null ? 'default'
      : etdDays < 0 ? 'red'
      : etdDays <= 7 ? 'orange'
      : 'blue'
    const etdLabel = etdDays === null ? 'Chưa có ETD'
      : etdDays < 0 ? `Quá ${Math.abs(etdDays)} ngày`
      : `Còn ${etdDays} ngày`

    return (
      <div style={{
        padding: '14px 16px',
        background: '#f8f9fa',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>
          THÔNG TIN CẦN BIẾT CHO ĐƠN HÀNG
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Grade</div>
            <Tag color="green" style={{ marginInlineEnd: 0, fontSize: 12, fontWeight: 600 }}>
              {order.grade || '—'}
            </Tag>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Số lượng</div>
            <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600 }}>
              {order.quantity_tons || 0} tấn
              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
                ({order.total_bales || 0} bành)
              </span>
            </span>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>ETD</div>
            <Tag color={etdColor} style={{ marginInlineEnd: 0, fontSize: 12, fontWeight: 600 }}>
              {etdLabel}
            </Tag>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Container</div>
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
              {order.container_count || 0} × {order.container_type || '20ft'}
            </span>
          </div>
        </div>
        <div style={{
          padding: '8px 10px',
          background: '#fffbe6',
          border: '1px solid #ffe58f',
          borderRadius: 6,
          fontSize: 12,
          color: '#874d00',
          marginBottom: 8,
        }}>
          💡 BP Sản xuất / QC: chỉ cần xác nhận đơn này đã sẵn sàng. Bấm nút bên phải để chuyển stage tiếp theo (chi tiết SX có thể xem trong section bên dưới).
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <OrderActionButtons order={order} salesRole={salesRole} onSaved={onSaved} tab="production" size="middle" />
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {renderSimpleHeader()}
      {renderReadyDate()}
      {renderPackingLink()}

      {/* Chi tiết SX + StockPicker — collapsed, không clutter view chính */}
      <Collapse
        size="small"
        ghost
        style={{ marginTop: 8 }}
        items={[
          {
            key: 'detail',
            label: <span style={{ fontSize: 12, color: '#6b7280' }}>📊 Chi tiết tiến độ sản xuất + nguồn NVL</span>,
            children: (
              <div style={{ paddingTop: 4 }}>
                {showStockPicker && (
                  <StockPickerSection
                    order={order}
                    canEdit={editable && (salesRole === 'production' || salesRole === 'admin')}
                    onSaved={onSaved}
                  />
                )}
                {renderProductionProgress()}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
