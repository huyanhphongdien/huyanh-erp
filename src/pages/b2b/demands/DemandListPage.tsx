// ============================================================================
// DEMAND LIST PAGE — Danh sach Nhu cau mua B2B
// File: src/pages/b2b/demands/DemandListPage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Badge,
  Statistic,
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue, SorterResult } from 'antd/es/table/interface'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  ShoppingOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  LockOutlined,
} from '@ant-design/icons'
import {
  demandService,
  Demand,
  DemandStatus,
  DemandType,
  DemandListParams,
  DEMAND_STATUS_LABELS,
  DEMAND_STATUS_COLORS,
  DEMAND_TYPE_LABELS,
  DEMAND_TYPE_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  PRODUCT_TYPE_NAMES,
} from '../../../services/b2b/demandService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Title, Text } = Typography

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const isDeadlinePast = (dateStr: string | null): boolean => {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

const formatQuantityTons = (kg: number): string => {
  return (kg / 1000).toFixed(1)
}

const formatPrice = (value: number | null): string => {
  if (!value) return '-'
  return value.toLocaleString('vi-VN')
}

// ============================================
// MAIN COMPONENT
// ============================================

const DemandListPage = () => {
  const navigate = useNavigate()

  // State
  const [demands, setDemands] = useState<Demand[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ total: 0, published: 0, filled: 0, closed: 0 })

  // Filters
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<DemandStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<DemandType | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  })

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchDemands = useCallback(async () => {
    try {
      setLoading(true)

      const params: DemandListParams = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        demand_type: typeFilter !== 'all' ? typeFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
      }

      const response = await demandService.getList(params)
      setDemands(response.data)
      setTotal(response.total)
    } catch (error) {
      console.error('Error fetching demands:', error)
      message.error('Không thể tải danh sách nhu cầu')
    } finally {
      setLoading(false)
    }
  }, [pagination, searchText, statusFilter, typeFilter, priorityFilter])

  const fetchStats = useCallback(async () => {
    try {
      const result = await demandService.getStats()
      setStats(result)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }, [])

  // Effects
  useEffect(() => {
    fetchDemands()
  }, [fetchDemands])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSearch = (value: string) => {
    setSearchText(value)
    setPagination(prev => ({ ...prev, current: 1 }))
  }

  const handleTableChange = (
    pag: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    _sorter: SorterResult<Demand> | SorterResult<Demand>[]
  ) => {
    setPagination({
      current: pag.current || 1,
      pageSize: pag.pageSize || 10,
    })
  }

  const handleRefresh = () => {
    fetchDemands()
    fetchStats()
  }

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns: ColumnsType<Demand> = [
    {
      title: 'Mã',
      dataIndex: 'code',
      key: 'code',
      width: 160,
      fixed: 'left',
      render: (text, record) => (
        <Button
          type="link"
          onClick={() => navigate(`/b2b/demands/${record.id}`)}
          style={{ padding: 0 }}
        >
          <Text strong>{text}</Text>
        </Button>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'demand_type',
      key: 'demand_type',
      width: 100,
      render: (type: DemandType) => (
        <Tag color={DEMAND_TYPE_COLORS[type]}>
          {DEMAND_TYPE_LABELS[type]}
        </Tag>
      ),
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
      dataIndex: 'quantity_kg',
      key: 'quantity_kg',
      width: 120,
      align: 'right',
      render: (kg: number, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{formatQuantityTons(kg)} tấn</Text>
          {record.quantity_filled_kg > 0 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Đã đủ: {formatQuantityTons(record.quantity_filled_kg)} tấn
            </Text>
          )}
        </Space>
      ),
      sorter: true,
    },
    {
      title: 'DRC yêu cầu',
      key: 'drc',
      width: 110,
      align: 'center',
      render: (_, record) => {
        if (!record.drc_min && !record.drc_max) return '-'
        if (record.drc_min && record.drc_max) {
          return <Text>{record.drc_min}% - {record.drc_max}%</Text>
        }
        if (record.drc_min) return <Text>&ge; {record.drc_min}%</Text>
        return <Text>&le; {record.drc_max}%</Text>
      },
    },
    {
      title: 'Giá',
      key: 'price',
      width: 150,
      align: 'right',
      render: (_, record) => {
        if (!record.price_min && !record.price_max) return '-'
        if (record.price_min && record.price_max) {
          return (
            <Text style={{ color: '#1B4D3E' }}>
              {formatPrice(record.price_min)} - {formatPrice(record.price_max)} đ/kg
            </Text>
          )
        }
        if (record.price_min) {
          return <Text style={{ color: '#1B4D3E' }}>&ge; {formatPrice(record.price_min)} đ/kg</Text>
        }
        return <Text style={{ color: '#1B4D3E' }}>&le; {formatPrice(record.price_max)} đ/kg</Text>
      },
    },
    {
      title: 'Hạn chót',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 110,
      render: (deadline: string | null) => {
        if (!deadline) return '-'
        const isPast = isDeadlinePast(deadline)
        return (
          <Text style={isPast ? { color: '#ff4d4f', fontWeight: 600 } : undefined}>
            {formatDate(deadline)}
          </Text>
        )
      },
      sorter: true,
    },
    {
      title: 'Chào giá',
      key: 'offers',
      width: 90,
      align: 'center',
      render: (_, record) => {
        if (!record.offers_count) return <Text type="secondary">0</Text>
        return (
          <Badge
            count={record.pending_offers_count || 0}
            size="small"
            offset={[6, 0]}
          >
            <Tag color="blue">{record.offers_count}</Tag>
          </Badge>
        )
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: DemandStatus) => (
        <Tag color={DEMAND_STATUS_COLORS[status]}>
          {DEMAND_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: 'Ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority: string) => (
        <Tag color={PRIORITY_COLORS[priority] || 'default'}>
          {PRIORITY_LABELS[priority] || priority}
        </Tag>
      ),
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
            <Title level={3} style={{ margin: 0 }}>Nhu cầu mua</Title>
            <Text type="secondary">Quản lý nhu cầu mua nguyên liệu từ đại lý</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                Làm mới
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/b2b/demands/new')}
                style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Tạo nhu cầu
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Stats Row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Tổng"
              value={stats.total}
              prefix={<ShoppingOutlined style={{ color: '#1B4D3E' }} />}
              valueStyle={{ color: '#1B4D3E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Đang đăng"
              value={stats.published}
              prefix={<CloudUploadOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Đã đủ"
              value={stats.filled}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Đã đóng"
              value={stats.closed}
              prefix={<LockOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Card */}
      <Card style={{ borderRadius: 12 }}>
        {/* Filter Bar */}
        <div style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Input
                placeholder="Tìm theo mã hoặc sản phẩm..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                allowClear
                style={{ maxWidth: 300 }}
              />
            </Col>
            <Col>
              <Space>
                <Select
                  value={statusFilter}
                  onChange={(v) => {
                    setStatusFilter(v)
                    setPagination(prev => ({ ...prev, current: 1 }))
                  }}
                  style={{ width: 150 }}
                  options={[
                    { value: 'all', label: 'Tất cả trạng thái' },
                    { value: 'draft', label: 'Nháp' },
                    { value: 'published', label: 'Đang đăng' },
                    { value: 'partially_filled', label: 'Đủ một phần' },
                    { value: 'filled', label: 'Đã đủ' },
                    { value: 'closed', label: 'Đã đóng' },
                    { value: 'cancelled', label: 'Đã hủy' },
                  ]}
                />
                <Select
                  value={typeFilter}
                  onChange={(v) => {
                    setTypeFilter(v)
                    setPagination(prev => ({ ...prev, current: 1 }))
                  }}
                  style={{ width: 140 }}
                  options={[
                    { value: 'all', label: 'Tất cả loại' },
                    { value: 'purchase', label: 'Mua đứt' },
                    { value: 'processing', label: 'Gia công' },
                  ]}
                />
                <Select
                  value={priorityFilter}
                  onChange={(v) => {
                    setPriorityFilter(v)
                    setPagination(prev => ({ ...prev, current: 1 }))
                  }}
                  style={{ width: 140 }}
                  options={[
                    { value: 'all', label: 'Tất cả ưu tiên' },
                    { value: 'low', label: 'Thấp' },
                    { value: 'normal', label: 'Bình thường' },
                    { value: 'high', label: 'Cao' },
                    { value: 'urgent', label: 'Khẩn cấp' },
                  ]}
                />
              </Space>
            </Col>
          </Row>
        </div>

        {/* Table */}
        <Table
          columns={columns}
          dataSource={demands}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} nhu cầu`,
          }}
          onChange={handleTableChange}
          onRow={(record) => ({
            onClick: () => navigate(`/b2b/demands/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          scroll={{ x: 1300 }}
        />
      </Card>
    </div>
  )
}

export default DemandListPage
