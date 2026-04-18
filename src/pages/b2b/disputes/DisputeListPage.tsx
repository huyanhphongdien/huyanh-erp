// ============================================================================
// DISPUTE LIST PAGE — Factory xem danh sách DRC disputes
// File: src/pages/b2b/disputes/DisputeListPage.tsx
//
// Route: /b2b/disputes
// Hiển thị tất cả disputes với filter status, click row → mở drawer để resolve.
// ============================================================================

import { useEffect, useState } from 'react'
import {
  Table,
  Tag,
  Typography,
  Space,
  Select,
  Card,
  Button,
  Input,
  Badge,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons'
import {
  drcDisputeService,
  type DrcDispute,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_COLORS,
  type DisputeStatus,
} from '../../../services/b2b/drcDisputeService'
import DisputeDetailDrawer from '../../../components/b2b/DisputeDetailDrawer'
import { useAuthStore } from '../../../stores/authStore'

const { Title, Text } = Typography

const DisputeListPage = () => {
  const { user } = useAuthStore()
  const [disputes, setDisputes] = useState<DrcDispute[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })

  const fetchData = async () => {
    setLoading(true)
    try {
      const data = await drcDisputeService.getDisputes({
        status: statusFilter,
      })
      setDisputes(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [statusFilter])

  const filtered = search
    ? disputes.filter((d) =>
        [d.dispute_number, d.deal?.deal_number, d.partner?.name, d.partner?.code]
          .filter(Boolean)
          .some((s) => s!.toLowerCase().includes(search.toLowerCase()))
      )
    : disputes

  const openCount = disputes.filter((d) => d.status === 'open').length
  const investigatingCount = disputes.filter((d) => d.status === 'investigating').length

  const columns: ColumnsType<DrcDispute> = [
    {
      title: 'Mã',
      dataIndex: 'dispute_number',
      key: 'dispute_number',
      width: 130,
      fixed: 'left',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: DisputeStatus) => (
        <Tag color={DISPUTE_STATUS_COLORS[s]}>{DISPUTE_STATUS_LABELS[s]}</Tag>
      ),
    },
    {
      title: 'Đại lý',
      key: 'partner',
      width: 200,
      render: (_: any, d: DrcDispute) => (
        <div>
          <div>{d.partner?.name}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{d.partner?.code}</Text>
        </div>
      ),
    },
    {
      title: 'Deal',
      key: 'deal',
      width: 180,
      render: (_: any, d: DrcDispute) => (
        <div>
          <div>{d.deal?.deal_number}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{d.deal?.product_name}</Text>
        </div>
      ),
    },
    {
      title: 'DRC (dk / thực)',
      key: 'drc',
      width: 130,
      render: (_: any, d: DrcDispute) => (
        <span>
          {d.expected_drc}% / <b>{d.actual_drc}%</b>
        </span>
      ),
    },
    {
      title: 'Chênh',
      dataIndex: 'drc_variance',
      key: 'variance',
      width: 90,
      render: (v: number) => (
        <Text strong style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>
          {v > 0 ? '+' : ''}{v}%
        </Text>
      ),
    },
    {
      title: 'Ngày',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 130,
      render: (v: string) => new Date(v).toLocaleDateString('vi-VN'),
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <Space align="center" style={{ marginBottom: 16 }}>
        <WarningOutlined style={{ fontSize: 20, color: '#f59e0b' }} />
        <Title level={4} style={{ margin: 0 }}>Khiếu nại DRC</Title>
      </Space>

      <Card>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Tìm mã, đại lý, deal..."
            allowClear
            style={{ width: 260 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            style={{ width: 180 }}
            options={[
              { value: 'all', label: 'Tất cả trạng thái' },
              { value: 'open', label: `Đang mở${openCount > 0 ? ` (${openCount})` : ''}` },
              { value: 'investigating', label: `Đang xác minh${investigatingCount > 0 ? ` (${investigatingCount})` : ''}` },
              { value: 'resolved_accepted', label: 'Đã chấp nhận' },
              { value: 'resolved_rejected', label: 'Đã từ chối' },
              { value: 'withdrawn', label: 'Đã rút' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Tải lại</Button>
          {openCount > 0 && (
            <Badge count={openCount} offset={[-4, 0]}>
              <Text type="warning" style={{ marginLeft: 8 }}>
                {openCount} khiếu nại chờ xử lý
              </Text>
            </Badge>
          )}
        </Space>

        <Table<DrcDispute>
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="middle"
          scroll={{ x: 1100 }}
          onRow={(record) => ({
            onClick: () => setDrawer({ open: true, id: record.id }),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <DisputeDetailDrawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, id: null })}
        disputeId={drawer.id}
        viewerType="factory"
        actionBy={user?.employee_id ?? undefined}
        onChanged={fetchData}
      />
    </div>
  )
}

export default DisputeListPage
