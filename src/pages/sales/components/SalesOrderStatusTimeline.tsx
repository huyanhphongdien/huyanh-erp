// ============================================================================
// SALES ORDER STATUS TIMELINE — visual workflow guide
// File: src/pages/sales/components/SalesOrderStatusTimeline.tsx
//
// Mục đích: hiển thị 9 status chính của Sales Order như 1 timeline horizontal,
// highlight current step, và hint "Bước tiếp theo" để user biết phải làm gì.
//
// Cancelled không nằm trong main flow — hiển thị banner cảnh báo riêng.
// ============================================================================

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Steps, Alert, Button, Tag, Tooltip, Space, Typography } from 'antd'
import {
  EditOutlined, CheckCircleOutlined, ToolOutlined, InboxOutlined,
  AppstoreOutlined, RocketOutlined, EnvironmentOutlined,
  FileTextOutlined, DollarOutlined, ArrowRightOutlined, WarningOutlined,
} from '@ant-design/icons'
import type { SalesOrder, SalesOrderStatus } from '../../../services/sales/salesTypes'
import { ORDER_STATUS_LABELS } from '../../../services/sales/salesTypes'

const { Text } = Typography

/** 9 step chính (cancelled tách riêng, không nằm trong flow timeline) */
const FLOW_STEPS: Array<{
  status: Exclude<SalesOrderStatus, 'cancelled'>
  icon: React.ReactNode
}> = [
  { status: 'draft',     icon: <EditOutlined /> },
  { status: 'confirmed', icon: <CheckCircleOutlined /> },
  { status: 'producing', icon: <ToolOutlined /> },
  { status: 'ready',     icon: <InboxOutlined /> },
  { status: 'packing',   icon: <AppstoreOutlined /> },
  { status: 'shipped',   icon: <RocketOutlined /> },
  { status: 'delivered', icon: <EnvironmentOutlined /> },
  { status: 'invoiced',  icon: <FileTextOutlined /> },
  { status: 'paid',      icon: <DollarOutlined /> },
]

/** Hint "Bước tiếp theo" + action button cho mỗi status */
const NEXT_STEP_HINTS: Record<Exclude<SalesOrderStatus, 'cancelled' | 'paid'>, {
  message: string
  description: string
  actionLabel: string
  tabKey: string
}> = {
  draft: {
    message: 'Bước tiếp: Xác nhận đơn hàng với khách',
    description: 'Kiểm tra hợp đồng (giá, số lượng, điều khoản L/C, Incoterm) → click "Xác nhận" để chuyển sang Đã xác nhận.',
    actionLabel: 'Mở tab Hợp đồng',
    tabKey: 'info',
  },
  confirmed: {
    message: 'Bước tiếp: Lấy hàng — chọn 1 trong 2 cách',
    description: 'A) Cấp phát từ kho (nếu kho có sẵn TP cùng grade) — bấm "⚡ Cấp phát nhanh (FIFO)". B) Tạo Lệnh sản xuất (nếu cần làm mới) — chọn batch NVL.',
    actionLabel: 'Mở tab Sản xuất',
    tabKey: 'production',
  },
  producing: {
    message: 'Bước tiếp: Theo dõi tiến độ sản xuất',
    description: 'Lệnh SX đang chạy qua các stages (chuẩn bị NVL → cán → cuộn → bảo quản). Khi hoàn thành tất cả → mark "Sẵn sàng".',
    actionLabel: 'Mở tab Sản xuất',
    tabKey: 'production',
  },
  ready: {
    message: 'Bước tiếp: Tạo container + đóng gói',
    description: 'Hàng đã sẵn sàng pick. Sang tab Vận chuyển/Đóng gói tạo container (tự động hoặc thủ công), gắn seal → status sẽ chuyển Đóng gói.',
    actionLabel: 'Mở tab Vận chuyển',
    tabKey: 'shipping',
  },
  packing: {
    message: 'Bước tiếp: Cân ship tại trạm cân Phong Điền',
    description: 'Container đã đóng gói + sealed. Tài xế chở đến trạm cân PD → cân OUT → tự động chuyển sang Đã xuất + cập nhật BL.',
    actionLabel: 'Mở tab Vận chuyển',
    tabKey: 'shipping',
  },
  shipped: {
    message: 'Bước tiếp: Theo dõi vận chuyển + cập nhật BL',
    description: 'Hàng đã lên tàu. Logistics nhập số BL, vessel, ETD/ETA. Khi hàng đến cảng đích → mark "Đã giao".',
    actionLabel: 'Mở tab Vận chuyển',
    tabKey: 'shipping',
  },
  delivered: {
    message: 'Bước tiếp: Lập Invoice gửi khách',
    description: 'Khách đã nhận hàng. Kế toán generate Commercial Invoice + Packing List → gửi khách → mark "Đã lập HĐ".',
    actionLabel: 'Mở tab Tài chính',
    tabKey: 'finance',
  },
  invoiced: {
    message: 'Bước tiếp: Đợi khách thanh toán',
    description: 'Invoice đã gửi. Theo dõi payment vào TK ngân hàng. Khi tổng tiền nhận = giá trị đơn → tự động chuyển "Đã thanh toán".',
    actionLabel: 'Mở tab Tài chính',
    tabKey: 'finance',
  },
}

interface Props {
  order: SalesOrder
  onTabChange?: (tabKey: string) => void
}

export default function SalesOrderStatusTimeline({ order, onTabChange }: Props) {
  const navigate = useNavigate()
  const status = order.status as SalesOrderStatus

  const isCancelled = status === 'cancelled'
  const isPaid = status === 'paid'

  // Index của current step trong FLOW_STEPS
  const currentIdx = useMemo(() => {
    if (isCancelled) return -1
    return FLOW_STEPS.findIndex((s) => s.status === status)
  }, [status, isCancelled])

  // Tooltip hiển thị timestamp khi có
  const stepTimestamp = (s: SalesOrderStatus): string | null => {
    if (s === 'draft' && order.created_at) return new Date(order.created_at).toLocaleDateString('vi-VN')
    if (s === 'confirmed' && order.confirmed_at) return new Date(order.confirmed_at).toLocaleDateString('vi-VN')
    if (s === 'shipped' && order.shipped_at) return new Date(order.shipped_at).toLocaleDateString('vi-VN')
    return null
  }

  const nextHint = !isCancelled && !isPaid
    ? NEXT_STEP_HINTS[status as keyof typeof NEXT_STEP_HINTS]
    : null

  const handleAction = () => {
    if (!nextHint) return
    if (onTabChange) {
      onTabChange(nextHint.tabKey)
    } else {
      // Fallback: navigate URL với query param tab
      navigate(`/sales/orders/${order.id}?tab=${nextHint.tabKey}`)
    }
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, borderRadius: 10, borderLeft: `4px solid ${isCancelled ? '#ff4d4f' : isPaid ? '#52c41a' : '#1890ff'}` }}
      bodyStyle={{ padding: '12px 16px' }}
    >
      {/* Cancelled banner riêng */}
      {isCancelled && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message="Đơn hàng đã hủy"
          description="Đơn này đã bị hủy. Stock allocations (nếu có) đã được hoàn lại kho. Để tạo đơn mới, click 'Tạo đơn' từ list."
          style={{ marginBottom: 0 }}
        />
      )}

      {/* Steps timeline */}
      {!isCancelled && (
        <>
          <Steps
            current={currentIdx}
            size="small"
            labelPlacement="vertical"
            responsive={false}
            status={isPaid ? 'finish' : 'process'}
            items={FLOW_STEPS.map((step) => {
              const ts = stepTimestamp(step.status)
              const label = ORDER_STATUS_LABELS[step.status]
              return {
                title: (
                  <Tooltip title={ts ? `${label} — ${ts}` : label}>
                    <Text style={{ fontSize: 11 }}>{label}</Text>
                  </Tooltip>
                ),
                icon: step.icon,
              }
            })}
          />

          {/* Hint "Next step" */}
          {nextHint && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message={
                <Space>
                  <Text strong style={{ color: '#1B4D3E' }}>💡 {nextHint.message}</Text>
                  <Tag color="blue">{ORDER_STATUS_LABELS[status]}</Tag>
                </Space>
              }
              description={
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>{nextHint.description}</Text>
                  <Button
                    type="primary"
                    size="small"
                    icon={<ArrowRightOutlined />}
                    onClick={handleAction}
                    style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                  >
                    {nextHint.actionLabel}
                  </Button>
                </Space>
              }
            />
          )}

          {/* Paid — completed */}
          {isPaid && (
            <Alert
              type="success"
              showIcon
              message="🎉 Đơn hàng hoàn tất"
              description="Đã giao + lập invoice + thanh toán đủ. Đơn này khép sổ — không còn action nào."
              style={{ marginTop: 12 }}
            />
          )}
        </>
      )}
    </Card>
  )
}
