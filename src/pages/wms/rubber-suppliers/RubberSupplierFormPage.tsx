// ============================================================================
// FILE: src/pages/wms/rubber-suppliers/RubberSupplierFormPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3.5 — Bước 3.5.5 — V2 FIX navigate + real service
// ============================================================================
// CHANGES V2:
// - FIX: navigate('/wms/rubber-suppliers') → navigate('/rubber/suppliers')
// - CONNECT: rubberSupplierService thay supabase trực tiếp
// - KEEP: toàn bộ UI/design không đổi
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Save,
  User,
  Phone,
  CreditCard,
  MapPin,
  TreePine,
  Landmark,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Globe,
  Ruler,
  Calendar,
  Star,
  Hash,
  Building2,
  FileText,
  CheckCircle2,
  Navigation,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { App as AntdApp } from 'antd'
import rubberSupplierService from '../../../services/rubber/rubberSupplierService'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'

// Lỗi định vị của trình duyệt (tiếng Anh) → câu tiếng Việt hành động được
const GPS_ERR: Record<number, string> = {
  1: 'Chưa cho phép truy cập vị trí — bật quyền Vị trí cho trang này rồi thử lại',
  2: 'Không xác định được vị trí — ra chỗ thoáng hoặc bật GPS rồi thử lại',
  3: 'Lấy vị trí quá lâu — thử lại',
}

// ============================================================================
// TYPES
// ============================================================================

interface FormData {
  name: string
  supplier_type: 'tieu_dien' | 'dai_ly' | 'nong_truong' | 'cong_ty'
  phone: string
  cccd: string
  tax_code: string
  address: string
  province: string
  district: string
  commune: string
  plantation_area_ha: string
  rubber_variety: string
  tree_age_years: string
  tapping_system: string
  geo_latitude: string
  geo_longitude: string
  eudr_compliant: boolean
  eudr_cert_expiry: string
  payment_method: 'cash' | 'transfer' | 'debt'
  bank_name: string
  bank_account: string
  bank_holder: string
  quality_rating: number
  notes: string
}

const DEFAULT_FORM: FormData = {
  name: '',
  supplier_type: 'tieu_dien',
  phone: '',
  cccd: '',
  tax_code: '',
  address: '',
  province: '',
  district: '',
  commune: '',
  plantation_area_ha: '',
  rubber_variety: '',
  tree_age_years: '',
  tapping_system: '',
  geo_latitude: '',
  geo_longitude: '',
  eudr_compliant: false,
  eudr_cert_expiry: '',
  payment_method: 'cash',
  bank_name: '',
  bank_account: '',
  bank_holder: '',
  quality_rating: 3,
  notes: '',
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPLIER_TYPES = [
  { key: 'tieu_dien', label: 'Tiểu điền', icon: '🌿', desc: 'Hộ nông dân, vườn nhỏ' },
  { key: 'dai_ly', label: 'Đại lý', icon: '🏪', desc: 'Đại lý thu mua mủ' },
  { key: 'nong_truong', label: 'Nông trường', icon: '🏭', desc: 'Nông trường cao su' },
  { key: 'cong_ty', label: 'Công ty', icon: '🏢', desc: 'Công ty TNHH/CP' },
] as const

const RUBBER_VARIETIES = [
  'GT1', 'RRIV4', 'PB235', 'PB260', 'RRIV1', 'RRIV2', 'RRIV3',
  'VM515', 'RRIC121', 'RRIM600', 'Khác',
]

const TAPPING_SYSTEMS = [
  { key: 'S/2 d2', label: 'S/2 d2 — Nửa vòng, 2 ngày/lần' },
  { key: 'S/2 d3', label: 'S/2 d3 — Nửa vòng, 3 ngày/lần' },
  { key: 'S/3 d2', label: 'S/3 d2 — 1/3 vòng, 2 ngày/lần' },
  { key: 'S/4 d2', label: 'S/4 d2 — 1/4 vòng, 2 ngày/lần' },
]

const PROVINCES = [
  'Thừa Thiên Huế', 'Quảng Trị', 'Quảng Bình', 'Quảng Nam',
  'Đà Nẵng', 'Gia Lai', 'Kon Tum', 'Đắk Lắk', 'Đắk Nông',
  'Bình Phước', 'Tây Ninh', 'Bình Dương', 'Đồng Nai',
]

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Tiền mặt', icon: '💵', desc: 'Trả tại chỗ khi cân' },
  { key: 'debt', label: 'Công nợ', icon: '📋', desc: 'Ghi nợ, thanh toán sau theo kỳ' },
  { key: 'transfer', label: 'Chuyển khoản', icon: '🏦', desc: 'Chuyển khoản ngân hàng' },
] as const

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const Section: React.FC<{
  title: string; icon: React.ReactNode; badge?: string
  expanded: boolean; onToggle: () => void
  children: React.ReactNode; required?: boolean
}> = ({ title, icon, badge, expanded, onToggle, children, required }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <button type="button" onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
      <div className="w-9 h-9 rounded-xl bg-[#8B5E3C]/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-gray-900">{title}</span>
          {required && <span className="text-[10px] text-red-400 font-medium">BẮT BUỘC</span>}
          {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">{badge}</span>}
        </div>
      </div>
      {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
    </button>
    {expanded && <div className="px-4 pb-4 pt-1 border-t border-gray-50 space-y-4">{children}</div>}
  </div>
)

const Field: React.FC<{ label: string; required?: boolean; error?: string; children: React.ReactNode }> = ({ label, required, error, children }) => (
  <div>
    <label className="block text-[13px] font-medium text-gray-600 mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="text-[12px] text-red-500 mt-1">{error}</p>}
  </div>
)

const Input: React.FC<{
  value: string; onChange: (v: string) => void; placeholder?: string
  type?: string; icon?: React.ReactNode; disabled?: boolean
}> = ({ value, onChange, placeholder, type = 'text', icon, disabled }) => (
  <div className="relative">
    {icon && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className={`w-full h-12 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#8B5E3C]/20 focus:border-[#8B5E3C] disabled:bg-gray-50 disabled:text-gray-400 ${icon ? 'pl-10' : 'pl-4'} pr-4`} />
  </div>
)

const Select: React.FC<{
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; placeholder?: string
}> = ({ value, onChange, options, placeholder }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="w-full h-12 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white px-4 focus:outline-none focus:ring-2 focus:ring-[#8B5E3C]/20 focus:border-[#8B5E3C] appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center]">
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

const StarRating: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map(i => (
      <button key={i} type="button" onClick={() => onChange(i)}
        className="w-10 h-10 flex items-center justify-center active:scale-110 transition-transform">
        <Star size={24} className={i <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
      </button>
    ))}
  </div>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RubberSupplierFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadFailed, setLoadFailed] = useState(false)
  const { message } = AntdApp.useApp()

  const [sections, setSections] = useState({
    basic: true,
    plantation: true,
    payment: false,
    eudr: false,
  })

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const setField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) {
      setErrors(prev => { const next = { ...prev }; delete next[key]; return next })
    }
  }, [errors])

  // ✅ V2: Load via service
  useEffect(() => {
    if (!isEdit || !id) return
    setLoading(true)

    const load = async () => {
      try {
        const data = await rubberSupplierService.getById(id)
        if (data) {
          setForm({
            name: data.name || '',
            supplier_type: data.supplier_type || 'tieu_dien',
            phone: data.phone || '',
            cccd: data.cccd || '',
            tax_code: data.tax_code || '',
            address: data.address || '',
            province: data.province || '',
            district: data.district || '',
            commune: data.commune || '',
            plantation_area_ha: data.plantation_area_ha?.toString() || '',
            rubber_variety: data.rubber_variety || '',
            tree_age_years: data.tree_age_years?.toString() || '',
            tapping_system: data.tapping_system || '',
            geo_latitude: data.geo_latitude?.toString() || '',
            geo_longitude: data.geo_longitude?.toString() || '',
            eudr_compliant: data.eudr_compliant || false,
            eudr_cert_expiry: data.eudr_cert_expiry || '',
            payment_method: data.payment_method || 'cash',
            bank_name: data.bank_name || '',
            bank_account: data.bank_account || '',
            bank_holder: data.bank_holder || '',
            quality_rating: data.quality_rating || 3,
            notes: data.notes || '',
          })
        }
      } catch (err) {
        console.error('Lỗi tải NCC:', err)
        // Chặn lưu khi chưa tải được: form đang trống, lưu là ghi đè NCC thật bằng dữ liệu rỗng
        setLoadFailed(true)
        message.error(dichLoiHeThong(err, 'Không thể tải thông tin NCC'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [id, isEdit])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Vui lòng nhập tên NCC'
    if (!form.province) errs.province = 'Vui lòng chọn tỉnh'
    if (form.phone && !/^[0-9]{9,11}$/.test(form.phone.replace(/\s/g, ''))) errs.phone = 'SĐT không hợp lệ'
    if (form.cccd && !/^[0-9]{9,12}$/.test(form.cccd)) errs.cccd = 'CCCD không hợp lệ'
    if (form.plantation_area_ha && isNaN(Number(form.plantation_area_ha))) errs.plantation_area_ha = 'Diện tích phải là số'
    if (form.tree_age_years && isNaN(Number(form.tree_age_years))) errs.tree_age_years = 'Tuổi cây phải là số'

    setErrors(errs)
    if (errs.name || errs.phone || errs.cccd) setSections(s => ({ ...s, basic: true }))
    if (errs.province || errs.plantation_area_ha || errs.tree_age_years) setSections(s => ({ ...s, plantation: true }))
    return Object.keys(errs).length === 0
  }

  // ✅ V2: Submit via service
  const handleSubmit = async () => {
    if (loadFailed) { message.warning('Chưa tải được dữ liệu NCC — tải lại trang trước khi lưu (tránh ghi đè bằng ô trống)'); return }
    if (!validate()) return
    setSaving(true)

    try {
      const payload = {
        name: form.name.trim(),
        supplier_type: form.supplier_type,
        phone: form.phone || undefined,
        cccd: form.cccd || undefined,
        tax_code: form.tax_code || undefined,
        address: form.address || undefined,
        province: form.province,
        district: form.district || undefined,
        commune: form.commune || undefined,
        plantation_area_ha: form.plantation_area_ha ? Number(form.plantation_area_ha) : undefined,
        rubber_variety: form.rubber_variety || undefined,
        tree_age_years: form.tree_age_years ? Number(form.tree_age_years) : undefined,
        tapping_system: form.tapping_system || undefined,
        geo_latitude: form.geo_latitude ? Number(form.geo_latitude) : undefined,
        geo_longitude: form.geo_longitude ? Number(form.geo_longitude) : undefined,
        eudr_compliant: form.eudr_compliant,
        eudr_cert_expiry: form.eudr_cert_expiry || undefined,
        payment_method: form.payment_method,
        bank_name: form.bank_name || undefined,
        bank_account: form.bank_account || undefined,
        bank_holder: form.bank_holder || undefined,
        quality_rating: form.quality_rating,
        notes: form.notes || undefined,
      }

      if (isEdit && id) {
        await rubberSupplierService.update(id, payload)
      } else {
        await rubberSupplierService.create(payload)
      }

      // ✅ V2: FIX navigate path
      navigate('/rubber/suppliers')
    } catch (err: any) {
      console.error('Lỗi lưu NCC:', err)
      message.error(dichLoiHeThong(err, 'Không thể lưu NCC'))
    } finally {
      setSaving(false)
    }
  }

  const handleGetGPS = () => {
    if (!navigator.geolocation) { message.warning('Trình duyệt không hỗ trợ GPS'); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setField('geo_latitude', pos.coords.latitude.toFixed(7))
        setField('geo_longitude', pos.coords.longitude.toFixed(7))
      },
      err => message.error(GPS_ERR[err.code] || 'Không lấy được vị trí GPS — thử lại'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#8B5E3C]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2] pb-28">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-[#5D3A1A] via-[#8B5E3C] to-[#A0714B] text-white safe-area-top">
        <div className="px-4 pt-4 pb-5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center active:bg-white/20">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold leading-tight">{isEdit ? 'Sửa NCC mủ' : 'Thêm NCC mủ'}</h1>
              <p className="text-[12px] text-white/60">{isEdit ? 'Cập nhật thông tin nhà cung cấp' : 'Đăng ký nhà cung cấp mới'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* FORM SECTIONS */}
      <div className="px-4 -mt-3 relative z-10 space-y-3">

        {/* SECTION 1: CƠ BẢN */}
        <Section title="Thông tin cơ bản" icon={<User size={18} className="text-[#8B5E3C]" />}
          expanded={sections.basic} onToggle={() => toggleSection('basic')} required>
          <Field label="Tên NCC / Hộ dân" required error={errors.name}>
            <Input value={form.name} onChange={v => setField('name', v)} placeholder="Nguyễn Văn A" icon={<User size={16} />} />
          </Field>

          <Field label="Loại hình NCC" required>
            <div className="grid grid-cols-2 gap-2">
              {SUPPLIER_TYPES.map(t => (
                <button key={t.key} type="button" onClick={() => setField('supplier_type', t.key as FormData['supplier_type'])}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-left min-h-[52px] active:scale-[0.98] transition-all ${form.supplier_type === t.key ? 'border-[#8B5E3C] bg-[#8B5E3C]/5 ring-2 ring-[#8B5E3C]/20' : 'border-gray-200 bg-white'}`}>
                  <span className="text-lg">{t.icon}</span>
                  <div>
                    <div className={`text-[13px] font-semibold ${form.supplier_type === t.key ? 'text-[#8B5E3C]' : 'text-gray-700'}`}>{t.label}</div>
                    <div className="text-[10px] text-gray-400">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Số điện thoại" error={errors.phone}>
            <Input value={form.phone} onChange={v => setField('phone', v)} placeholder="0905 123 456" type="tel" icon={<Phone size={16} />} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="CCCD/CMND" error={errors.cccd}>
              <Input value={form.cccd} onChange={v => setField('cccd', v)} placeholder="04620..." icon={<CreditCard size={16} />} />
            </Field>
            <Field label="Mã số thuế">
              <Input value={form.tax_code} onChange={v => setField('tax_code', v)} placeholder="Nếu là DN" icon={<Hash size={16} />} />
            </Field>
          </div>

          <Field label="Địa chỉ">
            <Input value={form.address} onChange={v => setField('address', v)} placeholder="Thôn/Xóm, Xã, Huyện..." icon={<MapPin size={16} />} />
          </Field>

          <Field label="Đánh giá chất lượng">
            <StarRating value={form.quality_rating} onChange={v => setField('quality_rating', v)} />
          </Field>
        </Section>

        {/* SECTION 2: VÙNG TRỒNG */}
        <Section title="Vùng trồng & Vườn cao su" icon={<TreePine size={18} className="text-[#8B5E3C]" />}
          expanded={sections.plantation} onToggle={() => toggleSection('plantation')} required
          badge={form.supplier_type === 'tieu_dien' || form.supplier_type === 'nong_truong' ? 'Quan trọng' : undefined}>
          <Field label="Tỉnh / Thành phố" required error={errors.province}>
            <Select value={form.province} onChange={v => setField('province', v)} placeholder="Chọn tỉnh..."
              options={PROVINCES.map(p => ({ value: p, label: p }))} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Huyện / Quận">
              <Input value={form.district} onChange={v => setField('district', v)} placeholder="Phong Điền" />
            </Field>
            <Field label="Xã / Phường">
              <Input value={form.commune} onChange={v => setField('commune', v)} placeholder="Phong Sơn" />
            </Field>
          </div>

          {(form.supplier_type === 'tieu_dien' || form.supplier_type === 'nong_truong') && (
            <>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[12px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">Thông tin vườn cao su</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Diện tích (ha)" error={errors.plantation_area_ha}>
                  <Input value={form.plantation_area_ha} onChange={v => setField('plantation_area_ha', v)} placeholder="3.5" type="number" icon={<Ruler size={16} />} />
                </Field>
                <Field label="Tuổi cây (năm)" error={errors.tree_age_years}>
                  <Input value={form.tree_age_years} onChange={v => setField('tree_age_years', v)} placeholder="12" type="number" icon={<Calendar size={16} />} />
                </Field>
              </div>
              <Field label="Giống cây cao su">
                <Select value={form.rubber_variety} onChange={v => setField('rubber_variety', v)} placeholder="Chọn giống..."
                  options={RUBBER_VARIETIES.map(v => ({ value: v, label: v }))} />
              </Field>
              <Field label="Chế độ cạo">
                <Select value={form.tapping_system} onChange={v => setField('tapping_system', v)} placeholder="Chọn..."
                  options={TAPPING_SYSTEMS.map(t => ({ value: t.key, label: t.label }))} />
              </Field>
            </>
          )}
        </Section>

        {/* SECTION 3: THANH TOÁN */}
        <Section title="Phương thức thanh toán" icon={<Landmark size={18} className="text-[#8B5E3C]" />}
          expanded={sections.payment} onToggle={() => toggleSection('payment')}>
          <Field label="Mặc định thanh toán">
            <div className="space-y-2">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.key} type="button" onClick={() => setField('payment_method', pm.key as FormData['payment_method'])}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left min-h-[52px] active:scale-[0.98] transition-all ${form.payment_method === pm.key ? 'border-[#8B5E3C] bg-[#8B5E3C]/5 ring-2 ring-[#8B5E3C]/20' : 'border-gray-200 bg-white'}`}>
                  <span className="text-xl">{pm.icon}</span>
                  <div className="flex-1">
                    <div className={`text-[14px] font-semibold ${form.payment_method === pm.key ? 'text-[#8B5E3C]' : 'text-gray-700'}`}>{pm.label}</div>
                    <div className="text-[11px] text-gray-400">{pm.desc}</div>
                  </div>
                  {form.payment_method === pm.key && <CheckCircle2 size={20} className="text-[#8B5E3C] shrink-0" />}
                </button>
              ))}
            </div>
          </Field>

          {(form.payment_method === 'transfer' || form.payment_method === 'debt') && (
            <>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[12px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">Thông tin ngân hàng (tùy chọn)</p>
              </div>
              <Field label="Ngân hàng">
                <Input value={form.bank_name} onChange={v => setField('bank_name', v)} placeholder="Agribank, BIDV, Vietcombank..." icon={<Building2 size={16} />} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Số tài khoản">
                  <Input value={form.bank_account} onChange={v => setField('bank_account', v)} placeholder="0123456789" />
                </Field>
                <Field label="Chủ tài khoản">
                  <Input value={form.bank_holder} onChange={v => setField('bank_holder', v)} placeholder="NGUYEN VAN A" />
                </Field>
              </div>
            </>
          )}
        </Section>

        {/* SECTION 4: EUDR */}
        <Section title="EUDR Compliance" icon={<ShieldCheck size={18} className="text-[#8B5E3C]" />}
          expanded={sections.eudr} onToggle={() => toggleSection('eudr')}
          badge={form.eudr_compliant ? '✅ Đạt' : undefined}>
          <div className="bg-blue-50 rounded-xl p-3 mb-3">
            <p className="text-[12px] text-blue-700 leading-relaxed">
              <strong>EU Deforestation Regulation (EUDR)</strong> yêu cầu truy xuất nguồn gốc đến cấp vùng trồng, bao gồm tọa độ GPS. Thông tin này bắt buộc cho xuất khẩu sang EU.
            </p>
          </div>

          <div className="grid grid-cols-5 gap-3 items-end">
            <div className="col-span-2">
              <Field label="Latitude (Vĩ độ)">
                <Input value={form.geo_latitude} onChange={v => setField('geo_latitude', v)} placeholder="16.4637" type="number" icon={<Globe size={16} />} />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Longitude (Kinh độ)">
                <Input value={form.geo_longitude} onChange={v => setField('geo_longitude', v)} placeholder="107.5909" type="number" icon={<Globe size={16} />} />
              </Field>
            </div>
            <div>
              <button type="button" onClick={handleGetGPS}
                className="w-full h-12 rounded-xl bg-[#8B5E3C]/10 flex items-center justify-center active:bg-[#8B5E3C]/20" title="Lấy GPS từ thiết bị">
                <Navigation size={18} className="text-[#8B5E3C]" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl">
            <div>
              <div className="text-[14px] font-medium text-gray-700">Đạt chuẩn EUDR?</div>
              <div className="text-[11px] text-gray-400">Có chứng nhận deforestation-free</div>
            </div>
            <button type="button" onClick={() => setField('eudr_compliant', !form.eudr_compliant)}
              className={`w-14 h-8 rounded-full p-0.5 transition-colors duration-200 ${form.eudr_compliant ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <div className={`w-7 h-7 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${form.eudr_compliant ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          {form.eudr_compliant && (
            <Field label="Ngày hết hạn chứng nhận">
              <Input value={form.eudr_cert_expiry} onChange={v => setField('eudr_cert_expiry', v)} type="date" icon={<Calendar size={16} />} />
            </Field>
          )}
        </Section>

        {/* GHI CHÚ */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <Field label="Ghi chú">
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)}
              placeholder="Ghi chú thêm về NCC..." rows={3}
              className="w-full rounded-xl border border-gray-200 p-3 text-[15px] text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#8B5E3C]/20 focus:border-[#8B5E3C]" />
          </Field>
        </div>
      </div>

      {/* STICKY BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-gray-200 safe-area-bottom">
        <div className="px-4 py-3 flex gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="flex-1 h-12 rounded-xl border border-gray-300 bg-white text-[15px] font-semibold text-gray-600 active:bg-gray-50">
            Hủy
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="flex-[2] h-12 rounded-xl bg-[#8B5E3C] text-white text-[15px] font-semibold flex items-center justify-center gap-2 active:bg-[#6B4423] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#8B5E3C]/20">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo NCC mới')}
          </button>
        </div>
      </div>
    </div>
  )
}