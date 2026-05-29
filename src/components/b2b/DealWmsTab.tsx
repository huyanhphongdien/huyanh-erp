// ============================================================================
// DEAL WMS TAB — Tab Nhập kho trong DealDetailPage
// File: src/components/b2b/DealWmsTab.tsx
// Phase: 4.5
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Divider,
  Spin,
  Empty,
  Typography,
  Progress,
} from 'antd'
import {
  InboxOutlined,
  CarOutlined,
  ExperimentOutlined,
  DashboardOutlined,
} from '@ant-design/icons'
import {
  dealWmsService,
  DealStockInSummary,
  DealWeighbridgeSummary,
  DealWmsOverview,
} from '../../services/b2b/dealWmsService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Text } = Typography

// ============================================
// HELPERS
// ============================================

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const formatWeight = (kg: number): string => {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} T`
  return `${kg.toLocaleString()} kg`
}

const fmtMoney = (v: number | null): string => (v ? v.toLocaleString('vi-VN') : '0')

// Ô thống kê nhỏ trong dải stats
const StatChip = ({ label, value }: { label: string; value: string }) => (
  <div style={{ minWidth: 96 }}>
    <div style={{ fontSize: 11, color: '#8c8c8c' }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: '#1B4D3E' }}>{value}</div>
  </div>
)

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  confirmed: 'green',
  cancelled: 'red',
  pending: 'orange',
  in_progress: 'blue',
  completed: 'green',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã hủy',
  pending: 'Chờ cân',
  in_progress: 'Đang cân',
  completed: 'Hoàn thành',
}

// ============================================
// COMPONENT
// ============================================

interface DealWmsTabProps {
  dealId: string
}

const DealWmsTab = ({ dealId }: DealWmsTabProps) => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stockIns, setStockIns] = useState<DealStockInSummary[]>([])
  const [weighbridges, setWeighbridges] = useState<DealWeighbridgeSummary[]>([])
  const [overview, setOverview] = useState<DealWmsOverview | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [sis, wbs, ov] = await Promise.all([
          dealWmsService.getStockInsByDeal(dealId),
          dealWmsService.getWeighbridgeByDeal(dealId),
          dealWmsService.getDealWmsOverview(dealId),
        ])
        setStockIns(sis)
        setWeighbridges(wbs)
        setOverview(ov)
      } catch (error) {
        console.error('Load DealWmsTab error:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [dealId])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
  }

  if (!overview) {
    return <Empty description="Chưa có dữ liệu nhập kho cho Deal này" />
  }

  // ── Tiến độ "đủ hàng": đã cân (tổng phiếu cân) vs số lượng hợp đồng ──
  const targetKg = overview.deal_quantity_kg || 0
  const deliveredKg = overview.total_weighed_kg || overview.total_received_kg || 0
  const pct = targetKg > 0 ? Math.round((deliveredKg / targetKg) * 100) : 0
  const remainingKg = targetKg - deliveredKg
  const isEnough = targetKg > 0 && deliveredKg >= targetKg
  const isOver = targetKg > 0 && deliveredKg > targetKg * 1.001
  const fmtT = (kg: number) => (kg / 1000).toFixed(2)
  const progressTag = isOver
    ? { color: 'orange', label: `Vượt ${fmtT(-remainingKg)} T` }
    : isEnough
      ? { color: 'green', label: 'Đủ hàng' }
      : { color: 'red', label: `Còn thiếu ${fmtT(remainingKg)} T` }
  const noWms = stockIns.length === 0 && weighbridges.length === 0

  return (
    <div>
      {/* Tiến độ giao đủ hàng */}
      {targetKg > 0 && (
        <div style={{ background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <Row justify="space-between" align="middle" style={{ marginBottom: 6 }}>
            <Text strong style={{ fontSize: 14 }}>Tiến độ giao hàng (theo cân)</Text>
            <Tag color={progressTag.color}>{progressTag.label}</Tag>
          </Row>
          <Progress percent={Math.min(100, pct)} status={isEnough ? 'success' : 'active'} format={() => `${pct}%`} />
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Đã giao <Text strong>{fmtT(deliveredKg)}</Text> / HĐ <Text strong>{fmtT(targetKg)}</Text> tấn
            {' '}— theo tổng phiếu cân ({overview.weighbridge_count} phiếu). Đơn vị: kg cân thực tế.
          </Text>
        </div>
      )}

      {noWms && <Empty description="Chưa có phiếu nhập/cân nào — Deal chưa giao hàng" style={{ margin: '12px 0' }} />}

      {/* Overview Stats */}
      {!noWms && (<>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Statistic
            title="Phiếu nhập"
            value={overview.stock_in_count}
            prefix={<InboxOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Đã nhận"
            value={(overview.total_received_kg / 1000).toFixed(1)}
            suffix="tấn"
            valueStyle={{ color: '#1B4D3E' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Lô hàng"
            value={overview.batch_count}
            prefix={<ExperimentOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Phiếu cân"
            value={overview.weighbridge_count}
            prefix={<DashboardOutlined />}
          />
        </Col>
      </Row>

      {/* Stock-In Table */}
      <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>
        <InboxOutlined style={{ marginRight: 8 }} />
        Phiếu nhập kho
      </Text>
      <Table
        dataSource={stockIns}
        rowKey="stock_in_id"
        columns={[
          {
            title: 'Mã phiếu',
            dataIndex: 'code',
            render: (code: string, record: DealStockInSummary) => (
              <a onClick={() => navigate(`/wms/stock-in/${record.stock_in_id}`)}>
                {code}
              </a>
            ),
          },
          {
            title: 'Kho',
            dataIndex: 'warehouse_name',
          },
          {
            title: 'Trọng lượng',
            dataIndex: 'total_weight',
            align: 'right' as const,
            render: (v: number) => formatWeight(v),
          },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            render: (s: string) => (
              <Tag color={STATUS_COLORS[s] || 'default'}>
                {STATUS_LABELS[s] || s}
              </Tag>
            ),
          },
          {
            title: 'Ngày xác nhận',
            dataIndex: 'confirmed_at',
            render: (d: string | null) => formatDate(d),
          },
        ]}
        size="small"
        pagination={false}
        style={{ marginBottom: 24 }}
      />

      {/* Phiếu cân chi tiết + thống kê + cộng dồn */}
      {weighbridges.length > 0 && (() => {
        const totalNet = weighbridges.reduce((s, w) => s + (w.net_weight || 0), 0)
        const totalDry = weighbridges.reduce((s, w) => s + (w.dry_weight || 0), 0)
        const totalValue = weighbridges.reduce((s, w) => s + (w.amount || 0), 0)
        const netForDrc = weighbridges.filter(w => w.drc != null).reduce((s, w) => s + (w.net_weight || 0), 0)
        const drcWeighted = weighbridges.filter(w => w.drc != null).reduce((s, w) => s + ((w.drc || 0) * (w.net_weight || 0)), 0)
        const avgDrc = netForDrc > 0 ? Math.round((drcWeighted / netForDrc) * 10) / 10 : null
        let cum = 0
        const rows: any[] = weighbridges.map(w => { cum += (w.net_weight || 0); return { ...w, _cum: cum } })

        return (
          <>
            <Divider />
            <Text strong style={{ fontSize: 15, marginBottom: 10, display: 'block' }}>
              <CarOutlined style={{ marginRight: 8 }} />
              Chi tiết phiếu cân ({weighbridges.length})
            </Text>

            {/* Dải thống kê */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12, padding: '10px 14px', background: '#FAFAFA', border: '1px solid #f0f0f0', borderRadius: 8 }}>
              <StatChip label="Số phiếu" value={String(weighbridges.length)} />
              <StatChip label="Tổng Net" value={`${(totalNet / 1000).toFixed(2)} T`} />
              <StatChip label="Tổng khô" value={`${(totalDry / 1000).toFixed(2)} T`} />
              <StatChip label="DRC bình quân" value={avgDrc != null ? `${avgDrc}%` : '—'} />
              <StatChip label="Tổng giá trị" value={`${fmtMoney(totalValue)} đ`} />
            </div>

            <Table
              dataSource={rows}
              rowKey="ticket_id"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '#', width: 40, align: 'center' as const, render: (_: any, __: any, i: number) => i + 1 },
                { title: 'Ngày', dataIndex: 'completed_at', width: 95, render: (d: string | null, r: any) => formatDate(d || r.created_at) },
                { title: 'Mã cân', dataIndex: 'code', width: 130 },
                { title: 'Xe', dataIndex: 'vehicle_plate', width: 90 },
                { title: 'Net (kg)', dataIndex: 'net_weight', align: 'right' as const, render: (v: number | null) => v ? v.toLocaleString() : '-' },
                { title: 'DRC', dataIndex: 'drc', align: 'center' as const, width: 60, render: (v: number | null) => v != null ? `${v}%` : '-' },
                { title: 'KL khô (kg)', dataIndex: 'dry_weight', align: 'right' as const, render: (v: number | null) => v != null ? v.toLocaleString() : '-' },
                { title: 'Thành tiền', dataIndex: 'amount', align: 'right' as const, render: (v: number | null) => v != null ? v.toLocaleString() : '-' },
                { title: 'Cộng dồn (kg)', dataIndex: '_cum', align: 'right' as const, render: (v: number) => <Text type="secondary">{v.toLocaleString()}</Text> },
                { title: 'TT', dataIndex: 'status', width: 100, render: (s: string) => (<Tag color={STATUS_COLORS[s] || 'default'}>{STATUS_LABELS[s] || s}</Tag>) },
              ]}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: '#FFFBEB' }}>
                    <Table.Summary.Cell index={0} colSpan={4}><Text strong>TỔNG CỘNG</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right"><Text strong>{totalNet.toLocaleString()}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={5} />
                    <Table.Summary.Cell index={6} align="right"><Text strong>{totalDry.toLocaleString()}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right"><Text strong style={{ color: '#92400E' }}>{totalValue.toLocaleString()}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={8} />
                    <Table.Summary.Cell index={9} />
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </>
        )
      })()}
      </>)}
    </div>
  )
}

export default DealWmsTab
