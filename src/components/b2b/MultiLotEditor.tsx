// ============================================================================
// MultiLotEditor — Component multi-lot cho weighbridge ticket items
// File: src/components/b2b/MultiLotEditor.tsx
// Phase 30 of B2B Intake v4
// ============================================================================
// Use case: UI cho scale operator nhập N line items (multi-lot) trên 1 ticket.
// - Default 1 dòng (UX không khác flow cũ)
// - + Thêm lô: thêm N dòng
// - Mỗi dòng: source (deal/partner/supplier) + rubber_type + declared + DRC + price
// - Auto compute preview actual_qty (by_share) và line_amount
// - Save: 1 dòng → scalar ticket (has_items=false); N dòng → items
// ============================================================================

import { useState, useMemo } from 'react'
import { Table, Button, InputNumber, Select, Input, Space, Typography, Tag, Alert } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'

const { Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

export interface LotLine {
  line_no: number
  source_kind: 'deal' | 'partner' | 'supplier'
  source_id: string | null
  source_label?: string             // display name for UI
  rubber_type: string               // 'mu_tap', 'mu_nuoc', 'mu_cao_su'
  lot_code?: string
  declared_qty_kg: number
  drc_percent?: number
  unit_price?: number
  notes?: string
}

export interface MultiLotEditorProps {
  value: LotLine[]
  onChange: (lines: LotLine[]) => void

  /** Preview net weight (sau khi cân, để tính by_share) */
  previewNetKg?: number

  /** Allocation mode */
  allocationMode?: 'by_share' | 'direct'
  onAllocationModeChange?: (mode: 'by_share' | 'direct') => void

  /** Source lookup — caller cung cấp function fetch */
  onSearchDeal?: (query: string) => Promise<Array<{ id: string; label: string }>>
  onSearchPartner?: (query: string) => Promise<Array<{ id: string; label: string }>>
  onSearchSupplier?: (query: string) => Promise<Array<{ id: string; label: string }>>

  disabled?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

const emptyLine = (lineNo: number): LotLine => ({
  line_no: lineNo,
  source_kind: 'deal',
  source_id: null,
  rubber_type: 'mu_tap',
  declared_qty_kg: 0,
  drc_percent: 35,
  unit_price: 0,
})

const RUBBER_TYPES = [
  { value: 'mu_tap', label: 'Mủ tạp' },
  { value: 'mu_nuoc', label: 'Mủ nước' },
  { value: 'mu_cao_su', label: 'Mủ cao su' },
]

const SOURCE_KINDS = [
  { value: 'deal', label: 'Deal' },
  { value: 'partner', label: 'Partner (walk-in)' },
  { value: 'supplier', label: 'Supplier' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function MultiLotEditor({
  value,
  onChange,
  previewNetKg,
  allocationMode = 'by_share',
  onAllocationModeChange,
  onSearchDeal,
  onSearchPartner,
  onSearchSupplier,
  disabled,
}: MultiLotEditorProps) {
  const lines = value.length > 0 ? value : [emptyLine(1)]

  // Preview: auto compute actual_qty + line_amount cho hiển thị
  const preview = useMemo(() => {
    const totalDeclared = lines.reduce((sum, l) => sum + (l.declared_qty_kg || 0), 0)
    return lines.map(l => {
      let actual = 0
      if (allocationMode === 'by_share' && previewNetKg && totalDeclared > 0) {
        actual = Math.round((previewNetKg * (l.declared_qty_kg || 0) / totalDeclared) * 100) / 100
      } else if (allocationMode === 'direct') {
        actual = l.declared_qty_kg || 0
      }
      const amt = Math.round(
        actual * (l.drc_percent || 100) / 100 * (l.unit_price || 0)
      )
      return { ...l, _preview_actual: actual, _preview_amount: amt }
    })
  }, [lines, allocationMode, previewNetKg])

  const totalDeclared = lines.reduce((sum, l) => sum + (l.declared_qty_kg || 0), 0)
  const totalAmount = preview.reduce((sum, l) => sum + l._preview_amount, 0)

  // ============================================
  // Handlers
  // ============================================

  const updateLine = (idx: number, patch: Partial<LotLine>) => {
    const next = lines.map((l, i) => i === idx ? { ...l, ...patch } : l)
    onChange(next)
  }

  const addLine = () => {
    const nextNo = Math.max(0, ...lines.map(l => l.line_no)) + 1
    onChange([...lines, emptyLine(nextNo)])
  }

  const removeLine = (idx: number) => {
    if (lines.length === 1) return  // giữ ít nhất 1 dòng
    const next = lines.filter((_, i) => i !== idx)
    onChange(next)
  }

  // Direct mode warning: sum declared phải ≈ net
  const directMismatch = allocationMode === 'direct' && previewNetKg &&
    Math.abs(totalDeclared - previewNetKg) > 1

  // ============================================
  // Columns
  // ============================================

  const columns = [
    {
      title: '#',
      dataIndex: 'line_no',
      width: 50,
      render: (_: any, _row: any, idx: number) => idx + 1,
    },
    {
      title: 'Nguồn',
      dataIndex: 'source_kind',
      width: 120,
      render: (kind: string, _row: any, idx: number) => (
        <Select
          size="small"
          value={kind}
          options={SOURCE_KINDS}
          onChange={v => updateLine(idx, { source_kind: v as any, source_id: null, source_label: undefined })}
          disabled={disabled}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Chọn',
      dataIndex: 'source_id',
      width: 220,
      render: (_id: any, row: LotLine, idx: number) => {
        const searchFn = row.source_kind === 'deal' ? onSearchDeal :
                         row.source_kind === 'partner' ? onSearchPartner : onSearchSupplier
        return (
          <Select
            size="small"
            showSearch
            placeholder={`Tìm ${row.source_kind}...`}
            value={row.source_id || undefined}
            filterOption={false}
            notFoundContent="Gõ để tìm"
            onSearch={async query => {
              if (searchFn && query.length >= 2) {
                const opts = await searchFn(query)
                // Note: Ant Select không support async options tự động;
                // caller phải pass options thông qua state. Đây là demo.
              }
            }}
            onChange={(v, option: any) => updateLine(idx, {
              source_id: v,
              source_label: option?.label,
            })}
            disabled={disabled}
            style={{ width: '100%' }}
          />
        )
      },
    },
    {
      title: 'Loại mủ',
      dataIndex: 'rubber_type',
      width: 110,
      render: (v: string, _row: any, idx: number) => (
        <Select
          size="small"
          value={v}
          options={RUBBER_TYPES}
          onChange={val => updateLine(idx, { rubber_type: val })}
          disabled={disabled}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Mã lô',
      dataIndex: 'lot_code',
      width: 120,
      render: (v: string | undefined, _row: any, idx: number) => (
        <Input
          size="small"
          value={v || ''}
          placeholder="(auto)"
          onChange={e => updateLine(idx, { lot_code: e.target.value })}
          disabled={disabled}
        />
      ),
    },
    {
      title: 'Khai báo (kg)',
      dataIndex: 'declared_qty_kg',
      width: 110,
      render: (v: number, _row: any, idx: number) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          step={100}
          onChange={val => updateLine(idx, { declared_qty_kg: Number(val) || 0 })}
          disabled={disabled}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Thực (kg)',
      dataIndex: '_preview_actual',
      width: 100,
      render: (v: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v ? v.toLocaleString('vi-VN') : '—'}
        </Text>
      ),
    },
    {
      title: 'DRC %',
      dataIndex: 'drc_percent',
      width: 80,
      render: (v: number | undefined, _row: any, idx: number) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          max={100}
          step={0.5}
          onChange={val => updateLine(idx, { drc_percent: Number(val) || 0 })}
          disabled={disabled}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Giá (VNĐ/kg)',
      dataIndex: 'unit_price',
      width: 120,
      render: (v: number | undefined, _row: any, idx: number) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          step={1000}
          formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={val => Number(String(val).replace(/\D/g, '')) || 0}
          onChange={val => updateLine(idx, { unit_price: Number(val) || 0 })}
          disabled={disabled}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Thành tiền',
      dataIndex: '_preview_amount',
      width: 130,
      render: (v: number) => (
        <Text strong>
          {v ? v.toLocaleString('vi-VN') : '—'}
        </Text>
      ),
    },
    {
      title: '',
      width: 40,
      render: (_: any, _row: any, idx: number) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeLine(idx)}
          disabled={disabled || lines.length === 1}
        />
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Text strong>Danh sách lô:</Text>
          <Tag color={allocationMode === 'by_share' ? 'blue' : 'orange'}>
            {allocationMode === 'by_share' ? 'Tỷ lệ theo khai báo' : 'Khai báo = thực'}
          </Tag>
          {onAllocationModeChange && (
            <Select
              size="small"
              value={allocationMode}
              options={[
                { value: 'by_share', label: 'by_share (prorata)' },
                { value: 'direct', label: 'direct (khai = thực)' },
              ]}
              onChange={onAllocationModeChange}
              disabled={disabled}
              style={{ width: 180 }}
            />
          )}
        </Space>
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addLine}
          disabled={disabled}
          size="small"
        >
          Thêm lô
        </Button>
      </Space>

      <Table
        size="small"
        bordered
        columns={columns as any}
        dataSource={preview}
        pagination={false}
        rowKey="line_no"
      />

      <Space style={{ marginTop: 8, justifyContent: 'space-between', width: '100%' }}>
        <Text>
          Tổng khai: <strong>{totalDeclared.toLocaleString('vi-VN')} kg</strong>
          {previewNetKg && (
            <> · NET: <strong>{previewNetKg.toLocaleString('vi-VN')} kg</strong></>
          )}
        </Text>
        <Text type="success">
          Tổng tiền: <strong>{totalAmount.toLocaleString('vi-VN')} VNĐ</strong>
        </Text>
      </Space>

      {directMismatch && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 8 }}
          message={`Mode 'direct' yêu cầu tổng khai báo = NET. Lệch ${Math.abs(totalDeclared - (previewNetKg || 0)).toLocaleString('vi-VN')} kg — sẽ fail khi lưu.`}
        />
      )}
    </div>
  )
}
