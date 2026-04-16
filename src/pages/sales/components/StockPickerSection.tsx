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
  ThunderboltOutlined, ClearOutlined,
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
  const overageKg = grandTotal - targetKg // + dư, - thiếu
  const overagePct = targetKg > 0 ? (overageKg / targetKg) * 100 : 0
  // Trạng thái hiển thị ô tổng kết:
  //   underfill: thiếu (< target)
  //   exact: vừa đủ (±0.5 kg → coi như tròn)
  //   surplus: dư (> target)
  const fillState: 'underfill' | 'exact' | 'surplus' =
    overageKg < -0.5 ? 'underfill' : overageKg > 0.5 ? 'surplus' : 'exact'
  const isSufficient = grandTotal >= targetKg && selectedTotal > 0
  // Ngưỡng 2% — chuẩn hợp đồng xuất khẩu cao su ±2%
  const isOverAllocated = grandTotal > targetKg * 1.02

  /**
   * Cấp phát nhanh: tự fill các batch theo FIFO (batch nhập trước fill trước),
   * mỗi batch lấy tối đa quantity_remaining, batch cuối lấy đúng số còn thiếu.
   * Bỏ qua các batch đã có trong "existing allocations" — chỉ phân bổ phần còn thiếu.
   */
  const handleQuickFill = () => {
    if (available.length === 0) {
      message.warning('Không có lô khả dụng để cấp phát')
      return
    }
    const stillNeeded = Math.max(0, targetKg - existingTotal)
    if (stillNeeded <= 0.5) {
      message.info('Đã cấp đủ rồi — không cần thêm')
      return
    }

    // FIFO: sort theo received_date asc (đã sort sẵn từ service)
    const next: Record<string, number> = {}
    let remaining = stillNeeded
    for (const batch of available) {
      if (remaining <= 0.5) break
      const batchMax = Number(batch.quantity_remaining || 0)
      if (batchMax <= 0) continue
      const take = Math.min(batchMax, remaining)
      // Round to 2 decimal places (kg)
      next[batch.id] = Math.round(take * 100) / 100
      remaining = Math.round((remaining - take) * 100) / 100
    }

    if (Object.keys(next).length === 0) {
      message.warning('Tất cả lô đã hết tồn — không thể cấp phát')
      return
    }
    setSelections(next)
    const total = Object.values(next).reduce((s, v) => s + v, 0)
    if (remaining > 0.5) {
      message.warning(
        `Đã chọn ${total.toLocaleString('vi-VN')} kg từ ${Object.keys(next).length} lô — vẫn còn thiếu ${remaining.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`,
      )
    } else {
      message.success(
        `⚡ Tự chọn ${total.toLocaleString('vi-VN')} kg từ ${Object.keys(next).length} lô — đủ cho đơn`,
      )
    }
  }

  /** Clear toàn bộ selections để chọn lại từ đầu */
  const handleClearSelections = () => {
    setSelections({})
  }

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
      {/* Summary — hiển thị tấn cho dễ đọc */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Statistic
            title="Cần"
            value={targetKg / 1000}
            precision={3}
            suffix="tấn"
            valueStyle={{ fontSize: 16, color: '#1677ff' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Đã cấp"
            value={existingTotal / 1000}
            precision={3}
            suffix="tấn"
            valueStyle={{ fontSize: 16, color: '#52c41a' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Đang chọn"
            value={selectedTotal / 1000}
            precision={3}
            suffix="tấn"
            valueStyle={{ fontSize: 16, color: '#fa8c16' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title={
              fillState === 'underfill'
                ? 'Còn thiếu'
                : fillState === 'exact'
                ? 'Vừa đủ ✓'
                : `Dư (+${overagePct.toFixed(2)}%)`
            }
            value={Math.abs(overageKg) / 1000}
            precision={3}
            suffix="tấn"
            valueStyle={{
              fontSize: 16,
              color:
                fillState === 'underfill'
                  ? '#cf1322'
                  : fillState === 'exact'
                  ? '#52c41a'
                  : isOverAllocated
                  ? '#cf1322'  // dư >2% → đỏ (vượt ngưỡng)
                  : '#fa8c16', // dư ≤2% → cam (cảnh báo nhẹ)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>
          LÔ TRONG KHO CÙNG GRADE {order.grade} ({available.length})
        </div>
        {canEdit && available.length > 0 && (
          <Space size={6}>
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={handleQuickFill}
              style={{ background: '#E8A838', borderColor: '#E8A838' }}
            >
              Cấp phát nhanh (FIFO)
            </Button>
            {selectedTotal > 0 && (
              <Button
                size="small"
                icon={<ClearOutlined />}
                onClick={handleClearSelections}
              >
                Xóa chọn
              </Button>
            )}
          </Space>
        )}
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
              message={`Cấp phát vượt 2% so với nhu cầu (đang dư ${overagePct.toFixed(2)}%)`}
              description="Hợp đồng xuất khẩu cao su chuẩn ±2%. Giảm bớt hoặc chia nhỏ đơn."
              style={{ marginBottom: 8 }}
            />
          )}
          <Popconfirm
            title="Cấp phát các lô đã chọn?"
            description={`Sẽ trừ ${selectedTotal.toLocaleString('vi-VN')} kg khỏi kho và gán vào đơn. Status đơn sẽ chuyển sang "Sẵn sàng".`}
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
              Phải chọn đủ {targetKg.toLocaleString('vi-VN')} kg (cho phép dư tối đa 2%)
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
