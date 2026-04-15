// ============================================================================
// PICKING LIST PAGE — Ant Design + Custom Swipe Gesture
// File: src/pages/wms/stock-out/PickingListPage.tsx
// Rewrite: Tailwind -> Ant Design v6, keep swipe-to-pick gesture
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Tag,
  Typography,
  Spin,
  Progress,
  Space,
  Alert,
  Result,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  LoadingOutlined,
  UndoOutlined,
  ForwardOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import { pickingService } from '../../../services/wms/pickingService'
import stockOutService from '../../../services/wms/stockOutService'
import type { PickingStatus } from '../../../services/wms/wms.types'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { RubberGrade } from '../../../services/wms/wms.types'

const { Text } = Typography

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
    rubber_grade: RubberGrade | null
    dry_weight: number | null
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

const QC_TAG_CONFIG: Record<string, { color: string; label: string }> = {
  passed: { color: 'success', label: 'Đạt' },
  warning: { color: 'warning', label: 'Cảnh báo' },
  failed: { color: 'error', label: 'Không đạt' },
  pending: { color: 'default', label: 'Chờ kiểm' },
}

const PICKING_TAG_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: 'Chờ lấy' },
  picking: { color: 'processing', label: 'Đang lấy' },
  picked: { color: 'success', label: 'Đã lấy' },
  skipped: { color: 'orange', label: 'Bỏ qua' },
}

const monoStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

// ============================================================================
// SWIPEABLE PICKING CARD — Custom DOM interaction preserved
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
        detail.location.shelf ? `Ke ${detail.location.shelf}` : null,
        detail.location.row_name ? `Hang ${detail.location.row_name}` : null,
        detail.location.column_name ? `O ${detail.location.column_name}` : null,
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
      haptic.success()
      onPicked()
    } else if (translateX < -threshold) {
      haptic.warning()
      onSkipped()
    }

    setTranslateX(0)
    setTouchStartX(null)
    setSwiping(false)
  }

  const showPickedHint = translateX > 40
  const showSkipHint = translateX < -40

  // Card border color
  const borderColor = isActive && !isDone
    ? '#2D8B6E'
    : isPicked
      ? '#52c41a'
      : isSkipped
        ? '#fa8c16'
        : '#f0f0f0'

  const bgColor = isPicked
    ? 'rgba(82,196,26,0.04)'
    : isSkipped
      ? 'rgba(250,140,22,0.04)'
      : '#fff'

  const qcCfg = QC_TAG_CONFIG[detail.batch?.qc_status || 'pending'] || QC_TAG_CONFIG.pending

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, marginBottom: 12 }}>
      {/* Background layers — visible during swipe */}
      {canSwipe && (
        <>
          {/* Swipe right = Picked (green) */}
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: '#52c41a', borderRadius: 12,
            display: 'flex', alignItems: 'center', paddingLeft: 20,
            opacity: showPickedHint ? 1 : 0, transition: 'opacity 100ms',
          }}>
            <Space style={{ color: '#fff', fontWeight: 700 }}>
              <CheckCircleOutlined style={{ fontSize: 24 }} />
              Đã lấy
            </Space>
          </div>
          {/* Swipe left = Skip (orange) */}
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: '#fa8c16', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 20,
            opacity: showSkipHint ? 1 : 0, transition: 'opacity 100ms',
          }}>
            <Space style={{ color: '#fff', fontWeight: 700 }}>
              Bỏ qua
              <ForwardOutlined style={{ fontSize: 24 }} />
            </Space>
          </div>
        </>
      )}

      {/* Card */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'relative',
          backgroundColor: bgColor,
          borderRadius: 12,
          border: `2px solid ${borderColor}`,
          borderLeft: `4px solid ${borderColor}`,
          boxShadow: isActive && !isDone ? '0 0 0 3px rgba(45,139,110,0.15)' : '0 1px 2px rgba(0,0,0,0.05)',
          transform: `translateX(${translateX}px)`,
          transition: swiping ? 'none' : 'transform 200ms ease',
          opacity: isDone ? 0.7 : 1,
          padding: 16,
        }}
      >
        {/* Row 1: Index + Batch No + Grade + Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Space>
            <Text type="secondary" strong style={{ fontSize: 12 }}>#{index + 1}</Text>
            <Text
              strong
              style={{
                ...monoStyle,
                fontSize: 15,
                color: isPicked ? '#52c41a' : isSkipped ? '#fa8c16' : '#1B4D3E',
                textDecoration: isDone ? 'line-through' : 'none',
              }}
            >
              {detail.batch?.batch_no || '—'}
            </Text>
            <GradeBadge grade={detail.batch?.rubber_grade} size="small" />
          </Space>
          <Tag color={PICKING_TAG_CONFIG[detail.picking_status]?.color || 'default'}>
            {PICKING_TAG_CONFIG[detail.picking_status]?.label || 'Chờ lấy'}
          </Tag>
        </div>

        {/* Row 2: Material */}
        <Text style={{ fontSize: 13, color: isDone ? '#bfbfbf' : '#595959' }}>
          {detail.material?.sku} — {detail.material?.name}
        </Text>

        {/* Row 3: Location + DRC + QC */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 12 }}>
          {locationStr && (
            <Text type={isDone ? 'secondary' : undefined} style={{ fontSize: 12 }}>
              {locationStr}
            </Text>
          )}
          {detail.batch?.latest_drc != null && (
            <Text style={{ ...monoStyle, fontSize: 12, color: isDone ? '#bfbfbf' : '#595959' }}>
              <ExperimentOutlined style={{ marginRight: 4 }} />
              {detail.batch.latest_drc.toFixed(1)}%
            </Text>
          )}
          {detail.batch?.dry_weight != null && (
            <Text style={{ ...monoStyle, fontSize: 12, color: isDone ? '#bfbfbf' : '#8c8c8c' }}>
              KL kho: {detail.batch.dry_weight.toLocaleString('vi-VN')} kg
            </Text>
          )}
          <Tag color={qcCfg.color} style={{ fontSize: 11 }}>{qcCfg.label}</Tag>
        </div>

        {/* Row 4: Big quantity */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', opacity: isDone ? 0.5 : 1 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              Số lượng cần lấy
            </Text>
            <div>
              <Text
                strong
                style={{
                  ...monoStyle,
                  fontSize: 28,
                  color: isPicked ? '#52c41a' : isSkipped ? '#fa8c16' : '#1B4D3E',
                }}
              >
                {detail.quantity.toLocaleString('vi-VN')}
              </Text>
              <Text type="secondary" style={{ marginLeft: 4 }}>
                {detail.material?.unit || 'kg'}
              </Text>
            </div>
          </div>
          {detail.batch?.received_date && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Nhập {new Date(detail.batch.received_date).toLocaleDateString('vi-VN')}
            </Text>
          )}
        </div>

        {/* Active card: swipe hint */}
        {isActive && !isDone && (
          <div style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            fontSize: 11,
            color: '#bfbfbf',
            paddingTop: 4,
          }}>
            <span>&#8592; Bỏ qua</span>
            <span style={{ width: 1, height: 12, backgroundColor: '#e8e8e8', display: 'inline-block' }} />
            <span>Đã lấy &#8594;</span>
          </div>
        )}

        {/* Undo button for done items */}
        {isDone && (
          <Button
            type="text"
            size="small"
            icon={<UndoOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              haptic.light()
              onUndo()
            }}
            style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}
          >
            Hoàn tác
          </Button>
        )}

        {/* Desktop fallback: buttons */}
        {isActive && !isDone && (
          <div
            className="hidden md:flex"
            style={{
              marginTop: 12,
              borderTop: '1px solid #f0f0f0',
              paddingTop: 12,
              display: 'none', // hidden on mobile, visible on md+
              gap: 8,
            }}
          >
            <Button
              onClick={() => { haptic.warning(); onSkipped() }}
              icon={<ForwardOutlined />}
              style={{ flex: 1, color: '#fa8c16', borderColor: '#fa8c16' }}
            >
              Bỏ qua
            </Button>
            <Button
              type="primary"
              onClick={() => { haptic.success(); onPicked() }}
              icon={<CheckCircleOutlined />}
              style={{ flex: 1, backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              Đã lấy
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PickingListPageProps {
  stockOutId?: string
}

const PickingListPage: React.FC<PickingListPageProps> = ({ stockOutId: propStockOutId }) => {
  const navigate = useNavigate()
  const { id: paramStockOutId } = useParams<{ id: string }>()
  const stockOutId = propStockOutId || paramStockOutId

  // Data
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null)
  const [details, setDetails] = useState<PickingDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
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

      const pickingDetails = await pickingService.getPickingDetails(stockOutId)
      setDetails(pickingDetails as unknown as PickingDetail[])
    } catch (err: any) {
      console.error('Loi tai du lieu picking:', err)
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

  // Find first active item
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
      console.error('Loi cap nhat:', err)
      haptic.error()
      setError(err.message)
    } finally {
      setUpdating(null)
    }
  }

  // Complete picking
  const handleCompletePicking = async () => {
    if (!allDone || !stockOutId) return
    setCompleting(true)
    setError(null)

    try {
      await supabase
        .from('stock_out_orders')
        .update({
          status: 'picked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', stockOutId)

      haptic.success()
      navigate(`/wms/stock-out/${stockOutId}`)
    } catch (err: any) {
      console.error('Loi hoan tat:', err)
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Spin size="large" tip="Đang tải picking list..." />
      </div>
    )
  }

  // ========================================================================
  // ERROR / EMPTY
  // ========================================================================
  if (!orderInfo || details.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Result
          status="info"
          title={error || 'Không tìm thấy phiếu xuất hoặc chưa có dữ liệu picking'}
          extra={
            <Button
              type="primary"
              onClick={() => navigate(-1)}
              style={{ backgroundColor: '#2D8B6E', borderColor: '#2D8B6E' }}
            >
              Quay lại
            </Button>
          }
        />
      </div>
    )
  }

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F5F2', paddingBottom: 100 }}>

      {/* STICKY HEADER */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        backgroundColor: '#1B4D3E',
        color: '#fff',
      }}>
        {/* Top bar */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/wms/stock-out/${stockOutId}`)}
            style={{ color: 'rgba(255,255,255,0.7)' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...monoStyle, fontSize: 15, fontWeight: 700 }}>
              {orderInfo.code}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              {orderInfo.warehouse?.code} · {REASON_LABELS[orderInfo.reason as keyof typeof REASON_LABELS] || orderInfo.reason}
              {orderInfo.customer_name && ` · ${orderInfo.customer_name}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...monoStyle, fontSize: 22, fontWeight: 700 }}>
              {doneItems}/{totalItems}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Hoàn thành
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ padding: '0 16px 12px' }}>
          <Progress
            percent={progressPercent}
            showInfo={false}
            strokeColor={allDone ? '#16A34A' : '#E8A838'}
            trailColor="rgba(255,255,255,0.1)"
            size={['100%', 10]}
            style={{ margin: 0 }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
          }}>
            <span style={monoStyle}>
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
        <div style={{ padding: '12px 16px 0' }}>
          <Alert
            message={error}
            type="error"
            closable
            onClose={() => setError(null)}
          />
        </div>
      )}

      {/* INSTRUCTION HINT */}
      <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#bfbfbf' }}>
        <InfoCircleOutlined />
        <span>
          Vuốt phải = <strong style={{ color: '#52c41a' }}>Đã lấy</strong> · Vuốt trái = <strong style={{ color: '#fa8c16' }}>Bỏ qua</strong>
        </span>
      </div>

      {/* PICKING LIST */}
      <div style={{ padding: '8px 16px' }}>
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
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            backgroundColor: 'rgba(82,196,26,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />
          </div>
          <Text strong style={{ fontSize: 18 }}>Picking hoàn tất!</Text>
          <div>
            <Text type="secondary">
              Đã lấy {pickedQty.toLocaleString('vi-VN')} từ {pickedItems} lô
              {skippedItems > 0 && ` · ${skippedItems} lô bỏ qua`}
            </Text>
          </div>
        </div>
      )}

      {/* BOTTOM ACTION BAR */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTop: '1px solid #f0f0f0',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
        zIndex: 20,
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '12px 16px', display: 'flex', gap: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/wms/stock-out/${stockOutId}`)}
            size="large"
          />
          <Button
            type="primary"
            size="large"
            block
            onClick={handleCompletePicking}
            disabled={!allDone || completing}
            loading={completing}
            icon={!completing ? <CheckCircleOutlined /> : undefined}
            style={{
              height: 56,
              fontSize: 15,
              fontWeight: 700,
              ...(allDone && !completing
                ? { backgroundColor: '#2D8B6E', borderColor: '#2D8B6E' }
                : {}),
            }}
          >
            {completing ? 'Đang xử lý...' :
              allDone ? 'Hoàn tất Picking' :
              `Còn ${pendingItems} lô chưa lấy`}
          </Button>
        </div>
      </div>

      {/* Desktop fallback styles */}
      <style>{`
        @media (min-width: 768px) {
          .hidden.md\\:flex { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

export default PickingListPage
