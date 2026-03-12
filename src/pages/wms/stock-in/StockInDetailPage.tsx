// ============================================================================
// FILE: src/pages/wms/stock-in/StockInDetailPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3 — Bước 3.11 (IMPROVED — Supabase thật, join employee names)
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Package,
  MapPin,
  Calendar,
  User,
  FileText,
  Check,
  X,
  Clock,
  FlaskConical,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Warehouse,
  Loader2,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface OrderDetail {
  id: string
  material_id: string
  material_name: string
  material_sku: string
  batch_id: string
  batch_no: string
  quantity: number
  weight: number | null
  unit: string
  location_code: string | null
  drc_value: number | null
  qc_status: string
}

interface OrderData {
  id: string
  code: string
  type: string
  warehouse_name: string
  warehouse_code: string
  source_type: string
  status: 'draft' | 'confirmed' | 'cancelled'
  notes: string | null
  total_quantity: number | null
  total_weight: number | null
  created_by: string | null
  created_by_name: string
  confirmed_by: string | null
  confirmed_by_name: string | null
  created_at: string
  confirmed_at: string | null
  details: OrderDetail[]
}

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  draft:     { label: 'Nháp',         bg: 'bg-gray-100',     text: 'text-gray-600',     icon: <FileText size={14} /> },
  confirmed: { label: 'Đã nhập kho',  bg: 'bg-emerald-50',   text: 'text-emerald-700',  icon: <Check size={14} /> },
  cancelled: { label: 'Đã hủy',       bg: 'bg-red-50',       text: 'text-red-600',      icon: <X size={14} /> },
}

const SOURCE_LABELS: Record<string, string> = {
  production: 'Sản xuất', purchase: 'Mua hàng', blend: 'Phối trộn',
  transfer: 'Chuyển kho', adjust: 'Điều chỉnh',
}

const QC_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  passed:      { label: 'Đạt',          bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  warning:     { label: 'Cảnh báo',     bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  failed:      { label: 'Không đạt',    bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  needs_blend: { label: 'Cần phối trộn', bg: 'bg-purple-50', text: 'text-purple-700',  border: 'border-purple-200' },
  pending:     { label: 'Chờ QC',       bg: 'bg-gray-50',    text: 'text-gray-500',    border: 'border-gray-200' },
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('vi-VN')
}

/** Lookup employee name by ID (cached) */
async function getEmployeeName(empId: string | null): Promise<string> {
  if (!empId) return '—'
  const { data, error } = await supabase
    .from('employees')
    .select('full_name')
    .eq('id', empId)
    .maybeSingle()

  if (error || !data) {
    // Fallback: try by user_id
    const { data: d2 } = await supabase
      .from('employees')
      .select('full_name')
      .eq('user_id', empId)
      .maybeSingle()
    return d2?.full_name || empId.slice(0, 8) + '...'
  }
  return data.full_name
}

// ============================================================================
// DRC MINI GAUGE
// ============================================================================

function DRCMiniGauge({ value, status }: { value: number; status: string }) {
  const min = 55
  const max = 65
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const markerColor = status === 'passed' ? '#16A34A' : status === 'warning' ? '#F59E0B' : '#DC2626'

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[14px] font-bold" style={{ color: markerColor }}>
        {value.toFixed(1)}%
      </span>
      <div className="relative w-20 h-2 rounded-full overflow-hidden bg-gray-200">
        <div className="absolute inset-y-0 bg-red-200" style={{ left: '0%', width: '30%' }} />
        <div className="absolute inset-y-0 bg-amber-200" style={{ left: '30%', width: '10%' }} />
        <div className="absolute inset-y-0 bg-emerald-200" style={{ left: '40%', width: '20%' }} />
        <div className="absolute inset-y-0 bg-amber-200" style={{ left: '60%', width: '10%' }} />
        <div className="absolute inset-y-0 bg-red-200" style={{ left: '70%', width: '30%' }} />
        <div className="absolute top-0 bottom-0 w-1.5 rounded-full"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)', backgroundColor: markerColor, boxShadow: `0 0 4px ${markerColor}` }} />
      </div>
    </div>
  )
}

// ============================================================================
// TIMELINE
// ============================================================================

interface TimelineEvent {
  icon: React.ReactNode
  label: string
  time?: string
  user?: string
  active: boolean
  completed: boolean
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative">
      {events.map((event, idx) => (
        <div key={idx} className="flex gap-3 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
              ${event.completed ? 'bg-[#1B4D3E] text-white' : event.active ? 'bg-[#E8A838] text-white' : 'bg-gray-200 text-gray-400'}`}>
              {event.icon}
            </div>
            {idx < events.length - 1 && (
              <div className={`w-0.5 flex-1 min-h-[24px] ${event.completed ? 'bg-[#1B4D3E]' : 'bg-gray-200'}`} />
            )}
          </div>
          <div className="pt-1 pb-2">
            <p className={`text-[14px] font-semibold ${event.completed || event.active ? 'text-gray-900' : 'text-gray-400'}`}>
              {event.label}
            </p>
            {event.time && <p className="text-[12px] text-gray-500 mt-0.5">{formatDateTime(event.time)}</p>}
            {event.user && (
              <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-0.5">
                <User size={11} /> {event.user}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function StockInDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDetails, setExpandedDetails] = useState(true)
  const [expandedTimeline, setExpandedTimeline] = useState(true)

  // ========================================================================
  // LOAD ORDER FROM SUPABASE
  // ========================================================================
  useEffect(() => {
    if (!id) return

    const loadOrder = async () => {
      setLoading(true)
      try {
        // 1. Load order header + details with joins
        const { data: raw, error: err } = await supabase
          .from('stock_in_orders')
          .select(`
            *,
            warehouse:warehouses(id, code, name),
            details:stock_in_details(
              id, material_id, batch_id, quantity, weight, unit, location_id, notes,
              material:materials(id, sku, name, unit),
              batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status),
              location:warehouse_locations(id, code, shelf, row_name, column_name)
            )
          `)
          .eq('id', id)
          .single()

        if (err) throw err
        if (!raw) throw new Error('Không tìm thấy phiếu')

        // 2. Resolve employee names
        const [createdName, confirmedName] = await Promise.all([
          getEmployeeName(raw.created_by),
          getEmployeeName(raw.confirmed_by),
        ])

        // 3. Map to OrderData
        const details: OrderDetail[] = (raw.details || []).map((d: any) => ({
          id: d.id,
          material_id: d.material_id,
          material_name: d.material?.name || '—',
          material_sku: d.material?.sku || '—',
          batch_id: d.batch_id,
          batch_no: d.batch?.batch_no || '—',
          quantity: d.quantity,
          weight: d.weight,
          unit: d.unit || d.material?.unit || 'bành',
          location_code: d.location?.code || null,
          drc_value: d.batch?.latest_drc ?? d.batch?.initial_drc ?? null,
          qc_status: d.batch?.qc_status || 'pending',
        }))

        setOrder({
          id: raw.id,
          code: raw.code,
          type: raw.type,
          warehouse_name: raw.warehouse?.name || '—',
          warehouse_code: raw.warehouse?.code || '—',
          source_type: raw.source_type || 'production',
          status: raw.status,
          notes: raw.notes,
          total_quantity: raw.total_quantity,
          total_weight: raw.total_weight,
          created_by: raw.created_by,
          created_by_name: createdName,
          confirmed_by: raw.confirmed_by,
          confirmed_by_name: confirmedName,
          created_at: raw.created_at,
          confirmed_at: raw.confirmed_at,
          details,
        })
      } catch (e: any) {
        console.error('Lỗi load phiếu nhập:', e)
        setError(e.message || 'Có lỗi xảy ra')
      } finally {
        setLoading(false)
      }
    }

    loadOrder()
  }, [id])

  // ========================================================================
  // DERIVED
  // ========================================================================

  const statusCfg = STATUS_CONFIG[order?.status || 'draft'] || STATUS_CONFIG.draft

  const timelineEvents: TimelineEvent[] = useMemo(() => {
    if (!order) return []
    const events: TimelineEvent[] = [
      {
        icon: <FileText size={14} />,
        label: 'Tạo phiếu nháp',
        time: order.created_at,
        user: order.created_by_name,
        active: order.status === 'draft',
        completed: order.status !== 'draft',
      },
    ]

    if (order.status === 'confirmed') {
      events.push({
        icon: <Check size={14} />,
        label: 'Xác nhận nhập kho',
        time: order.confirmed_at || undefined,
        user: order.confirmed_by_name || undefined,
        active: false,
        completed: true,
      })
    } else if (order.status === 'cancelled') {
      events.push({
        icon: <X size={14} />,
        label: 'Đã hủy phiếu',
        time: order.confirmed_at || undefined,
        user: order.confirmed_by_name || undefined,
        active: false,
        completed: true,
      })
    } else {
      events.push({ icon: <Check size={14} />, label: 'Chờ xác nhận', active: false, completed: false })
    }

    return events
  }, [order])

  const qcSummary = useMemo(() => {
    if (!order) return { passed: 0, warning: 0, failed: 0, pending: 0 }
    return {
      passed: order.details.filter(d => d.qc_status === 'passed').length,
      warning: order.details.filter(d => d.qc_status === 'warning').length,
      failed: order.details.filter(d => d.qc_status === 'failed').length,
      pending: order.details.filter(d => d.qc_status === 'pending' || d.qc_status === 'needs_blend').length,
    }
  }, [order])

  // ========================================================================
  // RENDER
  // ========================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <Loader2 className="w-8 h-8 animate-spin text-[#2D8B6E]" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center p-6"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-bold">{error || 'Không tìm thấy phiếu'}</p>
          <button onClick={() => navigate('/wms/stock-in')}
            className="mt-4 px-6 py-2 bg-[#2D8B6E] text-white rounded-xl font-bold">
            Quay lại
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/wms/stock-in')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 active:scale-95">
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-gray-900 truncate"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {order.code}
            </h1>
            <p className="text-[12px] text-gray-500">Chi tiết phiếu nhập kho</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
            {statusCfg.icon} {statusCfg.label}
          </span>
        </div>
      </div>

      {/* BODY */}
      <div className="px-4 py-4 space-y-4 pb-32">

        {/* INFO CARD */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className={`h-1.5 ${order.status === 'confirmed' ? 'bg-[#1B4D3E]' : order.status === 'cancelled' ? 'bg-red-500' : 'bg-gray-300'}`} />
          <div className="p-4 space-y-3">
            {/* Warehouse */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1B4D3E]/10 flex items-center justify-center shrink-0">
                <Warehouse size={16} className="text-[#1B4D3E]" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Kho nhận</p>
                <p className="text-[15px] font-bold text-gray-900">{order.warehouse_name}</p>
                <p className="text-[12px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{order.warehouse_code}</p>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200" />

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400">Ngày tạo</p>
                  <p className="text-[13px] font-medium text-gray-900">{formatDate(order.created_at)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Package size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400">Nguồn nhập</p>
                  <p className="text-[13px] font-medium text-gray-900">
                    {SOURCE_LABELS[order.source_type] || order.source_type}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <User size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400">Người tạo</p>
                  <p className="text-[13px] font-medium text-gray-900">{order.created_by_name}</p>
                </div>
              </div>
              {order.confirmed_by_name && (
                <div className="flex items-start gap-2">
                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-gray-400">Người duyệt</p>
                    <p className="text-[13px] font-medium text-gray-900">{order.confirmed_by_name}</p>
                  </div>
                </div>
              )}
            </div>

            {order.notes && (
              <>
                <div className="border-t border-dashed border-gray-200" />
                <p className="text-[13px] text-gray-600 italic">📝 {order.notes}</p>
              </>
            )}
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Tổng SL</p>
            <p className="text-[22px] font-bold text-[#1B4D3E] mt-1"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatNumber(order.total_quantity || 0)}
            </p>
            <p className="text-[11px] text-gray-400">bành</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Tổng KL</p>
            <p className="text-[22px] font-bold text-[#1B4D3E] mt-1"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatNumber(order.total_weight || 0)}
            </p>
            <p className="text-[11px] text-gray-400">kg</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Số lô</p>
            <p className="text-[22px] font-bold text-[#1B4D3E] mt-1"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {order.details.length}
            </p>
            <p className="text-[11px] text-gray-400">lô hàng</p>
          </div>
        </div>

        {/* QC SUMMARY */}
        {(qcSummary.warning > 0 || qcSummary.failed > 0 || qcSummary.pending > 0) && (
          <div className={`
            rounded-xl p-3 flex items-center gap-3
            ${qcSummary.failed > 0 ? 'bg-red-50 border border-red-200' : qcSummary.warning > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}
          `}>
            <AlertTriangle size={18} className={qcSummary.failed > 0 ? 'text-red-500' : qcSummary.warning > 0 ? 'text-amber-500' : 'text-gray-400'} />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-gray-900">Tóm tắt QC</p>
              <p className="text-[12px] text-gray-600">
                {qcSummary.passed > 0 && `${qcSummary.passed} đạt`}
                {qcSummary.warning > 0 && ` · ${qcSummary.warning} cảnh báo`}
                {qcSummary.failed > 0 && ` · ${qcSummary.failed} không đạt`}
                {qcSummary.pending > 0 && ` · ${qcSummary.pending} chờ QC`}
              </p>
            </div>
          </div>
        )}

        {/* DETAIL TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button onClick={() => setExpandedDetails(!expandedDetails)}
            className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50">
            <p className="text-[14px] font-bold text-gray-900 flex items-center gap-2">
              <Package size={16} className="text-[#2D8B6E]" />
              Chi tiết ({order.details.length} lô)
            </p>
            {expandedDetails ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {expandedDetails && (
            <div className="border-t border-gray-100">
              {order.details.map((d, idx) => {
                const qc = QC_CONFIG[d.qc_status] || QC_CONFIG.pending
                return (
                  <div key={d.id} className={`px-4 py-3 ${idx > 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] font-bold text-gray-900"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {d.batch_no}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${qc.bg} ${qc.text} ${qc.border}`}>
                            {qc.label}
                          </span>
                        </div>
                        <p className="text-[12px] text-gray-600 truncate">{d.material_sku} — {d.material_name}</p>
                        {d.location_code && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin size={10} /> {d.location_code}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[15px] font-bold text-[#1B4D3E]"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {formatNumber(d.quantity)}
                        </p>
                        <p className="text-[11px] text-gray-400">{d.unit}</p>
                        {d.weight && <p className="text-[11px] text-gray-400">{formatNumber(d.weight)} kg</p>}
                      </div>
                    </div>
                    {d.drc_value != null && (
                      <div className="mt-2">
                        <DRCMiniGauge value={d.drc_value} status={d.qc_status} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* TIMELINE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button onClick={() => setExpandedTimeline(!expandedTimeline)}
            className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50">
            <p className="text-[14px] font-bold text-gray-900 flex items-center gap-2">
              <Clock size={16} className="text-[#2D8B6E]" />
              Lịch sử
            </p>
            {expandedTimeline ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {expandedTimeline && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              <Timeline events={timelineEvents} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}