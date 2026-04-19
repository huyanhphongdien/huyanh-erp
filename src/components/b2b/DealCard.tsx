// ============================================================================
// DEAL CARD — Hiển thị Deal trong Chat sau khi xác nhận booking
// File: src/components/b2b/DealCard.tsx
//
// Hiện trong message bubble khi message_type = 'deal'
// Actions phân quyền theo viewerType (factory / partner)
// UI thay đổi theo status: processing → accepted → settled → cancelled
// ============================================================================

import type { CSSProperties } from 'react'
import {
  Card,
  Button,
  Typography,
  Tag,
  Divider,
  Row,
  Col,
  Space,
} from 'antd'
import {
  CheckCircleOutlined,
  PlusOutlined,
  SendOutlined,
  RightOutlined,
  EnvironmentOutlined,
  WarningOutlined,
  DollarOutlined,
  FileDoneOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type { DealCardMetadata } from '../../types/b2b.types'
import {
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  DEAL_STATUS_GRADIENT,
  PRODUCT_TYPE_LABELS,
  type DealStatus,
} from '../../types/b2b.constants'

const { Text } = Typography

// ============================================
// TYPES
// ============================================

interface DealCardProps {
  metadata: DealCardMetadata
  viewerType: 'factory' | 'partner'
  onAddAdvance?: () => void
  onRecordDelivery?: () => void
  onViewDetails?: () => void
  onAcceptDeal?: () => void
  onCreateSettlement?: () => void
  onViewSettlement?: () => void
  // Partner-only
  onAcknowledgeAdvance?: () => void  // Partner xác nhận đã nhận tạm ứng
  onRaiseDispute?: () => void         // Partner khiếu nại DRC variance
  onViewDispute?: () => void          // Xem dispute đang mở (cả 2 bên)
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (value: number): string => {
  return value.toLocaleString('vi-VN')
}

// Gradient theo status — re-export từ b2b.constants
const STATUS_GRADIENT = DEAL_STATUS_GRADIENT

// ============================================
// PROGRESS BAR — 5 mốc lifecycle
// ============================================

interface DealProgressProps {
  status: DealStatus
  stockInCount?: number
  qcStatus?: string
}

const DealProgress = ({ status, stockInCount, qcStatus }: DealProgressProps) => {
  const steps = [
    { key: 'confirmed', label: 'Chốt', done: true },
    { key: 'stock_in', label: 'Nhập kho', done: (stockInCount || 0) > 0 },
    { key: 'qc',       label: 'QC',      done: !!qcStatus && qcStatus !== 'pending' },
    { key: 'accepted', label: 'Duyệt',   done: status === 'accepted' || status === 'settled' },
    { key: 'settled',  label: 'Quyết toán', done: status === 'settled' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '8px 4px',
        marginBottom: 10,
      }}
    >
      {steps.map((step, idx) => (
        <div key={step.key} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 0 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: step.done ? '#fff' : 'rgba(255,255,255,0.25)',
                border: step.done ? '2px solid #fff' : '2px solid rgba(255,255,255,0.4)',
                flexShrink: 0,
              }}
            />
            <Text
              style={{
                color: step.done ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: 9,
                marginTop: 2,
                whiteSpace: 'nowrap',
                fontWeight: step.done ? 600 : 400,
              }}
            >
              {step.label}
            </Text>
          </div>
          {idx < steps.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 2,
                background: step.done && steps[idx + 1].done
                  ? '#fff'
                  : step.done
                    ? 'linear-gradient(to right, #fff, rgba(255,255,255,0.25))'
                    : 'rgba(255,255,255,0.25)',
                margin: '0 2px',
                marginBottom: 14,
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================
// COMPONENT
// ============================================

const DealCard = ({
  metadata,
  viewerType,
  onAddAdvance,
  onRecordDelivery,
  onViewDetails,
  onAcceptDeal,
  onCreateSettlement,
  onViewSettlement,
  onAcknowledgeAdvance,
  onRaiseDispute,
  onViewDispute,
}: DealCardProps) => {
  if (!metadata) {
    return (
      <Card size="small" style={{ width: 320, borderRadius: 12 }}>
        <Text type="secondary">Không có dữ liệu deal</Text>
      </Card>
    )
  }

  const status = (metadata.status || 'processing') as DealStatus
  const statusLabel = DEAL_STATUS_LABELS[status] || metadata.status
  const statusColor = DEAL_STATUS_COLORS[status] || 'blue'
  const productLabel = PRODUCT_TYPE_LABELS[metadata.product_type] || metadata.product_type
  const quantityTons = metadata.quantity_kg ? metadata.quantity_kg / 1000 : 0
  const gradient = STATUS_GRADIENT[status] || STATUS_GRADIENT.processing

  // === Điều kiện hiển thị buttons ===
  const isCancelled = status === 'cancelled'
  const isSettled = status === 'settled'
  const isAccepted = status === 'accepted'
  const isProcessing = status === 'processing'

  // Deal đủ điều kiện duyệt (dùng cho factory hiển thị nút "Duyệt")
  const readyToAccept =
    isProcessing &&
    (metadata.stock_in_count || 0) > 0 &&
    (metadata.actual_weight_kg || 0) > 0 &&
    (metadata.actual_drc || 0) > 0 &&
    metadata.qc_status !== 'pending' &&
    metadata.qc_status !== 'failed'

  // === DRC variance warning (|actual - expected| > 3%) ===
  const showDrcVariance =
    metadata.actual_drc != null &&
    metadata.expected_drc != null &&
    Math.abs(metadata.actual_drc - metadata.expected_drc) > 3
  const drcDiff = showDrcVariance
    ? (metadata.actual_drc! - metadata.expected_drc!)
    : 0

  // === Giá trị hiển thị: final_value (nếu có) > estimated_value ===
  const displayValue = metadata.final_value ?? metadata.estimated_value
  const isFinalValue = metadata.final_value != null

  return (
    <Card
      size="small"
      style={{
        width: 320,
        background: gradient,
        borderRadius: 12,
        border: 'none',
        opacity: isCancelled ? 0.75 : 1,
      }}
      styles={{ body: { padding: 16 } }}
    >
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text
            strong
            style={{
              color: '#fff',
              fontSize: 14,
              textDecoration: isCancelled ? 'line-through' : 'none',
            }}
          >
            <CheckCircleOutlined style={{ marginRight: 6 }} />
            DEAL {metadata.deal_number}
          </Text>
          <Tag color={statusColor}>{statusLabel}</Tag>
        </Space>
        {metadata.booking_code && (
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
            Từ: {metadata.booking_code}
          </Text>
        )}
      </div>

      {/* Progress bar (ẩn nếu cancelled) */}
      {!isCancelled && (
        <DealProgress
          status={status}
          stockInCount={metadata.stock_in_count}
          qcStatus={metadata.qc_status}
        />
      )}

      {/* Content */}
      <div
        style={{
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Row gutter={[8, 8]}>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Loại mủ</Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>{productLabel}</Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              {metadata.actual_weight_kg ? 'Đã nhập' : 'Số lượng'}
            </Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {metadata.actual_weight_kg
                ? `${(metadata.actual_weight_kg / 1000).toFixed(2)} / ${quantityTons} T`
                : `${quantityTons} tấn`}
            </Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              {metadata.actual_drc != null ? 'DRC thực' : 'DRC dự kiến'}
            </Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {metadata.actual_drc != null
                ? `${metadata.actual_drc}% (dk ${metadata.expected_drc}%)`
                : `${metadata.expected_drc}%`}
            </Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              Đơn giá ({metadata.price_unit === 'dry' ? 'khô' : 'ướt'})
            </Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>
              {formatCurrency(metadata.agreed_price)} đ/kg
            </Text>
          </Col>
        </Row>

        {/* Địa điểm */}
        {metadata.pickup_location && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <EnvironmentOutlined style={{ color: '#bae6fd', fontSize: 14 }} />
            <Text style={{ color: '#fff', fontSize: 12 }}>{metadata.pickup_location}</Text>
          </div>
        )}

        {/* Giao tại nhà máy */}
        {metadata.target_facility_code && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.18)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            <span style={{ fontSize: 14 }}>🏭</span>
            <Text style={{ color: '#fff', fontSize: 12 }}>
              Giao tại: <b>{metadata.target_facility_code}</b>
              {metadata.target_facility_name ? ` — ${metadata.target_facility_name}` : ''}
            </Text>
          </div>
        )}

        <Divider style={{ margin: '12px 0', borderColor: 'rgba(255,255,255,0.2)' }} />

        {/* Giá trị */}
        <div style={{ textAlign: 'right' }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
            {isFinalValue ? 'Giá trị thực tế' : 'Giá trị ước tính'}
          </Text>
          <br />
          <Text strong style={{ color: '#ffd700', fontSize: 16 }}>
            {formatCurrency(displayValue)} VNĐ
          </Text>
        </div>
      </div>

      {/* DRC Variance Warning + active dispute info */}
      {showDrcVariance && (
        <div
          style={{
            background: metadata.active_dispute_id
              ? 'rgba(239, 68, 68, 0.2)'
              : 'rgba(254, 215, 170, 0.2)',
            border: `1px solid ${metadata.active_dispute_id ? 'rgba(239,68,68,0.6)' : 'rgba(251,146,60,0.5)'}`,
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WarningOutlined style={{ color: metadata.active_dispute_id ? '#fca5a5' : '#fb923c', fontSize: 16 }} />
            <Text style={{ color: '#fff', fontSize: 12, flex: 1 }}>
              DRC thực <b>{metadata.actual_drc}%</b> {drcDiff < 0 ? 'thấp hơn' : 'cao hơn'} dự kiến{' '}
              <b>{metadata.expected_drc}%</b> ({drcDiff > 0 ? '+' : ''}{drcDiff.toFixed(1)}%)
            </Text>
          </div>
          {metadata.active_dispute_id && (
            <Text style={{ color: '#fecaca', fontSize: 11, marginLeft: 24 }}>
              ⚠ Có khiếu nại đang {metadata.active_dispute_status === 'investigating' ? 'xác minh' : 'mở'}
            </Text>
          )}
        </div>
      )}

      {/* Tài chính */}
      {(metadata.total_advanced > 0 || isAccepted || isSettled) && (
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <Row justify="space-between" style={{ marginBottom: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              Đã tạm ứng
            </Text>
            <Text strong style={{ color: '#4ade80', fontSize: 13 }}>
              {formatCurrency(metadata.total_advanced || 0)} VNĐ
            </Text>
          </Row>
          <Row justify="space-between">
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              Còn lại
            </Text>
            <Text strong style={{ color: '#fbbf24', fontSize: 13 }}>
              {formatCurrency(metadata.balance_due || 0)} VNĐ
            </Text>
          </Row>
        </div>
      )}

      {/* Cancel reason */}
      {isCancelled && metadata.cancel_reason && (
        <div
          style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
            display: 'flex',
            gap: 6,
          }}
        >
          <StopOutlined style={{ color: '#fca5a5', fontSize: 14 }} />
          <Text style={{ color: '#fff', fontSize: 12 }}>
            Lý do hủy: {metadata.cancel_reason}
          </Text>
        </div>
      )}

      {/* Pending advance ack — partner chưa xác nhận đã nhận tiền */}
      {viewerType === 'partner' && metadata.pending_ack_advance_id && onAcknowledgeAdvance && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid rgba(59, 130, 246, 0.5)',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, flex: 1 }}>
            Nhà máy đã chi {formatCurrency(metadata.pending_ack_advance_amount || 0)} VNĐ
            {metadata.pending_ack_advance_number ? ` (${metadata.pending_ack_advance_number})` : ''}
          </Text>
          <Button
            size="small"
            type="primary"
            onClick={onAcknowledgeAdvance}
            style={{ background: '#2563eb', borderColor: '#2563eb' }}
          >
            Đã nhận
          </Button>
        </div>
      )}

      {/* =================================================================
          ACTION BUTTONS — dynamic theo status & role
          ================================================================= */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {/* 1. PROCESSING — Ứng thêm + Giao hàng */}
        {isProcessing && viewerType === 'factory' && onAddAdvance && (
          <Button
            size="small"
            icon={<PlusOutlined />}
            style={btnStyle}
            onClick={onAddAdvance}
          >
            Ứng thêm
          </Button>
        )}
        {isProcessing && onRecordDelivery && (
          <Button
            size="small"
            icon={<SendOutlined />}
            style={btnStyle}
            onClick={onRecordDelivery}
          >
            Giao hàng
          </Button>
        )}

        {/* 2. PROCESSING đủ điều kiện → nút Duyệt (chỉ factory) */}
        {readyToAccept && viewerType === 'factory' && onAcceptDeal && (
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            style={{
              ...btnStyle,
              background: '#16a34a',
              borderColor: '#16a34a',
              fontWeight: 600,
            }}
            onClick={onAcceptDeal}
          >
            Duyệt Deal
          </Button>
        )}

        {/* 3. ACCEPTED → Tạo quyết toán (factory) */}
        {isAccepted && viewerType === 'factory' && onCreateSettlement && (
          <Button
            size="small"
            type="primary"
            icon={<DollarOutlined />}
            style={{
              ...btnStyle,
              background: '#7c3aed',
              borderColor: '#7c3aed',
              fontWeight: 600,
            }}
            onClick={onCreateSettlement}
          >
            Tạo quyết toán
          </Button>
        )}

        {/* 4. SETTLED → Xem phiếu QT (cả 2) */}
        {isSettled && onViewSettlement && (
          <Button
            size="small"
            icon={<FileDoneOutlined />}
            style={btnStyle}
            onClick={onViewSettlement}
          >
            Phiếu quyết toán
          </Button>
        )}

        {/* 5a. Partner: Khiếu nại DRC (khi có variance + chưa có dispute mở) */}
        {viewerType === 'partner'
          && showDrcVariance
          && !metadata.active_dispute_id
          && !isSettled
          && !isCancelled
          && onRaiseDispute && (
          <Button
            size="small"
            danger
            icon={<WarningOutlined />}
            style={{
              ...btnStyle,
              background: 'rgba(239,68,68,0.25)',
              borderColor: 'rgba(239,68,68,0.5)',
              color: '#fff',
            }}
            onClick={onRaiseDispute}
          >
            Khiếu nại DRC
          </Button>
        )}

        {/* 5b. Xem khiếu nại (cả 2 bên, khi có active dispute) */}
        {metadata.active_dispute_id && onViewDispute && (
          <Button
            size="small"
            icon={<WarningOutlined />}
            style={btnStyle}
            onClick={onViewDispute}
          >
            Xem khiếu nại
          </Button>
        )}

        {/* 6. Chi tiết — luôn có */}
        {onViewDetails && (
          <Button
            size="small"
            icon={<RightOutlined />}
            style={{
              ...btnStyle,
              background: 'rgba(255,255,255,0.25)',
              borderColor: 'rgba(255,255,255,0.4)',
              fontWeight: 600,
            }}
            onClick={onViewDetails}
          >
            Chi tiết
          </Button>
        )}
      </div>
    </Card>
  )
}

// Shared button styling
const btnStyle: CSSProperties = {
  flex: 1,
  minWidth: 90,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.15)',
  borderColor: 'rgba(255,255,255,0.3)',
  color: '#fff',
  fontSize: 12,
}

export default DealCard
