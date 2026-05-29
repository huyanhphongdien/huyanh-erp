// ============================================================================
// FILE: src/pages/wms/rubber-intake/PaymentRequestDetailPage.tsx
// MODULE: WMS / Nhập kho mủ — Chi tiết Đề nghị thanh toán (ĐỢT 1)
// Sửa dòng (người nhận / kg / đơn giá / thành tiền gõ tay), thêm/xoá dòng,
// lưu, in, xoá phiếu. Workflow duyệt/chi ở Đợt 2.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Save, Plus, Trash2, Printer, Calendar, Building2, Scale,
  Send, CheckCircle2, Banknote, Undo2, XCircle,
} from 'lucide-react'
import {
  paymentRequestService,
  type PaymentRequest,
  type PaymentRequestLine,
  type PaymentRequestStatus,
  type PaymentCurrency,
} from '../../../services/wms/paymentRequestService'
import { useAuthStore } from '../../../stores/authStore'

const CCY_SUFFIX: Record<PaymentCurrency, string> = { VND: 'đ', KIP: ' ₭', THB: ' ฿' }
function fmtCur(a?: number | null, ccy: PaymentCurrency = 'VND'): string {
  return (a || 0).toLocaleString('vi-VN') + CCY_SUFFIX[ccy]
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

// dòng có thể đang sửa local
type EditLine = PaymentRequestLine & { _dirty?: boolean }

const PaymentRequestDetailPage: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const user = useAuthStore(s => s.user)
  const [req, setReq] = useState<PaymentRequest | null>(null)
  const [lines, setLines] = useState<EditLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await paymentRequestService.getById(id)
      if (res) {
        setReq(res.request)
        setLines(res.lines.map(l => ({ ...l })))
      }
    } catch (e) {
      console.error('[PaymentRequestDetail] load error', e)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const editable = req?.status === 'draft'

  const patchLine = (lineId: string, patch: Partial<EditLine>) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l
      const next = { ...l, ...patch, _dirty: true }
      // tự tính lại thành tiền khi đổi kg / đơn giá (vẫn cho gõ đè amount riêng)
      if (('weight' in patch) || ('unit_price' in patch)) {
        next.amount = Math.round((next.weight || 0) * (next.unit_price || 0))
      }
      return next
    }))
  }

  const handleSave = async () => {
    if (!req) return
    setSaving(true)
    try {
      const dirty = lines.filter(l => l._dirty)
      for (const l of dirty) {
        await paymentRequestService.updateLine(l.id, {
          payee_name: l.payee_name,
          payee_note: l.payee_note,
          weight: l.weight,
          unit_price: l.unit_price,
          amount: l.amount,
          note: l.note,
          vehicle_plate: l.vehicle_plate,
        })
      }
      await load()
    } catch (e: any) {
      alert('Lưu thất bại: ' + (e?.message || 'lỗi'))
    }
    setSaving(false)
  }

  const handleAddLine = async () => {
    if (!req) return
    try {
      await paymentRequestService.addLine(req.id, {
        source_type: 'manual',
        payee_name: '',
        weight: 0,
        unit_price: 0,
        amount: 0,
        sort_order: lines.length,
      })
      await load()
    } catch (e: any) {
      alert('Thêm dòng thất bại: ' + (e?.message || 'lỗi'))
    }
  }

  const handleRemoveLine = async (lineId: string) => {
    if (!confirm('Xoá dòng này?')) return
    try {
      await paymentRequestService.removeLine(lineId)
      await load()
    } catch (e: any) {
      alert('Xoá dòng thất bại: ' + (e?.message || 'lỗi'))
    }
  }

  const handleDelete = async () => {
    if (!req) return
    if (!confirm(`Xoá đề nghị ${req.code}? Phiếu cân sẽ được giải phóng để gom lại.`)) return
    try {
      await paymentRequestService.remove(req.id)
      navigate('/rubber/payment-requests')
    } catch (e: any) {
      alert('Xoá thất bại: ' + (e?.message || 'lỗi'))
    }
  }

  const runAction = async (fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setActing(true)
    try { await fn(); await load() }
    catch (e: any) { alert(e?.message || 'Thao tác thất bại') }
    setActing(false)
  }
  const handleSubmit = () => req && runAction(() => paymentRequestService.submit(req.id))
  const handleApprove = () => req && runAction(() => paymentRequestService.approve(req.id, user?.id))
  const handleRevert = () => req && runAction(() => paymentRequestService.revertToDraft(req.id))
  const handleCancel = () => req && runAction(() => paymentRequestService.cancel(req.id), `Huỷ đề nghị ${req.code}?`)
  const handleMarkPaid = () => req && runAction(
    () => paymentRequestService.markPaid(req.id, user?.id),
    `Xác nhận ĐÃ CHI ${fmtCur(liveTotalAmount, req.currency)}? Hệ thống sẽ ghi công nợ và không cho sửa nữa.`,
  )

  const liveTotalAmount = lines.reduce((s, l) => s + (l.amount || 0), 0)
  const liveTotalWeight = lines.reduce((s, l) => s + (l.weight || 0), 0)
  const hasDirty = lines.some(l => l._dirty)

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }
  if (!req) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-gray-400">Không tìm thấy đề nghị</p>
        <button onClick={() => navigate('/rubber/payment-requests')} className="text-emerald-600 font-semibold">← Về danh sách</button>
      </div>
    )
  }

  const st = STATUS_CFG[req.status]

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/rubber/payment-requests')} className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-gray-900 font-mono truncate">{req.code}</h1>
            {req.title && <p className="text-[12px] text-gray-400 truncate">{req.title}</p>}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${st.cls}`}>{st.label}</span>
          <button onClick={() => navigate(`/rubber/payment-requests/${req.id}/print`)} className="p-2 rounded-lg hover:bg-gray-100" title="In phiếu">
            <Printer className="w-4.5 h-4.5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="px-4 py-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <div className="flex items-center gap-4 text-[12.5px] text-gray-500 flex-wrap">
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{fmtDate(req.request_date)}</span>
            {req.facility && <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{req.facility.name}</span>}
            <span className="flex items-center gap-1.5"><Scale className="w-4 h-4" />{liveTotalWeight.toLocaleString('vi-VN')} kg</span>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
            <span className="text-[13px] text-gray-400">Tổng chi ({lines.length} dòng · {req.currency})</span>
            <span className="text-[22px] font-bold text-emerald-600 font-mono">{fmtCur(liveTotalAmount, req.currency)}</span>
          </div>
        </div>
      </div>

      {/* Workflow actions */}
      {req.status !== 'cancelled' && (
        <div className="px-4 pb-1">
          <div className="flex items-center gap-2 flex-wrap">
            {req.status === 'draft' && (
              <button onClick={handleSubmit} disabled={acting || lines.length === 0} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-[13.5px] font-semibold active:scale-95 transition disabled:opacity-50">
                <Send className="w-4 h-4" /> Gửi duyệt
              </button>
            )}
            {req.status === 'submitted' && (
              <button onClick={handleApprove} disabled={acting} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-[13.5px] font-semibold active:scale-95 transition disabled:opacity-50">
                <CheckCircle2 className="w-4 h-4" /> Duyệt
              </button>
            )}
            {req.status === 'approved' && (
              <button onClick={handleMarkPaid} disabled={acting} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[13.5px] font-semibold active:scale-95 transition disabled:opacity-50">
                <Banknote className="w-4 h-4" /> Đánh dấu đã chi
              </button>
            )}
            {(req.status === 'submitted' || req.status === 'approved') && (
              <button onClick={handleRevert} disabled={acting} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13.5px] font-medium active:scale-95 transition disabled:opacity-50">
                <Undo2 className="w-4 h-4" /> Trả về nháp
              </button>
            )}
            {req.status !== 'paid' && (
              <button onClick={handleCancel} disabled={acting} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-red-500 text-[13.5px] font-medium active:scale-95 transition disabled:opacity-50 ml-auto">
                <XCircle className="w-4 h-4" /> Huỷ
              </button>
            )}
            {acting && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          </div>
          {req.status === 'paid' && req.paid_at && (
            <p className="mt-2 text-[12px] text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã chi ngày {fmtDate(req.paid_at)} — đã ghi công nợ (PA1).
            </p>
          )}
        </div>
      )}

      {/* Lines */}
      <div className="px-4 space-y-2.5">
        {lines.map((l, i) => (
          <div key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-gray-400">
                #{i + 1}
                {l.deal_number && <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10.5px]">Deal #{l.deal_number}</span>}
                {l.source_type === 'supplier' && <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10.5px]">Mua lẻ</span>}
              </span>
              {editable && (
                <button onClick={() => handleRemoveLine(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Người nhận */}
            <input
              value={l.payee_name}
              onChange={e => patchLine(l.id, { payee_name: e.target.value })}
              disabled={!editable}
              placeholder="Người nhận tiền"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[13.5px] font-medium mb-1.5 disabled:bg-gray-50"
            />
            <input
              value={l.payee_note || ''}
              onChange={e => patchLine(l.id, { payee_note: e.target.value })}
              disabled={!editable}
              placeholder="Ghi chú người nhận (số TK / người thân...)"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[12.5px] mb-2 disabled:bg-gray-50"
            />

            {/* kg × đơn giá = thành tiền */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10.5px] text-gray-400">Khối lượng (kg)</label>
                <input
                  type="number" inputMode="decimal"
                  value={l.weight || ''}
                  onChange={e => patchLine(l.id, { weight: parseFloat(e.target.value) || 0 })}
                  disabled={!editable}
                  className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[13px] text-right font-mono disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="text-[10.5px] text-gray-400">Đơn giá</label>
                <input
                  type="number" inputMode="decimal"
                  value={l.unit_price || ''}
                  onChange={e => patchLine(l.id, { unit_price: parseFloat(e.target.value) || 0 })}
                  disabled={!editable}
                  className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[13px] text-right font-mono disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="text-[10.5px] text-gray-400">Thành tiền</label>
                <input
                  type="number" inputMode="decimal"
                  value={l.amount || ''}
                  onChange={e => patchLine(l.id, { amount: parseFloat(e.target.value) || 0 })}
                  disabled={!editable}
                  className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[13px] text-right font-mono font-bold text-emerald-600 disabled:bg-gray-50"
                />
              </div>
            </div>
            {l.vehicle_plate && <p className="text-[11px] text-gray-400 mt-1.5">Xe: {l.vehicle_plate}</p>}
          </div>
        ))}

        {editable && (
          <button onClick={handleAddLine} className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 text-[13.5px] font-medium hover:border-emerald-300 hover:text-emerald-500 transition">
            <Plus className="w-4 h-4" /> Thêm dòng thủ công
          </button>
        )}

        {editable && (
          <button onClick={handleDelete} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-red-500 text-[13px] font-medium">
            <Trash2 className="w-4 h-4" /> Xoá đề nghị này
          </button>
        )}
      </div>

      {/* Save bar */}
      {editable && hasDirty && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] px-4 py-3">
          <button onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-600 text-white text-[14px] font-semibold active:scale-95 transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Save className="w-4.5 h-4.5" />} Lưu thay đổi
          </button>
        </div>
      )}
    </div>
  )
}

export default PaymentRequestDetailPage
