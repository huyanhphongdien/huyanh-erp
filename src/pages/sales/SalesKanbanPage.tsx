// ============================================================================
// SalesKanbanPage — Kanban board with 7 swimlanes
// File: src/pages/sales/SalesKanbanPage.tsx
// Phần Sprint 1 D3 (Sales Tracking & Control)
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { Input, Select, message, Spin, Button, Modal, Empty } from 'antd'
import { Search, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { salesStageService } from '../../services/sales/salesStageService'
import {
  SALES_STAGES,
  SALES_STAGE_LABELS,
  SALES_STAGE_EMOJI,
  type SalesStage,
} from '../../services/sales/salesStages'
import KanbanCard, { type KanbanOrder } from './components/KanbanCard'

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SalesKanbanPage() {
  const user = useAuthStore(s => s.user)
  const [orders, setOrders] = useState<KanbanOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEtd, setFilterEtd] = useState<'all' | '7d' | '14d' | '30d'>('all')
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false)
  const [dragOverStage, setDragOverStage] = useState<SalesStage | null>(null)
  const [confirmTransition, setConfirmTransition] = useState<{
    orderId: string
    orderCode: string
    fromStage: SalesStage
    toStage: SalesStage
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch ──
  const fetchOrders = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('sales_orders')
      .select(`
        id, code, contract_no, grade, quantity_tons, total_value_usd,
        delivery_date, etd, current_stage, current_owner_id,
        stage_started_at, stage_sla_hours,
        customer:sales_customers!sales_orders_customer_id_fkey(id, short_name, name),
        owner:employees!sales_orders_current_owner_id_fkey(id, full_name)
      `)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })

    setLoading(false)
    if (error) {
      message.error('Lỗi tải đơn: ' + error.message)
      return
    }

    const mapped: KanbanOrder[] = (data || []).map((o: any) => {
      const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const owner = Array.isArray(o.owner) ? o.owner[0] : o.owner
      return {
        id: o.id,
        code: o.code,
        contract_no: o.contract_no,
        customer_short: customer?.short_name || customer?.name || '—',
        grade: o.grade,
        quantity_tons: o.quantity_tons,
        total_value_usd: o.total_value_usd,
        delivery_date: o.delivery_date,
        etd: o.etd,
        current_stage: (o.current_stage as SalesStage) || 'sales',
        stage_started_at: o.stage_started_at,
        stage_sla_hours: o.stage_sla_hours,
        current_owner_name: owner?.full_name || null,
      }
    })
    setOrders(mapped)
  }

  useEffect(() => { fetchOrders() }, [])

  // ── Filter ──
  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (search) {
        const s = search.toLowerCase()
        const match =
          o.code.toLowerCase().includes(s) ||
          (o.contract_no || '').toLowerCase().includes(s) ||
          o.customer_short.toLowerCase().includes(s) ||
          (o.grade || '').toLowerCase().includes(s)
        if (!match) return false
      }
      if (filterEtd !== 'all' && o.etd) {
        const days = (new Date(o.etd).getTime() - Date.now()) / (1000 * 3600 * 24)
        const cutoff = filterEtd === '7d' ? 7 : filterEtd === '14d' ? 14 : 30
        if (days > cutoff) return false
      }
      if (showOnlyMine && user?.employee_id) {
        // owner_id check — simplified: if owner_name truthy match user name
        // Better: check current_owner_id === user.employee_id (need add to KanbanOrder)
        if (!o.current_owner_name || !user.full_name) return false
        if (o.current_owner_name !== user.full_name) return false
      }
      if (showOnlyOverdue) {
        if (!o.stage_started_at || !o.stage_sla_hours) return false
        const elapsed = (Date.now() - new Date(o.stage_started_at).getTime()) / (1000 * 3600)
        if (elapsed <= o.stage_sla_hours) return false
      }
      return true
    })
  }, [orders, search, filterEtd, showOnlyMine, showOnlyOverdue, user])

  // ── Group by stage ──
  const byStage = useMemo(() => {
    const m: Record<SalesStage, KanbanOrder[]> = {
      sales: [], raw_material: [], production: [], qc: [],
      packing: [], logistics: [], delivered: [],
    }
    filtered.forEach(o => {
      m[o.current_stage]?.push(o)
    })
    return m
  }, [filtered])

  // ── Drag handlers ──
  const handleDragOver = (e: React.DragEvent, stage: SalesStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverStage !== stage) setDragOverStage(stage)
  }

  const handleDragLeave = () => setDragOverStage(null)

  const handleDrop = (e: React.DragEvent, toStage: SalesStage) => {
    e.preventDefault()
    setDragOverStage(null)
    const orderId = e.dataTransfer.getData('text/plain')
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    if (order.current_stage === toStage) return // no-op
    setConfirmTransition({
      orderId,
      orderCode: order.code,
      fromStage: order.current_stage,
      toStage,
    })
  }

  const handleConfirmTransition = async () => {
    if (!confirmTransition || !user?.employee_id) {
      message.error('Không xác định được user')
      return
    }
    setSubmitting(true)
    const res = await salesStageService.transitionStage(
      confirmTransition.orderId,
      confirmTransition.toStage,
      user.employee_id,
      `Drag từ ${SALES_STAGE_LABELS[confirmTransition.fromStage]} → ${SALES_STAGE_LABELS[confirmTransition.toStage]}`,
    )
    setSubmitting(false)
    if (res.success) {
      message.success(`Đã chuyển ${confirmTransition.orderCode} sang ${SALES_STAGE_LABELS[confirmTransition.toStage]}`)
      setConfirmTransition(null)
      fetchOrders()
    } else {
      message.error(res.error || 'Lỗi')
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#111' }}>📋 Sales Kanban — Tiến độ tất cả đơn</h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>
            {filtered.length}/{orders.length} đơn · Drag card sang cột khác để chuyển bộ phận
          </p>
        </div>
        <Button icon={<RefreshCw size={14} />} onClick={fetchOrders}>Làm mới</Button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          prefix={<Search size={14} />}
          placeholder="Tìm SO/contract/khách/grade..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Select
          value={filterEtd}
          onChange={v => setFilterEtd(v)}
          style={{ width: 160 }}
          options={[
            { value: 'all', label: 'ETD: tất cả' },
            { value: '7d', label: 'ETD: ≤ 7 ngày' },
            { value: '14d', label: 'ETD: ≤ 14 ngày' },
            { value: '30d', label: 'ETD: ≤ 30 ngày' },
          ]}
        />
        <Button
          type={showOnlyMine ? 'primary' : 'default'}
          onClick={() => setShowOnlyMine(!showOnlyMine)}
          style={showOnlyMine ? { background: '#111', borderColor: '#111' } : {}}
        >
          Của tôi
        </Button>
        <Button
          type={showOnlyOverdue ? 'primary' : 'default'}
          onClick={() => setShowOnlyOverdue(!showOnlyOverdue)}
          danger={showOnlyOverdue}
        >
          Quá SLA
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        // Swimlane container — horizontal scroll
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
          {SALES_STAGES.map(stage => {
            const list = byStage[stage]
            const isOver = dragOverStage === stage
            const isOverloaded = list.length >= 8
            return (
              <div
                key={stage}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
                style={{
                  minWidth: 260,
                  width: 260,
                  background: isOver ? '#dbeafe' : '#f4f5f7',
                  border: isOver ? '2px dashed #0a72ef' : '1px solid #e4e4e7',
                  borderRadius: 8,
                  padding: 10,
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >
                {/* Lane header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, padding: '4px 6px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>{SALES_STAGE_EMOJI[stage]}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                      {SALES_STAGE_LABELS[stage]}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '1px 8px',
                    borderRadius: 9999,
                    background: isOverloaded ? '#fee2e2' : '#ffffff',
                    color: isOverloaded ? '#dc2626' : '#374151',
                  }}>
                    {list.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ minHeight: 60 }}>
                  {list.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#a1a1aa', fontSize: 11, fontStyle: 'italic' }}>
                      (rảnh)
                    </div>
                  ) : (
                    list.map(o => (
                      <KanbanCard
                        key={o.id}
                        order={o}
                        onDragStart={() => {}}
                        onDragEnd={() => {}}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <Empty description="Không có đơn nào khớp filter" style={{ marginTop: 40 }} />
      )}

      {/* Confirm modal */}
      <Modal
        title="Xác nhận chuyển bộ phận"
        open={!!confirmTransition}
        onCancel={() => setConfirmTransition(null)}
        onOk={handleConfirmTransition}
        confirmLoading={submitting}
        okText="Xác nhận chuyển"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#111', borderColor: '#111' } }}
      >
        {confirmTransition && (
          <div>
            <p style={{ margin: 0, marginBottom: 8 }}>
              Chuyển <strong>{confirmTransition.orderCode}</strong>:
            </p>
            <div style={{ padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, marginBottom: 8 }}>
              {SALES_STAGE_EMOJI[confirmTransition.fromStage]} <strong>{SALES_STAGE_LABELS[confirmTransition.fromStage]}</strong>
              <span style={{ margin: '0 8px', color: '#6b7280' }}>→</span>
              {SALES_STAGE_EMOJI[confirmTransition.toStage]} <strong>{SALES_STAGE_LABELS[confirmTransition.toStage]}</strong>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              Hệ thống sẽ ghi handoff log với người chuyển = bạn ({user?.full_name || user?.email}).
            </p>
          </div>
        )}
      </Modal>

    </div>
  )
}
