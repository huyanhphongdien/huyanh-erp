// ============================================================================
// MÀN HÌNH CHÍNH — phiếu mủ lẻ trong ngày
// File: apps/retail-scale/src/pages/HomePage.tsx
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Button, Card, Col, DatePicker, Empty, Input, Modal, Row, Space, Statistic,
  Table, Tag, Typography, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  LogoutOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined, SearchOutlined,
  SettingOutlined, StopOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import { useCurrentFacility } from '@/stores/facilityStore'
import { useScale } from '@/scale/ScaleProvider'
import { fmtKg, fmtVnd, rubberLabel } from '@/lib/retail'
import { cancelTicket, listTickets, type RetailTicket } from '@/services/retailTicketService'

const { Text, Title } = Typography
const PRIMARY = '#1B4D3E'
const MONO: React.CSSProperties = { fontFamily: "Consolas, 'Courier New', monospace" }

export default function HomePage() {
  const navigate = useNavigate()
  const { operator, logout } = useAuthStore()
  const { facility, error: facilityError } = useCurrentFacility()
  const scale = useScale()

  const [date, setDate] = useState(dayjs())
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<RetailTicket[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listTickets({
        facility_id: facility?.id ?? null,
        date: date.format('YYYY-MM-DD'),
        search,
        includeCancelled: true,
      })
      setRows(data)
    } catch (e) {
      message.error((e as Error).message || 'Không tải được danh sách')
    } finally {
      setLoading(false)
    }
  }, [facility?.id, date, search])

  useEffect(() => { load() }, [load])

  const live = rows.filter(t => t.status !== 'cancelled')
  const totalKg = Math.round(live.reduce((s, t) => s + (Number(t.net_weight) || 0), 0) * 100) / 100
  const totalAmount = live.reduce((s, t) => s + (Number(t.estimated_value) || 0), 0)
  const waiting = live.filter(t => !t.payment_request_id).length

  function askCancel(t: RetailTicket) {
    let reason = ''
    Modal.confirm({
      title: `Huỷ phiếu ${t.code}?`,
      content: (
        <div>
          <Text type="secondary">Phiếu không bị xoá — chỉ đánh dấu đã huỷ để đối chiếu cuối ngày.</Text>
          <Input.TextArea
            rows={2}
            placeholder="Lý do huỷ (bắt buộc)"
            style={{ marginTop: 8 }}
            onChange={e => { reason = e.target.value }}
          />
        </div>
      ),
      okText: 'Huỷ phiếu',
      okButtonProps: { danger: true },
      cancelText: 'Không',
      onOk: async () => {
        try {
          await cancelTicket(t.id, reason, operator?.id ?? null)
          message.success('Đã huỷ phiếu')
          load()
        } catch (e) {
          message.error((e as Error).message)
          throw e
        }
      },
    })
  }

  const columns: ColumnsType<RetailTicket> = [
    {
      title: 'Phiếu', dataIndex: 'code', width: 165,
      render: (v: string, t) => (
        <Space direction="vertical" size={0}>
          <Text style={{ ...MONO, fontSize: 13 }} delete={t.status === 'cancelled'}>{v}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {new Date(t.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Khách', dataIndex: 'supplier_name', ellipsis: true,
      render: (v: string | null, t) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v || '—'}</Text>
          {t.driver_phone && <Text type="secondary" style={{ fontSize: 11 }}>{t.driver_phone}</Text>}
        </Space>
      ),
    },
    {
      title: 'Loại mủ', dataIndex: 'rubber_type', width: 120,
      render: (v: string | null) => <Tag>{rubberLabel(v)}</Tag>,
    },
    {
      title: 'KL (kg)', dataIndex: 'net_weight', width: 110, align: 'right',
      render: (v: number | null) => <Text strong style={{ ...MONO, color: '#15803D' }}>{fmtKg(v)}</Text>,
    },
    {
      title: 'Đơn giá', dataIndex: 'unit_price', width: 120, align: 'right',
      render: (v: number | null) => <Text style={MONO}>{fmtVnd(v)}</Text>,
    },
    {
      title: 'Thành tiền', dataIndex: 'estimated_value', width: 140, align: 'right',
      render: (v: number | null) => <Text strong style={{ ...MONO, fontSize: 15 }}>{fmtVnd(v)}</Text>,
    },
    {
      title: 'Chi tiền', key: 'paid', width: 130,
      render: (_v, t) =>
        t.status === 'cancelled'
          ? <Tag color="error">Đã huỷ</Tag>
          : t.payment_request_id
            ? <Tag color="success">Đã vào ĐNTT</Tag>
            : <Tag color="warning">Chờ kế toán</Tag>,
    },
    {
      title: '', key: 'act', width: 96, align: 'center',
      render: (_v, t) => (
        <Space size={2}>
          <Button type="text" icon={<PrinterOutlined />} onClick={() => navigate(`/print/${t.id}`)} />
          {t.status !== 'cancelled' && !t.payment_request_id && (
            <Button type="text" danger icon={<StopOutlined />} onClick={() => askCancel(t)} />
          )}
        </Space>
      ),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{ background: PRIMARY, padding: '10px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
          <Space size={10}>
            <div style={{ background: '#fff', padding: '5px 9px', borderRadius: 8, display: 'flex' }}>
              <img src="/logo.png" alt="Huy Anh" style={{ height: 30 }} />
            </div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Công ty TNHH MTV</div>
              <div style={{ color: '#FFD54F', fontSize: 12 }}>Cao su Huy Anh</div>
            </div>
          </Space>
          <div style={{ textAlign: 'center' }}>
            <Title level={4} style={{ color: '#fff', margin: 0, letterSpacing: 1 }}>
              🧺 CÂN MỦ LẺ {facility ? `— ${facility.name.toUpperCase()}` : ''}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>
              {operator?.name} · {operator?.station || 'Trạm 1'}
            </Text>
          </div>
          <Space size={6} style={{ justifySelf: 'end' }}>
            <Tag color={scale.connected ? 'green' : 'red'} style={{ margin: 0, cursor: 'pointer' }} onClick={() => navigate('/settings')}>
              {scale.connected ? '● Cân OK' : '○ Chưa nối'}
            </Tag>
            <Button type="text" icon={<ReloadOutlined spin={loading} />} onClick={load} style={{ color: '#fff' }} />
            <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/settings')} style={{ color: '#fff' }} />
            <Button type="text" icon={<LogoutOutlined />} onClick={logout} style={{ color: '#fff' }} />
          </Space>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 16 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {facilityError && <Alert type="warning" showIcon message={facilityError} />}

          <Row gutter={[12, 12]}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic title="Phiếu" value={live.length} valueStyle={{ fontWeight: 700 }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic title="Tổng kg" value={totalKg} precision={1} valueStyle={{ fontWeight: 700, color: PRIMARY }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic
                  title="Tổng tiền"
                  value={totalAmount}
                  formatter={v => Number(v).toLocaleString('vi-VN')}
                  valueStyle={{ fontWeight: 700, color: '#15803D' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic title="Chờ kế toán chi" value={waiting} valueStyle={{ fontWeight: 700, color: '#CA8A04' }} />
              </Card>
            </Col>
          </Row>

          <Card
            hoverable
            style={{ borderRadius: 12, border: `2px dashed ${PRIMARY}`, cursor: 'pointer' }}
            styles={{ body: { padding: '18px 24px' } }}
            onClick={() => navigate('/weigh')}
          >
            <Space size={16}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: PRIMARY, display: 'grid', placeItems: 'center' }}>
                <PlusOutlined style={{ color: '#fff', fontSize: 20 }} />
              </div>
              <div>
                <Text strong style={{ fontSize: 17, display: 'block' }}>Cân khách mới</Text>
                <Text type="secondary">Nhập tên khách → chọn loại mủ → cân từng bao → in phiếu</Text>
              </div>
            </Space>
          </Card>

          <Card
            size="small"
            style={{ borderRadius: 12 }}
            styles={{ body: { padding: 0 } }}
            title={
              <Space wrap>
                <Text strong>Phiếu ngày {date.format('DD/MM/YYYY')}</Text>
                <Tag>{rows.length} phiếu</Tag>
              </Space>
            }
            extra={
              <Space>
                <DatePicker value={date} onChange={d => d && setDate(d)} format="DD/MM/YYYY" allowClear={false} />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  prefix={<SearchOutlined />}
                  placeholder="Mã phiếu / tên khách / SĐT"
                  allowClear
                  style={{ width: 240 }}
                />
              </Space>
            }
          >
            <Table
              columns={columns}
              dataSource={rows}
              rowKey="id"
              loading={loading}
              size="middle"
              pagination={{ pageSize: 20, showTotal: t => `${t} phiếu` }}
              scroll={{ x: 980 }}
              locale={{ emptyText: <Empty description="Chưa có phiếu mủ lẻ nào trong ngày" /> }}
            />
          </Card>
        </Space>
      </div>
    </div>
  )
}
