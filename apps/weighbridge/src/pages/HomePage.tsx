import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Button, Typography, Space, Row, Col, Statistic, Table, Tag, Empty, Badge, Image, Popover, Tooltip,
  Input, DatePicker, Select,
} from 'antd'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, ReloadOutlined, LogoutOutlined, SettingOutlined, CameraOutlined,
  EyeOutlined, PrinterOutlined, SearchOutlined, HistoryOutlined, FilterOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import { useCurrentFacility } from '@/stores/facilityStore'
import { useKeliScale } from '@erp/hooks/useKeliScale'
import ScaleSettings from '@/components/ScaleSettings'
import weighbridgeService from '@erp/services/wms/weighbridgeService'
import weighbridgeImageService from '@erp/services/wms/weighbridgeImageService'
import type { WeighbridgeTicket, WeighbridgeStatus, WeighbridgeImage } from '@erp/services/wms/wms.types'

const { Title, Text } = Typography
const PRIMARY = '#1B4D3E'
const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

const STATUS_MAP: Record<WeighbridgeStatus, { label: string; color: string }> = {
  weighing_gross: { label: 'Chờ cân L1', color: 'processing' },
  weighing_tare: { label: 'Chờ cân L2', color: 'warning' },
  completed: { label: 'Hoàn tất', color: 'success' },
  cancelled: { label: 'Đã hủy', color: 'error' },
}

export default function HomePage() {
  const navigate = useNavigate()
  const { operator, logout } = useAuthStore()
  const { facility } = useCurrentFacility()
  const scale = useKeliScale()

  const [allTickets, setAllTickets] = useState<WeighbridgeTicket[]>([])
  const [inProgress, setInProgress] = useState<WeighbridgeTicket[]>([])
  const [stats, setStats] = useState<{
    totalTickets: number; completedToday: number; inProgress: number; totalNetWeight: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [ticketImages, setTicketImages] = useState<Record<string, WeighbridgeImage[]>>({})

  // Search & Filter
  const [searchText, setSearchText] = useState('')
  const [filterDate, setFilterDate] = useState<dayjs.Dayjs | null>(dayjs())
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showAllDates, setShowAllDates] = useState(false)
  // Mặc định ẨN phiếu đã hủy (giảm noise). User có thể bật lên qua filter status.
  const [showCancelled, setShowCancelled] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // F2.7: Filter theo facility hiện tại — mỗi instance app cân chỉ thấy phiếu của NM đó
      const facilityId = facility?.id || null
      const [allResult, statsResult] = await Promise.all([
        weighbridgeService.getAll({ page: 1, pageSize: 200, facility_id: facilityId }),
        weighbridgeService.getStats(undefined, undefined, facilityId),
      ])
      const all = allResult.data || []
      const inProg = all.filter((t) => t.status === 'weighing_gross' || t.status === 'weighing_tare')
      setAllTickets(all)
      setInProgress(inProg)
      setStats(statsResult)

      // Load images for all tickets (completed + in-progress)
      const allTicketsForImg = [...all.slice(0, 20), ...inProg]
      const imgMap: Record<string, WeighbridgeImage[]> = {}
      await Promise.all(
        allTicketsForImg.map(async (t) => {
          try {
            const imgs = await weighbridgeImageService.getByTicket(t.id)
            if (imgs.length > 0) imgMap[t.id] = imgs
          } catch { /* ignore */ }
        })
      )
      setTicketImages(imgMap)
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [facility?.id])

  useEffect(() => { load() }, [load])

  // Auto refresh every 30s
  useEffect(() => {
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load])

  const columns: ColumnsType<WeighbridgeTicket> = [
    {
      title: '#', key: 'idx', width: 40,
      render: (_, __, i) => <Text type="secondary">{i + 1}</Text>,
    },
    {
      title: 'Phiếu', dataIndex: 'code', width: 130,
      render: (code: string) => <Text style={{ ...MONO, fontSize: 12 }}>{code}</Text>,
    },
    {
      title: 'Biển số', dataIndex: 'vehicle_plate', width: 110,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Tài xế', dataIndex: 'driver_name', width: 120, ellipsis: true,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Gross', dataIndex: 'gross_weight', width: 90, align: 'right',
      render: (w: number | null) => w != null
        ? <Text style={MONO}>{w.toLocaleString()}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Tare', dataIndex: 'tare_weight', width: 90, align: 'right',
      render: (w: number | null) => w != null
        ? <Text style={MONO}>{w.toLocaleString()}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'NET (kg)', dataIndex: 'net_weight', width: 100, align: 'right',
      sorter: (a: WeighbridgeTicket, b: WeighbridgeTicket) => (a.net_weight || 0) - (b.net_weight || 0),
      render: (w: number | null) => w != null
        ? <Text strong style={{ ...MONO, color: '#15803D' }}>{w.toLocaleString()}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Ngày giờ', dataIndex: 'created_at', width: 110,
      sorter: (a: WeighbridgeTicket, b: WeighbridgeTicket) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (d: string) => (
        <div>
          <Text style={{ fontSize: 12, display: 'block' }}>
            {new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </div>
      ),
    },
    {
      title: '📷', key: 'images', width: 60, align: 'center',
      render: (_: unknown, record: WeighbridgeTicket) => {
        const imgs = ticketImages[record.id]
        if (!imgs || imgs.length === 0) return <Text type="secondary">—</Text>
        return (
          <Popover
            trigger="click"
            placement="left"
            content={
              <div style={{ maxWidth: 480 }}>
                <Image.PreviewGroup>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(() => {
                      // Group by L1 (first half) and L2 (second half)
                      const cameraCount = 3
                      return imgs.map((img, idx) => {
                        const isL2 = idx >= cameraCount
                        const lbl = imgs.length > cameraCount ? (isL2 ? 'L2' : 'L1') : ''
                        const posLabel = img.capture_type === 'front' ? 'Trước' : img.capture_type === 'rear' ? 'Sau' : img.capture_type === 'top' ? 'Trên' : img.capture_type
                        return (
                          <div key={img.id} style={{ position: 'relative' }}>
                            <Image
                              src={img.image_url}
                              alt={img.capture_type}
                              width={120}
                              height={85}
                              style={{ objectFit: 'cover', borderRadius: 6, border: isL2 ? '2px solid #1890ff' : '2px solid #52c41a' }}
                            />
                            <Tag style={{
                              position: 'absolute', bottom: 2, left: 2,
                              fontSize: 9, padding: '0 4px', lineHeight: '14px',
                              background: isL2 ? 'rgba(24,144,255,0.85)' : 'rgba(82,196,26,0.85)',
                              color: '#fff', border: 'none',
                            }}>
                              {posLabel}{lbl ? ` ${lbl}` : ''}
                            </Tag>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </Image.PreviewGroup>
              </div>
            }
          >
            <Button type="text" size="small" icon={<CameraOutlined />}>
              <Text type="secondary" style={{ fontSize: 11 }}>{imgs.length}</Text>
            </Button>
          </Popover>
        )
      },
    },
    {
      title: '', key: 'actions', width: 90, align: 'center',
      render: (_: unknown, record: WeighbridgeTicket) => (
        <Space size={4}>
          <Tooltip title="Chi tiết">
            <Button
              type="text" size="small" icon={<EyeOutlined />}
              onClick={(e) => { e.stopPropagation(); navigate(`/weigh/${record.id}`) }}
            />
          </Tooltip>
          <Tooltip title="In phiếu">
            <Button
              type="text" size="small" icon={<PrinterOutlined />}
              onClick={(e) => { e.stopPropagation(); navigate(`/print/${record.id}`) }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  // Filtered tickets
  const filteredTickets = allTickets.filter(t => {
    // Exclude in-progress (shown separately)
    if (t.status === 'weighing_gross' || t.status === 'weighing_tare') return false

    // Default ẨN cancelled — chỉ hiện khi user bật toggle hoặc chọn filter='cancelled'
    if (t.status === 'cancelled' && !showCancelled && filterStatus !== 'cancelled') return false

    // Date filter
    if (!showAllDates && filterDate) {
      const ticketDate = dayjs(t.created_at).format('YYYY-MM-DD')
      const selectedDate = filterDate.format('YYYY-MM-DD')
      if (ticketDate !== selectedDate) return false
    }

    // Status filter
    if (filterStatus !== 'all' && t.status !== filterStatus) return false

    // Search
    if (searchText) {
      const s = searchText.toLowerCase()
      const match = [t.code, t.vehicle_plate, t.driver_name]
        .filter(Boolean)
        .some(v => v!.toLowerCase().includes(s))
      if (!match) return false
    }

    return true
  })

  const now = new Date()
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Header — 3-column layout: logo (trái), tên trạm cân (giữa), actions (phải) */}
      <div style={{ background: PRIMARY, padding: '10px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: 16,
            maxWidth: 1400,
            margin: '0 auto',
          }}
        >
          {/* TRÁI — Logo + tên công ty */}
          <Space size={12} align="center">
            <div
              style={{
                background: '#fff',
                padding: '6px 10px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              }}
            >
              <img
                src="/logo.png"
                alt="Huy Anh Rubber"
                style={{ height: 32, width: 'auto', display: 'block' }}
              />
            </div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>
                Công ty TNHH MTV
              </div>
              <div style={{ color: '#FFD54F', fontSize: 12, fontWeight: 500 }}>
                Cao su Huy Anh
              </div>
            </div>
          </Space>

          {/* GIỮA — Tên trạm cân (lớn, nổi bật) */}
          <div style={{ textAlign: 'center' }}>
            <Title level={4} style={{ color: '#fff', margin: 0, fontSize: 20, letterSpacing: 1 }}>
              ⚖️ TRẠM CÂN {facility ? facility.name.toUpperCase() : 'HUY ANH'}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>
              {operator?.name} • {operator?.station || 'Trạm 1'}
              {facility && <> • <span style={{ color: '#FFD54F' }}>🏭 {facility.code}</span></>}
            </Text>
          </div>

          {/* PHẢI — Time + status + buttons */}
          <Space size={6} style={{ justifySelf: 'end' }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, ...MONO }}>{timeStr}</Text>
            <Tag color={scale.connected ? 'green' : 'red'} style={{ fontSize: 11, cursor: 'pointer', margin: 0 }} onClick={() => navigate('/settings')}>
              {scale.connected ? '● Cân OK' : '○ Chưa kết nối'}
            </Tag>
            <Button type="text" icon={<ReloadOutlined spin={loading} />} onClick={load} style={{ color: '#fff' }} />
            <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/settings')} style={{ color: '#fff' }} />
            <Button type="text" icon={<LogoutOutlined />} onClick={logout} style={{ color: '#fff' }} />
          </Space>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Stats */}
          <Row gutter={[12, 12]}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 11 }}>Đang cân</Text>}
                  value={stats?.inProgress || 0}
                  valueStyle={{ fontSize: 24, fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 11 }}>Hôm nay</Text>}
                  value={stats?.completedToday || 0}
                  valueStyle={{ fontSize: 24, fontWeight: 700, color: '#16A34A' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 11 }}>Tổng phiếu</Text>}
                  value={stats?.totalTickets || 0}
                  valueStyle={{ fontSize: 24, fontWeight: 700, color: '#2563EB' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 11 }}>Tấn nay</Text>}
                  value={stats ? (stats.totalNetWeight >= 1000 ? stats.totalNetWeight / 1000 : stats.totalNetWeight) : 0}
                  precision={stats && stats.totalNetWeight >= 1000 ? 1 : 0}
                  suffix={stats && stats.totalNetWeight >= 1000 ? 'T' : 'kg'}
                  valueStyle={{ fontSize: 24, fontWeight: 700, color: PRIMARY, ...MONO }}
                />
              </Card>
            </Col>
          </Row>

          {/* Create new button */}
          <Card
            hoverable
            style={{ borderRadius: 12, border: `2px dashed ${PRIMARY}`, cursor: 'pointer' }}
            styles={{ body: { padding: '20px 24px' } }}
            onClick={() => navigate('/weigh')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: '50%', background: PRIMARY,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <PlusOutlined style={{ color: '#fff', fontSize: 20 }} />
              </div>
              <div>
                <Text strong style={{ fontSize: 16, display: 'block' }}>Tạo phiếu cân mới</Text>
                <Text type="secondary">Xe vào cân — Nhập biển số, chọn Deal/NCC</Text>
              </div>
            </div>
          </Card>

          {/* In-progress tickets */}
          {inProgress.length > 0 && (
            <Card
              size="small"
              title={
                <Space>
                  <Badge status="processing" />
                  <Text strong>Phiếu đang cân dở ({inProgress.length})</Text>
                </Space>
              }
              style={{ borderRadius: 12, borderColor: '#faad14' }}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {inProgress.map((t) => {
                  const imgs = ticketImages[t.id] || []
                  return (
                    <Card
                      key={t.id}
                      size="small"
                      hoverable
                      onClick={() => navigate(`/weigh/${t.id}`)}
                      style={{ borderRadius: 8, background: '#FFFBE6', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space size={16}>
                          <Text style={{ ...MONO, fontSize: 12 }}>{t.code}</Text>
                          <Text strong>{t.vehicle_plate}</Text>
                          <Text type="secondary">{t.driver_name || '—'}</Text>
                          <Tag color={STATUS_MAP[t.status].color}>{STATUS_MAP[t.status].label}</Tag>
                        </Space>
                        <Space>
                          {t.gross_weight != null && (
                            <Text style={MONO}>Gross: {t.gross_weight.toLocaleString()} kg</Text>
                          )}
                          <Button type="primary" size="small" style={{ background: PRIMARY, borderColor: PRIMARY }}>
                            Tiếp tục →
                          </Button>
                        </Space>
                      </div>
                      {/* Ảnh camera lần 1 */}
                      {imgs.length > 0 && (
                        <div
                          style={{ marginTop: 8, display: 'flex', gap: 4, overflowX: 'auto' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Image.PreviewGroup>
                            {imgs.map((img, idx) => {
                              const isL2 = idx >= 3
                              const lbl = imgs.length > 3 ? (isL2 ? 'L2' : 'L1') : 'L1'
                              const posLabel = img.capture_type === 'front' ? 'Trước' : img.capture_type === 'rear' ? 'Sau' : 'Trên'
                              return (
                                <div key={img.id} style={{ position: 'relative', flexShrink: 0 }}>
                                  <Image
                                    src={img.image_url}
                                    width={80}
                                    height={56}
                                    style={{ objectFit: 'cover', borderRadius: 4, border: isL2 ? '2px solid #1890ff' : '2px solid #52c41a' }}
                                    preview={{ mask: false }}
                                  />
                                  <Tag style={{
                                    position: 'absolute', bottom: 1, left: 1,
                                    fontSize: 8, padding: '0 2px', lineHeight: '12px',
                                    background: isL2 ? 'rgba(24,144,255,0.85)' : 'rgba(82,196,26,0.85)',
                                    color: '#fff', border: 'none',
                                  }}>
                                    {posLabel} {lbl}
                                  </Tag>
                                </div>
                              )
                            })}
                          </Image.PreviewGroup>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </Space>
            </Card>
          )}

          {/* Ticket list with search & filter */}
          <Card
            size="small"
            title={
              <Space>
                <HistoryOutlined />
                <Text strong>
                  {showAllDates ? 'Tất cả phiếu cân' : `Phiếu cân ${filterDate?.format('DD/MM/YYYY') || 'hôm nay'}`}
                </Text>
                <Tag>{filteredTickets.length} phiếu</Tag>
              </Space>
            }
            style={{ borderRadius: 12 }}
            styles={{ body: { padding: 0 } }}
          >
            {/* Search & Filter Bar */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Input
                placeholder="Tìm mã phiếu, biển số, tài xế..."
                prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
                style={{ width: 240 }}
              />
              <DatePicker
                value={showAllDates ? null : filterDate}
                onChange={v => { setFilterDate(v); setShowAllDates(false) }}
                format="DD/MM/YYYY"
                placeholder="Chọn ngày"
                allowClear={false}
                style={{ width: 140 }}
              />
              <Button
                type={showAllDates ? 'primary' : 'default'}
                size="small"
                onClick={() => setShowAllDates(!showAllDates)}
                style={showAllDates ? { background: PRIMARY, borderColor: PRIMARY } : {}}
              >
                Tất cả ngày
              </Button>
              <Select
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ width: 130 }}
                options={[
                  { value: 'all', label: 'Tất cả TT' },
                  { value: 'completed', label: 'Hoàn tất' },
                  { value: 'cancelled', label: 'Đã hủy' },
                ]}
              />
              <Button
                size="small"
                type={showCancelled ? 'primary' : 'default'}
                danger={showCancelled}
                onClick={() => setShowCancelled(!showCancelled)}
                style={!showCancelled ? {} : { background: '#ff4d4f', borderColor: '#ff4d4f' }}
              >
                {showCancelled ? '✓ Đang hiện phiếu hủy' : 'Hiện phiếu hủy'}
              </Button>
            </div>
            <Table
              columns={columns}
              dataSource={filteredTickets}
              rowKey="id"
              loading={loading}
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} phiếu`, size: 'small' }}
              scroll={{ x: 800 }}
              locale={{
                emptyText: (
                  <Empty description={<Text type="secondary">Không có phiếu cân nào</Text>} />
                ),
              }}
            />
          </Card>
        </Space>
      </div>
    </div>
  )
}
