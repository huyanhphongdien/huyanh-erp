// ============================================================================
// SỔ CA ÉP BÀNH — BẢN IN
// File: src/pages/wms/production/ShiftBookPrintPage.tsx
// Route: /wms/production/shift-book/:id/print        — in phiếu đã ghi
//        /wms/production/shift-book/new/print?blank=1 — in tờ TRỐNG để ghi tay
//
// Bản in phải GIỐNG TỜ GIẤY, không phải giống màn hình.
//
//   Nhà máy sẽ chạy song song giấy và phần mềm một tháng. Người ghi sẽ đặt hai tờ
//   cạnh nhau để đối chiếu. Nếu bố cục lệch — thêm một cột số thứ tự, đổi thứ tự
//   cột, sắp lại tên hàng cho "gọn" — thì mỗi lần đối chiếu là một lần dò, và
//   người ta sẽ bỏ tờ khó đọc hơn. Tờ khó đọc hơn luôn là tờ của phần mềm.
//
//   Nên bố cục dưới đây chép từ chính file Excel gốc của biểu mẫu:
//     · 9 cột A–I, KHÔNG có cột số thứ tự (cột B là nửa phải của ô tên hàng)
//     · tiêu đề hai tầng: Chủng loại hàng | Nhập kho | Xuất kho | Tồn kho | Ghi chú
//       tầng dưới: Số bành · Khối lượng (kg)
//     · vùng hàng hoá, rồi dòng "CHÈN:", rồi dòng "TỔNG:"
//     · phần chân: tình trạng máy móc (6 dòng trắng) · đề xuất kiến nghị · 3 ô ký
//
// ⚠ Ô "TỔNG:" chỉ cộng cột NHẬP. Trên tờ 27/8/2026 người ta ghi 560 bành / 19.600 kg
//   = 118+10+432, đúng bằng tổng cột nhập, và để trống ô tổng của Xuất/Tồn. Tự in
//   thêm hai tổng kia là đưa ra con số không ai ký và không đối chiếu được với tờ
//   tháng trước.
//
// ⚠ SÁU DÒNG TRẮNG dưới mục "Tình trạng hoạt động máy móc…" không phải chỗ thừa:
//   trên tờ 27/8 nó bị dùng để ghi số container xuất và giờ chuyển việc. Bỏ đi là
//   lấy mất chỗ người ta đang ghi thật.
// ============================================================================

import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import logoImg from '../../../assets/logo.png'
import {
  shiftBookService, computeTotals,
  type ShiftBook, type ShiftLine, type ShiftMaterial,
} from '../../../services/wms/shiftBookService'

const bd = '1px solid #000'
const cell: React.CSSProperties = { padding: '3px 5px' }

const fmt = (n: number | null | undefined, d = 0): string =>
  n === null || n === undefined ? '' : n.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return ''
  const x = new Date(d)
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`
}

const gio = (t: string | null | undefined): string => (t ? t.slice(0, 5) : '')

export default function ShiftBookPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const blank = sp.get('blank') === '1' || !id || id === 'new'

  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ShiftBook | null>(null)
  const [lines, setLines] = useState<ShiftLine[]>([])
  const [materials, setMaterials] = useState<ShiftMaterial[]>([])

  useEffect(() => {
    let huy = false
    ;(async () => {
      try {
        // Tờ trống vẫn phải in ĐÚNG danh mục hàng đang dùng — nếu không thì tờ in ra
        // lại là một biểu mẫu thứ ba, khác cả tờ giấy lẫn màn hình.
        const ms = await shiftBookService.listMaterials()
        if (huy) return
        setMaterials(ms)
        if (!blank && id) {
          const { report: r, lines: ls } = await shiftBookService.getReport(id)
          if (huy) return
          setReport(r)
          setLines(ls)
        }
      } catch {
        /* không đọc được thì vẫn in được tờ trống */
      } finally {
        if (!huy) setLoading(false)
      }
    })()
    return () => { huy = true }
  }, [id, blank])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    )
  }

  const to = blank ? 'Tờ trống' : `${fmtDate(report?.reportDate)} · ${report?.shiftName ?? ''}`

  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-emerald-800 text-white px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(id && id !== 'new' ? `/wms/production/shift-book/${id}` : '/wms/production/shift-book')}
          className="p-2 hover:bg-emerald-700 rounded"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 text-sm font-medium">Báo cáo sản xuất nhập kho — {to}</div>
        {!blank && (
          <button
            onClick={() => navigate(`/wms/production/shift-book/${id}/print?blank=1`)}
            className="px-3 py-2 rounded text-sm hover:bg-emerald-700"
          >
            In tờ trống
          </button>
        )}
        <button
          onClick={() => window.print()}
          className="bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded font-medium text-sm flex items-center gap-2"
        >
          <Printer size={16} /> In phiếu
        </button>
      </div>

      <div className="no-print bg-gray-200 min-h-[calc(100vh-56px)] py-6 px-4 flex justify-center">
        <div className="bg-white shadow-md" style={{ width: '210mm', minHeight: '297mm', padding: '12mm' }}>
          <Sheet report={report} lines={lines} materials={materials} blank={blank} />
        </div>
      </div>
      <div className="print-only">
        <Sheet report={report} lines={lines} materials={materials} blank={blank} />
      </div>

      <style>{`
        .print-only { display: none; }
        @media print {
          /* Ẩn TOÀN BỘ app shell (tab workspace + header) — chỉ in tờ phiếu.
             no-print của riêng trang không đủ vì tab/header là DOM cha. */
          body * { visibility: hidden !important; }
          .no-print { display: none !important; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only {
            display: block !important;
            position: absolute !important; left: 0; top: 0; width: 100%;
            padding: 10mm !important; box-sizing: border-box;
          }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          /* margin:0 → trình duyệt KHÔNG in header/footer của nó (URL, ngày giờ, số
             trang). Lề tài liệu trả lại bằng padding của .print-only ở trên. */
          @page { size: A4; margin: 0; }
          /* Bảng 23 dòng + CHÈN + TỔNG có thể tràn sang tờ hai. Khi đó tờ hai phải có
             lại tên cột, và khối BA Ô KÝ không được bị cắt đôi — chữ ký thứ ba là chữ
             ký làm đổi tồn kho, không được nằm trên một tờ mồ côi. */
          thead { display: table-header-group; }
          tr, .keep { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}

// ============================================================================

function Sheet({ report, lines, materials, blank }: {
  report: ShiftBook | null
  lines: ShiftLine[]
  materials: ShiftMaterial[]
  blank: boolean
}) {
  const byId = new Map(lines.map((l) => [l.materialId, l]))
  const tong = computeTotals(lines)

  // Bề rộng cột chép theo tỉ lệ của file Excel gốc. Cột tên hàng gộp A+B.
  const W = ['26.8%', '8.1%', '11.4%', '8.1%', '11.4%', '8.1%', '11.4%', '14.7%']

  return (
    <div style={{ fontFamily: "'Times New Roman', serif", fontSize: 11.5, color: '#000' }}>
      {/* ── Đầu tờ: công ty + tên biểu mẫu + dải mã BM ─────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', border: bd }}>
        <img src={logoImg} alt="Huy Anh" style={{ height: 42, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ lineHeight: 1.35, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5 }}>CÔNG TY TNHH MỘT THÀNH VIÊN CAO SU HUY ANH PHONG ĐIỀN</div>
          <div style={{ fontSize: 10.5, color: '#222' }}>MST: 3301549896 · Khe Mạ, Phường Phong Điền, TP Huế · ĐT: 0963.504.688</div>
        </div>
      </div>

      <div style={{ display: 'flex', border: bd, borderTop: 'none', minHeight: 50 }}>
        <div style={{
          ...cell, flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 16, fontWeight: 800, letterSpacing: 0.5, borderRight: bd,
        }}>
          BÁO CÁO SẢN XUẤT NHẬP KHO HÀNG NGÀY
        </div>
        <div style={{ ...cell, width: 178, fontSize: 10, lineHeight: 1.6 }}>
          <div>BM: CL.BMQT.SX.04.06</div>
          <div>Lần ban hành: 01</div>
          <div>Hiệu lực: 20/5/2019</div>
        </div>
      </div>

      {/* ── Thông tin ca ──────────────────────────────────────────────────── */}
      <div style={{ border: bd, borderTop: 'none', padding: '4px 6px', lineHeight: 1.85 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ flex: 1 }}>Ngày <Dots v={blank ? '' : fmtDate(report?.reportDate)} w={130} /></span>
          <span style={{ flex: 1.2 }}>Ca làm việc: <Dots v={blank ? '' : (report?.shiftName ?? '')} w={150} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ flex: 1 }}>
            Từ <Dots v={blank ? '' : gio(report?.shiftFrom)} w={58} />
            {' '}đến <Dots v={blank ? '' : gio(report?.shiftTo)} w={58} />
          </span>
          {/* ⚠ Ô này là ô CHỮ, không phải số: tờ 27/8 ghi "18CN + 2CN Đ Lưới". */}
          <span style={{ flex: 1.2 }}>
            Số công nhân: <Dots v={blank ? '' : (report?.headcount != null ? String(report.headcount) : '')} w={80} />
            {' '}Khối lượng: <Dots v={blank ? '' : fmt(tong.nhapKg, 2)} w={90} />
          </span>
        </div>
      </div>

      {/* ── Bảng hàng hoá ─────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>{W.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead>
          <tr>
            <Th rowSpan={2}>Chủng loại hàng</Th>
            <Th colSpan={2}>Nhập kho</Th>
            <Th colSpan={2}>Xuất kho</Th>
            <Th colSpan={2}>Tồn kho</Th>
            <Th rowSpan={2}>Ghi chú</Th>
          </tr>
          <tr>
            <Th>Số bành</Th><Th>Khối lượng (kg)</Th>
            <Th>Số bành</Th><Th>Khối lượng (kg)</Th>
            <Th>Số bành</Th><Th>Khối lượng (kg)</Th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const l = byId.get(m.id)
            const laChen = m.code === 'CHEN'
            return (
              <tr key={m.id}>
                {/* Dòng CHÈN trên giấy có dấu hai chấm và không phải một mã hàng —
                    xem mục CÒN NỢ trong wms_m3_p3. Giữ đúng chỗ tờ giấy dành cho nó. */}
                <Td align="left" bold={laChen}>{laChen ? 'CHÈN:' : m.name}</Td>
                <Td>{blank || !l ? '' : fmt(l.nhapBanh)}</Td>
                <Td>{blank || !l ? '' : fmt(l.nhapKg, 2)}</Td>
                <Td>{blank || !l ? '' : fmt(l.xuatBanh)}</Td>
                <Td>{blank || !l ? '' : fmt(l.xuatKg, 2)}</Td>
                <Td />
                <Td />
                <Td align="left">{blank || !l ? '' : (l.note ?? '')}</Td>
              </tr>
            )
          })}
          <tr>
            <Td align="left" bold>TỔNG:</Td>
            {/* ⚠ Chỉ cộng cột NHẬP — đúng như tờ giấy. Xem chú thích đầu file. */}
            <Td bold>{blank ? '' : fmt(tong.nhapBanh)}</Td>
            <Td bold>{blank ? '' : fmt(tong.nhapKg, 2)}</Td>
            <Td /><Td /><Td /><Td /><Td />
          </tr>
        </tbody>
      </table>

      {/* ── Phần chân ─────────────────────────────────────────────────────── */}
      <div style={{ border: bd, borderTop: 'none', padding: '4px 6px' }}>
        <div style={{ fontWeight: 600 }}>
          Tình trạng hoạt động máy móc, thiết bị, điện, nước trong ca (ghi chép cụ thể vấn đề):
        </div>
        {/* Sáu dòng trắng — trên tờ 27/8 người ta ghi số container xuất và giờ chuyển
            việc vào đây. Nếu phiếu có ghi sự cố thì in ra dòng đầu, còn lại để trống. */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ borderBottom: '1px dotted #555', height: 17, lineHeight: '17px', fontSize: 11 }}>
            {i === 0 && !blank ? (report?.incidents ?? '') : ''}
          </div>
        ))}
        <div style={{ fontWeight: 600, marginTop: 4 }}>Đề xuất, kiến nghị:</div>
        {[0, 1].map((i) => (
          <div key={i} style={{ borderBottom: '1px dotted #555', height: 17, lineHeight: '17px', fontSize: 11 }}>
            {i === 0 && !blank ? (report?.handoverNotes ?? '') : ''}
          </div>
        ))}
      </div>

      {/* ── Ba ô ký, đúng nhãn in trên giấy ───────────────────────────────── */}
      <div className="keep" style={{ display: 'flex', border: bd, borderTop: 'none' }}>
        <OKy tren="BÊN GIAO" duoi="Đại diện sản xuất" ten={blank ? null : report?.nguoiGiao} luc={blank ? null : report?.submittedAt} vien />
        <OKy tren="GIÁM SÁT CHẤT LƯỢNG" duoi="Đại diện QS" ten={blank ? null : report?.nguoiQc} luc={blank ? null : report?.qcConfirmedAt} vien />
        <OKy tren="BÊN NHẬN" duoi="Thủ kho" ten={blank ? null : report?.nguoiNhan} luc={blank ? null : report?.receivedAt} />
      </div>
    </div>
  )
}

// ============================================================================

function Th({ children, colSpan, rowSpan }: { children?: React.ReactNode; colSpan?: number; rowSpan?: number }) {
  return (
    <th colSpan={colSpan} rowSpan={rowSpan} style={{
      border: bd, borderTop: 'none', padding: '3px 4px', fontSize: 10.5,
      fontWeight: 700, textAlign: 'center', verticalAlign: 'middle',
    }}>
      {children}
    </th>
  )
}

function Td({ children, align = 'right', bold }: {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  bold?: boolean
}) {
  return (
    <td style={{
      border: bd, borderTop: 'none', padding: '2px 4px', height: 17,
      textAlign: align, fontWeight: bold ? 700 : 400,
      fontVariantNumeric: 'tabular-nums', fontSize: 11,
    }}>
      {children}
    </td>
  )
}

/** Ô điền trên giấy: có số thì in số, không thì để dòng chấm cho người viết tay. */
function Dots({ v, w }: { v: string; w: number }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: w, borderBottom: '1px dotted #555',
      fontWeight: v ? 700 : 400, textAlign: v ? 'left' : 'center',
    }}>
      {v || ' '}
    </span>
  )
}

function OKy({ tren, duoi, ten, luc, vien }: {
  tren: string; duoi: string; ten?: string | null; luc?: string | null; vien?: boolean
}) {
  return (
    <div style={{ ...cell, flex: 1, textAlign: 'center', borderRight: vien ? bd : undefined, minHeight: 86 }}>
      <div style={{ fontWeight: 700, fontSize: 11 }}>{tren}</div>
      <div style={{ fontSize: 10.5, fontStyle: 'italic' }}>{duoi}</div>
      {/* Vẫn chừa chỗ ký tay kể cả khi đã có tên: tháng chạy song song, tờ in ra
          vẫn phải ký được. Tên và giờ bên dưới chỉ là dấu vết phần mềm đã ghi. */}
      <div style={{ height: 40 }} />
      <div style={{ fontWeight: 600, fontSize: 11 }}>{ten ?? ''}</div>
      <div style={{ fontSize: 9.5, color: '#333' }}>
        {luc ? new Date(luc).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}
      </div>
    </div>
  )
}
