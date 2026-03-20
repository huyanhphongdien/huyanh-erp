import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Spin, Typography, Space, Radio, Card } from 'antd'
import { ArrowLeftOutlined, PrinterOutlined, LoadingOutlined } from '@ant-design/icons'
import weighbridgeService from '@erp/services/wms/weighbridgeService'
import weighbridgeImageService from '@erp/services/wms/weighbridgeImageService'
import { supabase } from '@erp/lib/supabase'
import type { WeighbridgeTicket, WeighbridgeImage } from '@erp/services/wms/wms.types'

const { Text } = Typography

type PaperSize = 'a4' | '80mm' | '58mm'

const PAPER_CONFIGS: Record<PaperSize, { label: string; width: number; pageSize: string; margin: string; fontSize: number }> = {
  a4: { label: 'A4 (210mm)', width: 800, pageSize: 'A4', margin: '10mm', fontSize: 13 },
  '80mm': { label: 'Nhiệt 80mm', width: 302, pageSize: '80mm 150mm', margin: '2mm', fontSize: 11 },
  '58mm': { label: 'Nhiệt 58mm', width: 218, pageSize: '58mm 150mm', margin: '1mm', fontSize: 10 },
}

function QRCodeImg({ data, size = 120 }: { data: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
  return <img src={url} alt="QR Code" width={size} height={size} style={{ imageRendering: 'pixelated' }} />
}

export default function PrintPage() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<WeighbridgeTicket | null>(null)
  const [images, setImages] = useState<WeighbridgeImage[]>([])
  const [dealInfo, setDealInfo] = useState<{ deal_number: string; partner_name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [paperSize, setPaperSize] = useState<PaperSize>(() => {
    return (localStorage.getItem('wb_paper_size') as PaperSize) || 'a4'
  })

  useEffect(() => {
    if (!ticketId) return
    loadData(ticketId)
  }, [ticketId])

  useEffect(() => {
    localStorage.setItem('wb_paper_size', paperSize)
  }, [paperSize])

  async function loadData(id: string) {
    setLoading(true)
    try {
      const [t, imgs] = await Promise.all([
        weighbridgeService.getById(id),
        weighbridgeImageService.getByTicket(id),
      ])
      setTicket(t)
      setImages(imgs)
      // Fetch deal info if linked
      const ext = t as any
      if (ext?.deal_id) {
        const { data: deal } = await supabase
          .from('b2b_deals')
          .select('deal_number, partner:b2b_partners!partner_id(name)')
          .eq('id', ext.deal_id)
          .single()
        if (deal) {
          setDealInfo({
            deal_number: (deal as any).deal_number || '',
            partner_name: (deal as any).partner?.name || '',
          })
        }
      }
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
  const cfg = PAPER_CONFIGS[paperSize]
  const isThermal = paperSize !== 'a4'
  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString() : '---'
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('vi-VN')
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const fmtDateTime = (d: string) => `${fmtDate(d)} ${fmtTime(d)}`

  const qrData = JSON.stringify({
    code: ticket.code,
    plate: ticket.vehicle_plate,
    gross: ticket.gross_weight,
    tare: ticket.tare_weight,
    net: ticket.net_weight,
    date: ticket.created_at,
  })

  const l1Images = images.slice(0, 3)
  const l2Images = images.slice(3, 6)

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

  const rubberLabel = ext.rubber_type === 'mu_dong' ? 'Mủ đông' :
    ext.rubber_type === 'mu_nuoc' ? 'Mủ nước' :
    ext.rubber_type === 'mu_tap' ? 'Mủ tạp' :
    ext.rubber_type === 'svr' ? 'SVR' : ext.rubber_type || '—'

  return (
    <div>
      {/* Controls - hidden when printing */}
      <div className="no-print" style={{ padding: 12, background: '#1B4D3E', display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }} />
        <Text style={{ color: '#fff', flex: 1 }}>Phiếu cân {ticket.code}</Text>
        <Radio.Group
          value={paperSize}
          onChange={(e) => setPaperSize(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="a4">A4</Radio.Button>
          <Radio.Button value="80mm">80mm</Radio.Button>
          <Radio.Button value="58mm">58mm</Radio.Button>
        </Radio.Group>
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}
          style={{ background: '#D97706', borderColor: '#D97706' }}>
          In phiếu
        </Button>
      </div>

      {/* Preview wrapper */}
      <div className="no-print" style={{ background: '#e5e5e5', minHeight: 'calc(100vh - 52px)', display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Card style={{ width: cfg.width + 48, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} styles={{ body: { padding: 0 } }}>
          <PrintContent />
        </Card>
      </div>

      {/* Actual print content (only visible when printing) */}
      <div className="print-only">
        <PrintContent />
      </div>

      {/* Dynamic print styles */}
      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          html, body { margin: 0; padding: 0; }
          @page {
            size: ${cfg.pageSize};
            margin: ${cfg.margin};
          }
        }
      `}</style>
    </div>
  )

  // ============================================================================
  // PRINT CONTENT — shared between preview and actual print
  // ============================================================================

  function PrintContent() {
    const fs = cfg.fontSize
    const mono = "'JetBrains Mono', monospace"
    const pad = isThermal ? 4 : 10

    return (
      <div style={{
        width: cfg.width,
        margin: '0 auto',
        padding: isThermal ? '8px 6px' : '24px 24px',
        fontFamily: "'Be Vietnam Pro', Arial, sans-serif",
        fontSize: fs,
      }}>
        {/* ===== HEADER ===== */}
        {isThermal ? (
          // Thermal: compact header
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: fs, fontWeight: 700 }}>HUY ANH PHONG ĐIỀN</div>
            <div style={{ borderBottom: '1px dashed #999', margin: '3px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <QRCodeImg data={qrData} size={48} />
              <div>
                <div style={{ fontSize: fs + 2, fontWeight: 700 }}>PHIẾU CÂN</div>
                <div style={{ fontSize: fs - 2 }}>{ticket!.code}</div>
                <div style={{ fontSize: fs - 3, color: '#999' }}>{fmtDateTime(ticket!.created_at)}</div>
              </div>
            </div>
          </div>
        ) : (
          // A4: full header
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>CAO SU HUY ANH PHONG ĐIỀN</div>
                <div style={{ fontSize: 11, color: '#666' }}>Khe Mạ, Phường Phong Điền, TP Huế, Việt Nam</div>
                <div style={{ fontSize: 11, color: '#666' }}>MST: 3301549896</div>
              </div>
              <QRCodeImg data={qrData} size={90} />
            </div>
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>PHIẾU CÂN XE</div>
              <div style={{ fontSize: 13, color: '#666' }}>Số: {ticket!.code}</div>
              <div style={{ fontSize: 12, color: '#999' }}>{fmtDateTime(ticket!.created_at)}</div>
            </div>
          </>
        )}

        {/* ===== VEHICLE INFO ===== */}
        {isThermal ? (
          <div style={{ marginBottom: 4, fontSize: fs }}>
            <div style={{ borderBottom: '1px dashed #ccc', marginBottom: 2 }} />
            <Row2 l="BS" r={<strong>{ticket!.vehicle_plate}</strong>} />
            {ticket!.driver_name && <Row2 l="TX" r={ticket!.driver_name} />}
            <Row2 l="Mủ" r={rubberLabel} />
            {(dealInfo?.partner_name || ext.supplier_name) && <Row2 l="ĐL" r={dealInfo?.partner_name || ext.supplier_name} />}
            {dealInfo?.deal_number && <Row2 l="Deal" r={dealInfo.deal_number} />}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs, marginBottom: 16 }}>
            <tbody>
              <tr>
                <td style={tdLabel}>Biển số xe</td>
                <td style={tdValue}><strong>{ticket!.vehicle_plate}</strong></td>
                <td style={tdLabel}>Tài xế</td>
                <td style={tdValue}>{ticket!.driver_name || '—'}</td>
              </tr>
              {ext.deal_id && (
                <tr>
                  <td style={tdLabel}>Deal</td>
                  <td style={tdValue}>{dealInfo?.deal_number || ext.deal_id}</td>
                  <td style={tdLabel}>Đại lý</td>
                  <td style={tdValue}>{dealInfo?.partner_name || ext.supplier_name || '—'}</td>
                </tr>
              )}
              <tr>
                <td style={tdLabel}>Loại mủ</td>
                <td style={tdValue}>{rubberLabel}</td>
                <td style={tdLabel}>Loại cân</td>
                <td style={tdValue}>{ticket!.ticket_type === 'in' ? 'Xe vào (Nhập)' : 'Xe ra (Xuất)'}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ===== WEIGHTS ===== */}
        {isThermal ? (
          <div style={{ marginBottom: 4 }}>
            <div style={{ borderBottom: '1px dashed #ccc', marginBottom: 2 }} />
            <Row2 l="Gross" r={<span style={{ fontFamily: mono, fontWeight: 700 }}>{fmt(ticket!.gross_weight)} kg</span>} />
            <Row2 l="Tare" r={<span style={{ fontFamily: mono, fontWeight: 700 }}>{fmt(ticket!.tare_weight)} kg</span>} />
            <div style={{ borderBottom: '1px solid #333', margin: '2px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: fs + 3 }}>
              <span>NET</span>
              <span style={{ fontFamily: mono }}>{fmt(ticket!.net_weight)} kg</span>
            </div>
            {deduction > 0 && (
              <>
                <Row2 l="Tạp chất" r={<span style={{ color: '#DC2626', fontFamily: mono }}>- {fmt(deduction)} kg</span>} />
                <div style={{ borderBottom: '1px dashed #ccc', margin: '2px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: fs + 2 }}>
                  <span>KL Thực</span>
                  <span style={{ fontFamily: mono }}>{fmt(actualNet)} kg</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs, marginBottom: 16, border: '2px solid #333' }}>
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
                <td style={{ ...tdCenter, fontSize: 16, fontWeight: 700, fontFamily: mono }}>{fmt(ticket!.gross_weight)}</td>
                <td style={tdCenter}>{ticket!.gross_weighed_at ? fmtDateTime(ticket!.gross_weighed_at) : '—'}</td>
              </tr>
              <tr>
                <td style={tdCenter}>Cân lần 2 (Tare)</td>
                <td style={{ ...tdCenter, fontSize: 16, fontWeight: 700, fontFamily: mono }}>{fmt(ticket!.tare_weight)}</td>
                <td style={tdCenter}>{ticket!.tare_weighed_at ? fmtDateTime(ticket!.tare_weighed_at) : '—'}</td>
              </tr>
              <tr style={{ background: '#f0fdf4' }}>
                <td style={{ ...tdCenter, fontWeight: 700 }}>NET</td>
                <td style={{ ...tdCenter, fontSize: 20, fontWeight: 700, color: '#15803D', fontFamily: mono }}>{fmt(ticket!.net_weight)}</td>
                <td style={tdCenter}></td>
              </tr>
              {deduction > 0 && (
                <tr>
                  <td style={tdCenter}>Tạp chất / Giảm trừ</td>
                  <td style={{ ...tdCenter, color: '#DC2626', fontFamily: mono }}>- {fmt(deduction)}</td>
                  <td style={tdCenter}></td>
                </tr>
              )}
              {actualNet != null && deduction > 0 && (
                <tr style={{ background: '#fefce8' }}>
                  <td style={{ ...tdCenter, fontWeight: 700 }}>KL Thực</td>
                  <td style={{ ...tdCenter, fontSize: 16, fontWeight: 700, fontFamily: mono }}>{fmt(actualNet)}</td>
                  <td style={tdCenter}></td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* ===== DRC + PRICE ===== */}
        {(ext.expected_drc || ext.unit_price) && (
          isThermal ? (
            <div style={{ marginBottom: 4 }}>
              <div style={{ borderBottom: '1px dashed #ccc', marginBottom: 2 }} />
              {ext.expected_drc && <Row2 l={`DRC ${ext.expected_drc}%`} r={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>KL Khô: {dryWeight ? `${fmt(dryWeight)} kg` : '—'}</span>} />}
              {ext.unit_price && <Row2 l={`Giá: ${fmt(ext.unit_price)}đ/${ext.price_unit === 'dry' ? 'khô' : 'ướt'}`} r="" />}
              {estimatedValue && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: fs + 2, marginTop: 4 }}>
                  <span>Thành tiền</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(estimatedValue)} đ</span>
                </div>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs, marginBottom: 16, border: '1px solid #ddd' }}>
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
          )
        )}

        {/* ===== NOTES ===== */}
        {ticket!.notes && (
          <div style={{ marginBottom: isThermal ? 2 : 16, fontSize: fs - 1, color: '#666' }}>
            <strong>GC:</strong> {ticket!.notes}
          </div>
        )}

        {/* ===== CAMERA IMAGES (A4 only) ===== */}
        {!isThermal && images.length > 0 && (
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

        {/* ===== SIGNATURES ===== */}
        {isThermal ? (
          <div style={{ marginTop: 4 }}>
            <div style={{ borderBottom: '1px dashed #ccc', marginBottom: 2 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fs - 2, textAlign: 'center' }}>
              <div style={{ width: '48%' }}>
                <div style={{ fontWeight: 600, marginBottom: 16 }}>NV Cân</div>
                <div style={{ borderTop: '1px dotted #999' }}></div>
              </div>
              <div style={{ width: '48%' }}>
                <div style={{ fontWeight: 600, marginBottom: 16 }}>Tài xế</div>
                <div style={{ borderTop: '1px dotted #999' }}></div>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 2, fontSize: fs - 3, color: '#bbb' }}>
              HA Phong Điền • {fmtTime(new Date().toISOString())}
            </div>
          </div>
        ) : (
          <>
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
            <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: '#aaa' }}>
              Phiếu được in từ hệ thống Trạm Cân — Cao Su Huy Anh Phong Điền • {fmtDateTime(new Date().toISOString())}
            </div>
          </>
        )}
      </div>
    )
  }
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function Row2({ l, r }: { l: React.ReactNode; r: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
      <span style={{ color: '#666' }}>{l}</span>
      <span>{r}</span>
    </div>
  )
}

// ============================================================================
// TABLE STYLES (A4)
// ============================================================================

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
