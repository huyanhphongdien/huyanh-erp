// ============================================================================
// FILE: src/pages/wms/rubber-intake/RubberIntakeDetailPage.tsx
// MODULE: Lý Lịch Mủ — Huy Anh Rubber ERP
// PHASE: P3.5 — Bước 3.5.9
// BẢNG: rubber_intake_batches
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calendar, Users, Truck, Scale, FlaskConical,
  Banknote, FileText, Check, X, Clock, Loader2, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, Droplets, User,
  Hash, Wallet, CircleCheck, Ban, MapPin, Globe,
} from 'lucide-react'
import rubberIntakeService from '../../../services/rubber/rubberIntakeService'
import type { RubberIntake } from '../../../services/rubber/rubberIntakeService'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<string, {
  label: string; bg: string; text: string; icon: React.ReactNode; borderColor: string
}> = {
  draft:     { label: 'Nháp',       bg: 'bg-gray-100',    text: 'text-gray-600',    icon: <FileText size={14} />, borderColor: '#9CA3AF' },
  confirmed: { label: 'Đã xác nhận', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <Check size={14} />,    borderColor: '#16A34A' },
  settled:   { label: 'Đã chốt',    bg: 'bg-blue-50',     text: 'text-blue-700',    icon: <Check size={14} />,    borderColor: '#2563EB' },
  cancelled: { label: 'Đã hủy',     bg: 'bg-red-50',      text: 'text-red-600',     icon: <X size={14} />,        borderColor: '#DC2626' },
}

const PAYMENT_CONFIG: Record<string, {
  label: string; bg: string; text: string; icon: React.ReactNode
}> = {
  unpaid:  { label: 'Chưa thanh toán',    bg: 'bg-orange-50', text: 'text-orange-600', icon: <Wallet size={14} /> },
  partial: { label: 'Thanh toán 1 phần',  bg: 'bg-yellow-50', text: 'text-yellow-700', icon: <Wallet size={14} /> },
  paid:    { label: 'Đã thanh toán',      bg: 'bg-emerald-50', text: 'text-emerald-600', icon: <CircleCheck size={14} /> },
}

const SOURCE_LABELS: Record<string, string> = {
  vietnam: '🇻🇳 Mủ Việt Nam',
  lao_direct: '🇱🇦 Lào trực tiếp',
  lao_agent: '🤝 Lào đại lý',
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatDateTime(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function formatNumber(n?: number | null): string {
  if (n === undefined || n === null) return '–'
  return n.toLocaleString('vi-VN')
}
function formatWeight(kg?: number | null): string {
  if (!kg) return '–'
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tấn`
  return `${formatNumber(Math.round(kg * 100) / 100)} kg`
}
function formatTon(t?: number | null): string {
  if (!t) return '–'
  return `${t.toFixed(3)} tấn`
}
function formatCurrency(a?: number | null, currency?: string): string {
  if (!a) return '–'
  const c = currency || 'VND'
  if (c === 'VND') return a.toLocaleString('vi-VN') + ' ₫'
  if (c === 'LAK' || c === 'KIP') return a.toLocaleString('vi-VN') + ' ₭'
  if (c === 'BATH') return a.toLocaleString('vi-VN') + ' ฿'
  return a.toLocaleString('vi-VN')
}

// DRC Gauge
const DRCGauge: React.FC<{ value?: number | null }> = ({ value }) => {
  if (!value) return <span className="text-gray-400 text-[13px]">–</span>
  const pct = Math.max(0, Math.min(100, ((value - 30) / 50) * 100))
  let color = '#16A34A'
  if (value < 40) color = '#DC2626'
  else if (value < 50) color = '#F59E0B'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[16px] font-bold shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", color }}>
        {value}%
      </span>
    </div>
  )
}

// Info Row
const InfoRow: React.FC<{
  icon: React.ReactNode; label: string; value: string | React.ReactNode; mono?: boolean; highlight?: boolean
}> = ({ icon, label, value, mono, highlight }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
    <div className="flex items-center gap-2.5 text-gray-500">
      {icon}
      <span className="text-[13px]">{label}</span>
    </div>
    <span
      className={`text-[14px] font-semibold text-right max-w-[60%] truncate ${highlight ? 'text-[#1B4D3E]' : 'text-gray-800'}`}
      style={mono ? { fontFamily: "'JetBrains Mono', monospace" } : undefined}
    >
      {value}
    </span>
  </div>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const RubberIntakeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [intake, setIntake] = useState<RubberIntake | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTimeline, setExpandedTimeline] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true); setError(null)
      const data = await rubberIntakeService.getById(id)
      if (!data) { setError('Phiếu nhập mủ không tồn tại'); return }
      setIntake(data)
    } catch (err: unknown) {
      console.error('Lỗi tải chi tiết:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const handleConfirm = async () => {
    if (!id || !intake || intake.status !== 'draft') return
    try {
      setActionLoading('confirm')
      const updated = await rubberIntakeService.confirm(id)
      setIntake(updated)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không thể xác nhận')
    } finally { setActionLoading(null) }
  }

  const handleCancel = async () => {
    if (!id || !intake || intake.status !== 'draft') return
    if (!window.confirm('Bạn chắc chắn muốn hủy phiếu này?')) return
    try {
      setActionLoading('cancel')
      const updated = await rubberIntakeService.cancel(id)
      setIntake(updated)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không thể hủy phiếu')
    } finally { setActionLoading(null) }
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#1B4D3E] animate-spin" />
          <span className="text-[14px] text-gray-500">Đang tải...</span>
        </div>
      </div>
    )
  }

  // Error
  if (error || !intake) {
    return (
      <div className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
            <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100 -ml-2">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-[17px] font-bold text-gray-900">Chi tiết phiếu</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-14 h-14 mb-3 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-gray-700 mb-1">{error || 'Không tìm thấy'}</h3>
          <button type="button" onClick={() => navigate('/rubber/intake')}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B4D3E] text-white rounded-xl text-[14px] font-semibold active:scale-[0.97] transition-transform">
            <ArrowLeft className="w-4 h-4" /> Quay lại
          </button>
        </div>
      </div>
    )
  }

  const statusConf = STATUS_CONFIG[intake.status] || STATUS_CONFIG.draft
  const paymentConf = PAYMENT_CONFIG[intake.payment_status] || PAYMENT_CONFIG.unpaid
  const isVietnam = intake.source_type === 'vietnam'
  const isLao = intake.source_type === 'lao_direct' || intake.source_type === 'lao_agent'

  return (
    <div className="min-h-screen bg-[#F7F5F2] pb-32" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100 -ml-2">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold text-gray-900 leading-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {intake.product_code || intake.invoice_no || `#${intake.id.slice(0, 8)}`}
              </h1>
              <p className="text-[12px] text-gray-400 leading-tight">Chi tiết phiếu nhập mủ</p>
            </div>
          </div>
          <button type="button" onClick={fetchDetail} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
            <RefreshCw className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* STATUS CARD */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: statusConf.borderColor + '40' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: statusConf.borderColor + '08' }}>
            <div className="flex items-center gap-2">
              <span className={statusConf.text}>{statusConf.icon}</span>
              <span className={`text-[14px] font-bold ${statusConf.text}`}>{statusConf.label}</span>
              <span className="text-[12px] px-2 py-0.5 rounded-md bg-white/60 font-medium">
                {SOURCE_LABELS[intake.source_type] || intake.source_type}
              </span>
            </div>
            <span className="text-[12px] text-gray-400">{formatDate(intake.intake_date)}</span>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {paymentConf.icon}
              <span className={`text-[13px] font-medium ${paymentConf.text}`}>{paymentConf.label}</span>
            </div>
            {intake.paid_amount && intake.paid_amount > 0 ? (
              <span className="text-[13px] font-semibold text-gray-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Đã trả: {formatCurrency(intake.paid_amount, intake.price_currency)}
              </span>
            ) : null}
          </div>
        </div>

        {/* NHÀ CUNG CẤP */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <Users size={16} className="text-[#1B4D3E]" />
            <span className="text-[14px] font-bold text-gray-900">Nhà cung cấp</span>
          </div>
          <div className="px-4 py-1">
            <InfoRow icon={<User size={14} className="text-gray-400" />} label="Tên" value={intake.supplier?.name || '–'} />
            {intake.supplier?.code && <InfoRow icon={<Hash size={14} className="text-gray-400" />} label="Mã" value={intake.supplier.code} mono />}
            {intake.supplier?.country && <InfoRow icon={<Globe size={14} className="text-gray-400" />} label="Quốc gia" value={intake.supplier.country === 'VN' ? '🇻🇳 Việt Nam' : '🇱🇦 Lào'} />}
            {intake.buyer_name && <InfoRow icon={<User size={14} className="text-gray-400" />} label="Người mua" value={intake.buyer_name} />}
            {intake.location_name && <InfoRow icon={<MapPin size={14} className="text-gray-400" />} label="Địa điểm" value={intake.location_name} />}
          </div>
        </div>

        {/* XE / PHƯƠNG TIỆN */}
        {(intake.vehicle_plate || intake.vehicle_label) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <Truck size={16} className="text-[#1B4D3E]" />
              <span className="text-[14px] font-bold text-gray-900">Phương tiện</span>
            </div>
            <div className="px-4 py-1">
              {intake.vehicle_plate && <InfoRow icon={<Truck size={14} className="text-gray-400" />} label="Biển số" value={intake.vehicle_plate} mono />}
              {intake.vehicle_label && <InfoRow icon={<Hash size={14} className="text-gray-400" />} label="Nhãn xe" value={intake.vehicle_label} />}
            </div>
          </div>
        )}

        {/* KHỐI LƯỢNG */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <Scale size={16} className="text-[#1B4D3E]" />
            <span className="text-[14px] font-bold text-gray-900">Khối lượng</span>
          </div>
          <div className="px-4 py-1">
            {intake.gross_weight_kg != null && <InfoRow icon={<Scale size={14} className="text-gray-400" />} label="KL tươi (Gross)" value={formatWeight(intake.gross_weight_kg)} mono />}
            {intake.net_weight_kg != null && <InfoRow icon={<Scale size={14} className="text-gray-400" />} label="KL nhập (Net)" value={formatWeight(intake.net_weight_kg)} mono highlight />}
            {isVietnam && intake.settled_qty_ton != null && <InfoRow icon={<Scale size={14} className="text-gray-400" />} label="KL chốt" value={formatTon(intake.settled_qty_ton)} mono highlight />}
            {isLao && intake.purchase_qty_kg != null && <InfoRow icon={<Scale size={14} className="text-gray-400" />} label="KL mua" value={formatWeight(intake.purchase_qty_kg)} mono />}
            {intake.finished_product_ton != null && <InfoRow icon={<Droplets size={14} className="text-gray-400" />} label="Thành phẩm NK" value={formatTon(intake.finished_product_ton)} mono highlight />}
          </div>
        </div>

        {/* DRC */}
        {intake.drc_percent != null && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <FlaskConical size={16} className="text-[#1B4D3E]" />
              <span className="text-[14px] font-bold text-gray-900">DRC</span>
            </div>
            <div className="px-4 py-3">
              <span className="text-[12px] text-gray-400 block mb-1.5">Hàm lượng cao su khô</span>
              <DRCGauge value={intake.drc_percent} />
            </div>
          </div>
        )}

        {/* GIÁ & THANH TOÁN */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <Banknote size={16} className="text-[#E8A838]" />
            <span className="text-[14px] font-bold text-gray-900">Giá & Thanh toán</span>
          </div>
          <div className="px-4 py-1">
            {isVietnam && intake.settled_price_per_ton != null && (
              <InfoRow icon={<Banknote size={14} className="text-gray-400" />} label="Giá chốt TP (₫/tấn)" value={formatCurrency(intake.settled_price_per_ton)} mono />
            )}
            {intake.unit_price != null && (
              <InfoRow icon={<Banknote size={14} className="text-gray-400" />} label={`Đơn giá (${intake.price_currency || 'VND'})`} value={formatCurrency(intake.unit_price, intake.price_currency)} mono />
            )}
            {intake.avg_unit_price != null && (
              <InfoRow icon={<Banknote size={14} className="text-gray-400" />} label="Đơn giá BQ" value={formatCurrency(intake.avg_unit_price)} mono />
            )}
            {intake.exchange_rate != null && (
              <InfoRow icon={<Globe size={14} className="text-gray-400" />} label="Tỷ giá" value={formatNumber(intake.exchange_rate)} mono />
            )}
            <InfoRow
              icon={<Wallet size={14} className="text-gray-400" />}
              label="Thành tiền"
              value={
                <span className="text-[16px] font-bold text-[#E8A838]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatCurrency(intake.total_amount, intake.price_currency)}
                </span>
              }
            />
            {intake.total_amount_vnd != null && intake.price_currency !== 'VND' && (
              <InfoRow icon={<Wallet size={14} className="text-gray-400" />} label="Quy đổi VND" value={formatCurrency(intake.total_amount_vnd)} mono highlight />
            )}
            {intake.invoice_no && <InfoRow icon={<FileText size={14} className="text-gray-400" />} label="Hoá đơn số" value={intake.invoice_no} mono />}
          </div>
        </div>

        {/* GHI CHÚ */}
        {intake.notes && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <FileText size={16} className="text-[#1B4D3E]" />
              <span className="text-[14px] font-bold text-gray-900">Ghi chú</span>
            </div>
            <div className="px-4 py-3">
              <p className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap">{intake.notes}</p>
            </div>
          </div>
        )}

        {/* TIMELINE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button onClick={() => setExpandedTimeline(!expandedTimeline)} className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-[#1B4D3E]" />
              <span className="text-[14px] font-bold text-gray-900">Lịch sử</span>
            </div>
            {expandedTimeline ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {expandedTimeline && (
            <div className="px-4 pb-4 border-t border-gray-50">
              <div className="relative pl-6 space-y-4 mt-3">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
                <div className="relative">
                  <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white" />
                  <span className="text-[13px] font-semibold text-gray-700">Tạo phiếu</span>
                  <p className="text-[12px] text-gray-400">{formatDateTime(intake.created_at)}</p>
                </div>
                {intake.status === 'confirmed' && (
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                    <span className="text-[13px] font-semibold text-gray-700">Xác nhận</span>
                    <p className="text-[12px] text-gray-400">{formatDateTime(intake.updated_at)}</p>
                  </div>
                )}
                {intake.status === 'cancelled' && (
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />
                    <span className="text-[13px] font-semibold text-gray-700">Đã hủy</span>
                    <p className="text-[12px] text-gray-400">{formatDateTime(intake.updated_at)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ACTIONS */}
      {intake.status === 'draft' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-bottom">
          <div className="flex items-center gap-3 px-4 py-3">
            <button type="button" onClick={handleCancel} disabled={actionLoading !== null}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-red-200 text-red-600 bg-white rounded-xl text-[14px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-50 min-h-[48px]">
              {actionLoading === 'cancel' ? <Loader2 size={18} className="animate-spin" /> : <Ban size={18} />}
              Hủy
            </button>
            <button type="button" onClick={handleConfirm} disabled={actionLoading !== null}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-[#1B4D3E] text-white rounded-xl text-[14px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-50 min-h-[48px]">
              {actionLoading === 'confirm' ? <Loader2 size={18} className="animate-spin" /> : <CircleCheck size={18} />}
              Xác nhận
            </button>
          </div>
        </div>
      )}

      {intake.status !== 'draft' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-bottom">
          <div className="flex items-center justify-center gap-2 px-4 py-4">
            <span className={statusConf.text}>{statusConf.icon}</span>
            <span className={`text-[14px] font-semibold ${statusConf.text}`}>{statusConf.label}</span>
            <span className="text-[12px] text-gray-400 ml-2">{formatDateTime(intake.updated_at)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default RubberIntakeDetailPage