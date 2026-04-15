// ============================================================================
// QC DASHBOARD PAGE — Ant Design + Rubber Grade Distribution
// File: src/pages/wms/qc/QCDashboardPage.tsx
// Rewrite: Tailwind -> Ant Design v6
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenTab } from '../../../hooks/useOpenTab'
import {
  Card, Row, Col, Statistic, Table, Tag, Button, Space,
  Input, Select, Typography, Spin, Alert, Empty, Progress,
} from 'antd'
import {
  ReloadOutlined, ExperimentOutlined, SettingOutlined,
  WarningOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PrinterOutlined,
} from '@ant-design/icons'
import qcService from '../../../services/wms/qcService'
import type { DRCOverviewItem } from '../../../services/wms/qcService'

type DRCStats = Awaited<ReturnType<typeof qcService.getDRCStats>>
import { supabase } from '../../../lib/supabase'
import GradeBadge from '../../../components/wms/GradeBadge'
import { QCBadge } from '../../../components/wms/QCInputForm'
import type { RubberGrade } from '../../../services/wms/wms.types'
import { RUBBER_GRADE_COLORS } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

const QCDashboardPage = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()

  const openBatchQC = (batchId: string, batchNo?: string) => {
    openTab({
      key: `batch-qc-${batchId}`,
      title: `QC lô ${batchNo || batchId.slice(0, 8)}`,
      componentId: 'batch-qc-history',
      props: { batchId },
      path: `/wms/qc/batch/${batchId}`,
    })
  }

  const openBatchLabel = (batchId: string, batchNo?: string) => {
    openTab({
      key: `batch-label-${batchId}`,
      title: `Nhãn ${batchNo || batchId.slice(0, 8)}`,
      componentId: 'batch-label',
      props: { batchId },
      path: `/wms/batch/${batchId}/label`,
    })
  }
  const [stats, setStats] = useState<DRCStats | null>(null)
  const [batches, setBatches] = useState<DRCOverviewItem[]>([])
  const [gradeDistribution, setGradeDistribution] = useState<{ grade: string; count: number; weight: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const loadData = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true); else setLoading(true)
      const [s, b] = await Promise.all([qcService.getDRCStats(), qcService.getDRCOverview()])
      setStats(s); setBatches(b)
      try {
        const { data } = await supabase.from('stock_batches')
          .select('rubber_grade, quantity_remaining').eq('status', 'active').gt('quantity_remaining', 0)
        if (data) {
          const map: Record<string, { count: number; weight: number }> = {}
          for (const b of data) { const g = (b as any).rubber_grade || 'unknown'; if (!map[g]) map[g] = { count: 0, weight: 0 }; map[g].count++; map[g].weight += (b as any).quantity_remaining || 0 }
          setGradeDistribution(Object.entries(map).map(([grade, d]) => ({ grade, ...d })).sort((a, b) => b.weight - a.weight))
        }
      } catch (e) { console.error(e) }
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = batches.filter(b => {
    if (searchText) { const s = searchText.toLowerCase(); if (!b.batch_no.toLowerCase().includes(s) && !b.material_name?.toLowerCase().includes(s)) return false }
    if (filterStatus !== 'all' && b.qc_status !== filterStatus) return false
    return true
  })

  const columns = [
    { title: 'Lo', dataIndex: 'batch_no', key: 'batch_no', render: (v: string) => <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 12 }}>{v}</Text> },
    { title: 'Vật liệu', key: 'mat', render: (_: any, r: DRCOverviewItem) => <><Text style={{ fontSize: 13 }}>{r.material_name}</Text><br/><Text type="secondary" style={{ fontSize: 11 }}>{r.material_sku}</Text></> },
    { title: 'Grade', key: 'grade', render: (_: any, r: any) => <GradeBadge grade={r.rubber_grade} size="small" /> },
    { title: 'DRC', key: 'drc', render: (_: any, r: DRCOverviewItem) => <Space size={4}><Text type="secondary" style={{ fontSize: 11, fontFamily: "'JetBrains Mono'" }}>{r.initial_drc || '—'}%</Text><Text type="secondary">→</Text><Text strong style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: '#1B4D3E' }}>{r.latest_drc || '—'}%</Text></Space> },
    { title: 'QC', dataIndex: 'qc_status', key: 'qc', render: (v: string) => <QCBadge result={v} size="sm" /> },
    { title: 'Tái kiểm', key: 'recheck', render: (_: any, r: DRCOverviewItem) => { if (!r.next_recheck_date) return <Text type="secondary">—</Text>; const d = Math.ceil((new Date(r.next_recheck_date).getTime() - Date.now()) / 86400000); return <Tag color={d <= 0 ? 'red' : d <= 3 ? 'orange' : 'default'}>{d <= 0 ? `Quá hạn ${Math.abs(d)}d` : `${d}d`}</Tag> } },
    { title: 'Kho', key: 'wh', render: (_: any, r: DRCOverviewItem) => <Text type="secondary" style={{ fontSize: 11 }}>{r.warehouse_name}</Text> },
    { title: 'SL', dataIndex: 'quantity_remaining', key: 'qty', align: 'right' as const, render: (v: number) => <Text style={{ fontFamily: "'JetBrains Mono'" }}>{v?.toLocaleString()}</Text> },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: any, r: DRCOverviewItem) =>
        r.qc_status === 'passed' ? (
          <Button
            type="text"
            size="small"
            icon={<PrinterOutlined />}
            title="In nhãn QR"
            onClick={(e) => { e.stopPropagation(); openBatchLabel(r.id, (r as any).batch_no) }}
          />
        ) : null,
    },
  ]

  if (loading) return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col><Title level={4} style={{ margin: 0, color: '#1B4D3E' }}><ExperimentOutlined style={{ marginRight: 8 }} />QC & DRC</Title></Col>
        <Col><Space><Button icon={<ReloadOutlined spin={refreshing} />} onClick={() => loadData(true)}>Làm mới</Button><Button icon={<SettingOutlined />} onClick={() => navigate('/wms/qc/standards')}>Ngưỡng QC</Button></Space></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: 'Tổng lô', value: stats?.totalBatches || 0, color: '#1B4D3E', icon: <ExperimentOutlined />, filter: 'all' },
          { title: 'Đạt', value: stats?.passedCount || 0, color: '#16A34A', icon: <CheckCircleOutlined />, filter: 'passed' },
          { title: 'Cảnh báo', value: stats?.warningCount || 0, color: '#F59E0B', icon: <WarningOutlined />, filter: 'warning' },
          { title: 'Cần trộn', value: stats?.needsBlendCount || 0, color: '#DC2626', icon: <CloseCircleOutlined />, filter: 'needs_blend' },
          { title: 'DRC TB', value: stats?.avgDRC || '—', color: '#1B4D3E', suffix: stats?.avgDRC ? '%' : '' },
        ].map((item, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <Card bodyStyle={{ padding: 16, cursor: item.filter ? 'pointer' : undefined }} onClick={item.filter ? () => setFilterStatus(item.filter!) : undefined}>
              <Statistic title={item.title} value={item.value} suffix={(item as any).suffix}
                valueStyle={{ color: item.color, fontFamily: "'JetBrains Mono'" }} prefix={(item as any).icon} />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title={<Space><ExperimentOutlined /> Phân bố Grade</Space>} size="small">
            {gradeDistribution.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có du lieu" /> :
              gradeDistribution.map(item => { const total = gradeDistribution.reduce((s, g) => s + g.weight, 0); const pct = total > 0 ? Math.round((item.weight / total) * 100) : 0; return (
                <div key={item.grade} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <GradeBadge grade={item.grade as RubberGrade} size="small" />
                  <Progress percent={pct} size="small" style={{ flex: 1 }} strokeColor={RUBBER_GRADE_COLORS[item.grade as RubberGrade] || '#6B7280'} format={() => `${pct}%`} />
                  <Text type="secondary" style={{ fontSize: 11, fontFamily: "'JetBrains Mono'", minWidth: 50, textAlign: 'right' }}>{(item.weight / 1000).toFixed(1)}T</Text>
                </div>
              ) })
            }
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          {(stats?.overdueRecheckCount || 0) > 0 && (
            <Alert type="warning" message={`${stats?.overdueRecheckCount} lô quá hạn tái kiểm`} showIcon
              action={<Button size="small" onClick={() => navigate('/wms/qc/recheck')} style={{ background: '#E8A838', borderColor: '#E8A838', color: 'white' }}>Tái kiểm ngay</Button>}
              style={{ marginBottom: 16, borderRadius: 8 }} />
          )}
          <Space>
            <Button type="primary" onClick={() => navigate('/wms/qc/recheck')} style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>Tái kiểm DRC</Button>
            <Button onClick={() => navigate('/wms/qc/standards')}>Ngưỡng QC</Button>
          </Space>
        </Col>
      </Row>

      <Card title="Danh sách lo" extra={<Space>
        <Input.Search placeholder="Tìm lô..." value={searchText} onChange={e => setSearchText(e.target.value)} allowClear style={{ width: 200 }} size="small" />
        <Select value={filterStatus} onChange={setFilterStatus} size="small" style={{ width: 120 }} options={[{ value: 'all', label: 'Tất cả' }, { value: 'passed', label: 'Đạt' }, { value: 'warning', label: 'Cảnh báo' }, { value: 'needs_blend', label: 'Cần trộn' }, { value: 'pending', label: 'Chờ QC' }]} />
      </Space>}>
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          pagination={{ showSizeChanger: true, showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}` }}
          onRow={r => ({ onClick: () => openBatchQC(r.id, (r as any).batch_no), style: { cursor: 'pointer' } })} />
      </Card>
    </div>
  )
}

export default QCDashboardPage
