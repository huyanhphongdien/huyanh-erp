// ============================================================================
// FILE: src/pages/rubber/RubberProfileListPage.tsx
// MODULE: Thu mua Mủ — Huy Anh Rubber ERP
// PHASE: 3.6 — Lý lịch mủ phiếu
// BẢNG: rubber_profiles
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Loader2, Search, X,
  ChevronLeft, ChevronRight, Truck, Scale, MapPin,
  CheckCircle2, XCircle, Clock, Shield, FileText,
  ChevronRight as ChevR, AlertTriangle, User, Package,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface RubberProfile {
  id: string
  profile_code?: string
  intake_date: string
  procurement_team?: string
  vehicle_plate: string
  driver_name?: string
  has_trailer?: boolean
  trailer_plate?: string
  origin?: string
  product_code?: string
  weight_at_origin_kg?: number
  weight_at_factory_kg?: number
  weight_diff_kg?: number
  weight_diff_percent?: number
  compartments?: any
  batch_ids?: string[]
  qc_approved: boolean
  accounting_approved: boolean
  procurement_approved: boolean
  security_approved: boolean
  status: string
  notes?: string
  created_at: string
}

// ============================================================================
// HELPERS
// ============================================================================

function fmtWeight(kg?: number | null): string {
  if (!kg) return '–'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}T`
  return `${Math.round(kg).toLocaleString('vi-VN')} kg`
}
function fmtDate(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}
function fmtPercent(p?: number | null): string {
  if (p == null) return '–'
  return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`
}
function getMonthLabel(y: number, m: number) { return `Tháng ${m}/${y}` }

function getApprovalCount(p: RubberProfile): number {
  return [p.qc_approved, p.accounting_approved, p.procurement_approved, p.security_approved].filter(Boolean).length
}

const STATUS_CFG: Record<string, { label: string; className: string; border: string }> = {
  draft:          { label: 'Nháp',       className: 'bg-gray-100 text-gray-600',      border: '#9CA3AF' },
  partial_signed: { label: 'Ký 1 phần',  className: 'bg-yellow-50 text-yellow-700',   border: '#EAB308' },
  fully_signed:   { label: 'Đã ký đủ',   className: 'bg-blue-50 text-blue-700',       border: '#2563EB' },
  confirmed:      { label: 'Hoàn tất',   className: 'bg-emerald-50 text-emerald-700', border: '#16A34A' },
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const MonthPicker: React.FC<{
  year: number; month: number; onChange: (y: number, m: number) => void
}> = ({ year, month, onChange }) => (
  <div className="flex items-center justify-center gap-1 py-2 bg-white border-b border-gray-100">
    <button type="button" onClick={() => month === 1 ? onChange(year - 1, 12) : onChange(year, month - 1)}
      className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
      <ChevronLeft className="w-5 h-5 text-gray-600" />
    </button>
    <span className="text-[15px] font-bold text-gray-900 min-w-[120px] text-center">{getMonthLabel(year, month)}</span>
    <button type="button" onClick={() => month === 12 ? onChange(year + 1, 1) : onChange(year, month + 1)}
      className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
      <ChevronRight className="w-5 h-5 text-gray-600" />
    </button>
  </div>
)

const ApprovalBadges: React.FC<{ profile: RubberProfile }> = ({ profile }) => {
  const items = [
    { key: 'QC', approved: profile.qc_approved },
    { key: 'KT', approved: profile.accounting_approved },
    { key: 'TM', approved: profile.procurement_approved },
    { key: 'BV', approved: profile.security_approved },
  ]
  return (
    <div className="flex items-center gap-1">
      {items.map(item => (
        <span key={item.key}
          className={`w-7 h-7 flex items-center justify-center rounded-md text-[10px] font-bold ${
            item.approved ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
          }`}>
          {item.key}
        </span>
      ))}
    </div>
  )
}

const ProfileCard: React.FC<{
  profile: RubberProfile; onTap: (id: string) => void
}> = ({ profile, onTap }) => {
  const sCfg = STATUS_CFG[profile.status] || STATUS_CFG.draft
  const approvalCount = getApprovalCount(profile)
  const compartmentCount = Array.isArray(profile.compartments) ? profile.compartments.length : 0
  const diffColor = (profile.weight_diff_percent || 0) > 2 ? 'text-red-600' : (profile.weight_diff_percent || 0) > 1 ? 'text-yellow-600' : 'text-emerald-600'

  return (
    <button type="button" onClick={() => onTap(profile.id)}
      className="w-full text-left bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.98] transition-transform overflow-hidden">
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-[14px]" style={{ backgroundColor: sCfg.border }} />
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-bold text-gray-900 font-mono truncate">
                {profile.profile_code || `#${profile.id.slice(0, 8)}`}
              </span>
              <span className="text-[12px] text-gray-400">{fmtDate(profile.intake_date)}</span>
            </div>
            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${sCfg.className}`}>
              {sCfg.label}
            </span>
          </div>

          {/* Vehicle info */}
          <div className="flex items-center gap-3 text-[13px] text-gray-600 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Truck className="w-4 h-4 text-gray-400" /> {profile.vehicle_plate}
            </span>
            {profile.has_trailer && profile.trailer_plate && (
              <span className="text-[12px] text-gray-400">+ {profile.trailer_plate}</span>
            )}
            {profile.driver_name && (
              <span className="inline-flex items-center gap-1 text-[12px]">
                <User className="w-3 h-3" /> {profile.driver_name}
              </span>
            )}
            {profile.origin && (
              <span className="inline-flex items-center gap-1 text-[12px]">
                <MapPin className="w-3 h-3" /> {profile.origin}
              </span>
            )}
          </div>

          {/* Weight comparison */}
          <div className="flex items-center gap-4 text-[13px] mb-2">
            {profile.weight_at_origin_kg != null && (
              <span className="text-gray-500">Gốc: <span className="font-mono font-semibold text-gray-700">{fmtWeight(profile.weight_at_origin_kg)}</span></span>
            )}
            {profile.weight_at_factory_kg != null && (
              <span className="text-gray-500">NM: <span className="font-mono font-semibold text-[#1B4D3E]">{fmtWeight(profile.weight_at_factory_kg)}</span></span>
            )}
            {profile.weight_diff_percent != null && (
              <span className={`font-mono font-semibold ${diffColor}`}>{fmtPercent(profile.weight_diff_percent)}</span>
            )}
          </div>

          {/* Bottom: compartments + product + approvals */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] text-gray-400">
              {compartmentCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Package className="w-3 h-3" /> {compartmentCount} khoang
                </span>
              )}
              {profile.product_code && (
                <span className="font-mono">{profile.product_code}</span>
              )}
              {profile.procurement_team && (
                <span>Đội: {profile.procurement_team}</span>
              )}
            </div>
            <ApprovalBadges profile={profile} />
          </div>
        </div>
        <div className="flex items-center pr-3">
          <ChevR className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const RubberProfileListPage: React.FC = () => {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [profiles, setProfiles] = useState<RubberProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

      const { data, error: qErr } = await supabase
        .from('rubber_profiles')
        .select('*')
        .gte('intake_date', startDate)
        .lt('intake_date', endDate)
        .order('intake_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (qErr) throw qErr
      setProfiles((data || []) as RubberProfile[])
    } catch (err: unknown) {
      console.error('Lỗi tải lý lịch phiếu:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { loadData() }, [loadData])

  const displayed = useMemo(() => {
    let list = [...profiles]
    if (activeFilter !== 'all') list = list.filter(p => p.status === activeFilter)
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase()
      list = list.filter(p =>
        p.profile_code?.toLowerCase().includes(s) ||
        p.vehicle_plate?.toLowerCase().includes(s) ||
        p.driver_name?.toLowerCase().includes(s) ||
        p.product_code?.toLowerCase().includes(s) ||
        p.origin?.toLowerCase().includes(s)
      )
    }
    return list
  }, [profiles, activeFilter, searchText])

  const handleTap = (id: string) => navigate(`/rubber/profiles/${id}`)

  const filters = [
    { key: 'all', label: 'Tất cả' },
    { key: 'draft', label: 'Nháp' },
    { key: 'partial_signed', label: 'Ký 1 phần' },
    { key: 'confirmed', label: 'Hoàn tất' },
  ]

  // Summary
  const summary = useMemo(() => ({
    total: profiles.length,
    fullyApproved: profiles.filter(p => getApprovalCount(p) === 4).length,
    totalOrigin: profiles.reduce((s, p) => s + (p.weight_at_origin_kg || 0), 0),
    totalFactory: profiles.reduce((s, p) => s + (p.weight_at_factory_kg || 0), 0),
  }), [profiles])

  return (
    <div className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-[#1B4D3E] text-white">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10 -ml-2">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold leading-tight">📋 Lý lịch phiếu</h1>
              <p className="text-[11px] text-white/60">Lý lịch mủ phiếu xe/container</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={loadData} disabled={loading}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchText('') }}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10">
              {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm mã phiếu, biển xe, tài xế..."
                className="w-full pl-10 pr-10 py-2.5 bg-white/10 border border-white/20 rounded-xl text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                autoFocus />
            </div>
          </div>
        )}
      </div>

      <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />

      {/* FILTER */}
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide bg-white border-b border-gray-100">
        {filters.map(f => {
          const count = f.key === 'all' ? profiles.length : profiles.filter(p => p.status === f.key).length
          return (
            <button key={f.key} type="button" onClick={() => setActiveFilter(f.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all min-h-[36px] ${
                activeFilter === f.key ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
              }`}>
              {f.label} {count > 0 && <span className="ml-1 text-[11px] opacity-70">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* CONTENT */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#1B4D3E] animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <AlertTriangle className="w-10 h-10 text-red-300 mb-3" />
          <p className="text-[14px] text-red-500 mb-3">{error}</p>
          <button type="button" onClick={loadData}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B4D3E] text-white rounded-xl text-[14px] font-semibold active:scale-[0.97]">
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        </div>
      )}

      {!loading && !error && profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <FileText className="w-12 h-12 text-gray-300 mb-3" />
          <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chưa có lý lịch phiếu</h3>
          <p className="text-[13px] text-gray-400 text-center max-w-[240px]">
            {getMonthLabel(year, month)} chưa có phiếu lý lịch mủ nào
          </p>
        </div>
      )}

      {!loading && !error && profiles.length > 0 && (
        <>
          {/* Summary */}
          <div className="px-4 py-3 grid grid-cols-2 gap-2">
            <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-[11px] text-gray-400">Phiếu</p>
              <p className="text-[18px] font-bold text-gray-800 font-mono">{summary.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-[11px] text-gray-400">Đã ký đủ 4/4</p>
              <p className="text-[18px] font-bold text-emerald-600 font-mono">{summary.fullyApproved}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-[11px] text-gray-400">KL gốc</p>
              <p className="text-[16px] font-bold text-gray-700 font-mono">{fmtWeight(summary.totalOrigin)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-[11px] text-gray-400">KL tại NM</p>
              <p className="text-[16px] font-bold text-[#1B4D3E] font-mono">{fmtWeight(summary.totalFactory)}</p>
            </div>
          </div>

          <div className="px-4 pb-24 space-y-3">
            {displayed.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] text-gray-400">Không tìm thấy kết quả</p>
              </div>
            ) : (
              displayed.map(p => <ProfileCard key={p.id} profile={p} onTap={handleTap} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default RubberProfileListPage