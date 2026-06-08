import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Spin, Typography, Space, Radio, Card } from 'antd'
import { ArrowLeftOutlined, PrinterOutlined, LoadingOutlined } from '@ant-design/icons'
import weighbridgeService from '@erp/services/wms/weighbridgeService'
import weighbridgeImageService from '@erp/services/wms/weighbridgeImageService'
import { supabase } from '@erp/lib/supabase'
import type { WeighbridgeTicket, WeighbridgeImage } from '@erp/services/wms/wms.types'

const { Text } = Typography

type PaperSize = 'a4' | 'a5' | '80mm' | '58mm'

// width tính theo px @96dpi để khớp khổ giấy thực (đã trừ margin in)
// A4 dọc: 210mm - 14mm margin (2×7mm) ≈ 740px
// A5 NGANG (landscape, mặc định): 210mm - 12mm margin ≈ 750px (rộng = A4 dọc)
const PAPER_CONFIGS: Record<PaperSize, { label: string; width: number; fontSize: number }> = {
  a4: { label: 'A4 (210mm)', width: 740, fontSize: 14 },
  a5: { label: 'A5 ngang (210mm)', width: 750, fontSize: 11 },
  '80mm': { label: 'Nhiệt 80mm (K200L)', width: 290, fontSize: 12 },
  '58mm': { label: 'Nhiệt 58mm', width: 210, fontSize: 10 },
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
  // Đối tác (mọi nguồn): deal→đại lý, partner_direct→đại lý, supplier→NCC
  const [partner, setPartner] = useState<{ name: string; label: string } | null>(null)
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
      // Resolve đối tác theo nguồn: deal → đại lý, partner_direct → đại lý, supplier → NCC
      const ext = t as any
      if (ext?.deal_id) {
        const { data: deal } = await supabase
          .from('b2b_deals')
          .select('deal_number, partner:b2b_partners!partner_id(name)')
          .eq('id', ext.deal_id)
          .single()
        if (deal) {
          const pname = (deal as any).partner?.name || ''
          setDealInfo({ deal_number: (deal as any).deal_number || '', partner_name: pname })
          if (pname) setPartner({ name: pname, label: 'Đại lý' })
        }
      } else if (ext?.partner_id) {
        const { data } = await supabase
          .from('b2b_partners').select('name').eq('id', ext.partner_id).maybeSingle()
        if (data?.name) setPartner({ name: (data as any).name, label: 'Đại lý' })
        else if (ext.supplier_name) setPartner({ name: ext.supplier_name, label: 'Đối tác' })
      } else if (ext?.supplier_id) {
        const { data } = await supabase
          .from('rubber_suppliers').select('name').eq('id', ext.supplier_id).maybeSingle()
        if (data?.name) setPartner({ name: (data as any).name, label: 'NCC' })
        else if (ext.supplier_name) setPartner({ name: ext.supplier_name, label: 'NCC' })
      } else if (ext?.supplier_name) {
        setPartner({ name: ext.supplier_name, label: 'Đối tác' })
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
  // Thermal printer = giấy nhiệt (80mm / 58mm). A4 + A5 đều là laser/inkjet, layout giống nhau.
  const isThermal = paperSize === '80mm' || paperSize === '58mm'
  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString() : '---'
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('vi-VN')
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const fmtDateTime = (d: string) => `${fmtDate(d)} ${fmtTime(d)}`

  // QR trỏ Cổng Đại lý B2B — vừa quảng cáo vừa là kênh đăng nhập (thay JSON thô "chết" trước đây).
  const qrData = 'https://b2b.huyanhrubber.vn'

  const l1Images = images.slice(0, 3)
  const l2Images = images.slice(3, 6)

  const deduction = ext.deduction_kg || 0
  const actualNet = ticket.net_weight ? ticket.net_weight - deduction : null
  // DRC thực đo tại cân (qc_actual_drc). Không còn fallback DRC kỳ vọng.
  // Phiếu cân không hiển thị đơn giá / giá trị ước — giải tại Đề nghị thanh toán.
  const dotReading = ext.field_dot_reading as number | null | undefined
  const actualDrc = ext.qc_actual_drc as number | null | undefined
  const dryWeight = actualNet && actualDrc
    ? Math.round(actualNet * actualDrc / 100 * 100) / 100
    : null
  const consolidationCode = ext.consolidation_code as string | null | undefined
  // Mủ nước → luôn hiện phần ĐO DRC (để trống "—" nếu chưa đo, nhắc QC nhập)
  const isMuNuoc = String(ext.rubber_type || '').split(',').map((s: string) => s.trim()).includes('mu_nuoc')

  // XUẤT/CỔNG cân 2 lần: lần 1 = tare (xe rỗng / xe vào), lần 2 = gross (xe+hàng / xe ra).
  // NHẬP thì ngược lại. → bảng cân in theo đúng thứ tự + nhãn + thời gian của từng hướng.
  const isOutTicket = ticket!.ticket_type === 'out'
  const isGateTicket = ticket!.ticket_type === 'gate'
  const isReverseTicket = isOutTicket || isGateTicket  // lần1 = tare, lần2 = gross
  const w1Label = isGateTicket ? 'Xe vào' : isOutTicket ? 'Xe rỗng' : 'Gross'
  const w2Label = isGateTicket ? 'Xe ra' : isOutTicket ? 'Xe + hàng' : 'Tare'
  const w1Weight = isReverseTicket ? ticket!.tare_weight : ticket!.gross_weight
  const w1Time = isReverseTicket ? ticket!.tare_weighed_at : ticket!.gross_weighed_at
  const w2Weight = isReverseTicket ? ticket!.gross_weight : ticket!.tare_weight
  const w2Time = isReverseTicket ? ticket!.gross_weighed_at : ticket!.tare_weighed_at

  // Hỗ trợ NHIỀU loại mủ (XUẤT lưu "mu_dong,mu_nuoc") — gộp nhãn
  const RT_LABELS: Record<string, string> = {
    mu_nuoc: 'Mủ nước', mu_tap: 'Mủ tạp', mu_dong: 'Mủ đông',
    mu_chen: 'Mủ chén', mu_to: 'Mủ tờ', svr: 'SVR',
  }
  const rubberLabel = ext.rubber_type
    ? String(ext.rubber_type).split(',').map((s: string) => RT_LABELS[s.trim()] || s.trim()).filter(Boolean).join(', ')
    : '—'

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
          <Radio.Button value="a5">A5</Radio.Button>
          <Radio.Button value="80mm">80mm</Radio.Button>
          <Radio.Button value="58mm">58mm</Radio.Button>
        </Radio.Group>
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}
          style={{ background: '#D97706', borderColor: '#D97706' }}>
          In phiếu
        </Button>
      </div>

      {/* Preview wrapper */}
      <div className="no-print" style={{ background: '#e5e5e5', minHeight: 'calc(100vh - 52px)', display: 'flex', justifyContent: 'center', padding: 24, flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Card style={{ width: cfg.width + 48, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} styles={{ body: { padding: 0 } }}>
          <PrintContent />
        </Card>

        {isThermal && (
          <Card size="small" style={{ width: cfg.width + 48, background: '#fffbe6', border: '1px solid #ffe58f' }}>
            <Text strong style={{ fontSize: 12 }}>Hướng dẫn in nhiệt (XP K200L / XP-58):</Text>
            <div style={{ fontSize: 11, marginTop: 4, color: '#666' }}>
              <div>1. Trong hộp thoại In → <strong>Lề: Không</strong> (None)</div>
              <div>2. Bỏ tick <strong>"Đầu trang và chân trang"</strong></div>
              <div>3. Nếu giấy dài quá → vào <strong>Windows Settings → Printers → XP K200L → Preferences → Paper Size</strong> → chọn <strong>72 x 100mm</strong> hoặc tạo custom size</div>
              <div>4. Máy in có dao cắt sẽ tự cắt sau nội dung</div>
            </div>
          </Card>
        )}
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
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: ${isThermal ? cfg.width + 'px' : 'auto'};
          }
          @page {
            ${isThermal
              ? `size: ${paperSize === '80mm' ? '72mm 120mm' : '48mm 100mm'}; margin: 0mm;`
              : paperSize === 'a5'
                ? 'size: 210mm 148mm; margin: 5mm;'  /* A5 NGANG (landscape) — kích thước tường minh, mọi browser/driver đều nhận (keyword "A5 landscape" hay bị bỏ qua → in dọc) */
                : 'size: A4; margin: 6mm;'
            }
          }
          ${paperSize === 'a5' ? `
            .print-only td, .print-only th { padding: 3px 6px !important; }
          ` : ''}
          ${paperSize === 'a4' ? `
            .print-only td, .print-only th { padding: 6px 9px !important; }
            .print-only img { break-inside: avoid; }
          ` : ''}
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
    return (
      <div style={{
        width: cfg.width,
        margin: '0 auto',
        padding: isThermal ? '4px 2px' : (paperSize === 'a5' ? '10px 14px' : '16px 20px'),
        // A4/A5 = serif (chứng từ chính thức, đồng bộ Liên 2 + PCG); nhiệt = sans (rõ ở size nhỏ).
        fontFamily: isThermal ? "'Be Vietnam Pro', Arial, sans-serif" : "'Times New Roman', Times, serif",
        fontSize: fs,
        // A4: căng chiều cao full trang + flex để đẩy phần ký xuống đáy (hết khoảng trống dưới)
        ...(paperSize === 'a4' ? { display: 'flex', flexDirection: 'column', minHeight: '272mm', boxSizing: 'border-box' } : {}),
      }}>
        {/* ===== HEADER ===== */}
        {isThermal ? (
          // Thermal: compact header — use table for thermal printer compatibility
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: fs, fontWeight: 700 }}>HUY ANH PHONG ĐIỀN</div>
            <div style={{ borderBottom: '1px dashed #999', margin: '3px 0' }} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ width: 52, verticalAlign: 'middle' }}>
                    <QRCodeImg data={qrData} size={48} />
                  </td>
                  <td style={{ verticalAlign: 'middle', textAlign: 'left', paddingLeft: 6 }}>
                    <div style={{ fontSize: fs + 2, fontWeight: 700 }}>PHIẾU CÂN</div>
                    <div style={{ fontSize: fs - 2 }}>{ticket!.code}</div>
                    <div style={{ fontSize: fs - 3, color: '#999' }}>{fmtDateTime(ticket!.created_at)}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          // A4 / A5: full header — font scale theo cfg.fontSize
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: paperSize === 'a5' ? 6 : 7, paddingBottom: paperSize === 'a5' ? 5 : 6, borderBottom: '2px solid #1B4D3E' }}>
              <div>
                <div style={{ fontSize: fs, fontWeight: 600, color: '#374151' }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
                <div style={{ fontSize: fs + 4, fontWeight: 800, color: '#1B4D3E', letterSpacing: 0.5 }}>CAO SU HUY ANH PHONG ĐIỀN</div>
                <div style={{ fontSize: fs - 2, color: '#4B5563', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế</div>
                <div style={{ fontSize: fs - 2, color: '#4B5563' }}>MST: 3301549896</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', margin: paperSize === 'a5' ? '6px 0 8px' : '8px 0 8px' }}>
              <div style={{ fontSize: fs + 10, fontWeight: 800, letterSpacing: 1.5, color: '#111827' }}>PHIẾU CÂN XE</div>
              <div style={{ fontSize: fs + 1, color: '#374151', fontWeight: 600, marginTop: 2 }}>Số: {ticket!.code}</div>
              <div style={{ fontSize: fs - 1, color: '#6B7280' }}>{fmtDateTime(ticket!.created_at)}</div>
            </div>
          </>
        )}

        {/* ===== VEHICLE INFO ===== */}
        {isThermal ? (
          <div style={{ marginBottom: 4, fontSize: fs }}>
            <div style={{ borderBottom: '1px dashed #ccc', marginBottom: 2 }} />
            <Row2 l="BS" r={<strong>{ticket!.vehicle_plate}</strong>} />
            {ticket!.driver_name && <Row2 l="TX" r={ticket!.driver_name} />}
            {isGateTicket
              ? <Row2 l="Hàng" r={ticket!.notes || 'Hàng nội bộ'} />
              : ticket!.ticket_type === 'out'
              ? <Row2 l="Loại" r={`Xe ra (Xuất)`} />
              : <Row2 l="Mủ" r={rubberLabel} />
            }
            {!isGateTicket && partner && <Row2 l={partner.label === 'NCC' ? 'NCC' : 'ĐL'} r={partner.name} />}
            {dealInfo?.deal_number && <Row2 l="Deal" r={dealInfo.deal_number} />}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs, marginBottom: paperSize === 'a5' ? 6 : 10, border: '1px solid #D1D5DB' }}>
            <tbody>
              <tr>
                <td style={tdLabel}>Biển số xe</td>
                <td style={{ ...tdValue, fontSize: fs + 3, fontWeight: 800, color: '#111827' }}>{ticket!.vehicle_plate}</td>
                <td style={tdLabel}>Tài xế</td>
                <td style={{ ...tdValue, fontSize: fs, fontWeight: 600 }}>{ticket!.driver_name || '—'}</td>
              </tr>
              {partner && (
                <tr>
                  <td style={tdLabel}>{partner.label}</td>
                  <td style={{ ...tdValue, fontWeight: 700, color: '#111827' }} colSpan={3}>{partner.name}</td>
                </tr>
              )}
              {ext.deal_id && (
                <tr>
                  <td style={tdLabel}>Deal</td>
                  <td style={{ ...tdValue, fontWeight: 600 }} colSpan={3}>{dealInfo?.deal_number || ext.deal_id}</td>
                </tr>
              )}
              <tr>
                <td style={tdLabel}>{isGateTicket ? 'Nội dung hàng' : 'Loại mủ'}</td>
                <td style={{ ...tdValue, fontWeight: 600 }}>{isGateTicket ? (ticket!.notes || 'Hàng nội bộ') : rubberLabel}</td>
                <td style={tdLabel}>Loại cân</td>
                <td style={{ ...tdValue, fontWeight: 600 }}>{isGateTicket ? 'Cân cổng (hàng nội bộ)' : ticket!.ticket_type === 'in' ? 'Xe vào (Nhập)' : 'Xe ra (Xuất)'}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ===== WEIGHTS ===== */}
        {isThermal ? (
          <div style={{ marginBottom: 4 }}>
            <div style={{ borderBottom: '1px dashed #ccc', marginBottom: 2 }} />
            <Row2 l={w1Label} r={<span style={{ fontFamily: mono, fontWeight: 700 }}>{fmt(w1Weight)} kg</span>} />
            <Row2 l={w2Label} r={<span style={{ fontFamily: mono, fontWeight: 700 }}>{fmt(w2Weight)} kg</span>} />
            <div style={{ borderBottom: '1px solid #333', margin: '2px 0' }} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 700, fontSize: fs + 3, padding: '2px 0' }}>NET</td>
                  <td style={{ fontWeight: 700, fontSize: fs + 3, padding: '2px 0', textAlign: 'right', fontFamily: mono }}>{fmt(ticket!.net_weight)} kg</td>
                </tr>
              </tbody>
            </table>
            {deduction > 0 && (
              <>
                <Row2 l="Tạp chất" r={<span style={{ color: '#DC2626', fontFamily: mono }}>- {fmt(deduction)} kg</span>} />
                <div style={{ borderBottom: '1px dashed #ccc', margin: '2px 0' }} />
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody><tr>
                  <td style={{ fontWeight: 700, fontSize: fs + 2, padding: '2px 0' }}>KL Thực</td>
                  <td style={{ fontWeight: 700, fontSize: fs + 2, padding: '2px 0', textAlign: 'right', fontFamily: mono }}>{fmt(actualNet)} kg</td>
                </tr></tbody></table>
              </>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs, marginBottom: paperSize === 'a5' ? 6 : 10, border: '2px solid #1B4D3E' }}>
            <thead>
              <tr style={{ background: '#1B4D3E', color: '#fff' }}>
                <th style={{ ...thStyle, color: '#fff', fontSize: fs }}>Hạng mục</th>
                <th style={{ ...thStyle, color: '#fff', fontSize: fs }}>Trọng lượng (kg)</th>
                <th style={{ ...thStyle, color: '#fff', fontSize: fs }}>Thời gian cân</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...tdCenter, fontSize: fs, fontWeight: 500 }}>Cân lần 1 ({w1Label})</td>
                <td style={{ ...tdCenter, fontSize: fs + 5, fontWeight: 700, fontFamily: mono }}>{fmt(w1Weight)}</td>
                <td style={{ ...tdCenter, fontSize: fs }}>{w1Time ? fmtDateTime(w1Time) : '—'}</td>
              </tr>
              <tr>
                <td style={{ ...tdCenter, fontSize: fs, fontWeight: 500 }}>Cân lần 2 ({w2Label})</td>
                <td style={{ ...tdCenter, fontSize: fs + 5, fontWeight: 700, fontFamily: mono }}>{fmt(w2Weight)}</td>
                <td style={{ ...tdCenter, fontSize: fs }}>{w2Time ? fmtDateTime(w2Time) : '—'}</td>
              </tr>
              <tr style={{ background: '#DCFCE7' }}>
                <td style={{ ...tdCenter, fontWeight: 800, fontSize: fs + 2 }}>NET</td>
                <td style={{ ...tdCenter, fontSize: paperSize === 'a5' ? fs + 5 : fs + 7, fontWeight: 800, color: '#15803D', fontFamily: mono, letterSpacing: 1 }}>{fmt(ticket!.net_weight)}</td>
                <td style={tdCenter}></td>
              </tr>
              {deduction > 0 && (
                <tr>
                  <td style={{ ...tdCenter, fontSize: fs, fontWeight: 500 }}>Tạp chất / Giảm trừ</td>
                  <td style={{ ...tdCenter, color: '#DC2626', fontFamily: mono, fontSize: fs + 3, fontWeight: 700 }}>- {fmt(deduction)}</td>
                  <td style={tdCenter}></td>
                </tr>
              )}
              {actualNet != null && deduction > 0 && (
                <tr style={{ background: '#FEF3C7' }}>
                  <td style={{ ...tdCenter, fontWeight: 800, fontSize: fs + 1 }}>KL Thực</td>
                  <td style={{ ...tdCenter, fontSize: fs + 7, fontWeight: 800, fontFamily: mono, color: '#92400E' }}>{fmt(actualNet)}</td>
                  <td style={tdCenter}></td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* ===== DRC measurement (ĐỐT + DRC thực + KL khô) — TL flow ===== */}
        {(isMuNuoc || dotReading != null || actualDrc != null || consolidationCode) && (
          isThermal ? (
            <div style={{ marginBottom: 4 }}>
              <div style={{ borderBottom: '1px dashed #ccc', marginBottom: 2 }} />
              {dotReading != null && <Row2 l="ĐỐT (metrolac)" r={<strong>{dotReading}</strong>} />}
              {actualDrc != null && <Row2 l="DRC thực" r={<strong>{actualDrc}%</strong>} />}
              {dryWeight != null && (
                <Row2 l="KL khô" r={<span style={{ fontFamily: mono, fontWeight: 700, color: '#15803D' }}>{dryWeight.toLocaleString()} kg</span>} />
              )}
              {consolidationCode && <Row2 l="Mã LLM" r={consolidationCode} />}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs, marginBottom: paperSize === 'a5' ? 6 : 10, border: '2px solid #15803D' }}>
              <thead>
                <tr style={{ background: '#15803D', color: '#fff' }}>
                  <th style={{ ...thStyle, color: '#fff', fontSize: fs + 1 }} colSpan={4}>ĐO DRC TẠI CÂN</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...tdLabel, fontSize: fs - 1 }}>ĐỐT (metrolac)</td>
                  <td style={{ ...tdValue, fontFamily: mono, fontWeight: 700, fontSize: fs + 3 }}>
                    {dotReading != null ? dotReading : '—'}
                  </td>
                  <td style={{ ...tdLabel, fontSize: fs - 1 }}>DRC thực (đo tại cân)</td>
                  <td style={{ ...tdValue, fontWeight: 800, color: '#15803D', fontSize: fs + 4 }}>
                    {actualDrc != null ? `${actualDrc}%` : '—'}
                  </td>
                </tr>
                <tr>
                  <td style={{ ...tdLabel, fontSize: fs - 1 }}>KL khô quy đổi</td>
                  <td style={{ ...tdValue, fontFamily: mono, fontWeight: 800, color: '#15803D', fontSize: fs + 4 }} colSpan={3}>
                    {dryWeight != null
                      ? `${dryWeight.toLocaleString()} kg`
                      : '—'}
                    {dryWeight != null && actualNet && actualDrc && (
                      <span style={{ fontSize: fs - 3, color: '#6B7280', marginLeft: 8, fontFamily: 'inherit', fontWeight: 400 }}>
                        = {actualNet.toLocaleString()} × {actualDrc}% / 100
                      </span>
                    )}
                  </td>
                </tr>
                {consolidationCode && (
                  <tr>
                    <td style={{ ...tdLabel, fontSize: fs - 1 }}>Mã LLM (gộp xe)</td>
                    <td style={{ ...tdValue, fontSize: fs + 1 }} colSpan={3}>
                      <strong>{consolidationCode}</strong>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )
        )}

        {/* ===== NOTES ===== */}
        {ticket!.notes && (
          <div style={{
            marginBottom: isThermal ? 2 : 14,
            fontSize: isThermal ? fs - 1 : fs,
            color: '#374151',
            padding: isThermal ? 0 : '8px 12px',
            background: isThermal ? 'transparent' : '#F9FAFB',
            border: isThermal ? 'none' : '1px solid #E5E7EB',
            borderLeft: isThermal ? 'none' : '4px solid #1B4D3E',
          }}>
            <strong>Ghi chú:</strong> {ticket!.notes}
          </div>
        )}

        {/* ===== CAMERA IMAGES (A4 only) ===== */}
        {!isThermal && images.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {l1Images.length > 0 && (
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, color: '#16A34A' }}>Ảnh cân lần 1</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {l1Images.map((img) => (
                    <img key={img.id} src={img.image_url} alt={img.capture_type}
                      style={{ width: 172, height: 108, objectFit: 'cover', borderRadius: 4, border: '1px solid #ddd' }} />
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
                      style={{ width: 172, height: 108, objectFit: 'cover', borderRadius: 4, border: '1px solid #ddd' }} />
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs - 2, textAlign: 'center' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, padding: '2px 0' }}>NV Cân</td>
                  <td style={{ fontWeight: 600, padding: '2px 0' }}>Tài xế/Đại lý</td>
                </tr>
                <tr style={{ height: 20 }}>
                  <td style={{ borderBottom: '1px dotted #999' }}></td>
                  <td style={{ borderBottom: '1px dotted #999' }}></td>
                </tr>
              </tbody>
            </table>
            {/* Quảng cáo B2B gọn cho phiếu nhiệt */}
            <div style={{ borderTop: '1px dashed #ccc', marginTop: 3, paddingTop: 3, textAlign: 'center' }}>
              <QRCodeImg data={qrData} size={46} />
              <div style={{ fontSize: fs - 2, fontWeight: 700, marginTop: 1 }}>Cổng Đại lý Huy Anh</div>
              <div style={{ fontSize: fs - 3, color: '#555' }}>Quét QR xem giá mủ &amp; công nợ · b2b.huyanhrubber.vn</div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 2, fontSize: fs - 3, color: '#bbb' }}>
              HA Phong Điền • {fmtTime(new Date().toISOString())}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: paperSize === 'a4' ? 'auto' : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: paperSize === 'a5' ? 12 : 24, paddingTop: paperSize === 'a4' ? 14 : 0, fontSize: fs, textAlign: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: paperSize === 'a5' ? 24 : 46, fontSize: fs + 1 }}>Nhân viên cân</div>
                <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: fs - 2, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: paperSize === 'a5' ? 24 : 46, fontSize: fs + 1 }}>Tài xế/Đại lý</div>
                <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: fs - 2, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: paperSize === 'a5' ? 24 : 46, fontSize: fs + 1 }}>Xác nhận</div>
                <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: fs - 2, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
              </div>
            </div>
            {/* ===== BANNER QUẢNG CÁO B2B — QR trỏ Cổng Đại lý ===== */}
            <div style={{ marginTop: 10, border: '1px solid #1B4D3E', borderRadius: 6, background: '#F0F9F4', padding: paperSize === 'a5' ? '6px 10px' : '8px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <QRCodeImg data={qrData} size={paperSize === 'a5' ? 58 : 66} />
              <div style={{ flex: 1, color: '#1B4D3E', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 800, fontSize: fs }}>💰 Giá mủ công khai, cập nhật mỗi ngày — minh bạch tuyệt đối.</div>
                <div style={{ fontSize: fs - 1 }}>Quét QR đăng nhập <b>Cổng Đại lý Huy Anh</b> <span style={{ color: '#4B5563' }}>(tài khoản do Huy Anh cấp)</span> — <b>b2b.huyanhrubber.vn</b></div>
                <div style={{ fontSize: fs - 2, color: '#15803D' }}>Chưa có tài khoản? Liên hệ Huy Anh để được cấp.</div>
              </div>
            </div>
            <div style={{ marginTop: 8, textAlign: 'center', fontSize: fs - 3, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: 6 }}>
              Phiếu được in từ hệ thống Trạm Cân — Cao Su Huy Anh Phong Điền • {fmtDateTime(new Date().toISOString())}
              <div style={{ fontStyle: 'italic', marginTop: 2 }}>
                Hỗ trợ kỹ thuật: Lê Duy Minh · 0901120167 · minhld@huyanhrubber.com
              </div>
            </div>
          </div>
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
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <td style={{ color: '#666', padding: '1px 0', textAlign: 'left', whiteSpace: 'nowrap' }}>{l}</td>
          <td style={{ padding: '1px 0', textAlign: 'right', fontWeight: 500 }}>{r}</td>
        </tr>
      </tbody>
    </table>
  )
}

// ============================================================================
// TABLE STYLES (A4)
// ============================================================================

const tdLabel: React.CSSProperties = {
  padding: '8px 12px', fontWeight: 600, color: '#374151',
  borderBottom: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB',
  width: '20%', background: '#F9FAFB',
}
const tdValue: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB',
  width: '30%', color: '#111827',
}
const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 700,
  textAlign: 'center', letterSpacing: 0.3,
}
const tdCenter: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #D1D5DB',
  borderRight: '1px solid #D1D5DB',
}
