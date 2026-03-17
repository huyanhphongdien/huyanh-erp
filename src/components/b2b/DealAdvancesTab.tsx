// ============================================================================
// DEAL ADVANCES TAB — Tab Tạm ứng trong DealDetailPage
// File: src/components/b2b/DealAdvancesTab.tsx
// Phase: 4.5
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Spin,
  Empty,
  Divider,
  Typography,
} from 'antd'
import {
  DollarOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import {
  advanceService,
  Advance,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../services/b2b/advanceService'
import { Deal } from '../../services/b2b/dealService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Text } = Typography

// ============================================
// HELPERS
// ============================================

const formatCurrency = (value: number | null): string => {
  if (!value && value !== 0) return '-'
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0,
  }).format(value)
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  check: 'Séc',
}

// ============================================
// COMPONENT
// ============================================

interface DealAdvancesTabProps {
  dealId: string
  deal: Deal
}

const DealAdvancesTab = ({ dealId, deal }: DealAdvancesTabProps) => {
  const [loading, setLoading] = useState(true)
  const [advances, setAdvances] = useState<Advance[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const data = await advanceService.getAdvancesByDeal(dealId)
        setAdvances(data)
      } catch (error) {
        console.error('Load DealAdvancesTab error:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [dealId])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
  }

  // Calculate totals
  const totalAdvanced = advances
    .filter(a => a.status === 'paid')
    .reduce((sum, a) => sum + (a.amount_vnd || a.amount || 0), 0)

  const dealValue = deal.final_value || deal.total_value_vnd || 0
  const balanceDue = dealValue - totalAdvanced

  return (
    <div>
      {/* Financial Summary */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={8}>
          <Statistic
            title="Giá trị Deal"
            value={formatCurrency(dealValue)}
            suffix="VNĐ"
            prefix={<DollarOutlined />}
            valueStyle={{ color: '#1B4D3E' }}
          />
        </Col>
        <Col xs={8}>
          <Statistic
            title="Đã tạm ứng"
            value={formatCurrency(totalAdvanced)}
            suffix="VNĐ"
            prefix={<WalletOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col xs={8}>
          <Statistic
            title="Còn lại"
            value={formatCurrency(balanceDue)}
            suffix="VNĐ"
            valueStyle={{ color: balanceDue > 0 ? '#cf1322' : '#52c41a' }}
          />
        </Col>
      </Row>

      <Divider />

      {/* Advances Table */}
      {advances.length === 0 ? (
        <Empty description="Chưa có phiếu tạm ứng nào" />
      ) : (
        <>
          <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>
            <WalletOutlined style={{ marginRight: 8 }} />
            Danh sách tạm ứng ({advances.length})
          </Text>
          <Table
            dataSource={advances}
            rowKey="id"
            columns={[
              {
                title: 'Mã phiếu',
                dataIndex: 'advance_number',
                render: (v: string) => <Text strong>{v}</Text>,
              },
              {
                title: 'Số tiền',
                dataIndex: 'amount',
                align: 'right' as const,
                render: (_: number, record: Advance) => (
                  <Text strong style={{ color: '#1B4D3E' }}>
                    {formatCurrency(record.amount_vnd || record.amount)} VNĐ
                  </Text>
                ),
              },
              {
                title: 'Hình thức',
                dataIndex: 'payment_method',
                render: (v: string) => PAYMENT_METHOD_LABELS[v] || v,
              },
              {
                title: 'Ngày chi',
                dataIndex: 'paid_at',
                render: (d: string | null) => formatDate(d),
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                render: (s: string) => (
                  <Tag color={ADVANCE_STATUS_COLORS[s as keyof typeof ADVANCE_STATUS_COLORS] || 'default'}>
                    {ADVANCE_STATUS_LABELS[s as keyof typeof ADVANCE_STATUS_LABELS] || s}
                  </Tag>
                ),
              },
              {
                title: 'Tham chiếu NH',
                dataIndex: 'bank_reference',
                render: (v: string | null) => v || '-',
              },
            ]}
            size="small"
            pagination={false}
          />
        </>
      )}
    </div>
  )
}

export default DealAdvancesTab
