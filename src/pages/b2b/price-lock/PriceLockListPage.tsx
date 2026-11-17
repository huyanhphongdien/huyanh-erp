// ============================================================================
// PHIẾU CHỐT GIÁ — danh sách
// Route: /b2b/price-lock
// ============================================================================

import { useState, useEffect, useCallback, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Printer, FileSignature, Loader2, Trash2, XCircle } from 'lucide-react'
import {
  priceLockService,
  PURCHASE_METHOD_LABELS,
  PRICE_LOCK_STATUS_LABELS,
  type PriceLockTicket,
  type PriceLockStatus,
} from '../../../services/b2b/priceLockService'
import { useAuthStore } from '../../../stores/authStore'
import { Modal, message } from 'antd'
import { fmtDate, fmtNum } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import PageState from '../../../components/common/PageState'
import { LimitNotice } from '../../../components/common/tableDefaults'

const STATUS_CLASS: Record<PriceLockStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  locked: 'bg-emerald-100 text-emerald-700',
  used: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
}

// Sổ tải một cục tối đa N phiếu — chạm trần thì báo (LimitNotice)
const LOAD_LIMIT = 200

const fmt = (n: number | null | undefined) => fmtNum(n, 3)

export default function PriceLockListPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  // Quyền quản lý PCG: admin / quản lý (trưởng thu mua). Người tạo được xóa NHÁP của mình.
  const canManage = user?.role === 'admin' || user?.role === 'manager'
  const canDeleteDraft = (r: PriceLockTicket) => canManage || (!!user?.id && r.created_by === user.id)
  const [rows, setRows] = useState<PriceLockTicket[]>([])
  const [loading, setLoading] = useState(true)
  // Lỗi tải ≠ "Chưa có phiếu" — trước đây lỗi mạng bị nuốt rồi hiện màn trống giả (audit 17/11/2026)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PriceLockStatus | ''>('')

  // Xác nhận bằng Modal antd (nút đỏ, nêu hệ quả) thay confirm()/alert() của trình duyệt (audit 17/11/2026)
  function handleDelete(e: MouseEvent, r: PriceLockTicket) {
    e.stopPropagation()
    Modal.confirm({
      title: `Xoá hẳn phiếu nháp ${r.code || ''}?`,
      content: 'Phiếu nháp bị xoá vĩnh viễn, không khôi phục được.',
      okText: 'Xoá phiếu',
      cancelText: 'Không',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await priceLockService.remove(r.id)
          message.success(`Đã xoá phiếu nháp ${r.code || ''}`)
          load()
        } catch (err) {
          message.error(dichLoiHeThong(err, 'Xoá thất bại'))
        }
      },
    })
  }
  function handleCancel(e: MouseEvent, r: PriceLockTicket) {
    e.stopPropagation()
    Modal.confirm({
      title: `Huỷ phiếu chốt giá ${r.code || ''}?`,
      content: 'Phiếu sẽ không dùng được nữa để áp giá cho phiếu cân (vẫn giữ lịch sử).',
      okText: 'Huỷ phiếu',
      cancelText: 'Không',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await priceLockService.cancel(r.id)
          message.success(`Đã huỷ phiếu chốt giá ${r.code || ''}`)
          load()
        } catch (err) {
          message.error(dichLoiHeThong(err, 'Huỷ thất bại'))
        }
      },
    })
  }

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    priceLockService
      .list({ search: search || undefined, status: status || undefined, limit: LOAD_LIMIT })
      .then(setRows)
      .catch((e) => { console.error(e); setRows([]); setLoadError(e) })
      .finally(() => setLoading(false))
  }, [search, status])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <FileSignature className="text-emerald-700" size={22} />
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800">Phiếu chốt giá</h1>
            <p className="text-xs text-gray-400">Thoả thuận giá trước khi cân hàng (BM CL.BMQT.KH.01.01)</p>
          </div>
          <button
            onClick={() => navigate('/b2b/price-lock/new')}
            className="px-3 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 min-h-[44px]"
          >
            <Plus size={16} /> Tạo phiếu
          </button>
        </div>
        {/* Filters */}
        <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã phiếu / tên khách hàng…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PriceLockStatus | '')}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(PRICE_LOCK_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={20} /> Đang tải…
          </div>
        ) : loadError ? (
          <PageState error={loadError} onRetry={load} />
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <FileSignature size={40} className="mx-auto mb-3 opacity-40" />
            <p>Chưa có phiếu chốt giá nào.</p>
            <button onClick={() => navigate('/b2b/price-lock/new')} className="mt-4 text-emerald-600 text-sm font-medium">
              + Tạo phiếu đầu tiên
            </button>
          </div>
        ) : (
          <>
          <LimitNotice shown={rows.length} limit={LOAD_LIMIT} what="phiếu" />
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-3 py-2.5 font-medium">Mã phiếu</th>
                  <th className="px-3 py-2.5 font-medium">Ngày chốt</th>
                  <th className="px-3 py-2.5 font-medium">Điểm cân</th>
                  <th className="px-3 py-2.5 font-medium">Hình thức</th>
                  <th className="px-3 py-2.5 font-medium text-center">Số đại lý</th>
                  <th className="px-3 py-2.5 font-medium text-right">Tổng KL dự kiến (kg)</th>
                  <th className="px-3 py-2.5 font-medium text-right">Giá áp (₫/kg)</th>
                  <th className="px-3 py-2.5 font-medium text-center">Trạng thái</th>
                  <th className="px-3 py-2.5 font-medium text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lines = r.dealer_lines || []
                  const totalWeight = lines.reduce((s, d) => s + (d.expected_weight_kg || 0), 0)
                  const prices = lines.map((d) => d.price_per_ton).filter((p): p is number => p != null && p > 0)
                  const priceLabel = prices.length === 0 ? '—'
                    : prices.length === 1 || Math.min(...prices) === Math.max(...prices) ? fmt(prices[0])
                    : `${fmt(Math.min(...prices))}–${fmt(Math.max(...prices))}`
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/b2b/price-lock/${r.id}`)}
                      className="border-t border-gray-100 hover:bg-emerald-50/40 cursor-pointer"
                    >
                      <td className="px-3 py-2.5 font-semibold text-emerald-700">{r.code || '—'}</td>
                      <td className="px-3 py-2.5">{fmtDate(r.lock_date)}</td>
                      <td className="px-3 py-2.5">{r.facility_label || '—'}</td>
                      <td className="px-3 py-2.5">{r.purchase_method ? PURCHASE_METHOD_LABELS[r.purchase_method] : '—'}</td>
                      <td className="px-3 py-2.5 text-center">{lines.length || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmt(totalWeight)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{priceLabel}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[r.status]}`}>
                          {PRICE_LOCK_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/b2b/price-lock/${r.id}/print`) }}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                          title="In phiếu chốt giá"
                        >
                          <Printer size={16} />
                        </button>
                        {/* NHÁP → Xóa hẳn (người tạo / admin / quản lý) */}
                        {r.status === 'draft' && canDeleteDraft(r) && (
                          <button
                            onClick={(e) => handleDelete(e, r)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                            title="Xóa phiếu nháp"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        {/* ĐÃ CHỐT (chưa dùng) → Huỷ mềm (admin / quản lý) */}
                        {r.status === 'locked' && canManage && (
                          <button
                            onClick={(e) => handleCancel(e, r)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                            title="Huỷ phiếu chốt giá"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  )
}
