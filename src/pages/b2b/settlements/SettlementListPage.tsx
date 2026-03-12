import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Table, Tabs, Input, Button, Space, Tag, Typography, Row, Col, Tooltip, Dropdown, Badge, Popconfirm, message } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue, SorterResult } from 'antd/es/table/interface'
import type { MenuProps } from 'antd'
import { PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined, MoreOutlined, ReloadOutlined, ExportOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { settlementService, Settlement, SettlementStatus, SettlementType, SettlementListParams, SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_COLORS, SETTLEMENT_TYPE_LABELS, SETTLEMENT_TYPE_COLORS } from '../../../services/b2b/settlementService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Title, Text } = Typography

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'paid', label: 'Đã thanh toán' },
]

const TIER_COLORS: Record<string, string> = {
  diamond: 'purple', gold: 'gold', silver: 'default', bronze: 'orange', new: 'cyan',
}

const formatCurrency = (value: number | null): string => {
  if (!value) return '-'
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(2)} tỷ`
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)} tr`
  return value.toLocaleString('vi-VN')
}

const formatDate = (dateStr: string): string => format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })

const SettlementListPage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [activeTab, setActiveTab] = useState<string>(searchParams.get('status') || 'all')
  const [searchText, setSearchText] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })

  const fetchSettlements = useCallback(async () => {
    setLoading(true)
    try {
      const params: SettlementListParams = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        status: activeTab !== 'all' ? (activeTab as SettlementStatus) : undefined,
      }
      const res = await settlementService.getSettlements(params)
      setSettlements(res.data)
      setTotal(res.total)
    } catch (err) {
      message.error('Không thể tải danh sách quyết toán')
    } finally {
      setLoading(false)
    }
  }, [pagination, searchText, activeTab])

  const fetchStatusCounts = useCallback(async () => {
    try {
      const counts = await settlementService.getStatsByStatus()
      setStatusCounts(counts)
    } catch (err) {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchSettlements()
  }, [fetchSettlements])

  useEffect(() => {
    fetchStatusCounts()
  }, [fetchStatusCounts])

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setPagination({ ...pagination, current: 1 })
    setSearchParams(key === 'all' ? {} : { status: key })
  }

  const handleSearch = (value: string) => {
    setSearchText(value)
    setPagination({ ...pagination, current: 1 })
  }

  const handleTableChange = (
    pag: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    _sorter: SorterResult<Settlement> | SorterResult<Settlement>[]
  ) => {
    setPagination({
      current: pag.current || 1,
      pageSize: pag.pageSize || 10,
    })
  }

  const handleSubmitForApproval = async (id: string) => {
    try {
      await settlementService.submitForApproval(id)
      message.success('Đã gửi duyệt thành công')
      fetchSettlements()
      fetchStatusCounts()
    } catch {
      message.error('Gửi duyệt thất bại')
    }
  }

  const handleApprove = async (id: string) => {
    try {
      await settlementService.approveSettlement(id, 'current-user-id')
      message.success('Đã duyệt quyết toán')
      fetchSettlements()
      fetchStatusCounts()
    } catch {
      message.error('Duyệt thất bại')
    }
  }

  const handleMarkPaid = async (id: string) => {
    try {
      await settlementService.markPaid(id)
      message.success('Đã cập nhật trạng thái thanh toán')
      fetchSettlements()
      fetchStatusCounts()
    } catch {
      message.error('Cập nhật thất bại')
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await settlementService.cancelSettlement(id)
      message.success('Đã hủy quyết toán')
      fetchSettlements()
      fetchStatusCounts()
    } catch {
      message.error('Hủy thất bại')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await settlementService.deleteSettlement(id)
      message.success('Đã xóa quyết toán')
      fetchSettlements()
      fetchStatusCounts()
    } catch {
      message.error('Xóa thất bại')
    }
  }

  const getActionMenuItems = (record: Settlement): MenuProps['items'] => {
    const items: MenuProps['items'] = []

    if (record.status === 'draft') {
      items.push({
        key: 'submit',
        icon: <CheckCircleOutlined />,
        label: 'Gửi duyệt',
        onClick: () => handleSubmitForApproval(record.id),
      })
      items.push({
        key: 'delete',
        icon: <DeleteOutlined />,
        label: (
          <Popconfirm
            title="Xác nhận xóa?"
            description="Bạn có chắc muốn xóa phiếu quyết toán này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <span>Xóa</span>
          </Popconfirm>
        ),
        danger: true,
      })
    }

    if (record.status === 'pending') {
      items.push({
        key: 'approve',
        icon: <CheckCircleOutlined />,
        label: 'Duyệt',
        onClick: () => handleApprove(record.id),
      })
    }

    if (record.status === 'approved') {
      items.push({
        key: 'paid',
        icon: <CheckCircleOutlined />,
        label: 'Đã thanh toán',
        onClick: () => handleMarkPaid(record.id),
      })
    }

    if (record.status !== 'cancelled' && record.status !== 'paid') {
      items.push({
        key: 'cancel',
        icon: <CloseCircleOutlined />,
        label: (
          <Popconfirm
            title="Xác nhận hủy?"
            description="Bạn có chắc muốn hủy phiếu quyết toán này?"
            onConfirm={() => handleCancel(record.id)}
            okText="Hủy phiếu"
            cancelText="Không"
          >
            <span>Hủy</span>
          </Popconfirm>
        ),
        danger: true,
      })
    }

    return items
  }

  const columns: ColumnsType<Settlement> = [
    {
      title: 'Mã QT',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      fixed: 'left',
      render: (code: string, record: Settlement) => (
        <a
          onClick={() => navigate(`/b2b/settlements/${record.id}`)}
          style={{ fontWeight: 600 }}
        >
          {code}
        </a>
      ),
    },
    {
      title: 'Đại lý',
      key: 'partner',
      width: 200,
      render: (_: any, record: Settlement) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.partner?.name || '-'}</Text>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.partner?.code}</Text>
            {record.partner?.tier && (
              <Tag color={TIER_COLORS[record.partner.tier] || 'default'} style={{ fontSize: 11 }}>
                {record.partner.tier.toUpperCase()}
              </Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'settlement_type',
      key: 'settlement_type',
      width: 100,
      render: (type: SettlementType) => (
        <Tag color={SETTLEMENT_TYPE_COLORS[type] || 'default'}>
          {SETTLEMENT_TYPE_LABELS[type] || type}
        </Tag>
      ),
    },
    {
      title: 'KL cân',
      dataIndex: 'weighed_kg',
      key: 'weighed_kg',
      width: 100,
      align: 'right',
      render: (val: number) => val ? `${val.toLocaleString('vi-VN')} kg` : '-',
    },
    {
      title: 'KL thành phẩm',
      dataIndex: 'finished_kg',
      key: 'finished_kg',
      width: 110,
      align: 'right',
      render: (val: number) => val ? `${val.toLocaleString('vi-VN')} kg` : '-',
    },
    {
      title: 'DRC%',
      dataIndex: 'drc_percent',
      key: 'drc_percent',
      width: 80,
      align: 'right',
      render: (val: number) => val ? `${val}%` : '-',
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'gross_amount',
      key: 'gross_amount',
      width: 120,
      align: 'right',
      render: (val: number) => (
        <Text strong style={{ color: '#1B4D3E' }}>
          {formatCurrency(val)}
        </Text>
      ),
    },
    {
      title: 'Tạm ứng',
      dataIndex: 'total_advance',
      key: 'total_advance',
      width: 110,
      align: 'right',
      render: (val: number) => formatCurrency(val),
    },
    {
      title: 'Còn lại',
      dataIndex: 'remaining_amount',
      key: 'remaining_amount',
      width: 120,
      align: 'right',
      render: (val: number) => (
        <Text strong style={{ color: val > 0 ? 'red' : undefined }}>
          {formatCurrency(val)}
        </Text>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: SettlementStatus) => (
        <Tag color={SETTLEMENT_STATUS_COLORS[status] || 'default'}>
          {SETTLEMENT_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (dateStr: string) => dateStr ? formatDate(dateStr) : '-',
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_: unknown, record: Settlement) => {
        const menuItems = getActionMenuItems(record)
        return (
          <Space>
            <Tooltip title="Xem chi tiết">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => navigate(`/b2b/settlements/${record.id}`)}
              />
            </Tooltip>
            {menuItems && menuItems.length > 0 && (
              <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                <Button type="text" size="small" icon={<MoreOutlined />} />
              </Dropdown>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Quản lý Quyết toán</Title>
          <Text type="secondary">Danh sách phiếu quyết toán</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchSettlements(); fetchStatusCounts() }}>
              Làm mới
            </Button>
            <Button icon={<ExportOutlined />}>
              Xuất Excel
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/b2b/settlements/new')}>
              Tạo phiếu QT
            </Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={STATUS_TABS.map((tab) => ({
            key: tab.key,
            label: (
              <span>
                {tab.label}
                {statusCounts[tab.key] !== undefined && (
                  <Badge
                    count={statusCounts[tab.key]}
                    style={{ marginLeft: 8 }}
                    size="small"
                    showZero={false}
                  />
                )}
              </span>
            ),
          }))}
          style={{ marginBottom: 16 }}
        />

        <Row style={{ marginBottom: 16 }}>
          <Col>
            <Input
              placeholder="Tìm theo mã QT, đại lý..."
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 320 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={(e) => handleSearch((e.target as HTMLInputElement).value)}
            />
          </Col>
        </Row>

        <Table<Settlement>
          columns={columns}
          dataSource={settlements}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${t} phiếu`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 1400 }}
          size="middle"
        />
      </Card>
    </div>
  )
}

export default SettlementListPage
