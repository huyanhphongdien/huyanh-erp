// ============================================================================
// FILE: src/pages/wms/qc/BatchQCHistoryPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P6 — Sprint 6D-2 — Lịch sử QC 1 lô hàng
// ============================================================================
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// - Header: batch info + DRC hiện tại + status
// - DRC Chart (component DRCChart)
// - Timeline: danh sách lần kiểm (mới nhất trước)
// - Navigate from: QCDashboard, StockInDetail, InventoryDetail
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  FlaskConical,
  MapPin,
  Package,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  FileText,
  Beaker,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import qcService from '../../../services/wms/qcService'
import DRCChart from '../../../components/wms/DRCChart'
import type { BatchQCResult, MaterialQCStandard, StockBatch } from '../../../services/wms/wms.types'

// ============================================================================
// TYPES
// ============================================================================

interface BatchInfo {
  id: string
  batch_no: string
  material_id: string
  material_name: string
  material_sku: string
  warehouse_name: string
  location_code: string
  initial_drc?: number | null
  latest_drc?: number | null
  qc_status: string
  last_qc_date?: string | null
  next_recheck_date?: string | null
  quantity_remaining: number
  unit: string
  received_date: string
  status: string
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatNumber(num?: number | null): string {
  if (num === undefined || num === null) return '—'
  return num.toLocaleString('vi-VN')
}

const CHECK_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  initial: { label: 'Kiểm tra ban đầu', icon: '🔬', color: 'text-blue-700' },
  recheck: { label: 'Tái kiểm', icon: '🔄', color: 'text-purple-700' },
  blend: { label: 'Sau phối trộn', icon: '🧪', color: 'text-teal-700' },
  export: { label: 'Trước xuất khẩu', icon: '📦', color: 'text-indigo-700' },
}

const RESULT_CONFIG: Record<string, {
  label: string
  className: string
  dotColor: string
  bgColor: string
}> = {
  passed: {
    label: 'Đạt chuẩn',
    className: 'text-emerald-700',
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
  },
  warning: {
    label: 'Cảnh báo',
    className: 'text-amber-700',
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50',
  },
  failed: {
    label: 'Không đạt',
    className: 'text-red-700',
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-50',
  },
  pending: {
    label: 'Chờ',
    className: 'text-gray-600',
    dotColor: 'bg-gray-400',
    bgColor: 'bg-gray-50',
  },
}

const QC_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  passed: { label: 'Đạt chuẩn', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  warning: { label: 'Cảnh báo', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  needs_blend: { label: 'Cần phối trộn', className: 'bg-red-50 text-red-700 border-red-200' },
  pending: { label: 'Chờ kiểm tra', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  failed: { label: 'Không đạt', className: 'bg-red-50 text-red-700 border-red-200' },
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Batch info header */
const BatchHeader: React.FC<{ batch: BatchInfo }> = ({ batch }) => {
  const statusConf = QC_STATUS_CONFIG[batch.qc_status] || QC_STATUS_CONFIG.pending

  return (
    <div className="bg-white border-b border-gray-100">
      {/* DRC highlight */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className="text-[13px] font-bold text-gray-500"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {batch.batch_no}
            </p>
            <p className="text-[15px] font-semibold text-gray-900 mt-0.5">
              {batch.material_name}
            </p>
          </div>
          <span className={`
            inline-flex items-center gap-1
            px-2.5 py-1 text-[12px] font-semibold
            rounded-full border
            ${statusConf.className}
          `}>
            {statusConf.label}
          </span>
        </div>

        {/* DRC values */}
        <div className="flex items-end gap-4 mt-3">
          <div>
            <p className="text-[10px] text-gray-400 uppercase">DRC hiện tại</p>
            <p
              className={`text-[28px] font-bold leading-none mt-0.5 ${
                batch.qc_status === 'passed' ? 'text-emerald-700' :
                batch.qc_status === 'warning' ? 'text-amber-700' :
                batch.qc_status === 'needs_blend' ? 'text-red-700' :
                'text-gray-800'
              }`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {batch.latest_drc != null ? `${batch.latest_drc}%` : '—'}
            </p>
          </div>
          <div className="pb-1">
            <p className="text-[10px] text-gray-400">Ban đầu</p>
            <p
              className="text-[14px] font-semibold text-gray-500"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {batch.initial_drc != null ? `${batch.initial_drc}%` : '—'}
            </p>
          </div>
          {batch.next_recheck_date && (
            <div className="pb-1 ml-auto text-right">
              <p className="text-[10px] text-gray-400">Tái kiểm tiếp</p>
              <p className="text-[13px] font-medium text-gray-700">
                {formatDate(batch.next_recheck_date)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50/50 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {batch.warehouse_name} · {batch.location_code}
        </span>
        <span className="flex items-center gap-1">
          <Package className="w-3 h-3" /> {formatNumber(batch.quantity_remaining)} {batch.unit}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" /> Nhập {formatDate(batch.received_date)}
        </span>
      </div>
    </div>
  )
}

/** QC Timeline item */
const TimelineItem: React.FC<{
  qc: BatchQCResult
  isFirst: boolean
  isLast: boolean
}> = ({ qc, isFirst, isLast }) => {
  const resultConf = RESULT_CONFIG[qc.result] || RESULT_CONFIG.pending
  const checkConf = CHECK_TYPE_LABELS[qc.check_type] || CHECK_TYPE_LABELS.recheck

  return (
    <div className="flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center w-6 shrink-0">
        {/* Top line */}
        <div className={`w-0.5 flex-1 ${isFirst ? 'bg-transparent' : 'bg-gray-200'}`} />
        {/* Dot */}
        <div className={`w-3 h-3 rounded-full shrink-0 ${resultConf.dotColor} ring-2 ring-white`} />
        {/* Bottom line */}
        <div className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-gray-200'}`} />
      </div>

      {/* Content */}
      <div className={`flex-1 ${resultConf.bgColor} rounded-xl px-3.5 py-3 mb-2`}>
        {/* Header: date + type */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className={`text-[12px] font-semibold ${checkConf.color}`}>
            {checkConf.icon} {checkConf.label}
          </span>
          <span className="text-[11px] text-gray-400">
            {formatDateTime(qc.tested_at)}
          </span>
        </div>

        {/* DRC value + result */}
        <div className="flex items-center gap-3 mb-1.5">
          <span
            className={`text-[18px] font-bold ${resultConf.className}`}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {qc.drc_value != null ? `${qc.drc_value}%` : '—'}
          </span>
          <span className={`
            inline-flex items-center gap-1
            px-2 py-0.5 text-[11px] font-semibold
            rounded-full border
            ${resultConf.className === 'text-emerald-700' ? 'bg-emerald-100 border-emerald-200 text-emerald-700' :
              resultConf.className === 'text-amber-700' ? 'bg-amber-100 border-amber-200 text-amber-700' :
              resultConf.className === 'text-red-700' ? 'bg-red-100 border-red-200 text-red-700' :
              'bg-gray-100 border-gray-200 text-gray-600'
            }
          `}>
            {resultConf.label}
          </span>
        </div>

        {/* Other QC values */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          {qc.pri_value != null && (
            <span>PRI: <strong className="font-mono">{qc.pri_value}</strong></span>
          )}
          {qc.mooney_value != null && (
            <span>Mooney: <strong className="font-mono">{qc.mooney_value}</strong></span>
          )}
          {qc.ash_content != null && (
            <span>Tro: <strong className="font-mono">{qc.ash_content}%</strong></span>
          )}
          {qc.nitrogen_content != null && (
            <span>N₂: <strong className="font-mono">{qc.nitrogen_content}%</strong></span>
          )}
        </div>

        {/* Notes */}
        {qc.notes && (
          <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
            <FileText className="w-3 h-3 inline-block mr-0.5 -mt-0.5" />
            {qc.notes}
          </p>
        )}
      </div>
    </div>
  )
}

/** Skeleton */
const PageSkeleton: React.FC = () => (
  <div className="animate-pulse">
    {/* Header skeleton */}
    <div className="bg-white px-4 py-4 border-b">
      <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
      <div className="h-5 bg-gray-200 rounded w-48 mb-3" />
      <div className="h-8 bg-gray-100 rounded w-24" />
    </div>
    {/* Chart skeleton */}
    <div className="px-4 py-4">
      <div className="h-[220px] bg-gray-100 rounded-xl" />
    </div>
    {/* Timeline skeleton */}
    <div className="px-4 space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-3">
          <div className="w-6 flex justify-center"><div className="w-3 h-3 bg-gray-200 rounded-full" /></div>
          <div className="flex-1 h-24 bg-gray-100 rounded-xl" />
        </div>
      ))}
    </div>
  </div>
)

// ============================================================================
// MAIN PAGE
// ============================================================================

const BatchQCHistoryPage: React.FC = () => {
  const navigate = useNavigate()
  const { batchId } = useParams<{ batchId: string }>()

  // State
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null)
  const [qcHistory, setQcHistory] = useState<BatchQCResult[]>([])
  const [standard, setStandard] = useState<MaterialQCStandard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadData = useCallback(async (isRefresh = false) => {
    if (!batchId) return

    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      // 1. Fetch batch info
      const { data: batch, error: batchErr } = await supabase
        .from('stock_batches')
        .select(`
          id, batch_no, material_id, warehouse_id, location_id,
          initial_drc, latest_drc, qc_status, last_qc_date, next_recheck_date,
          quantity_remaining, unit, received_date, status,
          material:materials(id, sku, name),
          warehouse:warehouses(id, name),
          location:warehouse_locations(id, code)
        `)
        .eq('id', batchId)
        .single()

      if (batchErr) throw batchErr

      const batchData: any = batch
      setBatchInfo({
        id: batchData.id,
        batch_no: batchData.batch_no,
        material_id: batchData.material_id,
        material_name: batchData.material?.name ?? '—',
        material_sku: batchData.material?.sku ?? '—',
        warehouse_name: batchData.warehouse?.name ?? '—',
        location_code: batchData.location?.code ?? '—',
        initial_drc: batchData.initial_drc,
        latest_drc: batchData.latest_drc,
        qc_status: batchData.qc_status,
        last_qc_date: batchData.last_qc_date,
        next_recheck_date: batchData.next_recheck_date,
        quantity_remaining: batchData.quantity_remaining,
        unit: batchData.unit,
        received_date: batchData.received_date,
        status: batchData.status,
      })

      // 2. Fetch QC history
      const history = await qcService.getQCHistory(batchId)
      setQcHistory(history)

      // 3. Fetch standard
      const std = await qcService.getStandard(batchData.material_id)
      setStandard(std)
    } catch (err: any) {
      console.error('Lỗi load batch QC history:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [batchId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const handleGoBack = () => navigate(-1)
  const handleRefresh = () => loadData(true)

  // Reverse timeline (mới nhất trước)
  const reversedHistory = [...qcHistory].reverse()

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div
      className="min-h-screen bg-[#F7F5F2]"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
    >
      {/* ================================================================== */}
      {/* HEADER */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-30 bg-[#1B4D3E] text-white shadow-md">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGoBack}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold tracking-tight">Lịch sử QC</h1>
              <p className="text-[11px] text-white/60 font-mono">
                {batchInfo?.batch_no ?? '...'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ================================================================== */}
      {/* LOADING */}
      {/* ================================================================== */}
      {loading && <PageSkeleton />}

      {/* ================================================================== */}
      {/* CONTENT */}
      {/* ================================================================== */}
      {!loading && batchInfo && (
        <>
          {/* Batch info header */}
          <BatchHeader batch={batchInfo} />

          {/* DRC Chart */}
          <div className="px-4 py-4">
            <h3 className="text-[12px] text-gray-500 font-semibold uppercase tracking-wide mb-3 px-1">
              <FlaskConical className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              Biểu đồ DRC
            </h3>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
              <DRCChart
                batchId={batchInfo.id}
                standard={standard}
                autoFetch={false}
                data={qcHistory}
                minHeight={220}
                showLegend={true}
              />
            </div>
          </div>

          {/* QC Standard info */}
          {standard && (
            <div className="mx-4 mb-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="grid grid-cols-4 gap-px bg-gray-100">
                <div className="bg-white px-2.5 py-2 text-center">
                  <p className="text-[9px] text-gray-400 uppercase">Chuẩn</p>
                  <p className="text-[13px] font-bold text-emerald-700 font-mono mt-0.5">
                    {standard.drc_standard ?? '—'}%
                  </p>
                </div>
                <div className="bg-white px-2.5 py-2 text-center">
                  <p className="text-[9px] text-gray-400 uppercase">Min–Max</p>
                  <p className="text-[12px] font-semibold text-gray-700 font-mono mt-0.5">
                    {standard.drc_min}–{standard.drc_max}%
                  </p>
                </div>
                <div className="bg-white px-2.5 py-2 text-center">
                  <p className="text-[9px] text-gray-400 uppercase">Cảnh báo</p>
                  <p className="text-[12px] font-semibold text-amber-700 font-mono mt-0.5">
                    {standard.drc_warning_low}–{standard.drc_warning_high}%
                  </p>
                </div>
                <div className="bg-white px-2.5 py-2 text-center">
                  <p className="text-[9px] text-gray-400 uppercase">Chu kỳ TK</p>
                  <p className="text-[12px] font-semibold text-gray-700 mt-0.5">
                    {standard.recheck_interval_days}d
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="px-4 pb-28">
            <h3 className="text-[12px] text-gray-500 font-semibold uppercase tracking-wide mb-3 px-1">
              <Clock className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              Lịch sử kiểm tra ({qcHistory.length} lần)
            </h3>

            {reversedHistory.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center">
                <p className="text-[13px] text-gray-400">Chưa có lần kiểm tra nào</p>
              </div>
            ) : (
              <div>
                {reversedHistory.map((qc, idx) => (
                  <TimelineItem
                    key={qc.id}
                    qc={qc}
                    isFirst={idx === 0}
                    isLast={idx === reversedHistory.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Not found */}
      {!loading && !batchInfo && (
        <div className="flex flex-col items-center py-16 px-6">
          <XCircle className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-[15px] font-medium text-gray-700">Không tìm thấy lô hàng</p>
          <button
            type="button"
            onClick={handleGoBack}
            className="mt-4 text-[13px] text-[#2D8B6E] font-medium active:underline"
          >
            Quay lại
          </button>
        </div>
      )}
    </div>
  )
}

export default BatchQCHistoryPage