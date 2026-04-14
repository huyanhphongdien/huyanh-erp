// ============================================================================
// ORDER ACTION BUTTONS — Status transition buttons for a sales order
// File: src/pages/sales/components/OrderActionButtons.tsx
// Dùng chung giữa SalesOrderDetailPage và SalesOrderDetailPanel.
// ============================================================================

import { useState } from 'react'
import { Button, Popconfirm, Tag, Space, message } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ToolOutlined,
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

interface Props {
  order: SalesOrder
  salesRole: SalesRole | null
  onSaved: () => void
  size?: 'small' | 'middle' | 'large'
}

export default function OrderActionButtons({ order, salesRole, onSaved, size = 'middle' }: Props) {
  const [loading, setLoading] = useState(false)

  const canEdit = salesRole ? salesPermissions.canEditOrder(salesRole) : false
  const canCancel = salesRole ? salesPermissions.canCancelOrder(salesRole) : false
  const canEditProd = salesRole ? salesPermissions.canEditProduction(salesRole) : false
  const canEditBooking = salesRole ? salesPermissions.canEditBooking(salesRole) : false
  const canEditFinance = salesRole ? salesPermissions.canEditFinance(salesRole) : false

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

  const s = order.status
  const btns: React.ReactNode[] = []

  if (s === 'draft') {
    if (canEdit) {
      btns.push(
        <Popconfirm
          key="confirm"
          title="Xác nhận đơn hàng?"
          onConfirm={() => handleStatus('confirmed')}
        >
          <Button size={size} type="primary" icon={<CheckCircleOutlined />} loading={loading}>
            Xác nhận
          </Button>
        </Popconfirm>,
      )
    }
    if (canCancel) {
      btns.push(
        <Popconfirm
          key="cancel"
          title="Hủy đơn hàng?"
          onConfirm={() => handleStatus('cancelled')}
        >
          <Button size={size} danger icon={<CloseCircleOutlined />} loading={loading}>
            Hủy
          </Button>
        </Popconfirm>,
      )
    }
  } else if (s === 'confirmed') {
    if (canEditProd) {
      btns.push(
        <Button
          key="produce"
          size={size}
          style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}
          icon={<ToolOutlined />}
          onClick={() => handleStatus('producing')}
          loading={loading}
        >
          Tạo lệnh SX
        </Button>,
      )
    }
    if (canCancel) {
      btns.push(
        <Popconfirm
          key="cancel"
          title="Hủy đơn hàng?"
          onConfirm={() => handleStatus('cancelled')}
        >
          <Button size={size} danger icon={<CloseCircleOutlined />} loading={loading}>
            Hủy
          </Button>
        </Popconfirm>,
      )
    }
  } else if (s === 'producing') {
    if (canEditProd) {
      btns.push(
        <Popconfirm
          key="ready"
          title="Đánh dấu sẵn sàng?"
          description="Hàng đã sản xuất xong, sẵn sàng đóng gói"
          onConfirm={() => handleStatus('ready')}
        >
          <Button
            size={size}
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={loading}
          >
            Sẵn sàng
          </Button>
        </Popconfirm>,
      )
    } else {
      btns.push(
        <Tag key="status" color="orange" style={{ fontSize: 13, padding: '2px 10px' }}>
          Đang sản xuất...
        </Tag>,
      )
    }
  } else if (s === 'ready') {
    if (canEditProd || canEditBooking) {
      btns.push(
        <Button
          key="pack"
          size={size}
          style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}
          icon={<ContainerOutlined />}
          onClick={() => handleStatus('packing')}
          loading={loading}
        >
          Đóng gói
        </Button>,
      )
    }
  } else if (s === 'packing') {
    if (canEditBooking) {
      btns.push(
        <Popconfirm
          key="ship"
          title="Xác nhận xuất hàng?"
          description="Hàng đã lên tàu — trạng thái sẽ chuyển Shipped"
          onConfirm={() => handleStatus('shipped')}
        >
          <Button
            size={size}
            style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
            icon={<TruckOutlined />}
            loading={loading}
          >
            Xuất hàng
          </Button>
        </Popconfirm>,
      )
    }
  } else if (s === 'shipped') {
    if (canEditBooking) {
      btns.push(
        <Button
          key="deliver"
          size={size}
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => handleStatus('delivered')}
          loading={loading}
        >
          Đã giao
        </Button>,
      )
    }
  } else if (s === 'delivered') {
    if (canEditFinance) {
      btns.push(
        <Button
          key="invoice"
          size={size}
          style={{ background: '#faad14', borderColor: '#faad14', color: '#fff' }}
          icon={<DollarOutlined />}
          onClick={() => handleStatus('invoiced')}
          loading={loading}
        >
          Lập hóa đơn
        </Button>,
      )
    }
  } else if (s === 'invoiced') {
    if (canEditFinance) {
      btns.push(
        <Popconfirm
          key="paid"
          title="Đã nhận đủ tiền?"
          description="Đơn hàng sẽ chuyển sang 'Đã thanh toán'"
          onConfirm={() => handleStatus('paid')}
        >
          <Button
            size={size}
            style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
            icon={<DollarOutlined />}
            loading={loading}
          >
            Đã thanh toán
          </Button>
        </Popconfirm>,
      )
    }
  }

  if (btns.length === 0) return null

  return <Space size={6}>{btns}</Space>
}
