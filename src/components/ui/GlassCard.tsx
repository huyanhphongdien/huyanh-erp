/**
 * GlassCard Component
 * Ant Design Card với glassmorphism effect
 */

import React from 'react';
import { Card } from 'antd';
import type { CardProps } from 'antd';

// ==========================================
// TYPES
// ==========================================
export interface GlassCardProps extends CardProps {
  /** Mức độ blur (px) */
  blur?: number;
  /** Độ trong suốt background (0-1) */
  opacity?: number;
  /** Border glow effect */
  glow?: boolean;
  /** Hover lift effect */
  lift?: boolean;
}

// ==========================================
// GLASS CARD COMPONENT
// ==========================================
const GlassCard: React.FC<GlassCardProps> = ({
  blur = 10,
  opacity = 0.95,
  glow = false,
  lift = true,
  style,
  styles,
  className,
  children,
  ...props
}) => {
  const glassStyle: React.CSSProperties = {
    background: `rgba(255, 255, 255, ${opacity})`,
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: glow 
      ? '0 4px 24px rgba(27, 77, 62, 0.1), 0 0 40px rgba(27, 77, 62, 0.05)'
      : '0 4px 24px rgba(0, 0, 0, 0.06)',
    transition: 'all 0.3s ease',
    ...style,
  };

  const hoverStyle = lift ? `
    .glass-card-hover:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    }
  ` : '';

  return (
    <>
      {lift && <style>{hoverStyle}</style>}
      <Card
        className={`glass-card-hover ${className || ''}`}
        style={glassStyle}
        styles={{
          ...styles,
          body: { padding: 20, ...(styles as any)?.body },
          header: (styles as any)?.header,
        } as any}
        {...props}
      >
        {children}
      </Card>
    </>
  );
};

// ==========================================
// PRESET VARIANTS
// ==========================================

/** Card với gradient border */
export const GradientBorderCard: React.FC<CardProps> = ({ style, children, ...props }) => (
  <div
    style={{
      padding: 1,
      borderRadius: 13,
      background: 'linear-gradient(135deg, #1B4D3E 0%, #2D8B6E 50%, #1B4D3E 100%)',
    }}
  >
    <Card
      style={{
        borderRadius: 12,
        border: 'none',
        ...style,
      }}
      {...props}
    >
      {children}
    </Card>
  </div>
);

/** Card với header gradient */
export const GradientHeaderCard: React.FC<CardProps & { headerGradient?: string }> = ({ 
  headerGradient = 'linear-gradient(135deg, #1B4D3E 0%, #2D8B6E 100%)',
  title,
  children, 
  ...props 
}) => (
  <Card
    {...props}
    title={
      <div
        style={{
          margin: '-12px -24px',
          padding: '16px 24px',
          background: headerGradient,
          borderRadius: '12px 12px 0 0',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        {title}
      </div>
    }
    style={{
      borderRadius: 12,
      overflow: 'hidden',
    }}
    styles={{
      header: { 
        padding: 0, 
        border: 'none',
        minHeight: 'auto',
      },
    }}
  >
    {children}
  </Card>
);

/** Card với status indicator */
export const StatusCard: React.FC<CardProps & { 
  status?: 'success' | 'warning' | 'error' | 'info' | 'default';
}> = ({ 
  status = 'default',
  style,
  children, 
  ...props 
}) => {
  const statusColors = {
    success: '#52c41a',
    warning: '#faad14',
    error: '#ff4d4f',
    info: '#1890ff',
    default: '#d9d9d9',
  };
  
  return (
    <Card
      style={{
        borderRadius: 12,
        borderLeft: `4px solid ${statusColors[status]}`,
        ...style,
      }}
      {...props}
    >
      {children}
    </Card>
  );
};

export default GlassCard;
