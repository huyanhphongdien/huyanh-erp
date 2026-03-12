/**
 * PageHeader Component
 * Header cho trang với Title, Breadcrumb, Actions
 */

import React from 'react';
import { Breadcrumb, Space, Button, Dropdown, Tag } from 'antd';
import type { BreadcrumbProps, MenuProps } from 'antd';
import {
  ArrowLeftOutlined,
  EllipsisOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { colors } from '../../config/antdTheme';

// ==========================================
// TYPES
// ==========================================
export interface PageHeaderProps {
  /** Page title */
  title: React.ReactNode;
  /** Subtitle */
  subtitle?: React.ReactNode;
  /** Breadcrumb items */
  breadcrumb?: BreadcrumbProps['items'];
  /** Show back button */
  showBack?: boolean;
  /** Back handler */
  onBack?: () => void;
  /** Primary action button */
  primaryAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
  };
  /** Secondary actions */
  secondaryActions?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
  }[];
  /** Extra content (right side) */
  extra?: React.ReactNode;
  /** Tags next to title */
  tags?: React.ReactNode;
  /** Stats below title */
  stats?: {
    label: string;
    value: string | number;
  }[];
  /** Custom className */
  className?: string;
  /** Sticky header */
  sticky?: boolean;
}

// ==========================================
// PAGE HEADER COMPONENT
// ==========================================
const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumb,
  showBack = false,
  onBack,
  primaryAction,
  secondaryActions,
  extra,
  tags,
  stats,
  className,
  sticky = false,
}) => {
  // More actions dropdown
  const moreActionsMenu: MenuProps = secondaryActions && secondaryActions.length > 2
    ? {
        items: secondaryActions.slice(2).map((action, index) => ({
          key: index,
          label: action.label,
          icon: action.icon,
          danger: action.danger,
          onClick: action.onClick,
        })),
      }
    : { items: [] };

  return (
    <div
      className={className}
      style={{
        background: '#fff',
        padding: '16px 24px',
        marginBottom: 24,
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        ...(sticky && {
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }),
      }}
    >
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            {
              title: <HomeOutlined />,
              href: '/',
            },
            ...breadcrumb,
          ]}
        />
      )}

      {/* Header Content */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        {/* Left: Title & Subtitle */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Back button */}
            {showBack && (
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={onBack}
                style={{ marginLeft: -8 }}
              />
            )}
            
            {/* Title */}
            <h1 style={{ 
              margin: 0, 
              fontSize: 24, 
              fontWeight: 600,
              color: colors.textPrimary,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              {title}
              {tags}
            </h1>
          </div>
          
          {/* Subtitle */}
          {subtitle && (
            <div style={{ 
              marginTop: 4, 
              color: colors.textSecondary,
              fontSize: 14,
              marginLeft: showBack ? 40 : 0,
            }}>
              {subtitle}
            </div>
          )}
          
          {/* Stats */}
          {stats && stats.length > 0 && (
            <div style={{ 
              display: 'flex', 
              gap: 24, 
              marginTop: 12,
              marginLeft: showBack ? 40 : 0,
            }}>
              {stats.map((stat, index) => (
                <div key={index}>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>
                    {stat.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: colors.primary }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div>
          <Space>
            {/* Extra content */}
            {extra}
            
            {/* Secondary actions (first 2) */}
            {secondaryActions?.slice(0, 2).map((action, index) => (
              <Button
                key={index}
                icon={action.icon}
                onClick={action.onClick}
                danger={action.danger}
              >
                {action.label}
              </Button>
            ))}
            
            {/* More actions dropdown */}
            {secondaryActions && secondaryActions.length > 2 && (
              <Dropdown menu={moreActionsMenu} placement="bottomRight">
                <Button icon={<EllipsisOutlined />} />
              </Dropdown>
            )}
            
            {/* Primary action */}
            {primaryAction && (
              <Button
                type="primary"
                icon={primaryAction.icon}
                onClick={primaryAction.onClick}
                loading={primaryAction.loading}
                disabled={primaryAction.disabled}
                style={{ background: colors.primary }}
              >
                {primaryAction.label}
              </Button>
            )}
          </Space>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// SIMPLE PAGE HEADER
// ==========================================
export const SimplePageHeader: React.FC<{
  title: string;
  onBack?: () => void;
  extra?: React.ReactNode;
}> = ({ title, onBack, extra }) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 24,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {onBack && (
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
        />
      )}
      <h1 style={{ 
        margin: 0, 
        fontSize: 24, 
        fontWeight: 600,
        color: colors.textPrimary,
      }}>
        {title}
      </h1>
    </div>
    {extra}
  </div>
);

// ==========================================
// SECTION HEADER (for cards)
// ==========================================
export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, subtitle, extra, icon }) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 16,
  }}>
    <div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8,
        fontSize: 16,
        fontWeight: 600,
        color: colors.textPrimary,
      }}>
        {icon}
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
          {subtitle}
        </div>
      )}
    </div>
    {extra}
  </div>
);

export default PageHeader;
