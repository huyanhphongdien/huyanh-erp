// ============================================================================
// FILE: src/pages/wms/rubber-suppliers/RubberSupplierDetailPage.tsx
// MODULE: Lý Lịch Mủ — Huy Anh Rubber ERP
// PHASE: P3.5 — V3: Fix type Ticket → RubberIntake
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Edit3, Phone, MapPin, Star, Droplets, Scale,
  TreePine, CreditCard, ShieldCheck, Globe, Calendar, Landmark,
  ChevronRight, FileText, Banknote, BarChart3, Building2, User,
  Truck, Hash, Clock, CheckCircle2, XCircle,
  Loader2, Wallet, TrendingUp, Eye,
} from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { App as AntdApp } from 'antd'
import rubberSupplierService from '../../../services/rubber/rubberSupplierService'
import rubberIntakeService, { RUBBER_INTAKE_STATUS_LABELS, RUBBER_INTAKE_PAYMENT_LABELS } from '../../../services/rubber/rubberIntakeService'
import type { RubberIntake } from '../../../services/rubber/rubberIntakeService'
import { fmtNum, fmtPct, fmtVndCompact, fmtDate, fmtDateTime } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { LimitNotice } from '../../../components/common/tableDefaults'

/** Trần tải phiếu nhập của 1 NCC — công nợ tính trên các phiếu đã tải, chạm trần thì báo */
const INTAKE_LIMIT = 100

// ============================================================================
// TYPES
// ============================================================================

interface Supplier {
  id: string
  code: string
  name: string
  supplier_type: 'tieu_dien' | 'dai_ly' | 'nong_truong' | 'cong_ty'
  phone?: string
  cccd?: string
  tax_code?: string
  address?: string
  province: string
  district?: string
  commune?: string
  country?: string
  plantation_area_ha?: number
  rubber_variety?: string
  tree_age_years?: number
  tapping_system?: string
  geo_latitude?: number
  geo_longitude?: number
  eudr_compliant?: boolean
  eudr_cert_expiry?: string
  payment_method?: string
  bank_name?: string
  bank_account?: string
  bank_holder?: string
  quality_rating: number
  avg_drc?: number
  total_weight_kg: number
  total_transactions: number
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type TabKey = 'overview' | 'tickets' | 'debt' | 'stats'

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_CONFIG: Record<string, { label: string; icon: string; className: string }> = {
  tieu_dien: { label: 'Tiểu điền', icon: '🌿', className: 'bg-green-50 text-green-700 border-green-200' },
  dai_ly: { label: 'Đại lý', icon: '🏪', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  nong_truong: { label: 'Nông trường', icon: '🏭', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  cong_ty: { label: 'Công ty', icon: '🏢', className: 'bg-purple-50 text-purple-700 border-purple-200' },
}

// Nhãn lấy từ rubberIntakeService (một nguồn với sổ Lý lịch mủ / chi tiết phiếu) — ở đây chỉ giữ icon + màu
const INTAKE_STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  draft: { label: RUBBER_INTAKE_STATUS_LABELS.draft, icon: <Clock size={12} />, className: 'bg-gray-50 text-gray-600' },
  confirmed: { label: RUBBER_INTAKE_STATUS_LABELS.confirmed, icon: <CheckCircle2 size={12} />, className: 'bg-emerald-50 text-emerald-700' },
  settled: { label: RUBBER_INTAKE_STATUS_LABELS.settled, icon: <CheckCircle2 size={12} />, className: 'bg-blue-50 text-blue-700' },
  cancelled: { label: RUBBER_INTAKE_STATUS_LABELS.cancelled, icon: <XCircle size={12} />, className: 'bg-red-50 text-red-600' },
}

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  unpaid: { label: `⏳ ${RUBBER_INTAKE_PAYMENT_LABELS.unpaid}`, className: 'text-amber-600' },
  partial: { label: `🔶 ${RUBBER_INTAKE_PAYMENT_LABELS.partial}`, className: 'text-orange-600' },
  paid: { label: `✅ ${RUBBER_INTAKE_PAYMENT_LABELS.paid}`, className: 'text-emerald-600' },
}

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Tổng quan', icon: <Eye size={16} /> },
  { key: 'tickets', label: 'Phiếu nhập', icon: <FileText size={16} /> },
  { key: 'debt', label: 'Công nợ', icon: <Wallet size={16} /> },
  { key: 'stats', label: 'Thống kê', icon: <BarChart3 size={16} /> },
]

// ============================================================================
// HELPERS
// ============================================================================

// Thẻ hẹp: tấn rút gọn "T"; tiền VND rút gọn chung fmtVndCompact ("9,33 tỷ" / "350,5 tr" / "12.000 ₫")
// — số theo vi-VN qua format.ts (toFixed cũ ra DẤU CHẤM thập phân, hậu tố 'đ').
function formatWeight(kg?: number | null): string {
  if (!kg) return '—'
  if (kg >= 1000) return `${fmtNum(kg / 1000, 1)}T`
  return `${fmtNum(kg)} kg`
}

const formatMoney = (amount?: number | null): string => (amount ? fmtVndCompact(amount) : '—')
const formatDate = (s?: string): string => fmtDate(s)
const formatDateTime = (s?: string): string => fmtDateTime(s)

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value?: string | React.ReactNode; mono?: boolean }> = ({ icon, label, value, mono }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
    <div className="flex items-center gap-2.5 text-gray-500">
      {icon}
      <span className="text-[13px]">{label}</span>
    </div>
    <span className={`text-[14px] font-semibold text-gray-800 text-right max-w-[55%] truncate ${mono ? 'font-mono' : ''}`}>
      {value || '—'}
    </span>
  </div>
)

/** Intake card — uses RubberIntake type */
const IntakeCard: React.FC<{ intake: RubberIntake; onTap: (id: string) => void }> = ({ intake, onTap }) => {
  const statusCfg = INTAKE_STATUS_CONFIG[intake.status] || INTAKE_STATUS_CONFIG.draft
  const paymentCfg = PAYMENT_STATUS_CONFIG[intake.payment_status] || PAYMENT_STATUS_CONFIG.unpaid

  const displayCode = intake.product_code || intake.invoice_no || `#${intake.id.slice(0, 8)}`
  const displayWeight = intake.net_weight_kg ? formatWeight(intake.net_weight_kg) : intake.gross_weight_kg ? formatWeight(intake.gross_weight_kg) : '—'

  return (
    <button type="button" onClick={() => onTap(intake.id)}
      className="w-full text-left bg-white rounded-xl border border-gray-100 p-3.5 active:scale-[0.98] transition-transform">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="text-[14px] font-bold text-gray-900 font-mono truncate block">{displayCode}</span>
          <span className="text-[12px] text-gray-400">{formatDate(intake.intake_date)}</span>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full ${statusCfg.className}`}>
          {statusCfg.icon} {statusCfg.label}
        </span>
      </div>

      <div className="flex items-center gap-4 text-[13px] text-gray-600">
        <span className="inline-flex items-center gap-1">
          <Scale size={13} className="text-gray-400" />
          <span className="font-semibold font-mono text-gray-800">{displayWeight}</span>
        </span>
        {intake.drc_percent != null && (
          <span className="inline-flex items-center gap-1">
            <Droplets size={13} className="text-gray-400" />
            <span className="font-semibold font-mono text-[#1B4D3E]">{intake.drc_percent}%</span>
          </span>
        )}
        {intake.vehicle_plate && (
          <span className="inline-flex items-center gap-1 text-gray-400">
            <Truck size={13} />
            {intake.vehicle_plate}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span className="text-[12px] text-gray-400">{formatDateTime(intake.created_at)}</span>
        <div className="flex items-center gap-2">
          {intake.total_amount != null && intake.total_amount > 0 && (
            <span className="text-[12px] font-mono font-bold text-gray-700">{formatMoney(intake.total_amount)}</span>
          )}
          <span className={`text-[11px] font-medium ${paymentCfg.className}`}>{paymentCfg.label}</span>
        </div>
      </div>
    </button>
  )
}

const DRCBar: React.FC<{ label: string; value: number; max: number }> = ({ label, value, max }) => {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-gray-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-[#8B5E3C] to-[#E8A838]" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[13px] font-mono font-bold text-gray-700 w-14 text-right">{fmtPct(value, 1)}</span>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RubberSupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { message } = AntdApp.useApp()
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [intakes, setIntakes] = useState<RubberIntake[]>([])
  // Lỗi tải phiếu nhập: KHÔNG để tab Công nợ hiện "Hết nợ ✓" / tab Phiếu nhập trống giả
  const [intakeErr, setIntakeErr] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      try {
        const supplierData = await rubberSupplierService.getById(id)
        setSupplier(supplierData as Supplier)

        try {
          const result = await rubberIntakeService.getAll({
            page: 1,
            pageSize: INTAKE_LIMIT,
            rubber_supplier_id: id,
          })
          setIntakes(result.data || [])
          setIntakeErr(null)
        } catch (ticketErr) {
          console.warn('Không tải được phiếu nhập:', ticketErr)
          setIntakes([])
          setIntakeErr(ticketErr || 'Không tải được phiếu nhập')
        }
      } catch (err) {
        console.error('Lỗi tải NCC:', err)
        message.error(dichLoiHeThong(err, 'Không thể tải thông tin NCC'))
        navigate('/rubber/suppliers')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, navigate])

  // Computed
  const debtIntakes = useMemo(() =>
    intakes.filter(t => t.payment_status === 'unpaid' || t.payment_status === 'partial'),
    [intakes]
  )

  const totalDebt = useMemo(() =>
    debtIntakes.reduce((s, t) => s + ((t.total_amount || 0) - (t.paid_amount || 0)), 0),
    [debtIntakes]
  )

  const confirmedIntakes = useMemo(() =>
    intakes.filter(t => t.status === 'confirmed' || t.status === 'settled'),
    [intakes]
  )

  const handleTapIntake = (intakeId: string) => {
    navigate(`/rubber/intake/${intakeId}`)
  }

  if (loading || !supplier) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#8B5E3C]" />
      </div>
    )
  }

  const typeCfg = TYPE_CONFIG[supplier.supplier_type] || TYPE_CONFIG.tieu_dien

  // Stats computed from intakes
  const totalNet = confirmedIntakes.reduce((s, t) => s + (t.net_weight_kg || 0), 0)
  const totalAmount = confirmedIntakes.reduce((s, t) => s + (t.total_amount || 0), 0)
  const avgDrc = confirmedIntakes.length > 0
    ? confirmedIntakes.reduce((s, t) => s + (t.drc_percent || 0), 0) / confirmedIntakes.length
    : supplier.avg_drc || 0
  const highDrc = confirmedIntakes.length > 0
    ? Math.max(...confirmedIntakes.map(t => t.drc_percent || 0))
    : avgDrc
  const lowDrc = confirmedIntakes.length > 0
    ? Math.min(...confirmedIntakes.filter(t => t.drc_percent && t.drc_percent > 0).map(t => t.drc_percent || 0))
    : avgDrc

  return (
    <div className="min-h-screen bg-[#F7F5F2] pb-6" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HERO HEADER */}
      <div className="bg-gradient-to-br from-[#5D3A1A] via-[#8B5E3C] to-[#A0714B] text-white safe-area-top">
        <div className="px-4 pt-4 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => navigate('/rubber/suppliers')}
              className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center active:bg-white/20">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold leading-tight truncate">{supplier.name}</h1>
              <p className="text-white/60 text-[13px] font-mono">{supplier.code}</p>
            </div>
            <button type="button" onClick={() => navigate(`/rubber/suppliers/${id}/edit`)}
              className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center active:bg-white/20">
              <Edit3 size={18} />
            </button>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold rounded-lg border ${typeCfg.className}`}>
              {typeCfg.icon} {typeCfg.label}
            </span>
            {supplier.country && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-medium rounded-lg bg-white/10 text-white/80">
                {supplier.country === 'VN' ? '🇻🇳' : '🇱🇦'} {supplier.country === 'VN' ? 'Việt Nam' : 'Lào'}
              </span>
            )}
            {supplier.quality_rating > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold rounded-lg bg-amber-400/20 text-amber-200">
                <Star size={12} /> {fmtNum(supplier.quality_rating, 1)}
              </span>
            )}
            {supplier.eudr_compliant && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold rounded-lg bg-green-400/20 text-green-200">
                <ShieldCheck size={12} /> EUDR
              </span>
            )}
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-white/10">
            <div className="text-center">
              <p className="text-white/50 text-[11px] mb-0.5">Phiếu nhập</p>
              <p className="text-[18px] font-bold font-mono">{intakes.length}</p>
            </div>
            <div className="text-center">
              <p className="text-white/50 text-[11px] mb-0.5">Tổng KL</p>
              <p className="text-[18px] font-bold font-mono">{formatWeight(totalNet || supplier.total_weight_kg)}</p>
            </div>
            <div className="text-center">
              <p className="text-white/50 text-[11px] mb-0.5">DRC TB</p>
              <p className="text-[18px] font-bold font-mono">{avgDrc > 0 ? fmtPct(avgDrc, 1) : '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="flex overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-medium border-b-2 transition-all min-w-[80px] ${
                activeTab === tab.key
                  ? 'text-[#8B5E3C] border-[#8B5E3C]'
                  : 'text-gray-400 border-transparent'
              }`}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="px-4 pt-4 space-y-4">
        {!!intakeErr && activeTab !== 'overview' && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
            <b>Không tải được phiếu nhập</b> — số phiếu, công nợ, thống kê dưới đây CHƯA đúng. {dichLoiHeThong(intakeErr, 'Có lỗi khi tải')}. Tải lại trang để thử lại.
          </div>
        )}
        {!intakeErr && activeTab !== 'overview' && <LimitNotice shown={intakes.length} limit={INTAKE_LIMIT} what="phiếu nhập" />}

        {/* ===== OVERVIEW ===== */}
        {activeTab === 'overview' && (
          <>
            {/* Thông tin liên hệ */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <User size={16} className="text-[#8B5E3C]" />
                <span className="text-[14px] font-bold text-gray-900">Thông tin liên hệ</span>
              </div>
              <div className="px-4 py-1">
                {supplier.phone && <InfoRow icon={<Phone size={14} className="text-gray-400" />} label="Điện thoại" value={supplier.phone} mono />}
                {supplier.cccd && <InfoRow icon={<CreditCard size={14} className="text-gray-400" />} label="CCCD" value={supplier.cccd} mono />}
                {supplier.tax_code && <InfoRow icon={<Hash size={14} className="text-gray-400" />} label="MST" value={supplier.tax_code} mono />}
                {supplier.address && <InfoRow icon={<MapPin size={14} className="text-gray-400" />} label="Địa chỉ" value={supplier.address} />}
                <InfoRow icon={<Globe size={14} className="text-gray-400" />} label="Tỉnh" value={[supplier.commune, supplier.district, supplier.province].filter(Boolean).join(', ')} />
              </div>
            </div>

            {/* Vườn cây */}
            {(supplier.plantation_area_ha || supplier.rubber_variety || supplier.tree_age_years) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                  <TreePine size={16} className="text-[#8B5E3C]" />
                  <span className="text-[14px] font-bold text-gray-900">Vườn cây</span>
                </div>
                <div className="px-4 py-1">
                  {supplier.plantation_area_ha && <InfoRow icon={<MapPin size={14} className="text-gray-400" />} label="Diện tích" value={`${supplier.plantation_area_ha} ha`} mono />}
                  {supplier.rubber_variety && <InfoRow icon={<Droplets size={14} className="text-gray-400" />} label="Giống cao su" value={supplier.rubber_variety} />}
                  {supplier.tree_age_years && <InfoRow icon={<Calendar size={14} className="text-gray-400" />} label="Tuổi cây" value={`${supplier.tree_age_years} năm`} mono />}
                  {supplier.tapping_system && <InfoRow icon={<TreePine size={14} className="text-gray-400" />} label="Chế độ cạo" value={supplier.tapping_system} />}
                </div>
              </div>
            )}

            {/* Ngân hàng */}
            {(supplier.bank_name || supplier.payment_method) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                  <Landmark size={16} className="text-[#8B5E3C]" />
                  <span className="text-[14px] font-bold text-gray-900">Thanh toán</span>
                </div>
                <div className="px-4 py-1">
                  {supplier.payment_method && <InfoRow icon={<Banknote size={14} className="text-gray-400" />} label="Phương thức" value={supplier.payment_method === 'cash' ? 'Tiền mặt' : supplier.payment_method === 'bank' ? 'Chuyển khoản' : supplier.payment_method} />}
                  {supplier.bank_name && <InfoRow icon={<Building2 size={14} className="text-gray-400" />} label="Ngân hàng" value={supplier.bank_name} />}
                  {supplier.bank_account && <InfoRow icon={<Hash size={14} className="text-gray-400" />} label="Số TK" value={supplier.bank_account} mono />}
                  {supplier.bank_holder && <InfoRow icon={<User size={14} className="text-gray-400" />} label="Chủ TK" value={supplier.bank_holder} />}
                </div>
              </div>
            )}

            {/* Ghi chú */}
            {supplier.notes && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                  <FileText size={16} className="text-[#8B5E3C]" />
                  <span className="text-[14px] font-bold text-gray-900">Ghi chú</span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[14px] text-gray-600 leading-relaxed whitespace-pre-wrap">{supplier.notes}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== TICKETS (PHIẾU NHẬP) ===== */}
        {activeTab === 'tickets' && (
          <>
            {intakes.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <FileText size={40} className="text-gray-200 mb-3" />
                <p className="text-[14px] text-gray-400">Chưa có phiếu nhập mủ</p>
              </div>
            ) : (
              <div className="space-y-3">
                {intakes.map(intake => (
                  <IntakeCard key={intake.id} intake={intake} onTap={handleTapIntake} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== DEBT (CÔNG NỢ) ===== */}
        {activeTab === 'debt' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-4 text-center border-b border-gray-50">
                <p className="text-[12px] text-gray-400 mb-1">Tổng công nợ</p>
                <p className={`text-[24px] font-bold font-mono ${intakeErr ? 'text-gray-400' : totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {intakeErr ? 'Chưa đọc được' : totalDebt > 0 ? formatMoney(totalDebt) : 'Hết nợ ✓'}
                </p>
                <p className="text-[12px] text-gray-400 mt-1">{debtIntakes.length} phiếu chưa TT đủ</p>
              </div>
            </div>

            {debtIntakes.length > 0 && (
              <div className="space-y-3">
                {debtIntakes.map(intake => (
                  <IntakeCard key={intake.id} intake={intake} onTap={handleTapIntake} />
                ))}
              </div>
            )}

            {debtIntakes.length === 0 && (
              <div className="flex flex-col items-center py-8">
                <CheckCircle2 size={40} className="text-emerald-300 mb-3" />
                <p className="text-[14px] text-gray-400">Không có công nợ</p>
              </div>
            )}
          </>
        )}

        {/* ===== STATS (THỐNG KÊ) ===== */}
        {activeTab === 'stats' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <TrendingUp size={16} className="text-[#8B5E3C]" />
                <span className="text-[14px] font-bold text-gray-900">Tổng hợp</span>
              </div>
              <div className="px-4 py-1">
                <InfoRow icon={<FileText size={14} className="text-gray-400" />} label="Tổng phiếu nhập" value={`${intakes.length}`} mono />
                <InfoRow icon={<CheckCircle2 size={14} className="text-gray-400" />} label="Đã xác nhận" value={`${confirmedIntakes.length}`} mono />
                <InfoRow icon={<Scale size={14} className="text-gray-400" />} label="Tổng KL nhập" value={formatWeight(totalNet)} mono />
                <InfoRow icon={<Banknote size={14} className="text-gray-400" />} label="Tổng tiền" value={formatMoney(totalAmount)} mono />
              </div>
            </div>

            {/* DRC Breakdown */}
            {avgDrc > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                  <Droplets size={16} className="text-[#8B5E3C]" />
                  <span className="text-[14px] font-bold text-gray-900">DRC</span>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <DRCBar label="Cao nhất" value={highDrc} max={100} />
                  <DRCBar label="Trung bình" value={avgDrc} max={100} />
                  {lowDrc > 0 && <DRCBar label="Thấp nhất" value={lowDrc} max={100} />}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}