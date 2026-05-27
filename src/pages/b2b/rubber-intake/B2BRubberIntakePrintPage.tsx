// ============================================================================
// B2B RUBBER INTAKE PRINT — Phiếu nhập kho (PNK) NỘI BỘ
// File: src/pages/b2b/rubber-intake/B2BRubberIntakePrintPage.tsx
// ============================================================================
// Bản lưu nội bộ cho Kho + Kế toán. KHÔNG giao đại lý (đại lý đã cầm phiếu cân).
// 1 trang A4, tóm tắt cơ sở thanh toán + tiếp nhận kho + 3 chữ ký nội bộ.
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
        <div className="flex-1 text-sm font-medium">
          PNK {item.pnk_number != null ? `#${item.pnk_number}` : ''} · Bản lưu nội bộ
        </div>
        <button
          onClick={() => window.print()}
          className="bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded font-medium text-sm flex items-center gap-2"
        >
          <Printer size={16} /> In phiếu
        </button>
      </div>

      {/* Preview area — 1 trang A4 */}
      <div className="no-print bg-gray-200 min-h-[calc(100vh-56px)] py-6 px-4 flex flex-col items-center">
        <div className="bg-white shadow-md" style={{ width: '210mm', minHeight: '297mm', padding: '14mm 14mm' }}>
          <PnkSheet item={item} proxyName={proxyName} />
        </div>
      </div>

      {/* Print-only content */}
      <div className="print-only">
        <PnkSheet item={item} proxyName={proxyName} />
      </div>

      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// PNK SHEET — 1 trang A4 nội bộ
// ============================================================================

function PnkSheet({ item, proxyName }: { item: B2BRubberIntake; proxyName: string | null }) {
  const netKg = item.net_weight_kg || 0
  const dryKg = item.dry_weight_kg ?? (item.drc_percent != null && netKg ? Math.round(netKg * item.drc_percent / 100 * 100) / 100 : null)
  const amount = item.total_amount || (item.settled_qty_ton && item.settled_price_per_ton ? item.settled_qty_ton * item.settled_price_per_ton : 0)
  const pricePerKg = item.unit_price ?? (item.settled_price_per_ton ? item.settled_price_per_ton / 1000 : null)
  const rawLabel = item.raw_rubber_type ? RAW_RUBBER_TYPE_LABELS[item.raw_rubber_type as RawRubberType] : null
  const intakeDate = new Date(item.intake_date)
  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString('vi-VN') : '—'

  // Truy ngược số phiếu cân từ notes "Auto-tạo từ phiếu cân WB-XXX"
  const wbMatch = item.notes?.match(/phiếu cân\s+(\S+)/i)
  const wbCode = wbMatch?.[1] || item.invoice_no || null

  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 13, color: '#111', position: 'relative' }}>
      {/* Watermark: BẢN LƯU NỘI BỘ */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        background: '#FEE2E2', color: '#991B1B', fontWeight: 700, fontSize: 11,
        padding: '4px 10px', borderRadius: 4, letterSpacing: 0.5,
        border: '1px solid #FCA5A5',
      }}>
        BẢN LƯU NỘI BỘ — KHÔNG GIAO ĐẠI LÝ
      </div>

      {/* Header */}
      <div style={{ borderBottom: '2px solid #1B4D3E', paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1B4D3E' }}>CAO SU HUY ANH PHONG ĐIỀN</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế · MST: 3301549896</div>
      </div>

      {/* Title + identity row */}
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>PHIẾU NHẬP KHO</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>(Bản lưu Kho + Kế toán)</div>
        <div style={{
          display: 'inline-flex', gap: 20, marginTop: 8, padding: '6px 16px',
          background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13,
        }}>
          <span>Số PNK: <strong style={{ color: '#92400E' }}>#{item.pnk_number ?? '—'}</strong></span>
          <span style={{ color: '#D1D5DB' }}>│</span>
          <span>Ngày nhập: <strong>{intakeDate.toLocaleDateString('vi-VN')}</strong></span>
          <span style={{ color: '#D1D5DB' }}>│</span>
          <span>Cơ sở: <strong>{item.facility?.name || '—'}{item.facility?.code ? ` (${item.facility.code})` : ''}</strong></span>
        </div>
      </div>

      {/* Truy ngược phiếu cân */}
      {wbCode && (
        <div style={{
          marginBottom: 10, padding: '8px 12px',
          background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6,
          fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ color: '#1E40AF', fontWeight: 600 }}>Theo phiếu cân:</span>
            <strong style={{ marginLeft: 8, fontFamily: 'monospace', color: '#1E3A8A' }}>{wbCode}</strong>
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic' }}>
            Đại lý đã ký phiếu cân khi đem hàng đến
          </div>
        </div>
      )}

      {/* Nhà cung cấp + lô */}
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={tdLabel}>Đại lý cung cấp</td>
            <td style={tdValue} colSpan={3}>
              <strong style={{ fontSize: 14 }}>{item.partner?.name || item.supplier?.name || '—'}</strong>
              {item.partner?.code && <span style={{ color: '#666', marginLeft: 6 }}>({item.partner.code})</span>}
              {item.partner?.tier && (
                <span style={{
                  marginLeft: 8, fontSize: 11, padding: '1px 6px',
                  background: '#F3E8FF', color: '#6B21A8', borderRadius: 3, fontWeight: 600,
                }}>
                  Tier {item.partner.tier}
                </span>
              )}
            </td>
          </tr>
          {proxyName && (
            <tr>
              <td style={tdLabel}>Trả tiền hộ qua</td>
              <td style={{ ...tdValue, color: '#9333EA' }} colSpan={3}>
                <strong>{proxyName}</strong>
                <span style={{ marginLeft: 6, fontSize: 11, color: '#6B7280' }}>(đại lý đầu mối)</span>
              </td>
            </tr>
          )}
          <tr>
            <td style={tdLabel}>Loại mủ</td>
            <td style={tdValue}>{rawLabel || '—'}</td>
            <td style={tdLabel}>Biển số xe</td>
            <td style={tdValue}>{item.vehicle_plate || '—'}</td>
          </tr>
          <tr>
            <td style={tdLabel}>Mã LLM (gộp xe)</td>
            <td style={tdValue}>{item.consolidation_code || '—'}</td>
            <td style={tdLabel}>Mã lô kho</td>
            <td style={tdValue}><strong>{item.lot_code || '—'}</strong></td>
          </tr>
        </tbody>
      </table>

      {/* CƠ SỞ THANH TOÁN — block chính của PNK nội bộ */}
      <div style={{
        marginTop: 12, padding: '12px 16px',
        background: '#FFFBEB', border: '2px solid #F59E0B', borderRadius: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', letterSpacing: 0.8, marginBottom: 8 }}>
          CƠ SỞ THANH TOÁN
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontFamily: 'monospace',
          padding: '6px 0', borderBottom: '1px dashed #FCD34D', marginBottom: 8,
        }}>
          <span>NET <strong>{fmt(netKg)}</strong> kg</span>
          <span style={{ color: '#92400E' }}>×</span>
          <span>DRC <strong>{item.drc_percent != null ? `${item.drc_percent}%` : '—'}</strong></span>
          <span style={{ color: '#92400E' }}>=</span>
          <span style={{ color: '#92400E', fontWeight: 800, fontSize: 16 }}>
            KL khô {dryKg != null ? fmt(dryKg) : '—'} kg
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
          <div style={{ flex: 1 }}>
            <span style={{ color: '#6B7280' }}>Đơn giá: </span>
            <strong style={{ fontFamily: 'monospace' }}>
              {pricePerKg != null ? `${fmt(pricePerKg)} đ/kg` : '─────────'}
            </strong>
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <span style={{ color: '#6B7280' }}>Thành tiền: </span>
            <strong style={{ fontFamily: 'monospace', fontSize: 16, color: '#92400E' }}>
              {amount > 0 ? `${fmt(amount)} đ` : '─────────────'}
            </strong>
          </div>
        </div>
      </div>

      {/* TIẾP NHẬN KHO — thủ kho điền tay khi nhận */}
      <div style={{
        marginTop: 12, padding: '12px 16px',
        border: '1px solid #D1D5DB', borderRadius: 6, background: '#FAFAFA',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: 0.8, marginBottom: 10 }}>
          TIẾP NHẬN KHO <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#9CA3AF', letterSpacing: 0 }}>(thủ kho điền khi nhận)</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', fontSize: 13 }}>
          <tbody>
            <tr>
              <td style={{ width: 100, color: '#6B7280' }}>Số bao / kiện:</td>
              <td style={{ borderBottom: '1px dotted #9CA3AF', width: '30%' }}>&nbsp;</td>
              <td style={{ width: 100, color: '#6B7280', paddingLeft: 16 }}>Vị trí lưu kho:</td>
              <td style={{ borderBottom: '1px dotted #9CA3AF' }}>&nbsp;</td>
            </tr>
            <tr>
              <td style={{ color: '#6B7280' }}>Trạng thái QC:</td>
              <td style={{ borderBottom: '1px dotted #9CA3AF' }}>&nbsp;</td>
              <td style={{ color: '#6B7280', paddingLeft: 16 }}>Giờ tiếp nhận:</td>
              <td style={{ borderBottom: '1px dotted #9CA3AF' }}>&nbsp;</td>
            </tr>
            <tr>
              <td style={{ color: '#6B7280', verticalAlign: 'top', paddingTop: 4 }}>Ghi chú:</td>
              <td colSpan={3} style={{ borderBottom: '1px dotted #9CA3AF', height: 22 }}>&nbsp;</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Notes hệ thống (nếu có khác auto-note) */}
      {item.notes && !item.notes.startsWith('Auto-tạo') && (
        <div style={{
          marginTop: 10, padding: '6px 12px',
          background: '#F9FAFB', borderLeft: '3px solid #1B4D3E', fontSize: 12,
        }}>
          <strong>Ghi chú hệ thống:</strong> {item.notes}
        </div>
      )}

      {/* Chữ ký nội bộ — 3 ô (KHÔNG có đại lý) */}
      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', gap: 16, textAlign: 'center', fontSize: 13 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 48 }}>Thủ kho</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 48 }}>QC kiểm tra</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 48 }}>Kế toán</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 6, borderTop: '1px solid #E5E7EB', textAlign: 'center', fontSize: 10, color: '#9CA3AF' }}>
        In từ hệ thống ERP — Cao su Huy Anh Phong Điền · {new Date().toLocaleString('vi-VN')}
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
  padding: '6px 10px', fontWeight: 600, color: '#374151',
  borderBottom: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB',
  background: '#F9FAFB', width: '20%',
}
const tdValue: React.CSSProperties = {
  padding: '6px 10px', borderBottom: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB',
  width: '30%', color: '#111827',
}
