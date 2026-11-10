// ============================================================================
// FleetPaymentRequestPrintPage — In Đề nghị thanh toán chi phí xe (A4), CÙNG MẪU với đề nghị
// thanh toán mủ (PaymentRequestPrintPage): header công ty, số phiếu, kính gửi, người đề nghị,
// lý do, hình thức nhận tiền, bảng STT/Nội dung/ĐVT/SL/Đơn giá/Thành tiền/Ghi chú, số tiền
// bằng chữ, 3 chữ ký. Dòng tạm ứng in số ÂM (khấu trừ); tổng = số thực chi cho tài xế.
// File: src/pages/logistics/costs/FleetPaymentRequestPrintPage.tsx
// ============================================================================

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import logoImg from '../../../assets/logo.png'
import { useAuthStore } from '../../../stores/authStore'
import { readVietnameseNumber } from '../../../utils/readVietnameseNumber'
import {
  fleetPaymentRequestService, FLEET_PR_METHOD_LABELS,
  type FleetPaymentRequest, type FleetPaymentRequestLine,
} from '../../../services/logistics/fleetPaymentRequestService'

const fmt = (n: number | null | undefined) => (n != null ? Math.round(n).toLocaleString('vi-VN') : '—')
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '')

export default function FleetPaymentRequestPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [req, setReq] = useState<FleetPaymentRequest | null>(null)
  const [lines, setLines] = useState<FleetPaymentRequestLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fleetPaymentRequestService.getById(id).then((res) => { if (res) { setReq(res.request); setLines(res.lines) } setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" /></div>
  if (!req) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-400">
        <p>Không tìm thấy đề nghị</p>
        <button onClick={() => navigate('/logistics/costs')} className="mt-4 text-blue-600 text-sm">Quay lại</button>
      </div>
    )
  }
  const preparedBy = req.created_by_name || user?.full_name || null

  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-emerald-800 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/logistics/costs/payment-requests/${id}`)} className="p-2 hover:bg-emerald-700 rounded"><ArrowLeft size={18} /></button>
        <div className="flex-1 text-sm font-medium">{req.code} · Đề nghị thanh toán chi phí xe</div>
        <button onClick={() => window.print()} className="bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded font-medium text-sm flex items-center gap-2"><Printer size={16} /> In phiếu</button>
      </div>

      <div className="no-print bg-gray-200 min-h-[calc(100vh-56px)] py-6 px-4 flex flex-col items-center">
        <div className="bg-white shadow-md" style={{ width: '210mm', minHeight: '297mm', padding: '14mm' }}>
          <Sheet req={req} lines={lines} preparedBy={preparedBy} msnv={user?.employee_code} />
        </div>
      </div>
      <div className="print-only"><Sheet req={req} lines={lines} preparedBy={preparedBy} msnv={user?.employee_code} /></div>

      <style>{`
        .print-only { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .no-print { display: none !important; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only { display: block !important; position: absolute !important; left: 0; top: 0; width: 100%; padding: 12mm !important; box-sizing: border-box; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}

function Sheet({ req, lines, preparedBy, msnv }: { req: FleetPaymentRequest; lines: FleetPaymentRequestLine[]; preparedBy?: string | null; msnv?: string | null }) {
  const net = req.net_amount
  const [y, m] = (req.period_ym || '').split('-')
  const reason = (req.reason && req.reason.trim()) || `Thanh toán chi phí đi đường các chuyến xe${m ? ` tháng ${m}/${y}` : ''}${req.payee_name ? ` của tài xế ${req.payee_name}` : ''}`
  const box = (on: boolean) => (on ? '☑' : '☐')

  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 12.5, color: '#111' }}>
      <div style={{ borderBottom: '2px solid #1B4D3E', paddingBottom: 8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src={logoImg} alt="Huy Anh" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1B4D3E' }}>CAO SU HUY ANH PHONG ĐIỀN</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế · MST: 3301549896</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 2 }}>ĐỀ NGHỊ THANH TOÁN</div>
        <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{req.title || 'Chi phí đội xe'}</div>
        <div style={{ display: 'inline-flex', gap: 18, marginTop: 8, padding: '6px 16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12.5 }}>
          <span>Số phiếu: <strong style={{ color: '#92400E' }}>{req.code}</strong></span>
          <span style={{ color: '#D1D5DB' }}>│</span>
          <span>Ngày: <strong>{fmtDate(req.request_date)}</strong></span>
          {req.period_ym && <><span style={{ color: '#D1D5DB' }}>│</span><span>Kỳ: <strong>{m}/{y}</strong></span></>}
        </div>
      </div>

      <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.7 }}>
        <div>Kính gửi: <strong>Ban Giám đốc, Kế toán trưởng</strong></div>
        <div>Người đề nghị: <strong>{preparedBy || '..............'}</strong>&nbsp;&nbsp;&nbsp;Bộ phận: HCTH&nbsp;&nbsp;&nbsp;MSNV: {msnv || '............'}</div>
        <div>Lý do thanh toán: {reason}</div>
        <div>Người nhận tiền: <strong>{req.payee_name || req.driver?.full_name || '..............'}</strong>{req.driver?.phone ? ` · ĐT ${req.driver.phone}` : ''}</div>
        <div>Hình thức nhận tiền:&nbsp;&nbsp;{box(req.payment_method === 'transfer_company')} Chuyển khoản Cty&nbsp;&nbsp;&nbsp;{box(req.payment_method === 'transfer_fund')} Chuyển khoản quỹ&nbsp;&nbsp;&nbsp;{box(req.payment_method === 'cash')} Tiền mặt</div>
        {req.payee_account && <div>Tài khoản nhận: {req.payee_account}</div>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#1B4D3E', color: '#fff' }}>
            <th style={{ ...th, width: 28 }}>STT</th>
            <th style={{ ...th, textAlign: 'left' }}>Nội dung</th>
            <th style={{ ...th, width: 42 }}>ĐVT</th>
            <th style={{ ...th, width: 44 }}>SL</th>
            <th style={{ ...th, width: 84 }}>Đơn giá</th>
            <th style={{ ...th, width: 92 }}>Thành tiền (VND)</th>
            <th style={{ ...th, textAlign: 'left', width: 150 }}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} style={l.line_type === 'advance' ? { background: '#FFF7ED' } : undefined}>
              <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
              <td style={td}>{l.description}</td>
              <td style={{ ...td, textAlign: 'center' }}>{l.unit || ''}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.qty)}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.unit_price)}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: l.amount < 0 ? '#B91C1C' : undefined }}>{l.amount < 0 ? '−' : ''}{fmt(Math.abs(l.amount))}</td>
              <td style={td}>{l.note || '—'}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: '#9CA3AF' }} colSpan={7}>(Chưa có dòng nào)</td></tr>}
          {req.total_advance > 0 && (
            <tr style={{ background: '#F9FAFB' }}>
              <td style={{ ...td, textAlign: 'right' }} colSpan={5}>Cộng chi phí được tính</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(req.total_expense)}</td>
              <td style={td}>trừ tạm ứng {fmt(req.total_advance)}</td>
            </tr>
          )}
          <tr style={{ background: '#FFFBEB', fontWeight: 700 }}>
            <td style={{ ...td, textAlign: 'right' }} colSpan={5}>{net < 0 ? 'TÀI XẾ NỘP LẠI' : 'TỔNG CỘNG THỰC CHI'}</td>
            <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#92400E', fontSize: 13 }}>{fmt(Math.abs(net))}</td>
            <td style={td}></td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 10, fontSize: 12.5 }}>
        <span style={{ color: '#6B7280' }}>Số tiền bằng chữ: </span>
        <strong style={{ fontStyle: 'italic' }}>{readVietnameseNumber(net)} đồng{net < 0 ? ' (tài xế nộp lại quỹ)' : ''}.</strong>
      </div>

      <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', gap: 12, textAlign: 'center', fontSize: 12.5 }}>
        {['Người đề nghị', 'Kế toán trưởng', 'Giám đốc'].map((t) => (
          <div key={t} style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 52 }}>{t}</div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, paddingTop: 6, borderTop: '1px solid #E5E7EB', textAlign: 'center', fontSize: 10, color: '#9CA3AF' }}>
        In từ hệ thống ERP — Cao su Huy Anh Phong Điền · {new Date().toLocaleString('vi-VN')}
        {req.status === 'paid' && req.paid_at ? ` · Đã chi ${fmtDate(req.paid_at)}` : ''}
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '7px 6px', border: '1px solid #1B4D3E', fontWeight: 700, textAlign: 'center', fontSize: 11.5 }
const td: React.CSSProperties = { padding: '6px 6px', border: '1px solid #D1D5DB', verticalAlign: 'top' }
