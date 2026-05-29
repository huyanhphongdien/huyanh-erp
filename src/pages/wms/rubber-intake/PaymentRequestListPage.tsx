// ============================================================================
// FILE: src/pages/wms/rubber-intake/PaymentRequestListPage.tsx
// MODULE: WMS / Nhập kho mủ — Đề nghị thanh toán (ĐỢT 1)
// Danh sách đề nghị thanh toán. Tạo mới → gom phiếu cân.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, RefreshCw, Loader2, ChevronRight, Receipt,
  Calendar, Scale, Building2,
} from 'lucide-react'
import { paymentRequestService, type PaymentRequest, type PaymentRequestStatus } from '../../../services/wms/paymentRequestService'

function fmtVnd(a?: number | null): string {
  return (a || 0).toLocaleString('vi-VN') + 'đ'
}
function fmtDate(s?: string | null): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const STATUS_CFG: Record<PaymentRequestStatus, { label: string; cls: string }> = {
  draft:     { label: 'Nháp',     cls: 'bg-gray-100 text-gray-600' },
  submitted: { label: 'Đã gửi',   cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'Đã duyệt', cls: 'bg-blue-100 text-blue-700' },
  paid:      { label: 'Đã chi',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Đã huỷ',   cls: 'bg-red-100 text-red-600' },
}

type FilterStatus = 'all' | PaymentRequestStatus

const PaymentRequestListPage: React.FC = () => {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await paymentRequestService.list({
        status: filter === 'all' ? undefined : filter,
        limit: 200,
      })
      setRows(data)
    } catch (e) {
      console.error('[PaymentRequestList] load error', e)
    }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const totalAmount = rows.reduce((s, r) => s + r.total_amount, 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/rubber/intake')} className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-4.5 h-4.5 text-emerald-600" /> Đề nghị thanh toán
            </h1>
            <p className="text-[12px] text-gray-400">Gom phiếu cân → chi tiền người bán</p>
          </div>
          <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100">
            <RefreshCw className={`w-4.5 h-4.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Status filter pills */}
        <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto">
          {(['all', 'draft', 'submitted', 'approved', 'paid'] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition ${
                filter === s ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {s === 'all' ? 'Tất cả' : STATUS_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-gray-400">Tổng giá trị ({rows.length} phiếu)</p>
            <p className="text-[20px] font-bold text-emerald-600 font-mono">{fmtVnd(totalAmount)}</p>
          </div>
          <button
            onClick={() => navigate('/rubber/payment-requests/new')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[13.5px] font-semibold shadow-sm active:scale-95 transition"
          >
            <Plus className="w-4 h-4" /> Tạo đề nghị
          </button>
        </div>
      </div>

      {/* List */}
      <div className="px-4 space-y-2.5">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">Chưa có đề nghị thanh toán</p>
            <button onClick={() => navigate('/rubber/payment-requests/new')} className="mt-3 text-emerald-600 text-[13px] font-semibold">+ Tạo phiếu đầu tiên</button>
          </div>
        ) : (
          rows.map(r => {
            const st = STATUS_CFG[r.status]
            return (
              <button
                key={r.id}
                onClick={() => navigate(`/rubber/payment-requests/${r.id}`)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 active:scale-[0.99] transition"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[14px] font-bold text-gray-900">{r.code}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                {r.title && <p className="text-[13px] text-gray-600 mb-1.5">{r.title}</p>}
                <div className="flex items-center gap-3 text-[12px] text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(r.request_date)}</span>
                  {r.facility && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{r.facility.name}</span>}
                  <span className="flex items-center gap-1"><Scale className="w-3.5 h-3.5" />{r.total_weight.toLocaleString('vi-VN')} kg</span>
                  <span>{r.line_count} dòng</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[16px] font-bold text-emerald-600 font-mono">{fmtVnd(r.total_amount)}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

export default PaymentRequestListPage
