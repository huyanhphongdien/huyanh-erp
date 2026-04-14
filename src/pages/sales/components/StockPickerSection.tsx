// ============================================================================
// STOCK PICKER SECTION — Cấp phát thành phẩm từ kho cho Sales Order (MTS)
// File: src/pages/sales/components/StockPickerSection.tsx
//
// Hiển thị trong Production Tab khi đơn chưa có production_order_id + chưa
// có stock allocations đủ. Cho phép user chọn manual từng lô thành phẩm trong
// kho + nhập số lượng lấy từ mỗi lô. Khi đủ → bấm "Cấp phát" → service call.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Alert, Button, Table, InputNumber, Tag, message, Space, Spin, Empty,
  Popconfirm, Statistic, Row, Col,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleOutlined, DeleteOutlined, ShoppingCartOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  stockAllocationService,
  type AvailableBatch,
  type StockAllocation,
} from '../../../services/sales/stockAllocationService'
import type { SalesOrder } from '../../../services/sales/salesTypes'

interface Props {
  order: SalesOrder
  canEdit: boolean
  onSaved: () => void
}

export default function StockPickerSection({ order, canEdit, onSaved }: Props) {
  const [available, setAvailable] = useState<AvailableBatch[]>([])
  const [existing, setExisting] = useState<StockAllocation[]>([])
  const [loading, setLoading] = useState(true)
  const [allocating, setAllocating] = useState(false)
  // Map batchId → quantity selected by user
  const [selections, setSelections] = useState<Record<string, number>>({})

  const targetKg = Number(order.quantity_kg || (order.quantity_tons || 0) * 1000)

  const load = useCallback(async () => {
    if (!order.grade) return
    try {
      setLoading(true)
      const [avail, existing] = await Promise.all([
        stockAllocationService.findAvailable({
          rubber_grade: order.grade,
          drc_min: order.drc_min,
          drc_max: order.drc_max,
        }),
        stockAllocationService.listByOrder(order.id),
      ])
      setAvailable(avail)
      setExisting(existing)
    } catch (e: any) {
      message.error(e.message || 'Không tải được danh sách kho')
    } finally {
      setLoading(false)
    }
  }, [order.id, order.grade, order.drc_min, order.drc_max])

  useEffect(() => { load() }, [load])

  // Computed totals
  const existingTotal = useMemo(
    () => existing.reduce((s, a) => s + Number(a.quantity_kg || 0), 0),
    [existing],
  )
  const selectedTotal = useMemo(
    () => Object.values(selections).reduce((s, v) => s + (v || 0), 0),
    [selections],
  )
  const grandTotal = existingTotal + selectedTotal
  const remaining = Math.max(0, targetKg - grandTotal)
  const isSufficient = grandTotal >= targetKg && selectedTotal > 0
  const isOverAllocated = grandTotal > targetKg * 1.05

  const handleAllocate = async () => {
    const requests = Object.entries(selections)
      .filter(([_, qty]) => qty > 0)
      .map(([batchId, qty]) => ({ stock_batch_id: batchId, quantity_kg: qty }))
    if (requests.length === 0) {
      message.warning('Chọn ít nhất 1 lô và nhập số lượng')
      return
    }
    try {
      setAllocating(true)
      await stockAllocationService.allocateToOrder(order.id, requests)
      message.success(`Đã cấp phát ${requests.length} lô`)
      setSelections({})
      load()
      onSaved()
    } catch (e: any) {
      message.error(e.message || 'Không thể cấp phát')
    } finally {
      setAllocating(false)
    }
  }

  const handleRelease = async (allocationId: string) => {
    try {
      await stockAllocationService.releaseAllocation(allocationId, 'Release bởi người dùng')
      message.success('Đã hoàn lại lô về kho')
      load()
      onSaved()
    } catch (e: any) {
      message.error(e.message || 'Không thể release')
    }
  }

  // ── Existing allocations table ──
  const existingColumns: ColumnsType<StockAllocation> = [
    {
      title: 'Mã lô',
      dataIndex: ['stock_batch', 'batch_no'],
      key: 'batch_no',
      render: (_, r) => (
        <Space>
          <Tag color="green">{r.stock_batch?.batch_no || '-'}</Tag>
          <Tag color="blue">{r.stock_batch?.rubber_grade}</Tag>
        </Space>
      ),
    },
    {
      title: 'DRC',
      dataIndex: ['stock_batch', 'latest_drc'],
      key: 'drc',
      width: 80,
      render: (v) => v != null ? `${v}%` : '—',
    },
    {
      title: 'SL cấp (kg)',
      dataIndex: 'quantity_kg',
      key: 'qty',
      width: 120,
      align: 'right',
      render: (v) => <strong>{Number(v).toLocaleString('vi-VN')}</strong>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s) => {
        const colors: Record<string, string> = {
          reserved: 'orange', packed: 'purple', shipped: 'green', released: 'default',
        }
        const labels: Record<string, string> = {
          reserved: 'Đã giữ', packed: 'Đã đóng', shipped: 'Đã xuất', released: 'Đã hoàn',
        }
        return <Tag color={colors[s] || 'default'}>{labels[s] || s}</Tag>
      },
    },
    {
      title: 'Container',
      dataIndex: ['container', 'container_no'],
      key: 'container',
      width: 120,
      render: (v) => v || '—',
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, r) => (
        canEdit && r.status === 'reserved' && (
          <Popconfirm title="Hoàn lại lô này về kho?" onConfirm={() => handleRelease(r.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )
      ),
    },
  ]

  // ── Available batches table ──
  const availableColumns: ColumnsType<AvailableBatch> = [
    {
      title: 'Mã lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <Tag color="green">{v}</Tag>
          <span style={{ fontSize: 10, color: '#999' }}>
            Nhập: {r.received_date ? dayjs(r.received_date).format('DD/MM/YYYY') : '—'}
          </span>
        </Space>
      ),
    },
    {
      title: 'DRC',
      dataIndex: 'latest_drc',
      key: 'drc',
      width: 70,
      render: (v) => v != null ? `${v}%` : '—',
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc',
      width: 90,
      render: (v) => (
        <Tag color={v === 'passed' ? 'green' : v === 'pending' ? 'orange' : 'default'}>
          {v || '—'}
        </Tag>
      ),
    },
    {
      title: 'Tồn (kg)',
      dataIndex: 'quantity_remaining',
      key: 'available',
      width: 110,
      align: 'right',
      render: (v) => Number(v).toLocaleString('vi-VN'),
    },
    {
      title: 'Cấp (kg)',
      key: 'selection',
      width: 150,
      render: (_, r) => (
        <InputNumber
          size="small"
          min={0}
          max={Number(r.quantity_remaining)}
          step={100}
          value={selections[r.id] || 0}
          style={{ width: '100%' }}
          disabled={!canEdit}
          onChange={(v) => {
            setSelections(prev => {
              const next = { ...prev }
              if (!v || v <= 0) delete next[r.id]
              else next[r.id] = Number(v)
              return next
            })
          }}
        />
      ),
    },
  ]

  if (loading) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      </Card>
    )
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <ShoppingCartOutlined style={{ color: '#1B4D3E' }} />
          <span>Cấp phát từ kho thành phẩm (Make-to-Stock)</span>
        </Space>
      }
    >
      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Statistic
            title="Cần"
            value={targetKg}
            suffix="kg"
            valueStyle={{ fontSize: 16, color: '#1677ff' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Đã cấp"
            value={existingTotal}
            suffix="kg"
            valueStyle={{ fontSize: 16, color: '#52c41a' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Đang chọn"
            value={selectedTotal}
            suffix="kg"
            valueStyle={{ fontSize: 16, color: '#fa8c16' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title={isSufficient ? 'Đủ ✓' : 'Còn thiếu'}
            value={remaining}
            suffix="kg"
            valueStyle={{
              fontSize: 16,
              color: isSufficient ? '#52c41a' : '#cf1322',
            }}
          />
        </Col>
      </Row>

      {/* Existing allocations */}
      {existing.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#666' }}>
            LÔ ĐÃ CẤP ({existing.length})
          </div>
          <Table
            dataSource={existing}
            columns={existingColumns}
            rowKey="id"
            size="small"
            pagination={false}
            style={{ marginBottom: 16 }}
          />
        </>
      )}

      {/* Available batches */}
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#666' }}>
        LÔ TRONG KHO CÙNG GRADE {order.grade} ({available.length})
      </div>
      {available.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={`Không có lô thành phẩm ${order.grade} trong kho. Cần tạo Lệnh sản xuất thay vì cấp phát từ kho.`}
        />
      ) : (
        <Table
          dataSource={available}
          columns={availableColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, size: 'small' }}
        />
      )}

      {/* Allocate button */}
      {canEdit && selectedTotal > 0 && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          {isOverAllocated && (
            <Alert
              type="error"
              showIcon
              message="Cấp phát vượt quá 5% so với nhu cầu"
              style={{ marginBottom: 8 }}
            />
          )}
          <Popconfirm
            title="Cấp phát các lô đã chọn?"
            description={`Sẽ trừ ${selectedTotal} kg khỏi kho và gán vào đơn. Status đơn sẽ chuyển sang "Sẵn sàng".`}
            onConfirm={handleAllocate}
            disabled={!isSufficient || isOverAllocated}
          >
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={allocating}
              disabled={!isSufficient || isOverAllocated}
              size="large"
            >
              Cấp phát {selectedTotal.toLocaleString('vi-VN')} kg
            </Button>
          </Popconfirm>
          {!isSufficient && (
            <div style={{ color: '#cf1322', fontSize: 11, marginTop: 4 }}>
              Phải chọn đủ hoặc vượt {targetKg.toLocaleString('vi-VN')} kg mới cấp phát được (all-or-nothing)
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
