// ============================================================================
// B2B RUBBER INTAKE PRINT — Phiếu nhập kho (PNK) print layout
// File: src/pages/b2b/rubber-intake/B2BRubberIntakePrintPage.tsx
// ============================================================================
// In A4 — 2 liên trên 2 trang (Liên 1: Đại lý, Liên 2: Lưu nội bộ).
// Hiển thị: PNK#, partner+proxy, biển xe, ĐỐT, DRC, KL tươi, KL khô, đơn giá,
//   thành tiền, chữ ký.
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { rubberIntakeB2BService, type B2BRubberIntake } from '../../../services/b2b/rubberIntakeB2BService'
import { partnerService } from '../../../services/b2b/partnerService'
import { RAW_RUBBER_TYPE_LABELS, type RawRubberType } from '../../../services/b2b/intakeManualEntryService'

export default function B2BRubberIntakePrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<B2BRubberIntake | null>(null)
  const [proxyName, setProxyName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    rubberIntakeB2BService.getById(id).then(async (data) => {
      setItem(data)
      if (data?.b2b_partner_id) {
        const partner = await partnerService.getPartnerById(data.b2b_partner_id)
        if (partner?.payment_proxy_partner_id) {
          const proxy = await partnerService.getPartnerById(partner.payment_proxy_partner_id)
          setProxyName(proxy?.name || null)
        }
      }
      setLoading(false)
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
        <p>Không tìm thấy phiếu</p>
        <button onClick={() => navigate('/b2b/rubber-intake')} className="mt-4 text-blue-600 text-sm">Quay lại</button>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-emerald-800 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/b2b/rubber-intake/${id}`)} className="p-2 hover:bg-emerald-700 rounded">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 text-sm font-medium">In PNK {item.pnk_number != null ? `#${item.pnk_number}` : ''}</div>
        <button
          onClick={() => window.print()}
          className="bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded font-medium text-sm flex items-center gap-2"
        >
          <Printer size={16} /> In phiếu
        </button>
      </div>

      {/* Preview area */}
      <div className="no-print bg-gray-200 min-h-[calc(100vh-56px)] py-6 px-4 flex flex-col items-center gap-4">
        <div className="bg-white shadow-md" style={{ width: '210mm', minHeight: '297mm', padding: '12mm' }}>
          <PnkSheet item={item} proxyName={proxyName} lien="Liên 1: Đại lý" />
        </div>
        <div className="bg-white shadow-md" style={{ width: '210mm', minHeight: '297mm', padding: '12mm' }}>
          <PnkSheet item={item} proxyName={proxyName} lien="Liên 2: Lưu nội bộ" />
        </div>
      </div>

      {/* Print-only content */}
      <div className="print-only">
        <div className="pnk-page">
          <PnkSheet item={item} proxyName={proxyName} lien="Liên 1: Đại lý" />
        </div>
        <div className="pnk-page page-break">
          <PnkSheet item={item} proxyName={proxyName} lien="Liên 2: Lưu nội bộ" />
        </div>
      </div>

      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          @page { size: A4; margin: 12mm; }
          .pnk-page { break-after: page; page-break-after: always; }
          .pnk-page:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// PNK SHEET — 1 liên
// ============================================================================

function PnkSheet({ item, proxyName, lien }: { item: B2BRubberIntake; proxyName: string | null; lien: string }) {
  const netKg = item.net_weight_kg || 0
  const dryKg = item.dry_weight_kg ?? (item.drc_percent != null && netKg ? Math.round(netKg * item.drc_percent / 100 * 100) / 100 : null)
  const amount = item.total_amount || (item.settled_qty_ton && item.settled_price_per_ton ? item.settled_qty_ton * item.settled_price_per_ton : 0)
  const pricePerKg = item.unit_price ?? (item.settled_price_per_ton ? item.settled_price_per_ton / 1000 : null)
  const rawLabel = item.raw_rubber_type ? RAW_RUBBER_TYPE_LABELS[item.raw_rubber_type as RawRubberType] : null
  const intakeDate = new Date(item.intake_date)
  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString('vi-VN') : '—'

  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 13, color: '#111' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1B4D3E', paddingBottom: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1B4D3E', letterSpacing: 0.5 }}>CAO SU HUY ANH PHONG ĐIỀN</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế</div>
          <div style={{ fontSize: 11, color: '#555' }}>MST: 3301549896</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>{lien}</div>
          {item.facility && (
            <div style={{ fontSize: 11, marginTop: 4, color: '#1B4D3E', fontWeight: 600 }}>
              Nhà máy: {item.facility.name} ({item.facility.code})
            </div>
          )}
        </div>
      </div>

      {/* Title + PNK */}
      <div style={{ textAlign: 'center', margin: '6px 0 16px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>PHIẾU NHẬP KHO</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 4 }}>
          {item.pnk_number != null ? <>Số PNK: <span style={{ color: '#92400E' }}>#{item.pnk_number}</span></> : 'Chưa cấp số PNK'}
          <span style={{ margin: '0 8px', color: '#9CA3AF' }}>|</span>
          Ngày: {intakeDate.toLocaleDateString('vi-VN')}
        </div>
        {item.lot_code && (
          <div style={{ fontSize: 12, marginTop: 2 }}>Mã lô: <strong>{item.lot_code}</strong></div>
        )}
      </div>

      {/* Partner info */}
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={tdLabel}>Đại lý cung cấp</td>
            <td style={tdValue} colSpan={3}>
              <strong style={{ fontSize: 14 }}>{item.partner?.name || item.supplier?.name || '—'}</strong>
              {item.partner?.code && <span style={{ color: '#666', marginLeft: 6 }}>({item.partner.code})</span>}
            </td>
          </tr>
          {proxyName && (
            <tr>
              <td style={tdLabel}>Nhận tiền hộ qua</td>
              <td style={tdValue} colSpan={3}>
                <strong>{proxyName}</strong>
                <span style={{ color: '#9333EA', marginLeft: 6, fontSize: 11 }}>(đại lý đầu mối)</span>
              </td>
            </tr>
          )}
          <tr>
            <td style={tdLabel}>Loại mủ</td>
            <td style={tdValue}>{rawLabel || '—'}</td>
            <td style={tdLabel}>Mã LLM (gộp xe)</td>
            <td style={tdValue}>{item.consolidation_code || '—'}</td>
          </tr>
          <tr>
            <td style={tdLabel}>Biển số xe</td>
            <td style={tdValue}>{item.vehicle_plate || '—'}</td>
            <td style={tdLabel}>Số phiếu cân</td>
            <td style={tdValue}>{item.invoice_no || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Weights & DRC */}
      <table style={{ ...tableStyle, marginTop: 12 }}>
        <thead>
          <tr style={{ background: '#1B4D3E', color: '#fff' }}>
            <th style={thStyle} colSpan={4}>KHỐI LƯỢNG &amp; DRC</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdLabel}>Cân tổng (Gross)</td>
            <td style={{ ...tdValue, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(item.gross_weight_kg)} kg</td>
            <td style={tdLabel}>ĐỐT (metrolac)</td>
            <td style={{ ...tdValue, fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#92400E' }}>
              {item.field_dot_reading != null ? item.field_dot_reading : '—'}
            </td>
          </tr>
          <tr>
            <td style={tdLabel}>Cân tươi (Net)</td>
            <td style={{ ...tdValue, fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: '#15803D' }}>
              {fmt(netKg)} kg
            </td>
            <td style={tdLabel}>DRC thực</td>
            <td style={{ ...tdValue, fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: '#15803D' }}>
              {item.drc_percent != null ? `${item.drc_percent}%` : '—'}
            </td>
          </tr>
          <tr style={{ background: '#FEF3C7' }}>
            <td style={{ ...tdLabel, fontWeight: 700 }}>KL khô quy đổi</td>
            <td style={{ ...tdValue, fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: '#92400E' }} colSpan={3}>
              {dryKg != null ? `${fmt(dryKg)} kg` : '—'}
              {dryKg != null && item.drc_percent != null && (
                <span style={{ fontSize: 11, color: '#78350F', marginLeft: 8, fontFamily: 'inherit', fontWeight: 400 }}>
                  = {fmt(netKg)} × {item.drc_percent}% / 100
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Pricing */}
      {(pricePerKg != null || amount > 0) && (
        <table style={{ ...tableStyle, marginTop: 12 }}>
          <thead>
            <tr style={{ background: '#92400E', color: '#fff' }}>
              <th style={thStyle} colSpan={4}>GIÁ TRỊ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdLabel}>Đơn giá</td>
              <td style={{ ...tdValue, fontFamily: 'monospace', fontWeight: 700 }}>
                {pricePerKg != null ? `${fmt(pricePerKg)} đ/kg` : '—'}
              </td>
              <td style={tdLabel}>Thành tiền</td>
              <td style={{ ...tdValue, fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: '#92400E' }}>
                {amount > 0 ? `${fmt(amount)} đ` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Notes */}
      {item.notes && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderLeft: '4px solid #1B4D3E', fontSize: 12 }}>
          <strong>Ghi chú:</strong> {item.notes}
        </div>
      )}

      {/* Signatures */}
      <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', gap: 12, textAlign: 'center', fontSize: 13 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 56 }}>Đại lý cung cấp</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 56 }}>Nhân viên cân</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 56 }}>QC kiểm tra</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 56 }}>Người duyệt</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 6, borderTop: '1px solid #E5E7EB', textAlign: 'center', fontSize: 10, color: '#9CA3AF' }}>
        In từ hệ thống ERP — Cao su Huy Anh Phong Điền • {new Date().toLocaleString('vi-VN')}
      </div>
    </div>
  )
}

// ============================================================================
// TABLE STYLES
// ============================================================================

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid #D1D5DB',
}
const tdLabel: React.CSSProperties = {
  padding: '8px 12px', fontWeight: 600, color: '#374151',
  borderBottom: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB',
  background: '#F9FAFB', width: '20%',
}
const tdValue: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB',
  width: '30%', color: '#111827',
}
const thStyle: React.CSSProperties = {
  padding: '8px 12px', fontWeight: 700, textAlign: 'center', letterSpacing: 0.5,
}
