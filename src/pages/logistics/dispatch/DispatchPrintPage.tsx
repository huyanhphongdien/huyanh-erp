// ============================================================================
// FILE: src/pages/logistics/dispatch/DispatchPrintPage.tsx
// MODULE: Vận tải / Lệnh điều động — In chứng từ A4
//   ?doc=order    → LỆNH ĐIỀU ĐỘNG XE
//   ?doc=handover → BIÊN BẢN GIAO CAO SU ĐỂ VẬN CHUYỂN (theo file mẫu V1)
// Kỹ thuật in: ẩn app shell (visibility:hidden) + @page margin:0 — copy từ
// PaymentRequestPrintPage để không dính header/footer trình duyệt.
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import logoImg from '../../../assets/logo.png'
import {
  dispatchService, TRIP_TYPE_LABELS,
  type DispatchOrder, type DispatchLine,
} from '../../../services/logistics/dispatchService'

const fmt = (n: number | null | undefined) => (n != null ? n.toLocaleString('vi-VN') : '')
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '')

export default function DispatchPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const doc = (sp.get('doc') === 'handover' ? 'handover' : 'order') as 'order' | 'handover'
  const [order, setOrder] = useState<DispatchOrder | null>(null)
  const [lines, setLines] = useState<DispatchLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    dispatchService.getById(id).then(res => {
      if (res) { setOrder(res.order); setLines(res.lines) }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" /></div>
  }
  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-400">
        <p>Không tìm thấy lệnh điều động</p>
        <button onClick={() => navigate('/logistics/dispatch')} className="mt-4 text-blue-600 text-sm">Quay lại</button>
      </div>
    )
  }

  const Sheet = doc === 'handover' ? HandoverSheet : OrderSheet
  const docName = doc === 'handover' ? 'Biên bản bàn giao' : 'Lệnh điều động'

  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-emerald-800 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/logistics/dispatch/${id}`)} className="p-2 hover:bg-emerald-700 rounded"><ArrowLeft size={18} /></button>
        <div className="flex-1 text-sm font-medium">{order.code} · {docName}</div>
        <button onClick={() => window.print()} className="bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded font-medium text-sm flex items-center gap-2"><Printer size={16} /> In</button>
      </div>

      <div className="no-print bg-gray-200 min-h-[calc(100vh-56px)] py-6 px-4 flex flex-col items-center">
        <div className="bg-white shadow-md" style={{ width: '210mm', minHeight: '297mm', padding: '14mm' }}>
          <Sheet order={order} lines={lines} />
        </div>
      </div>

      <div className="print-only"><Sheet order={order} lines={lines} /></div>

      <style>{`
        .print-only { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .no-print { display: none !important; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only {
            display: block !important;
            position: absolute !important; left: 0; top: 0; width: 100%;
            padding: 12mm !important; box-sizing: border-box;
          }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}

// ── Header công ty (chung 2 mẫu) ───────────────────────────────────────────
function CompanyHeader() {
  return (
    <div style={{ borderBottom: '2px solid #1B4D3E', paddingBottom: 8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
      <img src={logoImg} alt="Huy Anh" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1B4D3E' }}>CAO SU HUY ANH PHONG ĐIỀN</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế · MST: 3301549896</div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MẪU 1: LỆNH ĐIỀU ĐỘNG XE
// ════════════════════════════════════════════════════════════════════════════
function OrderSheet({ order, lines }: { order: DispatchOrder; lines: DispatchLine[] }) {
  const totalW = lines.reduce((s, l) => s + (l.weight_kg || 0), 0)
  const totalPkg = lines.reduce((s, l) => s + (l.package_count || 0), 0)
  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 12.5, color: '#111' }}>
      <CompanyHeader />

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 2 }}>LỆNH ĐIỀU ĐỘNG XE</div>
        <div style={{ display: 'inline-flex', gap: 18, marginTop: 8, padding: '6px 16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12.5 }}>
          <span>Số: <strong style={{ color: '#92400E' }}>{order.code}</strong></span>
          <span style={{ color: '#D1D5DB' }}>│</span>
          <span>Ngày: <strong>{fmtDate(order.dispatch_date)}</strong></span>
          <span style={{ color: '#D1D5DB' }}>│</span>
          <span>{TRIP_TYPE_LABELS[order.trip_type]}</span>
        </div>
      </div>

      {/* Info block */}
      <table style={{ width: '100%', fontSize: 12.5, marginBottom: 12, lineHeight: 1.9 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%' }}>Họ tên lái xe: <strong>{order.driver_name || '..............................'}</strong></td>
            <td>SĐT: <strong>{order.driver_phone || '..................'}</strong></td>
          </tr>
          <tr>
            <td>Biển số đầu kéo: <strong>{order.tractor_plate || '..................'}</strong></td>
            <td>Biển số rơ-moóc: <strong>{order.trailer_plate || '..................'}</strong></td>
          </tr>
          <tr>
            <td>Khách hàng: <strong>{order.customer_name || '..............................'}</strong></td>
            <td>Điểm giao / Cảng: <strong>{order.destination || '..............................'}</strong></td>
          </tr>
          <tr>
            <td>Căn cứ HĐ / Booking: <strong>{order.contract_ref || '..............................'}</strong></td>
            <td>Lý do điều động: {order.reason || '..............................'}</td>
          </tr>
        </tbody>
      </table>

      {/* Container table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#1B4D3E', color: '#fff' }}>
            <th style={{ ...th, width: 30 }}>STT</th>
            <th style={th}>Lô hàng</th>
            <th style={th}>Loại hàng</th>
            <th style={th}>Số container</th>
            <th style={th}>Số seal</th>
            <th style={{ ...th, width: 60 }}>Số kiện</th>
            <th style={{ ...th, width: 90 }}>Khối lượng (kg)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
              <td style={td}>{l.lot_code || ''}</td>
              <td style={td}>{l.grade || ''}</td>
              <td style={{ ...td, fontWeight: 600 }}>{l.container_no || ''}</td>
              <td style={td}>{l.seal_no || ''}</td>
              <td style={{ ...td, textAlign: 'right' }}>{l.package_count ?? ''}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.weight_kg)}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: '#9CA3AF' }} colSpan={7}>(Chưa có container)</td></tr>}
          <tr style={{ background: '#FFFBEB', fontWeight: 700 }}>
            <td style={{ ...td, textAlign: 'right' }} colSpan={5}>TỔNG CỘNG</td>
            <td style={{ ...td, textAlign: 'right' }}>{totalPkg || ''}</td>
            <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#92400E' }}>{fmt(totalW)}</td>
          </tr>
        </tbody>
      </table>

      {order.note && <div style={{ marginTop: 8, fontSize: 12 }}>Ghi chú: {order.note}</div>}

      {/* Signatures */}
      <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', gap: 12, textAlign: 'center', fontSize: 12.5 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 56 }}>Lái xe</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 56 }}>Phụ trách điều động</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 56 }}>Giám đốc</div>
          <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
        </div>
      </div>

      <PrintFooter />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MẪU 2: BIÊN BẢN GIAO CAO SU ĐỂ VẬN CHUYỂN (theo file mẫu V1)
// ════════════════════════════════════════════════════════════════════════════
function HandoverSheet({ order, lines }: { order: DispatchOrder; lines: DispatchLine[] }) {
  const totalW = lines.reduce((s, l) => s + (l.weight_kg || 0), 0)
  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 12.5, color: '#111', lineHeight: 1.6 }}>
      <CompanyHeader />

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>BIÊN BẢN GIAO CAO SU ĐỂ VẬN CHUYỂN</div>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Số: {order.code}</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        - Căn cứ hợp đồng số: <strong>{order.contract_ref || '..........................'}</strong>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 700, textDecoration: 'underline' }}>Bên thuê vận chuyển:</div>
        <div>CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN</div>
        <div>Đại diện: ...................................... &nbsp;&nbsp; Chức vụ: ......................</div>
        <div>Địa chỉ: Khe Mạ, Phường Phong Điền, TP Huế</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 700, textDecoration: 'underline' }}>Bên nhận hàng (vận chuyển):</div>
        <div>Đại diện: <strong>{order.driver_name || '............................'}</strong> &nbsp;&nbsp; GPLX: {order.driver_license_no || '..............'} &nbsp;&nbsp; Ngày sinh: {fmtDate(order.driver_dob) || '............'}</div>
        <div>Địa chỉ: {order.driver_address || '............................................'} &nbsp;&nbsp; CMND: {order.driver_id_no || '..............'} &nbsp;&nbsp; SĐT: {order.driver_phone || '..............'}</div>
        <div>Biển số đầu kéo: <strong>{order.tractor_plate || '............'}</strong> &nbsp;&nbsp; Rơ-moóc: <strong>{order.trailer_plate || '............'}</strong></div>
      </div>

      <div style={{ marginBottom: 8 }}>Bên thuê vận chuyển đã bàn giao lô hàng cao su để Bên vận chuyển đến khách hàng với nội dung như sau:</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#1B4D3E', color: '#fff' }}>
            <th style={{ ...th, width: 30 }}>Stt</th>
            <th style={th}>Lô hàng</th>
            <th style={th}>Chủng loại cao su</th>
            <th style={{ ...th, width: 56 }}>Số kiện</th>
            <th style={th}>Số cont</th>
            <th style={th}>Số Seal</th>
            <th style={{ ...th, width: 86 }}>Khối lượng</th>
            <th style={{ ...th, width: 90 }}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
              <td style={td}>{l.lot_code || ''}</td>
              <td style={td}>{l.grade || ''}</td>
              <td style={{ ...td, textAlign: 'right' }}>{l.package_count ?? ''}</td>
              <td style={{ ...td, fontWeight: 600 }}>{l.container_no || ''}</td>
              <td style={td}>{l.seal_no || ''}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.weight_kg)}</td>
              <td style={td}>{l.note || ''}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: '#9CA3AF' }} colSpan={8}>(Chưa có hàng)</td></tr>}
          <tr style={{ background: '#FFFBEB', fontWeight: 700 }}>
            <td style={{ ...td, textAlign: 'right' }} colSpan={6}>TỔNG CỘNG</td>
            <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#92400E' }}>{fmt(totalW)}</td>
            <td style={td}></td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 10, fontSize: 12.5 }}>
        <div>- Tình trạng hàng hóa: Đảm bảo chất lượng và số lượng hàng hoá.</div>
        <div>- Yêu cầu trong quá trình vận chuyển: Cao su phải được che đậy cẩn thận, tránh mưa, nắng, các hóa chất, xăng, dầu và lẫn lộn với các hàng hóa khác.</div>
        <div>- Bên giao hàng không chịu trách nhiệm về hàng hoá khi đã giao cho bên nhận.</div>
        <div>- Địa điểm giao hàng: <strong>{order.destination || '..........................'}</strong></div>
        <div>- Người nhận hàng: <strong>{order.recipient_name || '..................'}</strong> {order.recipient_phone ? `- SĐT: ${order.recipient_phone}` : ''}</div>
        <div style={{ marginTop: 6 }}>Biên bản được lập thành 02 bản, có giá trị như nhau mỗi bên giữ 01 bản.</div>
        <div>Thời gian xuất phát: ...................................................</div>
      </div>

      <div style={{ marginTop: 30, display: 'flex', justifyContent: 'space-between', gap: 12, textAlign: 'center', fontSize: 12.5 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>BÊN NHẬN VẬN CHUYỂN</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 56 }}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>BÊN THUÊ VẬN CHUYỂN</div>
          <div style={{ fontSize: 11, color: '#6B7280' }}>CÔNG TY TNHH MTV CAO SU HUY ANH PHONG ĐIỀN</div>
          <div style={{ marginTop: 50 }} />
        </div>
      </div>

      <PrintFooter />
    </div>
  )
}

function PrintFooter() {
  return (
    <div style={{ marginTop: 14, paddingTop: 6, borderTop: '1px solid #E5E7EB', textAlign: 'center', fontSize: 10, color: '#9CA3AF' }}>
      In từ hệ thống ERP — Cao su Huy Anh Phong Điền · {new Date().toLocaleString('vi-VN')}
    </div>
  )
}

const th: React.CSSProperties = { padding: '7px 6px', border: '1px solid #1B4D3E', fontWeight: 700, textAlign: 'center', fontSize: 11.5 }
const td: React.CSSProperties = { padding: '6px 6px', border: '1px solid #D1D5DB', verticalAlign: 'top' }
