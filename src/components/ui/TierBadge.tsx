/**
 * TierBadge Component
 * Badge hiển thị tier đại lý với gradient màu
 */

import React from 'react';
import { Tag, Tooltip } from 'antd';
import {
  CrownOutlined,
  TrophyOutlined,
  StarOutlined,
  FireOutlined,
  UserOutlined,
} from '@ant-design/icons';

// ==========================================
// TYPES
// ==========================================
export type PartnerTier = 'diamond' | 'gold' | 'silver' | 'bronze' | 'new';

export interface TierBadgeProps {
  /** Tier level */
  tier: PartnerTier;
  /** Hiển thị label text */
  showLabel?: boolean;
  /** Size: small, default, large */
  size?: 'small' | 'default' | 'large';
  /** Tooltip với thông tin tier */
  showTooltip?: boolean;
  /** Custom className */
  className?: string;
}

// ==========================================
// TIER CONFIG
// ==========================================
export const tierConfig: Record<PartnerTier, {
  label: string;
  icon: React.ReactNode;
  emoji: string;
  gradient: string;
  textColor: string;
  bgColor: string;
  description: string;
  minTonnage: number;
}> = {
  diamond: {
    label: 'Diamond',
    icon: <CrownOutlined />,
    emoji: '💎',
    gradient: 'linear-gradient(135deg, #E8D5B7 0%, #B8860B 50%, #DAA520 100%)',
    textColor: '#FFFFFF',
    bgColor: '#B8860B',
    description: 'VIP - Trên 500 tấn/năm',
    minTonnage: 500,
  },
  gold: {
    label: 'Gold',
    icon: <TrophyOutlined />,
    emoji: '🥇',
    gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
    textColor: '#333333',
    bgColor: '#FAAD14',
    description: 'Ưu tiên - 200-500 tấn/năm',
    minTonnage: 200,
  },
  silver: {
    label: 'Silver',
    icon: <StarOutlined />,
    emoji: '🥈',
    gradient: 'linear-gradient(135deg, #E0E0E0 0%, #808080 100%)',
    textColor: '#FFFFFF',
    bgColor: '#8C8C8C',
    description: 'Thường xuyên - 50-200 tấn/năm',
    minTonnage: 50,
  },
  bronze: {
    label: 'Bronze',
    icon: <FireOutlined />,
    emoji: '🥉',
    gradient: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)',
    textColor: '#FFFFFF',
    bgColor: '#D48806',
    description: 'Tiềm năng - 10-50 tấn/năm',
    minTonnage: 10,
  },
  new: {
    label: 'New',
    icon: <UserOutlined />,
    emoji: '🆕',
    gradient: 'linear-gradient(135deg, #87CEEB 0%, #4682B4 100%)',
    textColor: '#FFFFFF',
    bgColor: '#1890FF',
    description: 'Mới - Dưới 10 tấn/năm',
    minTonnage: 0,
  },
};

// ==========================================
// GET TIER FROM TONNAGE
// ==========================================
export function getTierFromTonnage(tonnagePerYear: number): PartnerTier {
  if (tonnagePerYear >= 500) return 'diamond';
  if (tonnagePerYear >= 200) return 'gold';
  if (tonnagePerYear >= 50) return 'silver';
  if (tonnagePerYear >= 10) return 'bronze';
  return 'new';
}

// ==========================================
// TIER BADGE COMPONENT
// ==========================================
const TierBadge: React.FC<TierBadgeProps> = ({
  tier,
  showLabel = true,
  size = 'default',
  showTooltip = false,
  className,
}) => {
  const config = tierConfig[tier] || tierConfig.new;
  
  const sizeConfig = {
    small: { fontSize: 11, padding: '0 6px', height: 20, iconSize: 10 },
    default: { fontSize: 12, padding: '2px 8px', height: 24, iconSize: 12 },
    large: { fontSize: 14, padding: '4px 12px', height: 28, iconSize: 14 },
  };
  
  const { fontSize, padding, height, iconSize } = sizeConfig[size];
  
  const badge = (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: config.gradient,
        color: config.textColor,
        padding,
        borderRadius: height / 2,
        fontSize,
        fontWeight: 600,
        height,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: iconSize }}>{config.emoji}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  );
  
  if (showTooltip) {
    return (
      <Tooltip title={config.description} placement="top">
        {badge}
      </Tooltip>
    );
  }
  
  return badge;
};

// ==========================================
// TIER TAG (Ant Design Tag variant)
// ==========================================
export const TierTag: React.FC<{
  tier: PartnerTier;
  showIcon?: boolean;
}> = ({ tier, showIcon = true }) => {
  const config = tierConfig[tier] || tierConfig.new;
  
  return (
    <Tag
      color={config.bgColor}
      icon={showIcon ? config.icon : undefined}
      style={{ 
        borderRadius: 12,
        fontWeight: 500,
      }}
    >
      {config.label}
    </Tag>
  );
};

// ==========================================
// TIER ICON ONLY
// ==========================================
export const TierIcon: React.FC<{
  tier: PartnerTier;
  size?: number;
}> = ({ tier, size = 20 }) => {
  const config = tierConfig[tier] || tierConfig.new;
  
  return (
    <span style={{ fontSize: size }}>
      {config.emoji}
    </span>
  );
};

// ==========================================
// TIER PROGRESS (for dashboard)
// ==========================================
export const TierProgress: React.FC<{
  currentTier: PartnerTier;
  currentTonnage: number;
}> = ({ currentTier, currentTonnage }) => {
  const tiers: PartnerTier[] = ['new', 'bronze', 'silver', 'gold', 'diamond'];
  const currentIndex = tiers.indexOf(currentTier);
  const nextTier = currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : null;
  
  if (!nextTier) {
    return (
      <div style={{ textAlign: 'center' }}>
        <TierBadge tier="diamond" size="large" />
        <div style={{ marginTop: 8, color: '#52c41a', fontWeight: 500 }}>
          🎉 Đã đạt hạng cao nhất!
        </div>
      </div>
    );
  }
  
  const nextConfig = tierConfig[nextTier];
  const currentConfig = tierConfig[currentTier];
  const progress = Math.min(100, (currentTonnage / nextConfig.minTonnage) * 100);
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <TierBadge tier={currentTier} size="small" />
        <span style={{ color: '#999', fontSize: 12 }}>→</span>
        <TierBadge tier={nextTier} size="small" />
      </div>
      <div style={{ 
        background: '#f0f0f0', 
        borderRadius: 4, 
        height: 8,
        overflow: 'hidden',
      }}>
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: nextConfig.gradient,
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>
        {currentTonnage.toFixed(1)} / {nextConfig.minTonnage} tấn ({progress.toFixed(0)}%)
      </div>
    </div>
  );
};

export default TierBadge;
