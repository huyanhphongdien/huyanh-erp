// ============================================================================
// BUSINESS PARTNER LIST PAGE — HAC-13 v10
// File: src/pages/master-data/BusinessPartnerListPage.tsx
// ============================================================================
//
// Trang master data BP gộp KH + NCC + đại lý B2B + hộ NCC mủ. Mỗi BP có nhiều
// vai trò (CUSTOMER_INTL, SUPPLIER_GENERAL, PARTNER_B2B, RUBBER_SUPPLIER).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, RefreshCw } from 'lucide-react'

import {
  businessPartnerService,
  type BpRoleType,
  type BpTypeCode,
  type BpStatus,
} from '../../services/businessPartnerService'
import { Hac13CodeDisplay } from '../../components/master-data/Hac13CodeDisplay'

const ROLE_LABELS: Record<BpRoleType, string> = {
  CUSTOMER_INTL: 'KH quốc tế',
  CUSTOMER_DOM: 'KH nội địa',
  SUPPLIER_GENERAL: 'NCC',
  PARTNER_B2B: 'Đại lý B2B',
  RUBBER_SUPPLIER: 'NCC mủ',
}

const ROLE_COLORS: Record<BpRoleType, string> = {
  CUSTOMER_INTL: 'bg-indigo-100 text-indigo-700',
  CUSTOMER_DOM: 'bg-sky-100 text-sky-700',
  SUPPLIER_GENERAL: 'bg-amber-100 text-amber-700',
  PARTNER_B2B: 'bg-pink-100 text-pink-700',
  RUBBER_SUPPLIER: 'bg-lime-100 text-lime-700',
}

export function BusinessPartnerListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeCode, setTypeCode] = useState<'all' | BpTypeCode>('all')
  const [roleType, setRoleType] = useState<'all' | BpRoleType>('all')
  const [status, setStatus] = useState<'all' | BpStatus>('all')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['business-partners', { page, search, typeCode, roleType, status }],
    queryFn: () =>
      businessPartnerService.list({
        page,
        pageSize: 20,
        search: search || undefined,
        typeCode: typeCode === 'all' ? undefined : typeCode,
        roleType: roleType === 'all' ? undefined : roleType,
        status: status === 'all' ? undefined : status,
      }),
    staleTime: 60_000,
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Đối tác (Business Partner)</h1>
          <p className="text-sm text-slate-500">
            Mã định danh HAC-13 v10 — gộp KH, NCC, đại lý B2B, hộ NCC mủ vào 1 master.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3 py-2 border rounded-md hover:bg-slate-50 flex items-center gap-1 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
          <button
            onClick={() => navigate('/master-data/business-partners/new')}
            className="px-3 py-2 bg-emerald-700 text-white rounded-md hover:bg-emerald-800 flex items-center gap-1 text-sm"
          >
            <Plus className="w-4 h-4" />
            Thêm đối tác
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-white p-3 rounded-md border">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm HAC-13, tên, MST, email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <select
          value={typeCode}
          onChange={(e) => {
            setTypeCode(e.target.value === 'all' ? 'all' : (Number(e.target.value) as BpTypeCode))
            setPage(1)
          }}
          className="px-3 py-2 border rounded-md text-sm bg-white"
        >
          <option value="all">Tất cả loại</option>
          <option value="1">BP trong nước</option>
          <option value="2">BP nước ngoài</option>
        </select>
        <select
          value={roleType}
          onChange={(e) => {
            setRoleType((e.target.value === 'all' ? 'all' : e.target.value) as 'all' | BpRoleType)
            setPage(1)
          }}
          className="px-3 py-2 border rounded-md text-sm bg-white"
        >
          <option value="all">Tất cả vai trò</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus((e.target.value === 'all' ? 'all' : e.target.value) as 'all' | BpStatus)
            setPage(1)
          }}
          className="px-3 py-2 border rounded-md text-sm bg-white"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="inactive">Tạm dừng</option>
          <option value="blocked">Khóa</option>
          <option value="pending">Chờ duyệt</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">HAC-13</th>
              <th className="px-4 py-3 font-medium">Tên pháp nhân</th>
              <th className="px-4 py-3 font-medium">MST</th>
              <th className="px-4 py-3 font-medium">Quốc gia</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Đang tải…
                </td>
              </tr>
            )}
            {!isLoading && (data?.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Không có đối tác nào khớp bộ lọc.
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((bp) => (
              <tr
                key={bp.id}
                onClick={() => navigate(`/master-data/business-partners/${bp.id}`)}
                className="border-t hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-4 py-2">
                  <Hac13CodeDisplay code={bp.hac13_code} showTypeBadge variant="badge" showCopy={false} />
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-900">{bp.legal_name}</div>
                  {bp.short_name && <div className="text-xs text-slate-500">{bp.short_name}</div>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{bp.tax_code || '—'}</td>
                <td className="px-4 py-2">{bp.country_iso}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={bp.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div>
            Trang {data.page} / {data.totalPages} · {data.total} đối tác
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 border rounded-md disabled:opacity-40"
            >
              Trước
            </button>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border rounded-md disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: BpStatus }) {
  const cls =
    status === 'active'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'inactive'
        ? 'bg-slate-100 text-slate-700'
        : status === 'blocked'
          ? 'bg-rose-100 text-rose-700'
          : 'bg-amber-100 text-amber-700'
  const label =
    status === 'active'
      ? 'Hoạt động'
      : status === 'inactive'
        ? 'Tạm dừng'
        : status === 'blocked'
          ? 'Khóa'
          : 'Chờ duyệt'
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{label}</span>
}

export default BusinessPartnerListPage

// Helper export — danh sách label vai trò (dùng ngoài file).
export { ROLE_LABELS, ROLE_COLORS }
