/**
 * KPICard Component
 * Card hiển thị KPI với Ant Design Statistic
 * Hỗ trợ: trend indicator, sparkline mini chart, icon
 */

import React from 'react';
import { Card, Statistic, Space, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { colors } from '../../config/antdTheme';

// ==========================================
// TYPES
// ==========================================
export interface KPICardProps {
  /** Tiêu đề KPI */
  title: string;
  /** Giá trị hiển thị */
  value: number | string;
  /** Suffix (VD: tấn, VNĐ, %) */
  suffix?: string;
  /** Prefix (VD: $, ₫) */
  prefix?: string;
  /** Icon emoji hoặc ReactNode */
  icon?: React.ReactNode;
  /** Phần trăm thay đổi */
  trend?: number;
  /** Loại trend: up = tốt khi tăng, down = tốt khi giảm */
  trendType?: 'up' | 'down';
  /** Sparkline data */
  sparklineData?: number[];
  /** Màu sparkline */
  sparklineColor?: string;
  /** Loading state */
  loading?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Custom className */
  className?: string;
  /** Tooltip cho title */
  tooltip?: string;
}

// ==========================================
// SPARKLINE COMPONENT
// ==========================================
interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

const Sparkline: React.FC<SparklineProps> = ({ 
  data, 
  color = colors.primary,
  width = 60,
  height = 30,
}) => {
  if (!data || data.length === 0) return null;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const barWidth = Math.max(3, (width - (data.length - 1) * 2) / data.length);
  
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {data.map((value, index) => {
        const barHeight = ((value - min) / range) * height * 0.8 + height * 0.2;
        const opacity = 0.4 + (index / data.length) * 0.6;
        
        return (
          <div
            key={index}
            style={{
              width: barWidth,
              height: barHeight,
              backgroundColor: color,
              opacity,
              borderRadius: 2,
              transition: 'height 0.3s ease',
            }}
          />
        );
      })}
    </div>
  );
};

// ==========================================
// TREND BADGE COMPONENT
// ==========================================
interface TrendBadgeProps {
  value: number;
  type?: 'up' | 'down';
}

const TrendBadge: React.FC<TrendBadgeProps> = ({ value, type = 'up' }) => {
  const isPositive = value >= 0;
  const isGood = type === 'up' ? isPositive : !isPositive;
  
  const bgColor = isGood ? '#f6ffed' : '#fff2f0';
  const textColor = isGood ? '#52c41a' : '#ff4d4f';
  
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: '2px 8px',
        borderRadius: 12,
        backgroundColor: bgColor,
        color: textColor,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {isPositive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      {Math.abs(value)}%
    </span>
  );
};

// ==========================================
// KPI CARD COMPONENT
// ==========================================
const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  suffix,
  prefix,
  icon,
  trend,
  trendType = 'up',
  sparklineData,
  sparklineColor,
  loading = false,
  onClick,
  className,
  tooltip,
}) => {
  const cardContent = (
    <Card
      className={className}
      loading={loading}
      hoverable={!!onClick}
      onClick={onClick}
      style={{
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        cursor: onClick ? 'pointer' : 'default',
        height: '100%',
      }}
      styles={{
        body: { padding: 20 },
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {/* Left: Stats */}
        <div style={{ flex: 1 }}>
          {/* Title */}
          <div style={{ marginBottom: 8 }}>
            {tooltip ? (
              <Tooltip title={tooltip}>
                <span style={{ color: colors.textSecondary, fontSize: 13, cursor: 'help' }}>
                  {title}
                </span>
              </Tooltip>
            ) : (
              <span style={{ color: colors.textSecondary, fontSize: 13 }}>
                {title}
              </span>
            )}
          </div>
          
          {/* Value */}
          <Statistic
            value={value}
            prefix={prefix}
            suffix={suffix}
            valueStyle={{
              color: colors.primary,
              fontSize: 28,
              fontWeight: 700,
            }}
          />
          
          {/* Trend */}
          {trend !== undefined && (
            <div style={{ marginTop: 8 }}>
              <Space size={8}>
                <TrendBadge value={trend} type={trendType} />
                <span style={{ color: colors.textSecondary, fontSize: 12 }}>
                  vs tháng trước
                </span>
              </Space>
            </div>
          )}
        </div>
        
        {/* Right: Icon & Sparkline */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {icon && (
            <span style={{ fontSize: 28, opacity: 0.8 }}>
              {icon}
            </span>
          )}
          {sparklineData && sparklineData.length > 0 && (
            <Sparkline 
              data={sparklineData} 
              color={sparklineColor || colors.primary} 
            />
          )}
        </div>
      </div>
    </Card>
  );

  return cardContent;
};

// ==========================================
// EXPORTS
// ==========================================
export { Sparkline, TrendBadge };
export default KPICard;
