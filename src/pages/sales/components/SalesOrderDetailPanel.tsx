// ============================================================================
// SALES ORDER DETAIL PANEL — Slide-in panel v4
// File: src/pages/sales/components/SalesOrderDetailPanel.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Drawer, Tabs, Tag, Space, Button, Spin, message, Popconfirm, Tooltip } from 'antd'
import {
  LockOutlined,
  UnlockOutlined,
  FileTextOutlined,
  ToolOutlined,
  CarOutlined,
  DollarOutlined,
  FolderOpenOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../../../services/sales/salesTypes'
import {
  getSalesRole,
  getVisibleTabs,
  isTabEditable,
  type SalesRole,
  type SalesOrderStatus,
} from '../../../services/sales/salesPermissionService'
import { useAuthStore } from '../../../stores/authStore'
import ContractTab from './ContractTab'
import ProductionTab from './ProductionTab'
import ShippingTab from './ShippingTab'
import FinanceTabV4 from './FinanceTabV4'
import DocumentChecklistTab from './DocumentChecklistTab'

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  orderId: string | null
  open: boolean
  onClose: () => void
  onOrderUpdated?: () => void
}

const TAB_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  contract: { icon: <FileTextOutlined />, label: 'Hợp đồng', color: '#1B4D3E' },
  production: { icon: <ToolOutlined />, label: 'Sản xuất', color: '#1677ff' },
  shipping: { icon: <CarOutlined />, label: 'Vận chuyển', color: '#d48806' },
  documents: { icon: <FolderOpenOutlined />, label: 'Chứng từ', color: '#722ed1' },
  finance: { icon: <DollarOutlined />, label: 'Tài chính', color: '#cf1322' },
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SalesOrderDetailPanel({ orderId, open, onClose, onOrderUpdated }: Props) {
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const visibleTabs = getVisibleTabs(salesRole)

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('contract')
  const [lockLoading, setLockLoading] = useState(false)

  // ── Load order ──
  const loadOrder = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    try {
      const data = await salesOrderService.getById(orderId)
      setOrder(data)
    } catch {
      message.error('Không thể tải thông tin đơn hàng')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (open && orderId) {
      loadOrder()
      setActiveTab('contract')
    } else {
      setOrder(null)
    }
  }, [open, orderId, loadOrder])

  // ── Lock / Unlock ──
  const handleLock = async () => {
    if (!order || !user) return
    setLockLoading(true)
    try {
      await salesOrderService.lockOrder(order.id, user.id)
      message.success('Đã khóa đơn hàng')
      await loadOrder()
      onOrderUpdated?.()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLockLoading(false)
    }
  }

  const handleUnlock = async () => {
    if (!order) return
    setLockLoading(true)
    try {
      await salesOrderService.unlockOrder(order.id)
      message.success('Đã mở khóa đơn hàng')
      await loadOrder()
      onOrderUpdated?.()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLockLoading(false)
    }
  }

  // ── Refresh after save ──
  const handleSaved = () => {
    loadOrder()
    onOrderUpdated?.()
  }

  // ── Tab editable check ──
  const isEditable = (tab: string): boolean => {
    if (!order || !salesRole) return false
    return isTabEditable(salesRole, tab, order.status as SalesOrderStatus, !!order.is_locked)
  }

  // ── Render ──
  if (!open) return null

  const isLocked = !!order?.is_locked
  const canLock = salesRole === 'sale' || salesRole === 'admin'
  const canUnlock = salesRole === 'admin'

  const tabItems = visibleTabs
    .filter((t) => TAB_META[t])
    .map((tabKey) => {
      const meta = TAB_META[tabKey]
      const editable = isEditable(tabKey)
      return {
        key: tabKey,
        label: (
          <Space size={4}>
            {meta.icon}
            <span>{meta.label}</span>
            {tabKey === 'contract' && isLocked && (
              <LockOutlined style={{ color: '#999', fontSize: 11 }} />
            )}
            {editable && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: meta.color, display: 'inline-block',
              }} />
            )}
          </Space>
        ),
        children: renderTabContent(tabKey),
      }
    })

  function renderTabContent(tabKey: string) {
    if (!order) return null
    switch (tabKey) {
      case 'contract':
        return (
          <ContractTab
            order={order}
            salesRole={salesRole}
            editable={isEditable('contract')}
            onSaved={handleSaved}
          />
        )
      case 'production':
        return (
          <ProductionTab
            order={order}
            salesRole={salesRole}
            editable={isEditable('production')}
            onSaved={handleSaved}
          />
        )
      case 'shipping':
        return (
          <ShippingTab
            order={order}
            salesRole={salesRole}
            editable={isEditable('shipping')}
            onSaved={handleSaved}
          />
        )
      case 'documents':
        return (
          <DocumentChecklistTab
            orderId={order.id}
            orderCode={order.code}
          />
        )
      case 'finance':
        return (
          <FinanceTabV4
            order={order}
            salesRole={salesRole}
            editable={isEditable('finance')}
            onSaved={handleSaved}
          />
        )
      default:
        return null
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      destroyOnClose
      closeIcon={<CloseOutlined />}
      styles={{ body: { padding: 0 } }}
      title={
        order ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{order.code}</span>
            <Tag color={ORDER_STATUS_COLORS[order.status] || 'default'}>
              {ORDER_STATUS_LABELS[order.status] || order.status}
            </Tag>
            {order.customer && (
              <span style={{ color: '#666', fontSize: 13 }}>
                {order.customer.name}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {isLocked ? (
                canUnlock && (
                  <Popconfirm
                    title="Mở khóa đơn hàng?"
                    description="Cho phép Sale sửa lại thông tin hợp đồng"
                    onConfirm={handleUnlock}
                    okText="Mở khóa"
                    cancelText="Hủy"
                  >
                    <Tooltip title="Mở khóa (Admin)">
                      <Button
                        size="small"
                        icon={<UnlockOutlined />}
                        loading={lockLoading}
                        danger
                      >
                        Mở khóa
                      </Button>
                    </Tooltip>
                  </Popconfirm>
                )
              ) : (
                canLock && order.status === 'draft' && (
                  <Popconfirm
                    title="Khóa đơn hàng?"
                    description="Sau khi khóa, Sale không thể sửa thông tin hợp đồng"
                    onConfirm={handleLock}
                    okText="Khóa"
                    cancelText="Hủy"
                  >
                    <Tooltip title="Khóa sau khi xác nhận">
                      <Button
                        size="small"
                        icon={<LockOutlined />}
                        loading={lockLoading}
                        type="primary"
                        style={{ background: '#1B4D3E' }}
                      >
                        Khóa HĐ
                      </Button>
                    </Tooltip>
                  </Popconfirm>
                )
              )}
            </div>
          </div>
        ) : (
          'Đang tải...'
        )
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : order ? (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          style={{ padding: '0 16px' }}
          size="small"
        />
      ) : (
        <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>
          Không tìm thấy đơn hàng
        </div>
      )}
    </Drawer>
  )
}

