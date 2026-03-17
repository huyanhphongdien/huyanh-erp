import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Spin, Typography, Space } from 'antd'
import { ArrowLeftOutlined, PrinterOutlined, LoadingOutlined } from '@ant-design/icons'
import weighbridgeService from '@erp/services/wms/weighbridgeService'
import weighbridgeImageService from '@erp/services/wms/weighbridgeImageService'
import type { WeighbridgeTicket, WeighbridgeImage } from '@erp/services/wms/wms.types'

const { Text } = Typography

// Simple QR Code generator using Google Charts API
function QRCodeImg({ data, size = 120 }: { data: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
  return <img src={url} alt="QR Code" width={size} height={size} style={{ imageRendering: 'pixelated' }} />
}

export default function PrintPage() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<WeighbridgeTicket | null>(null)
  const [images, setImages] = useState<WeighbridgeImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ticketId) return
    loadData(ticketId)
  }, [ticketId])

  async function loadData(id: string) {
    setLoading(true)
    try {
      const [t, imgs] = await Promise.all([
        weighbridgeService.getById(id),
        weighbridgeImageService.getByTicket(id),
      ])
      setTicket(t)
      setImages(imgs)
    } catch { /* ignore */ }
    setLoading(false)
  }

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Text>Không tìm thấy phiếu cân</Text>
        <br />
        <Button onClick={() => navigate('/')}>Quay lại</Button>
      </div>
    )
  }

  const ext = ticket as any
  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString() : '---'
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('vi-VN')
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const fmtDateTime = (d: string) => `${fmtDate(d)} ${fmtTime(d)}`

  // QR data
  const qrData = JSON.stringify({
    code: ticket.code,
    plate: ticket.vehicle_plate,
    gross: ticket.gross_weight,
    tare: ticket.tare_weight,
    net: ticket.net_weight,
    date: ticket.created_at,
  })

  // Group images by L1/L2
  const l1Images = images.slice(0, 3)
  const l2Images = images.slice(3, 6)

  // Calculated values
  const deduction = ext.deduction_kg || 0
  const actualNet = ticket.net_weight ? ticket.net_weight - deduction : null
  const dryWeight = actualNet && ext.expected_drc ? Math.round(actualNet * ext.expected_drc / 100 * 100) / 100 : null
  const estimatedValue = ext.estimated_value || (
    ext.unit_price && actualNet
      ? ext.price_unit === 'dry' && dryWeight
        ? Math.round(dryWeight * ext.unit_price)
        : Math.round(actualNet * ext.unit_price)
      : null
  )

  return (
    <div>
      {/* Print controls - hidden when printing */}
      <div className="no-print" style={{ padding: 12, background: '#1B4D3E', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }} />
        <Text style={{ color: '#fff', flex: 1 }}>Phiếu cân {ticket.code}</Text>
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}
          style={{ background: '#D97706', borderColor: '#D97706' }}>
          In phiếu
        </Button>
      </div>

      {/* Printable content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 32px', fontFamily: "'Be Vietnam Pro', Arial, sans-serif" }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>CÔNG TY TNHH MTV</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>CAO SU HUY ANH PHƯỚC</div>
            <div style={{ fontSize: 11, color: '#666' }}>Thôn Phước Hưng, xã Phước Sơn, Tuy Phước, Bình Định</div>
          </div>
          <QRCodeImg data={qrData} size={90} />
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', margin: '16px 0' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>PHIẾU CÂN XE</div>
          <div style={{ fontSize: 13, color: '#666' }}>Số: {ticket.code}</div>
          <div style={{ fontSize: 12, color: '#999' }}>{fmtDateTime(ticket.created_at)}</div>
        </div>

        {/* Info table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={tdLabel}>Biển số xe</td>
              <td style={tdValue}><strong>{ticket.vehicle_plate}</strong></td>
              <td style={tdLabel}>Tài xế</td>
              <td style={tdValue}>{ticket.driver_name || '—'}</td>
            </tr>
            {ext.deal_id && (
              <tr>
                <td style={tdLabel}>Deal</td>
                <td style={tdValue}>{ext.deal_number || ext.deal_id}</td>
                <td style={tdLabel}>Đại lý</td>
                <td style={tdValue}>{ext.supplier_name || ext.partner_name || '—'}</td>
              </tr>
            )}
            <tr>
              <td style={tdLabel}>Loại mủ</td>
              <td style={tdValue}>{
                ext.rubber_type === 'mu_dong' ? 'Mủ đông' :
                ext.rubber_type === 'mu_nuoc' ? 'Mủ nước' :
                ext.rubber_type === 'mu_tap' ? 'Mủ tạp' :
                ext.rubber_type === 'svr' ? 'SVR' :
                ext.rubber_type || '—'
              }</td>
              <td style={tdLabel}>Loại cân</td>
              <td style={tdValue}>{ticket.ticket_type === 'in' ? 'Xe vào (Nhập)' : 'Xe ra (Xuất)'}</td>
            </tr>
          </tbody>
        </table>

        {/* Weight table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16, border: '2px solid #333' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={thStyle}>Hạng mục</th>
              <th style={thStyle}>Trọng lượng (kg)</th>
              <th style={thStyle}>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdCenter}>Cân lần 1 (Gross)</td>
              <td style={{ ...tdCenter, fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                {fmt(ticket.gross_weight)}
              </td>
              <td style={tdCenter}>{ticket.gross_weighed_at ? fmtDateTime(ticket.gross_weighed_at) : '—'}</td>
            </tr>
            <tr>
              <td style={tdCenter}>Cân lần 2 (Tare)</td>
              <td style={{ ...tdCenter, fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                {fmt(ticket.tare_weight)}
              </td>
              <td style={tdCenter}>{ticket.tare_weighed_at ? fmtDateTime(ticket.tare_weighed_at) : '—'}</td>
            </tr>
            <tr style={{ background: '#f0fdf4' }}>
              <td style={{ ...tdCenter, fontWeight: 700 }}>NET</td>
              <td style={{ ...tdCenter, fontSize: 20, fontWeight: 700, color: '#15803D', fontFamily: "'JetBrains Mono', monospace" }}>
                {fmt(ticket.net_weight)}
              </td>
              <td style={tdCenter}></td>
            </tr>
            {deduction > 0 && (
              <tr>
                <td style={tdCenter}>Tạp chất / Giảm trừ</td>
                <td style={{ ...tdCenter, color: '#DC2626', fontFamily: "'JetBrains Mono', monospace" }}>
                  - {fmt(deduction)}
                </td>
                <td style={tdCenter}></td>
              </tr>
            )}
            {actualNet != null && deduction > 0 && (
              <tr style={{ background: '#fefce8' }}>
                <td style={{ ...tdCenter, fontWeight: 700 }}>KL Thực</td>
                <td style={{ ...tdCenter, fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmt(actualNet)}
                </td>
                <td style={tdCenter}></td>
              </tr>
            )}
          </tbody>
        </table>

        {/* DRC + Price */}
        {(ext.expected_drc || ext.unit_price) && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16, border: '1px solid #ddd' }}>
            <tbody>
              {ext.expected_drc && (
                <tr>
                  <td style={tdLabel}>DRC kỳ vọng</td>
                  <td style={tdValue}>{ext.expected_drc}%</td>
                  <td style={tdLabel}>KL Khô ước</td>
                  <td style={{ ...tdValue, fontWeight: 700, color: '#B45309' }}>{dryWeight ? `${fmt(dryWeight)} kg` : '—'}</td>
                </tr>
              )}
              {ext.unit_price && (
                <tr>
                  <td style={tdLabel}>Đơn giá</td>
                  <td style={tdValue}>{fmt(ext.unit_price)} đ/kg ({ext.price_unit === 'dry' ? 'khô' : 'ướt'})</td>
                  <td style={tdLabel}>Thành tiền</td>
                  <td style={{ ...tdValue, fontSize: 15, fontWeight: 700, color: '#1B4D3E' }}>
                    {estimatedValue ? `${fmt(estimatedValue)} đ` : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Notes */}
        {ticket.notes && (
          <div style={{ marginBottom: 16, fontSize: 12, color: '#666' }}>
            <strong>Ghi chú:</strong> {ticket.notes}
          </div>
        )}

        {/* Camera images */}
        {images.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {l1Images.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#16A34A' }}>Ảnh cân lần 1</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {l1Images.map((img) => (
                    <img key={img.id} src={img.image_url} alt={img.capture_type}
                      style={{ width: 180, height: 120, objectFit: 'cover', borderRadius: 4, border: '1px solid #ddd' }} />
                  ))}
                </div>
              </div>
            )}
            {l2Images.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#2563EB' }}>Ảnh cân lần 2</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {l2Images.map((img) => (
                    <img key={img.id} src={img.image_url} alt={img.capture_type}
                      style={{ width: 180, height: 120, objectFit: 'cover', borderRadius: 4, border: '1px solid #ddd' }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32, fontSize: 12, textAlign: 'center' }}>
          <div style={{ width: '30%' }}>
            <div style={{ fontWeight: 600, marginBottom: 48 }}>Nhân viên cân</div>
            <div style={{ borderTop: '1px dotted #999', paddingTop: 4 }}>(Ký, ghi rõ họ tên)</div>
          </div>
          <div style={{ width: '30%' }}>
            <div style={{ fontWeight: 600, marginBottom: 48 }}>Tài xế</div>
            <div style={{ borderTop: '1px dotted #999', paddingTop: 4 }}>(Ký, ghi rõ họ tên)</div>
          </div>
          <div style={{ width: '30%' }}>
            <div style={{ fontWeight: 600, marginBottom: 48 }}>Xác nhận</div>
            <div style={{ borderTop: '1px dotted #999', paddingTop: 4 }}>(Ký, ghi rõ họ tên)</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: '#aaa' }}>
          Phiếu được in từ hệ thống Trạm Cân — Huy Anh Rubber ERP • {fmtDateTime(new Date().toISOString())}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  )
}

// Table cell styles
const tdLabel: React.CSSProperties = {
  padding: '6px 10px', fontWeight: 600, color: '#666',
  borderBottom: '1px solid #eee', width: '20%', fontSize: 12,
}
const tdValue: React.CSSProperties = {
  padding: '6px 10px', borderBottom: '1px solid #eee', width: '30%',
}
const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontWeight: 600, borderBottom: '2px solid #333',
  textAlign: 'center', fontSize: 12,
}
const tdCenter: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #ddd',
}
