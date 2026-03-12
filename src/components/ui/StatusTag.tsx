/**
 * StatusTag Component
 * Ant Design Tag với màu theo status
 * Dùng cho: Deal status, Booking status, Partner status...
 */

import React from 'react';
import { Tag, Badge } from 'antd';
import type { TagProps } from 'antd';
import {
  ClockCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  PauseCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';

// ==========================================
// STATUS TYPES
// ==========================================

// Deal Status
export type DealStatus = 'pending' | 'processing' | 'accepted' | 'settled' | 'cancelled';

// Booking Status
export type BookingStatus = 'pending' | 'confirmed' | 'negotiating' | 'rejected';

// Partner Status
export type PartnerStatus = 'pending' | 'verified' | 'suspended' | 'rejected';

// Settlement Status
export type SettlementStatus = 'draft' | 'pending' | 'approved' | 'paid' | 'cancelled';

// Advance Status
export type AdvanceStatus = 'pending' | 'approved' | 'paid' | 'rejected';

// Generic Status
export type GenericStatus = 'active' | 'inactive' | 'draft' | 'completed' | 'error';

// ==========================================
// STATUS CONFIG
// ==========================================
interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

// Deal Status Config
export const dealStatusConfig: Record<DealStatus, StatusConfig> = {
  pending: {
    label: 'Chờ xử lý',
    color: '#faad14',
    bgColor: '#fffbe6',
    icon: <ClockCircleOutlined />,
  },
  processing: {
    label: 'Đang xử lý',
    color: '#1890ff',
    bgColor: '#e6f7ff',
    icon: <SyncOutlined spin />,
  },
  accepted: {
    label: 'Đã duyệt',
    color: '#52c41a',
    bgColor: '#f6ffed',
    icon: <CheckCircleOutlined />,
  },
  settled: {
    label: 'Đã quyết toán',
    color: '#8c8c8c',
    bgColor: '#fafafa',
    icon: <CheckCircleOutlined />,
  },
  cancelled: {
    label: 'Đã hủy',
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    icon: <CloseCircleOutlined />,
  },
};

// Booking Status Config
export const bookingStatusConfig: Record<BookingStatus, StatusConfig> = {
  pending: {
    label: 'Chờ xác nhận',
    color: '#faad14',
    bgColor: '#fffbe6',
    icon: <ClockCircleOutlined />,
  },
  confirmed: {
    label: 'Đã xác nhận',
    color: '#52c41a',
    bgColor: '#f6ffed',
    icon: <CheckCircleOutlined />,
  },
  negotiating: {
    label: 'Đang thương lượng',
    color: '#1890ff',
    bgColor: '#e6f7ff',
    icon: <SyncOutlined />,
  },
  rejected: {
    label: 'Đã từ chối',
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    icon: <CloseCircleOutlined />,
  },
};

// Partner Status Config
export const partnerStatusConfig: Record<PartnerStatus, StatusConfig> = {
  pending: {
    label: 'Chờ duyệt',
    color: '#faad14',
    bgColor: '#fffbe6',
    icon: <ClockCircleOutlined />,
  },
  verified: {
    label: 'Đã xác thực',
    color: '#52c41a',
    bgColor: '#f6ffed',
    icon: <CheckCircleOutlined />,
  },
  suspended: {
    label: 'Tạm ngưng',
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    icon: <PauseCircleOutlined />,
  },
  rejected: {
    label: 'Từ chối',
    color: '#8c8c8c',
    bgColor: '#fafafa',
    icon: <CloseCircleOutlined />,
  },
};

// Settlement Status Config
export const settlementStatusConfig: Record<SettlementStatus, StatusConfig> = {
  draft: {
    label: 'Nháp',
    color: '#8c8c8c',
    bgColor: '#fafafa',
    icon: <ClockCircleOutlined />,
  },
  pending: {
    label: 'Chờ duyệt',
    color: '#faad14',
    bgColor: '#fffbe6',
    icon: <ClockCircleOutlined />,
  },
  approved: {
    label: 'Đã duyệt',
    color: '#52c41a',
    bgColor: '#f6ffed',
    icon: <CheckCircleOutlined />,
  },
  paid: {
    label: 'Đã thanh toán',
    color: '#1890ff',
    bgColor: '#e6f7ff',
    icon: <CheckCircleOutlined />,
  },
  cancelled: {
    label: 'Đã hủy',
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    icon: <CloseCircleOutlined />,
  },
};

// Advance Status Config
export const advanceStatusConfig: Record<AdvanceStatus, StatusConfig> = {
  pending: {
    label: 'Chờ duyệt',
    color: '#faad14',
    bgColor: '#fffbe6',
    icon: <ClockCircleOutlined />,
  },
  approved: {
    label: 'Đã duyệt',
    color: '#52c41a',
    bgColor: '#f6ffed',
    icon: <CheckCircleOutlined />,
  },
  paid: {
    label: 'Đã chi',
    color: '#1890ff',
    bgColor: '#e6f7ff',
    icon: <CheckCircleOutlined />,
  },
  rejected: {
    label: 'Từ chối',
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    icon: <CloseCircleOutlined />,
  },
};

// ==========================================
// STATUS TAG PROPS
// ==========================================
export interface StatusTagProps extends Omit<TagProps, 'color'> {
  /** Status value */
  status: string;
  /** Status type để chọn config */
  type?: 'deal' | 'booking' | 'partner' | 'settlement' | 'advance' | 'custom';
  /** Custom config cho type='custom' */
  customConfig?: Record<string, StatusConfig>;
  /** Hiển thị icon */
  showIcon?: boolean;
  /** Hiển thị dot thay vì icon */
  showDot?: boolean;
  /** Size */
  size?: 'small' | 'default';
}

// ==========================================
// STATUS TAG COMPONENT
// ==========================================
const StatusTag: React.FC<StatusTagProps> = ({
  status,
  type = 'deal',
  customConfig,
  showIcon = true,
  showDot = false,
  size = 'default',
  style,
  ...props
}) => {
  // Get config based on type
  let config: StatusConfig | undefined;
  
  switch (type) {
    case 'deal':
      config = dealStatusConfig[status as DealStatus];
      break;
    case 'booking':
      config = bookingStatusConfig[status as BookingStatus];
      break;
    case 'partner':
      config = partnerStatusConfig[status as PartnerStatus];
      break;
    case 'settlement':
      config = settlementStatusConfig[status as SettlementStatus];
      break;
    case 'advance':
      config = advanceStatusConfig[status as AdvanceStatus];
      break;
    case 'custom':
      config = customConfig?.[status];
      break;
  }
  
  // Fallback config
  if (!config) {
    config = {
      label: status,
      color: '#8c8c8c',
      bgColor: '#fafafa',
      icon: <QuestionCircleOutlined />,
    };
  }
  
  const sizeStyle = size === 'small' 
    ? { fontSize: 11, padding: '0 6px' }
    : { fontSize: 12, padding: '2px 8px' };
  
  return (
    <Tag
      {...props}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        border: `1px solid ${config.color}20`,
        borderRadius: 6,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        margin: 0,
        ...sizeStyle,
        ...style,
      }}
    >
      {showDot && (
        <Badge 
          status={
            config.color === '#52c41a' ? 'success' :
            config.color === '#ff4d4f' ? 'error' :
            config.color === '#faad14' ? 'warning' :
            config.color === '#1890ff' ? 'processing' :
            'default'
          } 
        />
      )}
      {showIcon && !showDot && config.icon}
      {config.label}
    </Tag>
  );
};

// ==========================================
// SHORTHAND COMPONENTS
// ==========================================

/** Deal Status Tag */
export const DealStatusTag: React.FC<Omit<StatusTagProps, 'type'> & { status: DealStatus }> = (props) => (
  <StatusTag {...props} type="deal" />
);

/** Booking Status Tag */
export const BookingStatusTag: React.FC<Omit<StatusTagProps, 'type'> & { status: BookingStatus }> = (props) => (
  <StatusTag {...props} type="booking" />
);

/** Partner Status Tag */
export const PartnerStatusTag: React.FC<Omit<StatusTagProps, 'type'> & { status: PartnerStatus }> = (props) => (
  <StatusTag {...props} type="partner" />
);

/** Settlement Status Tag */
export const SettlementStatusTag: React.FC<Omit<StatusTagProps, 'type'> & { status: SettlementStatus }> = (props) => (
  <StatusTag {...props} type="settlement" />
);

/** Advance Status Tag */
export const AdvanceStatusTag: React.FC<Omit<StatusTagProps, 'type'> & { status: AdvanceStatus }> = (props) => (
  <StatusTag {...props} type="advance" />
);

// ==========================================
// STATUS DOT (simple indicator)
// ==========================================
export const StatusDot: React.FC<{
  status: 'online' | 'offline' | 'busy' | 'away';
  size?: number;
  showLabel?: boolean;
}> = ({ status, size = 8, showLabel = false }) => {
  const colors = {
    online: '#52c41a',
    offline: '#d9d9d9',
    busy: '#ff4d4f',
    away: '#faad14',
  };
  
  const labels = {
    online: 'Online',
    offline: 'Offline',
    busy: 'Busy',
    away: 'Away',
  };
  
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: colors[status],
          boxShadow: status === 'online' ? `0 0 0 2px ${colors[status]}30` : 'none',
        }}
      />
      {showLabel && (
        <span style={{ fontSize: 12, color: '#666' }}>{labels[status]}</span>
      )}
    </span>
  );
};

export default StatusTag;
