// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Tổng quan (GĐ1)
// File: src/pages/wms/raw/RawOverviewPage.tsx
// Route: /wms/nvl
// Đọc: v_raw_stock_by_type, v_raw_alerts, v_raw_daily_flow, v_raw_stock_balance
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Row, Space, Spin, Statistic, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, PlusOutlined, WarningOutlined, RightOutlined } from '@ant-design/icons'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { rawStockService, type RawAlert, type RawBatchBalance, type RawDailyFlow, type RawStockByType } from '../../../services/wms/rawStockService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_RUBBER_GROUP_LABELS, RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography

const fmtKg = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const fmtT = (kg: number) => (kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' %')

const ALERT_COLOR: Record<RawAlert['muc'], string> = { cao: 'red', vua: 'orange', thap: 'default' }
const ALERT_LABEL: Record<RawAlert['loai'], string> = {
  qua_tuoi: 'Quá tuổi', cho_drc: 'Chờ DRC', loai_mu_la: 'Loại mủ lạ', lech_drc_ncc: 'DRC lệch NCC', ton_dau_uoc: 'Tồn đầu ước',
  den_han_can_lai: 'Đến hạn cân lại', lech_kho: 'Lệch khô',
}

export default function RawOverviewPage() {
  const navigate = useNavigate()
  const rawRole = useRawRole()
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilityInit, setFacilityInit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [byType, setByType] = useState<RawStockByType[]>([])
  const [alerts, setAlerts] = useState<RawAlert[]>([])
  const [flow, setFlow] = useState<RawDailyFlow[]>([])
  const [batches, setBatches] = useState<RawBatchBalance[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [stats, setStats] = useState<Awaited<ReturnType<typeof rawStockService.getOverviewStats>> | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [bt, al, fl, ba, st, se] = await Promise.all([
        rawStockService.getBalanceByType(facilityId),
        rawStockService.getAlerts(facilityId),
        rawStockService.getDailyFlow(facilityId, 14),
        rawStockService.getBatches({ facilityId, limit: 500 }),
        rawStockService.getOverviewStats(facilityId),
        rawSettingsService.getForFacility(facilityId ?? null),
      ])
      setByType(bt); setAlerts(al); setFlow(fl); setBatches(ba); setStats(st); setSettings(se)
    } catch (e: any) {
      setError(e?.message || 'Không tải được dữ liệu kho nguyên liệu')
    } finally { setLoading(false) }
  }, [facilityId])

  // Tập trung Phong Điền: mặc định chọn PD
  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD')
    if (pd) setFacilityId(pd.id)
    setFacilityInit(true)
  }, [facilities, facilityInit])

  useEffect(() => { load() }, [load])

  const needAction = useMemo(() => {
    const th = settings.tuoi_lo_canh_bao_ngay
    return batches
      .filter((b) => b.tuoi_ngay > th || b.ton_dau_uoc || b.qc_status === 'pending')
      .sort((a, b) => b.tuoi_ngay - a.tuoi_ngay)
      .slice(0, 10)
  }, [batches, settings])

  const maxFlow = Math.max(1, ...flow.map((f) => Math.max(f.nhap_kho_kg + f.mo_so_kho_kg, f.xuat_kho_kg)))

  const typeColumns: ColumnsType<RawStockByType> = [
    { title: 'Loại hàng', dataIndex: 'rubber_type_name', key: 'rubber_type_name',
      render: (v, r) => <Space size={6}><Text strong>{v}</Text><Tag>{RAW_RUBBER_GROUP_LABELS[r.nhom]}</Tag></Space> },
    { title: 'Lô', dataIndex: 'so_lo', key: 'so_lo', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Ướt (kg)', dataIndex: 'wet_kg', key: 'wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'DRC bq', dataIndex: 'drc_pct', key: 'drc_pct', align: 'right', render: (v) => fmtPct(v) },
    { title: 'Quy khô (kg)', dataIndex: 'dry_kg', key: 'dry_kg', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
    { title: 'Tuổi TB', dataIndex: 'tuoi_bq_ngay', key: 'tuoi_bq_ngay', align: 'right', render: (v) => (v === null ? '—' : `${fmtKg(v)} ng`) },
    { title: 'Quá tuổi', dataIndex: 'so_lo_qua_tuoi', key: 'so_lo_qua_tuoi', align: 'right',
      render: (v) => (v > 0 ? <Tag color="red">{v} lô</Tag> : <Text type="secondary">0</Text>) },
  ]

  const batchColumns: ColumnsType<RawBatchBalance> = [
    { title: 'Lô', dataIndex: 'batch_no', key: 'batch_no', render: (v, r) => <a onClick={() => navigate(`/wms/nvl/lo/${r.batch_id}`)}><Text code>{v}</Text></a> },
    { title: 'Loại', dataIndex: 'rubber_type_name', key: 'rubber_type_name' },
    { title: 'NCC', dataIndex: 'supplier_name', key: 'supplier_name', ellipsis: true, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Tuổi', dataIndex: 'tuoi_ngay', key: 'tuoi_ngay', align: 'right',
      render: (v) => <Text strong type={v > settings.tuoi_lo_canh_bao_ngay ? 'danger' : undefined}>{v} ng</Text> },
    { title: 'Ướt (kg)', dataIndex: 'wet_kg', key: 'wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'DRC', dataIndex: 'drc_pct', key: 'drc_pct', align: 'right', render: (v) => fmtPct(v) },
    { title: 'Khô (kg)', dataIndex: 'dry_kg', key: 'dry_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Trạng thái', key: 'tt', render: (_, r) => (
      <Space size={4} wrap>
        {r.tuoi_ngay > settings.tuoi_lo_canh_bao_ngay && <Tag color="red">Quá tuổi</Tag>}
        {r.ton_dau_uoc && <Tag color="gold">Tồn đầu ước</Tag>}
        {r.qc_status === 'pending' && <Tag color="orange">Chờ QC</Tag>}
      </Space>
    ) },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>Kho nguyên liệu mủ</Title>
            <Text type="secondary">
              Sổ kho khô · kg khô = kg ướt × DRC · mở sổ từ {settings.ngay_mo_so ? settings.ngay_mo_so.split('-').reverse().join('/') : '—'} · ngưỡng tuổi lô {settings.tuoi_lo_canh_bao_ngay} ngày, cân lại mỗi {settings.chu_ky_can_lai_ngay} ngày
              {!rawRole.perms.co_thu_kho && ' · chưa chỉ định thủ kho, bước "nhận" đang mở'}
            </Text>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={setFacilityId} allowAll placeholder="Tất cả nhà máy" style={{ minWidth: 200 }} />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              <Button onClick={() => navigate('/wms/nvl/ton-dau')}>Tồn đầu / mở sổ</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/wms/nvl/nhap')}>Nhập từ phiếu cân</Button>
            </Space>
          </Col>
        </Row>

        {error && <Alert type="error" showIcon message={error} description="Kiểm tra đã chạy migration wms_nvl_p1_* trong Supabase chưa." />}

        <Spin spinning={loading}>
          <Row gutter={[12, 12]}>
            <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Tồn quy khô" value={stats ? fmtT(stats.dry_kg) : '—'} suffix="tấn" valueStyle={{ fontSize: 22, fontWeight: 700, color: '#1B4D3E' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{stats ? `${fmtT(stats.wet_kg)} tấn ướt · ${stats.so_lo} lô` : ''}</Text></Card></Col>
            <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="DRC bình quân" value={stats?.drc_pct ?? '—'} suffix="%" valueStyle={{ fontSize: 22, fontWeight: 700 }} /></Card></Col>
            <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Tuổi tồn bình quân" value={stats?.tuoi_bq ?? '—'} suffix="ngày" valueStyle={{ fontSize: 22, fontWeight: 700 }} />
              <Text type={stats && stats.so_lo_qua_tuoi > 0 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{stats ? `${stats.so_lo_qua_tuoi} lô quá ${settings.tuoi_lo_canh_bao_ngay} ngày` : ''}</Text></Card></Col>
            <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Nhập hôm nay" value={stats ? fmtT(stats.nhap_hom_nay_kho_kg) : '—'} suffix="t khô" valueStyle={{ fontSize: 22, fontWeight: 700 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{stats ? `${stats.nhap_hom_nay_so_phieu} phiếu đã nhập` : ''}</Text></Card></Col>
            <Col xs={12} md={8} xl={4}><Card size="small" onClick={() => navigate('/wms/nvl/nhap')} style={{ cursor: 'pointer' }}><Statistic title="Chờ nhập kho" value={stats?.cho_nhap_so_phieu ?? '—'} suffix="phiếu" valueStyle={{ fontSize: 22, fontWeight: 700, color: '#2563EB' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>đã cân xong, có DRC</Text></Card></Col>
            <Col xs={12} md={8} xl={4}><Card size="small" onClick={() => navigate('/wms/nvl/nhap')} style={{ cursor: 'pointer' }}><Statistic title="Chờ DRC" value={stats?.cho_drc_so_phieu ?? '—'} suffix="phiếu" valueStyle={{ fontSize: 22, fontWeight: 700, color: stats && stats.cho_drc_so_phieu > 0 ? '#B45309' : undefined }} />
              <Text type="secondary" style={{ fontSize: 12 }}>chưa nhập kho được</Text></Card></Col>
          </Row>
        </Spin>

        <Row gutter={[12, 12]}>
          <Col xs={24} xl={16}>
            <Card size="small" title="Tồn kho theo loại hàng" extra={<Text type="secondary">chỉ lô còn hàng</Text>}>
              <Table<RawStockByType> rowKey={(r) => `${r.facility_id}|${r.rubber_type}`} columns={typeColumns} dataSource={byType} size="small" pagination={false} loading={loading}
                locale={{ emptyText: <Empty description="Chưa có lô nào trong sổ kho khô" /> }}
                summary={(rows) => {
                  const wet = rows.reduce((s, r) => s + r.wet_kg, 0), dry = rows.reduce((s, r) => s + r.dry_kg, 0)
                  return (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}><Text strong>Tổng</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right"><Text strong>{fmtKg(rows.reduce((s, r) => s + r.so_lo, 0))}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right"><Text strong>{fmtKg(wet)}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right"><Text strong>{wet > 0 ? fmtPct((100 * dry) / wet) : '—'}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right"><Text strong>{fmtKg(dry)}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={5} /><Table.Summary.Cell index={6} />
                    </Table.Summary.Row>
                  )
                }} />
            </Card>
          </Col>
          <Col xs={24} xl={8}>
            <Card size="small" title={<Space><WarningOutlined />Cảnh báo<Tag color={alerts.length ? 'red' : 'default'}>{alerts.length}</Tag></Space>}>
              {alerts.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có cảnh báo" /> : (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {alerts.slice(0, 12).map((a, i) => (
                    <div key={i} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 6 }}>
                      <Space size={6} align="start">
                        <Tag color={ALERT_COLOR[a.muc]}>{ALERT_LABEL[a.loai]}</Tag>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {a.loai === 'den_han_can_lai' ? <a onClick={() => navigate('/wms/nvl/can-lai')}>{a.tieu_de}</a>
                              : a.batch_id ? <a onClick={() => navigate(`/wms/nvl/lo/${a.batch_id}`)}>{a.tieu_de}</a>
                              : a.ticket_id ? <a onClick={() => navigate('/wms/nvl/nhap')}>{a.tieu_de}</a> : a.tieu_de}
                          </div>
                          {a.chi_tiet && <Text type="secondary" style={{ fontSize: 12 }}>{a.chi_tiet}</Text>}
                        </div>
                      </Space>
                    </div>
                  ))}
                  {alerts.length > 12 && <Text type="secondary">… và {alerts.length - 12} cảnh báo khác</Text>}
                </Space>
              )}
            </Card>
          </Col>
        </Row>

        <Card size="small" title="Nhập – xuất 14 ngày (kg khô)" extra={<Space size={12}><Tag color="#1B4D3E">Nhập</Tag><Tag color="#E8A838">Xuất</Tag></Space>}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 170, overflowX: 'auto', padding: '0 4px' }}>
            {flow.map((f) => {
              const inKg = f.nhap_kho_kg + f.mo_so_kho_kg
              return (
                <Tooltip key={f.txn_date} title={`${f.txn_date} · nhập ${fmtKg(inKg)} kg · xuất ${fmtKg(f.xuat_kho_kg)} kg`}>
                  <div style={{ flex: '1 1 0', minWidth: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
                      <div style={{ width: 12, height: Math.max(2, (inKg / maxFlow) * 140), background: '#1B4D3E', borderRadius: '3px 3px 0 0' }} />
                      <div style={{ width: 12, height: Math.max(2, (f.xuat_kho_kg / maxFlow) * 140), background: '#E8A838', borderRadius: '3px 3px 0 0' }} />
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{f.txn_date.slice(8, 10)}/{f.txn_date.slice(5, 7)}</Text>
                  </div>
                </Tooltip>
              )
            })}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>Cột xuất = lệnh xuất đã được thủ kho nhận (trừ sổ theo kg cân thực).</Text>
        </Card>

        <Card size="small" title="Lô cần xử lý" extra={<Button type="link" size="small" onClick={() => navigate('/wms/nvl/nhap')}>Hàng đợi nhập kho <RightOutlined /></Button>}>
          <Table<RawBatchBalance> rowKey="batch_id" columns={batchColumns} dataSource={needAction} size="small" pagination={false} loading={loading}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có lô quá tuổi, tồn đầu ước hay chờ QC" /> }} />
        </Card>
      </Space>
    </div>
  )
}
