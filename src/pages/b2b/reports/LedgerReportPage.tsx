import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Space, Typography, Row, Col, Statistic, Select, DatePicker, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ReloadOutlined,
  ExportOutlined,
  BarChartOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  WalletOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { ledgerService, AgingItem, BalanceSummary } from '../../../services/b2b/ledgerService'
import { exportLedgerReport } from '../../../utils/b2bLedgerExportExcel'

const { Title, Text } = Typography

const TIER_COLORS: Record<string, string> = { diamond: 'purple', gold: 'gold', silver: 'default', bronze: 'orange', new: 'cyan' }

const formatCurrency = (value: number | null): string => {
  if (!value) return '0'
  return new Intl.NumberFormat('vi-VN').format(value)
}

const LedgerReportPage = () => {
  const [summary, setSummary] = useState<BalanceSummary | null>(null)
  const [agingData, setAgingData] = useState<AgingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(new Date().getMonth() + 1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [balanceSummary, agingReport] = await Promise.all([
        ledgerService.getBalanceSummary(selectedYear, selectedMonth),
        ledgerService.getAgingReport(),
      ])
      setSummary(balanceSummary)
      setAgingData(agingReport)
    } catch (error) {
      message.error('Không thể tải dữ liệu báo cáo công nợ')
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleExport = async () => {
    try {
      const periodLabel = selectedMonth
        ? `Tháng ${selectedMonth}/${selectedYear}`
        : `Năm ${selectedYear}`
      await exportLedgerReport({ summary, aging: agingData, periodLabel })
      message.success('Đã xuất file Excel báo cáo công nợ')
    } catch (err) {
      console.error(err)
      message.error('Xuất Excel thất bại')
    }
  }

  const agingColumns: ColumnsType<AgingItem> = [
    {
      title: 'Đối tác',
      dataIndex: 'partner_name',
      key: 'partner_name',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.partner_name}</Text>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.partner_code}</Text>
            {record.partner_tier && (
              <Tag color={TIER_COLORS[record.partner_tier] || 'default'} style={{ fontSize: 11 }}>
                {record.partner_tier.toUpperCase()}
              </Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: '0-30 ngày',
      dataIndex: 'current',
      key: 'current',
      align: 'right',
      render: (value: number) => formatCurrency(value),
    },
    {
      title: '31-60 ngày',
      dataIndex: 'days_30',
      key: 'days_30',
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value > 0 ? 'orange' : undefined }}>{formatCurrency(value)}</span>
      ),
    },
    {
      title: '61-90 ngày',
      dataIndex: 'days_60',
      key: 'days_60',
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value > 0 ? 'red' : undefined }}>{formatCurrency(value)}</span>
      ),
    },
    {
      title: '> 90 ngày',
      dataIndex: 'days_90',
      key: 'days_90',
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value > 0 ? 'red' : undefined, fontWeight: value > 0 ? 'bold' : undefined }}>
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      title: 'Tổng cộng',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      render: (value: number) => (
        <span style={{ fontWeight: 'bold', color: '#1B4D3E' }}>{formatCurrency(value)}</span>
      ),
    },
  ]

  const monthOptions = [
    { label: 'Tất cả', value: undefined as unknown as number },
    ...Array.from({ length: 12 }, (_, i) => ({ label: `Tháng ${i + 1}`, value: i + 1 })),
  ]

  const yearOptions = [2024, 2025, 2026].map((y) => ({ label: `${y}`, value: y }))

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <BarChartOutlined style={{ marginRight: 8 }} />
            Báo cáo Công nợ
          </Title>
          <Text type="secondary">Phân tích tuổi nợ và tổng hợp công nợ đối tác</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
              Làm mới
            </Button>
            <Button icon={<ExportOutlined />} type="primary" onClick={handleExport} disabled={loading}>
              Xuất Excel
            </Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Space size={16}>
          <Space>
            <Text>Năm:</Text>
            <Select
              value={selectedYear}
              onChange={(value) => setSelectedYear(value)}
              options={yearOptions}
              style={{ width: 100 }}
            />
          </Space>
          <Space>
            <Text>Tháng:</Text>
            <Select
              value={selectedMonth}
              onChange={(value) => setSelectedMonth(value || undefined)}
              options={monthOptions}
              style={{ width: 120 }}
            />
          </Space>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Tổng nợ phải thu"
              value={summary?.total_debit ?? 0}
              precision={0}
              valueStyle={{ color: 'red' }}
              prefix={<ArrowUpOutlined />}
              suffix="₫"
              formatter={(value) => formatCurrency(value as number)}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Tổng nợ phải trả"
              value={summary?.total_credit ?? 0}
              precision={0}
              valueStyle={{ color: 'green' }}
              prefix={<ArrowDownOutlined />}
              suffix="₫"
              formatter={(value) => formatCurrency(value as number)}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Số dư ròng"
              value={summary?.net_balance ?? 0}
              precision={0}
              valueStyle={{ color: '#1B4D3E' }}
              prefix={<WalletOutlined />}
              suffix="₫"
              formatter={(value) => formatCurrency(value as number)}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Số đối tác"
              value={summary?.partner_count ?? 0}
              precision={0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <BarChartOutlined />
            <span>Phân tích tuổi nợ</span>
          </Space>
        }
        style={{ borderRadius: 12 }}
      >
        <Table<AgingItem>
          columns={agingColumns}
          dataSource={agingData}
          loading={loading}
          size="middle"
          bordered
          pagination={false}
          scroll={{ x: 900 }}
          rowKey={(record) => record.partner_code}
          summary={() => {
            const sumCurrent = agingData.reduce((acc, item) => acc + (item.current || 0), 0)
            const sumDays30 = agingData.reduce((acc, item) => acc + (item.days_30 || 0), 0)
            const sumDays60 = agingData.reduce((acc, item) => acc + (item.days_60 || 0), 0)
            const sumDays90 = agingData.reduce((acc, item) => acc + (item.days_90 || 0), 0)
            const sumTotal = agingData.reduce((acc, item) => acc + (item.total || 0), 0)

            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <Text strong>Tổng cộng</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong>{formatCurrency(sumCurrent)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Text strong style={{ color: sumDays30 > 0 ? 'orange' : undefined }}>
                    {formatCurrency(sumDays30)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <Text strong style={{ color: sumDays60 > 0 ? 'red' : undefined }}>
                    {formatCurrency(sumDays60)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <Text strong style={{ color: sumDays90 > 0 ? 'red' : undefined }}>
                    {formatCurrency(sumDays90)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <Text strong style={{ color: '#1B4D3E' }}>{formatCurrency(sumTotal)}</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }}
        />
      </Card>
    </div>
  )
}

export default LedgerReportPage
