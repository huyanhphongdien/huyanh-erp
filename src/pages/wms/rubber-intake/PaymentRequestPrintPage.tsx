// ============================================================================
// FILE: src/pages/wms/rubber-intake/PaymentRequestPrintPage.tsx
// MODULE: WMS / Nhập kho mủ — In Đề nghị thanh toán (ĐỢT 1)
// 1 trang A4: header công ty + bảng nhiều dòng + số tiền bằng chữ + 3 chữ ký.
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import {
  paymentRequestService,
  type PaymentRequest,
  type PaymentRequestLine,
} from '../../../services/wms/paymentRequestService'

const RUBBER_LABELS: Record<string, string> = {
  mu_nuoc: 'Mủ nước', mu_tap: 'Mủ tạp', mu_dong: 'Mủ đông', mu_chen: 'Mủ chén', mu_to: 'Mủ tờ',
}
const CCY_SUFFIX: Record<string, string> = { VND: 'đồng', KIP: 'kíp', THB: 'baht' }

const fmt = (n: number | null | undefined) => (n != null ? n.toLocaleString('vi-VN') : '—')

// ── Đọc số tiền bằng chữ (tiếng Việt) ──────────────────────────────────────
function readVietnameseNumber(num: number): string {
  if (!num || num <= 0) return 'Không'
  const ds = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
  const readTriple = (n: number, full: boolean): string => {
    const tr = Math.floor(n / 100)
    const ch = Math.floor((n % 100) / 10)
    const dv = n % 10
    let s = ''
    if (full || tr > 0) s += ds[tr] + ' trăm'
    if (ch === 0) {
      if (dv > 0) s += (s ? ' lẻ ' : '') + ds[dv]
    } else {
      s += (s ? ' ' : '') + (ch === 1 ? 'mười' : ds[ch] + ' mươi')
      if (dv === 1 && ch > 1) s += ' mốt'
      else if (dv === 5 && ch > 0) s += ' lăm'
      else if (dv > 0) s += ' ' + ds[dv]
    }
    return s.trim()
  }
  const units = ['', ' nghìn', ' triệu', ' tỷ']
  const groups: number[] = []
  let n = Math.round(num)
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000) }
  let out = ''
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0 && i !== 0) {
      if (groups.slice(0, i).some(g => g > 0) && out) out += ''
      continue
    }
    const full = i < groups.length - 1
    out += readTriple(groups[i], full) + units[i]
  }
  out = out.trim().replace(/\s+/g, ' ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}

export default function PaymentRequestPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [req, setReq] = useState<PaymentRequest | null>(null)
  const [lines, setLines] = useState<PaymentRequestLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    paymentRequestService.getById(id).then(res => {
      if (res) { setReq(res.request); setLines(res.lines) }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" /></div>
  }
  if (!req) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-400">
        <p>Không tìm thấy đề nghị</p>
        <button onClick={() => navigate('/rubber/payment-requests')} className="mt-4 text-blue-600 text-sm">Quay lại</button>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-emerald-800 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/rubber/payment-requests/${id}`)} className="p-2 hover:bg-emerald-700 rounded"><ArrowLeft size={18} /></button>
        <div className="flex-1 text-sm font-medium">{req.code} · Đề nghị thanh toán</div>
        <button onClick={() => window.print()} className="bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded font-medium text-sm flex items-center gap-2"><Printer size={16} /> In phiếu</button>
      </div>

      {/* Preview */}
      <div className="no-print bg-gray-200 min-h-[calc(100vh-56px)] py-6 px-4 flex flex-col items-center">
        <div className="bg-white shadow-md" style={{ width: '210mm', minHeight: '297mm', padding: '14mm' }}>
          <Sheet req={req} lines={lines} />
        </div>
      </div>

      {/* Print-only */}
      <div className="print-only"><Sheet req={req} lines={lines} /></div>

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

function Sheet({ req, lines }: { req: PaymentRequest; lines: PaymentRequestLine[] }) {
  const date = new Date(req.request_date)
  const ccy = CCY_SUFFIX[req.currency] || 'đồng'
  const totalAmount = lines.reduce((s, l) => s + (l.amount || 0), 0)
  const totalWeight = lines.reduce((s, l) => s + (l.weight || 0), 0)

  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 12.5, color: '#111' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #1B4D3E', paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1B4D3E' }}>CAO SU HUY ANH PHONG ĐIỀN</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế · MST: 3301549896</div>
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 2 }}>ĐỀ NGHỊ THANH TOÁN</div>
        {req.title && <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{req.title}</div>}
        <div style={{
          display: 'inline-flex', gap: 18, marginTop: 8, padding: '6px 16px',
          background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12.5,
        }}>
          <span>Số phiếu: <strong style={{ color: '#92400E' }}>{req.code}</strong></span>
          <span style={{ color: '#D1D5DB' }}>│</span>
          <span>Ngày: <strong>{date.toLocaleDateString('vi-VN')}</strong></span>
          {req.facility && <><span style={{ color: '#D1D5DB' }}>│</span><span>Cơ sở: <strong>{req.facility.name}</strong></span></>}
        </div>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#1B4D3E', color: '#fff' }}>
            <th style={{ ...th, width: 30 }}>STT</th>
            <th style={{ ...th, textAlign: 'left' }}>Người nhận tiền</th>
            <th style={{ ...th, width: 70 }}>Biển số</th>
            <th style={{ ...th, width: 60 }}>Loại mủ</th>
            <th style={{ ...th, width: 64 }}>KL (kg)</th>
            <th style={{ ...th, width: 72 }}>Đơn giá</th>
            <th style={{ ...th, width: 90 }}>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{l.payee_name || '—'}</div>
                {l.payee_note && <div style={{ fontSize: 10.5, color: '#6B7280' }}>{l.payee_note}</div>}
                {l.deal_number && <div style={{ fontSize: 10, color: '#15803d' }}>Deal #{l.deal_number}</div>}
              </td>
              <td style={{ ...td, textAlign: 'center' }}>{l.vehicle_plate || '—'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{l.rubber_type ? (RUBBER_LABELS[l.rubber_type] || l.rubber_type) : '—'}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.weight)}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.unit_price)}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(l.amount)}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr><td style={{ ...td, textAlign: 'center', color: '#9CA3AF' }} colSpan={7}>(Chưa có dòng nào)</td></tr>
          )}
          {/* Total */}
          <tr style={{ background: '#FFFBEB', fontWeight: 700 }}>
            <td style={{ ...td, textAlign: 'right' }} colSpan={4}>TỔNG CỘNG</td>
            <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(totalWeight)}</td>
            <td style={td}></td>
            <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#92400E', fontSize: 13 }}>{fmt(totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      {/* Số tiền bằng chữ */}
      <div style={{ marginTop: 10, fontSize: 12.5 }}>
        <span style={{ color: '#6B7280' }}>Số tiền bằng chữ: </span>
        <strong style={{ fontStyle: 'italic' }}>{readVietnameseNumber(totalAmount)} {ccy}.</strong>
      </div>

      {/* Signatures */}
      <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', gap: 16, textAlign: 'center', fontSize: 12.5 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 52 }}>Người lập phiếu</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 52 }}>Kế toán</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 52 }}>Giám đốc</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 6, borderTop: '1px solid #E5E7EB', textAlign: 'center', fontSize: 10, color: '#9CA3AF' }}>
        In từ hệ thống ERP — Cao su Huy Anh Phong Điền · {new Date().toLocaleString('vi-VN')}
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '7px 6px', border: '1px solid #1B4D3E', fontWeight: 700, textAlign: 'center', fontSize: 11.5 }
const td: React.CSSProperties = { padding: '6px 6px', border: '1px solid #D1D5DB', verticalAlign: 'top' }
