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
  const removeFee = (i: number) => set('fees', fees.filter((_, idx) => idx !== i))

  // 8 phí "chuẩn" trên mẫu — checkbox = chính dòng phí (tick là enable luôn basis + giá).
  const STANDARD_FEE_LABELS = new Set(Object.values(FEE_FLAG_LABELS))
  const toggleStandardFee = (key: string) => {
    const label = FEE_FLAG_LABELS[key]
    setForm((f) => {
      const cur = f.fees || []
      const exists = cur.some((x) => x.label === label)
      return {
        ...f,
        fees: exists
          ? cur.filter((x) => x.label !== label)
          : [...cur, { label, basis: FEE_FLAG_DEFAULT_BASIS[key] || 'ton', amount: 0 }],
      }
    })
  }
  const updateStandardFee = (label: string, patch: Partial<PriceLockFee>) =>
    set('fees', fees.map((f) => (f.label === label ? { ...f, ...patch } : f)))

  // Phí "khác" (label tự nhập, không nằm trong 8 loại chuẩn).
  const customEntries = fees
    .map((fee, idx) => ({ fee, idx }))
    .filter(({ fee }) => !STANDARD_FEE_LABELS.has(fee.label))
  const addCustomFee = () => set('fees', [...fees, { label: '', basis: 'ton', amount: 0 }])

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
          <p className="text-xs text-gray-400 mb-3">Tick để áp dụng phí, chọn theo tấn/lô và nhập giá ngay trên cùng 1 dòng.</p>
          <div className="space-y-1.5">
            {(Object.entries(FEE_FLAG_LABELS) as [string, string][]).map(([key, label]) => {
              const fee = fees.find((x) => x.label === label)
              const checked = !!fee
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition ${
                    checked ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-100 bg-gray-50/30'
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer" style={{ width: 200, flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStandardFee(key)}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                    <span className={`text-sm font-medium ${checked ? 'text-gray-800' : 'text-gray-500'}`}>{label}</span>
                  </label>
                  <select
                    value={fee?.basis || FEE_FLAG_DEFAULT_BASIS[key] || 'ton'}
                    onChange={(e) => updateStandardFee(label, { basis: e.target.value as 'ton' | 'lot' })}
                    disabled={!checked}
                    style={{ width: 130, flexShrink: 0 }}
                    className={feeCls}
                  >
                    <option value="ton">Theo tấn</option><option value="lot">Theo lô</option>
                  </select>
                  <input
                    type="number"
                    value={fee?.amount ?? 0}
                    onChange={(e) => updateStandardFee(label, { amount: Number(e.target.value) || 0 })}
                    disabled={!checked}
                    placeholder="Nhập giá"
                    style={{ flex: '1 1 0', minWidth: 0 }}
                    className={`${feeCls} text-right font-mono`}
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0" style={{ width: 10 }}>đ</span>
                </div>
              )
            })}
          </div>

          {customEntries.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1.5">Phí khác (tự nhập)</p>
              <div className="space-y-1.5">
                {customEntries.map(({ fee, idx }) => (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200">
                    <input
                      value={fee.label}
                      onChange={(e) => setFee(idx, { label: e.target.value })}
                      placeholder="Tên loại phí"
                      style={{ width: 200, flexShrink: 0 }}
                      className={feeCls}
                    />
                    <select
                      value={fee.basis}
                      onChange={(e) => setFee(idx, { basis: e.target.value as 'ton' | 'lot' })}
                      style={{ width: 130, flexShrink: 0 }}
                      className={feeCls}
                    >
                      <option value="ton">Theo tấn</option><option value="lot">Theo lô</option>
                    </select>
                    <input
                      type="number"
                      value={fee.amount}
                      onChange={(e) => setFee(idx, { amount: Number(e.target.value) || 0 })}
                      placeholder="Nhập giá"
                      style={{ flex: '1 1 0', minWidth: 0 }}
                      className={`${feeCls} text-right font-mono`}
                    />
                    <span className="text-xs text-gray-400 flex-shrink-0" style={{ width: 10 }}>đ</span>
                    <button onClick={() => removeFee(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded flex-shrink-0" title="Xoá">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={addCustomFee} className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5">
            <Plus size={15} /> Thêm phí khác
          </button>
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

// Không có w-full → cho phép inline style={width: ...} điều khiển bề rộng (tránh Tailwind utility conflict).
const feeCls = 'px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed'

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
