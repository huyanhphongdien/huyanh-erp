// ============================================================================
// PHIẾU CÂN MỦ LẺ — khổ nhiệt 80mm (và A5 dự phòng)
// File: apps/retail-scale/src/components/RetailTicketSheet.tsx
//
// NGUYÊN TẮC IN NHIỆT (rút từ những chỗ phiếu cân xe đang bị lỗi):
//   1. Khai kích thước bằng mm, KHÔNG dùng px@96dpi. Phiếu cân xe khai nội dung 290px
//      (=76,7mm) trong khi @page chỉ 72mm ⇒ Chrome tự thu nhỏ hoặc cắt mép phải.
//   2. CSS KHÔNG có chiều cao "auto" cho @page (`size: 72mm auto` là cú pháp SAI, Chrome
//      vứt cả dòng). Chiều cao thật được ĐO rồi bơm vào @page ngay trước khi in — xem
//      doPrint() trong PrintPage.tsx. Phiếu cân xe ép cứng 120mm nên phiếu dài bị cắt.
//   3. Máy in nhiệt chỉ có ĐỐT / KHÔNG ĐỐT: mọi chữ đều #000, không nền màu, không chữ
//      trắng trên nền đậm, không xám nhạt (#999/#ccc in ra mờ, giấy nhiệt lại còn phai).
//   4. Không khai font không có sẵn ('Be Vietnam Pro' không hề được nạp ở đâu) — dùng
//      font hệ thống để bản in giống hệt bản xem trước.
//   5. Chừa khối trắng ~12mm cuối phiếu: dao cắt của máy nhiệt cắt cách đầu in 10-15mm.
//   6. QR sinh OFFLINE bằng antd (không gọi api.qrserver.com như phiếu cân xe — điểm cân
//      mất mạng là ô QR trắng trơn).
// ============================================================================

import { QRCode } from 'antd'
import {
  fmtKg, fmtVnd, readVietnameseNumber, rubberLabel,
} from '@/lib/retail'
import type { RetailTicket, RetailTicketLot } from '@/services/retailTicketService'

export type PaperSize = '80mm' | 'a5'

const COMPANY: Record<string, { name: string; addr: string }> = {
  PD: { name: 'CTY TNHH MTV CAO SU HUY ANH', addr: 'Phong Điền, TP Huế' },
  TL: { name: 'CTY TNHH MTV CAO SU HUY ANH', addr: 'Tân Lâm, Quảng Trị' },
  LAO: { name: 'CAO SU HUY ANH LÀO', addr: 'Savannakhet, Lào' },
}

interface Props {
  ticket: RetailTicket
  lots: RetailTicketLot[]
  facilityCode: string
  facilityName?: string
  paper: PaperSize
  operatorName?: string | null
}

export default function RetailTicketSheet({
  ticket, lots, facilityCode, facilityName, paper, operatorName,
}: Props) {
  const thermal = paper === '80mm'
  const co = COMPANY[facilityCode] || COMPANY.PD
  const created = ticket.completed_at || ticket.created_at
  const when = new Date(created).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const net = Number(ticket.net_weight) || 0
  const gross = Number(ticket.gross_weight) || 0
  const tare = Math.round((gross - net) * 100) / 100
  const price = Number(ticket.unit_price) || 0
  const drc = ticket.qc_actual_drc != null ? Number(ticket.qc_actual_drc) : null
  const isDry = ticket.price_unit === 'dry'
  const billable = isDry && drc ? Math.round((net * drc) / 100 * 100) / 100 : net
  const amount = Number(ticket.estimated_value) || 0

  // Cỡ chữ: 203dpi → dưới 11px là khó đọc sau vài ngày giấy nhiệt phai.
  const base = thermal ? 12 : 14
  const mono: React.CSSProperties = {
    fontFamily: "Consolas, 'Courier New', monospace",
    fontVariantNumeric: 'tabular-nums',
  }
  const sheet: React.CSSProperties = thermal
    ? { width: '72mm', padding: '3mm 2mm 0', boxSizing: 'border-box', color: '#000', fontSize: base,
        fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", lineHeight: 1.35 }
    : { width: '128mm', padding: '6mm', boxSizing: 'border-box', color: '#000', fontSize: base,
        fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", lineHeight: 1.45 }

  const hr = <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />

  const Row = ({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <td style={{ padding: '0.4mm 0', verticalAlign: 'top' }}>{label}</td>
          <td style={{ padding: '0.4mm 0', textAlign: 'right', fontWeight: strong ? 700 : 400, ...mono }}>
            {value}
          </td>
        </tr>
      </tbody>
    </table>
  )

  return (
    <div className="rs-sheet" style={sheet}>
      {/* Đầu phiếu */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: base + 1 }}>{co.name}</div>
        <div style={{ fontSize: base - 1 }}>{co.addr}</div>
        {facilityName && <div style={{ fontSize: base - 1 }}>Điểm cân: {facilityName}</div>}
      </div>
      {hr}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: base + 4, letterSpacing: 0.5 }}>PHIẾU CÂN MỦ LẺ</div>
        <div style={{ fontWeight: 700, fontSize: base + 2, ...mono }}>{ticket.code}</div>
        <div style={{ fontSize: base - 1 }}>{when}</div>
      </div>
      {hr}

      {/* Khách */}
      <Row label="Khách" value={ticket.supplier_name || 'Khách vãng lai'} strong />
      {ticket.driver_phone && <Row label="SĐT" value={ticket.driver_phone} />}
      <Row label="Phương tiện" value={ticket.vehicle_plate || '—'} />
      <Row label="Loại mủ" value={rubberLabel(ticket.rubber_type)} strong />
      {hr}

      {/* Bảng bao */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: base - 1 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left', padding: '0.6mm 0' }}>STT</th>
            <th style={{ textAlign: 'right', padding: '0.6mm 0' }}>Cân</th>
            <th style={{ textAlign: 'right', padding: '0.6mm 0' }}>Bì</th>
            <th style={{ textAlign: 'right', padding: '0.6mm 0' }}>Thực</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((l, i) => (
            <tr key={l.id}>
              <td style={{ padding: '0.4mm 0' }}>{i + 1}</td>
              <td style={{ textAlign: 'right', ...mono }}>{fmtKg(l.gross_kg ?? l.net_kg)}</td>
              <td style={{ textAlign: 'right', ...mono }}>{fmtKg(l.tare_kg)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, ...mono }}>{fmtKg(l.net_kg)}</td>
            </tr>
          ))}
          {lots.length === 0 && (
            <tr><td colSpan={4} style={{ padding: '1mm 0' }}>(không có chi tiết bao)</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1px solid #000' }}>
            <td style={{ padding: '0.8mm 0', fontWeight: 700 }}>{lots.length} bao</td>
            <td style={{ textAlign: 'right', ...mono }}>{fmtKg(gross)}</td>
            <td style={{ textAlign: 'right', ...mono }}>{fmtKg(tare)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, fontSize: base + 2, ...mono }}>{fmtKg(net)}</td>
          </tr>
        </tfoot>
      </table>
      {hr}

      {/* Tiền */}
      {isDry && drc != null && (
        <>
          <Row label="DRC" value={`${drc}%`} />
          <Row label="KL khô" value={`${fmtKg(billable)} kg`} strong />
        </>
      )}
      <Row label={`Đơn giá (${isDry ? 'kg khô' : 'kg tươi'})`} value={fmtVnd(price)} />
      <div className="rs-keep" style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', margin: '1.5mm 0', padding: '1.5mm 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700, fontSize: base + 1 }}>THÀNH TIỀN</td>
              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: base + 8, ...mono }}>
                {amount.toLocaleString('vi-VN')}
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: base - 1, fontStyle: 'italic' }}>
          {readVietnameseNumber(amount)}
        </div>
      </div>
      <div style={{ fontSize: base - 1 }}>
        Hình thức: chi qua Đề nghị thanh toán của phòng kế toán.
      </div>
      {ticket.notes && (
        <div style={{ fontSize: base - 1, marginTop: '1mm' }}>Ghi chú: {ticket.notes}</div>
      )}
      {hr}

      {/* Chữ ký — khổ 72mm hẹp nên xếp DỌC, không dùng 2-3 cột như phiếu A4 */}
      <div className="rs-keep" style={{ marginTop: '1mm' }}>
        <div style={{ fontSize: base - 1 }}>Người bán (ký hoặc điểm chỉ):</div>
        <div style={{ height: '16mm', borderBottom: '1px solid #000' }} />
        <div style={{ fontSize: base - 1, marginTop: '2mm' }}>
          Nhân viên cân: {operatorName || ''}
        </div>
        <div style={{ height: '10mm', borderBottom: '1px solid #000' }} />
      </div>

      {/* QR tra cứu — sinh offline, không phụ thuộc mạng */}
      <div style={{ textAlign: 'center', marginTop: '2mm' }}>
        <QRCode
          value={ticket.code}
          type="svg"
          size={thermal ? 108 : 132}
          bordered={false}
          errorLevel="M"
          /* Prop màu NÉT của antd QRCode là `color` (antd tự map sang fgColor của
             @rc-component/qrcode — xem antd/es/qr-code/index.js). Truyền `fgColor` là sai:
             nó rơi vào ...rest rồi bị spread lên thẻ div bọc ngoài, còn QR vẫn vẽ bằng
             token.colorText mặc định (xám rgba(0,0,0,.88), không phải đen tuyền).
             Nền phải là TRẮNG ĐẶC — mặc định của antd là 'transparent'. */
          color="#000000"
          bgColor="#FFFFFF"
          /* marginSize mặc định là 0 = KHÔNG có vùng lặng. Chuẩn QR đòi 4 module; để 2 cho
             vừa khổ 72mm mà máy quét vẫn bắt được. */
          marginSize={2}
        />
        <div style={{ fontSize: base - 2 }}>Quét để tra mã phiếu</div>
      </div>

      {/* Khoảng trắng chừa dao cắt — KHÔNG xoá, nếu không dòng cuối bị cắt mất */}
      <div style={{ height: thermal ? '12mm' : '4mm' }} />
    </div>
  )
}
