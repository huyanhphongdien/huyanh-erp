// ============================================================================
// PHIẾU CHỐT GIÁ — tạo / sửa  (nhiều đại lý / phiếu)
// Routes: /b2b/price-lock/new  +  /b2b/price-lock/:id
// ============================================================================

import { useState, useEffect, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Printer, Plus, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { partnerService, type Partner } from '../../../services/b2b/partnerService'
import {
  priceLockService,
  PURCHASE_METHOD_LABELS,
  PRICE_LOCK_STATUS_LABELS,
  FEE_FLAG_LABELS,
  EMPTY_DEALER,
  type PriceLockInput,
  type PriceLockFee,
  type PriceLockDealer,
  type PriceLockCurrency,
  type PurchaseMethod,
  type PriceLockStatus,
} from '../../../services/b2b/priceLockService'

/** Basis mặc định khi tick checkbox "Các phí phải chi" (theo form HAQT). */
const FEE_FLAG_DEFAULT_BASIS: Record<string, 'ton' | 'lot'> = {
  boc_xep: 'ton',
  ben_bai: 'lot',
  thue_xa_ban: 'lot',
  giay_to_di_duong: 'lot',
  hoa_hong: 'ton',
  bo_hang: 'ton',
  thue_xe_van_tai: 'ton',
  khac: 'ton',
}

interface FacilityOpt { id: string; code: string | null; name: string }

const num = (v: string): number | null => (v === '' || v == null ? null : Number(v))
const todayISO = () => new Date().toISOString().slice(0, 10)

function emptyForm(): PriceLockInput {
  return {
    status: 'draft',
    facility_id: null, facility_label: '',
    dealer_lines: [EMPTY_DEALER()],
    currency: 'VND', currency_other: '',
    rate_thb_kip: null, rate_kip_vnd: null, rate_thb_vnd: null,
    purchase_method: 'dai_ly',
    price_floor_per_ton: null, price_mid_per_ton: null, price_high_per_ton: null,
    fees: [],
    fee_flags: {},
    lock_date: todayISO(), weigh_from: null, weigh_to: null,
    signer_locker: '', note: '',
  }
}

export default function PriceLockFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState<PriceLockInput>(emptyForm())
  const [code, setCode] = useState<string | null>(null)
  const [facilities, setFacilities] = useState<FacilityOpt[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof PriceLockInput>(k: K, v: PriceLockInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.from('facilities').select('id, code, name').order('name')
      .then(({ data }) => setFacilities((data as FacilityOpt[]) || []))
    partnerService.getPartners({ pageSize: 1000 })
      .then((r) => setPartners(r.data || []))
      .catch(() => setPartners([]))
  }, [])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    priceLockService.getById(id)
      .then((row) => {
        if (row) {
          setForm({ ...row, dealer_lines: row.dealer_lines.length ? row.dealer_lines : [EMPTY_DEALER()] })
          setCode(row.code)
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  function onPickFacility(fid: string) {
    const fac = facilities.find((x) => x.id === fid)
    setForm((f) => ({ ...f, facility_id: fid || null, facility_label: fac ? (fac.code || fac.name) : '' }))
  }

  // ── Dealer lines ──
  const dealers = form.dealer_lines || []
  const setDealer = (i: number, patch: Partial<PriceLockDealer>) =>
    set('dealer_lines', dealers.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  const addDealer = () => set('dealer_lines', [...dealers, EMPTY_DEALER()])
  const removeDealer = (i: number) => set('dealer_lines', dealers.length > 1 ? dealers.filter((_, idx) => idx !== i) : dealers)
  const onPickDealerPartner = (i: number, pid: string) => {
    const p = partners.find((x) => x.id === pid)
    setDealer(i, { partner_id: pid || null, dealer_name: p?.name || dealers[i].dealer_name })
  }

  // ── Fees ──
  const fees = form.fees || []
  const setFee = (i: number, patch: Partial<PriceLockFee>) =>
    set('fees', fees.map((fee, idx) => (idx === i ? { ...fee, ...patch } : fee)))
  const addFee = (basis: 'ton' | 'lot') => set('fees', [...fees, { label: '', basis, amount: 0 }])
  const removeFee = (i: number) => set('fees', fees.filter((_, idx) => idx !== i))

  // Tick/untick checkbox "Các phí phải chi" → tự thêm/xoá dòng phí tương ứng.
  const toggleFlag = (key: string) => {
    const label = FEE_FLAG_LABELS[key]
    setForm((f) => {
      const flags = f.fee_flags || {}
      const nextOn = !flags[key]
      const newFlags = { ...flags, [key]: nextOn }
      const currentFees = f.fees || []
      let newFees: PriceLockFee[]
      if (nextOn) {
        const exists = currentFees.some((x) => x.label === label)
        newFees = exists
          ? currentFees
          : [...currentFees, { label, basis: FEE_FLAG_DEFAULT_BASIS[key] || 'ton', amount: 0 }]
      } else {
        newFees = currentFees.filter((x) => x.label !== label)
      }
      return { ...f, fee_flags: newFlags, fees: newFees }
    })
  }

  async function save(thenPrint: boolean) {
    setSaving(true)
    try {
      const payload: PriceLockInput = {
        ...form,
        dealer_lines: (form.dealer_lines || []).filter((d) => d.dealer_name?.trim() || d.partner_id),
      }
      const row = isEdit
        ? await priceLockService.update(id!, payload)
        : await priceLockService.create(payload)
      navigate(thenPrint ? `/b2b/price-lock/${row.id}/print` : `/b2b/price-lock/${row.id}`)
    } catch (e: any) {
      alert('Lưu thất bại: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400"><Loader2 className="animate-spin mr-2" /> Đang tải…</div>
  }

  const showRates = form.currency && form.currency !== 'VND'

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/b2b/price-lock')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <h1 className="flex-1 text-lg font-bold text-gray-800">{isEdit ? `Sửa phiếu chốt giá ${code || ''}` : 'Tạo phiếu chốt giá'}</h1>
          <button disabled={saving} onClick={() => save(false)} className="px-3 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-800 text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            <Save size={16} /> Lưu
          </button>
          <button disabled={saving} onClick={() => save(true)} className="px-3 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            <Printer size={16} /> Lưu & In
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Thông tin chung */}
        <Card title="Thông tin chung">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Địa điểm cân hàng">
              <select value={form.facility_id || ''} onChange={(e) => onPickFacility(e.target.value)} className={inputCls}>
                <option value="">— Chọn cơ sở —</option>
                {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Ngày chốt"><input type="date" value={form.lock_date || ''} onChange={(e) => set('lock_date', e.target.value)} className={inputCls} /></Field>
            <Field label="Hình thức mua">
              <select value={form.purchase_method || ''} onChange={(e) => set('purchase_method', (e.target.value || null) as PurchaseMethod | null)} className={inputCls}>
                <option value="">—</option>
                {(Object.entries(PURCHASE_METHOD_LABELS) as [PurchaseMethod, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        {/* Đại lý & giá áp */}
        <Card title="Đại lý & giá áp (mỗi đại lý 1 giá)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-2 py-2 font-medium w-8">#</th>
                  <th className="px-2 py-2 font-medium">Đại lý</th>
                  <th className="px-2 py-2 font-medium w-32">KL dự kiến (kg)</th>
                  <th className="px-2 py-2 font-medium w-28">DRC dự kiến (%)</th>
                  <th className="px-2 py-2 font-medium w-40">Giá áp (đ/tấn)</th>
                  <th className="px-2 py-2 font-medium">Ghi chú</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {dealers.map((d, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {partners.length > 0 ? (
                        <select value={d.partner_id || ''} onChange={(e) => onPickDealerPartner(i, e.target.value)} className={`${inputCls} min-w-[180px]`}>
                          <option value="">— Nhập tay / khách lẻ —</option>
                          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
                        </select>
                      ) : null}
                      {!d.partner_id && (
                        <input value={d.dealer_name} onChange={(e) => setDealer(i, { dealer_name: e.target.value })} placeholder="Tên đại lý" className={`${inputCls} mt-1`} />
                      )}
                    </td>
                    <td className="px-2 py-1.5"><input type="number" value={d.expected_weight_kg ?? ''} onChange={(e) => setDealer(i, { expected_weight_kg: num(e.target.value) })} className={`${inputCls} text-right`} /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.1" value={d.expected_drc_percent ?? ''} onChange={(e) => setDealer(i, { expected_drc_percent: num(e.target.value) })} className={`${inputCls} text-right`} /></td>
                    <td className="px-2 py-1.5"><input type="number" value={d.price_per_ton ?? ''} onChange={(e) => setDealer(i, { price_per_ton: num(e.target.value) })} className={`${inputCls} text-right font-mono`} /></td>
                    <td className="px-2 py-1.5"><input value={d.note ?? ''} onChange={(e) => setDealer(i, { note: e.target.value })} className={inputCls} /></td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => removeDealer(i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Xoá dòng"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addDealer} className="text-sm text-emerald-600 flex items-center gap-1 mt-3"><Plus size={15} /> Thêm đại lý</button>
        </Card>

        {/* Bảng giá tham chiếu & tiền tệ */}
        <Card title="Bảng giá cao su tham chiếu & loại tiền">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Giá cao su SÀN (đ/tấn)"><input type="number" value={form.price_floor_per_ton ?? ''} onChange={(e) => set('price_floor_per_ton', num(e.target.value))} className={inputCls} /></Field>
            <Field label="Giá cao su TRUNG (đ/tấn)"><input type="number" value={form.price_mid_per_ton ?? ''} onChange={(e) => set('price_mid_per_ton', num(e.target.value))} className={inputCls} /></Field>
            <Field label="Giá cao su CAO (đ/tấn)"><input type="number" value={form.price_high_per_ton ?? ''} onChange={(e) => set('price_high_per_ton', num(e.target.value))} className={inputCls} /></Field>
            <Field label="Loại tiền">
              <select value={form.currency} onChange={(e) => set('currency', e.target.value as PriceLockCurrency)} className={inputCls}>
                <option value="VND">VNĐ</option><option value="KIP">KIP</option><option value="THB">THB</option><option value="OTHER">Khác</option>
              </select>
            </Field>
            {form.currency === 'OTHER' && (
              <Field label="Loại tiền (khác)"><input value={form.currency_other || ''} onChange={(e) => set('currency_other', e.target.value)} className={inputCls} /></Field>
            )}
          </div>
          {showRates && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <Field label="Tỷ giá THB/KIP"><input type="number" value={form.rate_thb_kip ?? ''} onChange={(e) => set('rate_thb_kip', num(e.target.value))} className={inputCls} /></Field>
              <Field label="Tỷ giá KIP/VNĐ"><input type="number" value={form.rate_kip_vnd ?? ''} onChange={(e) => set('rate_kip_vnd', num(e.target.value))} className={inputCls} /></Field>
              <Field label="Tỷ giá THB/VNĐ"><input type="number" value={form.rate_thb_vnd ?? ''} onChange={(e) => set('rate_thb_vnd', num(e.target.value))} className={inputCls} /></Field>
            </div>
          )}
        </Card>

        {/* Phí */}
        <Card title="Các phí phải chi">
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
            {Object.entries(FEE_FLAG_LABELS).map(([k, v]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={!!(form.fee_flags || {})[k]} onChange={() => toggleFlag(k)} /> {v}
              </label>
            ))}
          </div>
          <div className="space-y-2">
            {fees.map((fee, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={fee.label} onChange={(e) => setFee(i, { label: e.target.value })} placeholder="Loại chi phí" className={`${inputCls} flex-1`} />
                <select value={fee.basis} onChange={(e) => setFee(i, { basis: e.target.value as 'ton' | 'lot' })} className={`${inputCls} w-28`}>
                  <option value="ton">Theo tấn</option><option value="lot">Theo lô</option>
                </select>
                <input type="number" value={fee.amount} onChange={(e) => setFee(i, { amount: Number(e.target.value) || 0 })} placeholder="Giá" className={`${inputCls} w-36 text-right font-mono`} />
                <button onClick={() => removeFee(i)} className="p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => addFee('ton')} className="text-sm text-emerald-600 flex items-center gap-1"><Plus size={14} /> Phí theo tấn</button>
            <button onClick={() => addFee('lot')} className="text-sm text-emerald-600 flex items-center gap-1"><Plus size={14} /> Phí theo lô</button>
          </div>
        </Card>

        {/* Thời gian & ký */}
        <Card title="Thời gian & xác nhận">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Ngày cân (từ)"><input type="date" value={form.weigh_from || ''} onChange={(e) => set('weigh_from', e.target.value || null)} className={inputCls} /></Field>
            <Field label="Ngày cân (đến)"><input type="date" value={form.weigh_to || ''} onChange={(e) => set('weigh_to', e.target.value || null)} className={inputCls} /></Field>
            <Field label="Người chốt giá"><input value={form.signer_locker || ''} onChange={(e) => set('signer_locker', e.target.value)} className={inputCls} /></Field>
            <Field label="Trạng thái">
              <select value={form.status} onChange={(e) => set('status', e.target.value as PriceLockStatus)} className={inputCls}>
                {Object.entries(PRICE_LOCK_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Ghi chú" className="mt-3">
            <textarea value={form.note || ''} onChange={(e) => set('note', e.target.value)} rows={2} className={inputCls} />
          </Field>
        </Card>
      </div>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
