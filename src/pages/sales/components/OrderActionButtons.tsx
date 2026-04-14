// ============================================================================
// ORDER ACTION BUTTONS — Status transition buttons for a sales order
// File: src/pages/sales/components/OrderActionButtons.tsx
//
// Dùng chung: có thể mount ở header (omit `tab`) hoặc trong từng tab
// (truyền `tab='contract' | 'production' | 'shipping' | 'finance'`) để
// chỉ hiện button thuộc ngữ cảnh tab đó.
// ============================================================================

import { useState } from 'react'
import { Button, Popconfirm, Space, message } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ContainerOutlined,
  TruckOutlined,
  DollarOutlined,
} from '@ant-design/icons'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import type { SalesOrder, SalesOrderStatus } from '../../../services/sales/salesTypes'
import {
  salesPermissions,
  type SalesRole,
} from '../../../services/sales/salesPermissionService'

export type TabScope = 'contract' | 'production' | 'shipping' | 'finance'

type PermissionKey = 'canEditOrder' | 'canCancelOrder' | 'canEditProduction' | 'canEditBooking' | 'canEditFinance'

interface ActionDef {
  from: SalesOrderStatus
  to: SalesOrderStatus
  tab: TabScope
  permission: PermissionKey
  label: string
  icon: React.ReactNode
  /** Ant Design button styling — type/danger/inline style */
  variant: {
    type?: 'primary' | 'default'
    danger?: boolean
    bgColor?: string
  }
  confirm?: {
    title: string
    description?: string
  }
}

// Single source of truth cho tất cả chuyển đổi trạng thái
const ACTIONS: ActionDef[] = [
  // ── Tab Hợp đồng ──
  {
    from: 'draft', to: 'confirmed', tab: 'contract', permission: 'canEditOrder',
    label: 'Xác nhận', icon: <CheckCircleOutlined />,
    variant: { type: 'primary' },
    confirm: { title: 'Xác nhận đơn hàng?' },
  },
  {
    from: 'draft', to: 'cancelled', tab: 'contract', permission: 'canCancelOrder',
    label: 'Hủy', icon: <CloseCircleOutlined />,
    variant: { danger: true },
    confirm: { title: 'Hủy đơn hàng?' },
  },
  {
    from: 'confirmed', to: 'cancelled', tab: 'contract', permission: 'canCancelOrder',
    label: 'Hủy', icon: <CloseCircleOutlined />,
    variant: { danger: true },
    confirm: { title: 'Hủy đơn hàng?' },
  },
  // ── Tab Sản xuất ──
  // NOTE: `confirmed → producing` KHÔNG được flip qua button này.
  // Phải gọi salesProductionService.createProductionFromSalesOrder() để
  // tạo production_orders row + gán NVL (có UI NVL flow ở trang detail
  // đầy đủ). ProductionTab khi status='confirmed' sẽ hiện link dẫn qua
  // trang đó thay vì button flip status.
  {
    from: 'producing', to: 'ready', tab: 'production', permission: 'canEditProduction',
    label: 'Sẵn sàng', icon: <CheckCircleOutlined />,
    variant: { type: 'primary' },
    confirm: { title: 'Đánh dấu sẵn sàng?', description: 'Hàng đã SX xong, sẵn sàng đóng gói' },
  },
  {
    from: 'ready', to: 'packing', tab: 'production', permission: 'canEditProduction',
    label: 'Đóng gói', icon: <ContainerOutlined />,
    variant: { bgColor: '#722ed1' },
  },
  // ── Tab Vận chuyển ──
  {
    from: 'packing', to: 'shipped', tab: 'shipping', permission: 'canEditBooking',
    label: 'Xuất hàng', icon: <TruckOutlined />,
    variant: { bgColor: '#52c41a' },
    confirm: { title: 'Xác nhận xuất hàng?', description: 'Hàng đã lên tàu — trạng thái chuyển sang Shipped' },
  },
  {
    from: 'shipped', to: 'delivered', tab: 'shipping', permission: 'canEditBooking',
    label: 'Đã giao', icon: <CheckCircleOutlined />,
    variant: { type: 'primary' },
  },
  // ── Tab Tài chính ──
  {
    from: 'delivered', to: 'invoiced', tab: 'finance', permission: 'canEditFinance',
    label: 'Lập hóa đơn', icon: <DollarOutlined />,
    variant: { bgColor: '#faad14' },
  },
  {
    from: 'invoiced', to: 'paid', tab: 'finance', permission: 'canEditFinance',
    label: 'Đã thanh toán', icon: <DollarOutlined />,
    variant: { bgColor: '#52c41a' },
    confirm: { title: 'Đã nhận đủ tiền?', description: "Đơn hàng sẽ chuyển sang 'Đã thanh toán'" },
  },
]

interface Props {
  order: SalesOrder
  salesRole: SalesRole | null
  onSaved: () => void
  size?: 'small' | 'middle' | 'large'
  /** Chỉ hiện button thuộc tab này. Omit = hiện tất cả (header legacy). */
  tab?: TabScope
}

export default function OrderActionButtons({ order, salesRole, onSaved, size = 'middle', tab }: Props) {
  const [loading, setLoading] = useState(false)

  const handleStatus = async (newStatus: SalesOrderStatus) => {
    try {
      setLoading(true)
      if (newStatus === 'cancelled') {
        await salesOrderService.cancelOrder(order.id, 'Hủy bởi người dùng')
      } else {
        await salesOrderService.updateStatus(order.id, newStatus)
      }
      message.success('Đã cập nhật trạng thái')
      onSaved()
    } catch (err: any) {
      message.error(err?.message || 'Không thể cập nhật trạng thái')
    } finally {
      setLoading(false)
    }
  }

  // Lọc actions phù hợp: đúng status hiện tại + đúng tab (nếu có) + đúng quyền
  const visible = ACTIONS.filter(a => {
    if (a.from !== order.status) return false
    if (tab && a.tab !== tab) return false
    if (!salesRole) return false
    const checker = salesPermissions[a.permission]
    return checker ? checker(salesRole) : false
  })

  if (visible.length === 0) return null

  const renderButton = (a: ActionDef, idx: number) => {
    const styleExtra = a.variant.bgColor
      ? { background: a.variant.bgColor, borderColor: a.variant.bgColor, color: '#fff' }
      : undefined
    const btn = (
      <Button
        key={`${a.from}->${a.to}`}
        size={size}
        type={a.variant.type}
        danger={a.variant.danger}
        icon={a.icon}
        loading={loading}
        style={styleExtra}
        onClick={a.confirm ? undefined : () => handleStatus(a.to)}
      >
        {a.label}
      </Button>
    )
    if (!a.confirm) return btn
    return (
      <Popconfirm
        key={`${a.from}->${a.to}-${idx}`}
        title={a.confirm.title}
        description={a.confirm.description}
        onConfirm={() => handleStatus(a.to)}
      >
        {btn}
      </Popconfirm>
    )
  }

  return <Space size={6}>{visible.map((a, i) => renderButton(a, i))}</Space>
}
