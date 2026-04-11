// ============================================================================
// SHIFT REPORT PAGE — Báo cáo ca sản xuất
// File: src/pages/production/ShiftReportPage.tsx
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Statistic, Card, Row, Col, Descriptions } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { shiftReportService, type ShiftReport } from '../../services/production/shiftReportService'
import AdvancedDataTable, { type ColumnDef } from '../../components/common/AdvancedDataTable'

const { Text } = Typography
const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

const SHIFT_LABELS: Record<string, string> = { '1': 'Ca 1 (6-14h)', '2': 'Ca 2 (14-22h)', '3': 'Ca 3 (22-6h)' }

export default function ShiftReportPage() {
  const navigate = useNavigate()
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = now.toISOString().split('T')[0]

  const { data: reports = [], isLoading, refetch } = useQuery({
    queryKey: ['shift-reports', monthStart],
    queryFn: () => shiftReportService.getByRange(monthStart, today),
  })

  const { data: oeeSummary } = useQuery({
    queryKey: ['oee-summary', monthStart],
    queryFn: () => shiftReportService.getOEESummary(monthStart, today),
  })

  const columns: ColumnDef<ShiftReport>[] = [
    { key: 'report_date', title: 'Ngày', dataIndex: 'report_date', width: 100, sortable: true,
      render: (v) => formatDate(v) },
    { key: 'shift', title: 'Ca', dataIndex: 'shift', width: 120,
      filterType: 'select', filterOptions: [{ value: '1', label: 'Ca 1' }, { value: '2', label: 'Ca 2' }, { value: '3', label: 'Ca 3' }],
      render: (v) => <Tag>{SHIFT_LABELS[v] || `Ca ${v}`}</Tag> },
    { key: 'team', title: 'Tổ', dataIndex: 'team', width: 60, align: 'center',
      render: (v) => v ? <Tag color="blue">{v}</Tag> : '—' },
    { key: 'actual_output_kg', title: 'Sản lượng (kg)', dataIndex: 'actual_output_kg', width: 120, align: 'right', sortable: true,
      render: (v) => v ? <Text strong>{Number(v).toLocaleString('vi-VN')}</Text> : '—', exportRender: (v) => v || 0 },
    { key: 'yield_percent', title: 'Đạt KH %', dataIndex: 'yield_percent', width: 80, align: 'center',
      render: (v) => v ? <Tag color={v >= 90 ? 'success' : v >= 70 ? 'warning' : 'error'}>{v}%</Tag> : '—' },
    { key: 'total_downtime_minutes', title: 'Dừng máy', dataIndex: 'total_downtime_minutes', width: 90, align: 'right',
      render: (v) => v ? `${v} phút` : '0' },
    { key: 'qc_pass_rate', title: 'QC Pass', dataIndex: 'qc_pass_rate', width: 80, align: 'center',
      render: (v) => v ? <Tag color={v >= 95 ? 'success' : 'warning'}>{v}%</Tag> : '—' },
    { key: 'oee_overall', title: 'OEE', dataIndex: 'oee_overall', width: 80, align: 'center', sortable: true,
      render: (v) => v ? <Text strong style={{ color: v >= 85 ? '#52c41a' : v >= 60 ? '#fa8c16' : '#ff4d4f' }}>{v}%</Text> : '—' },
    { key: 'headcount', title: 'NV', dataIndex: 'headcount', width: 50, align: 'center' },
  ]

  const renderInlineDetail = (r: ShiftReport) => (
    <div style={{ padding: '4px 0' }}>
      <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="OEE" value={r.oee_overall || 0} suffix="%" valueStyle={{ fontSize: 20, color: (r.oee_overall || 0) >= 85 ? '#52c41a' : '#fa8c16' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Sản lượng" value={r.actual_output_kg || 0} suffix="kg" valueStyle={{ fontSize: 18, color: '#1B4D3E' }} formatter={v => Number(v).toLocaleString('vi-VN')} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="QC Pass" value={r.qc_pass_rate || 0} suffix="%" valueStyle={{ fontSize: 18, color: '#1890ff' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
          <Statistic title="Downtime" value={r.total_downtime_minutes || 0} suffix="phút" valueStyle={{ fontSize: 18, color: '#fa8c16' }} />
        </Card></Col>
      </Row>
      <Descriptions size="small" column={{ xs: 1, sm: 2 }} labelStyle={{ fontWeight: 600 }}>
        <Descriptions.Item label="Khả dụng (A)">{r.oee_availability || 0}%</Descriptions.Item>
        <Descriptions.Item label="Hiệu suất (P)">{r.oee_performance || 0}%</Descriptions.Item>
        <Descriptions.Item label="Chất lượng (Q)">{r.oee_quality || 0}%</Descriptions.Item>
        <Descriptions.Item label="Bành đạt">{r.passed_bales || 0} / {r.total_bales || 0}</Descriptions.Item>
        <Descriptions.Item label="Bàn giao ca sau">{r.handover_notes || '—'}</Descriptions.Item>
        <Descriptions.Item label="Sự cố">{r.incidents || '—'}</Descriptions.Item>
      </Descriptions>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>⏱️ Báo cáo ca sản xuất</Text>
      </div>

      {/* OEE Summary */}
      {oeeSummary && oeeSummary.report_count > 0 && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={6}><Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="OEE trung bình" value={oeeSummary.avg_oee} suffix="%" valueStyle={{ color: '#1B4D3E' }} />
          </Card></Col>
          <Col xs={6}><Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Khả dụng" value={oeeSummary.avg_availability} suffix="%" />
          </Card></Col>
          <Col xs={6}><Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Hiệu suất" value={oeeSummary.avg_performance} suffix="%" />
          </Card></Col>
          <Col xs={6}><Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Chất lượng" value={oeeSummary.avg_quality} suffix="%" />
          </Card></Col>
        </Row>
      )}

      <AdvancedDataTable<ShiftReport>
        columns={columns}
        dataSource={reports}
        rowKey="id"
        loading={isLoading}
        title="Báo cáo ca"
        dateRangeField="report_date"
        onRefresh={() => refetch()}
        expandedRowRender={renderInlineDetail}
        exportFileName="Bao_Cao_Ca_SX"
        pageSize={50}
      />
    </div>
  )
}
