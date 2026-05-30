// ============================================================================
// FILE: src/pages/wms/rubber-intake/PaymentRequestCreatePage.tsx
// MODULE: WMS / Nhập kho mủ — Tạo Đề nghị thanh toán từ phiếu cân (ĐỢT 1)
// Lọc phiếu cân (NM/ngày/loại mủ) → chọn → tạo đề nghị (prefill dòng).
// Linh hoạt: gom CẢ lô-trong-deal lẫn lô-lẻ (không phân biệt) — PA1.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Check, Scale, Truck, Tag, Search, CheckSquare, Square,
} from 'lucide-react'
import { paymentRequestService, type AvailableTicket, type PaymentCurrency } from '../../../services/wms/paymentRequestService'
import { facilityService, type Facility } from '../../../services/wms/facilityService'
import { useAuthStore } from '../../../stores/authStore'

function fmtVnd(a?: number | null): string {
  return (a || 0).toLocaleString('vi-VN') + 'đ'
}

const RUBBER_TYPES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tất cả loại' },
  { value: 'mu_nuoc', label: 'Mủ nước' },
  { value: 'mu_tap', label: 'Mủ tạp' },
  { value: 'mu_dong', label: 'Mủ đông' },
  { value: 'mu_chen', label: 'Mủ chén' },
  { value: 'mu_to', label: 'Mủ tờ' },
]

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  deal:     { label: 'Deal',    cls: 'bg-emerald-100 text-emerald-700' },
  supplier: { label: 'Mua lẻ',  cls: 'bg-blue-100 text-blue-700' },
  manual:   { label: 'Khác',    cls: 'bg-gray-100 text-gray-600' },
}

// Nguồn giá: deal (giá deal) | pcg (phiếu chốt giá) | manual (chưa có giá → kế toán nhập)
const PRICE_SRC: Record<string, { label: string; cls: string }> = {
  deal:   { label: 'Giá deal',       cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  pcg:    { label: 'Giá PCG',        cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  manual: { label: '⚠ Chưa có giá',  cls: 'bg-red-50 text-red-600 border border-red-200' },
}

const today = () => new Date().toISOString().slice(0, 10)

const PaymentRequestCreatePage: React.FC = () => {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  const [facilities, setFacilities] = useState<Facility[]>([])
  const [facilityId, setFacilityId] = useState<string>('')
  // Mặc định 1 ngày (hôm nay) — 1 ngày có nhiều phiếu cân là đủ. Anh kéo dài range khi cần.
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [rubberType, setRubberType] = useState('')

  const [tickets, setTickets] = useState<AvailableTicket[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState<PaymentCurrency>('VND')

  useEffect(() => {
    facilityService.getAllActive().then(setFacilities).catch(() => {})
  }, [])

  const search = useCallback(async () => {
    setLoading(true)
    try {
      const data = await paymentRequestService.listAvailableTickets({
        facility_id: facilityId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        rubber_type: rubberType || undefined,
      })
      setTickets(data)
      setSelected(new Set(data.map(t => t.id))) // mặc định chọn hết
    } catch (e) {
      console.error('[PaymentRequestCreate] search error', e)
      setTickets([])
    }
    setLoading(false)
  }, [facilityId, dateFrom, dateTo, rubberType])

  useEffect(() => { search() }, []) // load lần đầu (hôm nay)

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allSelected = tickets.length > 0 && selected.size === tickets.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(tickets.map(t => t.id)))

  const chosen = tickets.filter(t => selected.has(t.id))
  const totalAmount = chosen.reduce((s, t) => s + t.suggested_amount, 0)
  const totalWeight = chosen.reduce((s, t) => s + t.billable_weight, 0)

  const handleCreate = async () => {
    if (chosen.length === 0) return
    setCreating(true)
    try {
      const facForLines = facilityId || chosen[0]?.facility_id || null
      const req = await paymentRequestService.create({
        facility_id: facForLines,
        request_date: dateTo || today(),
        rubber_type: rubberType || null,
        title: title.trim() || null,
        currency,
        created_by: user?.id || null,
        lines: paymentRequestService.ticketsToLines(chosen),
      })
      navigate(`/rubber/payment-requests/${req.id}`)
    } catch (e: any) {
      console.error('[PaymentRequestCreate] create error', e)
      alert('Tạo đề nghị thất bại: ' + (e?.message || 'lỗi không rõ'))
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/rubber/payment-requests')} className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-[16px] font-bold text-gray-900">Tạo đề nghị thanh toán</h1>
            <p className="text-[12px] text-gray-400">Gom phiếu cân đã hoàn tất, chưa thuộc đề nghị nào</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2.5">
          <div>
            <label className="text-[11px] text-gray-400 font-medium">Nhà máy</label>
            <select value={facilityId} onChange={e => setFacilityId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-[13.5px] bg-white">
              <option value="">Tất cả nhà máy</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] text-gray-400 font-medium">Từ ngày</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-[13.5px]" />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 font-medium">Đến ngày</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-[13.5px]" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-400 font-medium">Loại mủ</label>
            <select value={rubberType} onChange={e => setRubberType(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-[13.5px] bg-white">
              {RUBBER_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button onClick={search} disabled={loading} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-[13.5px] font-semibold active:scale-95 transition disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Tìm phiếu cân
          </button>
        </div>

        {/* Title + currency */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2.5">
          <div>
            <label className="text-[11px] text-gray-400 font-medium">Tiêu đề phiếu (tuỳ chọn)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Mủ nước Tân Lâm 29/05" className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-[13.5px]" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 font-medium">Tiền tệ</label>
            <div className="mt-1 flex gap-1.5">
              {(['VND', 'KIP', 'THB'] as PaymentCurrency[]).map(c => (
                <button key={c} type="button" onClick={() => setCurrency(c)}
                  className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition ${currency === c ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ticket list */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12.5px] font-semibold text-gray-500">{tickets.length} phiếu cân khả dụng</span>
          {tickets.length > 0 && (
            <button onClick={toggleAll} className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-600">
              {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />} Chọn tất cả
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-[13.5px]">Không có phiếu cân nào khớp bộ lọc</div>
        ) : (
          <div className="space-y-2">
            {tickets.map(t => {
              const sel = selected.has(t.id)
              const badge = SOURCE_BADGE[t.source_type]
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`w-full text-left rounded-2xl border px-3.5 py-3 transition ${sel ? 'border-emerald-400 bg-emerald-50/40' : 'border-gray-100 bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${sel ? 'bg-emerald-600' : 'border-2 border-gray-300'}`}>
                      {sel && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[13px] font-bold text-gray-900">{t.code}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${badge.cls}`}>
                          {badge.label}{t.deal_number ? ` #${t.deal_number}` : ''}
                        </span>
                      </div>
                      <p className="text-[13.5px] font-medium text-gray-800 truncate">{t.payee_name || <span className="text-gray-400 italic">Chưa rõ người nhận</span>}</p>
                      <div className="flex items-center gap-3 text-[11.5px] text-gray-400 mt-1 flex-wrap">
                        {t.vehicle_plate && <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" />{t.vehicle_plate}</span>}
                        <span className="flex items-center gap-1">
                          <Scale className="w-3.5 h-3.5" />
                          {t.billable_weight.toLocaleString('vi-VN')} kg
                          {t.drc != null && t.price_unit === 'dry' && <span className="text-gray-300">(khô, DRC {t.drc}%)</span>}
                        </span>
                        <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" />{fmtVnd(t.unit_price)}/kg</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${PRICE_SRC[t.price_source].cls}`}>
                          {PRICE_SRC[t.price_source].label}{t.price_source === 'pcg' && t.price_source_ref ? ` ${t.price_source_ref}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[14px] font-bold text-emerald-600 font-mono">{fmtVnd(t.suggested_amount)}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer create bar */}
      {chosen.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] text-gray-400">{chosen.length} phiếu · {totalWeight.toLocaleString('vi-VN')} kg</p>
              <p className="text-[18px] font-bold text-emerald-600 font-mono">{fmtVnd(totalAmount)}</p>
            </div>
            <button onClick={handleCreate} disabled={creating} className="flex items-center gap-1.5 px-5 py-3 rounded-xl bg-emerald-600 text-white text-[14px] font-semibold shadow-sm active:scale-95 transition disabled:opacity-50">
              {creating ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Check className="w-4.5 h-4.5" />} Tạo đề nghị
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentRequestCreatePage
