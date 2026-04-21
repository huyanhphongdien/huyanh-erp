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
  Button,
  Tooltip,
  message,
} from 'antd'
import {
  DollarOutlined,
  WalletOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  advanceService,
  Advance,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../services/b2b/advanceService'
import { Deal } from '../../services/b2b/dealService'
import { dealChatActionsService } from '../../services/b2b/dealChatActionsService'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import AddAdvanceModal, { AddAdvanceFormData } from './AddAdvanceModal'
import type { DealCardMetadata } from '../../types/b2b.types'
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
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { user } = useAuthStore()

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

  useEffect(() => {
    loadData()
  }, [dealId])

  // Business rule: chỉ được tạo advance khi deal đã Duyệt (accepted)
  const canAddAdvance = deal.status === 'accepted'

  // Submit handler — call dealChatActionsService (reuse full 6-step pipeline)
  const handleAddAdvance = async (formData: AddAdvanceFormData) => {
    if (!user?.employee_id) {
      message.error('Không xác định được nhân viên đang đăng nhập')
      return
    }
    if (!deal.partner_id) {
      message.error('Deal thiếu partner_id, không thể tạo tạm ứng')
      return
    }

    setSubmitting(true)
    try {
      // Lookup chat room để service gửi notification message vào chat
      const { data: room } = await supabase
        .from('b2b_chat_rooms')
        .select('id')
        .eq('partner_id', deal.partner_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!room?.id) {
        message.error('Không tìm thấy phòng chat cho đại lý — không thể ứng tiền từ đây')
        return
      }

      const result = await dealChatActionsService.addAdvanceFromChat(formData, {
        dealId,
        dealNumber: deal.deal_number,
        partnerId: deal.partner_id,
        roomId: room.id,
        actionBy: user.employee_id,
        actionByType: 'factory',
      })

      message.success(
        `Đã ứng thêm ${result.amount.toLocaleString('vi-VN')} VNĐ (${result.advance_number})`
      )
      setAddModalOpen(false)
      await loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể tạo tạm ứng')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
  }

  // Calculate totals
  const totalAdvanced = advances
    .filter(a => a.status === 'paid')
    .reduce((sum, a) => sum + (a.amount_vnd || a.amount || 0), 0)

  const dealValue = deal.final_value || deal.total_value_vnd || 0
  const balanceDue = dealValue - totalAdvanced

  // Build deal metadata tối thiểu để AddAdvanceModal render
  const dealMeta: DealCardMetadata = {
    deal_id: dealId,
    deal_number: deal.deal_number,
    status: deal.status,
    product_type: deal.product_code || '',
    quantity_kg: deal.quantity_kg || 0,
    expected_drc: deal.expected_drc || 0,
    agreed_price: deal.unit_price || 0,
    estimated_value: dealValue,
    total_advanced: totalAdvanced,
    balance_due: balanceDue,
  } as DealCardMetadata

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

      {/* Header row: Title + Nút Ứng thêm tiền */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 15 }}>
          <WalletOutlined style={{ marginRight: 8 }} />
          Danh sách tạm ứng ({advances.length})
        </Text>
        <Tooltip
          title={
            !canAddAdvance
              ? `Chỉ được tạm ứng khi deal đã DUYỆT. Hiện: "${deal.status}"`
              : 'Tạo phiếu tạm ứng mới cho đại lý'
          }
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canAddAdvance}
            onClick={() => setAddModalOpen(true)}
            style={{ background: canAddAdvance ? '#1B4D3E' : undefined, borderColor: canAddAdvance ? '#1B4D3E' : undefined }}
          >
            Ứng thêm tiền
          </Button>
        </Tooltip>
      </div>

      {/* Advances Table */}
      {advances.length === 0 ? (
        <Empty description="Chưa có phiếu tạm ứng nào" />
      ) : (
        <>
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

      <AddAdvanceModal
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onConfirm={handleAddAdvance}
        loading={submitting}
        deal={dealMeta}
        partnerName={(deal as any).partner_name || undefined}
      />
    </div>
  )
}

export default DealAdvancesTab
