// ============================================================================
// BATCH MERGE MODAL — Gộp nhiều lô thành 1 lô
// File: src/components/wms/BatchMergeModal.tsx
// Phase 6: Batch Split/Merge
// ============================================================================

import { useState, useMemo } from 'react'
import {
  Modal, Button, Space, Typography, Table, Tag, message,
  Card, Descriptions, Alert,
} from 'antd'
import {
  MergeCellsOutlined, CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { batchService } from '../../services/wms/batchService'
import type { StockBatch } from '../../services/wms/wms.types'
import GradeBadge from './GradeBadge'
import { QCBadge } from './QCInputForm'
import { rubberGradeService } from '../../services/wms/rubberGradeService'
import { fmtKg, fmtPct } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'

const { Text } = Typography

const BRAND_COLOR = '#1B4D3E'

// ============================================================================
// TYPES
// ============================================================================

interface BatchMergeModalProps {
  open: boolean
  batches: StockBatch[]
  onClose: () => void
  onSuccess: (mergedBatch: StockBatch) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

const BatchMergeModal: React.FC<BatchMergeModalProps> = ({ open, batches, onClose, onSuccess }) => {
  const [saving, setSaving] = useState(false)

  // --------------------------------------------------------------------------
  // COMPUTED
  // --------------------------------------------------------------------------

  const validation = useMemo(() => {
    const errors: string[] = []

    if (batches.length < 2) {
      errors.push('Cần ít nhất 2 lô để gộp')
    }

    // Check same material
    const materialIds = new Set(batches.map(b => b.material_id))
    if (materialIds.size > 1) {
      errors.push('Tất cả lô phải cùng loại nguyên liệu')
    }

    // Check all active
    const nonActive = batches.filter(b => b.status !== 'active')
    if (nonActive.length > 0) {
      errors.push(`Lô ${nonActive.map(b => b.batch_no).join(', ')} không còn hoạt động`)
    }

    // Check QC status
    const nonPassed = batches.filter(b => b.qc_status !== 'passed' && b.qc_status !== 'warning')
    if (nonPassed.length > 0) {
      errors.push(`Lô ${nonPassed.map(b => b.batch_no).join(', ')} chưa qua QC`)
    }

    return errors
  }, [batches])

  const totalWeight = useMemo(() => {
    return batches.reduce((sum, b) => sum + (b.current_weight || b.initial_weight || 0), 0)
  }, [batches])

  const weightedAvgDRC = useMemo(() => {
    let totalW = 0
    let totalWDRC = 0
    for (const b of batches) {
      const w = b.current_weight || b.initial_weight || 0
      totalW += w
      if (b.latest_drc != null) {
        totalWDRC += b.latest_drc * w
      }
    }
    return totalW > 0 ? Math.round((totalWDRC / totalW) * 100) / 100 : null
  }, [batches])

  const resultGrade = useMemo(() => {
    return weightedAvgDRC ? rubberGradeService.classifyByDRC(weightedAvgDRC) : null
  }, [weightedAvgDRC])

  const isValid = validation.length === 0

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!isValid) return

    setSaving(true)
    try {
      const result = await batchService.mergeBatches(batches.map(b => b.id))
      message.success(`Đã gộp ${batches.length} lô thành lô ${result.batch_no}`)
      onSuccess(result)
      onClose()
    } catch (err: any) {
      console.error('Merge batches error:', err)
      message.error(dichLoiHeThong(err, 'Lỗi khi gộp lô'))
    } finally {
      setSaving(false)
    }
  }

  // --------------------------------------------------------------------------
  // TABLE COLUMNS
  // --------------------------------------------------------------------------

  const columns = [
    {
      title: 'Mã lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      render: (v: string) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 12 }}>{v}</Text>
      ),
    },
    {
      title: 'Khối lượng (kg)',
      key: 'weight',
      align: 'right' as const,
      render: (_: any, r: StockBatch) => (
        <Text style={{ fontFamily: "'JetBrains Mono'" }}>
          {fmtKg(r.current_weight || r.initial_weight || 0)}
        </Text>
      ),
    },
    {
      title: 'DRC (%)',
      key: 'drc',
      align: 'right' as const,
      render: (_: any, r: StockBatch) => (
        <Text style={{ fontFamily: "'JetBrains Mono'", color: BRAND_COLOR }}>
          {r.latest_drc ? fmtPct(r.latest_drc, 2) : '—'}
        </Text>
      ),
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc',
      render: (v: string) => <QCBadge result={v} size="sm" />,
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'grade',
      render: (v: string) => <GradeBadge grade={v} size="small" />,
    },
  ]

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <Modal
      title={
        <Space>
          <MergeCellsOutlined />
          <span>Gộp lô ({batches.length} lô)</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={650}
      footer={[
        <Button key="cancel" onClick={onClose}>Hủy</Button>,
        <Button
          key="submit"
          type="primary"
          onClick={handleSubmit}
          loading={saving}
          disabled={!isValid}
          style={{ background: BRAND_COLOR, borderColor: BRAND_COLOR }}
        >
          <MergeCellsOutlined /> Xác nhận gộp lô
        </Button>,
      ]}
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      {/* Validation Errors */}
      {validation.length > 0 && (
        <Alert
          type="error"
          message="Không thể gộp lô"
          description={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {validation.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          }
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* Selected Batches Table */}
      <Table
        dataSource={batches}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        style={{ marginBottom: 16 }}
      />

      {/* Result Preview */}
      {isValid && (
        <Card
          size="small"
          title={
            <Space>
              <CheckCircleOutlined style={{ color: BRAND_COLOR }} />
              <Text strong>Kết quả gộp</Text>
            </Space>
          }
          style={{ background: '#f0fdf4', borderColor: '#86efac' }}
        >
          <Descriptions size="small" column={3}>
            <Descriptions.Item label="Tổng khối lượng">
              <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 16, color: BRAND_COLOR }}>
                {fmtKg(totalWeight)} kg
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="DRC trung bình">
              <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 16, color: BRAND_COLOR }}>
                {weightedAvgDRC != null ? fmtPct(weightedAvgDRC, 2) : '—'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Grade">
              {resultGrade ? <GradeBadge grade={resultGrade} /> : '—'}
            </Descriptions.Item>
          </Descriptions>

          {batches.some(b => b.qc_status === 'warning') && (
            <Alert
              type="warning"
              message="Có lô ở trạng thái cảnh báo — lô gộp sẽ cần tái kiểm"
              showIcon
              icon={<WarningOutlined />}
              style={{ marginTop: 8 }}
              banner
            />
          )}
        </Card>
      )}
    </Modal>
  )
}

export default BatchMergeModal
