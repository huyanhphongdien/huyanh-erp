// ============================================================================
// FILE: src/pages/wms/rubber-intake/PaymentRequestPrintPage.tsx
// MODULE: WMS / Nhập kho mủ — In Đề nghị thanh toán (ĐỢT 1)
// 1 trang A4: header công ty + bảng nhiều dòng + số tiền bằng chữ + 3 chữ ký
// (Người đề nghị · Kế toán trưởng · Giám đốc) — khớp file Excel.
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import logoImg from '../../../assets/logo.png'
import { useAuthStore } from '../../../stores/authStore'
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
// Khối lượng (kg): LUÔN 2 số lẻ, không làm tròn bớt — tránh lệch số khi ra thanh toán.
const fmtKg = (n: number | null | undefined) =>
  n != null ? n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

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
    if (groups[i] === 0) continue   // bỏ nhóm 0 (gồm nhóm đơn vị cuối → hết "không trăm" thừa)
    // Thêm khoảng trắng giữa các nhóm (trước đây dính chữ: "triệubảy", "nghìnkhông")
    out += (out ? ' ' : '') + readTriple(groups[i], i < groups.length - 1) + units[i]
  }
  out = out.trim().replace(/\s+/g, ' ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}

export default function PaymentRequestPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [req, setReq] = useState<PaymentRequest | null>(null)
  const [lines, setLines] = useState<PaymentRequestLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    paymentRequestService.getById(id).then(async res => {
      if (res) {
        setReq(res.request)
        setLines(await paymentRequestService.enrichLinesWithBank(res.lines))
      }
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
          <Sheet req={req} lines={lines} preparedBy={user?.full_name} msnv={user?.employee_code} />
        </div>
      </div>

      {/* Print-only */}
      <div className="print-only"><Sheet req={req} lines={lines} preparedBy={user?.full_name} msnv={user?.employee_code} /></div>

      <style>{`
        .print-only { display: none; }
        @media print {
          /* Ẩn TOÀN BỘ app shell (thanh tab workspace + header) — chỉ in tài liệu.
             no-print của riêng trang không đủ vì tab/header là DOM cha. */
          body * { visibility: hidden !important; }
          .no-print { display: none !important; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only {
            display: block !important;
            position: absolute !important; left: 0; top: 0; width: 100%;
            padding: 12mm !important; box-sizing: border-box;
          }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          /* margin:0 → trình duyệt KHÔNG in header/footer (ngày giờ, tiêu đề, URL,
             số trang). Lề tài liệu trả lại bằng padding của .print-only ở trên. */
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}

function Sheet({ req, lines, preparedBy, msnv }: { req: PaymentRequest; lines: PaymentRequestLine[]; preparedBy?: string | null; msnv?: string | null }) {
  const date = new Date(req.request_date)
  const ccy = CCY_SUFFIX[req.currency] || 'đồng'
  const totalAmount = lines.reduce((s, l) => s + (l.amount || 0), 0)
  const totalWeight = lines.reduce((s, l) => s + (l.weight || 0), 0)
  const rubberKey = req.rubber_type || lines.find(l => l.rubber_type)?.rubber_type || ''
  const rubberLbl = rubberKey ? (RUBBER_LABELS[rubberKey] || rubberKey) : 'nguyên liệu'
  const reason = (req.title && req.title.trim())
    ? req.title.trim()
    : `Đề nghị thanh toán tiền mua mủ ${rubberLbl}${req.facility ? ' tại nhà máy ' + req.facility.name : ''} mua ngày ${date.toLocaleDateString('vi-VN')}`

  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 12.5, color: '#111' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #1B4D3E', paddingBottom: 8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src={logoImg} alt="Huy Anh" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1B4D3E' }}>CAO SU HUY ANH PHONG ĐIỀN</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế · MST: 3301549896</div>
        </div>
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

      {/* Meta block */}
      <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.7 }}>
        <div>Kính gửi: <strong>Ban Giám đốc, Kế toán trưởng</strong></div>
        <div>Người đề nghị: <strong>{preparedBy || '..............'}</strong>&nbsp;&nbsp;&nbsp;Bộ phận: HCTH&nbsp;&nbsp;&nbsp;MSNV: {msnv || '............'}</div>
        <div>Lý do thanh toán: {reason}</div>
        <div>Hình thức nhận tiền:&nbsp;&nbsp;☐ Chuyển khoản Cty&nbsp;&nbsp;&nbsp;☑ Chuyển khoản quỹ&nbsp;&nbsp;&nbsp;☐ Tiền mặt</div>
        <div>Tên tài khoản: theo danh sách cột Ghi chú</div>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#1B4D3E', color: '#fff' }}>
            <th style={{ ...th, width: 28 }}>STT</th>
            <th style={{ ...th, textAlign: 'left' }}>Nội dung</th>
            <th style={{ ...th, width: 34 }}>ĐVT</th>
            <th style={{ ...th, width: 64 }}>Số lượng</th>
            <th style={{ ...th, width: 70 }}>Đơn giá</th>
            <th style={{ ...th, width: 92 }}>Thành tiền ({req.currency})</th>
            <th style={{ ...th, textAlign: 'left', width: 150 }}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const rb = l.rubber_type ? (RUBBER_LABELS[l.rubber_type] || l.rubber_type) : ''
            const noiDung = `Thanh toán tiền mua ${(rb || 'mủ').toLowerCase()}${l.note ? ' số phiếu ' + l.note : ''}`
            const ghiChu = [l.payee_name, l.payee_note].filter(Boolean).join(' — ') + (l.deal_number ? ` (Deal #${l.deal_number})` : '')
            return (
              <tr key={l.id}>
                <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
                <td style={td}>{noiDung}</td>
                <td style={{ ...td, textAlign: 'center' }}>kg</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtKg(l.weight)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.unit_price)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(l.amount)}</td>
                <td style={td}>{ghiChu || '—'}</td>
              </tr>
            )
          })}
          {lines.length === 0 && (
            <tr><td style={{ ...td, textAlign: 'center', color: '#9CA3AF' }} colSpan={7}>(Chưa có dòng nào)</td></tr>
          )}
          {/* Total */}
          <tr style={{ background: '#FFFBEB', fontWeight: 700 }}>
            <td style={{ ...td, textAlign: 'right' }} colSpan={3}>TỔNG CỘNG</td>
            <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtKg(totalWeight)}</td>
            <td style={td}></td>
            <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#92400E', fontSize: 13 }}>{fmt(totalAmount)}</td>
            <td style={td}></td>
          </tr>
        </tbody>
      </table>

      {/* Số tiền bằng chữ */}
      <div style={{ marginTop: 10, fontSize: 12.5 }}>
        <span style={{ color: '#6B7280' }}>Số tiền bằng chữ: </span>
        <strong style={{ fontStyle: 'italic' }}>{readVietnameseNumber(totalAmount)} {ccy}.</strong>
      </div>

      {/* Signatures */}
      <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', gap: 12, textAlign: 'center', fontSize: 12.5 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 52 }}>Người đề nghị</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 52 }}>Kế toán trưởng</div>
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
