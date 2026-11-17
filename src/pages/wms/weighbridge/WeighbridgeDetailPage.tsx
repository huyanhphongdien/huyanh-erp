// ============================================================================
// FILE: src/pages/wms/weighbridge/WeighbridgeDetailPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Sprint 7C — Chi tiết phiếu cân xe
// Rewrite: Tailwind -> Ant Design v6
// ============================================================================

import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Typography,
  Space,
  Tag,
  Spin,
  Descriptions,
  Timeline,
  Modal,
  Row,
  Col,
  Alert,
  Image,
  Divider,
  Result,
} from 'antd'
import {
  ArrowLeftOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CarOutlined,
  LinkOutlined,
  ExportOutlined,
  CameraOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import weighbridgeService from '../../../services/wms/weighbridgeService'
import weighbridgeImageService from '../../../services/wms/weighbridgeImageService'
import type { WeighbridgeTicket, WeighbridgeImage, WeighbridgeStatus } from '../../../services/wms/wms.types'
import { ticketTypeLabel } from '../../../services/wms/wms.types'

const { Title, Text, Paragraph } = Typography

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_TAG_CONFIG: Record<WeighbridgeStatus, { label: string; color: string }> = {
  weighing_gross: { label: 'Chờ cân lần 1', color: 'processing' },
  weighing_tare: { label: 'Chờ cân lần 2', color: 'warning' },
  completed: { label: 'Hoàn tất', color: 'success' },
  cancelled: { label: 'Đã hủy', color: 'error' },
}

const REFERENCE_LABELS: Record<string, string> = {
  stock_in: 'Phiếu nhập TP',
  stock_out: 'Phiếu xuất TP',
  stock_in_raw: 'Nhập NVL',
  purchase_order: 'Đơn mua hàng',
  none: 'Không liên kết',
}

const CAPTURE_LABELS: Record<string, string> = {
  front: 'Mặt trước',
  rear: 'Mặt sau',
  top: 'Trên cao',
  plate: 'Biển số',
  cargo: 'Hàng hóa',
}

const MONO_FONT: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }
const PRIMARY_COLOR = '#1B4D3E'

// ============================================================================
// COMPONENT
// ============================================================================

interface WeighbridgeDetailPageProps {
  id?: string
}

export default function WeighbridgeDetailPage({ id: propId }: WeighbridgeDetailPageProps = {}) {
  const navigate = useNavigate()
  const { id: paramId } = useParams<{ id: string }>()
  const id = propId || paramId

  const [ticket, setTicket] = useState<WeighbridgeTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // ============================================================================
  // LOAD
  // ============================================================================

  useEffect(() => {
    if (!id) return
    loadTicket()
  }, [id])

  async function loadTicket() {
    setLoading(true)
    setError(null)
    try {
      const data = await weighbridgeService.getById(id!)
      if (!data) {
        setError('Không tìm thấy phiếu cân')
        return
      }
      setTicket(data)
    } catch (err: any) {
      setError(err?.message || 'Không thể tải phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function handlePrint() {
    window.print()
  }

  function navigateToReference() {
    if (!ticket?.reference_type || !ticket?.reference_id) return
    const routes: Record<string, string> = {
      stock_in: `/wms/stock-in/${ticket.reference_id}`,
      stock_out: `/wms/stock-out/${ticket.reference_id}`,
      stock_in_raw: `/purchasing/receivings/${ticket.reference_id}`,
      purchase_order: `/purchasing/orders/${ticket.reference_id}`,
    }
    const route = routes[ticket.reference_type]
    if (route) navigate(route)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <div style={{ background: PRIMARY_COLOR, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ color: '#fff' }} />
            <Title level={5} style={{ color: '#fff', margin: 0 }}>Chi tiết phiếu cân</Title>
          </div>
        </div>
        <div style={{ maxWidth: 672, margin: '0 auto', padding: '48px 16px' }}>
          <Result
            icon={<WarningOutlined style={{ color: '#d9d9d9' }} />}
            title={error || 'Không tìm thấy phiếu cân'}
            extra={
              <Button
                type="primary"
                onClick={() => navigate('/wms/weighbridge/list')}
                style={{ background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }}
              >
                Quay lại danh sách
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  const sc = STATUS_TAG_CONFIG[ticket.status]
  const images = ticket.images || []

  // Build timeline items
  const timelineItems: {
    color: string
    children: React.ReactNode
  }[] = [
    {
      color: 'green',
      children: (
        <div>
          <Text strong>Tạo phiếu</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(ticket.created_at).toLocaleString('vi-VN')}
          </Text>
        </div>
      ),
    },
    {
      color: ticket.gross_weight != null ? 'green' : 'gray',
      children: (
        <div>
          <Text strong={ticket.gross_weight != null} type={ticket.gross_weight == null ? 'secondary' : undefined}>
            Cân Gross{ticket.gross_weight != null ? ` — ${ticket.gross_weight.toLocaleString('vi-VN')} kg` : ''}
          </Text>
          {ticket.gross_weighed_at && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(ticket.gross_weighed_at).toLocaleString('vi-VN')}
              </Text>
            </>
          )}
        </div>
      ),
    },
    {
      color: ticket.tare_weight != null ? 'green' : 'gray',
      children: (
        <div>
          <Text strong={ticket.tare_weight != null} type={ticket.tare_weight == null ? 'secondary' : undefined}>
            Cân Tare{ticket.tare_weight != null ? ` — ${ticket.tare_weight.toLocaleString('vi-VN')} kg` : ''}
          </Text>
          {ticket.tare_weighed_at && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(ticket.tare_weighed_at).toLocaleString('vi-VN')}
              </Text>
            </>
          )}
        </div>
      ),
    },
    {
      color: ticket.status === 'cancelled' ? 'red' : ticket.status === 'completed' ? 'green' : 'gray',
      children: (
        <div>
          <Text
            strong={ticket.status === 'completed' || ticket.status === 'cancelled'}
            type={ticket.status !== 'completed' && ticket.status !== 'cancelled' ? 'secondary' : undefined}
            style={ticket.status === 'cancelled' ? { color: '#DC2626' } : undefined}
          >
            {ticket.status === 'cancelled'
              ? 'Đã hủy'
              : `Hoàn tất${ticket.net_weight != null ? ` — NET ${ticket.net_weight.toLocaleString('vi-VN')} kg` : ''}`}
          </Text>
          {ticket.completed_at && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(ticket.completed_at).toLocaleString('vi-VN')}
              </Text>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div className="print-hidden" style={{ background: PRIMARY_COLOR, padding: '16px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ color: '#fff' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={8} align="center">
              <Text strong style={{ color: '#fff', fontSize: 15 }} ellipsis>{ticket.code}</Text>
              <Tag color={sc.color}>{sc.label}</Tag>
            </Space>
            <div>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                {ticket.vehicle_plate} • {ticketTypeLabel(ticket.ticket_type, 'short')}
              </Text>
            </div>
          </div>
          <Button type="text" icon={<PrinterOutlined />} onClick={handlePrint} style={{ color: '#fff' }} />
        </div>
      </div>

      <div style={{ padding: '16px 24px' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* ===== WEIGHT RESULTS ===== */}
          <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
            <Row>
              <Col span={8} style={{ textAlign: 'center', padding: 16 }}>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Gross</Text>
                <div style={{ ...MONO_FONT, fontSize: 22, fontWeight: 700, color: '#141414' }}>
                  {ticket.gross_weight != null ? ticket.gross_weight.toLocaleString('vi-VN') : '---'}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
              </Col>
              <Col span={8} style={{ textAlign: 'center', padding: 16, borderLeft: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Tare</Text>
                <div style={{ ...MONO_FONT, fontSize: 22, fontWeight: 700, color: '#141414' }}>
                  {ticket.tare_weight != null ? ticket.tare_weight.toLocaleString('vi-VN') : '---'}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
              </Col>
              <Col
                span={8}
                style={{
                  textAlign: 'center', padding: 16,
                  background: ticket.net_weight != null ? '#F0FDF4' : undefined,
                }}
              >
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>NET</Text>
                <div style={{
                  ...MONO_FONT, fontSize: 22, fontWeight: 700,
                  color: ticket.net_weight != null ? '#15803D' : '#141414',
                }}>
                  {ticket.net_weight != null ? ticket.net_weight.toLocaleString('vi-VN') : '---'}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
              </Col>
            </Row>
          </Card>

          {/* ===== DRC-ADJUSTED WEIGHT ===== */}
          {ticket.net_weight != null && (ticket as any).drc && (
            <Card size="small" style={{ borderRadius: 12, background: '#FFFBEB', borderColor: '#F59E0B' }}>
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Quy kho (DRC {(ticket as any).drc}%)
                </Text>
                <div style={{ ...MONO_FONT, fontSize: 20, fontWeight: 700, color: '#B45309' }}>
                  {((ticket.net_weight * (ticket as any).drc) / 100).toLocaleString('vi-VN')} kg
                </div>
              </div>
            </Card>
          )}

          {/* ===== VEHICLE INFO ===== */}
          <Card
            size="small"
            title={<Space><CarOutlined /> Thông tin xe</Space>}
            style={{ borderRadius: 12 }}
          >
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Biển số">
                <Text strong>{ticket.vehicle_plate}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Tài xế">
                {ticket.driver_name || <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Loại">
                {ticketTypeLabel(ticket.ticket_type, 'long')}
              </Descriptions.Item>
              <Descriptions.Item label="Mã phiếu">
                <Text copyable style={MONO_FONT}>{ticket.code}</Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* ===== REFERENCE LINK ===== */}
          {ticket.reference_type && ticket.reference_type !== 'none' && (
            <Card
              size="small"
              title={<Space><LinkOutlined /> Liên kết</Space>}
              style={{ borderRadius: 12 }}
            >
              <Button
                block
                type="default"
                onClick={navigateToReference}
                style={{ height: 'auto', padding: '12px 16px', textAlign: 'left', background: '#EFF6FF', borderColor: '#BFDBFE' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div>
                    <Text strong style={{ color: '#1D4ED8', display: 'block' }}>
                      {REFERENCE_LABELS[ticket.reference_type] || ticket.reference_type}
                    </Text>
                    <Text style={{ color: '#60A5FA', fontSize: 12 }}>{ticket.reference_id}</Text>
                  </div>
                  <ExportOutlined style={{ color: '#60A5FA' }} />
                </div>
              </Button>
            </Card>
          )}

          {/* ===== PHOTO GALLERY ===== */}
          {images.length > 0 && (
            <Card
              size="small"
              title={<Space><CameraOutlined /> Ảnh xe ({images.length})</Space>}
              style={{ borderRadius: 12 }}
            >
              <Image.PreviewGroup>
                <Row gutter={[8, 8]}>
                  {images.map(img => (
                    <Col span={8} key={img.id}>
                      <div style={{ position: 'relative' }}>
                        <Image
                          src={img.image_url}
                          alt={img.capture_type}
                          style={{
                            width: '100%', height: 96, objectFit: 'cover',
                            borderRadius: 8, border: '1px solid #d9d9d9',
                          }}
                          loading="lazy"
                          preview={{ mask: 'Xem' }}
                        />
                        <Tag
                          style={{
                            position: 'absolute', bottom: 4, left: 4,
                            fontSize: 10, lineHeight: '16px', padding: '0 4px',
                            background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                            zIndex: 1,
                          }}
                        >
                          {CAPTURE_LABELS[img.capture_type] || img.capture_type}
                        </Tag>
                      </div>
                    </Col>
                  ))}
                </Row>
              </Image.PreviewGroup>
            </Card>
          )}

          {/* ===== TIMELINE ===== */}
          <Card
            size="small"
            title={<Space><ClockCircleOutlined /> Lịch trình</Space>}
            style={{ borderRadius: 12 }}
          >
            <Timeline items={timelineItems} />
          </Card>

          {/* ===== NOTES ===== */}
          {ticket.notes && (
            <Card
              size="small"
              title={<Space><FileTextOutlined /> Ghi chú</Space>}
              style={{ borderRadius: 12 }}
            >
              <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ticket.notes}</Paragraph>
            </Card>
          )}

          {/* Bottom actions */}
          <Row gutter={8} className="print-hidden" style={{ paddingBottom: 24 }}>
            <Col span={12}>
              <Button block size="large" icon={<PrinterOutlined />} onClick={handlePrint}>
                In phiếu
              </Button>
            </Col>
            <Col span={12}>
              <Button
                block
                size="large"
                type="primary"
                onClick={() => navigate('/wms/weighbridge/list')}
                style={{ background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }}
              >
                Quay lại danh sách
              </Button>
            </Col>
          </Row>
        </Space>
      </div>

      {/* ===== BẢN IN A4 — màn hình giấu đi, chỉ hiện khi window.print() ===== */}
      <div className="print-only"><PrintSheet ticket={ticket} /></div>

      <style>{`
        .print-only { display: none; }
        @media print {
          /* Ẩn TOÀN BỘ app shell + giao diện màn hình — chỉ in Sheet phiếu cân.
             (Khuôn in chép từ PaymentRequestPrintPage; .print-hidden gắn trên
             header/nút từ trước nhưng chưa từng có CSS — định nghĩa tại đây.) */
          body * { visibility: hidden !important; }
          .print-hidden { display: none !important; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only {
            display: block !important;
            position: absolute !important; left: 0; top: 0; width: 100%;
            padding: 12mm !important; box-sizing: border-box;
          }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          /* margin:0 → trình duyệt KHÔNG in header/footer (ngày giờ, URL, số trang).
             Lề tài liệu trả lại bằng padding của .print-only ở trên. */
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// BẢN IN A4 — phiếu cân gọn (mã phiếu, xe, Gross/Tare/NET, DRC quy kho, chữ ký)
// ============================================================================

const SHEET_TD_LABEL: React.CSSProperties = { border: '1px solid #D1D5DB', background: '#F9FAFB', padding: '6px 10px', fontWeight: 600, color: '#374151', width: 110 }
const SHEET_TD_VALUE: React.CSSProperties = { border: '1px solid #D1D5DB', padding: '6px 10px' }
const SHEET_WEIGHT_CELL: React.CSSProperties = { border: '1px solid #D1D5DB', padding: '10px 8px', textAlign: 'center', width: '33.33%' }
const SHEET_WEIGHT_LABEL: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#6B7280' }

function PrintSheet({ ticket }: { ticket: WeighbridgeTicket }) {
  const drc = (ticket as any).drc
  const sc = STATUS_TAG_CONFIG[ticket.status]
  return (
    <div style={{ fontFamily: "'Be Vietnam Pro', Arial, sans-serif", fontSize: 13, color: '#111' }}>
      {/* Header công ty */}
      <div style={{ borderBottom: '2px solid #1B4D3E', paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>CÔNG TY TNHH MỘT THÀNH VIÊN</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1B4D3E' }}>CAO SU HUY ANH PHONG ĐIỀN</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Khe Mạ, Phường Phong Điền, TP Huế · MST: 3301549896</div>
      </div>

      {/* Tiêu đề */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>PHIẾU CÂN XE</div>
        <div style={{ fontSize: 13, marginTop: 2 }}>Số: <strong style={{ ...MONO_FONT, color: '#92400E' }}>{ticket.code}</strong></div>
        <div style={{ fontSize: 12, color: '#6B7280' }}>Ngày tạo: {new Date(ticket.created_at).toLocaleString('vi-VN')}</div>
        {ticket.status !== 'completed' && (
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: ticket.status === 'cancelled' ? '#DC2626' : '#B45309' }}>
            ({sc.label})
          </div>
        )}
      </div>

      {/* Thông tin xe */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={SHEET_TD_LABEL}>Biển số xe</td>
            <td style={{ ...SHEET_TD_VALUE, fontSize: 16, fontWeight: 800 }}>{ticket.vehicle_plate}</td>
            <td style={SHEET_TD_LABEL}>Tài xế</td>
            <td style={SHEET_TD_VALUE}>{ticket.driver_name || '—'}</td>
          </tr>
          <tr>
            <td style={SHEET_TD_LABEL}>Loại phiếu</td>
            <td style={SHEET_TD_VALUE}>{ticketTypeLabel(ticket.ticket_type, 'long')}</td>
            <td style={SHEET_TD_LABEL}>Nhà máy</td>
            <td style={SHEET_TD_VALUE}>{ticket.facility?.name || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Kết quả cân */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={SHEET_WEIGHT_CELL}>
              <div style={SHEET_WEIGHT_LABEL}>Gross</div>
              <div style={{ ...MONO_FONT, fontSize: 20, fontWeight: 700 }}>
                {ticket.gross_weight != null ? `${ticket.gross_weight.toLocaleString('vi-VN')} kg` : '—'}
              </div>
              {ticket.gross_weighed_at && (
                <div style={{ fontSize: 10, color: '#9CA3AF' }}>{new Date(ticket.gross_weighed_at).toLocaleString('vi-VN')}</div>
              )}
            </td>
            <td style={SHEET_WEIGHT_CELL}>
              <div style={SHEET_WEIGHT_LABEL}>Tare</div>
              <div style={{ ...MONO_FONT, fontSize: 20, fontWeight: 700 }}>
                {ticket.tare_weight != null ? `${ticket.tare_weight.toLocaleString('vi-VN')} kg` : '—'}
              </div>
              {ticket.tare_weighed_at && (
                <div style={{ fontSize: 10, color: '#9CA3AF' }}>{new Date(ticket.tare_weighed_at).toLocaleString('vi-VN')}</div>
              )}
            </td>
            <td style={{ ...SHEET_WEIGHT_CELL, background: '#F0FDF4' }}>
              <div style={SHEET_WEIGHT_LABEL}>NET</div>
              <div style={{ ...MONO_FONT, fontSize: 20, fontWeight: 700, color: '#15803D' }}>
                {ticket.net_weight != null ? `${ticket.net_weight.toLocaleString('vi-VN')} kg` : '—'}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Quy kho theo DRC — cùng công thức với khối hiển thị trên màn hình */}
      {ticket.net_weight != null && drc ? (
        <div style={{ border: '1px solid #F59E0B', background: '#FFFBEB', borderRadius: 4, padding: '6px 10px', marginBottom: 10, textAlign: 'center' }}>
          Quy kho (DRC {drc}%): <strong style={{ ...MONO_FONT, color: '#B45309' }}>{((ticket.net_weight * drc) / 100).toLocaleString('vi-VN')} kg</strong>
        </div>
      ) : null}

      {/* Ghi chú */}
      {ticket.notes && (
        <div style={{ marginBottom: 10 }}>
          <strong>Ghi chú:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{ticket.notes}</span>
        </div>
      )}

      {/* Chữ ký — cùng 3 cột với phiếu in của app Trạm cân */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, textAlign: 'center', gap: 12, fontSize: 13 }}>
        {['Nhân viên cân', 'Tài xế/Đại lý', 'Xác nhận'].map(t => (
          <div key={t} style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 56 }}>{t}</div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: 4, fontSize: 11, color: '#6B7280' }}>(Ký, ghi rõ họ tên)</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, textAlign: 'center', fontSize: 10, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: 6 }}>
        In từ hệ thống ERP Huy Anh — {new Date().toLocaleString('vi-VN')}
      </div>
    </div>
  )
}
