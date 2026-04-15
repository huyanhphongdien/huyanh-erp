// ============================================================================
// FILE: src/pages/wms/YardMapPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// MÔ TẢ: Bản đồ bãi nguyên liệu — hiển thị vị trí lô hàng trong bãi
//         Grid visualization theo zone/row/col, click để xem chi tiết
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Card,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Empty,
  Input,
  Select,
  Modal,
  Descriptions,
  Tooltip,
  Statistic,
  Row,
  Col,
  message,
  Divider,
  Drawer,
  Form,
  InputNumber,
} from 'antd'
import {
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  SwapOutlined,
  ExportOutlined,
  ExperimentOutlined,
  PrinterOutlined,
  EyeOutlined,
  DeleteOutlined,
  PlusOutlined,
  EnvironmentOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useOpenTab } from '../../hooks/useOpenTab'
import { supabase } from '../../lib/supabase'
import { yardService, type YardCell, type YardConfig, type YardBatchInfo } from '../../services/wms/yardService'
import { RUBBER_GRADE_COLORS, RUBBER_TYPE_LABELS, type RubberGrade } from '../../services/wms/wms.types'

const { Title, Text } = Typography
const MONO_FONT = "'JetBrains Mono', monospace"
const PRIMARY = '#1B4D3E'

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseOption {
  id: string
  code: string
  name: string
}

interface UnassignedBatch {
  id: string
  batch_no: string
  rubber_type: string | null
  rubber_grade: string | null
  latest_drc: number | null
  current_weight: number | null
  qc_status: string
  supplier_name: string | null
  storage_days: number | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GRADE_CELL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SVR_3L:  { bg: '#DCFCE7', border: '#16A34A', text: '#166534' },
  SVR_5:   { bg: '#DBEAFE', border: '#2563EB', text: '#1E40AF' },
  SVR_10:  { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  SVR_20:  { bg: '#FEE2E2', border: '#DC2626', text: '#991B1B' },
  SVR_CV60:{ bg: '#F3E8FF', border: '#7C3AED', text: '#5B21B6' },
}

const EMPTY_CELL = { bg: '#F9FAFB', border: '#E5E7EB', text: '#9CA3AF' }
const PENDING_BORDER = '#F59E0B'

const QC_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ QC',
  passed: 'Đạt',
  warning: 'Cảnh báo',
  failed: 'Không đạt',
  needs_blend: 'Cần trộn',
}

const QC_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  passed: 'green',
  warning: 'gold',
  failed: 'red',
  needs_blend: 'purple',
}

// ============================================================================
// HELPERS
// ============================================================================

function formatWeight(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}T`
  return `${Math.round(kg)}kg`
}

function getCellStyle(batch?: YardBatchInfo) {
  if (!batch) return EMPTY_CELL
  const grade = batch.rubber_grade as string
  return GRADE_CELL_COLORS[grade] || { bg: '#F0F9FF', border: '#0EA5E9', text: '#0C4A6E' }
}

function daysSinceCreated(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Color Legend */
const ColorLegend: React.FC = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '8px 0' }}>
    {Object.entries(GRADE_CELL_COLORS).map(([grade, style]) => (
      <Space key={grade} size={4} align="center">
        <div style={{
          width: 14, height: 14, borderRadius: 3,
          backgroundColor: style.bg,
          border: `2px solid ${style.border}`,
        }} />
        <Text style={{ fontSize: 11 }}>{grade.replace('_', ' ')}</Text>
      </Space>
    ))}
    <Space size={4} align="center">
      <div style={{
        width: 14, height: 14, borderRadius: 3,
        backgroundColor: EMPTY_CELL.bg,
        border: `2px dashed ${EMPTY_CELL.border}`,
      }} />
      <Text style={{ fontSize: 11 }}>Trống</Text>
    </Space>
    <Space size={4} align="center">
      <div style={{
        width: 14, height: 14, borderRadius: 3,
        backgroundColor: '#FFFBEB',
        border: `2px solid ${PENDING_BORDER}`,
      }} />
      <Text style={{ fontSize: 11 }}>Chờ QC</Text>
    </Space>
  </div>
)

/** Single yard cell */
const YardCellComponent: React.FC<{
  cell: YardCell
  onClick: () => void
}> = ({ cell, onClick }) => {
  const style = getCellStyle(cell.batch)
  const isPending = cell.batch?.qc_status === 'pending'
  const borderColor = isPending ? PENDING_BORDER : style.border

  return (
    <Tooltip
      title={cell.batch ? (
        <div style={{ fontSize: 11 }}>
          <div><strong>{cell.batch.batch_no}</strong></div>
          {cell.batch.supplier_name && <div>NCC: {cell.batch.supplier_name}</div>}
          {cell.batch.rubber_type && <div>Loại: {RUBBER_TYPE_LABELS[cell.batch.rubber_type as keyof typeof RUBBER_TYPE_LABELS] || cell.batch.rubber_type}</div>}
          {cell.batch.rubber_grade && <div>Grade: {cell.batch.rubber_grade.replace('_', ' ')}</div>}
          {cell.batch.latest_drc != null && <div>DRC: {cell.batch.latest_drc.toFixed(1)}%</div>}
          <div>KL: {formatWeight(cell.batch.current_weight)}</div>
          <div>Lưu kho: {cell.batch.storage_days} ngày</div>
          <div>QC: {QC_STATUS_LABELS[cell.batch.qc_status] || cell.batch.qc_status}</div>
        </div>
      ) : `Ô trống ${cell.zone}${cell.row}-${cell.col}`}
      placement="top"
    >
      <div
        onClick={onClick}
        style={{
          width: '100%',
          aspectRatio: '1',
          borderRadius: 6,
          border: cell.batch
            ? `2px solid ${borderColor}`
            : `2px dashed ${EMPTY_CELL.border}`,
          backgroundColor: cell.batch ? style.bg : EMPTY_CELL.bg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 3,
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 56,
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
        }}
      >
        {cell.batch ? (
          <>
            {/* Pending QC icon */}
            {isPending && (
              <QuestionCircleOutlined style={{
                position: 'absolute', top: 2, right: 2,
                fontSize: 10, color: PENDING_BORDER,
              }} />
            )}

            {/* Batch no */}
            <span style={{
              fontSize: 8, fontWeight: 700, lineHeight: 1,
              color: style.text, fontFamily: MONO_FONT,
              maxWidth: '100%', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {cell.batch.batch_no.split('-').slice(-2).join('-')}
            </span>

            {/* DRC */}
            {cell.batch.latest_drc != null && (
              <span style={{
                fontSize: 9, fontWeight: 600, lineHeight: 1,
                color: style.text, marginTop: 2,
              }}>
                {cell.batch.latest_drc.toFixed(0)}%
              </span>
            )}

            {/* Weight */}
            <span style={{
              fontSize: 8, fontWeight: 500, lineHeight: 1,
              color: style.text, marginTop: 1,
            }}>
              {formatWeight(cell.batch.current_weight)}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 8, color: '#ccc' }}>
            {cell.row},{cell.col}
          </span>
        )}
      </div>
    </Tooltip>
  )
}

/** Yard Zone Grid */
const YardZoneGrid: React.FC<{
  zoneCode: string
  zoneName: string
  cols: number
  cells: YardCell[]
  onCellClick: (cell: YardCell) => void
}> = ({ zoneCode, zoneName, cols, cells, onCellClick }) => {
  const occupied = cells.filter(c => c.batch).length
  const total = cells.length

  return (
    <Card
      size="small"
      title={
        <Space>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            backgroundColor: PRIMARY, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14, fontFamily: MONO_FONT,
          }}>
            {zoneCode}
          </div>
          <div>
            <Text strong style={{ fontSize: 14 }}>{zoneName}</Text>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
              {occupied}/{total} ô ({total > 0 ? Math.round(occupied / total * 100) : 0}%)
            </Text>
          </div>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 6,
      }}>
        {cells.map((cell, idx) => (
          <YardCellComponent
            key={`${cell.zone}-${cell.row}-${cell.col}`}
            cell={cell}
            onClick={() => onCellClick(cell)}
          />
        ))}
      </div>
    </Card>
  )
}

/** Batch Detail Popup */
const BatchDetailModal: React.FC<{
  cell: YardCell | null
  onClose: () => void
  onNavigateQC: (batchId: string) => void
  onNavigateDetail: (batchId: string) => void
  onMove: (cell: YardCell) => void
  onClear: (batchId: string) => void
  onAssign: (cell: YardCell) => void
}> = ({ cell, onClose, onNavigateQC, onNavigateDetail, onMove, onClear, onAssign }) => {
  if (!cell) return null

  const batch = cell.batch
  const posLabel = `${cell.zone}${cell.row}-${cell.col}`

  if (!batch) {
    // Empty cell — assign batch
    return (
      <Modal
        open
        onCancel={onClose}
        title={
          <Space>
            <EnvironmentOutlined style={{ color: '#999' }} />
            <span>Ô {posLabel} — Trống</span>
          </Space>
        }
        footer={[
          <Button key="cancel" onClick={onClose}>Đóng</Button>,
          <Button
            key="assign"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => onAssign(cell)}
            style={{ background: PRIMARY, borderColor: PRIMARY }}
          >
            Gán lô hàng
          </Button>,
        ]}
        width={400}
      >
        <Empty
          image={<InboxOutlined style={{ fontSize: 40, color: '#ccc' }} />}
          description="Ô này đang trống. Nhấn 'Gán lô hàng' để đặt lô vào vị trí này."
        />
      </Modal>
    )
  }

  const style = getCellStyle(batch)

  return (
    <Modal
      open
      onCancel={onClose}
      title={
        <Space>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            backgroundColor: style.bg,
            border: `2px solid ${style.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text strong style={{ fontFamily: MONO_FONT, fontSize: 12, color: style.text }}>
              {posLabel}
            </Text>
          </div>
          <div>
            <Text strong style={{ fontFamily: MONO_FONT, fontSize: 15 }}>{batch.batch_no}</Text>
            <br />
            <Tag color={QC_STATUS_COLORS[batch.qc_status] || 'default'}>
              {QC_STATUS_LABELS[batch.qc_status] || batch.qc_status}
            </Tag>
            {batch.rubber_grade && (
              <Tag color={RUBBER_GRADE_COLORS[batch.rubber_grade as RubberGrade] || '#888'} style={{ color: '#fff' }}>
                {batch.rubber_grade.replace('_', ' ')}
              </Tag>
            )}
          </div>
        </Space>
      }
      width={520}
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button
            icon={<ExperimentOutlined />}
            onClick={() => { onClose(); onNavigateQC(batch.id) }}
            style={{ borderColor: PRIMARY, color: PRIMARY }}
          >
            QC
          </Button>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => { message.info('Tính năng in nhãn đang phát triển') }}
          >
            In nhãn
          </Button>
          <Button
            icon={<ExportOutlined />}
            onClick={() => { message.info('Chuyển đến tạo phiếu xuất kho') }}
          >
            Xuất kho
          </Button>
          <Button
            icon={<SwapOutlined />}
            onClick={() => { onClose(); onMove(cell) }}
          >
            Di chuyển
          </Button>
          <Button
            icon={<EyeOutlined />}
            type="primary"
            onClick={() => { onClose(); onNavigateDetail(batch.id) }}
            style={{ background: PRIMARY, borderColor: PRIMARY }}
          >
            Xem chi tiết
          </Button>
        </div>
      }
    >
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Mã lô" span={2}>
          <Text strong style={{ fontFamily: MONO_FONT }}>{batch.batch_no}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Nhà cung cấp">
          {batch.supplier_name || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Loại mủ">
          {RUBBER_TYPE_LABELS[batch.rubber_type as keyof typeof RUBBER_TYPE_LABELS] || batch.rubber_type || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Grade">
          {batch.rubber_grade ? batch.rubber_grade.replace('_', ' ') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="DRC">
          {batch.latest_drc != null ? `${batch.latest_drc.toFixed(1)}%` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Khối lượng">
          <Text strong style={{ color: PRIMARY, fontFamily: MONO_FONT }}>
            {batch.current_weight.toLocaleString('vi-VN')} kg
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Ngày lưu kho">
          {batch.storage_days} ngày
        </Descriptions.Item>
        <Descriptions.Item label="Vị trí bãi">
          <Tag color="blue">{posLabel}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Ngày tạo">
          {new Date(batch.created_at).toLocaleDateString('vi-VN')}
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  )
}

/** Assign Batch Modal */
const AssignBatchModal: React.FC<{
  open: boolean
  cell: YardCell | null
  warehouseId?: string
  onClose: () => void
  onAssigned: () => void
}> = ({ open, cell, warehouseId, onClose, onAssigned }) => {
  const [batches, setBatches] = useState<UnassignedBatch[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelectedBatchId(null)
    loadUnassigned()
  }, [open])

  const loadUnassigned = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('stock_batches')
        .select('id, batch_no, rubber_type, rubber_grade, latest_drc, current_weight, qc_status, supplier_name, storage_days')
        .eq('status', 'active')
        .is('yard_zone', null)
        .gt('current_weight', 0)
        .order('created_at', { ascending: false })
        .limit(100)

      if (warehouseId) {
        query = query.eq('warehouse_id', warehouseId)
      }

      const { data, error } = await query
      if (error) throw error
      setBatches((data || []) as UnassignedBatch[])
    } catch (e: any) {
      message.error('Lỗi tải danh sách lô: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!cell || !selectedBatchId) return
    setAssigning(true)
    try {
      await yardService.assignPosition(selectedBatchId, cell.zone, cell.row, cell.col)
      message.success(`Đã gán lô vào ô ${cell.zone}${cell.row}-${cell.col}`)
      onAssigned()
      onClose()
    } catch (e: any) {
      message.error(e.message || 'Lỗi gán vị trí')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Gán lô hàng vào ô ${cell ? `${cell.zone}${cell.row}-${cell.col}` : ''}`}
      okText="Gán vị trí"
      okButtonProps={{
        disabled: !selectedBatchId,
        loading: assigning,
        style: { background: PRIMARY, borderColor: PRIMARY },
      }}
      onOk={handleAssign}
      width={500}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Chọn lô hàng chưa có vị trí bãi:
      </Text>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : batches.length === 0 ? (
        <Empty description="Không có lô hàng nào chưa được gán vị trí" />
      ) : (
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="Tìm và chọn lô hàng..."
          value={selectedBatchId}
          onChange={setSelectedBatchId}
          filterOption={(input, option) =>
            (option?.label?.toString() || '').toLowerCase().includes(input.toLowerCase())
          }
          options={batches.map(b => ({
            value: b.id,
            label: `${b.batch_no} — ${b.rubber_grade?.replace('_', ' ') || '?'} — ${formatWeight(b.current_weight || 0)} — DRC ${b.latest_drc?.toFixed(1) || '?'}%`,
          }))}
        />
      )}

      {selectedBatchId && (() => {
        const b = batches.find(x => x.id === selectedBatchId)
        if (!b) return null
        return (
          <Card size="small" style={{ marginTop: 12, borderColor: PRIMARY }}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Mã lô">{b.batch_no}</Descriptions.Item>
              <Descriptions.Item label="Grade">{b.rubber_grade?.replace('_', ' ') || '—'}</Descriptions.Item>
              <Descriptions.Item label="DRC">{b.latest_drc != null ? `${b.latest_drc.toFixed(1)}%` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Khối lượng">{formatWeight(b.current_weight || 0)}</Descriptions.Item>
              <Descriptions.Item label="QC">
                <Tag color={QC_STATUS_COLORS[b.qc_status] || 'default'}>
                  {QC_STATUS_LABELS[b.qc_status] || b.qc_status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="NCC">{b.supplier_name || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        )
      })()}
    </Modal>
  )
}

/** Move Batch Modal */
const MoveBatchModal: React.FC<{
  open: boolean
  cell: YardCell | null
  onClose: () => void
  onMoved: () => void
}> = ({ open, cell, onClose, onMoved }) => {
  const [newZone, setNewZone] = useState('')
  const [newRow, setNewRow] = useState<number>(1)
  const [newCol, setNewCol] = useState<number>(1)
  const [moving, setMoving] = useState(false)
  const config = yardService.getConfig()

  useEffect(() => {
    if (cell) {
      setNewZone(cell.zone)
      setNewRow(cell.row)
      setNewCol(cell.col)
    }
  }, [cell])

  const handleMove = async () => {
    if (!cell?.batch) return
    setMoving(true)
    try {
      await yardService.movePosition(cell.batch.id, newZone, newRow, newCol)
      message.success(`Đã di chuyển lô ${cell.batch.batch_no} đến ${newZone}${newRow}-${newCol}`)
      onMoved()
      onClose()
    } catch (e: any) {
      message.error(e.message || 'Lỗi di chuyển')
    } finally {
      setMoving(false)
    }
  }

  const selectedZoneConfig = config.zones.find(z => z.code === newZone)

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Di chuyển lô ${cell?.batch?.batch_no || ''}`}
      okText="Di chuyển"
      okButtonProps={{
        loading: moving,
        style: { background: PRIMARY, borderColor: PRIMARY },
      }}
      onOk={handleMove}
      width={400}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Vị trí hiện tại: <Tag color="blue">{cell ? `${cell.zone}${cell.row}-${cell.col}` : ''}</Tag>
      </Text>

      <Form layout="vertical">
        <Form.Item label="Bãi">
          <Select
            value={newZone}
            onChange={setNewZone}
            options={config.zones.map(z => ({ value: z.code, label: z.name }))}
          />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="Hàng">
              <InputNumber
                min={1}
                max={selectedZoneConfig?.rows || 10}
                value={newRow}
                onChange={v => setNewRow(v || 1)}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Cột">
              <InputNumber
                min={1}
                max={selectedZoneConfig?.cols || 5}
                value={newCol}
                onChange={v => setNewCol(v || 1)}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}

/** Yard Config Drawer */
const YardConfigDrawer: React.FC<{
  open: boolean
  onClose: () => void
  onSave: (config: YardConfig) => void
}> = ({ open, onClose, onSave }) => {
  const [zones, setZones] = useState(yardService.getConfig().zones)

  useEffect(() => {
    if (open) setZones(yardService.getConfig().zones)
  }, [open])

  const updateZone = (idx: number, field: string, value: any) => {
    const updated = [...zones]
    ;(updated[idx] as any)[field] = value
    setZones(updated)
  }

  const addZone = () => {
    const nextCode = String.fromCharCode(65 + zones.length) // D, E, F...
    setZones([...zones, { code: nextCode, name: `Bãi ${nextCode}`, rows: 10, cols: 5 }])
  }

  const removeZone = (idx: number) => {
    if (zones.length <= 1) {
      message.warning('Cần ít nhất 1 bãi')
      return
    }
    setZones(zones.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    const config: YardConfig = { zones }
    yardService.saveConfig(config)
    onSave(config)
    onClose()
    message.success('Đã lưu cấu hình bãi')
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Cài đặt bãi nguyên liệu"
      width={420}
      extra={
        <Button type="primary" onClick={handleSave} style={{ background: PRIMARY, borderColor: PRIMARY }}>
          Lưu
        </Button>
      }
    >
      {zones.map((zone, idx) => (
        <Card key={idx} size="small" style={{ marginBottom: 12 }}>
          <Row gutter={8} align="middle">
            <Col span={6}>
              <Form.Item label="Mã" style={{ marginBottom: 0 }}>
                <Input
                  value={zone.code}
                  onChange={e => updateZone(idx, 'code', e.target.value.toUpperCase())}
                  maxLength={5}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="Tên" style={{ marginBottom: 0 }}>
                <Input
                  value={zone.name}
                  onChange={e => updateZone(idx, 'name', e.target.value)}
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item label="Hàng" style={{ marginBottom: 0 }}>
                <InputNumber
                  min={1} max={50}
                  value={zone.rows}
                  onChange={v => updateZone(idx, 'rows', v || 1)}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={3}>
              <Form.Item label="Cột" style={{ marginBottom: 0 }}>
                <InputNumber
                  min={1} max={20}
                  value={zone.cols}
                  onChange={v => updateZone(idx, 'cols', v || 1)}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={1}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={() => removeZone(idx)}
                style={{ marginTop: 22 }}
              />
            </Col>
          </Row>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Tổng: {zone.rows * zone.cols} ô
          </Text>
        </Card>
      ))}

      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        onClick={addZone}
      >
        Thêm bãi
      </Button>
    </Drawer>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const YardMapPage: React.FC = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()

  // Data
  const [cells, setCells] = useState<YardCell[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | undefined>(undefined)
  const [stats, setStats] = useState<{
    total_positions: number; occupied: number; empty: number
    total_weight_kg: number; batches_pending_qc: number; batches_passed: number
    avg_drc: number | null; avg_storage_days: number
  } | null>(null)

  // UI State
  const [selectedCell, setSelectedCell] = useState<YardCell | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignCell, setAssignCell] = useState<YardCell | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveCell, setMoveCell] = useState<YardCell | null>(null)

  // Filters
  const [filterZone, setFilterZone] = useState<string>('all')
  const [filterGrade, setFilterGrade] = useState<string>('all')
  const [filterQC, setFilterQC] = useState<string>('all')
  const [searchText, setSearchText] = useState('')

  // ========================================================================
  // LOAD DATA
  // ========================================================================

  const loadWarehouses = useCallback(async () => {
    const { data } = await supabase
      .from('warehouses')
      .select('id, code, name')
      .eq('is_active', true)
      .order('name')
    setWarehouses((data || []) as WarehouseOption[])
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [cellData, statsData] = await Promise.all([
        yardService.getYardMap(selectedWarehouse),
        yardService.getYardStats(selectedWarehouse),
      ])
      setCells(cellData)
      setStats(statsData)
    } catch (e: any) {
      console.error('Lỗi tải bản đồ bãi:', e)
      message.error('Lỗi tải dữ liệu bãi: ' + e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedWarehouse])

  useEffect(() => { loadWarehouses() }, [loadWarehouses])
  useEffect(() => {
    setLoading(true)
    loadData()
  }, [loadData])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  // ========================================================================
  // DERIVED
  // ========================================================================

  const config = useMemo(() => yardService.getConfig(), [configOpen])

  const filteredCells = useMemo(() => {
    let result = cells

    // Zone filter
    if (filterZone !== 'all') {
      result = result.filter(c => c.zone === filterZone)
    }

    // Grade filter
    if (filterGrade !== 'all') {
      result = result.filter(c => {
        if (filterGrade === 'empty') return !c.batch
        return c.batch?.rubber_grade === filterGrade
      })
    }

    // QC filter
    if (filterQC !== 'all') {
      result = result.filter(c => c.batch?.qc_status === filterQC)
    }

    // Search
    if (searchText.trim()) {
      const term = searchText.toLowerCase().trim()
      result = result.filter(c =>
        c.batch?.batch_no.toLowerCase().includes(term) ||
        c.batch?.supplier_name?.toLowerCase().includes(term)
      )
    }

    return result
  }, [cells, filterZone, filterGrade, filterQC, searchText])

  // Group cells by zone
  const cellsByZone = useMemo(() => {
    const map = new Map<string, YardCell[]>()
    for (const cell of filteredCells) {
      if (!map.has(cell.zone)) map.set(cell.zone, [])
      map.get(cell.zone)!.push(cell)
    }
    return map
  }, [filteredCells])

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleCellClick = (cell: YardCell) => {
    setSelectedCell(cell)
  }

  const handleAssign = (cell: YardCell) => {
    setAssignCell(cell)
    setAssignOpen(true)
    setSelectedCell(null)
  }

  const handleMove = (cell: YardCell) => {
    setMoveCell(cell)
    setMoveOpen(true)
  }

  const handleClear = async (batchId: string) => {
    try {
      await yardService.clearPosition(batchId)
      message.success('Đã xóa vị trí bãi')
      setSelectedCell(null)
      loadData()
    } catch (e: any) {
      message.error(e.message || 'Lỗi xóa vị trí')
    }
  }

  const handleNavigateQC = (batchId: string) => {
    openTab({
      key: `batch-qc-${batchId}`,
      title: `QC lô ${batchId.slice(0, 8)}`,
      componentId: 'batch-qc-history',
      props: { batchId },
      path: `/wms/qc/batch/${batchId}`,
    })
  }

  const handleNavigateDetail = (batchId: string) => {
    openTab({
      key: `batch-qc-${batchId}`,
      title: `QC lô ${batchId.slice(0, 8)}`,
      componentId: 'batch-qc-history',
      props: { batchId },
      path: `/wms/qc/batch/${batchId}`,
    })
  }

  const handleConfigSave = () => {
    loadData()
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Đang tải bản đồ bãi..." />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER */}
      <div style={{ background: PRIMARY, padding: '16px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <Title level={4} style={{ color: '#fff', margin: 0 }}>
              Bản đồ bãi nguyên liệu
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              Quản lý vị trí lô hàng trong bãi
            </Text>
          </div>
          <Space>
            <Select
              allowClear
              placeholder="Tất cả kho"
              value={selectedWarehouse}
              onChange={setSelectedWarehouse}
              style={{ minWidth: 160 }}
              options={warehouses.map(w => ({
                value: w.id,
                label: `${w.code} — ${w.name}`,
              }))}
            />
            <Button
              icon={<SettingOutlined />}
              onClick={() => setConfigOpen(true)}
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
              ghost
            >
              Cài đặt bãi
            </Button>
            <Button
              type="text"
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={handleRefresh}
              style={{ color: '#fff' }}
            />
          </Space>
        </div>
      </div>

      {/* STATS ROW */}
      {stats && (
        <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '12px 20px' }}>
          <Row gutter={[16, 8]}>
            <Col xs={8} sm={4}>
              <Statistic
                title={<span style={{ fontSize: 11 }}>Tổng ô</span>}
                value={stats.total_positions}
                valueStyle={{ fontSize: 18, fontWeight: 700, color: PRIMARY }}
              />
            </Col>
            <Col xs={8} sm={4}>
              <Statistic
                title={<span style={{ fontSize: 11 }}>Đã dùng</span>}
                value={stats.occupied}
                valueStyle={{ fontSize: 18, fontWeight: 700, color: '#2563EB' }}
                suffix={<span style={{ fontSize: 11, color: '#999' }}>
                  ({stats.total_positions > 0 ? Math.round(stats.occupied / stats.total_positions * 100) : 0}%)
                </span>}
              />
            </Col>
            <Col xs={8} sm={4}>
              <Statistic
                title={<span style={{ fontSize: 11 }}>Trống</span>}
                value={stats.empty}
                valueStyle={{ fontSize: 18, fontWeight: 700, color: '#16A34A' }}
              />
            </Col>
            <Col xs={8} sm={4}>
              <Statistic
                title={<span style={{ fontSize: 11 }}>Tổng KL</span>}
                value={stats.total_weight_kg}
                valueStyle={{ fontSize: 18, fontWeight: 700, color: '#92400E' }}
                suffix="kg"
                formatter={(val) => Number(val).toLocaleString('vi-VN')}
              />
            </Col>
            <Col xs={8} sm={4}>
              <Statistic
                title={<span style={{ fontSize: 11 }}>Chờ QC</span>}
                value={stats.batches_pending_qc}
                valueStyle={{ fontSize: 18, fontWeight: 700, color: '#F59E0B' }}
              />
            </Col>
            <Col xs={8} sm={4}>
              <Statistic
                title={<span style={{ fontSize: 11 }}>DRC TB</span>}
                value={stats.avg_drc != null ? stats.avg_drc.toFixed(1) : '—'}
                valueStyle={{ fontSize: 18, fontWeight: 700, color: PRIMARY }}
                suffix={stats.avg_drc != null ? '%' : ''}
              />
            </Col>
          </Row>
        </div>
      )}

      {/* FILTER BAR */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '10px 20px' }}>
        <Space wrap size={8}>
          <Select
            value={filterZone}
            onChange={setFilterZone}
            style={{ minWidth: 100 }}
            options={[
              { value: 'all', label: 'Tất cả bãi' },
              ...config.zones.map(z => ({ value: z.code, label: z.name })),
            ]}
          />
          <Select
            value={filterGrade}
            onChange={setFilterGrade}
            style={{ minWidth: 120 }}
            options={[
              { value: 'all', label: 'Tất cả grade' },
              { value: 'SVR_3L', label: 'SVR 3L' },
              { value: 'SVR_5', label: 'SVR 5' },
              { value: 'SVR_10', label: 'SVR 10' },
              { value: 'SVR_20', label: 'SVR 20' },
              { value: 'SVR_CV60', label: 'SVR CV60' },
              { value: 'empty', label: 'Ô trống' },
            ]}
          />
          <Select
            value={filterQC}
            onChange={setFilterQC}
            style={{ minWidth: 120 }}
            options={[
              { value: 'all', label: 'Tất cả QC' },
              { value: 'pending', label: 'Chờ QC' },
              { value: 'passed', label: 'Đạt' },
              { value: 'warning', label: 'Cảnh báo' },
              { value: 'failed', label: 'Không đạt' },
              { value: 'needs_blend', label: 'Cần trộn' },
            ]}
          />
          <Input
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Tìm mã lô, NCC..."
            allowClear
            style={{ width: 200 }}
          />
        </Space>
      </div>

      {/* GRID CONTENT */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {cellsByZone.size === 0 ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Empty
              image={<EnvironmentOutlined style={{ fontSize: 40, color: '#ccc' }} />}
              description="Không có dữ liệu bãi phù hợp"
            />
          </div>
        ) : (
          Array.from(cellsByZone.entries()).map(([zoneCode, zoneCells]) => {
            const zoneConfig = config.zones.find(z => z.code === zoneCode)
            return (
              <YardZoneGrid
                key={zoneCode}
                zoneCode={zoneCode}
                zoneName={zoneConfig?.name || `Bãi ${zoneCode}`}
                cols={zoneConfig?.cols || 5}
                cells={zoneCells}
                onCellClick={handleCellClick}
              />
            )
          })
        )}

        {/* LEGEND */}
        <Card size="small" style={{ marginTop: 8 }}>
          <Text strong style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Chú thích màu</Text>
          <ColorLegend />
        </Card>
      </div>

      {/* MODALS */}
      <BatchDetailModal
        cell={selectedCell}
        onClose={() => setSelectedCell(null)}
        onNavigateQC={handleNavigateQC}
        onNavigateDetail={handleNavigateDetail}
        onMove={handleMove}
        onClear={handleClear}
        onAssign={handleAssign}
      />

      <AssignBatchModal
        open={assignOpen}
        cell={assignCell}
        warehouseId={selectedWarehouse}
        onClose={() => { setAssignOpen(false); setAssignCell(null) }}
        onAssigned={() => loadData()}
      />

      <MoveBatchModal
        open={moveOpen}
        cell={moveCell}
        onClose={() => { setMoveOpen(false); setMoveCell(null) }}
        onMoved={() => loadData()}
      />

      <YardConfigDrawer
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSave={handleConfigSave}
      />
    </div>
  )
}

export default YardMapPage
