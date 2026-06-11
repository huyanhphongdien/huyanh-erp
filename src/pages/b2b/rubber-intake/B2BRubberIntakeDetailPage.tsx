// ============================================================================
// B2B RUBBER INTAKE DETAIL — Lý lịch mủ chi tiết + Deal + Stock-In + QC
// File: src/pages/b2b/rubber-intake/B2BRubberIntakeDetailPage.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOpenDealTab } from '../../../hooks/useB2BTabs'
import {
  ArrowLeft, FileCheck, Link2, Package, Scale, Droplets, DollarSign,
  Truck, MapPin, Calendar, CheckCircle, XCircle, Clock, AlertTriangle,
  ExternalLink, Printer, Factory, Hash, Flame, FileText,
} from 'lucide-react'
import {
  rubberIntakeB2BService,
  type B2BRubberIntake,
  SOURCE_LABELS, STATUS_LABELS, STATUS_COLORS,
} from '../../../services/b2b/rubberIntakeB2BService'
import { supabase } from '../../../lib/supabase'
import { message } from 'antd'

// ============================================================================
// TYPES
// ============================================================================

interface StockInInfo {
  id: string
  stock_in_code: string
  status: string
  created_at: string
  batches: { id: string; batch_no: string; initial_drc: number | null; latest_drc: number | null; qc_status: string; quantity_kg: number }[]
}

// ============================================================================
// INFO ROW
// ============================================================================

// ============================================================================
// META FIELD — 1 trường trong grid Định danh
// ============================================================================

function MetaField({ icon, label, value, colSpan }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; colSpan?: 1 | 2
}) {
  return (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <div className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">{icon} {label}</div>
      <div className="font-semibold text-gray-800 break-words">{value}</div>
    </div>
  )
}

// ============================================================================
// STAT BOX — 1 ô số trong quy trình cân
// ============================================================================

function StatBox({ icon, label, sub, value, unit, tone = 'gray' }: {
  icon: React.ReactNode; label: string; sub?: string; value: React.ReactNode; unit?: string;
  tone?: 'gray' | 'orange' | 'blue'
}) {
  const tones = {
    gray:   { bg: 'bg-gray-50',    label: 'text-gray-500',    value: 'text-gray-800',    sub: 'text-gray-400'  },
    orange: { bg: 'bg-orange-50',  label: 'text-orange-600',  value: 'text-orange-700',  sub: 'text-orange-400'},
    blue:   { bg: 'bg-blue-50',    label: 'text-blue-600',    value: 'text-blue-700',    sub: 'text-blue-400'  },
  }[tone]
  return (
    <div className={`${tones.bg} rounded-lg p-3 text-center`}>
      <div className={`text-xs ${tones.label} mb-1 flex items-center justify-center gap-1 font-medium`}>{icon} {label}</div>
      <div className={`text-base font-bold ${tones.value}`}>
        {value}{unit && <span className="text-xs font-normal ml-0.5">{unit}</span>}
      </div>
      {sub && <div className={`text-[10px] ${tones.sub} mt-0.5`}>{sub}</div>}
    </div>
  )
}

// ============================================================================
// MAIN
// ============================================================================

export default function B2BRubberIntakeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const openDealTab = useOpenDealTab()
  const [item, setItem] = useState<B2BRubberIntake | null>(null)
  const [loading, setLoading] = useState(true)
  const [stockIns, setStockIns] = useState<StockInInfo[]>([])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    rubberIntakeB2BService.getById(id).then(data => {
      setItem(data)
      setLoading(false)
      // Fetch linked stock-ins if deal exists
      if (data?.deal_id) {
        supabase
          .from('stock_in_orders')
          .select('id, stock_in_code, status, created_at')
          .eq('deal_id', data.deal_id)
          .order('created_at', { ascending: false })
          .then(async ({ data: sis }) => {
            if (!sis || sis.length === 0) { setStockIns([]); return }
            const siIds = sis.map(s => s.id)
            const { data: details } = await supabase
              .from('stock_in_details')
              .select('stock_in_id, batch_id')
              .in('stock_in_id', siIds)
            const batchIds = (details || []).map(d => d.batch_id).filter(Boolean)
            let batchMap: Record<string, any> = {}
            if (batchIds.length > 0) {
              const { data: batches } = await supabase
                .from('stock_batches')
                .select('id, batch_no, initial_drc, latest_drc, qc_status, quantity_kg')
                .in('id', batchIds)
              if (batches) batches.forEach(b => { batchMap[b.id] = b })
            }
            const result: StockInInfo[] = sis.map(si => ({
              ...si,
              batches: (details || [])
                .filter(d => d.stock_in_id === si.id && d.batch_id && batchMap[d.batch_id])
                .map(d => batchMap[d.batch_id]),
            }))
            setStockIns(result)
          })
      }
    })
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-400">
        <AlertTriangle size={48} className="mb-4" />
        <p>Không tìm thấy lý lịch mủ</p>
        <button onClick={() => navigate('/b2b/rubber-intake')} className="mt-4 text-blue-600 text-sm">Quay lại</button>
      </div>
    )
  }

  const weight = item.settled_qty_ton || (item.net_weight_kg ? item.net_weight_kg / 1000 : 0)
  const amount = item.total_amount || (item.settled_qty_ton && item.settled_price_per_ton ? item.settled_qty_ton * item.settled_price_per_ton : 0)
  const statusClass = STATUS_COLORS[item.status] || STATUS_COLORS.draft
  const price = item.settled_price_per_ton ? item.settled_price_per_ton : item.unit_price ? item.unit_price : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className=" px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/b2b/rubber-intake')} className="p-2 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {item.lot_code && <span className="text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{item.lot_code}</span>}
              <span className="text-sm text-gray-500">{item.product_code}</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {new Date(item.intake_date).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>
          <button
            onClick={() => navigate(`/b2b/rubber-intake/${id}/print`)}
            className="px-3 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg flex items-center gap-1.5 min-h-[44px]"
            title="In Phiếu Nhập Kho (PNK) — bản lưu nội bộ"
          >
            <Printer size={16} /> In PNK
          </button>
          <button
            onClick={() => navigate(`/b2b/rubber-intake/${id}/print?lien=2`)}
            className="px-3 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 min-h-[44px]"
            title="In Xác nhận khối lượng & thanh toán — Liên 2 giao khách hàng"
          >
            <FileText size={16} /> In Liên 2
          </button>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusClass}`}>
            {STATUS_LABELS[item.status]}
          </span>
        </div>
      </div>

      <div className=" px-4 py-6 space-y-4">
        {/* ═══ Partner / Supplier ═══ */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Nhà cung cấp</h3>
          {item.partner ? (
            <div className="flex items-center gap-3" onClick={() => navigate(`/b2b/partners/${item.partner!.id}`)} role="button">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                {item.partner.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-gray-900">{item.partner.name}</div>
                <div className="text-xs text-gray-500">{item.partner.code} • B2B Đại lý</div>
              </div>
              <span className="text-sm px-2 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
                {item.partner.tier === 'diamond' ? '💎' : item.partner.tier === 'gold' ? '🥇' : item.partner.tier === 'silver' ? '🥈' : '🆕'} {item.partner.tier}
              </span>
            </div>
          ) : item.supplier ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <Package size={20} />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">{item.supplier.name}</div>
                <div className="text-xs text-gray-500">{item.supplier.code} • {item.supplier.supplier_type}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Chưa liên kết NCC</p>
          )}
        </div>

        {/* ═══ Deal Link ═══ */}
        {item.deal && (
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
            <h3 className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Link2 size={12} /> Liên kết Deal
            </h3>
            <button onClick={() => openDealTab({ id: item.deal!.id, deal_number: item.deal!.deal_number })} className="w-full flex items-center gap-3 p-2 bg-white rounded-lg hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                DL
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-bold text-gray-900">{item.deal.deal_number}</div>
                <div className="text-xs text-gray-500">Trạng thái: {item.deal.status}</div>
              </div>
              <ExternalLink size={16} className="text-blue-400" />
            </button>
          </div>
        )}

        {/* ═══ Loại mủ (bonus đại lý) ═══ */}
        <RubberTypePicker intake={item} onChange={(rt) => setItem({ ...item, rubber_type: rt })} />

        {/* ═══ Định danh phiếu ═══ */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Định danh phiếu</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {item.facility && (
              <MetaField icon={<Factory size={12} />} label="Cơ sở" value={`${item.facility.code} — ${item.facility.name}`} />
            )}
            {item.pnk_number != null && (
              <MetaField icon={<Hash size={12} />} label="Số PNK" value={`#${item.pnk_number}`} />
            )}
            {item.consolidation_code && (
              <MetaField icon={<FileText size={12} />} label="Mã chốt số (LLM)" value={item.consolidation_code} colSpan={2} />
            )}
            <MetaField icon={<MapPin size={12} />} label="Nguồn gốc" value={`${SOURCE_LABELS[item.source_type]}${item.location_name ? ` • ${item.location_name}` : ''}`} />
            {item.vehicle_plate && (
              <MetaField icon={<Truck size={12} />} label="Xe vận chuyển" value={`${item.vehicle_plate}${item.vehicle_label ? ` (${item.vehicle_label})` : ''}`} />
            )}
            {item.invoice_no && (
              <MetaField icon={<FileCheck size={12} />} label="Hóa đơn" value={item.invoice_no} />
            )}
            {item.buyer_name && (
              <MetaField icon={<Package size={12} />} label="Người mua" value={item.buyer_name} />
            )}
          </div>
        </div>

        {/* ═══ Cân & chất lượng ═══ */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
            <Scale size={12} /> Cân & chất lượng
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <StatBox icon={<Scale size={12} />} label="GROSS" sub="xe + mủ" value={item.gross_weight_kg != null ? item.gross_weight_kg.toLocaleString('vi-VN') : '—'} unit="kg" />
            <StatBox icon={<Scale size={12} />} label="NET" sub="mủ tươi" value={item.net_weight_kg != null ? item.net_weight_kg.toLocaleString('vi-VN') : '—'} unit="kg" />
            <StatBox icon={<Flame size={12} />} label="ĐỐT" sub="metrolac" value={item.field_dot_reading ?? '—'} tone="orange" />
            <StatBox icon={<Droplets size={12} />} label="DRC" sub="hàm lượng" value={item.drc_percent != null ? `${item.drc_percent}` : '—'} unit="%" tone="blue" />
          </div>
          {item.dry_weight_kg != null && (
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-amber-700" />
                <div>
                  <div className="text-sm font-semibold text-amber-900">Khối lượng khô</div>
                  <div className="text-xs text-amber-700">NET × DRC ÷ 100</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-amber-800">
                  {item.dry_weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
                </span>
                <span className="text-base font-medium text-amber-700 ml-1">kg</span>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Tài chính ═══ */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
            <DollarSign size={12} /> Tài chính
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Đơn giá</div>
              <div className="text-base font-bold text-gray-800">
                {price ? `${price.toLocaleString('vi-VN')} đ/${item.settled_price_per_ton ? 'tấn' : 'kg'}` : <span className="text-gray-300 font-normal">Chưa có giá</span>}
              </div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
              <div className="text-xs text-emerald-600 mb-1">Tổng giá trị</div>
              <div className="text-base font-bold text-emerald-700">
                {amount ? `${amount.toLocaleString('vi-VN')} đ` : <span className="text-emerald-300 font-normal">—</span>}
              </div>
            </div>
          </div>
          {item.finished_product_ton && (
            <div className="mt-3 text-xs text-gray-500 flex items-center gap-1">
              <Package size={12} /> Thành phẩm dự kiến: <strong className="text-gray-700">{item.finished_product_ton.toFixed(2)} tấn</strong>
            </div>
          )}
        </div>

        {/* ═══ Thanh toán ═══ */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Thanh toán</h3>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              item.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
              item.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {item.payment_status === 'paid' ? 'Đã thanh toán' : item.payment_status === 'partial' ? 'Thanh toán một phần' : 'Chưa thanh toán'}
            </span>
          </div>
          {amount > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Đã trả</span>
                <span className="font-medium">{(item.paid_amount || 0).toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(((item.paid_amount || 0) / amount) * 100, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{((item.paid_amount || 0) / amount * 100).toFixed(0)}%</span>
                <span>/ {amount.toLocaleString('vi-VN')} đ</span>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Nhập kho & QC ═══ */}
        {stockIns.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Package size={12} /> Nhập kho & QC
            </h3>
            <div className="space-y-3">
              {stockIns.map(si => (
                <div key={si.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => navigate(`/wms/stock-in/${si.id}`)} className="text-sm font-medium text-blue-600 hover:underline">
                      {si.stock_in_code}
                    </button>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      si.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      si.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{si.status}</span>
                  </div>
                  {si.batches.length > 0 && (
                    <div className="space-y-1.5">
                      {si.batches.map(b => (
                        <div key={b.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg p-2">
                          <span className="font-mono font-medium text-gray-700">{b.batch_no}</span>
                          <span className="text-gray-400">|</span>
                          <span>{(b.quantity_kg || 0).toLocaleString()} kg</span>
                          {b.latest_drc && <span className="text-emerald-600 font-medium">DRC {b.latest_drc}%</span>}
                          <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            b.qc_status === 'passed' ? 'bg-emerald-100 text-emerald-700' :
                            b.qc_status === 'failed' ? 'bg-red-100 text-red-700' :
                            b.qc_status === 'warning' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {b.qc_status === 'passed' ? 'QC OK' : b.qc_status === 'failed' ? 'QC Fail' : b.qc_status === 'warning' ? 'Cảnh báo' : 'Chờ QC'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Notes ═══ */}
        {item.notes && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ghi chú</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.notes}</p>
          </div>
        )}

        {/* ═══ Timeline ═══ */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Lịch sử</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-gray-500">Tạo phiếu</span>
              <span className="ml-auto text-xs text-gray-400">{new Date(item.created_at).toLocaleString('vi-VN')}</span>
            </div>
            {item.status !== 'draft' && (
              <div className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full ${item.status === 'cancelled' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                <span className="text-gray-500">{item.status === 'cancelled' ? 'Đã hủy' : 'Xác nhận'}</span>
                <span className="ml-auto text-xs text-gray-400">{new Date(item.updated_at).toLocaleString('vi-VN')}</span>
              </div>
            )}
            {item.status === 'settled' && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-500">Quyết toán</span>
                <span className="ml-auto text-xs text-gray-400">{new Date(item.updated_at).toLocaleString('vi-VN')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// RUBBER TYPE PICKER — inline editor cho `rubber_type` (bonus đại lý)
// ============================================================================
function RubberTypePicker({
  intake,
  onChange,
}: {
  intake: B2BRubberIntake
  onChange: (rt: 'tap' | 'nuoc' | null) => void
}) {
  const [saving, setSaving] = useState(false)

  const RAW_OPTIONS: Array<{ value: 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to'; label: string; icon: string }> = [
    { value: 'mu_nuoc', label: 'Mủ nước', icon: '💧' },
    { value: 'mu_tap',  label: 'Mủ tạp',  icon: '🪨' },
    { value: 'mu_chen', label: 'Mủ chén', icon: '🥣' },
    { value: 'mu_to',   label: 'Mủ tờ',   icon: '📄' },
  ]

  const intakeRaw = (intake as unknown as { raw_rubber_type?: string }).raw_rubber_type ?? null

  const setRawType = async (rawType: typeof RAW_OPTIONS[number]['value']) => {
    if (intakeRaw === rawType) return
    setSaving(true)
    try {
      // Set raw_rubber_type — DB trigger tự derive rubber_type (2 loại bonus)
      const { error } = await supabase
        .from('rubber_intake_batches')
        .update({ raw_rubber_type: rawType })
        .eq('id', intake.id)
      if (error) throw error
      const bonusType: 'tap' | 'nuoc' = rawType === 'mu_nuoc' ? 'nuoc' : 'tap'
      onChange(bonusType)
    } catch (e) {
      message.error(`Lỗi: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const isB2B = Boolean(intake.b2b_partner_id)
  const bonusGroup = intake.rubber_type === 'nuoc' ? 'Mủ nước' : intake.rubber_type === 'tap' ? 'Mủ tạp' : null

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
        Loại mủ chi tiết {isB2B && <span className="text-emerald-600 normal-case">(để tính bonus đại lý)</span>}
      </h3>
      {!isB2B && intakeRaw == null && (
        <p className="text-xs text-gray-500 mb-2">
          Phiếu này không gắn đại lý B2B — không cần phân loại để tính bonus. Có thể bỏ qua.
        </p>
      )}
      <div className="grid grid-cols-5 gap-1">
        {RAW_OPTIONS.map((opt) => {
          const isActive = intakeRaw === opt.value
          const isNuoc = opt.value === 'mu_nuoc'
          return (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => setRawType(opt.value)}
              className={`px-2 py-2 rounded-lg border text-xs font-medium ${
                isActive
                  ? isNuoc
                    ? 'bg-blue-50 border-blue-300 text-blue-800'
                    : 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.icon} {opt.label}
            </button>
          )
        })}
      </div>
      {bonusGroup && (
        <p className="text-xs text-gray-500 mt-2">
          ⇒ Nhóm bonus: <strong className={intake.rubber_type === 'nuoc' ? 'text-blue-700' : 'text-amber-700'}>{bonusGroup}</strong>
        </p>
      )}
      {saving && <p className="text-xs text-gray-400 mt-1">Đang lưu…</p>}
    </div>
  )
}
