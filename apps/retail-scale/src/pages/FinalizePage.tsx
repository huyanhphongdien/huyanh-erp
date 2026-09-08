// ============================================================================
// MÀN CHỐT DRC + IN — bước sau khi cán bộ đo DRC xong
// File: apps/retail-scale/src/pages/FinalizePage.tsx
//
// Vào từ danh sách "Chờ DRC" ở Trang chủ. Phiếu đã cân xong (status='pending_drc'),
// ở đây chỉ nhập DRC + đơn giá → tính tiền → "Chốt & In" (finalizeTicket → completed).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, Col, InputNumber, Modal, Row, Space, Spin, Table, Tag, Typography, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, PrinterOutlined, StopOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import { useCurrentFacility } from '@/stores/facilityStore'
import { computeAmount, fmtKg, fmtVnd, readVietnameseNumber, rubberLabel } from '@/lib/retail'
import {
  cancelTicket, finalizeTicket, getLots, getTicket,
  type RetailTicket, type RetailTicketLot,
} from '@/services/retailTicketService'
import { rememberPrice, suggestPrice, type PriceSuggestion } from '@/services/retailPriceService'

const { Text, Title } = Typography
const PRIMARY = '#1B4D3E'
const MONO: React.CSSProperties = { fontFamily: "Consolas, 'Courier New', monospace" }

export default function FinalizePage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const operator = useAuthStore(s => s.operator)
  const { facility } = useCurrentFacility()

  const [ticket, setTicket] = useState<RetailTicket | null>(null)
  const [lots, setLots] = useState<RetailTicketLot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [drc, setDrc] = useState<number | null>(null)
  const [unitPrice, setUnitPrice] = useState<number | null>(null)
  const [priceHint, setPriceHint] = useState<PriceSuggestion | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!ticketId) return
    setLoading(true)
    Promise.all([getTicket(ticketId), getLots(ticketId)])
      .then(([t, l]) => {
        if (!t) { setError('Không tìm thấy phiếu'); return }
        setTicket(t)
        setLots(l)
        // Gợi ý giá (giá ngày ERP → giá gõ lần trước). Chỉ điền khi ô còn trống.
        suggestPrice(t.rubber_type || '').then(s => {
          setPriceHint(s)
          setUnitPrice(prev => (prev == null ? (s?.price ?? null) : prev))
        })
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [ticketId])

  const net = Number(ticket?.net_weight) || 0
  const gross = Number(ticket?.gross_weight) || 0
  const money = useMemo(
    () => computeAmount({ netKg: net, rubberType: ticket?.rubber_type, unitPrice: unitPrice || 0, drc }),
    [net, ticket?.rubber_type, unitPrice, drc],
  )

  function askCancel() {
    if (!ticket) return
    let reason = ''
    Modal.confirm({
      title: `Huỷ phiếu ${ticket.code}?`,
      content: (
        <div>
          <Text type="secondary">Phiếu chưa chốt DRC. Huỷ để không phải xử lý nữa.</Text>
          <textarea
            rows={2}
            placeholder="Lý do huỷ (bắt buộc)"
            style={{ width: '100%', marginTop: 8, padding: 6 }}
            onChange={e => { reason = e.target.value }}
          />
        </div>
      ),
      okText: 'Huỷ phiếu', okButtonProps: { danger: true }, cancelText: 'Không',
      onOk: async () => {
        try {
          await cancelTicket(ticket.id, reason, operator?.id ?? null)
          message.success('Đã huỷ phiếu')
          navigate('/')
        } catch (e) { message.error((e as Error).message); throw e }
      },
    })
  }

  function confirmAndFinalize() {
    if (savingRef.current || !ticket) return
    if (!(unitPrice && unitPrice > 0)) return message.warning('Chưa nhập đơn giá')
    if (!(drc && drc > 0)) return message.warning('Chưa nhập DRC %')

    Modal.confirm({
      title: 'Chốt DRC & in phiếu',
      width: 460,
      content: (
        <div style={{ fontSize: 15, lineHeight: 1.9 }}>
          <div>Khách: <b>{ticket.supplier_name || '—'}</b></div>
          <div>Loại mủ: <b>{rubberLabel(ticket.rubber_type)}</b></div>
          <div>Tổng cân: <b>{fmtKg(net)} kg</b></div>
          <div>DRC: <b>{money.drc}%</b> → KL khô <b>{fmtKg(money.billableKg)} kg</b></div>
          <div>Đơn giá: <b>{fmtVnd(unitPrice || 0)}/kg khô</b></div>
          <div style={{ marginTop: 8, fontSize: 20, color: PRIMARY }}>
            Thành tiền: <b>{fmtVnd(money.rounded)}</b>
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>{readVietnameseNumber(money.rounded)}</div>
        </div>
      ),
      okText: 'Chốt & In phiếu', cancelText: 'Xem lại',
      okButtonProps: { style: { background: PRIMARY, borderColor: PRIMARY } },
      onOk: doFinalize,
    })
  }

  async function doFinalize() {
    if (savingRef.current || !ticket) return
    savingRef.current = true
    setSaving(true)
    try {
      await finalizeTicket(ticket.id, {
        drc: drc || 0,
        unit_price: unitPrice || 0,
        operator_id: operator?.id ?? null,
      })
      rememberPrice(ticket.rubber_type || '', unitPrice || 0)
      message.success('Đã chốt phiếu')
      navigate(`/print/${ticket.id}?auto=1`, { replace: true })
    } catch (e) {
      message.error((e as Error).message || 'Chốt phiếu thất bại', 8)
      savingRef.current = false
    } finally {
      setSaving(false)
    }
  }

  const lotCols: ColumnsType<RetailTicketLot> = [
    { title: '#', key: 'i', width: 48, render: (_v, _r, i) => <Text strong>{i + 1}</Text> },
    { title: 'Cân (kg)', dataIndex: 'gross_kg', align: 'right', render: (v: number | null) => <Text style={MONO}>{fmtKg(v)}</Text> },
    { title: 'Bì (kg)', dataIndex: 'tare_kg', align: 'right', render: (v: number) => <Text style={MONO}>{fmtKg(v)}</Text> },
    { title: 'Thực (kg)', dataIndex: 'net_kg', align: 'right', render: (v: number) => <Text strong style={{ ...MONO, color: '#15803D' }}>{fmtKg(v)}</Text> },
    { title: 'Loại bì', dataIndex: 'container_type', render: (v: string | null) => v || '—' },
  ]

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Space direction="vertical" align="center"><Spin size="large" /><Text type="secondary">Đang tải phiếu...</Text></Space>
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message={error || 'Không tìm thấy phiếu'} />
        <Button style={{ marginTop: 12 }} onClick={() => navigate('/')}>Về danh sách</Button>
      </div>
    )
  }

  // Phiếu đã chốt / đã huỷ ở nơi khác → không cho nhập DRC nữa.
  if (ticket.status !== 'pending_drc') {
    return (
      <div style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
        <Alert
          type={ticket.status === 'cancelled' ? 'warning' : 'info'}
          showIcon
          message={ticket.status === 'cancelled' ? `Phiếu ${ticket.code} đã huỷ` : `Phiếu ${ticket.code} đã chốt DRC + in`}
          description={ticket.status === 'completed' ? 'Phiếu đã có thành tiền và vào luồng chi tiền.' : undefined}
        />
        <Space style={{ marginTop: 12 }}>
          <Button onClick={() => navigate('/')}>Về danh sách</Button>
          {ticket.status === 'completed' && (
            <Button type="primary" icon={<PrinterOutlined />} onClick={() => navigate(`/print/${ticket.id}`)} style={{ background: PRIMARY, borderColor: PRIMARY }}>
              In lại phiếu
            </Button>
          )}
        </Space>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', paddingBottom: 32 }}>
      <div style={{ background: PRIMARY, padding: '10px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }}>
            Về danh sách
          </Button>
          <Title level={4} style={{ color: '#fff', margin: 0, flex: 1, textAlign: 'center' }}>
            🧪 CHỐT DRC {facility ? `— ${facility.name}` : ''}
          </Title>
          <Tag color="gold" style={{ margin: 0 }}>Chờ DRC</Tag>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* Thông tin phiếu (chỉ đọc) */}
          <Card size="small" title={`Phiếu ${ticket.code}`} style={{ borderRadius: 12 }}>
            <Row gutter={[12, 6]}>
              <Col xs={24} md={10}><Text type="secondary">Khách: </Text><Text strong>{ticket.supplier_name || '—'}</Text></Col>
              <Col xs={12} md={7}><Text type="secondary">Phương tiện: </Text><Text>{ticket.vehicle_plate || '—'}</Text></Col>
              <Col xs={12} md={7}><Text type="secondary">Loại mủ: </Text><Tag>{rubberLabel(ticket.rubber_type)}</Tag></Col>
            </Row>
            <Table
              style={{ marginTop: 8 }}
              columns={lotCols}
              dataSource={lots}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 240 }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}><b>{lots.length} bao</b></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right"><Text style={MONO}>{fmtKg(gross)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right"><Text style={MONO}>{fmtKg(Math.round((gross - net) * 100) / 100)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right"><Text strong style={{ ...MONO, fontSize: 17, color: '#15803D' }}>{fmtKg(net)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={4}> </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </Card>

          {/* Nhập DRC + giá */}
          <Card size="small" title="Nhập DRC + đơn giá (từ kết quả lab)" style={{ borderRadius: 12 }}>
            <Row gutter={16} align="bottom">
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>DRC (%)</Text>
                <InputNumber
                  value={drc ?? undefined}
                  onChange={v => setDrc(v ?? null)}
                  min={0} max={100} step={0.5} precision={2}
                  size="large" autoFocus
                  style={{ width: '100%', ...MONO }}
                />
              </Col>
              <Col xs={12} md={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>Đơn giá (₫/kg khô)</Text>
                <InputNumber<number>
                  value={unitPrice ?? undefined}
                  onChange={v => setUnitPrice(v ?? null)}
                  min={0} step={500} size="large"
                  style={{ width: '100%', ...MONO }}
                  formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                  parser={v => Number(String(v).replace(/\D/g, '')) || 0}
                />
                {priceHint && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {priceHint.label}: {fmtVnd(priceHint.price)}
                    {unitPrice !== priceHint.price && (
                      <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => setUnitPrice(priceHint.price)}>dùng</Button>
                    )}
                  </Text>
                )}
              </Col>
            </Row>
          </Card>

          {/* Tiền + chốt */}
          <Card size="small" style={{ borderRadius: 12, borderColor: PRIMARY, borderWidth: 2 }}>
            <Row gutter={16} align="middle">
              <Col xs={24} md={15}>
                <Space direction="vertical" size={2}>
                  <Text type="secondary">
                    {fmtKg(net)} kg{money.drc ? ` × ${money.drc}% = ${fmtKg(money.billableKg)} kg khô` : ' — chưa nhập DRC'}
                    {' × '}{fmtVnd(unitPrice || 0)}/kg khô
                  </Text>
                  <Title level={2} style={{ margin: 0, color: PRIMARY }}>{fmtVnd(money.rounded)}</Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {readVietnameseNumber(money.rounded)}
                    {money.exact !== money.rounded && ` · (chính xác ${fmtVnd(money.exact)}, đã làm tròn nghìn)`}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} md={9}>
                <Button
                  type="primary" size="large" block icon={<PrinterOutlined />}
                  loading={saving}
                  onClick={confirmAndFinalize}
                  disabled={!(unitPrice && unitPrice > 0) || !(drc && drc > 0)}
                  style={{ height: 60, fontSize: 19, background: PRIMARY, borderColor: PRIMARY }}
                >
                  CHỐT & IN PHIẾU
                </Button>
                <Button type="text" danger size="small" icon={<StopOutlined />} onClick={askCancel} style={{ marginTop: 6, width: '100%' }}>
                  Huỷ phiếu này
                </Button>
              </Col>
            </Row>
          </Card>
        </Space>
      </div>
    </div>
  )
}
