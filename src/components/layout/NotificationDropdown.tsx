/**
 * Layout Components
 * NotificationDropdown và UserMenu cho Header
 */

import React, { useState, useEffect } from 'react';
import { 
  Dropdown, Badge, Button, Avatar, List, Empty, Spin, 
  Typography, Space, Tag, Divider 
} from 'antd';
import type { MenuProps } from 'antd';
import {
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  CheckOutlined,
  MessageOutlined,
  FileTextOutlined,
  DollarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { colors } from '../../config/antdTheme';

const { Text } = Typography;

// ==========================================
// NOTIFICATION TYPES
// ==========================================
export interface Notification {
  id: string;
  type: 'chat' | 'deal' | 'booking' | 'payment' | 'partner' | 'system';
  title: string;
  description?: string;
  time: string;
  read: boolean;
  link?: string;
}

// ==========================================
// NOTIFICATION DROPDOWN
// ==========================================
export interface NotificationDropdownProps {
  /** List of notifications */
  notifications: Notification[];
  /** Loading state */
  loading?: boolean;
  /** Mark as read handler */
  onMarkAsRead?: (id: string) => void;
  /** Mark all as read handler */
  onMarkAllAsRead?: () => void;
  /** Click notification handler */
  onClick?: (notification: Notification) => void;
  /** View all handler */
  onViewAll?: () => void;
}

const getNotificationIcon = (type: Notification['type']) => {
  const icons = {
    chat: <MessageOutlined style={{ color: '#1890ff' }} />,
    deal: <FileTextOutlined style={{ color: '#52c41a' }} />,
    booking: <FileTextOutlined style={{ color: '#faad14' }} />,
    payment: <DollarOutlined style={{ color: '#722ed1' }} />,
    partner: <TeamOutlined style={{ color: '#13c2c2' }} />,
    system: <BellOutlined style={{ color: '#8c8c8c' }} />,
  };
  return icons[type] || icons.system;
};

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  notifications,
  loading = false,
  onMarkAsRead,
  onMarkAllAsRead,
  onClick,
  onViewAll,
}) => {
  const unreadCount = notifications.filter(n => !n.read).length;
  
  const content = (
    <div style={{ width: 360, maxHeight: 480 }}>
      {/* Header */}
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Text strong style={{ fontSize: 15 }}>Thông báo</Text>
        {unreadCount > 0 && (
          <Button 
            type="link" 
            size="small" 
            onClick={onMarkAllAsRead}
            icon={<CheckOutlined />}
          >
            Đánh dấu đã đọc
          </Button>
        )}
      </div>
      
      {/* List */}
      <div style={{ maxHeight: 360, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : notifications.length === 0 ? (
          <Empty 
            image={Empty.PRESENTED_IMAGE_SIMPLE} 
            description="Không có thông báo mới"
            style={{ padding: '40px 0' }}
          />
        ) : (
          <List
            dataSource={notifications.slice(0, 10)}
            renderItem={(item) => (
              <List.Item
                onClick={() => onClick?.(item)}
                style={{ 
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: item.read ? 'transparent' : '#f6ffed',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                onMouseLeave={(e) => e.currentTarget.style.background = item.read ? 'transparent' : '#f6ffed'}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{ 
                      width: 40, 
                      height: 40, 
                      borderRadius: 8,
                      background: '#f5f5f5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                    }}>
                      {getNotificationIcon(item.type)}
                    </div>
                  }
                  title={
                    <div style={{ 
                      fontWeight: item.read ? 400 : 600,
                      fontSize: 13,
                    }}>
                      {item.title}
                    </div>
                  }
                  description={
                    <div>
                      {item.description && (
                        <div style={{ 
                          fontSize: 12, 
                          color: '#666',
                          marginBottom: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {item.description}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: '#999' }}>
                        {item.time}
                      </div>
                    </div>
                  }
                />
                {!item.read && (
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: colors.primary,
                  }} />
                )}
              </List.Item>
            )}
          />
        )}
      </div>
      
      {/* Footer */}
      {notifications.length > 0 && (
        <div style={{ 
          padding: '12px 16px', 
          borderTop: '1px solid #f0f0f0',
          textAlign: 'center',
        }}>
          <Button type="link" onClick={onViewAll}>
            Xem tất cả thông báo
          </Button>
        </div>
      )}
    </div>
  );
  
  return (
    <Dropdown 
      dropdownRender={() => content}
      placement="bottomRight"
      trigger={['click']}
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
        />
      </Badge>
    </Dropdown>
  );
};

// ==========================================
// USER MENU
// ==========================================
export interface UserMenuProps {
  /** User info */
  user: {
    name: string;
    email?: string;
    avatar?: string;
    role?: string;
  };
  /** Profile handler */
  onProfile?: () => void;
  /** Settings handler */
  onSettings?: () => void;
  /** Logout handler */
  onLogout?: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  user,
  onProfile,
  onSettings,
  onLogout,
}) => {
  const menu: MenuProps = {
    items: [
      {
        key: 'userInfo',
        label: (
          <div style={{ padding: '8px 0' }}>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            {user.email && (
              <div style={{ fontSize: 12, color: '#999' }}>{user.email}</div>
            )}
            {user.role && (
              <Tag color={colors.primary} style={{ marginTop: 4, borderRadius: 4 }}>
                {user.role}
              </Tag>
            )}
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: 'Thông tin cá nhân',
        onClick: onProfile,
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: 'Cài đặt',
        onClick: onSettings,
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Đăng xuất',
        danger: true,
        onClick: onLogout,
      },
    ],
  };
  
  return (
    <Dropdown menu={menu} placement="bottomRight" trigger={['click']}>
      <div style={{ 
        cursor: 'pointer', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8,
        padding: '4px 8px',
        borderRadius: 8,
        transition: 'background 0.2s',
      }}>
        <Avatar
          src={user.avatar}
          icon={!user.avatar && <UserOutlined />}
          style={{ background: colors.primary }}
          size={36}
        />
        <div style={{ display: 'none' }}> {/* Hidden on mobile */}
          <div style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.2 }}>
            {user.name}
          </div>
          {user.role && (
            <div style={{ fontSize: 11, color: '#999' }}>{user.role}</div>
          )}
        </div>
      </div>
    </Dropdown>
  );
};

export default NotificationDropdown;
