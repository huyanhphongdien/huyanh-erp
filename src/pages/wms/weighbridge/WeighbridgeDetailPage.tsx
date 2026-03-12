// ============================================================================
// FILE: src/pages/wms/weighbridge/WeighbridgeDetailPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Sprint 7C — Chi tiết phiếu cân xe
// ============================================================================

import React, { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Scale,
  Truck,
  User,
  Calendar,
  Clock,
  FileText,
  Link2,
  Printer,
  Camera,
  Check,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle,
  MapPin,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import weighbridgeService from '../../../services/wms/weighbridgeService'
import weighbridgeImageService from '../../../services/wms/weighbridgeImageService'
import type { WeighbridgeTicket, WeighbridgeImage, WeighbridgeStatus } from '../../../services/wms/wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<WeighbridgeStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  weighing_gross: { label: 'Chờ cân lần 1', color: 'text-blue-700', bg: 'bg-blue-100', icon: <Scale size={16} className="text-blue-600" /> },
  weighing_tare: { label: 'Chờ cân lần 2', color: 'text-amber-700', bg: 'bg-amber-100', icon: <Scale size={16} className="text-amber-600" /> },
  completed: { label: 'Hoàn tất', color: 'text-green-700', bg: 'bg-green-100', icon: <Check size={16} className="text-green-600" /> },
  cancelled: { label: 'Đã hủy', color: 'text-red-700', bg: 'bg-red-100', icon: <X size={16} className="text-red-600" /> },
}

const REFERENCE_LABELS: Record<string, string> = {
  stock_in: 'Phiếu nhập TP',
  stock_out: 'Phiếu xuất TP',
  stock_in_raw: 'Nhập NVL',
  purchase_order: 'Đơn mua hàng',
  none: 'Không liên kết',
}

const CAPTURE_LABELS: Record<string, string> = {
  front: 'Mặt trước',
  rear: 'Mặt sau',
  top: 'Trên cao',
  plate: 'Biển số',
  cargo: 'Hàng hóa',
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function WeighbridgeDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [ticket, setTicket] = useState<WeighbridgeTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // ============================================================================
  // LOAD
  // ============================================================================

  useEffect(() => {
    if (!id) return
    loadTicket()
  }, [id])

  async function loadTicket() {
    setLoading(true)
    setError(null)
    try {
      const data = await weighbridgeService.getById(id!)
      if (!data) {
        setError('Không tìm thấy phiếu cân')
        return
      }
      setTicket(data)
    } catch (err: any) {
      setError(err?.message || 'Không thể tải phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function handlePrint() {
    window.print()
  }

  function navigateToReference() {
    if (!ticket?.reference_type || !ticket?.reference_id) return
    const routes: Record<string, string> = {
      stock_in: `/wms/stock-in/${ticket.reference_id}`,
      stock_out: `/wms/stock-out/${ticket.reference_id}`,
      stock_in_raw: `/purchasing/receivings/${ticket.reference_id}`,
      purchase_order: `/purchasing/orders/${ticket.reference_id}`,
    }
    const route = routes[ticket.reference_type]
    if (route) navigate(route)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-[#1B4D3E] text-white px-4 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-lg hover:bg-white/10">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-lg font-bold">Chi tiết phiếu cân</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <AlertTriangle size={48} className="text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">{error || 'Không tìm thấy phiếu cân'}</p>
          <button
            onClick={() => navigate('/wms/weighbridge/list')}
            className="mt-4 px-4 py-2 bg-[#1B4D3E] text-white rounded-lg text-sm font-medium"
          >
            Quay lại danh sách
          </button>
        </div>
      </div>
    )
  }

  const sc = STATUS_CONFIG[ticket.status]
  const images = ticket.images || []

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <div className="bg-[#1B4D3E] text-white px-4 py-4 sticky top-0 z-20 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-lg hover:bg-white/10 active:bg-white/20">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold truncate">{ticket.code}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.color}`}>
                {sc.label}
              </span>
            </div>
            <p className="text-xs text-white/70">{ticket.vehicle_plate} • {ticket.ticket_type === 'in' ? 'Xe vào' : 'Xe ra'}</p>
          </div>
          <button onClick={handlePrint} className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20">
            <Printer size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* ===== WEIGHT RESULTS ===== */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            <div className="p-4 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Gross</p>
              <p className="text-xl md:text-2xl font-bold font-mono text-gray-900">
                {ticket.gross_weight != null ? ticket.gross_weight.toLocaleString() : '---'}
              </p>
              <p className="text-xs text-gray-400">kg</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tare</p>
              <p className="text-xl md:text-2xl font-bold font-mono text-gray-900">
                {ticket.tare_weight != null ? ticket.tare_weight.toLocaleString() : '---'}
              </p>
              <p className="text-xs text-gray-400">kg</p>
            </div>
            <div className={`p-4 text-center ${ticket.net_weight != null ? 'bg-green-50' : ''}`}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">NET</p>
              <p className={`text-xl md:text-2xl font-bold font-mono ${ticket.net_weight != null ? 'text-green-700' : 'text-gray-900'}`}>
                {ticket.net_weight != null ? ticket.net_weight.toLocaleString() : '---'}
              </p>
              <p className="text-xs text-gray-400">kg</p>
            </div>
          </div>
        </div>

        {/* ===== VEHICLE INFO ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Truck size={18} className="text-gray-500" />
            Thông tin xe
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Biển số" value={ticket.vehicle_plate} bold />
            <InfoRow label="Tài xế" value={ticket.driver_name || '—'} />
            <InfoRow label="Loại" value={ticket.ticket_type === 'in' ? '📥 Xe vào (Nhập)' : '📤 Xe ra (Xuất)'} />
            <InfoRow label="Mã phiếu" value={ticket.code} />
          </div>
        </div>

        {/* ===== REFERENCE LINK ===== */}
        {ticket.reference_type && ticket.reference_type !== 'none' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
              <Link2 size={18} className="text-gray-500" />
              Liên kết
            </h3>
            <button
              onClick={navigateToReference}
              className="w-full flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg active:bg-blue-100"
            >
              <div>
                <p className="text-sm font-medium text-blue-700">
                  {REFERENCE_LABELS[ticket.reference_type] || ticket.reference_type}
                </p>
                <p className="text-xs text-blue-500">{ticket.reference_id}</p>
              </div>
              <ExternalLink size={16} className="text-blue-500" />
            </button>
          </div>
        )}

        {/* ===== PHOTO GALLERY ===== */}
        {images.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Camera size={18} className="text-gray-500" />
              Ảnh xe ({images.length})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {images.map(img => (
                <button
                  key={img.id}
                  onClick={() => setPreviewImage(img.image_url)}
                  className="relative group"
                >
                  <img
                    src={img.image_url}
                    alt={img.capture_type}
                    className="w-full h-24 md:h-32 object-cover rounded-lg border border-gray-200"
                    loading="lazy"
                  />
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {CAPTURE_LABELS[img.capture_type] || img.capture_type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== TIMELINE ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Clock size={18} className="text-gray-500" />
            Lịch trình
          </h3>
          <div className="space-y-0">
            <TimelineItem
              done
              label="Tạo phiếu"
              time={ticket.created_at}
              isFirst
            />
            <TimelineItem
              done={ticket.gross_weight != null}
              label={`Cân Gross${ticket.gross_weight != null ? ` — ${ticket.gross_weight.toLocaleString()} kg` : ''}`}
              time={(ticket as any).gross_weighed_at}
            />
            <TimelineItem
              done={ticket.tare_weight != null}
              label={`Cân Tare${ticket.tare_weight != null ? ` — ${ticket.tare_weight.toLocaleString()} kg` : ''}`}
              time={(ticket as any).tare_weighed_at}
            />
            <TimelineItem
              done={ticket.status === 'completed'}
              label={ticket.status === 'cancelled' ? 'Đã hủy' : `Hoàn tất${ticket.net_weight != null ? ` — NET ${ticket.net_weight.toLocaleString()} kg` : ''}`}
              time={ticket.completed_at}
              isLast
              cancelled={ticket.status === 'cancelled'}
            />
          </div>
        </div>

        {/* ===== NOTES ===== */}
        {ticket.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
              <FileText size={18} className="text-gray-500" />
              Ghi chú
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.notes}</p>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex gap-2 pb-6 print:hidden">
          <button
            onClick={handlePrint}
            className="flex-1 h-12 bg-white border border-gray-300 rounded-xl font-medium flex items-center justify-center gap-2 active:bg-gray-50"
          >
            <Printer size={16} />
            In phiếu
          </button>
          <button
            onClick={() => navigate('/wms/weighbridge/list')}
            className="flex-1 h-12 bg-[#1B4D3E] text-white rounded-xl font-medium flex items-center justify-center gap-2 active:bg-[#163f33]"
          >
            Quay lại danh sách
          </button>
        </div>
      </div>

      {/* ===== IMAGE PREVIEW MODAL ===== */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 print:hidden"
          onClick={() => setPreviewImage(null)}
        >
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <X size={24} className="text-white" />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{value}</p>
    </div>
  )
}

function TimelineItem({
  done,
  label,
  time,
  isFirst,
  isLast,
  cancelled,
}: {
  done: boolean
  label: string
  time?: string
  isFirst?: boolean
  isLast?: boolean
  cancelled?: boolean
}) {
  return (
    <div className="flex gap-3">
      {/* Line + dot */}
      <div className="flex flex-col items-center w-5">
        {!isFirst && <div className={`w-0.5 h-3 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
        <div className={`w-3 h-3 rounded-full shrink-0 border-2 ${
          cancelled ? 'bg-red-500 border-red-500' :
          done ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
        }`} />
        {!isLast && <div className={`w-0.5 flex-1 min-h-[12px] ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
      </div>

      {/* Content */}
      <div className="pb-3 -mt-0.5">
        <p className={`text-sm ${done ? 'text-gray-900 font-medium' : 'text-gray-400'} ${cancelled ? 'text-red-600' : ''}`}>
          {label}
        </p>
        {time && (
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(time).toLocaleString('vi-VN')}
          </p>
        )}
      </div>
    </div>
  )
}