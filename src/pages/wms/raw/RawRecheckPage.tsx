// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Cân lại / kiểm tra DRC định kỳ (GĐ2)
// File: src/pages/wms/raw/RawRecheckPage.tsx · Route: /wms/nvl/can-lai
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, ReloadOutlined, ExperimentOutlined, SearchOutlined } from '@ant-design/icons'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { rawStockService, type RawBatchBalance } from '../../../services/wms/rawStockService'
import { rawRecheckService, type DryVariance } from '../../../services/wms/rawRecheckService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'
import { fmtKg, fmtPct, fmtSigned, fmtDate } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { stdPagination, LimitNotice } from '../../../components/common/tableDefaults'

const { Title, Text } = Typography
/** Trần tải lô (rawStockService.getBatches limit) */
const LOAD_LIMIT = 1000

export default function RawRecheckPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawRole = useRawRole()
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilityInit, setFacilityInit] = useState(false)
  const [filter, setFilter] = useState<'due' | 'all'>('due')
  const [search, setSearch] = useState('')
  // Điều hướng từ chi tiết lô mang ?batch=<batch_id> — mở sẵn modal cân lại đúng lô
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(() => searchParams.get('batch'))
  const [batches, setBatches] = useState<RawBatchBalance[]>([])
  const [dueIds, setDueIds] = useState<Set<string>>(new Set())
  const [variance, setVariance] = useState<DryVariance[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<RawBatchBalance | null>(null)
  const [wet, setWet] = useState<number | null>(null)
  const [drc, setDrc] = useState<number | null>(null)
  const [lyDo, setLyDo] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD')
    // Có ?batch= thì giữ "Tất cả nhà máy" để chắc chắn tìm thấy lô, kể cả lô TL/Lào
    if (pd && !pendingBatchId) setFacilityId(pd.id)
    setFacilityInit(true)
  }, [facilities, facilityInit, pendingBatchId])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [all, due, v, s] = await Promise.all([
        rawStockService.getBatches({ facilityId, limit: LOAD_LIMIT }),
        rawRecheckService.listDue(facilityId),
        rawRecheckService.listVariance(facilityId),
        rawSettingsService.getForFacility(facilityId ?? null),
      ])
      setBatches(all); setDueIds(new Set(due.map((d) => d.batch_id))); setVariance(v); setSettings(s)
    } catch (e: any) { setError(dichLoiHeThong(e, 'Không tải được danh sách lô')) }
    finally { setLoading(false) }
  }, [facilityId])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const list = filter === 'due' ? batches.filter((b) => dueIds.has(b.batch_id)) : batches
    const s = search.trim().toLowerCase()
    const matched = s ? list.filter((b) => [b.batch_no, b.supplier_name].some((v) => (v || '').toLowerCase().includes(s))) : list
    return [...matched].sort((a, b) => b.ngay_tu_lan_do - a.ngay_tu_lan_do)
  }, [batches, dueIds, filter, search])

  const canWrite = rawRole.isKeeper || rawRole.isQC || rawRole.isBGD
  const preview = target && wet !== null ? rawRecheckService.preview(target, wet, drc, settings.nguong_lech_kho_pct) : null

  const openModal = (b: RawBatchBalance) => { setTarget(b); setWet(b.wet_kg); setDrc(null); setLyDo(''); setNote('') }

  // Từ chi tiết lô bấm "Cân lại": dữ liệu về là mở thẳng modal, khỏi dò tay trong bảng
  useEffect(() => {
    if (!pendingBatchId || loading) return
    if (error) return // tải lỗi thì giữ lại, "Làm mới" thành công sẽ mở
    const b = batches.find((x) => x.batch_id === pendingBatchId)
    if (b) openModal(b)
    else message.warning('Không tìm thấy lô cần cân lại trong danh sách lô còn hàng')
    setPendingBatchId(null)
    setSearchParams({}, { replace: true })
  }, [pendingBatchId, loading, error, batches])

  const submit = async () => {
    if (!target || wet === null) return
    if (preview?.vuotNguong && !lyDo.trim()) { message.warning('Lệch khô vượt ngưỡng, phải ghi lý do'); return }
    setSaving(true)
    try {
      const r = await rawRecheckService.canLai(target.batch_id, wet, drc, lyDo.trim() || null, note.trim() || null)
      message.success(`${r.batch_no}: khô ${fmtKg(r.kho_truoc)} → ${fmtKg(r.kho_sau)} kg (${fmtSigned(r.lech_kho_pct ?? 0, 2)} %)`)
      setTarget(null); await load()
    } catch (e: any) { message.error(dichLoiHeThong(e, 'Không ghi được')) }
    finally { setSaving(false) }
  }

  const columns: ColumnsType<RawBatchBalance> = [
    { title: 'Lô', dataIndex: 'batch_no', key: 'batch_no', render: (v, r) => <a onClick={() => navigate(`/wms/nvl/lo/${r.batch_id}`)}><Text code>{v}</Text></a> },
    { title: 'Loại', dataIndex: 'rubber_type_name', key: 'rubber_type_name' },
    { title: 'Tuổi', dataIndex: 'tuoi_ngay', key: 'tuoi_ngay', align: 'right', render: (v) => `${v} ng` },
    { title: 'Từ lần đo', dataIndex: 'ngay_tu_lan_do', key: 'ngay_tu_lan_do', align: 'right', render: (v) => <Text strong type={v >= settings.chu_ky_can_lai_ngay ? 'danger' : undefined}>{v} ng</Text> },
    { title: 'Ướt (kg)', dataIndex: 'wet_kg', key: 'wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'DRC', dataIndex: 'drc_pct', key: 'drc_pct', align: 'right', render: (v, r) => <span>{fmtPct(v)}{r.ton_dau_uoc && <Tag color="gold" style={{ marginLeft: 6 }}>ước</Tag>}</span> },
    { title: 'Khô (kg)', dataIndex: 'dry_kg', key: 'dry_kg', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
    { title: '', key: 'x', render: (_, r) => <Button size="small" type="primary" icon={<ExperimentOutlined />} disabled={!canWrite} onClick={() => openModal(r)}>Cân lại</Button> },
  ]

  const varColumns: ColumnsType<DryVariance> = [
    { title: 'Ngày', dataIndex: 'txn_date', key: 'txn_date', render: (v) => fmtDate(v) },
    { title: 'Lô', dataIndex: 'batch_no', key: 'batch_no', render: (v, r) => <a onClick={() => navigate(`/wms/nvl/lo/${r.batch_id}`)}><Text code>{v}</Text></a> },
    { title: 'Chênh ướt', dataIndex: 'chenh_uot_kg', key: 'chenh_uot_kg', align: 'right', render: (v) => fmtSigned(v) },
    { title: 'Chênh khô', dataIndex: 'chenh_kho_kg', key: 'chenh_kho_kg', align: 'right', render: (v) => <Text strong type="danger">{fmtSigned(v)}</Text> },
    { title: 'Lệch khô', dataIndex: 'lech_kho_pct', key: 'lech_kho_pct', align: 'right', render: (v) => <Text strong type="danger">{fmtSigned(v, 2)} %</Text> },
    { title: 'Lý do', dataIndex: 'ly_do', key: 'ly_do', render: (v) => v || <Tag color="red">Chưa ghi</Tag> },
    { title: 'Người ghi', dataIndex: 'nguoi_ghi', key: 'nguoi_ghi' },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Cân lại &amp; kiểm tra DRC</Title>
                <Text type="secondary">Chu kỳ {settings.chu_ky_can_lai_ngay} ngày · trước khi xuất nếu quá {settings.can_lai_truoc_xuat_ngay} ngày · lệch khô quá {settings.nguong_lech_kho_pct} % phải ghi lý do</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Input allowClear prefix={<SearchOutlined />} placeholder="Mã lô, nhà cung cấp" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 210 }} />
              <FacilityPicker value={facilityId} onChange={setFacilityId} allowAll placeholder="Tất cả nhà máy" style={{ minWidth: 180 }} />
              <Select value={filter} onChange={setFilter} style={{ minWidth: 160 }} options={[{ value: 'due', label: `Đến hạn (${dueIds.size})` }, { value: 'all', label: 'Mọi lô còn hàng' }]} />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
            </Space>
          </Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} />}
        {!canWrite && !rawRole.loading && <Alert type="warning" showIcon message="Chỉ thủ kho NVL, QC hoặc BGĐ mới ghi cân lại." />}

        <Card size="small" bodyStyle={{ padding: 0 }}>
          {!loading && !error && <div style={{ padding: '0 8px' }}><LimitNotice shown={batches.length} limit={LOAD_LIMIT} what="lô" /></div>}
          <Table<RawBatchBalance> rowKey="batch_id" columns={columns} dataSource={rows} size="small" loading={loading} pagination={stdPagination(20)}
            locale={{ emptyText: error ? 'Không tải được — xem lỗi phía trên' : filter === 'due' ? 'Không có lô đến hạn' : 'Không có lô' }} />
        </Card>

        <Card size="small" title={<Space>Lô lệch khô quá ngưỡng · 90 ngày<Tag color={variance.length ? 'red' : 'default'}>{variance.length}</Tag></Space>}>
          <Table<DryVariance> rowKey="ledger_id" columns={varColumns} dataSource={variance} size="small" pagination={false} locale={{ emptyText: 'Chưa có lô nào lệch quá ngưỡng' }} />
        </Card>

        <Modal open={!!target} title={target ? `Cân lại lô ${target.batch_no}` : ''} onCancel={() => setTarget(null)} onOk={submit} okText="Ghi vào sổ" cancelText="Hủy" confirmLoading={saving}
          okButtonProps={{ disabled: wet === null || (preview?.vuotNguong && !lyDo.trim()) }}>
          {target && (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Text type="secondary">Hiện tại: {fmtKg(target.wet_kg)} kg ướt · DRC {fmtPct(target.drc_pct)} · {fmtKg(target.dry_kg)} kg khô · {target.rubber_type_name}</Text>
              <div><Text>Kg ướt cân lại</Text><InputNumber value={wet} min={0} step={10} onChange={(v) => setWet(v === null || v === undefined ? null : Number(v))} style={{ width: '100%' }} /></div>
              <div><Text>DRC mới (%) · để trống nếu không lấy mẫu</Text><InputNumber value={drc} min={1} max={100} step={0.1} onChange={(v) => setDrc(v === null || v === undefined ? null : Number(v))} style={{ width: '100%' }} placeholder={target.ton_dau_uoc ? 'Lô tồn đầu ước — nên đo' : String(target.drc_pct ?? '')} /></div>
              {preview && (
                <Alert type={preview.vuotNguong ? 'error' : 'success'} showIcon
                  message={`Khô ${fmtKg(target.dry_kg)} → ${fmtKg(preview.khoSau)} kg (${fmtSigned(preview.lechPct ?? 0, 2)} %)`}
                  description={`Ướt ${fmtSigned(preview.chenhUot)} kg (${fmtSigned(preview.chenhUotPct ?? 0, 1)} %) · ${preview.vuotNguong ? `vượt ngưỡng ${settings.nguong_lech_kho_pct} %, phải ghi lý do` : 'trong ngưỡng, hao ướt là khô tự nhiên'}`} />
              )}
              {preview?.vuotNguong && <div><Text>Lý do lệch khô</Text><Select style={{ width: '100%' }} value={lyDo || undefined} onChange={setLyDo} options={['Tạp chất / đất lẫn', 'Mẫu DRC đầu vào không đại diện', 'Cân sai lúc nhập', 'Lô chồng lẫn, cân lẫn lô', 'Mất mát / thất thoát', 'Khác'].map((v) => ({ value: v, label: v }))} /></div>}
              <div><Text>Ghi chú</Text><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mẫu số, người đo…" /></div>
            </Space>
          )}
        </Modal>
      </Space>
    </div>
  )
}
