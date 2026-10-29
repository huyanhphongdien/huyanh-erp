// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Nhập kho từ phiếu cân (GĐ1)
// File: src/pages/wms/raw/RawIntakeQueuePage.tsx
// Route: /wms/nvl/nhap
// Đọc v_raw_intake_queue; nhập = fn_nhap_kho_tu_phieu_can (tách lô theo dòng phiếu).
// Không có nhập kho thủ công: phiếu cân là cửa duy nhất vào kho.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Button, Card, Col, Descriptions, Empty, Input, Modal, Row, Select, Space, Table, Tag, Typography, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined, CheckCircleOutlined, PrinterOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { rawStockService, type RawIntakeQueueRow, type NhapKhoResult } from '../../../services/wms/rawStockService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_LOT_SOURCE_LABELS, RAW_SETTINGS_DEFAULT, type RawLotSource, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { ticketTypeLabel } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

const fmtKg = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' %')
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—')

type Filter = 'cho_nhap' | 'da_nhap' | 'tat_ca'

export default function RawIntakeQueuePage() {
  const navigate = useNavigate()
  const rawRole = useRawRole()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState<Filter>('cho_nhap')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<RawIntakeQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nguonHang, setNguonHang] = useState<RawLotSource | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<{ code: string; batches: NhapKhoResult[] } | null>(null)
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [data, se] = await Promise.all([
        rawStockService.getIntakeQueue({ facilityId, includeDone: filter !== 'cho_nhap', limit: 300 }),
        rawSettingsService.getForFacility(facilityId ?? null),
      ])
      setRows(filter === 'da_nhap' ? data.filter((r) => r.da_nhap) : data)
      setSettings(se)
    } catch (e: any) {
      setError(e?.message || 'Không tải được hàng đợi nhập kho')
    } finally { setLoading(false) }
  }, [facilityId, filter])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => [r.code, r.vehicle_plate, r.supplier_name, r.driver_name].some((v) => (v || '').toLowerCase().includes(s)))
  }, [rows, search])

  const selected = useMemo(() => rows.find((r) => r.ticket_id === selectedId) ?? null, [rows, selectedId])

  const tongCho = rows.filter((r) => !r.da_nhap)
  const tongUot = tongCho.reduce((s, r) => s + r.net_weight, 0)

  const canReceive = rawRole.perms.receive || rawRole.isBGD

  const handleNhapKho = () => {
    if (!selected) return
    Modal.confirm({
      title: `Nhập kho phiếu ${selected.code}?`,
      content: (
        <div>
          <p>{selected.so_dong_lo > 0 ? `Tách thành ${selected.so_dong_lo} lô theo dòng lô trên phiếu.` : 'Tạo 1 lô cho cả phiếu.'}</p>
          <p>Ướt {fmtKg(selected.so_dong_lo > 0 ? selected.wet_kg_dong : selected.net_weight)} kg · DRC {fmtPct(selected.drc_dung)} · quy khô ≈ {fmtKg(selected.dry_kg_du_kien)} kg</p>
          <p>Nguồn hàng: {nguonHang ? RAW_LOT_SOURCE_LABELS[nguonHang] : 'tự suy từ phiếu'}</p>
          <Text type="secondary">Sau khi nhập, sổ kho khô cộng ngay; không có bước hủy, sai thì BGĐ điều chỉnh.</Text>
        </div>
      ),
      okText: 'Xác nhận nhập kho', cancelText: 'Hủy',
      onOk: async () => {
        setSubmitting(true)
        try {
          const batches = await rawStockService.nhapKho(selected.ticket_id, { nguonHang: nguonHang ?? null })
          setLastResult({ code: selected.code, batches })
          message.success(`Đã nhập ${batches.length} lô từ phiếu ${selected.code}`)
          setSelectedId(null); setNguonHang(undefined)
          await load()
        } catch (e: any) {
          message.error(e?.message || 'Nhập kho thất bại')
        } finally { setSubmitting(false) }
      },
    })
  }

  const columns: ColumnsType<RawIntakeQueueRow> = [
    { title: 'Phiếu', dataIndex: 'code', key: 'code', render: (v, r) => <Space size={4}><Text code strong={r.ticket_id === selectedId}>{v}</Text>{r.facility_code && <Tag>{r.facility_code}</Tag>}</Space> },
    { title: 'Cân ra', dataIndex: 'completed_at', key: 'completed_at', render: (v) => fmtTime(v) },
    { title: 'Loại phiếu', dataIndex: 'ticket_type', key: 'ticket_type', render: (v) => ticketTypeLabel(v, 'short') },
    { title: 'Nhà cung cấp', dataIndex: 'supplier_name', key: 'supplier_name', ellipsis: true, render: (v, r) => v || r.vehicle_plate || <Text type="secondary">—</Text> },
    { title: 'Loại hàng', dataIndex: 'rubber_type_name', key: 'rubber_type_name', render: (v, r) => v ? <span>{v}{r.so_dong_lo > 1 && <Tag style={{ marginLeft: 6 }}>{r.so_dong_lo} dòng lô</Tag>}</span> : <Tag color="red">{r.rubber_type_goc || 'trống'}</Tag> },
    { title: 'Ướt (kg)', dataIndex: 'net_weight', key: 'net_weight', align: 'right', render: (v) => fmtKg(v) },
    { title: 'DRC', dataIndex: 'drc_dung', key: 'drc_dung', align: 'right', render: (v, r) => (
      <span>{fmtPct(v)}{r.qc_actual_drc === null && v !== null && <Text type="secondary" style={{ fontSize: 11 }}> mặc định</Text>}</span>) },
    { title: 'Khô (kg)', dataIndex: 'dry_kg_du_kien', key: 'dry_kg_du_kien', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
    { title: 'Trạng thái', key: 'tt', render: (_, r) => r.da_nhap
      ? <Tag color="green" icon={<CheckCircleOutlined />}>Đã nhập{r.batch_no ? ` · ${r.batch_no}` : ''}</Tag>
      : r.ly_do_cho === 'cho_drc' ? <Tag color="orange">Chờ DRC</Tag>
      : r.ly_do_cho === 'loai_mu_la' ? <Tag color="red">Loại mủ lạ</Tag>
      : <Tag color="blue">Chờ nhập kho</Tag> },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Nhập kho từ phiếu cân</Title>
                <Text type="secondary">Phiếu cân vào đã hoàn tất từ ngày mở sổ {settings.ngay_mo_so ? settings.ngay_mo_so.split('-').reverse().join('/') : ''} · mỗi dòng lô trên phiếu = 1 lô · không nhập được khi thiếu DRC</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Tag color="blue">{tongCho.length} chờ · {fmtKg(tongUot)} kg ướt</Tag>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
            </Space>
          </Col>
        </Row>

        {error && <Alert type="error" showIcon message={error} />}
        {!canReceive && !rawRole.loading && (
          <Alert type="warning" showIcon message="Bạn không có quyền 'thủ kho nhận' — chỉ xem được hàng đợi." />
        )}
        {lastResult && (
          <Alert type="success" showIcon closable onClose={() => setLastResult(null)}
            message={`Phiếu ${lastResult.code}: đã tạo ${lastResult.batches.length} lô`}
            description={
              <Space direction="vertical" size={4}>
                {lastResult.batches.map((b) => (
                  <Space key={b.batch_id} size={8} wrap>
                    <a onClick={() => navigate(`/wms/nvl/lo/${b.batch_id}`)}><Text code>{b.batch_no}</Text></a>
                    <Text>{fmtKg(b.wet_kg)} kg ướt · {fmtPct(b.drc_pct)} · <b>{fmtKg(b.dry_kg)} kg khô</b></Text>
                    <Button size="small" icon={<PrinterOutlined />} onClick={() => navigate(`/wms/batch/${b.batch_id}/label`)}>In tem QR</Button>
                  </Space>
                ))}
              </Space>
            } />
        )}

        <Card size="small">
          <Row gutter={[12, 12]} align="bottom">
            <Col xs={24} md={8}><Input allowClear prefix={<SearchOutlined />} placeholder="Số phiếu, biển số, nhà cung cấp" value={search} onChange={(e) => setSearch(e.target.value)} /></Col>
            <Col xs={12} md={6}><FacilityPicker value={facilityId} onChange={setFacilityId} allowAll placeholder="Tất cả nhà máy" style={{ width: '100%' }} /></Col>
            <Col xs={12} md={6}>
              <Select<Filter> value={filter} onChange={setFilter} style={{ width: '100%' }}
                options={[{ value: 'cho_nhap', label: 'Chưa nhập kho' }, { value: 'da_nhap', label: 'Đã nhập' }, { value: 'tat_ca', label: 'Tất cả' }]} />
            </Col>
          </Row>
        </Card>

        <Row gutter={[12, 12]}>
          <Col xs={24} xl={selected ? 15 : 24}>
            <Card size="small" bodyStyle={{ padding: 0 }}>
              <Table<RawIntakeQueueRow> rowKey="ticket_id" columns={columns} dataSource={filtered} size="small" loading={loading}
                pagination={{ pageSize: 20, showSizeChanger: false }}
                onRow={(r) => ({ onClick: () => { setSelectedId(r.ticket_id); setNguonHang(undefined) }, style: { cursor: 'pointer', background: r.ticket_id === selectedId ? '#E8F5F0' : undefined } })}
                locale={{ emptyText: <Empty description="Không có phiếu nào" /> }} />
            </Card>
          </Col>
          {selected && (
            <Col xs={24} xl={9}>
              <Card size="small" title={<Space><Text code strong>{selected.code}</Text>{selected.da_nhap ? <Tag color="green">Đã nhập</Tag> : selected.san_sang ? <Tag color="blue">Chờ nhập kho</Tag> : <Tag color="orange">{selected.ly_do_cho === 'cho_drc' ? 'Chờ DRC' : 'Loại mủ lạ'}</Tag>}</Space>}
                extra={<Button type="link" size="small" onClick={() => navigate(`/wms/weighbridge/${selected.ticket_id}`)}>Mở phiếu cân</Button>}>
                <Descriptions size="small" column={1} colon={false} labelStyle={{ width: 130, color: '#6B7280' }}>
                  <Descriptions.Item label="Nhà cung cấp">{selected.supplier_name || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Xe · tài xế">{[selected.vehicle_plate, selected.driver_name].filter(Boolean).join(' · ') || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Cân ra">{fmtTime(selected.completed_at)} · {selected.facility_code || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Loại hàng">{selected.rubber_type_name || <Tag color="red">{selected.rubber_type_goc || 'trống'}</Tag>}{selected.so_dong_lo > 0 && ` · ${selected.so_dong_lo} dòng lô`}</Descriptions.Item>
                  <Descriptions.Item label="Thực nhận"><Text strong>{fmtKg(selected.so_dong_lo > 0 ? selected.wet_kg_dong : selected.net_weight)} kg ướt</Text></Descriptions.Item>
                  <Descriptions.Item label="DRC">
                    {fmtPct(selected.drc_dung)}
                    {selected.qc_actual_drc !== null ? <Text type="secondary"> · đo tại cân</Text> : selected.drc_dung !== null ? <Text type="secondary"> · mặc định của loại</Text> : <Text type="danger"> · chưa có, chờ lab</Text>}
                    {selected.expected_drc !== null && <div><Text type="secondary" style={{ fontSize: 12 }}>NCC khai báo {fmtPct(selected.expected_drc)}{selected.lech_drc_ncc !== null && selected.lech_drc_ncc > settings.nguong_lech_drc_ncc_diem && <Text type="warning"> · lệch {selected.lech_drc_ncc} điểm</Text>}</Text></div>}
                  </Descriptions.Item>
                  <Descriptions.Item label="Quy khô dự kiến"><Text strong style={{ color: '#1B4D3E' }}>{fmtKg(selected.dry_kg_du_kien)} kg</Text></Descriptions.Item>
                </Descriptions>

                {!selected.da_nhap && (
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Nguồn hàng của lô</Text>
                    <Select<RawLotSource> allowClear placeholder="Tự suy từ phiếu (đại lý / nông hộ / chuyển kho)" value={nguonHang} onChange={setNguonHang} style={{ width: '100%', marginTop: 4 }}
                      options={(Object.keys(RAW_LOT_SOURCE_LABELS) as RawLotSource[]).map((k) => ({ value: k, label: RAW_LOT_SOURCE_LABELS[k] }))} />
                    <div style={{ marginTop: 12 }}>
                      <Button type="primary" block size="large" icon={<CheckCircleOutlined />} disabled={!selected.san_sang || !canReceive} loading={submitting} onClick={handleNhapKho}>
                        {selected.san_sang ? 'Xác nhận nhập kho' : selected.ly_do_cho === 'cho_drc' ? 'Chờ DRC từ lab' : 'Loại mủ lạ, sửa phiếu cân trước'}
                      </Button>
                    </div>
                  </div>
                )}
                {selected.da_nhap && selected.batch_no && (
                  <div style={{ marginTop: 12 }}>
                    <Text>Lô: </Text><Text code>{selected.batch_no}</Text>
                  </div>
                )}
              </Card>
            </Col>
          )}
        </Row>
      </Space>
    </div>
  )
}
