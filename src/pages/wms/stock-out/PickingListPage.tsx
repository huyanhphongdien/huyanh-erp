// ============================================================================
// FILE: src/pages/wms/stock-out/PickingListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P4 — Bước 4.6 — Trang Picking (NV kho dùng trên mobile)
// ============================================================================
// FLOOR ASSOCIATE VIEW — Task-driven, swipe gestures, haptic feedback
// Design: Manhattan Active WMS Mobile pattern
// Font: Be Vietnam Pro + JetBrains Mono
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft,
  Check,
  X,
  Package,
  MapPin,
  FlaskConical,
  AlertTriangle,
  CircleCheck,
  CircleX,
  Clock,
  Loader2,
  PackageMinus,
  ChevronRight,
  SkipForward,
  RotateCcw,
  Info,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { pickingService } from '../../../services/wms/pickingService'
import stockOutService from '../../../services/wms/stockOutService'
import type { PickingStatus } from '../../../services/wms/wms.types'

// ============================================================================
// TYPES
// ============================================================================

interface PickingDetail {
  id: string
  stock_out_id: string
  material_id: string
  batch_id: string
  location_id: string | null
  quantity: number
  weight: number | null
  picking_status: PickingStatus
  picked_at: string | null
  picked_by: string | null
  notes: string | null
  material: {
    id: string
    sku: string
    name: string
    unit: string
  } | null
  batch: {
    id: string
    batch_no: string
    qc_status: string
    latest_drc: number | null
    received_date: string
  } | null
  location: {
    id: string
    code: string
    shelf: string | null
    row_name: string | null
    column_name: string | null
  } | null
}

interface OrderInfo {
  code: string
  status: string
  reason: string
  customer_name: string | null
  warehouse: { code: string; name: string } | null
}

// ============================================================================
// HAPTIC FEEDBACK
// ============================================================================

const haptic = {
  light: () => navigator.vibrate?.(10),
  medium: () => navigator.vibrate?.(25),
  success: () => navigator.vibrate?.([15, 50, 15]),
  warning: () => navigator.vibrate?.([30, 30, 30]),
  error: () => navigator.vibrate?.([50, 30, 50, 30, 50]),
}

// ============================================================================
// QC BADGE
// ============================================================================

const QCBadge: React.FC<{ status: string; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const config: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
    passed: {
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      icon: <CircleCheck className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      label: 'Đạt',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200 text-amber-700',
      icon: <AlertTriangle className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      label: 'Cảnh báo',
    },
    failed: {
      bg: 'bg-red-50 border-red-200 text-red-700',
      icon: <CircleX className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      label: 'Không đạt',
    },
    pending: {
      bg: 'bg-gray-50 border-gray-200 text-gray-500',
      icon: <Clock className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      label: 'Chờ kiểm',
    },
  }
  const c = config[status] || config.pending
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${textSize} font-semibold rounded-full border ${c.bg}`}>
      {c.icon} {c.label}
    </span>
  )
}

// ============================================================================
// PICKING STATUS BADGE
// ============================================================================

const PickingBadge: React.FC<{ status: PickingStatus }> = ({ status }) => {
  const config: Record<string, { bg: string; label: string }> = {
    pending: { bg: 'bg-gray-100 text-gray-500', label: 'Chờ lấy' },
    picking: { bg: 'bg-blue-100 text-blue-700', label: 'Đang lấy' },
    picked: { bg: 'bg-emerald-100 text-emerald-700', label: 'Đã lấy ✓' },
    skipped: { bg: 'bg-orange-100 text-orange-600', label: 'Bỏ qua' },
  }
  const c = config[status] || config.pending
  return (
    <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${c.bg}`}>
      {c.label}
    </span>
  )
}

// ============================================================================
// SWIPEABLE PICKING CARD
// ============================================================================

const SwipeablePickingCard: React.FC<{
  detail: PickingDetail
  index: number
  isActive: boolean
  onPicked: () => void
  onSkipped: () => void
  onUndo: () => void
  disabled: boolean
}> = ({ detail, index, isActive, onPicked, onSkipped, onUndo, disabled }) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [translateX, setTranslateX] = useState(0)
  const [swiping, setSwiping] = useState(false)

  const isPicked = detail.picking_status === 'picked'
  const isSkipped = detail.picking_status === 'skipped'
  const isDone = isPicked || isSkipped
  const canSwipe = !isDone && !disabled

  // Build location string
  const locationStr = detail.location
    ? [
        detail.location.shelf ? `Kệ ${detail.location.shelf}` : null,
        detail.location.row_name ? `Hàng ${detail.location.row_name}` : null,
        detail.location.column_name ? `Ô ${detail.location.column_name}` : null,
      ].filter(Boolean).join(' · ') || detail.location.code
    : null

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!canSwipe) return
    setTouchStartX(e.touches[0].clientX)
    setSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!canSwipe || touchStartX === null) return
    const dx = e.touches[0].clientX - touchStartX
    // Giới hạn kéo: -120 → +120
    const clamped = Math.max(-120, Math.min(120, dx))
    setTranslateX(clamped)
  }

  const handleTouchEnd = () => {
    if (!canSwipe || touchStartX === null) {
      setSwiping(false)
      return
    }

    const threshold = 80

    if (translateX > threshold) {
      // Swipe RIGHT → Đã lấy
      haptic.success()
      onPicked()
    } else if (translateX < -threshold) {
      // Swipe LEFT → Bỏ qua
      haptic.warning()
      onSkipped()
    }

    setTranslateX(0)
    setTouchStartX(null)
    setSwiping(false)
  }

  // Background hints khi swipe
  const showPickedHint = translateX > 40
  const showSkipHint = translateX < -40

  return (
    <div className="relative overflow-hidden rounded-xl mb-3">
      {/* Background layers — visible khi swipe */}
      {canSwipe && (
        <>
          {/* Swipe right = Đã lấy (green) */}
          <div className={`absolute inset-0 bg-emerald-500 rounded-xl flex items-center pl-5
            transition-opacity duration-100 ${showPickedHint ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <CircleCheck className="w-6 h-6" />
              Đã lấy
            </div>
          </div>
          {/* Swipe left = Bỏ qua (orange) */}
          <div className={`absolute inset-0 bg-orange-400 rounded-xl flex items-center justify-end pr-5
            transition-opacity duration-100 ${showSkipHint ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              Bỏ qua
              <SkipForward className="w-6 h-6" />
            </div>
          </div>
        </>
      )}

      {/* Card */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`
          relative bg-white rounded-xl border shadow-sm
          transition-transform ${swiping ? 'duration-0' : 'duration-200'}
          ${isActive && !isDone
            ? 'border-[#2D8B6E] ring-2 ring-[#2D8B6E]/20 border-l-4 border-l-[#2D8B6E]'
            : isPicked
              ? 'border-emerald-200 bg-emerald-50/30 border-l-4 border-l-emerald-400'
              : isSkipped
                ? 'border-orange-200 bg-orange-50/30 border-l-4 border-l-orange-300'
                : 'border-gray-100 border-l-4 border-l-gray-200'}
          ${isDone ? 'opacity-70' : ''}
        `}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        <div className="p-4">
          {/* Row 1: Index + Batch No + Status */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${
                isDone ? 'text-gray-400' : 'text-gray-500'
              }`}>#{index + 1}</span>
              <span className={`text-[15px] font-bold ${
                isPicked ? 'text-emerald-700 line-through' :
                isSkipped ? 'text-orange-500 line-through' :
                'text-gray-900'
              }`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {detail.batch?.batch_no || '—'}
              </span>
            </div>
            <PickingBadge status={detail.picking_status} />
          </div>

          {/* Row 2: Material */}
          <p className={`text-[13px] mb-2 ${isDone ? 'text-gray-400' : 'text-gray-700'}`}>
            <Package className="w-3.5 h-3.5 inline mr-1" />
            {detail.material?.sku} — {detail.material?.name}
          </p>

          {/* Row 3: Location + Quantity */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[12px]">
              {locationStr && (
                <span className={`flex items-center gap-1 ${isDone ? 'text-gray-300' : 'text-gray-500'}`}>
                  <MapPin className="w-3 h-3" />
                  {locationStr}
                </span>
              )}
              {detail.batch?.latest_drc != null && (
                <span className={`flex items-center gap-1 ${isDone ? 'text-gray-300' : 'text-gray-500'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <FlaskConical className="w-3 h-3" />
                  {detail.batch.latest_drc.toFixed(1)}%
                </span>
              )}
              <QCBadge status={detail.batch?.qc_status || 'pending'} />
            </div>
          </div>

          {/* Row 4: Big quantity — prominent for warehouse staff */}
          <div className={`mt-3 flex items-end justify-between ${
            isDone ? 'opacity-50' : ''
          }`}>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Số lượng cần lấy</p>
              <p className={`text-2xl font-bold ${
                isPicked ? 'text-emerald-600' :
                isSkipped ? 'text-orange-400' :
                'text-[#1B4D3E]'
              }`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {detail.quantity.toLocaleString('vi-VN')}
                <span className="text-sm font-normal text-gray-400 ml-1">
                  {detail.material?.unit || 'kg'}
                </span>
              </p>
            </div>
            {detail.batch?.received_date && (
              <span className="text-[11px] text-gray-400">
                Nhập {new Date(detail.batch.received_date).toLocaleDateString('vi-VN')}
              </span>
            )}
          </div>

          {/* Active card: swipe hint */}
          {isActive && !isDone && (
            <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-gray-400 py-1">
              <span className="flex items-center gap-1">
                ← Bỏ qua
              </span>
              <span className="w-px h-3 bg-gray-200" />
              <span className="flex items-center gap-1">
                Đã lấy →
              </span>
            </div>
          )}

          {/* Undo button for done items */}
          {isDone && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                haptic.light()
                onUndo()
              }}
              className="mt-2 flex items-center gap-1.5 text-[12px] text-gray-400
                active:text-gray-600 py-1"
            >
              <RotateCcw className="w-3 h-3" />
              Hoàn tác
            </button>
          )}
        </div>

        {/* Desktop fallback: buttons (khi không swipe được) */}
        {isActive && !isDone && (
          <div className="hidden md:flex border-t border-gray-100 divide-x divide-gray-100">
            <button
              onClick={() => { haptic.warning(); onSkipped() }}
              className="flex-1 min-h-[48px] flex items-center justify-center gap-2
                text-[13px] font-medium text-orange-600 active:bg-orange-50 transition-colors"
            >
              <SkipForward className="w-4 h-4" />
              Bỏ qua
            </button>
            <button
              onClick={() => { haptic.success(); onPicked() }}
              className="flex-1 min-h-[48px] flex items-center justify-center gap-2
                text-[13px] font-bold text-emerald-700 active:bg-emerald-50 transition-colors"
            >
              <CircleCheck className="w-4 h-4" />
              Đã lấy
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const PickingListPage: React.FC = () => {
  const navigate = useNavigate()
  const { id: stockOutId } = useParams<{ id: string }>()

  // Data
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null)
  const [details, setDetails] = useState<PickingDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null) // detail id đang update
  const [completing, setCompleting] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Load user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
    }
    getUser()
  }, [])

  // Load order + picking details
  const loadData = useCallback(async () => {
    if (!stockOutId) return
    setLoading(true)
    setError(null)

    try {
      // Load order info
      const { data: order, error: orderErr } = await supabase
        .from('stock_out_orders')
        .select(`
          code, status, reason, customer_name,
          warehouse:warehouses(code, name)
        `)
        .eq('id', stockOutId)
        .single()

      if (orderErr) throw orderErr
      setOrderInfo(order as unknown as OrderInfo)

      // Load picking details
      const pickingDetails = await pickingService.getPickingDetails(stockOutId)
      setDetails(pickingDetails as unknown as PickingDetail[])
    } catch (err: any) {
      console.error('Lỗi tải dữ liệu picking:', err)
      setError(err.message || 'Không thể tải danh sách picking')
    } finally {
      setLoading(false)
    }
  }, [stockOutId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Progress
  const totalItems = details.length
  const pickedItems = details.filter(d => d.picking_status === 'picked').length
  const skippedItems = details.filter(d => d.picking_status === 'skipped').length
  const doneItems = pickedItems + skippedItems
  const pendingItems = totalItems - doneItems
  const progressPercent = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0
  const allDone = pendingItems === 0 && totalItems > 0

  // Total quantities
  const totalQty = details.reduce((s, d) => s + d.quantity, 0)
  const pickedQty = details
    .filter(d => d.picking_status === 'picked')
    .reduce((s, d) => s + d.quantity, 0)

  // Find first active (pending/picking) item
  const activeIndex = details.findIndex(
    d => d.picking_status === 'pending' || d.picking_status === 'picking'
  )

  // Update picking status
  const handleUpdateStatus = async (detailId: string, status: PickingStatus) => {
    setUpdating(detailId)
    try {
      await pickingService.updatePickingStatus(detailId, status, currentUserId || undefined)
      // Optimistic update
      setDetails(prev =>
        prev.map(d =>
          d.id === detailId
            ? {
                ...d,
                picking_status: status,
                picked_at: status === 'picked' ? new Date().toISOString() : null,
                picked_by: status === 'picked' ? currentUserId : null,
              }
            : d
        )
      )
    } catch (err: any) {
      console.error('Lỗi cập nhật:', err)
      haptic.error()
      setError(err.message)
    } finally {
      setUpdating(null)
    }
  }

  // Complete picking → navigate back
  const handleCompletePicking = async () => {
    if (!allDone || !stockOutId) return
    setCompleting(true)
    setError(null)

    try {
      // Update order status to 'picked' if needed
      await supabase
        .from('stock_out_orders')
        .update({
          status: 'picked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', stockOutId)

      haptic.success()
      // Navigate to detail page
      navigate(`/wms/stock-out/${stockOutId}`)
    } catch (err: any) {
      console.error('Lỗi hoàn tất:', err)
      setError(err.message)
      haptic.error()
    } finally {
      setCompleting(false)
    }
  }

  // ========================================================================
  // LOADING
  // ========================================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#2D8B6E] animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Đang tải picking list...</p>
        </div>
      </div>
    )
  }

  // ========================================================================
  // ERROR
  // ========================================================================
  if (!orderInfo || details.length === 0) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center p-6"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <div className="text-center max-w-sm">
          <PackageMinus className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm mb-4">
            {error || 'Không tìm thấy phiếu xuất hoặc chưa có dữ liệu picking'}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="min-h-[48px] px-6 bg-[#2D8B6E] text-white font-bold rounded-xl
              active:scale-[0.97] transition-transform text-[14px]"
          >
            Quay lại
          </button>
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <div className="min-h-screen bg-[#F7F5F2] pb-24"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>

      {/* STICKY HEADER */}
      <div className="sticky top-0 z-30 bg-[#1B4D3E] text-white">
        {/* Top bar */}
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(`/wms/stock-out/${stockOutId}`)}
            className="p-2 -ml-2 text-white/70 active:text-white active:scale-90 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold truncate"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {orderInfo.code}
            </p>
            <p className="text-[11px] text-white/60">
              {orderInfo.warehouse?.code} · {REASON_LABELS[orderInfo.reason as keyof typeof REASON_LABELS] || orderInfo.reason}
              {orderInfo.customer_name && ` · ${orderInfo.customer_name}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {doneItems}/{totalItems}
            </p>
            <p className="text-[10px] text-white/50 uppercase tracking-wider">Hoàn thành</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-3">
          <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: allDone ? '#16A34A' : '#E8A838',
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[11px] text-white/50">
            <span>
              Đã lấy: {pickedQty.toLocaleString('vi-VN')} / {totalQty.toLocaleString('vi-VN')}
            </span>
            <span>
              {progressPercent}%
              {skippedItems > 0 && ` · ${skippedItems} bỏ qua`}
            </span>
          </div>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="px-4 pt-3">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <span className="text-sm text-red-700 flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* INSTRUCTION HINT */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 text-[12px] text-gray-400">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Vuốt phải = <strong className="text-emerald-600">Đã lấy</strong> · Vuốt trái = <strong className="text-orange-500">Bỏ qua</strong></span>
        </div>
      </div>

      {/* PICKING LIST */}
      <div className="px-4 pt-2">
        {details.map((detail, i) => (
          <SwipeablePickingCard
            key={detail.id}
            detail={detail}
            index={i}
            isActive={i === activeIndex}
            disabled={updating !== null}
            onPicked={() => handleUpdateStatus(detail.id, 'picked')}
            onSkipped={() => handleUpdateStatus(detail.id, 'skipped')}
            onUndo={() => handleUpdateStatus(detail.id, 'pending')}
          />
        ))}
      </div>

      {/* ALL DONE CELEBRATION */}
      {allDone && (
        <div className="px-4 py-6 text-center"
          style={{ animation: 'fadeIn 300ms ease-out' }}>
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <CircleCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-gray-900 mb-1">Picking hoàn tất!</p>
          <p className="text-sm text-gray-500">
            Đã lấy {pickedQty.toLocaleString('vi-VN')} từ {pickedItems} lô
            {skippedItems > 0 && ` · ${skippedItems} lô bỏ qua`}
          </p>
        </div>
      )}

      {/* BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex gap-3">
          <button
            onClick={() => navigate(`/wms/stock-out/${stockOutId}`)}
            className="min-h-[48px] px-4 text-[14px] font-medium text-gray-600
              rounded-xl border border-gray-200 active:scale-[0.97] transition-transform"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleCompletePicking}
            disabled={!allDone || completing}
            className={`flex-1 min-h-[56px] inline-flex items-center justify-center gap-2
              text-[15px] font-bold text-white rounded-xl
              active:scale-[0.97] transition-transform
              ${allDone && !completing
                ? 'bg-[#2D8B6E] shadow-[0_2px_12px_rgba(45,139,110,0.3)]'
                : 'bg-gray-300 cursor-not-allowed'}`}
          >
            {completing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-5 h-5" />
            )}
            {completing ? 'Đang xử lý...' :
              allDone ? 'Hoàn tất Picking' :
              `Còn ${pendingItems} lô chưa lấy`}
          </button>
        </div>
      </div>

      {/* ANIMATIONS */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REASON_LABELS = {
  sale: 'Bán hàng',
  production: 'Sản xuất',
  transfer: 'Chuyển kho',
  blend: 'Phối trộn',
  adjust: 'Điều chỉnh',
  return: 'Trả hàng',
} as const

export default PickingListPage