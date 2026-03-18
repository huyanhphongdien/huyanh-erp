// ============================================================================
// APPROVAL TIMELINE — Timeline phê duyệt quyết toán B2B
// File: src/components/b2b/ApprovalTimeline.tsx
// ============================================================================

import { Timeline, Typography } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  EditOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { Settlement } from '../../services/b2b/settlementService'

const { Text } = Typography

const formatDateTime = (dateStr: string | null): string => {
  if (!dateStr) return ''
  return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: vi })
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Chuyển khoản',
  cash: 'Tiền mặt',
  check: 'Séc',
}

interface ApprovalTimelineProps {
  settlement: Settlement
}

const ApprovalTimeline = ({ settlement }: ApprovalTimelineProps) => {
  const items: Array<{
    color: string
    dot?: React.ReactNode
    children: React.ReactNode
  }> = []

  // 1. Created
  items.push({
    color: 'green',
    dot: <EditOutlined />,
    children: (
      <div>
        <Text strong>Tạo phiếu</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDateTime(settlement.created_at)}
        </Text>
        {settlement.created_by && (
          <>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Người tạo: {settlement.created_by}
            </Text>
          </>
        )}
      </div>
    ),
  })

  // 2. Submitted for approval
  if (settlement.submitted_at) {
    items.push({
      color: 'blue',
      dot: <SendOutlined />,
      children: (
        <div>
          <Text strong>Gửi duyệt</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDateTime(settlement.submitted_at)}
          </Text>
        </div>
      ),
    })
  }

  // 3a. Approved
  if (settlement.approved_at) {
    items.push({
      color: 'green',
      dot: <CheckCircleOutlined />,
      children: (
        <div>
          <Text strong style={{ color: '#52c41a' }}>Đã duyệt</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDateTime(settlement.approved_at)}
          </Text>
          {settlement.approved_by && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Người duyệt: {settlement.approved_by}
              </Text>
            </>
          )}
          {settlement.approval_notes && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Ghi chú: {settlement.approval_notes}
              </Text>
            </>
          )}
        </div>
      ),
    })
  }

  // 3b. Rejected
  if (settlement.rejected_at) {
    items.push({
      color: 'red',
      dot: <CloseCircleOutlined />,
      children: (
        <div>
          <Text strong style={{ color: '#ff4d4f' }}>Từ chối</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDateTime(settlement.rejected_at)}
          </Text>
          {settlement.rejected_by && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Người từ chối: {settlement.rejected_by}
              </Text>
            </>
          )}
          {settlement.rejected_reason && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12, color: '#ff4d4f' }}>
                Lý do: {settlement.rejected_reason}
              </Text>
            </>
          )}
        </div>
      ),
    })
  }

  // 4. Paid
  if (settlement.paid_at) {
    items.push({
      color: 'purple',
      dot: <DollarOutlined />,
      children: (
        <div>
          <Text strong style={{ color: '#722ed1' }}>Đã thanh toán</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDateTime(settlement.paid_at)}
          </Text>
          {settlement.payment_method && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Phương thức: {PAYMENT_METHOD_LABELS[settlement.payment_method] || settlement.payment_method}
              </Text>
            </>
          )}
          {settlement.bank_reference && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Mã GD: {settlement.bank_reference}
              </Text>
            </>
          )}
          {settlement.paid_by && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Người thanh toán: {settlement.paid_by}
              </Text>
            </>
          )}
        </div>
      ),
    })
  }

  // Pending indicator (if currently pending)
  if (settlement.status === 'pending') {
    items.push({
      color: 'orange',
      dot: <ClockCircleOutlined />,
      children: (
        <div>
          <Text strong style={{ color: '#fa8c16' }}>Đang chờ duyệt</Text>
        </div>
      ),
    })
  }

  return (
    <Timeline
      items={items}
      style={{ marginTop: 8 }}
    />
  )
}

export default ApprovalTimeline
