// ============================================================================
// FILE: src/pages/wms/weighbridge/WeighbridgePage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Sprint 7B — Trang cân xe chính (Core Weighing Interface)
// ============================================================================
// KẾT NỐI SUPABASE THẬT — không dùng mock data
// Design: Industrial Mobile-First, Tablet-optimized (48px+ touch targets)
// ============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Scale,
  Truck,
  Camera,
  Check,
  X,
  Printer,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Weight,
  User,
  FileText,
  Link2,
  Unlink,
  History,
  Zap,
  Eye,
  Trash2,
  Plus,
  ImageIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import weighbridgeService, { type CreateTicketData } from '../../../services/wms/weighbridgeService'
import weighbridgeImageService, { type CaptureType } from '../../../services/wms/weighbridgeImageService'
import { CameraGrid } from '../../../components/wms/CameraFeed'
import type { WeighbridgeTicket, WeighbridgeImage, TicketType, WeighbridgeStatus } from '../../../services/wms/wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<WeighbridgeStatus, { label: string; color: string; bg: string }> = {
  weighing_gross: { label: 'Chờ cân lần 1', color: 'text-blue-700', bg: 'bg-blue-100' },
  weighing_tare: { label: 'Chờ cân lần 2', color: 'text-amber-700', bg: 'bg-amber-100' },
  completed: { label: 'Hoàn tất', color: 'text-green-700', bg: 'bg-green-100' },
  cancelled: { label: 'Đã hủy', color: 'text-red-700', bg: 'bg-red-100' },
}

const TICKET_TYPE_OPTIONS: { value: TicketType; label: string; icon: string }[] = [
  { value: 'in', label: 'Xe vào (Nhập)', icon: '📥' },
  { value: 'out', label: 'Xe ra (Xuất)', icon: '📤' },
]

const REFERENCE_TYPES = [
  { value: '', label: 'Không liên kết' },
  { value: 'stock_in', label: 'Phiếu nhập TP' },
  { value: 'stock_out', label: 'Phiếu xuất TP' },
  { value: 'stock_in_raw', label: 'Nhập NVL' },
  { value: 'purchase_order', label: 'Đơn mua hàng' },
]

// Gateway URL cho RS232 scale reader
const GATEWAY_URL = 'http://localhost:3001'

// ============================================================================
// SCALE GATEWAY HOOK
// ============================================================================

interface ScaleReading {
  weight: number
  unit: string
  stable: boolean
  timestamp: number
}

function useScaleGateway() {
  const [connected, setConnected] = useState(false)
  const [liveWeight, setLiveWeight] = useState<ScaleReading | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(`${GATEWAY_URL.replace('http', 'ws')}/ws`)

      ws.onopen = () => {
        setConnected(true)
        console.log('[Scale] WebSocket connected')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLiveWeight({
            weight: data.weight,
            unit: data.unit || 'kg',
            stable: data.stable ?? true,
            timestamp: Date.now(),
          })
        } catch (e) {
          console.warn('[Scale] Parse error:', e)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        // Auto reconnect after 3s
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        setConnected(false)
        ws.close()
      }

      wsRef.current = ws
    } catch {
      setConnected(false)
    }
  }, [])

  // Fallback: HTTP poll single reading
  const readOnce = useCallback(async (): Promise<ScaleReading | null> => {
    try {
      const res = await fetch(`${GATEWAY_URL}/weight`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return null
      const data = await res.json()
      return {
        weight: data.weight,
        unit: data.unit || 'kg',
        stable: data.stable ?? true,
        timestamp: Date.now(),
      }
    } catch {
      return null
    }
  }, [])

  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${GATEWAY_URL}/status`, { signal: AbortSignal.timeout(2000) })
      const ok = res.ok
      setConnected(ok)
      return ok
    } catch {
      setConnected(false)
      return false
    }
  }, [])

  useEffect(() => {
    checkStatus().then((ok) => {
      if (ok) connect()
    })
    return () => {
      wsRef.current?.close()
      clearTimeout(reconnectTimer.current)
    }
  }, [])

  return { connected, liveWeight, readOnce, checkStatus, connect }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function WeighbridgePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const userId = user?.employee_id ?? undefined

  // === States ===
  const [mode, setMode] = useState<'idle' | 'create' | 'weighing'>('idle')
  const [ticket, setTicket] = useState<WeighbridgeTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form states
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [ticketType, setTicketType] = useState<TicketType>('in')
  const [referenceType, setReferenceType] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [notes, setNotes] = useState('')

  // Weight input
  const [manualWeight, setManualWeight] = useState('')
  const [weightSource, setWeightSource] = useState<'scale' | 'manual'>('manual')

  // Plate suggestions
  const [plateSuggestions, setPlateSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [tareSuggestion, setTareSuggestion] = useState<{ avgTare: number | null; lastTare: number | null; count: number } | null>(null)

  // Images
  const [images, setImages] = useState<WeighbridgeImage[]>([])
  const [uploading, setUploading] = useState(false)

  // Sections collapse
  const [showCamera, setShowCamera] = useState(false)
  const [showLink, setShowLink] = useState(false)

  // Resume in-progress ticket
  const [inProgressTickets, setInProgressTickets] = useState<WeighbridgeTicket[]>([])

  // Scale gateway
  const scale = useScaleGateway()

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Load in-progress tickets on mount
  useEffect(() => {
    loadInProgress()
  }, [])

  async function loadInProgress() {
    try {
      const result = await weighbridgeService.getAll({
        page: 1,
        pageSize: 10,
        status: 'weighing_gross',
      })
      const result2 = await weighbridgeService.getAll({
        page: 1,
        pageSize: 10,
        status: 'weighing_tare',
      })
      setInProgressTickets([...result.data, ...result2.data])
    } catch { /* ignore */ }
  }

  // Plate autocomplete
  useEffect(() => {
    if (vehiclePlate.length < 2) {
      setPlateSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const plates = await weighbridgeService.getPlateHistory(vehiclePlate, 8)
        setPlateSuggestions(plates)
      } catch { /* ignore */ }
    }, 300)
    return () => clearTimeout(timer)
  }, [vehiclePlate])

  // Tare suggestion when plate changes
  useEffect(() => {
    if (!ticket || ticket.status !== 'weighing_tare') return
    const plate = ticket.vehicle_plate
    if (!plate) return
    weighbridgeService.getSuggestedTare(plate)
      .then(setTareSuggestion)
      .catch(() => setTareSuggestion(null))
  }, [ticket?.status, ticket?.vehicle_plate])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function clearMessages() {
    setError(null)
    setSuccess(null)
  }

  function resetForm() {
    setVehiclePlate('')
    setDriverName('')
    setTicketType('in')
    setReferenceType('')
    setReferenceId('')
    setNotes('')
    setManualWeight('')
    setMode('idle')
    setTicket(null)
    setImages([])
    setTareSuggestion(null)
    clearMessages()
  }

  // --- Create ticket ---
  async function handleCreate() {
    clearMessages()
    if (!vehiclePlate.trim()) {
      setError('Vui lòng nhập biển số xe')
      return
    }

    setLoading(true)
    try {
      const data: CreateTicketData = {
        vehicle_plate: vehiclePlate,
        driver_name: driverName || undefined,
        ticket_type: ticketType,
        reference_type: referenceType || undefined,
        reference_id: referenceId || undefined,
        notes: notes || undefined,
      }
      const newTicket = await weighbridgeService.create(data, userId)
      setTicket(newTicket)
      setMode('weighing')
      setSuccess(`Tạo phiếu ${newTicket.code} thành công`)
    } catch (err: any) {
      setError(err?.message || 'Không thể tạo phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // --- Resume ticket ---
  async function handleResume(t: WeighbridgeTicket) {
    clearMessages()
    setLoading(true)
    try {
      const full = await weighbridgeService.getById(t.id)
      if (full) {
        setTicket(full)
        setImages(full.images || [])
        setMode('weighing')
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể tải phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // --- Record weight ---
  async function handleRecordWeight() {
    if (!ticket) return
    clearMessages()

    let weight: number
    if (weightSource === 'scale' && scale.liveWeight) {
      weight = scale.liveWeight.weight
    } else {
      weight = parseFloat(manualWeight)
    }

    if (isNaN(weight) || weight <= 0) {
      setError('Trọng lượng không hợp lệ')
      return
    }

    setLoading(true)
    try {
      let updated: WeighbridgeTicket
      if (ticket.status === 'weighing_gross') {
        updated = await weighbridgeService.updateGrossWeight(ticket.id, weight, userId)
        setSuccess(`Cân lần 1 (Gross): ${weight.toLocaleString()} kg`)
      } else {
        updated = await weighbridgeService.updateTareWeight(ticket.id, weight, userId)
        setSuccess(`Cân lần 2 (Tare): ${weight.toLocaleString()} kg — NET: ${updated.net_weight?.toLocaleString()} kg`)
      }
      setTicket(updated)
      setManualWeight('')
    } catch (err: any) {
      setError(err?.message || 'Không thể ghi trọng lượng')
    } finally {
      setLoading(false)
    }
  }

  // --- Read from scale ---
  async function handleReadScale() {
    clearMessages()
    const reading = await scale.readOnce()
    if (reading) {
      setManualWeight(String(reading.weight))
      setWeightSource('scale')
      setSuccess(`Đọc từ cân: ${reading.weight} ${reading.unit} ${reading.stable ? '(ổn định)' : '(chưa ổn định)'}`)
    } else {
      setError('Không đọc được từ cân. Vui lòng nhập thủ công.')
      setWeightSource('manual')
    }
  }

  // --- Use tare suggestion ---
  function handleUseTareSuggestion(tare: number) {
    setManualWeight(String(tare))
    setWeightSource('manual')
  }

  // --- Complete ---
  async function handleComplete() {
    if (!ticket) return
    clearMessages()
    setLoading(true)
    try {
      const updated = await weighbridgeService.complete(ticket.id)
      setTicket(updated)
      setSuccess(`Phiếu ${updated.code} hoàn tất — NET: ${updated.net_weight?.toLocaleString()} kg`)
    } catch (err: any) {
      setError(err?.message || 'Không thể hoàn tất phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // --- Cancel ---
  async function handleCancel() {
    if (!ticket) return
    if (!window.confirm('Xác nhận hủy phiếu cân này?')) return
    clearMessages()
    setLoading(true)
    try {
      const updated = await weighbridgeService.cancel(ticket.id, 'Hủy bởi nhân viên cân')
      setTicket(updated)
      setSuccess(`Đã hủy phiếu ${updated.code}`)
    } catch (err: any) {
      setError(err?.message || 'Không thể hủy phiếu')
    } finally {
      setLoading(false)
    }
  }

  // --- Upload image ---
  async function handleUploadImage(captureType: CaptureType) {
    if (!ticket) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const img = await weighbridgeImageService.uploadImage(ticket.id, file, captureType)
        setImages(prev => [...prev, img])
        setSuccess('Đã lưu ảnh')
      } catch (err: any) {
        setError(err?.message || 'Không thể upload ảnh')
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }

  // --- Delete image ---
  async function handleDeleteImage(imgId: string) {
    try {
      await weighbridgeImageService.deleteImage(imgId)
      setImages(prev => prev.filter(i => i.id !== imgId))
    } catch { /* ignore */ }
  }

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const isWeighing = mode === 'weighing' && ticket
  const canRecordWeight = ticket && (ticket.status === 'weighing_gross' || ticket.status === 'weighing_tare')
  const canComplete = ticket && ticket.status === 'weighing_tare' && ticket.net_weight != null
  const isCompleted = ticket?.status === 'completed'
  const isCancelled = ticket?.status === 'cancelled'

  // ============================================================================
  // RENDER: IDLE — Chọn tạo mới hoặc tiếp tục
  // ============================================================================

  if (mode === 'idle') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-[#1B4D3E] text-white px-4 py-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/wms')} className="p-2 -ml-2 rounded-lg hover:bg-white/10 active:bg-white/20">
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Trạm Cân Xe</h1>
              <p className="text-xs text-white/70">Huy Anh Rubber — Weighbridge Station</p>
            </div>
            {/* Scale status */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${scale.connected ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'}`}>
              {scale.connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {scale.connected ? 'Cân online' : 'Cân offline'}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Nút tạo mới */}
          <button
            onClick={() => setMode('create')}
            className="w-full bg-[#1B4D3E] text-white rounded-2xl p-6 flex items-center gap-4 active:bg-[#163f33] transition-colors shadow-lg"
          >
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
              <Plus size={32} />
            </div>
            <div className="text-left">
              <p className="text-lg font-bold">Tạo phiếu cân mới</p>
              <p className="text-sm text-white/70">Xe vào cân — Nhập biển số, chọn loại</p>
            </div>
          </button>

          {/* Phiếu đang dở */}
          {inProgressTickets.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Đang cân dở ({inProgressTickets.length})
              </h2>
              <div className="space-y-3">
                {inProgressTickets.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleResume(t)}
                    className="w-full bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-4 active:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Scale size={24} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{t.vehicle_plate}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[t.status]?.bg} ${STATUS_CONFIG[t.status]?.color}`}>
                          {STATUS_CONFIG[t.status]?.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {t.code} • {t.driver_name || 'Không có tài xế'} • {t.ticket_type === 'in' ? 'Xe vào' : 'Xe ra'}
                      </p>
                      {t.gross_weight && (
                        <p className="text-sm text-blue-600 font-medium">
                          Gross: {t.gross_weight.toLocaleString()} kg
                        </p>
                      )}
                    </div>
                    <ArrowLeft size={18} className="text-gray-400 rotate-180" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Xem lịch sử */}
          <button
            onClick={() => navigate('/wms/weighbridge/list')}
            className="w-full bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-4 active:bg-gray-50 transition-colors"
          >
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <History size={24} className="text-gray-500" />
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold text-gray-900">Lịch sử cân</p>
              <p className="text-sm text-gray-500">Xem phiếu cân đã hoàn tất</p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER: CREATE — Form tạo phiếu cân
  // ============================================================================

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-[#1B4D3E] text-white px-4 py-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={resetForm} className="p-2 -ml-2 rounded-lg hover:bg-white/10 active:bg-white/20">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-lg font-bold flex-1">Tạo phiếu cân mới</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
          {/* Error/Success */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Biển số xe */}
          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Biển số xe <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={vehiclePlate}
              onChange={(e) => {
                setVehiclePlate(e.target.value.toUpperCase())
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="VD: 75C-12345"
              className="w-full h-14 px-4 text-[17px] font-bold tracking-widest bg-white border-2 border-gray-300 rounded-xl focus:border-[#1B4D3E] focus:ring-2 focus:ring-[#1B4D3E]/20 outline-none uppercase"
              autoFocus
            />
            {/* Autocomplete dropdown */}
            {showSuggestions && plateSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {plateSuggestions.map(plate => (
                  <button
                    key={plate}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setVehiclePlate(plate)
                      setShowSuggestions(false)
                    }}
                    className="w-full px-4 py-3 text-left text-[15px] font-medium hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-0"
                  >
                    🚛 {plate}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tài xế */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tài xế</label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="Tên tài xế (tuỳ chọn)"
              className="w-full h-12 px-4 text-[15px] bg-white border border-gray-300 rounded-xl focus:border-[#1B4D3E] focus:ring-2 focus:ring-[#1B4D3E]/20 outline-none"
            />
          </div>

          {/* Loại xe */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Loại</label>
            <div className="grid grid-cols-2 gap-3">
              {TICKET_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTicketType(opt.value)}
                  className={`h-14 rounded-xl border-2 font-semibold text-[15px] flex items-center justify-center gap-2 transition-all
                    ${ticketType === opt.value
                      ? 'border-[#1B4D3E] bg-[#1B4D3E]/5 text-[#1B4D3E]'
                      : 'border-gray-200 bg-white text-gray-600 active:bg-gray-50'
                    }`}
                >
                  <span>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Ghi chú</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú thêm (tuỳ chọn)"
              rows={2}
              className="w-full px-4 py-3 text-[15px] bg-white border border-gray-300 rounded-xl focus:border-[#1B4D3E] focus:ring-2 focus:ring-[#1B4D3E]/20 outline-none resize-none"
            />
          </div>

          {/* Liên kết phiếu (collapsible) */}
          <button
            onClick={() => setShowLink(!showLink)}
            className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-500"
          >
            <span className="flex items-center gap-1.5">
              <Link2 size={15} />
              Liên kết phiếu nhập/xuất
            </span>
            {showLink ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showLink && (
            <div className="space-y-3 bg-white rounded-xl p-4 border border-gray-200">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Loại liên kết</label>
                <select
                  value={referenceType}
                  onChange={(e) => setReferenceType(e.target.value)}
                  className="w-full h-12 px-3 text-[15px] bg-gray-50 border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
                >
                  {REFERENCE_TYPES.map(rt => (
                    <option key={rt.value} value={rt.value}>{rt.label}</option>
                  ))}
                </select>
              </div>
              {referenceType && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Mã phiếu</label>
                  <input
                    type="text"
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    placeholder="VD: NK-TP-20260225-001"
                    className="w-full h-12 px-3 text-[15px] bg-gray-50 border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Action */}
          <div className="sticky bottom-0 bg-gray-50 pt-3 pb-6 -mx-4 px-4">
            <button
              onClick={handleCreate}
              disabled={loading || !vehiclePlate.trim()}
              className="w-full h-14 bg-[#1B4D3E] text-white rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 active:bg-[#163f33] disabled:opacity-50 disabled:active:bg-[#1B4D3E] transition-colors shadow-lg"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Scale size={20} />}
              {loading ? 'Đang tạo...' : 'Bắt đầu cân'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER: WEIGHING — Giao diện cân chính
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-[#1B4D3E] text-white px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={resetForm} className="p-2 -ml-2 rounded-lg hover:bg-white/10 active:bg-white/20">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold truncate">{ticket?.code}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[ticket?.status || 'weighing_gross'].bg} ${STATUS_CONFIG[ticket?.status || 'weighing_gross'].color}`}>
                {STATUS_CONFIG[ticket?.status || 'weighing_gross'].label}
              </span>
            </div>
            <p className="text-xs text-white/70 truncate">
              {ticket?.vehicle_plate} • {ticket?.driver_name || 'Không có tài xế'} • {ticket?.ticket_type === 'in' ? 'Xe vào' : 'Xe ra'}
            </p>
          </div>
          {/* Scale indicator */}
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${scale.connected ? 'bg-green-500/20 text-green-200' : 'bg-white/10 text-white/50'}`}>
            {scale.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto"><X size={16} className="text-red-400" /></button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2">
            <Check size={16} className="text-green-500 mt-0.5 shrink-0" />
            <p className="text-sm text-green-700">{success}</p>
            <button onClick={() => setSuccess(null)} className="ml-auto"><X size={16} className="text-green-400" /></button>
          </div>
        )}

        {/* ===== WEIGHT DISPLAY CARDS ===== */}
        <div className="grid grid-cols-3 gap-3">
          {/* Gross */}
          <div className={`bg-white rounded-xl p-4 border-2 text-center ${ticket?.status === 'weighing_gross' ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Gross (Lần 1)</p>
            <p className="text-2xl md:text-3xl font-bold font-mono text-gray-900">
              {ticket?.gross_weight != null ? ticket.gross_weight.toLocaleString() : '---'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">kg</p>
          </div>

          {/* Tare */}
          <div className={`bg-white rounded-xl p-4 border-2 text-center ${ticket?.status === 'weighing_tare' ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-200'}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tare (Lần 2)</p>
            <p className="text-2xl md:text-3xl font-bold font-mono text-gray-900">
              {ticket?.tare_weight != null ? ticket.tare_weight.toLocaleString() : '---'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">kg</p>
          </div>

          {/* Net */}
          <div className={`rounded-xl p-4 border-2 text-center ${ticket?.net_weight != null ? 'bg-green-50 border-green-400' : 'bg-white border-gray-200'}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">NET</p>
            <p className={`text-2xl md:text-3xl font-bold font-mono ${ticket?.net_weight != null ? 'text-green-700' : 'text-gray-900'}`}>
              {ticket?.net_weight != null ? ticket.net_weight.toLocaleString() : '---'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">kg</p>
          </div>
        </div>

        {/* ===== LIVE SCALE READING ===== */}
        {scale.connected && scale.liveWeight && canRecordWeight && (
          <div className="bg-gray-900 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
              Cân đang đọc {scale.liveWeight.stable ? '(ổn định ✓)' : '(chưa ổn định...)'}
            </p>
            <p className="text-4xl font-bold font-mono text-green-400">
              {scale.liveWeight.weight.toLocaleString()}
            </p>
            <p className="text-sm text-gray-400">{scale.liveWeight.unit}</p>
          </div>
        )}

        {/* ===== WEIGHT INPUT ===== */}
        {canRecordWeight && (
          <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {ticket?.status === 'weighing_gross' ? '⚖️ Cân lần 1 (Gross)' : '⚖️ Cân lần 2 (Tare)'}
              </h3>
              {scale.connected && (
                <button
                  onClick={handleReadScale}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium active:bg-blue-700"
                >
                  <Zap size={14} />
                  Đọc từ cân
                </button>
              )}
            </div>

            {/* Tare suggestion */}
            {ticket?.status === 'weighing_tare' && tareSuggestion && tareSuggestion.count > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <div className="text-sm">
                  <p className="text-blue-700 font-medium">
                    💡 Gợi ý Tare: {tareSuggestion.lastTare?.toLocaleString()} kg
                  </p>
                  <p className="text-blue-500 text-xs">
                    TB {tareSuggestion.count} lần cân trước: {tareSuggestion.avgTare?.toLocaleString()} kg
                  </p>
                </div>
                <button
                  onClick={() => tareSuggestion.lastTare && handleUseTareSuggestion(tareSuggestion.lastTare)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:bg-blue-700"
                >
                  Dùng
                </button>
              </div>
            )}

            {/* Manual input */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="number"
                  value={manualWeight}
                  onChange={(e) => {
                    setManualWeight(e.target.value)
                    setWeightSource('manual')
                  }}
                  placeholder="Nhập trọng lượng (kg)"
                  className="w-full h-14 px-4 pr-12 text-xl font-bold font-mono bg-gray-50 border-2 border-gray-300 rounded-xl focus:border-[#1B4D3E] focus:ring-2 focus:ring-[#1B4D3E]/20 outline-none"
                  inputMode="decimal"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">kg</span>
              </div>
              <button
                onClick={handleRecordWeight}
                disabled={loading || (!manualWeight && !scale.liveWeight)}
                className="h-14 px-6 bg-[#1B4D3E] text-white rounded-xl font-bold flex items-center gap-2 active:bg-[#163f33] disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                Ghi
              </button>
            </div>
          </div>
        )}

        {/* ===== CAMERA LIVE STREAM + CAPTURE ===== */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowCamera(!showCamera)}
            className="w-full flex items-center justify-between p-4 active:bg-gray-50"
          >
            <span className="flex items-center gap-2 font-semibold text-gray-900">
              <Camera size={18} />
              Camera & Ảnh xe ({images.length})
            </span>
            {showCamera ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>
          {showCamera && (
            <div className="px-4 pb-4 space-y-3">
              {/* Live camera grid — 3 IP cameras */}
              <CameraGrid
                capturing={uploading}
                onSnapshotAll={async (snapshots) => {
                  if (!ticket) return
                  setUploading(true)
                  try {
                    let count = 0
                    for (const snap of snapshots) {
                      const file = new File([snap.blob], `${snap.cameraId}_${Date.now()}.jpg`, { type: 'image/jpeg' })
                      const img = await weighbridgeImageService.uploadImage(
                        ticket.id,
                        file,
                        snap.cameraId as CaptureType
                      )
                      setImages(prev => [...prev, img])
                      count++
                    }
                    setSuccess(`Đã chụp & lưu ${count}/${snapshots.length} ảnh từ camera`)
                  } catch (err: any) {
                    setError(err?.message || 'Lỗi khi lưu ảnh từ camera')
                  } finally {
                    setUploading(false)
                  }
                }}
              />

              {/* Manual upload buttons — bổ sung ảnh bằng tay */}
              <div className="border-t border-gray-200 pt-3">
                <p className="text-xs text-gray-500 font-medium mb-2">📎 Upload thêm ảnh (chọn từ máy / chụp điện thoại)</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['front', 'rear', 'top', 'plate', 'cargo'] as CaptureType[]).map(type => {
                    const labels: Record<string, string> = { front: 'Trước', rear: 'Sau', top: 'Trên', plate: 'Biển số', cargo: 'Hàng' }
                    return (
                      <button
                        key={type}
                        onClick={() => handleUploadImage(type)}
                        disabled={uploading}
                        className="h-10 bg-gray-50 rounded-lg flex items-center justify-center gap-1 active:bg-gray-100 disabled:opacity-50 border border-gray-200 text-[11px] text-gray-600"
                      >
                        <ImageIcon size={12} />
                        {labels[type]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {uploading && (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
                  <Loader2 size={16} className="animate-spin" />
                  Đang upload ảnh...
                </div>
              )}

              {/* Image gallery — ảnh đã lưu */}
              {images.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1.5">Ảnh đã lưu ({images.length})</p>
                  <div className="grid grid-cols-3 gap-2">
                    {images.map(img => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.image_url}
                          alt={img.capture_type}
                          className="w-full h-24 object-cover rounded-lg border border-gray-200"
                          loading="lazy"
                        />
                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                          {img.capture_type}
                        </span>
                        {!isCompleted && !isCancelled && (
                          <button
                            onClick={() => handleDeleteImage(img.id)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== ACTION BUTTONS ===== */}
        <div className="sticky bottom-0 bg-gray-100 pt-2 pb-6 space-y-2">
          {canComplete && (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full h-14 bg-green-600 text-white rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 active:bg-green-700 disabled:opacity-50 transition-colors shadow-lg"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
              Hoàn tất & In phiếu
            </button>
          )}

          {isCompleted && (
            <div className="space-y-2">
              <div className="bg-green-100 border border-green-300 rounded-xl p-4 text-center">
                <Check size={32} className="text-green-600 mx-auto mb-2" />
                <p className="font-bold text-green-800 text-lg">Phiếu cân hoàn tất</p>
                <p className="text-green-700 text-2xl font-bold font-mono mt-1">
                  NET: {ticket?.net_weight?.toLocaleString()} kg
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigate(`/wms/weighbridge/${ticket?.id}`)}
                  className="h-12 bg-white border border-gray-300 rounded-xl font-medium flex items-center justify-center gap-2 active:bg-gray-50"
                >
                  <Eye size={16} />
                  Xem chi tiết
                </button>
                <button
                  onClick={resetForm}
                  className="h-12 bg-[#1B4D3E] text-white rounded-xl font-medium flex items-center justify-center gap-2 active:bg-[#163f33]"
                >
                  <Plus size={16} />
                  Cân xe tiếp
                </button>
              </div>
            </div>
          )}

          {isCancelled && (
            <div className="space-y-2">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <X size={32} className="text-red-500 mx-auto mb-2" />
                <p className="font-bold text-red-700">Phiếu cân đã hủy</p>
              </div>
              <button
                onClick={resetForm}
                className="w-full h-12 bg-[#1B4D3E] text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                Tạo phiếu mới
              </button>
            </div>
          )}

          {canRecordWeight && (
            <button
              onClick={handleCancel}
              disabled={loading}
              className="w-full h-12 bg-white border border-red-300 text-red-600 rounded-xl font-medium flex items-center justify-center gap-2 active:bg-red-50 disabled:opacity-50"
            >
              <X size={16} />
              Hủy phiếu
            </button>
          )}
        </div>
      </div>
    </div>
  )
}