// ============================================================================
// FILE: src/components/wms/QCInputForm.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3 — Bước 3.10: Component nhập kết quả QC (tái sử dụng P3 + P6)
// MÔ TẢ: Input DRC + chỉ số phụ, auto-validate, DRC Gauge visual, QC Badge
// PATTERN: Mobile-first, Industrial WMS, Vimaan-style inline validation
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FlaskConical,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  AlertTriangle,
  CircleX,
  Clock,
  Info,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

/** Ngưỡng QC cho 1 sản phẩm */
export interface QCStandard {
  drc_standard: number | null
  drc_min: number | null
  drc_max: number | null
  drc_warning_low: number | null
  drc_warning_high: number | null
  recheck_interval_days?: number
  recheck_shortened_days?: number
}

/** Kết quả đánh giá DRC */
export type QCResultType = 'passed' | 'warning' | 'failed'

export interface QCEvaluation {
  result: QCResultType
  message: string
  next_recheck_days?: number
}

/** Dữ liệu QC đầu ra khi submit */
export interface QCFormData {
  drc_value: number
  pri_value?: number
  mooney_value?: number
  ash_content?: number
  nitrogen_content?: number
  qc_result: QCResultType
  qc_message: string
  notes?: string
}

export interface QCInputFormProps {
  /** ID sản phẩm — dùng để load ngưỡng QC */
  material_id: string
  /** Callback khi giá trị QC thay đổi (realtime) */
  onChange?: (data: QCFormData | null) => void
  /** Cung cấp standard sẵn (skip fetch) — dùng khi parent đã load */
  standard?: QCStandard | null
  /** Giá trị DRC khởi tạo */
  initialDRC?: number
  /** Hiển thị label phía trên */
  label?: string
  /** Bắt buộc nhập DRC */
  required?: boolean
  /** Hiển thị ghi chú */
  showNotes?: boolean
  /** Cho phép mở rộng chỉ số phụ */
  showAdvanced?: boolean
  /** Compact mode (ẩn gauge, ẩn legend) */
  compact?: boolean
  /** Disabled */
  disabled?: boolean
  /** Custom className */
  className?: string
}

// ============================================================================
// DEFAULT STANDARD (matching qcService DEFAULT_STANDARD)
// ============================================================================

const DEFAULT_STANDARD: QCStandard = {
  drc_standard: 60,
  drc_min: 58,
  drc_max: 62,
  drc_warning_low: 59,
  drc_warning_high: 61,
  recheck_interval_days: 14,
  recheck_shortened_days: 7,
}

// ============================================================================
// HELPERS
// ============================================================================

function evaluateDRC(drc: number, std: QCStandard): QCEvaluation {
  const drcMin = std.drc_min ?? 58
  const drcMax = std.drc_max ?? 62
  const warnLow = std.drc_warning_low ?? 59
  const warnHigh = std.drc_warning_high ?? 61
  const recheckNormal = std.recheck_interval_days ?? 14
  const recheckShort = std.recheck_shortened_days ?? 7

  if (drc < drcMin || drc > drcMax) {
    return {
      result: 'failed',
      message: `Ngoài khoảng ${drcMin}–${drcMax}%`,
      next_recheck_days: recheckShort,
    }
  }

  if (drc < warnLow || drc > warnHigh) {
    return {
      result: 'warning',
      message: `Gần biên (cảnh báo ${warnLow}–${warnHigh}%)`,
      next_recheck_days: recheckShort,
    }
  }

  return {
    result: 'passed',
    message: 'Trong khoảng chuẩn',
    next_recheck_days: recheckNormal,
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** QC Badge — hiển thị kết quả QC */
export const QCBadge: React.FC<{
  result: QCResultType | undefined
  message?: string
  size?: 'sm' | 'md'
}> = ({ result, message, size = 'sm' }) => {
  if (!result) return null

  const config = {
    passed: {
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      icon: <CircleCheck className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />,
      label: 'Đạt',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200 text-amber-700',
      icon: <AlertTriangle className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />,
      label: 'Cảnh báo',
    },
    failed: {
      bg: 'bg-red-50 border-red-200 text-red-700',
      icon: <CircleX className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />,
      label: 'Không đạt',
    },
  }

  const c = config[result]
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span className={`inline-flex items-center gap-1 ${sizeClass} font-semibold rounded-full border ${c.bg}`}>
      {c.icon} {c.label}
      {message && <span className="font-normal ml-1">· {message}</span>}
    </span>
  )
}

/** DRC Gauge — thanh visual đặc trưng ngành cao su */
export const DRCGauge: React.FC<{
  value: number
  standard: QCStandard
  /** Compact — chỉ hiển thị thanh, không hiển thị số */
  compact?: boolean
}> = ({ value, standard, compact = false }) => {
  const min = standard.drc_min ?? 58
  const max = standard.drc_max ?? 62
  const range = max - min
  const padding = range * 0.5
  const displayMin = min - padding
  const displayMax = max + padding
  const displayRange = displayMax - displayMin

  const getPosition = (v: number) =>
    Math.max(0, Math.min(100, ((v - displayMin) / displayRange) * 100))

  const safeStart = getPosition(min)
  const safeEnd = getPosition(max)
  const markerPos = getPosition(value)

  const warnLow = standard.drc_warning_low != null ? getPosition(standard.drc_warning_low) : safeStart
  const warnHigh = standard.drc_warning_high != null ? getPosition(standard.drc_warning_high) : safeEnd

  // Determine marker color
  const eval_ = evaluateDRC(value, standard)
  const markerColor =
    eval_.result === 'failed' ? 'bg-red-600' :
    eval_.result === 'warning' ? 'bg-amber-500' :
    'bg-emerald-600'

  return (
    <div className={compact ? 'mt-1' : 'mt-2.5'}>
      <div className={`relative ${compact ? 'h-4' : 'h-6'} rounded-full overflow-hidden bg-red-100`}>
        {/* Warning zones */}
        <div
          className="absolute top-0 bottom-0 bg-amber-100"
          style={{ left: `${warnLow}%`, width: `${Math.max(0, safeStart - warnLow)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 bg-amber-100"
          style={{ left: `${safeEnd}%`, width: `${Math.max(0, warnHigh - safeEnd)}%` }}
        />
        {/* Safe zone */}
        <div
          className="absolute top-0 bottom-0 bg-emerald-100"
          style={{ left: `${safeStart}%`, width: `${Math.max(0, safeEnd - safeStart)}%` }}
        />
        {/* Marker */}
        <div
          className="absolute top-0 bottom-0 transition-all duration-500 ease-out"
          style={{ left: `${markerPos}%` }}
        >
          {/* Marker line */}
          <div className={`absolute top-0 bottom-0 w-0.5 ${markerColor}`} />
          {/* Marker dot */}
          <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2
            ${compact ? 'w-3 h-3' : 'w-4 h-4'} rounded-full ${markerColor}
            ring-2 ring-white shadow-sm`}
          />
          {/* Value label above */}
          {!compact && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2
              text-[11px] font-bold whitespace-nowrap"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {value.toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* Scale labels */}
      {!compact && (
        <div className="flex justify-between mt-1 text-[10px] text-gray-400"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <span>{displayMin.toFixed(0)}</span>
          <span>{min.toFixed(0)}</span>
          <span>{(standard.drc_standard ?? ((min + max) / 2)).toFixed(0)}</span>
          <span>{max.toFixed(0)}</span>
          <span>{displayMax.toFixed(0)}</span>
        </div>
      )}

      {/* Zone legend */}
      {!compact && (
        <div className="flex items-center justify-center gap-3 mt-1.5 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-200" /> Không đạt
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-200" /> Cảnh báo
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-200" /> Đạt
          </span>
        </div>
      )}
    </div>
  )
}

/** Standard Info — hiển thị ngưỡng QC */
const StandardInfo: React.FC<{
  standard: QCStandard
  evaluation?: QCEvaluation | null
}> = ({ standard, evaluation }) => (
  <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
    <span>
      Chuẩn: <strong className="text-gray-700 font-mono">
        {standard.drc_standard ?? '—'}%
      </strong>
    </span>
    <span className="text-gray-300">|</span>
    <span>
      Khoảng: <strong className="text-gray-700 font-mono">
        {standard.drc_min ?? '—'}–{standard.drc_max ?? '—'}%
      </strong>
    </span>
    {evaluation?.next_recheck_days && (
      <>
        <span className="text-gray-300">|</span>
        <span className="flex items-center gap-0.5">
          <Clock className="w-3 h-3" />
          Tái kiểm: {evaluation.next_recheck_days} ngày
        </span>
      </>
    )}
  </div>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const QCInputForm: React.FC<QCInputFormProps> = ({
  material_id,
  onChange,
  standard: externalStandard,
  initialDRC,
  label = 'Kiểm tra chất lượng (QC)',
  required = true,
  showNotes = true,
  showAdvanced = true,
  compact = false,
  disabled = false,
  className = '',
}) => {
  // State
  const [loadingStd, setLoadingStd] = useState(false)
  const [fetchedStandard, setFetchedStandard] = useState<QCStandard | null>(null)
  const [drcValue, setDrcValue] = useState(initialDRC?.toString() || '')
  const [priValue, setPriValue] = useState('')
  const [mooneyValue, setMooneyValue] = useState('')
  const [ashContent, setAshContent] = useState('')
  const [nitrogenContent, setNitrogenContent] = useState('')
  const [notes, setNotes] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [shakeError, setShakeError] = useState(false)

  // Resolved standard: external > fetched > default
  const standard = useMemo<QCStandard>(() => {
    if (externalStandard) return externalStandard
    if (fetchedStandard) return fetchedStandard
    return DEFAULT_STANDARD
  }, [externalStandard, fetchedStandard])

  const isDefaultStandard = !externalStandard && !fetchedStandard

  // ------------------------------------------------------------------
  // LOAD STANDARD from DB when material_id changes
  // ------------------------------------------------------------------
  useEffect(() => {
    if (externalStandard !== undefined || !material_id) return

    let cancelled = false
    const load = async () => {
      setLoadingStd(true)
      try {
        const { data } = await supabase
          .from('material_qc_standards')
          .select('drc_standard, drc_min, drc_max, drc_warning_low, drc_warning_high, recheck_interval_days, recheck_shortened_days')
          .eq('material_id', material_id)
          .maybeSingle()

        if (!cancelled) {
          setFetchedStandard(data || null)
        }
      } catch (err) {
        console.error('QCInputForm: load standard error', err)
      } finally {
        if (!cancelled) setLoadingStd(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [material_id, externalStandard])

  // Reset form when material changes
  useEffect(() => {
    setDrcValue(initialDRC?.toString() || '')
    setPriValue('')
    setMooneyValue('')
    setAshContent('')
    setNitrogenContent('')
    setNotes('')
    setAdvancedOpen(false)
  }, [material_id, initialDRC])

  // ------------------------------------------------------------------
  // EVALUATION (realtime)
  // ------------------------------------------------------------------
  const drcNum = parseFloat(drcValue)
  const isValidDRC = !isNaN(drcNum) && drcNum > 0 && drcNum <= 100

  const evaluation = useMemo<QCEvaluation | null>(() => {
    if (!isValidDRC) return null
    return evaluateDRC(drcNum, standard)
  }, [isValidDRC, drcNum, standard])

  // Shake animation on failed
  useEffect(() => {
    if (evaluation?.result === 'failed') {
      setShakeError(true)
      const timer = setTimeout(() => setShakeError(false), 500)
      return () => clearTimeout(timer)
    }
  }, [evaluation?.result])

  // ------------------------------------------------------------------
  // NOTIFY PARENT (onChange)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!onChange) return

    if (!isValidDRC || !evaluation) {
      onChange(null)
      return
    }

    const formData: QCFormData = {
      drc_value: drcNum,
      pri_value: parseFloat(priValue) || undefined,
      mooney_value: parseFloat(mooneyValue) || undefined,
      ash_content: parseFloat(ashContent) || undefined,
      nitrogen_content: parseFloat(nitrogenContent) || undefined,
      qc_result: evaluation.result,
      qc_message: evaluation.message,
      notes: notes || undefined,
    }
    onChange(formData)
  }, [drcNum, priValue, mooneyValue, ashContent, nitrogenContent, notes, evaluation, isValidDRC])

  // ------------------------------------------------------------------
  // INPUT BORDER COLOR based on evaluation result
  // ------------------------------------------------------------------
  const inputBorderClass = useMemo(() => {
    if (!evaluation) return 'border-gray-200 focus-within:border-[#2D8B6E] focus-within:ring-[#2D8B6E]/20'
    switch (evaluation.result) {
      case 'failed':
        return 'border-red-300 focus-within:border-red-400 focus-within:ring-red-200'
      case 'warning':
        return 'border-amber-300 focus-within:border-amber-400 focus-within:ring-amber-200'
      case 'passed':
        return 'border-emerald-300 focus-within:border-emerald-400 focus-within:ring-emerald-200'
    }
  }, [evaluation])

  const inputTextClass = useMemo(() => {
    if (!evaluation) return 'text-gray-900'
    switch (evaluation.result) {
      case 'failed': return 'text-red-700'
      case 'warning': return 'text-amber-700'
      case 'passed': return 'text-emerald-700'
    }
  }, [evaluation])

  // ------------------------------------------------------------------
  // RENDER: NO MATERIAL
  // ------------------------------------------------------------------
  if (!material_id) {
    return (
      <div className={`rounded-xl border border-dashed border-gray-300 p-4 text-center ${className}`}>
        <FlaskConical className="w-6 h-6 text-gray-300 mx-auto mb-1" />
        <p className="text-xs text-gray-400">Chọn sản phẩm để nhập QC</p>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <div className={`space-y-3 ${className}`}>
      {/* ── Label ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-[#1B4D3E]" />
          <span className="text-sm font-semibold text-gray-700">{label}</span>
          {required && <span className="text-red-500 text-xs">*</span>}
        </div>
        {evaluation && <QCBadge result={evaluation.result} />}
      </div>

      {/* ── Loading standard ── */}
      {loadingStd && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Đang tải ngưỡng QC...
        </div>
      )}

      {/* ── DRC Input ── */}
      <div className={shakeError ? 'animate-shake' : ''}>
        <div className={`relative rounded-xl border focus-within:ring-1 transition-colors ${inputBorderClass}`}>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="100"
            value={drcValue}
            onChange={e => setDrcValue(e.target.value)}
            placeholder="60.0"
            disabled={disabled}
            className={`w-full min-h-[56px] px-4 py-3 rounded-xl bg-transparent
              text-[22px] font-bold focus:outline-none
              ${inputTextClass}
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          />
          {/* Unit label */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isValidDRC && evaluation && (
              <QCBadge result={evaluation.result} size="sm" />
            )}
            <span className="text-sm text-gray-400 font-medium">%</span>
          </div>
        </div>

        {/* Standard info */}
        {!loadingStd && (
          <div className="mt-1.5 px-0.5">
            <StandardInfo standard={standard} evaluation={evaluation} />
            {isDefaultStandard && (
              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-400">
                <Info className="w-3 h-3" />
                Dùng ngưỡng mặc định (chưa cấu hình cho SP này)
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DRC Gauge ── */}
      {isValidDRC && !loadingStd && (
        <DRCGauge value={drcNum} standard={standard} compact={compact} />
      )}

      {/* ── Evaluation message ── */}
      {isValidDRC && evaluation && !compact && (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[12px]
          ${evaluation.result === 'failed'
            ? 'bg-red-50 text-red-700'
            : evaluation.result === 'warning'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {evaluation.result === 'failed' && <CircleX className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
          {evaluation.result === 'warning' && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
          {evaluation.result === 'passed' && <CircleCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
          <span>{evaluation.message}</span>
        </div>
      )}

      {/* ── Advanced QC inputs (PRI, Mooney, Tro, N₂) ── */}
      {showAdvanced && (
        <>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            disabled={disabled}
            className="flex items-center gap-1.5 text-sm text-gray-500
              active:text-gray-700 transition-colors"
          >
            {advancedOpen
              ? <ChevronUp className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />
            }
            Chỉ số phụ (PRI, Mooney, Tro, N₂)
          </button>

          {advancedOpen && (
            <div className="grid grid-cols-2 gap-3 pl-1">
              {[
                { id: 'pri', label: 'PRI', value: priValue, set: setPriValue, placeholder: '—' },
                { id: 'mooney', label: 'Mooney', value: mooneyValue, set: setMooneyValue, placeholder: '—' },
                { id: 'ash', label: 'Tro (%)', value: ashContent, set: setAshContent, placeholder: '—' },
                { id: 'n2', label: 'N₂ (%)', value: nitrogenContent, set: setNitrogenContent, placeholder: '—' },
              ].map(f => (
                <div key={f.id}>
                  <label className="text-[11px] text-gray-500 mb-1 block font-medium">{f.label}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    disabled={disabled}
                    className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200
                      text-[14px] focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                      disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Notes ── */}
      {showNotes && (
        <div>
          <label className="text-[11px] text-gray-500 mb-1 block font-medium">Ghi chú QC</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ghi chú kiểm tra..."
            disabled={disabled}
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200
              text-[13px] focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      )}

      {/* Shake animation CSS */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
    </div>
  )
}

export default QCInputForm