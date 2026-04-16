// ============================================================================
// QC RECHECK PAGE — Ant Design + Full SVR
// File: src/pages/wms/qc/QCRecheckPage.tsx
// Rewrite: Tailwind -> Ant Design v6, dung QCInputForm (Dot 2.2)
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Tag, Button, Space, Typography, Spin, Alert,
  Modal, Row, Col, Statistic, Result, Input, Descriptions,
} from 'antd'
import {
  ReloadOutlined, ExperimentOutlined, ArrowLeftOutlined,
  CheckCircleOutlined, WarningOutlined, PrinterOutlined,
} from '@ant-design/icons'
import qcService from '../../../services/wms/qcService'
import { supabase } from '../../../lib/supabase'
import { dealWmsService } from '../../../services/b2b/dealWmsService'
import type { RecheckBatchItem, QCEvaluation } from '../../../services/wms/qcService'
import type { MaterialQCStandard } from '../../../services/wms/wms.types'
import QCInputForm from '../../../components/wms/QCInputForm'
import type { QCFormData } from '../../../components/wms/QCInputForm'
import GradeBadge from '../../../components/wms/GradeBadge'
import { QCBadge } from '../../../components/wms/QCInputForm'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'

const { Title, Text } = Typography

const QCRecheckPage = () => {
  const navigate = useNavigate()
  const [batches, setBatches] = useState<RecheckBatchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Modal state
  const [selectedBatch, setSelectedBatch] = useState<RecheckBatchItem | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [qcData, setQcData] = useState<QCFormData | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<QCEvaluation | null>(null)

  const loadBatches = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true); else setLoading(true)
      const data = await qcService.getBatchesDueRecheck({ include_upcoming_days: 3 })
      setBatches(data)
    } catch (err) { console.error('Load recheck batches error:', err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { loadBatches() }, [loadBatches])

  const openModal = (batch: RecheckBatchItem) => {
    setSelectedBatch(batch)
    setQcData(null)
    setNotes('')
    setResult(null)
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!selectedBatch || !qcData) return
    setSaving(true)
    try {
      const res = await qcService.addRecheckResult({
        batch_id: selectedBatch.id,
        drc_value: qcData.drc_value,
        pri_value: qcData.pri_value,
        mooney_value: qcData.mooney_value,
        ash_content: qcData.ash_content,
        nitrogen_content: qcData.nitrogen_content,
        notes: notes || qcData.notes,
        moisture_content: qcData.moisture_content,
        volatile_matter: qcData.volatile_matter,
        metal_content: qcData.metal_content,
        dirt_content: qcData.dirt_content,
        color_lovibond: qcData.color_lovibond,
      })
      setResult(res.evaluation)

      // Phase 4: Update Deal DRC if batch belongs to a deal
      try {
        const { data: detail } = await supabase
          .from('stock_in_details').select('stock_in_id').eq('batch_id', selectedBatch.id).maybeSingle()
        if (detail?.stock_in_id) {
          const { data: stockIn } = await supabase
            .from('stock_in_orders').select('deal_id').eq('id', detail.stock_in_id).maybeSingle()
          if (stockIn?.deal_id) {
            const drcResult = await dealWmsService.updateDealActualDrc(stockIn.deal_id)
            if (drcResult && drcResult.actual_drc != null) {
              await dealWmsService.notifyDealChatQcUpdate(stockIn.deal_id, drcResult.actual_drc, drcResult.qc_status)
            }
          }
        }
      } catch (err) { console.error('Update deal DRC after QC failed:', err) }
    } catch (err) { console.error('Submit recheck error:', err) }
    finally { setSaving(false) }
  }

  const handleDone = () => {
    setModalOpen(false)
    setSelectedBatch(null)
    setResult(null)
    loadBatches(true)
  }

  const overdueCount = batches.filter(b => b.days_overdue > 0).length
  const todayCount = batches.filter(b => b.days_overdue === 0).length

  const columns = [
    { title: 'Lo', dataIndex: 'batch_no', key: 'batch_no', render: (v: string) => <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 12 }}>{v}</Text> },
    { title: 'Vật liệu', key: 'mat', render: (_: any, r: RecheckBatchItem) => <><Text style={{ fontSize: 13 }}>{r.material_name}</Text><br/><Text type="secondary" style={{ fontSize: 11 }}>{r.material_sku}</Text></> },
    { title: 'DRC', dataIndex: 'latest_drc', key: 'drc', render: (v: number) => <Text strong style={{ fontFamily: "'JetBrains Mono'", color: '#1B4D3E' }}>{v || '—'}%</Text> },
    { title: 'QC', dataIndex: 'qc_status', key: 'qc', render: (v: string) => <QCBadge result={v} size="sm" /> },
    {
      title: 'Quá hạn',
      dataIndex: 'days_overdue',
      key: 'overdue',
      sorter: (a: RecheckBatchItem, b: RecheckBatchItem) => b.days_overdue - a.days_overdue,
      render: (d: number) => (
        <Tag color={d > 7 ? 'red' : d > 0 ? 'orange' : 'blue'}>
          {d > 0 ? `${d} ngay` : 'Hôm nay'}
        </Tag>
      ),
    },
    { title: 'Kho', key: 'wh', render: (_: any, r: RecheckBatchItem) => <Text type="secondary" style={{ fontSize: 11 }}>{r.warehouse_name}</Text> },
    { title: 'SL', dataIndex: 'quantity_remaining', key: 'qty', align: 'right' as const, render: (v: number) => <Text style={{ fontFamily: "'JetBrains Mono'" }}>{v?.toLocaleString()}</Text> },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_: any, r: RecheckBatchItem) => (
        <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); openModal(r) }}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
          QC
        </Button>
      ),
    },
  ]

  if (loading) return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/qc')}>Quay lại</Button>
      </Space>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col><Title level={4} style={{ margin: 0, color: '#1B4D3E' }}><ExperimentOutlined style={{ marginRight: 8 }} />Tái kiểm DRC</Title></Col>
        <Col><Button icon={<ReloadOutlined spin={refreshing} />} onClick={() => loadBatches(true)}>Làm mới</Button></Col>
      </Row>

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card bodyStyle={{ padding: 12 }}><Statistic title="Tổng" value={batches.length} valueStyle={{ fontFamily: "'JetBrains Mono'" }} /></Card></Col>
        <Col span={8}><Card bodyStyle={{ padding: 12 }}><Statistic title="Quá hạn" value={overdueCount} valueStyle={{ color: '#DC2626', fontFamily: "'JetBrains Mono'" }} /></Card></Col>
        <Col span={8}><Card bodyStyle={{ padding: 12 }}><Statistic title="Hôm nay" value={todayCount} valueStyle={{ color: '#F59E0B', fontFamily: "'JetBrains Mono'" }} /></Card></Col>
      </Row>

      {/* Table */}
      <Card>
        <Table dataSource={batches} columns={columns} rowKey="id" size="small"
          pagination={false}
          onRow={r => ({ onClick: () => openModal(r), style: { cursor: 'pointer' } })} />
      </Card>

      {/* Recheck Modal */}
      <Modal
        title={<Space><ExperimentOutlined /> Tái kiểm QC {selectedBatch && `— ${selectedBatch.batch_no}`}</Space>}
        open={modalOpen}
        onCancel={result ? handleDone : () => setModalOpen(false)}
        width={800}
        footer={result ? [
          ...(result.result === 'passed' && selectedBatch ? [
            <Button key="print" icon={<PrinterOutlined />} onClick={() => navigate(`/wms/batch/${selectedBatch.id}/label`)}>
              In nhãn QR
            </Button>,
          ] : []),
          <Button key="done" type="primary" onClick={handleDone} style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>Hoàn tất</Button>,
        ] : [
          <Button key="cancel" onClick={() => setModalOpen(false)}>Huỷ</Button>,
          <Button key="submit" type="primary" onClick={handleSubmit} loading={saving} disabled={!qcData}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
            <CheckCircleOutlined /> Xác nhận tai kiem
          </Button>,
        ]}
        styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
      >
        {result ? (
          /* Result display */
          <Result
            status={result.result === 'passed' ? 'success' : result.result === 'warning' ? 'warning' : 'error'}
            title={result.result === 'passed' ? 'Đạt chuẩn' : result.result === 'warning' ? 'Cảnh báo' : 'Không đạt — Cần trộn'}
            subTitle={
              <Space direction="vertical" align="center">
                <Text>{result.message}</Text>
                {qcData && <GradeBadge grade={rubberGradeService.classifyByDRC(qcData.drc_value)} />}
                {result.next_recheck_days && <Text type="secondary">Tái kiểm tiep: {result.next_recheck_days} ngay</Text>}
              </Space>
            }
          />
        ) : selectedBatch && (
          /* Form */
          <>
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa', borderRadius: 8 }}>
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="Lo">{selectedBatch.batch_no}</Descriptions.Item>
                <Descriptions.Item label="Vật liệu">{selectedBatch.material_name}</Descriptions.Item>
                <Descriptions.Item label="DRC hiện tại">{selectedBatch.latest_drc || '—'}%</Descriptions.Item>
                <Descriptions.Item label="DRC ban đầu">{selectedBatch.initial_drc || '—'}%</Descriptions.Item>
                <Descriptions.Item label="Quá hạn">
                  <Tag color={selectedBatch.days_overdue > 0 ? 'red' : 'blue'}>
                    {selectedBatch.days_overdue > 0 ? `${selectedBatch.days_overdue} ngay` : 'Hôm nay'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Kho">{selectedBatch.warehouse_name}</Descriptions.Item>
              </Descriptions>
            </Card>

            <QCInputForm
              material_id={selectedBatch.material_id}
              onChange={setQcData}
              required
              showAdvanced
              showNotes={false}
            />

            <div style={{ marginTop: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>Ghi chú</Text>
              <Input.TextArea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ghi chú kiem tra..."
                rows={2}
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default QCRecheckPage
