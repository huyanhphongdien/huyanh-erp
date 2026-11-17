// ============================================================================
// BATCH QC HISTORY PAGE — Ant Design + DRC Trend + Full SVR Metrics
// File: src/pages/wms/qc/BatchQCHistoryPage.tsx
// Rewrite: Tailwind -> Ant Design v6
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Descriptions, Timeline, Tag, Button, Space, Typography,
  Row, Col, Statistic, Spin, Empty, Divider, Tabs,
} from 'antd'
import TraceabilityTree from '../../../components/wms/TraceabilityTree'
import {
  ArrowLeftOutlined, ExperimentOutlined, HistoryOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, EnvironmentOutlined, PrinterOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import qcService from '../../../services/wms/qcService'
import type { BatchQCResult, MaterialQCStandard, ContaminationStatus } from '../../../services/wms/wms.types'
import { CONTAMINATION_LABELS } from '../../../services/wms/wms.types'
import GradeBadge from '../../../components/wms/GradeBadge'
import { QCBadge } from '../../../components/wms/QCInputForm'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'
import PageState from '../../../components/common/PageState'
import { fmtDate, fmtDateTime, fmtDateShort, fmtKg } from '../../../utils/format'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface BatchInfo {
  id: string
  batch_no: string
  material_name: string
  material_sku: string
  warehouse_name: string
  location_code: string | null
  initial_drc: number | null
  latest_drc: number | null
  qc_status: string
  quantity_remaining: number
  received_date: string
  next_recheck_date: string | null
  rubber_grade: string | null
  dry_weight: number | null
  supplier_name: string | null
  supplier_region: string | null
  contamination_status: string | null
  storage_days: number | null
}

// ============================================================================
// HELPERS
// ============================================================================

// Định dạng chung format.ts (ngày 'DD/MM/YYYY', ngày-giờ 'DD/MM HH:mm')
const formatDateTime = (d: string): string => fmtDateTime(d)
const formatDate = (d: string): string => fmtDate(d)

const CHECK_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  initial: { label: 'Kiểm tra ban đầu', color: 'blue' },
  recheck: { label: 'Tái kiểm', color: 'orange' },
  blend: { label: 'Sau phối trộn', color: 'purple' },
  export: { label: 'Trước xuất khẩu', color: 'green' },
}

const RESULT_COLORS: Record<string, string> = {
  passed: 'green',
  warning: 'orange',
  failed: 'red',
  pending: 'gray',
}

// ============================================================================
// COMPONENT
// ============================================================================

interface BatchQCHistoryPageProps {
  batchId?: string
}

const BatchQCHistoryPage = ({ batchId: propBatchId }: BatchQCHistoryPageProps = {}) => {
  const { batchId: paramBatchId } = useParams<{ batchId: string }>()
  const batchId = propBatchId || paramBatchId
  const navigate = useNavigate()

  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null)
  const [qcHistory, setQcHistory] = useState<BatchQCResult[]>([])
  const [standard, setStandard] = useState<MaterialQCStandard | null>(null)
  const [loading, setLoading] = useState(true)
  // Lỗi tải ≠ "Không tìm thấy lô hàng"
  const [loadError, setLoadError] = useState<unknown>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!batchId) return
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        // Load batch info
        const { data: batch, error: batchErr } = await supabase
          .from('stock_batches')
          .select(`
            id, batch_no, initial_drc, latest_drc, qc_status,
            quantity_remaining, received_date, next_recheck_date,
            rubber_grade, dry_weight, supplier_name, supplier_region,
            contamination_status, storage_days,
            material:materials!material_id(id, sku, name),
            warehouse:warehouses!warehouse_id(name),
            location:warehouse_locations!location_id(code)
          `)
          .eq('id', batchId)
          .single()
        // PGRST116 = không có dòng (lô không tồn tại) → để nhánh "Không tìm thấy"; lỗi khác thì báo lỗi
        if (batchErr && batchErr.code !== 'PGRST116') throw batchErr

        if (batch) {
          const b = batch as any
          setBatchInfo({
            id: b.id,
            batch_no: b.batch_no,
            material_name: b.material?.name || '—',
            material_sku: b.material?.sku || '',
            warehouse_name: b.warehouse?.name || '—',
            location_code: b.location?.code || null,
            initial_drc: b.initial_drc,
            latest_drc: b.latest_drc,
            qc_status: b.qc_status,
            quantity_remaining: b.quantity_remaining,
            received_date: b.received_date,
            next_recheck_date: b.next_recheck_date,
            rubber_grade: b.rubber_grade,
            dry_weight: b.dry_weight,
            supplier_name: b.supplier_name,
            supplier_region: b.supplier_region,
            contamination_status: b.contamination_status,
            storage_days: b.storage_days,
          })

          // Load QC history + standard
          const [history, std] = await Promise.all([
            qcService.getQCHistory(batchId),
            qcService.getStandard(b.material?.id),
          ])
          setQcHistory(history)
          setStandard(std)
        }
      } catch (err) { console.error('Load batch QC history error:', err); setLoadError(err) }
      finally { setLoading(false) }
    }
    load()
  }, [batchId, reloadKey])

  if (loading) return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>

  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        <PageState error={loadError} onRetry={() => setReloadKey(k => k + 1)} />
        <div style={{ textAlign: 'center', marginTop: 16 }}><Button onClick={() => navigate('/wms/qc')}>Quay lại</Button></div>
      </div>
    )
  }

  if (!batchInfo) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Không tìm thấy lô hàng" />
        <div style={{ textAlign: 'center', marginTop: 16 }}><Button onClick={() => navigate('/wms/qc')}>Quay lại</Button></div>
      </div>
    )
  }

  const recheckDays = batchInfo.next_recheck_date
    ? Math.ceil((new Date(batchInfo.next_recheck_date).getTime() - Date.now()) / 86400000)
    : null

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/qc')}>Quay lại</Button>
        {batchInfo.qc_status === 'passed' && (
          <Button icon={<PrinterOutlined />} onClick={() => navigate(`/wms/batch/${batchInfo.id}/label`)}>
            In nhãn QR
          </Button>
        )}
      </Space>

      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space align="center" size="middle">
            <Title level={4} style={{ margin: 0, fontFamily: "'JetBrains Mono'" }}>{batchInfo.batch_no}</Title>
            {batchInfo.rubber_grade && <GradeBadge grade={batchInfo.rubber_grade} />}
            <QCBadge result={batchInfo.qc_status} />
          </Space>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {batchInfo.material_name} ({batchInfo.material_sku})
          </Text>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="qc"
        size="large"
        items={[
          {
            key: 'qc',
            label: (<Space><HistoryOutlined />QC & Lịch sử</Space>),
            children: (
              <>
      {/* Batch Info */}
      <Card style={{ marginBottom: 16, borderRadius: 12 }}>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" bordered>
          <Descriptions.Item label="Mã lô">{batchInfo.batch_no}</Descriptions.Item>
          <Descriptions.Item label="Vật liệu">{batchInfo.material_name}</Descriptions.Item>
          <Descriptions.Item label="Grade">{batchInfo.rubber_grade ? <GradeBadge grade={batchInfo.rubber_grade} /> : '—'}</Descriptions.Item>
          <Descriptions.Item label="DRC hiện tại">
            <Text strong style={{ fontFamily: "'JetBrains Mono'", color: '#1B4D3E', fontSize: 16 }}>{batchInfo.latest_drc || '—'}%</Text>
          </Descriptions.Item>
          <Descriptions.Item label="DRC ban đầu">{batchInfo.initial_drc || '—'}%</Descriptions.Item>
          <Descriptions.Item label="QC"><QCBadge result={batchInfo.qc_status} /></Descriptions.Item>
          <Descriptions.Item label="Kho">{batchInfo.warehouse_name}{batchInfo.location_code ? ` · ${batchInfo.location_code}` : ''}</Descriptions.Item>
          <Descriptions.Item label="SL còn">{fmtKg(batchInfo.quantity_remaining)} kg</Descriptions.Item>
          <Descriptions.Item label="KL khô">{batchInfo.dry_weight ? `${fmtKg(batchInfo.dry_weight)} kg` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Ngày nhập">{formatDate(batchInfo.received_date)}</Descriptions.Item>
          <Descriptions.Item label="Lưu kho">{batchInfo.storage_days || 0} ngày</Descriptions.Item>
          <Descriptions.Item label="Tái kiểm tiếp">
            {batchInfo.next_recheck_date ? (
              <Space>
                {formatDate(batchInfo.next_recheck_date)}
                <Tag color={recheckDays !== null && recheckDays <= 0 ? 'red' : recheckDays !== null && recheckDays <= 3 ? 'orange' : 'default'}>
                  {recheckDays !== null ? (recheckDays <= 0 ? `Quá hạn ${Math.abs(recheckDays)} ngày` : `còn ${recheckDays} ngày`) : '—'}
                </Tag>
              </Space>
            ) : '—'}
          </Descriptions.Item>
          {batchInfo.supplier_name && <Descriptions.Item label="Đại lý">{batchInfo.supplier_name}</Descriptions.Item>}
          {batchInfo.supplier_region && <Descriptions.Item label="Vùng">{batchInfo.supplier_region}</Descriptions.Item>}
          {batchInfo.contamination_status && batchInfo.contamination_status !== 'clean' && (
            <Descriptions.Item label="Tạp chất">
              <Tag color="red">{CONTAMINATION_LABELS[batchInfo.contamination_status as ContaminationStatus] || batchInfo.contamination_status}</Tag>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* QC Standard */}
      {standard && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
          <Row gutter={16}>
            <Col span={6}><Statistic title="DRC chuẩn" value={`${standard.drc_standard || '—'}%`} valueStyle={{ fontSize: 16, fontFamily: "'JetBrains Mono'" }} /></Col>
            <Col span={6}><Statistic title="Khoảng" value={`${standard.drc_min || '—'}–${standard.drc_max || '—'}%`} valueStyle={{ fontSize: 16, fontFamily: "'JetBrains Mono'" }} /></Col>
            <Col span={6}><Statistic title="PRI min" value={standard.pri_min || '—'} valueStyle={{ fontSize: 16, fontFamily: "'JetBrains Mono'" }} /></Col>
            <Col span={6}><Statistic title="Chu kỳ tái kiểm" value={`${standard.recheck_interval_days} ngày`} valueStyle={{ fontSize: 16, fontFamily: "'JetBrains Mono'" }} /></Col>
          </Row>
        </Card>
      )}

      {/* DRC Trend (simple inline) */}
      {qcHistory.length > 1 && (
        <Card title="Diễn biến DRC" size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, padding: '0 8px' }}>
            {qcHistory.map((qc, i) => {
              const drc = qc.drc_value || 0
              const maxDrc = Math.max(...qcHistory.map(q => q.drc_value || 0), 70)
              const minDrc = Math.min(...qcHistory.map(q => q.drc_value || 0), 40)
              const range = maxDrc - minDrc || 1
              const height = Math.max(10, ((drc - minDrc) / range) * 60)
              const color = RESULT_COLORS[qc.result] || 'gray'
              return (
                <div key={qc.id} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: height,
                    background: color === 'green' ? '#16A34A' : color === 'orange' ? '#F59E0B' : color === 'red' ? '#DC2626' : '#9CA3AF',
                    borderRadius: 4,
                    minWidth: 20,
                    margin: '0 auto',
                    width: '80%',
                  }} />
                  <Text style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", display: 'block', marginTop: 2 }}>{drc}%</Text>
                  <Text type="secondary" style={{ fontSize: 8 }}>{fmtDateShort(qc.tested_at)}</Text>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* QC History Timeline */}
      <Card title={<Space><HistoryOutlined /> Lịch sử QC ({qcHistory.length})</Space>} style={{ marginBottom: 16, borderRadius: 12 }}>
        {qcHistory.length === 0 ? (
          <Empty description="Chưa có kết quả QC" />
        ) : (
          <Timeline
            items={[...qcHistory].reverse().map(qc => {
              const checkCfg = CHECK_TYPE_LABELS[qc.check_type] || CHECK_TYPE_LABELS.initial
              return {
                color: RESULT_COLORS[qc.result] || 'gray',
                children: (
                  <div>
                    <Space style={{ marginBottom: 4 }}>
                      <Tag color={checkCfg.color}>{checkCfg.label}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(qc.tested_at)}</Text>
                    </Space>
                    <div style={{ marginBottom: 4 }}>
                      <Space>
                        <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 15 }}>DRC: {qc.drc_value || '—'}%</Text>
                        <QCBadge result={qc.result} size="sm" />
                        {qc.grade_tested && <GradeBadge grade={qc.grade_tested} size="small" />}
                      </Space>
                    </div>
                    {/* SVR Metrics */}
                    <Space size="middle" wrap style={{ fontSize: 11, color: '#888' }}>
                      {qc.pri_value && <span>PRI: {qc.pri_value}</span>}
                      {qc.mooney_value && <span>Mooney: {qc.mooney_value}</span>}
                      {qc.ash_content && <span>Tro: {qc.ash_content}%</span>}
                      {qc.nitrogen_content && <span>N₂: {qc.nitrogen_content}%</span>}
                      {qc.moisture_content && <span>Độ ẩm: {qc.moisture_content}%</span>}
                      {qc.volatile_matter && <span>Chất bay hơi: {qc.volatile_matter}%</span>}
                      {qc.dirt_content && <span>Tạp chất: {qc.dirt_content}%</span>}
                      {qc.metal_content && <span>Kim loại: {qc.metal_content} mg/kg</span>}
                      {qc.color_lovibond && <span>Màu (Lovibond): {qc.color_lovibond}</span>}
                    </Space>
                    {qc.contamination_detected && (
                      <div style={{ marginTop: 4 }}>
                        <Tag color="red">Phát hiện tạp chất{qc.contamination_type ? `: ${qc.contamination_type}` : ''}</Tag>
                      </div>
                    )}
                    {qc.notes && <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>{qc.notes}</Text></div>}
                  </div>
                ),
              }
            })}
          />
        )}
      </Card>
              </>
            ),
          },
          {
            key: 'trace-backward',
            label: (<Space><ExperimentOutlined />Truy xuất ngược</Space>),
            children: (
              <Card
                style={{ borderRadius: 12 }}
                title="Từ lô này → NVL / Deal / Đại lý"
              >
                <TraceabilityTree batchId={batchInfo.id} direction="backward" />
              </Card>
            ),
          },
          {
            key: 'trace-forward',
            label: (<Space><ExperimentOutlined />Truy xuất xuôi</Space>),
            children: (
              <Card
                style={{ borderRadius: 12 }}
                title="Từ lô này → Lệnh SX / Xuất kho / Khách hàng (recall)"
              >
                <TraceabilityTree batchId={batchInfo.id} direction="forward" />
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}

export default BatchQCHistoryPage
