/**
 * BookingCard Component
 * Hiển thị phiếu chốt mủ trong chat
 * 
 * Features:
 * - Hiển thị thông tin booking
 * - Action buttons: Xác nhận, Thương lượng, Từ chối
 * - Status badge
 * - Negotiation modal
 */

import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Tag,
  Divider,
  Modal,
  Form,
  InputNumber,
  Input,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  SwapOutlined,
  FileTextOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { colors } from '../../config/antdTheme';

const { Text, Title } = Typography;
const { TextArea } = Input;

// ==========================================
// TYPES
// ==========================================

export interface BookingMetadata {
  code?: string;
  product_type?: string;
  quantity_tons?: number;
  drc_percent?: number;
  price_per_kg?: number;
  price_unit?: 'wet' | 'dry';
  estimated_value?: number;
  pickup_location?: string;
  delivery_date?: string;
  notes?: string;
  status?: 'pending' | 'confirmed' | 'negotiating' | 'rejected';
  counter_price?: number;
  negotiation_notes?: string;
  // Nhà máy đích nhận hàng
  target_facility_id?: string;
  target_facility_code?: string;
  target_facility_name?: string;
}

export interface BookingCardProps {
  metadata?: BookingMetadata | null;
  isOwn?: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
  onNegotiate?: (counterPrice: number, notes: string) => void;
}

// ==========================================
// STATUS CONFIG
// ==========================================

const statusConfig = {
  pending: {
    label: 'Chờ xác nhận',
    color: 'orange',
    bgColor: '#fff9e6',
  },
  confirmed: {
    label: 'Đã xác nhận',
    color: 'green',
    bgColor: '#f6ffed',
  },
  negotiating: {
    label: 'Đang thương lượng',
    color: 'blue',
    bgColor: '#e6f7ff',
  },
  rejected: {
    label: 'Đã từ chối',
    color: 'red',
    bgColor: '#fff2f0',
  },
};

// ==========================================
// PRODUCT TYPE CONFIG
// ==========================================

const productTypeLabels: Record<string, string> = {
  mu_nuoc: 'Mủ nước',
  mu_tap: 'Mủ tạp',
  mu_dong: 'Mủ đông',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ',
};

// ==========================================
// NEGOTIATION MODAL
// ==========================================

interface NegotiationModalProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (counterPrice: number, notes: string) => void;
  currentPrice?: number;
}

const NegotiationModal: React.FC<NegotiationModalProps> = ({
  open,
  onCancel,
  onSubmit,
  currentPrice,
}) => {
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      onSubmit(values.counterPrice, values.notes || '');
      form.resetFields();
      onCancel();
    });
  };

  return (
    <Modal
      title="Thương lượng giá"
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="Gửi đề nghị"
      cancelText="Hủy"
    >
      <Form form={form} layout="vertical" initialValues={{ counterPrice: currentPrice }}>
        <Form.Item
          name="counterPrice"
          label="Giá đề xuất (VNĐ/kg)"
          rules={[{ required: true, message: 'Vui lòng nhập giá đề xuất' }]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            step={1000}
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value!.replace(/,/g, '') as any}
            suffix="VNĐ/kg"
          />
        </Form.Item>
        <Form.Item name="notes" label="Ghi chú">
          <TextArea rows={3} placeholder="Lý do hoặc ghi chú thêm..." />
        </Form.Item>
        {currentPrice && (
          <div style={{ color: colors.textSecondary, fontSize: 13 }}>
            Giá đại lý đề xuất: {currentPrice.toLocaleString('vi-VN')} VNĐ/kg
          </div>
        )}
      </Form>
    </Modal>
  );
};

// ==========================================
// BOOKING CARD COMPONENT
// ==========================================

const BookingCard: React.FC<BookingCardProps> = ({
  metadata,
  isOwn = false,
  onConfirm,
  onReject,
  onNegotiate,
}) => {
  const [showNegotiateModal, setShowNegotiateModal] = useState(false);

  if (!metadata) {
    return (
      <Card size="small" style={{ maxWidth: 300, background: '#f5f5f5' }}>
        <Text type="secondary">Không có dữ liệu phiếu</Text>
      </Card>
    );
  }

  const {
    code,
    product_type,
    quantity_tons,
    drc_percent,
    price_per_kg,
    price_unit,
    estimated_value,
    pickup_location,
    target_facility_code,
    target_facility_name,
    delivery_date,
    notes,
    status = 'pending',
    counter_price,
    negotiation_notes,
  } = metadata;

  const statusConf = statusConfig[status] || statusConfig.pending;
  const productLabel = productTypeLabels[product_type || ''] || product_type || 'Mủ cao su';
  const showActions = !isOwn && status === 'pending';

  // Format currency
  const formatCurrency = (value?: number) => {
    if (!value) return '—';
    return value.toLocaleString('vi-VN') + ' VNĐ';
  };

  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('vi-VN');
  };

  return (
    <>
      <Card
        size="small"
        style={{
          maxWidth: 320,
          borderRadius: 12,
          background: statusConf.bgColor,
          border: `1px solid ${statusConf.color}30`,
        }}
        styles={{ body: { padding: 16 } }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <FileTextOutlined style={{ fontSize: 20, color: colors.primary }} />
          <div style={{ flex: 1 }}>
            <Text strong style={{ fontSize: 14 }}>Phiếu chốt mủ</Text>
            {code && (
              <div style={{ fontSize: 11, color: colors.textSecondary }}>{code}</div>
            )}
          </div>
          <Tag color={statusConf.color}>{statusConf.label}</Tag>
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Loại mủ</Text>
            <div style={{ fontWeight: 500 }}>{productLabel}</div>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Khối lượng</Text>
            <div style={{ fontWeight: 500 }}>{quantity_tons || '—'} tấn</div>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>DRC</Text>
            <div style={{ fontWeight: 500 }}>{drc_percent || '—'}%</div>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Giá ({price_unit === 'dry' ? 'khô' : 'ướt'})
            </Text>
            <div style={{ fontWeight: 500 }}>
              {price_per_kg?.toLocaleString('vi-VN') || '—'} đ/kg
            </div>
          </div>
        </div>

        {/* Dia diem chot hang */}
        {pickup_location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <EnvironmentOutlined style={{ color: '#1890ff' }} />
            <Tag color="blue">{pickup_location}</Tag>
          </div>
        )}

        {/* Giao tại nhà máy */}
        {target_facility_code && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 14 }}>🏭</span>
            <Tag color="green">
              Giao tại: {target_facility_code}
              {target_facility_name ? ` — ${target_facility_name}` : ''}
            </Tag>
          </div>
        )}

        {/* Counter price (if negotiating) */}
        {counter_price && status === 'negotiating' && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              background: '#e6f7ff',
              borderRadius: 8,
            }}
          >
            <Text type="secondary" style={{ fontSize: 11 }}>Giá đề xuất từ nhà máy</Text>
            <div style={{ fontWeight: 600, color: '#1890ff' }}>
              {counter_price.toLocaleString('vi-VN')} VNĐ/kg
            </div>
            {negotiation_notes && (
              <Text style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                "{negotiation_notes}"
              </Text>
            )}
          </div>
        )}

        <Divider style={{ margin: '12px 0 8px' }} />

        {/* Estimated value */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Giá trị ước tính</Text>
          <Text strong style={{ fontSize: 16, color: colors.primary }}>
            {formatCurrency(estimated_value)}
          </Text>
        </div>

        {/* Delivery date */}
        {delivery_date && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Ngày giao</Text>
            <Text style={{ fontSize: 12 }}>{formatDate(delivery_date)}</Text>
          </div>
        )}

        {/* Notes */}
        {notes && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff', borderRadius: 6 }}>
            <Text style={{ fontSize: 12, fontStyle: 'italic' }}>"{notes}"</Text>
          </div>
        )}

        {/* Action buttons */}
        {showActions && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Space style={{ width: '100%' }} direction="vertical" size={8}>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={onConfirm}
                block
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
              >
                Xác nhận
              </Button>
              <Row gutter={8}>
                <Col span={12}>
                  <Button
                    icon={<SwapOutlined />}
                    onClick={() => setShowNegotiateModal(true)}
                    block
                  >
                    Thương lượng
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    onClick={onReject}
                    block
                  >
                    Từ chối
                  </Button>
                </Col>
              </Row>
            </Space>
          </>
        )}
      </Card>

      {/* Negotiation Modal */}
      <NegotiationModal
        open={showNegotiateModal}
        onCancel={() => setShowNegotiateModal(false)}
        onSubmit={(counterPrice, notes) => {
          onNegotiate?.(counterPrice, notes);
          setShowNegotiateModal(false);
        }}
        currentPrice={price_per_kg}
      />
    </>
  );
};

export default BookingCard;
