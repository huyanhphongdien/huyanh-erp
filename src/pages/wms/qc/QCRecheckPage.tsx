// ============================================================================
// FILE: src/pages/wms/qc/QCRecheckPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P6 — Sprint 6C-2 — Trang tái kiểm DRC
// ============================================================================
// Design: Industrial Mobile-First — Task-driven (WMS_UI_DESIGN_GUIDE.md)
// - Card layout cho DS lô cần tái kiểm
// - Bottom-sheet QC form khi nhấn "Bắt đầu kiểm"
// - Kết quả evaluate hiển thị ngay sau submit
// - Touch target ≥ 48px, safe-area padding
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FlaskConical,
  MapPin,
  Package,
  X,
  Save,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  Beaker,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import qcService from '../../../services/wms/qcService'
import type { RecheckBatchItem, QCEvaluation } from '../../../services/wms/qcService'
import type { MaterialQCStandard } from '../../../services/wms/wms.types'

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatNumber(num?: number | null): string {
  if (num === undefined || num === null) return '—'
  return num.toLocaleString('vi-VN')
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Urgency badge */
const UrgencyBadge: React.FC<{ daysOverdue: number }> = ({ daysOverdue }) => {
  if (daysOverdue <= 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" />
        Hôm nay
      </span>
    )
  }
  if (daysOverdue <= 3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" />
        Quá {daysOverdue} ngày
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-red-50 text-red-700 border border-red-200">
      <AlertTriangle className="w-3 h-3" />
      Quá {daysOverdue} ngày
    </span>
  )
}

/** DRC Gauge inline — shows DRC value with color based on evaluation */
const DRCGaugeInline: React.FC<{
  value: number
  standard: MaterialQCStandard | null
}> = ({ value, standard }) => {
  if (!standard) return null

  const min = standard.drc_min ?? 55
  const max = standard.drc_max ?? 65
  const range = max - min || 10
  const pct = Math.min(100, Math.max(0, ((value - min) / range) * 100))

  const warnLow = standard.drc_warning_low ?? min
  const warnHigh = standard.drc_warning_high ?? max
  const warnLowPct = ((warnLow - min) / range) * 100
  const warnHighPct = ((warnHigh - min) / range) * 100

  return (
    <div className="relative w-full h-4 rounded-full bg-red-100 overflow-hidden mt-1">
      {/* Warning zone */}
      <div
        className="absolute inset-y-0 bg-amber-200"
        style={{ left: `${Math.max(0, warnLowPct)}%`, width: `${warnHighPct - warnLowPct}%` }}
      />
      {/* Good zone (inner) */}
      <div
        className="absolute inset-y-0 bg-emerald-300"
        style={{ left: `${warnLowPct}%`, width: `${warnHighPct - warnLowPct}%` }}
      />
      {/* Current DRC marker */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-gray-800 rounded-full"
        style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
      />
      {/* Labels */}
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-gray-500 font-mono">
        {min}
      </span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-gray-500 font-mono">
        {max}
      </span>
    </div>
  )
}

/** QC Result display after submit */
const ResultDisplay: React.FC<{
  evaluation: QCEvaluation
  onDone: () => void
}> = ({ evaluation, onDone }) => {
  const isPass = evaluation.result === 'passed'
  const isWarn = evaluation.result === 'warning'

  return (
    <div className="flex flex-col items-center py-6 px-4">
      {/* Icon */}
      <div className={`
        w-16 h-16 rounded-full flex items-center justify-center mb-4
        ${isPass ? 'bg-emerald-100' : isWarn ? 'bg-amber-100' : 'bg-red-100'}
      `}>
        {isPass && <CheckCircle2 className="w-8 h-8 text-emerald-600" />}
        {isWarn && <AlertTriangle className="w-8 h-8 text-amber-600" />}
        {!isPass && !isWarn && <XCircle className="w-8 h-8 text-red-600" />}
      </div>

      {/* Title */}
      <p className={`text-[18px] font-bold ${
        isPass ? 'text-emerald-700' : isWarn ? 'text-amber-700' : 'text-red-700'
      }`}>
        {isPass ? 'ĐẠT CHUẨN' : isWarn ? 'CẢNH BÁO' : 'CẦN PHỐI TRỘN'}
      </p>

      {/* Message */}
      <p className="text-[13px] text-gray-600 text-center mt-2 leading-relaxed max-w-xs">
        {evaluation.message}
      </p>

      {/* Next recheck info */}
      {evaluation.result !== 'failed' && (
        <div className="mt-4 px-4 py-2 bg-gray-50 rounded-xl text-center">
          <p className="text-[11px] text-gray-400 uppercase">Tái kiểm tiếp theo</p>
          <p className="text-[14px] font-semibold text-gray-700">
            {evaluation.next_recheck_days} ngày nữa
          </p>
        </div>
      )}

      {evaluation.result === 'failed' && (
        <div className="mt-4 px-4 py-2 bg-red-50 rounded-xl text-center">
          <p className="text-[12px] text-red-600">
            Lô đã chuyển sang trạng thái "Cần phối trộn". Không cần tái kiểm cho đến khi blend.
          </p>
        </div>
      )}

      {/* Done button */}
      <button
        type="button"
        onClick={onDone}
        className="
          mt-6 w-full max-w-xs min-h-[48px]
          rounded-xl bg-[#1B4D3E] text-white
          text-[14px] font-semibold
          flex items-center justify-center gap-2
          active:scale-[0.97] transition-transform
        "
      >
        <Check className="w-5 h-5" />
        Hoàn tất
      </button>
    </div>
  )
}

/** Recheck batch card */
const RecheckCard: React.FC<{
  item: RecheckBatchItem
  onStartCheck: (item: RecheckBatchItem) => void
}> = ({ item, onStartCheck }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        {/* Row 1: Batch + Urgency */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0">
            <p
              className="text-[14px] font-bold text-gray-900"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {item.batch_no}
            </p>
            <p className="text-[13px] text-gray-600 mt-0.5">{item.material_name}</p>
          </div>
          <UrgencyBadge daysOverdue={item.days_overdue} />
        </div>

        {/* Row 2: DRC + Location */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <p className="text-[10px] text-gray-400 uppercase">DRC lần cuối</p>
            <p
              className="text-[16px] font-bold text-gray-800 mt-0.5"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {item.latest_drc != null ? `${item.latest_drc}%` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase">Vị trí</p>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-gray-400" />
              <p className="text-[13px] font-medium text-gray-700">{item.location_code}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase">Số lượng</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Package className="w-3 h-3 text-gray-400" />
              <p className="text-[13px] font-medium text-gray-700">
                {formatNumber(item.quantity_remaining)} {item.unit}
              </p>
            </div>
          </div>
        </div>

        {/* Row 3: Meta */}
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span>{item.warehouse_name}</span>
          <span>·</span>
          <span>Tái kiểm: {formatDate(item.next_recheck_date)}</span>
          <span>·</span>
          <span>QC cuối: {formatDate(item.last_qc_date)}</span>
        </div>
      </div>

      {/* Action button */}
      <button
        type="button"
        onClick={() => onStartCheck(item)}
        className="
          w-full min-h-[48px]
          flex items-center justify-center gap-2
          bg-emerald-50 border-t border-emerald-100
          text-[14px] font-semibold text-emerald-700
          active:bg-emerald-100 transition-colors
        "
      >
        <FlaskConical className="w-4 h-4" />
        Bắt đầu kiểm
      </button>
    </div>
  )
}

/** Skeleton */
const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-2xl shadow-sm p-4 animate-pulse">
    <div className="flex items-center justify-between mb-3">
      <div>
        <div className="h-4 bg-gray-200 rounded w-36 mb-1.5" />
        <div className="h-3 bg-gray-100 rounded w-24" />
      </div>
      <div className="h-5 bg-gray-200 rounded-full w-20" />
    </div>
    <div className="grid grid-cols-3 gap-3 mb-3">
      <div className="h-10 bg-gray-100 rounded" />
      <div className="h-10 bg-gray-100 rounded" />
      <div className="h-10 bg-gray-100 rounded" />
    </div>
    <div className="h-12 bg-gray-50 rounded" />
  </div>
)

// ============================================================================
// RECHECK MODAL (Bottom-sheet)
// ============================================================================

const RecheckModal: React.FC<{
  visible: boolean
  batch: RecheckBatchItem | null
  onClose: () => void
  onSubmitted: () => void
}> = ({ visible, batch, onClose, onSubmitted }) => {
  // Form state
  const [drcValue, setDrcValue] = useState('')
  const [priValue, setPriValue] = useState('')
  const [mooneyValue, setMooneyValue] = useState('')
  const [notes, setNotes] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // QC standard for this material
  const [qcStandard, setQcStandard] = useState<MaterialQCStandard | null>(null)
  const [loadingStd, setLoadingStd] = useState(false)

  // Submit state
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<QCEvaluation | null>(null)

  // Load standard when batch changes
  useEffect(() => {
    if (!batch) return
    setDrcValue('')
    setPriValue('')
    setMooneyValue('')
    setNotes('')
    setShowAdvanced(false)
    setResult(null)

    const loadStd = async () => {
      try {
        setLoadingStd(true)
        const std = await qcService.getStandard(batch.material_id)
        setQcStandard(std)
      } catch (err) {
        console.error('Lỗi load QC standard:', err)
      } finally {
        setLoadingStd(false)
      }
    }
    loadStd()
  }, [batch])

  // Live evaluate
  const drcNum = parseFloat(drcValue)
  const liveEval = !isNaN(drcNum) ? qcService.evaluateDRC(drcNum, qcStandard) : null

  // Submit
  const handleSubmit = async () => {
    if (!batch || isNaN(drcNum)) return

    try {
      setSaving(true)
      const { evaluation } = await qcService.addRecheckResult({
        batch_id: batch.id,
        drc_value: drcNum,
        pri_value: parseFloat(priValue) || undefined,
        mooney_value: parseFloat(mooneyValue) || undefined,
        notes: notes || undefined,
      })
      setResult(evaluation)
    } catch (err: any) {
      console.error('Lỗi tái kiểm:', err)
      alert('Lỗi: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDone = () => {
    setResult(null)
    onClose()
    onSubmitted()
  }

  if (!visible || !batch) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={result ? handleDone : onClose}
      />

      {/* Bottom-sheet */}
      <div
        className="
          fixed bottom-0 left-0 right-0 z-50
          bg-white rounded-t-3xl
          shadow-[0_-4px_30px_rgba(0,0,0,0.12)]
          max-h-[92vh] overflow-y-auto
          animate-[slideUp_0.3s_ease-out]
        "
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* ---- RESULT VIEW ---- */}
        {result ? (
          <ResultDisplay evaluation={result} onDone={handleDone} />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <h2 className="text-[17px] font-bold text-gray-900">Tái kiểm DRC</h2>
                <p className="text-[12px] text-gray-500 mt-0.5 font-mono">
                  {batch.batch_no} · {batch.material_name}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 active:bg-gray-200"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Batch info */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">DRC lần cuối</p>
                  <p className="text-[15px] font-bold text-gray-800 font-mono mt-0.5">
                    {batch.latest_drc != null ? `${batch.latest_drc}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">DRC ban đầu</p>
                  <p className="text-[13px] font-semibold text-gray-600 font-mono mt-0.5">
                    {batch.initial_drc != null ? `${batch.initial_drc}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">Quá hạn</p>
                  <p className={`text-[13px] font-semibold mt-0.5 ${
                    batch.days_overdue > 3 ? 'text-red-600' : batch.days_overdue > 0 ? 'text-amber-600' : 'text-gray-600'
                  }`}>
                    {batch.days_overdue > 0 ? `${batch.days_overdue} ngày` : 'Hôm nay'}
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="px-5 py-4 space-y-4">

              {/* DRC Input */}
              <div>
                <label className="flex items-center gap-1.5 text-[13px] font-medium text-gray-700 mb-1.5">
                  <FlaskConical className="w-4 h-4 text-gray-400" />
                  DRC (%) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={drcValue}
                    onChange={e => setDrcValue(e.target.value)}
                    placeholder="60.0"
                    autoFocus
                    className={`
                      w-full min-h-[56px] px-4 py-3
                      rounded-xl border text-[22px] font-bold
                      focus:outline-none focus:ring-1
                      ${liveEval?.result === 'failed'
                        ? 'border-red-300 focus:border-red-400 focus:ring-red-200 text-red-700'
                        : liveEval?.result === 'warning'
                          ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200 text-amber-700'
                          : liveEval?.result === 'passed'
                            ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200 text-emerald-700'
                            : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20 text-gray-900'
                      }
                    `}
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  {liveEval && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {liveEval.result === 'passed' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold rounded-full bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đạt
                        </span>
                      )}
                      {liveEval.result === 'warning' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold rounded-full bg-amber-100 text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" /> C.báo
                        </span>
                      )}
                      {liveEval.result === 'failed' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold rounded-full bg-red-100 text-red-700">
                          <XCircle className="w-3.5 h-3.5" /> Blend
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Standard info */}
                {qcStandard && (
                  <p className="text-[12px] text-gray-500 mt-1">
                    Chuẩn: {qcStandard.drc_standard ?? '—'}% · Khoảng: {qcStandard.drc_min}–{qcStandard.drc_max}%
                  </p>
                )}
                {/* DRC Gauge */}
                {qcStandard && !isNaN(drcNum) && (
                  <DRCGaugeInline value={drcNum} standard={qcStandard} />
                )}
              </div>

              {/* Advanced toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-[13px] text-gray-500 active:text-gray-700"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Chỉ tiêu khác (PRI, Mooney)
              </button>

              {showAdvanced && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">PRI</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={priValue}
                      onChange={e => setPriValue(e.target.value)}
                      placeholder="—"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-gray-200 text-[14px] font-mono focus:outline-none focus:ring-1 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Mooney</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={mooneyValue}
                      onChange={e => setMooneyValue(e.target.value)}
                      placeholder="—"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-gray-200 text-[14px] font-mono focus:outline-none focus:ring-1 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  Ghi chú
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú thêm (tùy chọn)..."
                  className="
                    w-full px-4 py-3
                    rounded-xl border border-gray-200
                    text-[14px] resize-none
                    focus:outline-none focus:ring-1
                    focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20
                  "
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[48px] rounded-xl border border-gray-200 text-[14px] font-medium text-gray-600 active:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || isNaN(drcNum)}
                className="
                  flex-[2] min-h-[48px]
                  rounded-xl
                  bg-[#1B4D3E] text-white
                  text-[14px] font-semibold
                  flex items-center justify-center gap-2
                  active:scale-[0.97] transition-transform
                  disabled:opacity-50 disabled:active:scale-100
                "
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Xác nhận tái kiểm
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const QCRecheckPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [batches, setBatches] = useState<RecheckBatchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Modal
  const [selectedBatch, setSelectedBatch] = useState<RecheckBatchItem | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      // Lấy lô quá hạn + sắp đến hạn trong 3 ngày tới
      const data = await qcService.getBatchesDueRecheck({
        include_upcoming_days: 3,
      })
      setBatches(data)
    } catch (err: any) {
      console.error('Lỗi load recheck:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const handleGoBack = () => navigate('/wms/qc')
  const handleRefresh = () => loadData(true)

  const handleStartCheck = (item: RecheckBatchItem) => {
    setSelectedBatch(item)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setSelectedBatch(null)
  }

  const handleSubmitted = () => {
    // Reload DS sau khi tái kiểm xong
    loadData(true)
  }

  // Separate overdue vs upcoming
  const overdueBatches = batches.filter(b => b.days_overdue > 0)
  const todayBatches = batches.filter(b => b.days_overdue === 0)
  const upcomingBatches = batches.filter(b => b.days_overdue < 0) // days_overdue is always >=0 in our logic, so this won't apply
  // Actually, getBatchesDueRecheck includes upcoming, but days_overdue >= 0 always
  // We treat days_overdue === 0 as "today or not yet overdue but within cutoff"

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
              <h1 className="text-[17px] font-bold tracking-tight">Tái kiểm DRC</h1>
              <p className="text-[11px] text-white/60">
                {loading ? 'Đang tải...' : `${batches.length} lô cần kiểm`}
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
      {/* SUMMARY BAR */}
      {/* ================================================================== */}
      {!loading && batches.length > 0 && (
        <div className="px-4 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center gap-4">
            {overdueBatches.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[13px] text-red-700 font-medium">
                  {overdueBatches.length} quá hạn
                </span>
              </div>
            )}
            {todayBatches.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[13px] text-amber-700 font-medium">
                  {todayBatches.length} hôm nay/sắp tới
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* CONTENT */}
      {/* ================================================================== */}
      <main className="px-4 pt-3 pb-28">
        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && batches.length === 0 && (
          <div className="flex flex-col items-center py-16 px-6">
            <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <p className="text-[15px] font-medium text-gray-800 mb-1">Không có lô nào cần tái kiểm</p>
            <p className="text-[13px] text-gray-500 text-center">
              Tất cả lô hàng đều trong chu kỳ tái kiểm bình thường.
            </p>
          </div>
        )}

        {/* Overdue section */}
        {!loading && overdueBatches.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[12px] text-red-600 font-semibold uppercase tracking-wide mb-2 px-1">
              Quá hạn ({overdueBatches.length})
            </h3>
            <div className="space-y-3">
              {overdueBatches.map(item => (
                <RecheckCard
                  key={item.id}
                  item={item}
                  onStartCheck={handleStartCheck}
                />
              ))}
            </div>
          </div>
        )}

        {/* Today / Upcoming section */}
        {!loading && todayBatches.length > 0 && (
          <div>
            {overdueBatches.length > 0 && (
              <h3 className="text-[12px] text-amber-600 font-semibold uppercase tracking-wide mb-2 px-1 mt-2">
                Hôm nay / Sắp tới ({todayBatches.length})
              </h3>
            )}
            <div className="space-y-3">
              {todayBatches.map(item => (
                <RecheckCard
                  key={item.id}
                  item={item}
                  onStartCheck={handleStartCheck}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ================================================================== */}
      {/* RECHECK MODAL */}
      {/* ================================================================== */}
      <RecheckModal
        visible={modalOpen}
        batch={selectedBatch}
        onClose={handleCloseModal}
        onSubmitted={handleSubmitted}
      />
    </div>
  )
}

export default QCRecheckPage