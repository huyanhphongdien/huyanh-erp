// ============================================================================
// SUPPLIER QUALITY REPORT PAGE
// File: src/pages/wms/reports/SupplierQualityReportPage.tsx
// Phase: P10 - Bao cao WMS
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Tag, Button, Space, Typography, Row, Col,
  DatePicker,
} from 'antd'
import {
  ReloadOutlined, TeamOutlined, DownloadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import wmsReportService from '../../../services/wms/wmsReportService'
import type { SupplierQualityReport } from '../../../services/wms/wms.types'
import PageState from '../../../components/common/PageState'
import { xuatExcelBaoCao } from './wmsReportExcel'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const SupplierQualityReportPage = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [data, setData] = useState<SupplierQualityReport[]>([])
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await wmsReportService.getSupplierQualityReport({
        from_date: dateRange ? dateRange[0].format('YYYY-MM-DD') : undefined,
        to_date: dateRange ? dateRange[1].format('YYYY-MM-DD') : undefined,
      })
      setData(result)
    } catch (err) {
      console.error('Load supplier quality report error:', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => { loadData() }, [loadData])

  const numStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono'", fontSize: 13 }

  const getPassRateColor = (rate: number) => {
    if (rate >= 90) return '#16A34A'
    if (rate >= 70) return '#F59E0B'
    return '#DC2626'
  }

  const handleExportExcel = () => {
    xuatExcelBaoCao('chat-luong-dai-ly', [{
      name: 'Chất lượng NCC',
      title: dateRange
        ? `Chất lượng đại lý cung cấp ${dateRange[0].format('DD/MM/YYYY')} – ${dateRange[1].format('DD/MM/YYYY')}`
        : 'Chất lượng đại lý cung cấp (toàn bộ thời gian)',
      columns: [
        { title: 'Đại lý', align: 'left' },
        { title: 'Vùng', align: 'left' },
        { title: 'Số lô', summary: 'sum' },
        { title: 'Tổng KL (kg)', summary: 'sum' },
        { title: 'DRC TB (%)' },
        { title: 'DRC min (%)' },
        { title: 'DRC max (%)' },
        { title: 'Đạt', summary: 'sum' },
        { title: 'Cảnh báo', summary: 'sum' },
        { title: 'Lỗi', summary: 'sum' },
        { title: 'Tỷ lệ đạt (%)' },
      ],
      rows: data.map(r => [
        r.supplier_name, r.supplier_region || '', r.batch_count, r.total_weight_kg,
        r.avg_drc, r.drc_min, r.drc_max, r.passed_count, r.warning_count, r.failed_count, r.pass_rate,
      ]),
    }])
  }

  const columns = [
    {
      title: 'Đại lý', dataIndex: 'supplier_name', key: 'name', width: 180,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Vùng', dataIndex: 'supplier_region', key: 'region', width: 120,
      render: (v: string) => <Text type="secondary">{v || '—'}</Text>,
    },
    {
      title: 'Số lô', dataIndex: 'batch_count', key: 'batches', align: 'right' as const, width: 80,
      render: (v: number) => <Text style={numStyle}>{v}</Text>,
    },
    {
      title: 'Tổng KL (kg)', dataIndex: 'total_weight_kg', key: 'weight', align: 'right' as const, width: 120,
      render: (v: number) => <Text style={numStyle}>{v.toLocaleString('vi-VN')}</Text>,
    },
    {
      title: 'DRC TB', dataIndex: 'avg_drc', key: 'avg_drc', align: 'right' as const, width: 90,
      render: (v: number) => <Text style={{ ...numStyle, color: '#1B4D3E' }}>{v}%</Text>,
    },
    {
      title: 'Khoảng DRC', key: 'drc_range', align: 'center' as const, width: 120,
      render: (_: unknown, r: SupplierQualityReport) => (
        <Text type="secondary" style={numStyle}>{r.drc_min}% – {r.drc_max}%</Text>
      ),
    },
    {
      title: 'Đạt', dataIndex: 'passed_count', key: 'passed', align: 'right' as const, width: 70,
      render: (v: number) => <Tag color="green">{v}</Tag>,
    },
    {
      title: 'Cảnh báo', dataIndex: 'warning_count', key: 'warning', align: 'right' as const, width: 80,
      render: (v: number) => v > 0 ? <Tag color="orange">{v}</Tag> : <Text type="secondary">0</Text>,
    },
    {
      title: 'Lỗi', dataIndex: 'failed_count', key: 'failed', align: 'right' as const, width: 70,
      render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <Text type="secondary">0</Text>,
    },
    {
      title: 'Tỷ lệ đạt', dataIndex: 'pass_rate', key: 'pass_rate', align: 'right' as const, width: 100,
      sorter: (a: SupplierQualityReport, b: SupplierQualityReport) => a.pass_rate - b.pass_rate,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => (
        <Text strong style={{ ...numStyle, color: getPassRateColor(v) }}>{v}%</Text>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header — trang sống trong tab của /wms/reports nên không có nút Quay lại */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <TeamOutlined style={{ marginRight: 8 }} />Chất lượng đại lý cung cấp
          </Title>
        </Col>
        <Col>
          <Space>
            <RangePicker
              value={dateRange}
              onChange={(vals) => {
                if (vals && vals[0] && vals[1]) setDateRange([vals[0], vals[1]])
                else setDateRange(null)
              }}
              format="DD/MM/YYYY"
              size="small"
              allowClear
            />
            <Button icon={<DownloadOutlined />} onClick={handleExportExcel} disabled={data.length === 0}>Xuất Excel</Button>
            <Button icon={<ReloadOutlined />} onClick={loadData}>Làm mới</Button>
          </Space>
        </Col>
      </Row>

      {/* Table */}
      <Card>
        <PageState
          loading={loading}
          error={error}
          onRetry={() => loadData()}
          empty={data.length === 0}
          emptyText="Không có dữ liệu đại lý"
        >
          <Table
            dataSource={data}
            columns={columns}
            rowKey="supplier_name"
            size="small"
            pagination={{ showSizeChanger: true, showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}` }}
            scroll={{ x: 1000 }}
          />
        </PageState>
      </Card>
    </div>
  )
}

export default SupplierQualityReportPage
