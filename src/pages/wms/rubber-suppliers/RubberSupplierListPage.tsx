// ============================================================================
// FILE: src/pages/wms/rubber-suppliers/RubberSupplierListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3.5 — Bước 3.5.4 — V2 FIX navigate paths + real service
// ============================================================================
// CHANGES V2:
// - FIX: navigate /wms/rubber-suppliers/ → /rubber/suppliers/
// - FIX: back button /wms → /rubber
// - CONNECT: rubberSupplierService.getAll() thay vì MOCK_DATA
// - KEEP: toàn bộ UI/design không đổi
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  ChevronRight,
  X,
  Phone,
  MapPin,
  TreePine,
  Star,
  Droplets,
  Scale,
  Filter,
  ArrowLeft,
  Users,
  ShieldCheck,
  Building2,
  Truck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import rubberSupplierService from '../../../services/rubber/rubberSupplierService'

// ============================================================================
// TYPES (match rubber_suppliers table)
// ============================================================================

interface RubberSupplier {
  id: string
  code: string
  name: string
  supplier_type: 'tieu_dien' | 'dai_ly' | 'nong_truong' | 'cong_ty'
  phone?: string
  province: string
  district?: string
  payment_method?: 'cash' | 'transfer' | 'debt'
  quality_rating: number
  avg_drc?: number
  total_weight_kg: number
  total_transactions: number
  is_active: boolean
  created_at: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_FILTERS = [
  { key: 'all', label: 'Tất cả', icon: '👥' },
  { key: 'tieu_dien', label: 'Tiểu điền', icon: '🌿' },
  { key: 'dai_ly', label: 'Đại lý', icon: '🏪' },
  { key: 'nong_truong', label: 'Nông trường', icon: '🏭' },
  { key: 'cong_ty', label: 'Công ty', icon: '🏢' },
] as const

const TYPE_CONFIG: Record<string, {
  label: string
  icon: React.ReactNode
  className: string
  borderColor: string
}> = {
  tieu_dien: {
    label: 'Tiểu điền',
    icon: <TreePine size={12} />,
    className: 'bg-green-50 text-green-700 border-green-200',
    borderColor: '#16A34A',
  },
  dai_ly: {
    label: 'Đại lý',
    icon: <Truck size={12} />,
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    borderColor: '#2563EB',
  },
  nong_truong: {
    label: 'Nông trường',
    icon: <Building2 size={12} />,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    borderColor: '#D97706',
  },
  cong_ty: {
    label: 'Công ty',
    icon: <ShieldCheck size={12} />,
    className: 'bg-purple-50 text-purple-700 border-purple-200',
    borderColor: '#7C3AED',
  },
}

const PAYMENT_LABELS: Record<string, { label: string; className: string }> = {
  cash: { label: 'Tiền mặt', className: 'text-emerald-600' },
  transfer: { label: 'Chuyển khoản', className: 'text-blue-600' },
  debt: { label: 'Công nợ', className: 'text-amber-600' },
}

const SORT_OPTIONS = [
  { key: 'name', label: 'Tên A→Z' },
  { key: 'quality_rating', label: 'Đánh giá ★' },
  { key: 'total_weight_kg', label: 'Tổng KL' },
  { key: 'avg_drc', label: 'DRC TB' },
  { key: 'created_at', label: 'Mới nhất' },
] as const

// ============================================================================
// HELPERS
// ============================================================================

function formatWeight(kg: number): string {
  if (kg >= 1000000) return `${(kg / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} tấn`
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} tấn`
  return `${kg.toLocaleString('vi-VN')} kg`
}

function formatNumber(num: number): string {
  return num.toLocaleString('vi-VN')
}

function renderStars(rating: number): React.ReactNode {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={12}
          className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}
        />
      ))}
    </span>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const conf = TYPE_CONFIG[type]
  if (!conf) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold leading-none rounded-full border ${conf.className}`}>
      {conf.icon}
      {conf.label}
    </span>
  )
}

const StatCard: React.FC<{
  label: string; value: string; sub?: string; icon: React.ReactNode; color: string
}> = ({ label, value, sub, icon, color }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex-1 min-w-0">
    <div className="flex items-center gap-2 mb-1.5">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <span className="text-[11px] font-medium text-gray-500 truncate">{label}</span>
    </div>
    <div className="font-bold text-[18px] text-gray-900 leading-tight font-mono">{value}</div>
    {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
  </div>
)

const SupplierCard: React.FC<{
  supplier: RubberSupplier
  onTap: (id: string) => void
}> = ({ supplier, onTap }) => {
  const typeConf = TYPE_CONFIG[supplier.supplier_type] || TYPE_CONFIG.tieu_dien
  const paymentConf = PAYMENT_LABELS[supplier.payment_method || 'cash'] || PAYMENT_LABELS.cash

  return (
    <button
      type="button"
      onClick={() => onTap(supplier.id)}
      className="w-full text-left bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.98] transition-transform duration-150 overflow-hidden"
    >
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-[14px]" style={{ backgroundColor: typeConf.borderColor }} />
        <div className="flex-1 p-4">
          {/* Row 1: Name + Type badge */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[15px] font-bold text-gray-900 truncate">{supplier.name}</span>
                {!supplier.is_active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">Ngưng</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-mono text-gray-400">{supplier.code}</span>
                <TypeBadge type={supplier.supplier_type} />
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0 mt-1" />
          </div>

          {/* Row 2: Location + Phone */}
          <div className="flex items-center gap-3 mb-2.5 text-[12px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} className="text-gray-400" />
              {supplier.district ? `${supplier.district}, ${supplier.province}` : supplier.province}
            </span>
            {supplier.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone size={12} className="text-gray-400" />
                {supplier.phone}
              </span>
            )}
          </div>

          {/* Row 3: Stats grid */}
          <div className="grid grid-cols-4 gap-2 pt-2.5 border-t border-gray-50">
            <div className="text-center">
              <div className="mb-0.5">{renderStars(supplier.quality_rating)}</div>
              <div className="text-[10px] text-gray-400">Đánh giá</div>
            </div>
            <div className="text-center">
              <div className="text-[14px] font-bold font-mono text-[#8B5E3C]">
                {supplier.avg_drc ? `${supplier.avg_drc.toFixed(1)}%` : '—'}
              </div>
              <div className="text-[10px] text-gray-400">DRC TB</div>
            </div>
            <div className="text-center">
              <div className="text-[14px] font-bold font-mono text-gray-700">
                {formatWeight(supplier.total_weight_kg)}
              </div>
              <div className="text-[10px] text-gray-400">Tổng KL</div>
            </div>
            <div className="text-center">
              <div className="text-[14px] font-bold font-mono text-gray-700">
                {formatNumber(supplier.total_transactions)}
              </div>
              <div className="text-[10px] text-gray-400">Giao dịch</div>
            </div>
          </div>

          {/* Row 4: Payment method */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
            <span className={`text-[11px] font-medium ${paymentConf.className}`}>
              💰 {paymentConf.label}
            </span>
            <span className="text-[11px] text-gray-400">
              {new Date(supplier.created_at).toLocaleDateString('vi-VN')}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RubberSupplierListPage() {
  const navigate = useNavigate()

  const [suppliers, setSuppliers] = useState<RubberSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('name')
  const [showSort, setShowSort] = useState(false)
  const [showActiveOnly, setShowActiveOnly] = useState(true)

  // ✅ V2: Load data từ service thật
  const loadSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rubberSupplierService.getAll({
        page: 1,
        pageSize: 200,
      })
      // Service trả về { data, total, ... } hoặc array trực tiếp
      const list = Array.isArray(result) ? result : (result.data || [])
      setSuppliers(list)
    } catch (err) {
      console.error('Lỗi tải NCC mủ:', err)
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  // Filter + sort (client-side vì đã load hết)
  const filtered = suppliers
    .filter(s => {
      if (showActiveOnly && !s.is_active) return false
      if (activeFilter !== 'all' && s.supplier_type !== activeFilter) return false
      if (searchText) {
        const q = searchText.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.phone && s.phone.includes(q)) ||
          (s.province && s.province.toLowerCase().includes(q)) ||
          (s.district && s.district.toLowerCase().includes(q))
        )
      }
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'quality_rating': return (b.quality_rating || 0) - (a.quality_rating || 0)
        case 'total_weight_kg': return (b.total_weight_kg || 0) - (a.total_weight_kg || 0)
        case 'avg_drc': return (b.avg_drc || 0) - (a.avg_drc || 0)
        case 'created_at': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        default: return a.name.localeCompare(b.name, 'vi')
      }
    })

  // Summary stats
  const activeSuppliers = suppliers.filter(s => s.is_active)
  const totalWeight = activeSuppliers.reduce((s, t) => s + (t.total_weight_kg || 0), 0)
  const totalTx = activeSuppliers.reduce((s, t) => s + (t.total_transactions || 0), 0)
  const withDrc = activeSuppliers.filter(s => s.avg_drc)
  const avgDrc = withDrc.length > 0
    ? withDrc.reduce((s, t) => s + (t.avg_drc || 0), 0) / withDrc.length
    : 0

  // ✅ V2: FIX navigate paths — /rubber/suppliers/ thay vì /wms/rubber-suppliers/
  const handleTapSupplier = (id: string) => {
    navigate(`/rubber/suppliers/${id}`)
  }

  const handleCreate = () => {
    navigate('/rubber/suppliers/new')
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2] pb-24">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-[#5D3A1A] via-[#8B5E3C] to-[#A0714B] text-white safe-area-top">
        <div className="px-4 pt-4 pb-5">
          <div className="flex items-center gap-3 mb-4">
            {/* ✅ V2: FIX back button → /rubber thay vì /wms */}
            <button type="button" onClick={() => navigate('/rubber')}
              className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center active:bg-white/20">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold leading-tight">Nhà cung cấp mủ</h1>
              <p className="text-[12px] text-white/60">Quản lý NCC nguyên liệu cao su</p>
            </div>
            <button type="button" onClick={() => setShowActiveOnly(!showActiveOnly)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${showActiveOnly ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'}`}>
              {showActiveOnly ? 'Đang HĐ' : 'Tất cả'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <StatCard label="NCC" value={String(activeSuppliers.length)}
              icon={<Users size={14} className="text-white" />} color="bg-[#8B5E3C]" />
            <StatCard label="Tổng KL" value={formatWeight(totalWeight)}
              icon={<Scale size={14} className="text-white" />} color="bg-[#A0714B]" />
            <StatCard label="Giao dịch" value={formatNumber(totalTx)}
              icon={<Truck size={14} className="text-white" />} color="bg-[#6B4423]" />
            <StatCard label="DRC TB" value={avgDrc > 0 ? `${avgDrc.toFixed(1)}%` : '—'}
              icon={<Droplets size={14} className="text-white" />} color="bg-[#D97706]" />
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="px-4 -mt-3 relative z-10">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Tìm tên, mã, SĐT, vùng..."
            value={searchText} onChange={e => setSearchText(e.target.value)}
            className="w-full h-12 pl-10 pr-10 bg-white rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 shadow-md focus:outline-none focus:ring-2 focus:ring-[#8B5E3C]/30 focus:border-[#8B5E3C]" />
          {searchText && (
            <button type="button" onClick={() => setSearchText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <X size={14} className="text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* FILTER CHIPS + SORT */}
      <div className="px-4 mt-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-x-auto no-scrollbar">
            <div className="flex gap-1.5 pb-1">
              {TYPE_FILTERS.map(f => (
                <button key={f.key} type="button" onClick={() => setActiveFilter(f.key)}
                  className={`inline-flex items-center gap-1 whitespace-nowrap px-3 py-2 rounded-xl text-[13px] font-medium min-h-[40px] transition-colors duration-150 ${
                    activeFilter === f.key
                      ? 'bg-[#8B5E3C] text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}>
                  <span className="text-[12px]">{f.icon}</span>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <button type="button" onClick={() => setShowSort(!showSort)}
              className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
              <Filter size={16} className="text-gray-500" />
            </button>
            {showSort && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)} />
                <div className="absolute right-0 top-12 z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[160px]">
                  {SORT_OPTIONS.map(opt => (
                    <button key={opt.key} type="button"
                      onClick={() => { setSortBy(opt.key); setShowSort(false) }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] ${sortBy === opt.key ? 'text-[#8B5E3C] font-semibold bg-orange-50' : 'text-gray-600'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 mb-1">
          <span className="text-[12px] text-gray-400">
            {filtered.length} NCC{searchText && ` • "${searchText}"`}
          </span>
          <span className="text-[11px] text-gray-400">
            Sắp xếp: {SORT_OPTIONS.find(o => o.key === sortBy)?.label}
          </span>
        </div>
      </div>

      {/* SUPPLIER LIST */}
      <div className="px-4 mt-2 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-[14px] border border-gray-100 p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-1 h-24 bg-gray-200 rounded" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {[1, 2, 3, 4].map(j => <div key={j} className="h-8 bg-gray-100 rounded" />)}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Users size={28} className="text-gray-300" />
            </div>
            <p className="text-[15px] font-medium text-gray-500 mb-1">
              {searchText ? 'Không tìm thấy NCC' : 'Chưa có NCC mủ'}
            </p>
            <p className="text-[13px] text-gray-400">
              {searchText ? 'Thử từ khóa khác' : 'Nhấn + để thêm NCC mới'}
            </p>
          </div>
        ) : (
          filtered.map(supplier => (
            <SupplierCard key={supplier.id} supplier={supplier} onTap={handleTapSupplier} />
          ))
        )}
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-4 z-30 safe-area-bottom">
        <button type="button" onClick={handleCreate}
          className="w-14 h-14 bg-[#8B5E3C] text-white rounded-2xl shadow-lg shadow-[#8B5E3C]/30 flex items-center justify-center active:scale-95 transition-transform duration-150">
          <Plus size={24} />
        </button>
      </div>
    </div>
  )
}