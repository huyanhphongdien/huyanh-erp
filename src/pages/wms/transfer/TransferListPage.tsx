// ============================================================================
// TRANSFER LIST PAGE — Danh sách phiếu chuyển kho (F3)
// File: src/pages/wms/transfer/TransferListPage.tsx
// ============================================================================

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Space, Card, Row, Col, Statistic, Progress } from 'antd'
import { PlusOutlined, SwapRightOutlined } from '@ant-design/icons'
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable'
import { useOpenTab } from '../../../hooks/useOpenTab'
import { useFacilityFilter } from '../../../stores/facilityFilterStore'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import transferService, { type InterFacilityTransfer, type TransferStatus } from '../../../services/wms/transferService'

const { Text } = Typography
const PRIMARY = '#1B4D3E'

const STATUS_LABELS: Record<TransferStatus, string> = {
  draft: 'Nháp',
  picking: 'Đang lấy',
  picked: 'Đã lấy',
  in_transit: 'Đang vận chuyển',
  arrived: 'Đã đến — chờ cân',
  received: 'Hoàn tất',
  cancelled: 'Hủy',
  rejected: 'Từ chối (hao hụt cao)',
}

const STATUS_COLORS: Record<TransferStatus, string> = {
  draft: 'default',
  picking: 'processing',
  picked: 'cyan',
  in_transit: 'warning',
  arrived: 'gold',
  received: 'success',
  cancelled: 'default',
  rejected: 'error',
}

const formatDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('vi-VN') : '—'

const formatDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default function TransferListPage() {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const { currentFacilityId, setCurrentFacilityId } = useFacilityFilter()

  const { data: transfersResult, isLoading, refetch } = useQuery({
    queryKey: ['transfers-all', currentFacilityId],
    queryFn: async () => {
      const res = await transferService.getAll({ pageSize: 200 })
      return res.data
    },
    staleTime: 30000,
  })

  const transfers = transfersResult || []

  // Filter theo facility (cả gửi + nhận đều match)
  const filtered = currentFacilityId
    ? transfers.filter(
        (t) => t.from_facility_id === currentFacilityId || t.to_facility_id === currentFacilityId,
      )
    : transfers

  // Stats
  const inTransitCount = filtered.filter((t) => t.status === 'in_transit').length
  const arrivedCount = filtered.filter((t) => t.status === 'arrived').length
  const needsApprovalCount = filtered.filter((t) => t.needs_approval && t.status === 'arrived').length
  const receivedCount = filtered.filter((t) => t.status === 'received').length
  const totalInTransitWeight = filtered
    .filter((t) => t.status === 'in_transit')
    .reduce((s, t) => s + (t.weight_out_kg || 0), 0)

  const openDetail = (t: InterFacilityTransfer) => {
    openTab({
      key: `transfer-${t.id}`,
      title: `Chuyển ${t.code}`,
      componentId: 'transfer-detail',
      props: { id: t.id },
      path: `/wms/transfer/${t.id}`,
    })
  }

  const columns: ColumnDef<InterFacilityTransfer>[] = [
    {
      key: 'code',
      title: 'Mã phiếu',
      dataIndex: 'code',
      width: 160,
      sortable: true,
      render: (v) => <Text strong style={{ color: PRIMARY }}>{v}</Text>,
    },
    {
      key: 'route',
      title: 'Tuyến',
      dataIndex: ['from_facility', 'code'],
      width: 200,
      render: (_, r: any) => (
        <Space size={4}>
          <Tag color="blue">{r.from_facility?.code}</Tag>
          <SwapRightOutlined style={{ color: '#999' }} />
          <Tag color={r.to_facility?.code === 'PD' ? 'green' : 'cyan'}>{r.to_facility?.code}</Tag>
        </Space>
      ),
      exportRender: (_, r: any) => `${r.from_facility?.code || ''} → ${r.to_facility?.code || ''}`,
    },
    {
      key: 'status',
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 160,
      filterType: 'select',
      filterOptions: Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
      render: (v: TransferStatus, r) => (
        <Space size={4} direction="vertical" style={{ alignItems: 'flex-start' }}>
          <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>
          {r.needs_approval && r.status === 'arrived' && (
            <Tag color="red" style={{ margin: 0, fontSize: 10 }}>Cần BGD duyệt</Tag>
          )}
        </Space>
      ),
      exportRender: (v) => STATUS_LABELS[v as TransferStatus] || v,
    },
    {
      key: 'vehicle',
      title: 'Xe',
      dataIndex: 'vehicle_plate',
      width: 110,
      render: (v) => v ? <Text code>{v}</Text> : '—',
    },
    {
      key: 'weight_out',
      title: 'Cân xuất (kg)',
      dataIndex: 'weight_out_kg',
      width: 120,
      align: 'right',
      sortable: true,
      render: (v) => v ? Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '—',
    },
    {
      key: 'weight_in',
      title: 'Cân nhận (kg)',
      dataIndex: 'weight_in_kg',
      width: 120,
      align: 'right',
      render: (v) => v ? Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '—',
    },
    {
      key: 'loss',
      title: 'Hao hụt',
      dataIndex: 'loss_pct',
      width: 110,
      align: 'right',
      render: (v: number | null, r) => {
        if (v == null) return '—'
        const threshold = 0.5  // default; có thể đọc từ r.loss_threshold_pct
        const ok = v <= threshold
        return (
          <Space size={2} direction="vertical" style={{ alignItems: 'flex-end' }}>
            <Tag color={ok ? 'success' : 'error'} style={{ margin: 0 }}>
              {v.toFixed(2)}%
            </Tag>
            {r.loss_kg != null && (
              <Text type="secondary" style={{ fontSize: 10 }}>
                {r.loss_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg
              </Text>
            )}
          </Space>
        )
      },
    },
    {
      key: 'shipped_at',
      title: 'Giờ xuất',
      dataIndex: 'shipped_at',
      width: 130,
      render: (v) => formatDateTime(v),
    },
    {
      key: 'created_at',
      title: 'Tạo',
      dataIndex: 'created_at',
      width: 100,
      sortable: true,
      render: (v) => formatDate(v),
    },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space size={12}>
          <Text strong style={{ fontSize: 18, color: PRIMARY }}>🔀 Chuyển kho liên nhà máy</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>🏭</Text>
          <FacilityPicker
            value={currentFacilityId}
            onChange={setCurrentFacilityId}
            allowAll
            size="middle"
            style={{ width: 220 }}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/wms/transfer/new')} style={{ background: PRIMARY }}>
          Tạo phiếu chuyển
        </Button>
      </div>

      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #faad14' }}>
            <Statistic
              title="🚛 Đang vận chuyển"
              value={inTransitCount}
              valueStyle={{ color: '#faad14', fontSize: 22 }}
              suffix={inTransitCount > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>({(totalInTransitWeight / 1000).toFixed(1)} T)</Text> : null}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #1890ff' }}>
            <Statistic title="📍 Đã đến" value={arrivedCount} valueStyle={{ color: '#1890ff', fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f' }}>
            <Statistic title="⚠️ Cần BGD duyệt" value={needsApprovalCount} valueStyle={{ color: '#ff4d4f', fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${PRIMARY}` }}>
            <Statistic title="✅ Hoàn tất" value={receivedCount} valueStyle={{ color: PRIMARY, fontSize: 22 }} />
          </Card>
        </Col>
      </Row>

      <AdvancedDataTable<InterFacilityTransfer>
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={isLoading}
        title="Phiếu chuyển kho liên nhà máy"
        dateRangeField="created_at"
        onRefresh={() => refetch()}
        exportFileName="Phieu_Chuyen_Kho"
        pageSize={50}
        onRowClick={openDetail}
      />
    </div>
  )
}
