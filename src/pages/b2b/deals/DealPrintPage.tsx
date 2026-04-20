// ============================================================================
// FILE: src/pages/b2b/deals/DealPrintPage.tsx
// Trang in Phiếu Deal — A4 portrait, tối ưu cho máy in / save PDF
// Route: /b2b/deals/:id/print (standalone, không có sidebar)
// ============================================================================

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Printer, AlertCircle } from 'lucide-react'
import { dealService, type Deal } from '../../../services/b2b/dealService'

// ============================================
// FACILITY MAP (sync với portal + dealConfirmService)
// ============================================
const FACILITY_MAP: Record<string, { code: string; name: string; address: string }> = {
  '755ae776-3be6-47b8-b1d0-d15b61789f24': {
    code: 'PD',
    name: 'Nhà máy Phong Điền',
    address: 'KCN Phong Điền, Thừa Thiên Huế',
  },
  '9bc1467c-0cbe-4982-abc1-192c61ef7dca': {
    code: 'TL',
    name: 'Nhà máy Tân Lâm',
    address: 'Cam Lộ, Quảng Trị',
  },
  '67b45068-6e7c-4888-b8b3-49721bb9cb96': {
    code: 'LAO',
    name: 'Nhà máy Lào',
    address: 'Savannakhet, CHDCND Lào',
  },
}

const PRODUCT_LABELS: Record<string, string> = {
  mu_nuoc: 'Mủ nước',
  mu_tap: 'Mủ tạp',
  mu_dong: 'Mủ đông',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ',
}

const fmtDate = (s?: string | null): string => {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}
const fmtNumber = (n?: number | null): string =>
  n != null ? n.toLocaleString('vi-VN') : '—'

interface DealPrintPageProps {
  id?: string
}

const DealPrintPage = ({ id: propId }: DealPrintPageProps = {}) => {
  const { id: paramId } = useParams<{ id: string }>()
  const id = propId || paramId
  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    dealService.getDealById(id)
      .then(d => {
        if (!d) setError('Không tìm thấy Deal')
        else setDeal(d)
      })
      .catch(e => setError(e?.message || 'Lỗi tải dữ liệu'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-center text-gray-500">Đang tải...</div>
  if (error || !deal) return (
    <div className="p-8 text-center">
      <AlertCircle size={48} className="mx-auto text-red-500 mb-2" />
      <div className="text-red-600 font-semibold">{error || 'Không có dữ liệu'}</div>
    </div>
  )

  const facility = deal.target_facility_id ? FACILITY_MAP[deal.target_facility_id] : null
  const quantityTons = deal.quantity_kg ? deal.quantity_kg / 1000 : 0
  const productLabel = PRODUCT_LABELS[deal.rubber_type || deal.product_code || ''] || deal.product_name || '—'
  const estimatedValue = deal.total_value_vnd || deal.final_value || 0
  const priceUnitLabel = deal.price_unit === 'dry' ? 'khô' : 'ướt'

  return (
    <div className="bg-gray-100 min-h-screen py-6 print:bg-white print:py-0">
      {/* Print button — ẩn khi in */}
      <div className="max-w-[210mm] mx-auto mb-4 flex justify-end gap-2 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-[#1B4D3E] text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-[#0F3D2E]"
        >
          <Printer size={18} /> In phiếu (Ctrl+P)
        </button>
      </div>

      {/* A4 paper */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-md print:shadow-none" style={{ minHeight: '297mm' }}>
        <div className="p-10 print:p-8">
          {/* HEADER */}
          <div className="flex items-start justify-between pb-4 border-b-2 border-[#1B4D3E]">
            <div>
              <h1 className="text-2xl font-bold text-[#1B4D3E]">CÔNG TY TNHH MTV CAO SU HUY ANH</h1>
              <div className="text-sm text-gray-600 mt-1">
                Địa chỉ: KCN Phong Điền, Thừa Thiên Huế · Hotline: 0234.xxx.xxx
              </div>
              <div className="text-sm text-gray-600">
                MST: 3301xxxxxx · Email: info@huyanhrubber.vn
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Số phiếu</div>
              <div className="text-xl font-bold font-mono text-[#1B4D3E]">{deal.deal_number}</div>
              <div className="text-xs text-gray-500 mt-2">Ngày lập</div>
              <div className="text-sm font-semibold">{fmtDate(deal.created_at)}</div>
            </div>
          </div>

          {/* TITLE */}
          <h2 className="text-2xl font-bold text-center my-6 uppercase">Phiếu chốt giao dịch thu mua mủ</h2>

          {/* SECTION 1: PARTNER */}
          <section className="mb-5">
            <h3 className="text-base font-bold bg-gray-100 px-3 py-2 rounded">① Thông tin đại lý / nhà cung cấp</h3>
            <table className="w-full text-sm mt-3">
              <tbody>
                <tr>
                  <td className="py-1.5 pr-4 text-gray-600 w-40">Mã đại lý</td>
                  <td className="font-mono font-semibold">{deal.partner?.code || '—'}</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4 text-gray-600">Tên đại lý</td>
                  <td className="font-semibold">{deal.partner?.name || '—'}</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4 text-gray-600">SĐT liên hệ</td>
                  <td>{deal.partner?.phone || '—'}</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-4 text-gray-600">Phân hạng</td>
                  <td>{deal.partner?.tier || '—'}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* SECTION 2: GOODS */}
          <section className="mb-5">
            <h3 className="text-base font-bold bg-gray-100 px-3 py-2 rounded">② Thông tin hàng hoá</h3>
            <table className="w-full text-sm mt-3 border-collapse">
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pr-4 text-gray-600 w-40">Loại mủ</td>
                  <td className="font-semibold">{productLabel}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pr-4 text-gray-600">Số lượng</td>
                  <td className="font-semibold">{fmtNumber(quantityTons)} tấn ({fmtNumber(deal.quantity_kg)} kg)</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pr-4 text-gray-600">DRC dự kiến</td>
                  <td>{deal.expected_drc != null ? `${deal.expected_drc}%` : '—'}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pr-4 text-gray-600">Đơn giá ({priceUnitLabel})</td>
                  <td className="font-semibold">{fmtNumber(deal.unit_price)} đ/kg</td>
                </tr>
                <tr className="border-b border-gray-200 bg-yellow-50">
                  <td className="py-2 pr-4 text-gray-600 font-semibold">Giá trị ước tính</td>
                  <td className="font-bold text-[#B45309] text-base">{fmtNumber(estimatedValue)} VNĐ</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pr-4 text-gray-600">Mã lô</td>
                  <td className="font-mono">{deal.lot_code || '—'}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-gray-600">Ngày giao dự kiến</td>
                  <td>{fmtDate(deal.delivery_date)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* SECTION 3: LOGISTICS */}
          <section className="mb-5">
            <h3 className="text-base font-bold bg-gray-100 px-3 py-2 rounded">③ Địa điểm & Giao nhận</h3>
            <table className="w-full text-sm mt-3">
              <tbody>
                <tr>
                  <td className="py-2 pr-4 text-gray-600 w-40">Vùng thu mua</td>
                  <td className="font-semibold">
                    {deal.rubber_region || '—'}
                    {deal.rubber_region_lat && deal.rubber_region_lng && (
                      <span className="ml-2 text-xs font-mono text-gray-500">
                        ({deal.rubber_region_lat.toFixed(6)}, {deal.rubber_region_lng.toFixed(6)})
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="bg-emerald-50">
                  <td className="py-2 pr-4 text-gray-600 font-semibold">🏭 Giao tại nhà máy</td>
                  <td className="font-bold text-[#1B4D3E]">
                    {facility ? (
                      <>
                        <span className="text-base">{facility.code} — {facility.name}</span>
                        <div className="text-xs font-normal text-gray-600 mt-0.5">{facility.address}</div>
                      </>
                    ) : (
                      <span className="text-gray-400 italic">Chưa chỉ định</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* NOTES */}
          {deal.notes && (
            <section className="mb-5">
              <h3 className="text-base font-bold bg-gray-100 px-3 py-2 rounded">④ Ghi chú</h3>
              <p className="text-sm mt-3 p-3 border border-gray-200 rounded whitespace-pre-wrap">
                {deal.notes}
              </p>
            </section>
          )}

          {/* SIGNATURES */}
          <section className="mt-10 grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="font-bold text-sm">ĐẠI DIỆN ĐẠI LÝ</div>
              <div className="text-xs text-gray-600 italic">(Ký, ghi rõ họ tên)</div>
              <div style={{ height: 80 }}></div>
              <div className="text-sm">{deal.partner?.name || '_______________'}</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-sm">ĐẠI DIỆN NHÀ MÁY</div>
              <div className="text-xs text-gray-600 italic">(Ký, ghi rõ họ tên & đóng dấu)</div>
              <div style={{ height: 80 }}></div>
              <div className="text-sm">_______________</div>
            </div>
          </section>

          {/* FOOTER */}
          <div className="mt-10 pt-3 border-t border-gray-200 text-center text-xs text-gray-400">
            Phiếu này được tạo tự động bởi hệ thống ERP Huy Anh Rubber · In ngày {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      </div>

      {/* PRINT CSS */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}

export default DealPrintPage
