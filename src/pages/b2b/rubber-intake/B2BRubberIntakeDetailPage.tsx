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
  ExternalLink, ChevronRight,
} from 'lucide-react'
import {
  rubberIntakeB2BService,
  type B2BRubberIntake,
  SOURCE_LABELS, STATUS_LABELS, STATUS_COLORS,
} from '../../../services/b2b/rubberIntakeB2BService'
import { supabase } from '../../../lib/supabase'

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

function InfoRow({ icon, label, value, accent, onClick }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; accent?: boolean; onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={`flex items-start gap-3 py-3 ${onClick ? 'hover:bg-gray-50 cursor-pointer w-full text-left rounded-lg px-2 -mx-2' : ''}`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <div className={`text-sm font-medium ${accent ? 'text-blue-600' : 'text-gray-800'}`}>{value || <span className="text-gray-300">—</span>}</div>
      </div>
      {onClick && <ChevronRight size={16} className="text-gray-300 mt-2" />}
    </Comp>
  )
}

// ============================================================================
// DRC GAUGE
// ============================================================================

function DRCGauge({ value }: { value: number | null }) {
  if (!value) return <span className="text-gray-300">—</span>
  const pct = Math.min(Math.max((value - 30) / 50 * 100, 0), 100)
  const color = value >= 50 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-lg font-bold text-gray-800">{value}%</span>
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
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
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
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusClass}`}>
            {STATUS_LABELS[item.status]}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
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

        {/* ═══ DRC ═══ */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
            <Droplets size={12} /> Hàm lượng DRC
          </h3>
          <DRCGauge value={item.drc_percent} />
        </div>

        {/* ═══ Thông tin chi tiết ═══ */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Chi tiết</h3>
          <div className="divide-y divide-gray-50">
            <InfoRow icon={<Scale size={16} />} label="Khối lượng tươi" value={`${(item.gross_weight_kg || 0).toLocaleString('vi-VN')} kg`} />
            <InfoRow icon={<Scale size={16} />} label="Khối lượng nhập" value={`${(item.net_weight_kg || 0).toLocaleString('vi-VN')} kg`} />
            <InfoRow icon={<Package size={16} />} label="Thành phẩm" value={item.finished_product_ton ? `${item.finished_product_ton.toFixed(2)} tấn` : null} />
            <InfoRow icon={<DollarSign size={16} />} label="Đơn giá" value={price ? `${price.toLocaleString('vi-VN')} đ/${item.settled_price_per_ton ? 'tấn' : 'kg'}` : null} />
            <InfoRow icon={<DollarSign size={16} />} label="Tổng giá trị" value={amount ? `${amount.toLocaleString('vi-VN')} đ` : null} accent />
            <InfoRow icon={<MapPin size={16} />} label="Nguồn gốc" value={`${SOURCE_LABELS[item.source_type]} ${item.location_name ? `• ${item.location_name}` : ''}`} />
            {item.vehicle_plate && <InfoRow icon={<Truck size={16} />} label="Xe vận chuyển" value={`${item.vehicle_plate} ${item.vehicle_label ? `(${item.vehicle_label})` : ''}`} />}
            {item.invoice_no && <InfoRow icon={<FileCheck size={16} />} label="Số hóa đơn" value={item.invoice_no} />}
            {item.buyer_name && <InfoRow icon={<Package size={16} />} label="Người mua" value={item.buyer_name} />}
          </div>
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
