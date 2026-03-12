// ============================================================================
// LEDGER OVERVIEW PAGE — Tổng quan Sổ Công Nợ đối tác
// File: src/pages/b2b/ledger/LedgerOverviewPage.tsx
// Phase: E5
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Input,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Tag,
  Statistic,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined,
  EyeOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { ledgerService, PartnerBalance, ENTRY_TYPE_LABELS } from '../../../services/b2b/ledgerService'
import type { BalanceSummary } from '../../../services/b2b/ledgerService'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Title, Text } = Typography

// ============================================
// CONSTANTS
// ============================================

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
  if (!value) return '0'
  return new Intl.NumberFormat('vi-VN').format(value)
}

const formatDate = (dateStr: string): string => {
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

// ============================================
// MAIN COMPONENT
// ============================================

const LedgerOverviewPage = () => {
  const navigate = useNavigate()

  // State
  const [balances, setBalances] = useState<PartnerBalance[]>([])
  const [summary, setSummary] = useState<BalanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchBalances = useCallback(async () => {
    try {
      setLoading(true)
      const data = await ledgerService.getAllPartnerBalances()
      setBalances(data)
    } catch (error) {
      console.error('Error fetching balances:', error)
      message.error('Không thể tải danh sách công nợ')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const data = await ledgerService.getBalanceSummary()
      setSummary(data)
    } catch (error) {
      console.error('Error fetching summary:', error)
    }
  }, [])

  // Effects
  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // ============================================
  // HANDLERS
  // ============================================

  const handleRefresh = () => {
    fetchBalances()
    fetchSummary()
  }

  const handleSearch = (value: string) => {
    setSearchText(value)
  }

  const handleViewPartner = (partnerId: string) => {
    navigate(`/b2b/ledger/${partnerId}`)
  }

  // ============================================
  // FILTERED DATA
  // ============================================

  const filteredBalances = balances.filter((item) => {
    if (!searchText) return true
    const search = searchText.toLowerCase()
    return (
      item.partner_name.toLowerCase().includes(search) ||
      item.partner_code.toLowerCase().includes(search)
    )
  })

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns: ColumnsType<PartnerBalance> = [
    {
      title: 'Đối tác',
      key: 'partner',
      width: 250,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.partner_name}</Text>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.partner_code}
            </Text>
            {record.partner_tier && (
              <Tag color={TIER_COLORS[record.partner_tier]} style={{ fontSize: 10 }}>
                {record.partner_tier.toUpperCase()}
              </Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: 'Tổng nợ',
      dataIndex: 'total_debit',
      key: 'total_debit',
      width: 150,
      align: 'right',
      render: (value) => (
        <Text style={{ color: '#cf1322' }}>
          {formatCurrency(value)}
        </Text>
      ),
      sorter: (a, b) => a.total_debit - b.total_debit,
    },
    {
      title: 'Tổng có',
      dataIndex: 'total_credit',
      key: 'total_credit',
      width: 150,
      align: 'right',
      render: (value) => (
        <Text style={{ color: '#389e0d' }}>
          {formatCurrency(value)}
        </Text>
      ),
      sorter: (a, b) => a.total_credit - b.total_credit,
    },
    {
      title: 'Số dư',
      dataIndex: 'balance',
      key: 'balance',
      width: 150,
      align: 'right',
      render: (value) => (
        <Text strong style={{ color: value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : undefined }}>
          {formatCurrency(value)}
        </Text>
      ),
      sorter: (a, b) => a.balance - b.balance,
    },
    {
      title: 'Ngày giao dịch gần nhất',
      dataIndex: 'last_entry_date',
      key: 'last_entry_date',
      width: 180,
      render: (date) => (date ? formatDate(date) : '-'),
      sorter: (a, b) => {
        if (!a.last_entry_date) return -1
        if (!b.last_entry_date) return 1
        return new Date(a.last_entry_date).getTime() - new Date(b.last_entry_date).getTime()
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewPartner(record.partner_id)}
        >
          Xem
        </Button>
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
            <Title level={3} style={{ margin: 0 }}>Sổ Công Nợ</Title>
            <Text type="secondary">Tổng quan công nợ các đối tác</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                Làm mới
              </Button>
              <Button icon={<ExportOutlined />}>
                Xuất Excel
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Summary Row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Tổng nợ"
              value={summary?.total_debit || 0}
              formatter={(value) => formatCurrency(value as number)}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Tổng có"
              value={summary?.total_credit || 0}
              formatter={(value) => formatCurrency(value as number)}
              valueStyle={{ color: '#389e0d' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Số dư ròng"
              value={summary?.net_balance || 0}
              formatter={(value) => formatCurrency(value as number)}
              valueStyle={{ color: '#1B4D3E' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Số đối tác"
              value={summary?.partner_count || 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Card */}
      <Card
        style={{ borderRadius: 12 }}
        bodyStyle={{ padding: 0 }}
      >
        {/* Search */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <Row gutter={16}>
            <Col flex="auto">
              <Input
                placeholder="Tìm theo tên hoặc mã đối tác..."
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                allowClear
                style={{ maxWidth: 300 }}
              />
            </Col>
          </Row>
        </div>

        {/* Table */}
        <Table
          columns={columns}
          dataSource={filteredBalances}
          rowKey="partner_id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} đối tác`,
          }}
          onRow={(record) => ({
            onClick: () => handleViewPartner(record.partner_id),
            style: { cursor: 'pointer' },
          })}
          scroll={{ x: 1080 }}
          style={{ padding: '0 24px 24px' }}
        />
      </Card>
    </div>
  )
}

export default LedgerOverviewPage
