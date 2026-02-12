// ============================================================================
// FILE: src/pages/wms/stock-out/StockOutDetailPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P4 — Bước 4.9 (IMPROVED — Supabase thật, join employee names)
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, MapPin, Calendar, User, FileText, Check, X,
  Clock, FlaskConical, ChevronDown, ChevronUp, AlertTriangle,
  Warehouse, Loader2, ShoppingCart, ArrowRightLeft, Tag,
  ClipboardList, Ban, Printer, Beaker,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface OutDetail {
  id: string
  material_id: string
  material_name: string
  material_sku: string
  material_unit: string
  batch_id: string
  batch_no: string
  quantity: number
  weight: number | null
  location_code: string | null
  drc_value: number | null
  qc_status: string
  picking_status: string
  picked_at: string | null
  picked_by_name: string | null
}

interface OutOrderData {
  id: string
  code: string
  type: string
  warehouse_name: string
  warehouse_code: string
  reason: string
  customer_name: string | null
  customer_order_ref: string | null
  status: string
  notes: string | null
  total_quantity: number | null
  total_weight: number | null
  created_by_name: string
  confirmed_by_name: string | null
  created_at: string
  confirmed_at: string | null
  details: OutDetail[]
}

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  draft:     { label: 'Nháp',           bg: 'bg-gray-100',     text: 'text-gray-600',     icon: <FileText size={14} /> },
  picking:   { label: 'Đang lấy hàng',  bg: 'bg-amber-50',     text: 'text-amber-700',    icon: <ClipboardList size={14} /> },
  picked:    { label: 'Đã lấy hàng',    bg: 'bg-blue-50',      text: 'text-blue-700',     icon: <Check size={14} /> },
  confirmed: { label: 'Đã xuất kho',    bg: 'bg-emerald-50',   text: 'text-emerald-700',  icon: <Check size={14} /> },
  cancelled: { label: 'Đã hủy',         bg: 'bg-red-50',       text: 'text-red-600',      icon: <X size={14} /> },
}

const REASON_LABELS: Record<string, string> = {
  sale: 'Bán hàng', production: 'Sản xuất', transfer: 'Chuyển kho',
  blend: 'Phối trộn', adjust: 'Điều chỉnh', return: 'Trả hàng',
}

const QC_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  passed:      { label: 'Đạt',           bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  warning:     { label: 'Cảnh báo',      bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  failed:      { label: 'Không đạt',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  needs_blend: { label: 'Cần phối trộn', bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  pending:     { label: 'Chờ QC',        bg: 'bg-gray-50',    text: 'text-gray-500',    border: 'border-gray-200' },
}

const PICKING_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Chờ lấy',   bg: 'bg-gray-100',   text: 'text-gray-500' },
  picking: { label: 'Đang lấy',  bg: 'bg-amber-100',  text: 'text-amber-700' },
  picked:  { label: 'Đã lấy',    bg: 'bg-emerald-100', text: 'text-emerald-700' },
  skipped: { label: 'Bỏ qua',    bg: 'bg-red-100',    text: 'text-red-600' },
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDT(dateStr: string): string {
  return `${fmt(dateStr)} ${new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
}
function fmtN(n: number): string { return n.toLocaleString('vi-VN') }

async function getEmpName(empId: string | null): Promise<string> {
  if (!empId) return '—'
  const { data } = await supabase.from('employees').select('full_name').eq('id', empId).maybeSingle()
  if (data) return data.full_name
  const { data: d2 } = await supabase.from('employees').select('full_name').eq('user_id', empId).maybeSingle()
  return d2?.full_name || empId.slice(0, 8) + '...'
}

// ============================================================================
// DRC MINI GAUGE
// ============================================================================
function DRCMiniGauge({ value, status }: { value: number; status: string }) {
  const pct = Math.max(0, Math.min(100, ((value - 55) / 10) * 100))
  const color = status === 'passed' ? '#16A34A' : status === 'warning' ? '#F59E0B' : '#DC2626'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[14px] font-bold" style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>{value.toFixed(1)}%</span>
      <div className="relative w-20 h-2 rounded-full overflow-hidden bg-gray-200">
        <div className="absolute inset-y-0 bg-red-200" style={{ left: '0%', width: '30%' }} />
        <div className="absolute inset-y-0 bg-amber-200" style={{ left: '30%', width: '10%' }} />
        <div className="absolute inset-y-0 bg-emerald-200" style={{ left: '40%', width: '20%' }} />
        <div className="absolute inset-y-0 bg-amber-200" style={{ left: '60%', width: '10%' }} />
        <div className="absolute inset-y-0 bg-red-200" style={{ left: '70%', width: '30%' }} />
        <div className="absolute top-0 bottom-0 w-1.5 rounded-full"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)', backgroundColor: color, boxShadow: `0 0 4px ${color}` }} />
      </div>
    </div>
  )
}

// ============================================================================
// TIMELINE
// ============================================================================
interface TLEvent { icon: React.ReactNode; label: string; time?: string; user?: string; active: boolean; completed: boolean }

function Timeline({ events }: { events: TLEvent[] }) {
  return (
    <div className="relative">
      {events.map((e, i) => (
        <div key={i} className="flex gap-3 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
              ${e.completed ? 'bg-[#1B4D3E] text-white' : e.active ? 'bg-[#E8A838] text-white' : 'bg-gray-200 text-gray-400'}`}>
              {e.icon}
            </div>
            {i < events.length - 1 && <div className={`w-0.5 flex-1 min-h-[24px] ${e.completed ? 'bg-[#1B4D3E]' : 'bg-gray-200'}`} />}
          </div>
          <div className="pt-1 pb-2">
            <p className={`text-[14px] font-semibold ${e.completed || e.active ? 'text-gray-900' : 'text-gray-400'}`}>{e.label}</p>
            {e.time && <p className="text-[12px] text-gray-500 mt-0.5">{fmtDT(e.time)}</p>}
            {e.user && <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-0.5"><User size={11} /> {e.user}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================
export default function StockOutDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OutOrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDetails, setExpandedDetails] = useState(true)
  const [expandedTimeline, setExpandedTimeline] = useState(true)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      try {
        const { data: raw, error: err } = await supabase
          .from('stock_out_orders')
          .select(`
            *,
            warehouse:warehouses(id, code, name),
            details:stock_out_details(
              id, material_id, batch_id, quantity, weight, location_id,
              picking_status, picked_at, picked_by, notes,
              material:materials(id, sku, name, unit),
              batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status),
              location:warehouse_locations(id, code)
            )
          `)
          .eq('id', id)
          .single()

        if (err) throw err

        // Resolve names
        const [createdName, confirmedName] = await Promise.all([
          getEmpName(raw.created_by),
          getEmpName(raw.confirmed_by),
        ])

        // Resolve picked_by names for each detail
        const pickerMap = new Map<string, string>()
        for (const d of (raw.details || []) as any[]) {
          const pid = d.picked_by as string | null
          if (pid && !pickerMap.has(pid)) {
            pickerMap.set(pid, await getEmpName(pid))
          }
        }

        const details: OutDetail[] = (raw.details || []).map((d: any) => ({
          id: d.id,
          material_id: d.material_id,
          material_name: d.material?.name || '—',
          material_sku: d.material?.sku || '—',
          material_unit: d.material?.unit || 'bành',
          batch_id: d.batch_id,
          batch_no: d.batch?.batch_no || '—',
          quantity: d.quantity,
          weight: d.weight,
          location_code: d.location?.code || null,
          drc_value: d.batch?.latest_drc ?? d.batch?.initial_drc ?? null,
          qc_status: d.batch?.qc_status || 'pending',
          picking_status: d.picking_status || 'pending',
          picked_at: d.picked_at,
          picked_by_name: d.picked_by ? (pickerMap.get(d.picked_by) || null) : null,
        }))

        setOrder({
          id: raw.id, code: raw.code, type: raw.type,
          warehouse_name: raw.warehouse?.name || '—',
          warehouse_code: raw.warehouse?.code || '—',
          reason: raw.reason || 'sale',
          customer_name: raw.customer_name, customer_order_ref: raw.customer_order_ref,
          status: raw.status, notes: raw.notes,
          total_quantity: raw.total_quantity, total_weight: raw.total_weight,
          created_by_name: createdName, confirmed_by_name: confirmedName,
          created_at: raw.created_at, confirmed_at: raw.confirmed_at,
          details,
        })
      } catch (e: any) {
        console.error('Lỗi load phiếu xuất:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const statusCfg = STATUS_CONFIG[order?.status || 'draft'] || STATUS_CONFIG.draft

  const timelineEvents: TLEvent[] = useMemo(() => {
    if (!order) return []
    const ev: TLEvent[] = [{
      icon: <FileText size={14} />, label: 'Tạo phiếu nháp',
      time: order.created_at, user: order.created_by_name,
      active: order.status === 'draft', completed: order.status !== 'draft',
    }]

    const isPicking = ['picking', 'picked', 'confirmed'].includes(order.status)
    const isPicked = ['picked', 'confirmed'].includes(order.status)

    ev.push({
      icon: <ClipboardList size={14} />, label: 'Lấy hàng hoàn tất',
      active: order.status === 'picking',
      completed: isPicked,
    })

    if (order.status === 'confirmed') {
      ev.push({
        icon: <Check size={14} />, label: 'Xác nhận xuất kho',
        time: order.confirmed_at || undefined, user: order.confirmed_by_name || undefined,
        active: false, completed: true,
      })
    } else if (order.status === 'cancelled') {
      ev.push({ icon: <X size={14} />, label: 'Đã hủy', active: false, completed: true })
    } else {
      ev.push({ icon: <Check size={14} />, label: 'Chờ xác nhận', active: false, completed: false })
    }
    return ev
  }, [order])

  const pickingSummary = useMemo(() => {
    if (!order) return { picked: 0, pending: 0, skipped: 0, total: 0 }
    return {
      picked: order.details.filter(d => d.picking_status === 'picked').length,
      pending: order.details.filter(d => d.picking_status === 'pending' || d.picking_status === 'picking').length,
      skipped: order.details.filter(d => d.picking_status === 'skipped').length,
      total: order.details.length,
    }
  }, [order])

  if (loading) return (
    <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      <Loader2 className="w-8 h-8 animate-spin text-[#2D8B6E]" />
    </div>
  )

  if (error || !order) return (
    <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center p-6" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      <div className="text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-gray-700 font-bold">{error || 'Không tìm thấy phiếu'}</p>
        <button onClick={() => navigate('/wms/stock-out')} className="mt-4 px-6 py-2 bg-[#2D8B6E] text-white rounded-xl font-bold">Quay lại</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/wms/stock-out')} className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 active:scale-95">
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-gray-900 truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{order.code}</h1>
            <p className="text-[12px] text-gray-500">Chi tiết phiếu xuất kho</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
            {statusCfg.icon} {statusCfg.label}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-32">
        {/* INFO CARD */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className={`h-1.5 ${order.status === 'confirmed' ? 'bg-[#1B4D3E]' : order.status === 'cancelled' ? 'bg-red-500' : 'bg-gray-300'}`} />
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1B4D3E]/10 flex items-center justify-center shrink-0">
                <Warehouse size={16} className="text-[#1B4D3E]" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Kho xuất</p>
                <p className="text-[15px] font-bold text-gray-900">{order.warehouse_name}</p>
                <p className="text-[12px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{order.warehouse_code}</p>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200" />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400">Ngày tạo</p>
                  <p className="text-[13px] font-medium text-gray-900">{fmt(order.created_at)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Tag size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400">Lý do</p>
                  <p className="text-[13px] font-medium text-gray-900">{REASON_LABELS[order.reason] || order.reason}</p>
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

            {/* Customer */}
            {order.customer_name && (
              <>
                <div className="border-t border-dashed border-gray-200" />
                <div className="flex items-start gap-2">
                  <ShoppingCart size={14} className="text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-[11px] text-gray-400">Khách hàng</p>
                    <p className="text-[13px] font-medium text-gray-900">{order.customer_name}</p>
                    {order.customer_order_ref && (
                      <p className="text-[12px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{order.customer_order_ref}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {order.notes && (
              <>
                <div className="border-t border-dashed border-gray-200" />
                <p className="text-[13px] text-gray-600 italic">📝 {order.notes}</p>
              </>
            )}
          </div>
        </div>

        {/* SUMMARY */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Tổng SL</p>
            <p className="text-[22px] font-bold text-[#1B4D3E] mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtN(order.total_quantity || 0)}</p>
            <p className="text-[11px] text-gray-400">bành</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Tổng KL</p>
            <p className="text-[22px] font-bold text-[#1B4D3E] mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtN(order.total_weight || 0)}</p>
            <p className="text-[11px] text-gray-400">kg</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Số lô</p>
            <p className="text-[22px] font-bold text-[#1B4D3E] mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{order.details.length}</p>
            <p className="text-[11px] text-gray-400">lô hàng</p>
          </div>
        </div>

        {/* DETAIL TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button onClick={() => setExpandedDetails(!expandedDetails)}
            className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50">
            <p className="text-[14px] font-bold text-gray-900 flex items-center gap-2">
              <Package size={16} className="text-[#2D8B6E]" /> Chi tiết xuất kho ({order.details.length} lô)
            </p>
            {expandedDetails ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>
          {expandedDetails && (
            <div className="border-t border-gray-100">
              {order.details.map((d, idx) => {
                const qc = QC_CONFIG[d.qc_status] || QC_CONFIG.pending
                const pk = PICKING_CONFIG[d.picking_status] || PICKING_CONFIG.pending
                return (
                  <div key={d.id} className={`px-4 py-3 ${idx > 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-[13px] font-bold text-gray-900" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.batch_no}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${qc.bg} ${qc.text} ${qc.border}`}>{qc.label}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${pk.bg} ${pk.text}`}>{pk.label}</span>
                        </div>
                        <p className="text-[12px] text-gray-600 truncate">{d.material_sku} — {d.material_name}</p>
                        {d.location_code && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={10} /> {d.location_code}</p>
                        )}
                        {d.picked_by_name && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5"><User size={10} /> {d.picked_by_name}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[15px] font-bold text-[#1B4D3E]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtN(d.quantity)}</p>
                        <p className="text-[11px] text-gray-400">{d.material_unit}</p>
                        {d.weight && <p className="text-[11px] text-gray-400">{fmtN(d.weight)} kg</p>}
                      </div>
                    </div>
                    {d.drc_value != null && (
                      <div className="mt-2"><DRCMiniGauge value={d.drc_value} status={d.qc_status} /></div>
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
              <Clock size={16} className="text-[#2D8B6E]" /> Lịch sử
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