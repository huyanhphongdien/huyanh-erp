// ============================================================================
// BATCH SPLIT MODAL — Tách lô thành nhiều lô nhỏ
// File: src/components/wms/BatchSplitModal.tsx
// Phase 6: Batch Split/Merge
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Modal, InputNumber, Button, Space, Typography, Descriptions, Card,
  Table, Tag, message, Progress, Row, Col, Input,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, ScissorOutlined,
} from '@ant-design/icons'
import { batchService } from '../../services/wms/batchService'
import type { StockBatch } from '../../services/wms/wms.types'
import { fmtKg, fmtPct } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'

const { Text } = Typography

const BRAND_COLOR = '#1B4D3E'

// ============================================================================
// TYPES
// ============================================================================

interface SplitRow {
  key: number
  weight_kg: number
  yard_zone?: string
  yard_row?: number
  yard_col?: number
}

interface BatchSplitModalProps {
  open: boolean
  batch: StockBatch | null
  onClose: () => void
  onSuccess: (newBatches: StockBatch[]) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

const BatchSplitModal: React.FC<BatchSplitModalProps> = ({ open, batch, onClose, onSuccess }) => {
  const [splits, setSplits] = useState<SplitRow[]>([])
  const [saving, setSaving] = useState(false)
  const [keyCounter, setKeyCounter] = useState(0)

  // Reset on open
  useEffect(() => {
    if (open && batch) {
      const originalWeight = batch.current_weight || batch.initial_weight || 0
      const halfWeight = Math.round(originalWeight / 2)
      setSplits([
        { key: 0, weight_kg: halfWeight },
        { key: 1, weight_kg: originalWeight - halfWeight },
      ])
      setKeyCounter(2)
    }
  }, [open, batch])

  if (!batch) return null

  const originalWeight = batch.current_weight || batch.initial_weight || 0
  const totalSplitWeight = splits.reduce((sum, s) => sum + (s.weight_kg || 0), 0)
  const remainingWeight = originalWeight - totalSplitWeight
  const isValid = totalSplitWeight > 0 && totalSplitWeight <= originalWeight && splits.every(s => s.weight_kg > 0)
  const usagePercent = originalWeight > 0 ? Math.round((totalSplitWeight / originalWeight) * 100) : 0

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const addSplit = () => {
    setSplits(prev => [...prev, { key: keyCounter, weight_kg: 0 }])
    setKeyCounter(k => k + 1)
  }

  const removeSplit = (key: number) => {
    setSplits(prev => prev.filter(s => s.key !== key))
  }

  const updateSplit = (key: number, field: keyof SplitRow, value: any) => {
    setSplits(prev => prev.map(s => s.key === key ? { ...s, [field]: value } : s))
  }

  const handleSubmit = async () => {
    if (!isValid) {
      message.warning('Vui lòng kiểm tra lại khối lượng tách')
      return
    }

    setSaving(true)
    try {
      const result = await batchService.splitBatch(
        batch.id,
        splits.map(s => ({
          weight_kg: s.weight_kg,
          yard_zone: s.yard_zone,
          yard_row: s.yard_row,
          yard_col: s.yard_col,
        }))
      )
      message.success(`Đã tách thành ${result.length} lô mới`)
      onSuccess(result)
      onClose()
    } catch (err: any) {
      console.error('Split batch error:', err)
      message.error(dichLoiHeThong(err, 'Lỗi khi tách lô'))
    } finally {
      setSaving(false)
    }
  }

  // --------------------------------------------------------------------------
  // TABLE COLUMNS
  // --------------------------------------------------------------------------

  const columns = [
    {
      title: 'STT',
      key: 'index',
      width: 50,
      render: (_: any, __: any, idx: number) => (
        <Text strong>{String.fromCharCode(65 + idx)}</Text>
      ),
    },
    {
      title: 'Khối lượng (kg)',
      key: 'weight',
      render: (_: any, record: SplitRow) => (
        <InputNumber
          value={record.weight_kg}
          onChange={(v) => updateSplit(record.key, 'weight_kg', v || 0)}
          min={0}
          max={originalWeight}
          step={10}
          style={{ width: '100%' }}
          status={record.weight_kg <= 0 ? 'error' : undefined}
        />
      ),
    },
    {
      title: 'Khu vực bãi',
      key: 'zone',
      width: 100,
      render: (_: any, record: SplitRow) => (
        <Input
          value={record.yard_zone}
          onChange={(e) => updateSplit(record.key, 'yard_zone', e.target.value)}
          placeholder="VD: A1"
          size="small"
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: any, record: SplitRow) => (
        splits.length > 2 ? (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeSplit(record.key)}
            size="small"
          />
        ) : null
      ),
    },
  ]

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <Modal
      title={
        <Space>
          <ScissorOutlined />
          <span>Tách lô {batch.batch_no}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={600}
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
          <ScissorOutlined /> Xác nhận tách lô
        </Button>,
      ]}
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      {/* Original Batch Info */}
      <Card size="small" style={{ marginBottom: 16, background: '#fafafa', borderRadius: 8 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Mã lô">
            <Text strong style={{ fontFamily: "'JetBrains Mono'" }}>{batch.batch_no}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Khối lượng">
            <Text strong>{fmtKg(originalWeight)} kg</Text>
          </Descriptions.Item>
          <Descriptions.Item label="DRC">
            <Text strong style={{ color: BRAND_COLOR }}>
              {batch.latest_drc ? fmtPct(batch.latest_drc, 2) : '—'}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Split Table */}
      <Table
        dataSource={splits}
        columns={columns}
        rowKey="key"
        size="small"
        pagination={false}
        style={{ marginBottom: 16 }}
      />

      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        onClick={addSplit}
        style={{ marginBottom: 16 }}
      >
        Thêm phần tách
      </Button>

      {/* Weight Summary */}
      <Row gutter={16} align="middle">
        <Col span={16}>
          <Progress
            percent={usagePercent}
            status={totalSplitWeight > originalWeight ? 'exception' : 'active'}
            strokeColor={totalSplitWeight > originalWeight ? '#DC2626' : BRAND_COLOR}
            format={() => `${fmtKg(totalSplitWeight)} / ${fmtKg(originalWeight)} kg`}
          />
        </Col>
        <Col span={8} style={{ textAlign: 'right' }}>
          {remainingWeight >= 0 ? (
            <Tag color={remainingWeight === 0 ? 'success' : 'blue'}>
              Còn lại: {fmtKg(remainingWeight)} kg
            </Tag>
          ) : (
            <Tag color="error">Vượt quá: {fmtKg(Math.abs(remainingWeight))} kg</Tag>
          )}
        </Col>
      </Row>
    </Modal>
  )
}

export default BatchSplitModal
