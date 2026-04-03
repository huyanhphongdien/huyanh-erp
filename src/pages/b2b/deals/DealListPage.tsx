// ============================================================================
// DEAL LIST PAGE — Danh sách Deals/Giao dịch B2B
// File: src/pages/b2b/deals/DealListPage.tsx
// Phase: E2.1.1, E2.1.3, E2.1.4, E2.1.5, E2.1.6, E2.1.7
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card,
  Table,
  Tabs,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Tooltip,
  Dropdown,
  Badge,
  DatePicker,
  Popconfirm,
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue, SorterResult } from 'antd/es/table/interface'
import type { MenuProps } from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  MessageOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  ReloadOutlined,
  FilterOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  dealService,
  Deal,
  DealStatus,
  DealListParams,
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  DEAL_TYPE_LABELS,
  DEAL_TYPE_COLORS,
} from '../../../services/b2b/dealService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

// ============================================
// CONSTANTS
// ============================================

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xử lý' },
  { key: 'processing', label: 'Đang xử lý' },
  { key: 'accepted', label: 'Đã duyệt' },
  { key: 'settled', label: 'Đã quyết toán' },
]

const TIER_COLORS: Record<string, string> = {
  diamond: 'purple',
  gold: 'gold',
  silver: 'default',
  bronze: 'orange',
  new: 'cyan',
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatCurrency = (value: number | null): string => {
  if (!value) return '-'
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(2)} tỷ`
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)} tr`
  }
  return value.toLocaleString('vi-VN')
}

const formatDate = (dateStr: string): string => {
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const formatDateTime = (dateStr: string): string => {
  return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: vi })
}

// ============================================
// MAIN COMPONENT
// ============================================

const DealListPage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // State
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  // Filters
  const [activeTab, setActiveTab] = useState<string>(searchParams.get('status') || 'all')
  const [searchText, setSearchText] = useState('')
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  })

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true)

      const params: DealListParams = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        status: activeTab !== 'all' ? (activeTab as DealStatus) : undefined,
      }

      const response = await dealService.getDeals(params)
      setDeals(response.data)
      setTotal(response.total)
    } catch (error) {
      console.error('Error fetching deals:', error)
      message.error('Không thể tải danh sách giao dịch')
    } finally {
      setLoading(false)
    }
  }, [pagination, searchText, activeTab])

  const fetchStatusCounts = useCallback(async () => {
    try {
      const stats = await dealService.getStatsByStatus()
      const allCount = Object.values(stats).reduce((a: number, b: number) => a + b, 0)
      setStatusCounts({ all: allCount, ...stats })
    } catch (error) {
      console.error('Error fetching status counts:', error)
    }
  }, [])

  // Effects
  useEffect(() => {
    fetchDeals()
  }, [fetchDeals])

  useEffect(() => {
    fetchStatusCounts()
  }, [fetchStatusCounts])

  // ============================================
  // HANDLERS
  // ============================================

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setPagination(prev => ({ ...prev, current: 1 }))
    setSearchParams({ status: key })
  }

  const handleSearch = (value: string) => {
    setSearchText(value)
    setPagination(prev => ({ ...prev, current: 1 }))
  }

  const handleTableChange = (
    pag: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Deal> | SorterResult<Deal>[]
  ) => {
    setPagination({
      current: pag.current || 1,
      pageSize: pag.pageSize || 10,
    })
  }

  const handleViewDeal = (deal: Deal) => {
    navigate(`/b2b/deals/${deal.id}`)
  }

  const handleOpenChat = async (deal: Deal) => {
    try {
      // Tìm chat room của partner
      const room = await dealService.getChatRoomByPartner(deal.partner_id)
      if (room) {
        navigate(`/b2b/chat/${room.id}`)
      } else {
        message.info('Chưa có phòng chat với đại lý này')
      }
    } catch (error) {
      message.error('Không thể mở chat')
    }
  }

  const handleUpdateStatus = async (deal: Deal, newStatus: DealStatus) => {
    try {
      await dealService.updateStatus(deal.id, newStatus)
      message.success(`Đã chuyển trạng thái sang "${DEAL_STATUS_LABELS[newStatus]}"`)
      fetchDeals()
      fetchStatusCounts()
    } catch (error) {
      message.error('Không thể cập nhật trạng thái')
    }
  }

  const handleDeleteDeal = async (deal: Deal) => {
    try {
      await dealService.deleteDeal(deal.id)
      message.success('Đã xóa giao dịch')
      fetchDeals()
      fetchStatusCounts()
    } catch (error: any) {
      message.error(error.message || 'Không thể xóa giao dịch')
    }
  }

  const handleRefresh = () => {
    fetchDeals()
    fetchStatusCounts()
  }

  // ============================================
  // TABLE COLUMNS (E2.1.3)
  // ============================================

  const columns: ColumnsType<Deal> = [
    {
      title: 'Mã Deal',
      dataIndex: 'deal_number',
      key: 'deal_number',
      width: 140,
      fixed: 'left',
      render: (text, record) => (
        <Button type="link" onClick={() => handleViewDeal(record)} style={{ padding: 0 }}>
          <Text strong>{text}</Text>
        </Button>
      ),
      sorter: true,
    },
    {
      title: 'Đại lý',
      key: 'partner',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.partner?.name || '-'}</Text>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.partner?.code}
            </Text>
            {record.partner?.tier && (
              <Tag color={TIER_COLORS[record.partner?.tier]} style={{ fontSize: 10 }}>
                {record.partner?.tier?.toUpperCase()}
              </Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'deal_type',
      key: 'deal_type',
      width: 100,
      render: (type) => type ? (
        <Tag color={DEAL_TYPE_COLORS[type as keyof typeof DEAL_TYPE_COLORS]}>
          {DEAL_TYPE_LABELS[type as keyof typeof DEAL_TYPE_LABELS]}
        </Tag>
      ) : '-',
    },
    {
      title: 'Sản phẩm',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 120,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Số lượng',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (_, record) => (
        <Text strong>
          {record.quantity_tons?.toFixed(1) || '-'} tấn
        </Text>
      ),
      sorter: true,
    },
    {
      title: 'Giá trị',
      dataIndex: 'total_value_vnd',
      key: 'total_value_vnd',
      width: 120,
      align: 'right',
      render: (value: number, record: Deal) => {
        if (record.deal_type === 'processing') {
          return <Tag color="purple">Gia công</Tag>
        }
        return (
          <Text strong style={{ color: '#1B4D3E' }}>
            {formatCurrency(value)}
          </Text>
        )
      },
      sorter: true,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: DealStatus) => (
        <Tag color={DEAL_STATUS_COLORS[status]}>
          {DEAL_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (date) => formatDate(date),
      sorter: true,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const statusActions: MenuProps['items'] = []

        if (record.status === 'pending') {
          statusActions.push({
            key: 'processing',
            icon: <SyncOutlined />,
            label: 'Bắt đầu xử lý',
            onClick: () => handleUpdateStatus(record, 'processing'),
          })
        }

        if (record.status === 'processing') {
          statusActions.push({
            key: 'accepted',
            icon: <CheckCircleOutlined />,
            label: 'Duyệt',
            onClick: () => handleUpdateStatus(record, 'accepted'),
          })
        }

        if (record.status === 'accepted') {
          statusActions.push({
            key: 'settled',
            icon: <CheckCircleOutlined />,
            label: 'Quyết toán',
            onClick: () => handleUpdateStatus(record, 'settled'),
          })
        }

        if (record.status !== 'cancelled' && record.status !== 'settled') {
          statusActions.push({ type: 'divider' })
          statusActions.push({
            key: 'cancelled',
            icon: <CloseCircleOutlined />,
            label: 'Hủy',
            danger: true,
            onClick: () => handleUpdateStatus(record, 'cancelled'),
          })
        }

        const moreItems: MenuProps['items'] = [
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: 'Xem chi tiết',
            onClick: () => handleViewDeal(record),
          },
          {
            key: 'chat',
            icon: <MessageOutlined />,
            label: 'Mở chat',
            onClick: () => handleOpenChat(record),
          },
          ...(statusActions.length > 0 ? [{ type: 'divider' as const }] : []),
          ...statusActions,
          ...(record.status === 'pending' ? [
            { type: 'divider' as const },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              label: 'Xóa',
              danger: true,
              onClick: () => handleDeleteDeal(record),
            },
          ] : []),
        ]

        return (
          <Space>
            <Tooltip title="Xem chi tiết">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handleViewDeal(record)}
              />
            </Tooltip>
            <Tooltip title="Mở chat">
              <Button
                type="text"
                size="small"
                icon={<MessageOutlined />}
                onClick={() => handleOpenChat(record)}
              />
            </Tooltip>
            <Dropdown menu={{ items: moreItems }} trigger={['click']}>
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>Quản lý Giao dịch</Title>
            <Text type="secondary">Danh sách các deals với đại lý</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                Làm mới
              </Button>
              <Button icon={<ExportOutlined />}>
                Xuất Excel
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/b2b/deals/create')}
              >
                Tạo Deal
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Main Card */}
      <Card
        style={{ borderRadius: 12 }}
        bodyStyle={{ padding: 0 }}
      >
        {/* Tabs (E2.1.4) */}
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          style={{ padding: '0 24px' }}
          items={STATUS_TABS.map(tab => ({
            key: tab.key,
            label: (
              <Space>
                {tab.label}
                {statusCounts[tab.key] !== undefined && (
                  <Badge
                    count={statusCounts[tab.key]}
                    style={{
                      backgroundColor: tab.key === activeTab ? '#1B4D3E' : '#d9d9d9',
                    }}
                    showZero
                  />
                )}
              </Space>
            ),
          }))}
        />

        {/* Filters (E2.1.5, E2.1.6) */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <Row gutter={16}>
            <Col flex="auto">
              <Input
                placeholder="Tìm theo mã deal..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                allowClear
                style={{ maxWidth: 300 }}
              />
            </Col>
          </Row>
        </div>

        {/* Table (E2.1.1, E2.1.7) */}
        <Table
          columns={columns}
          dataSource={deals}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} giao dịch`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
          style={{ padding: '0 24px 24px' }}
        />
      </Card>
    </div>
  )
}

export default DealListPage