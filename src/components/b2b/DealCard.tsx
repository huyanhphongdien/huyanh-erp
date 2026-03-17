// ============================================================================
// DEAL CARD — Hiển thị Deal trong Chat sau khi xác nhận booking
// File: src/components/b2b/DealCard.tsx
//
// Hiện trong message bubble khi message_type = 'deal'
// Actions phân quyền theo viewerType (factory / partner)
// ============================================================================

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
} from '@ant-design/icons'
import type { DealCardMetadata } from '../../types/b2b.types'
import { PRODUCT_TYPE_LABELS } from '../../services/b2b/chatMessageService'
import { DEAL_STATUS_LABELS, DEAL_STATUS_COLORS } from '../../services/b2b/dealService'
import type { DealStatus } from '../../services/b2b/dealService'

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
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (value: number): string => {
  return value.toLocaleString('vi-VN')
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
  const showActions = status === 'processing' || status === 'accepted'

  return (
    <Card
      size="small"
      style={{
        width: 320,
        background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
        borderRadius: 12,
        border: 'none',
      }}
      styles={{ body: { padding: 16 } }}
    >
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text strong style={{ color: '#fff', fontSize: 14 }}>
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
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Số lượng</Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>{quantityTons} tấn</Text>
          </Col>
          <Col span={12}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>DRC dự kiến</Text>
            <br />
            <Text strong style={{ color: '#fff', fontSize: 13 }}>{metadata.expected_drc}%</Text>
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
            <EnvironmentOutlined style={{ color: '#60a5fa', fontSize: 14 }} />
            <Text style={{ color: '#fff', fontSize: 12 }}>{metadata.pickup_location}</Text>
          </div>
        )}

        <Divider style={{ margin: '12px 0', borderColor: 'rgba(255,255,255,0.2)' }} />

        {/* Giá trị */}
        <div style={{ textAlign: 'right' }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Giá trị ước tính</Text>
          <br />
          <Text strong style={{ color: '#ffd700', fontSize: 16 }}>
            {formatCurrency(metadata.estimated_value)} VNĐ
          </Text>
        </div>
      </div>

      {/* Tài chính */}
      {(metadata.total_advanced > 0) && (
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
              {formatCurrency(metadata.total_advanced)} VNĐ
            </Text>
          </Row>
          <Row justify="space-between">
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              Còn lại
            </Text>
            <Text strong style={{ color: '#fbbf24', fontSize: 13 }}>
              {formatCurrency(metadata.balance_due)} VNĐ
            </Text>
          </Row>
        </div>
      )}

      {/* Action Buttons */}
      {showActions && (
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Ứng thêm - chỉ factory */}
          {viewerType === 'factory' && onAddAdvance && (
            <Button
              size="small"
              icon={<PlusOutlined />}
              style={{
                flex: 1,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.15)',
                borderColor: 'rgba(255,255,255,0.3)',
                color: '#fff',
                fontSize: 12,
              }}
              onClick={onAddAdvance}
            >
              Ứng thêm
            </Button>
          )}

          {/* Giao hàng - cả 2 bên */}
          {onRecordDelivery && (
            <Button
              size="small"
              icon={<SendOutlined />}
              style={{
                flex: 1,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.15)',
                borderColor: 'rgba(255,255,255,0.3)',
                color: '#fff',
                fontSize: 12,
              }}
              onClick={onRecordDelivery}
            >
              Giao hàng
            </Button>
          )}

          {/* Chi tiết - cả 2 bên */}
          {onViewDetails && (
            <Button
              size="small"
              icon={<RightOutlined />}
              style={{
                flex: 1,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.25)',
                borderColor: 'rgba(255,255,255,0.4)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
              }}
              onClick={onViewDetails}
            >
              Chi tiết
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

export default DealCard
