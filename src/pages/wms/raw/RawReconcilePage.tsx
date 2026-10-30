// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Đối chiếu giấy – máy (GĐ5, chạy song song)
// File: src/pages/wms/raw/RawReconcilePage.tsx · Route: /wms/nvl/doi-chieu
// Thủ kho gõ tồn ƯỚT sổ giấy từng loại mủ của ngày X; máy ghép với tồn sổ máy đến ngày X.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Input, InputNumber, Popconfirm, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { rawReconcileService, type RawReconcileRow, type RawTonDenNgay, type RawTypeLite } from '../../../services/wms/rawReconcileService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtSigned = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + fmtKg(n, d))
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

interface EntryRow {
  rubber_type: string
  rubber_type_name: string
  so_lo: number
  may_wet_kg: number
  may_dry_kg: number
  may_drc_pct: number | null
  giay_wet: number | null
  giay_dry: number | null
  ly_do: string
  note: string
  saved_id: string | null
}

export default function RawReconcilePage() {
  const navigate = useNavigate()
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilityInit, setFacilityInit] = useState(false)
  const rawRole = useRawRole(facilityId ?? null)
  const [date, setDate] = useState(todayLocal())
  const [rows, setRows] = useState<EntryRow[]>([])
  const [history, setHistory] = useState<RawReconcileRow[]>([])
  const [types, setTypes] = useState<RawTypeLite[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [addType, setAddType] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD')
    setFacilityId((pd ?? facilities[0]).id); setFacilityInit(true)
  }, [facilities, facilityInit])

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setError(null)
    try {
      const from = new Date(); from.setDate(from.getDate() - 60)
      const [may, hist, s, t] = await Promise.all([
        rawReconcileService.tonDenNgay(facilityId, date),
        rawReconcileService.list(facilityId, { from: from.toISOString().slice(0, 10) }),
        rawSettingsService.getForFacility(facilityId),
        types.length ? Promise.resolve(types) : rawReconcileService.listTypes(),
      ])
      const saved = hist.filter((h) => h.ngay === date)
      const byType = new Map<string, RawTonDenNgay>(may.map((m) => [m.rubber_type, m]))
      for (const h of saved) if (!byType.has(h.rubber_type)) byType.set(h.rubber_type, { rubber_type: h.rubber_type, rubber_type_name: h.rubber_type_name, so_lo: 0, wet_kg: h.may_wet_kg ?? 0, dry_kg: h.may_dry_kg ?? 0, drc_pct: h.may_drc_pct })
      setRows([...byType.values()].sort((a, b) => a.rubber_type_name.localeCompare(b.rubber_type_name)).map((m) => {
        const h = saved.find((x) => x.rubber_type === m.rubber_type)
        return { rubber_type: m.rubber_type, rubber_type_name: m.rubber_type_name, so_lo: m.so_lo, may_wet_kg: m.wet_kg, may_dry_kg: m.dry_kg, may_drc_pct: m.drc_pct, giay_wet: h?.giay_wet_kg ?? null, giay_dry: h?.giay_dry_kg ?? null, ly_do: h?.ly_do ?? '', note: h?.note ?? '', saved_id: h?.id ?? null }
      }))
      setHistory(hist); setSettings(s); setTypes(t)
    } catch (e: any) { setError(e?.message || 'Không tải được đối chiếu') }
    finally { setLoading(false) }
  }, [facilityId, date]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const canWrite = rawRole.isKeeper || rawRole.isQC || rawRole.isBGD
  const nguong = settings.nguong_lech_kho_pct
  const lech = (r: EntryRow) => (r.giay_wet === null ? null : r.giay_wet - r.may_wet_kg)
  const lechPct = (r: EntryRow) => (r.giay_wet === null ? null : r.may_wet_kg > 0 ? (100 * (r.giay_wet - r.may_wet_kg)) / r.may_wet_kg : r.giay_wet > 0 ? 100 : 0)
  const vuot = (r: EntryRow) => { const p = lechPct(r); return p !== null && Math.abs(p) > nguong }

  const up = (code: string, patch: Partial<EntryRow>) => setRows((rs) => rs.map((r) => (r.rubber_type === code ? { ...r, ...patch } : r)))

  const save = async (r: EntryRow) => {
    if (!facilityId || r.giay_wet === null) { message.warning('Nhập tồn ướt sổ giấy'); return }
    if (vuot(r) && !r.ly_do.trim()) { message.warning(`Lệch quá ${nguong} %, phải ghi lý do`); return }
    setSaving(r.rubber_type)
    try {
      await rawReconcileService.ghi({ facilityId, ngay: date, rubberType: r.rubber_type, giayWetKg: r.giay_wet, giayDryKg: r.giay_dry, lyDo: r.ly_do.trim() || null, note: r.note.trim() || null })
      message.success(`Đã ghi đối chiếu ${r.rubber_type_name}`); await load()
    } catch (e: any) { message.error(e?.message || 'Không ghi được') }
    finally { setSaving(null) }
  }

  const saveAll = async () => {
    const todo = rows.filter((r) => r.giay_wet !== null)
    if (!todo.length) { message.warning('Chưa nhập số giấy nào'); return }
    const thieu = todo.find((r) => vuot(r) && !r.ly_do.trim())
    if (thieu) { message.warning(`${thieu.rubber_type_name}: lệch quá ${nguong} %, phải ghi lý do`); return }
    setSaving('*')
    try {
      for (const r of todo) await rawReconcileService.ghi({ facilityId: facilityId!, ngay: date, rubberType: r.rubber_type, giayWetKg: r.giay_wet!, giayDryKg: r.giay_dry, lyDo: r.ly_do.trim() || null, note: r.note.trim() || null })
      message.success(`Đã ghi ${todo.length} dòng đối chiếu ngày ${new Date(date).toLocaleDateString('vi-VN')}`); await load()
    } catch (e: any) { message.error(e?.message || 'Không ghi được') }
    finally { setSaving(null) }
  }

  const addRow = () => {
    const t = types.find((x) => x.code === addType)
    if (!t || rows.some((r) => r.rubber_type === t.code)) return
    setRows((rs) => [...rs, { rubber_type: t.code, rubber_type_name: t.name, so_lo: 0, may_wet_kg: 0, may_dry_kg: 0, may_drc_pct: null, giay_wet: null, giay_dry: null, ly_do: '', note: '', saved_id: null }])
    setAddType(undefined)
  }

  const exportCsv = () => {
    const blob = new Blob([rawReconcileService.toCsv(history)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `doi_chieu_nvl_${date}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const stats = useMemo(() => {
    const days = new Set(history.map((h) => h.ngay)).size
    const over = history.filter((h) => h.vuot_nguong).length
    const last = history[0]?.ngay
    return { days, over, last }
  }, [history])

  const columns: ColumnsType<EntryRow> = [
    { title: 'Loại mủ', dataIndex: 'rubber_type_name', key: 'rubber_type_name', render: (v, r) => <span><Text strong>{v}</Text> <Text type="secondary">({r.rubber_type}) · {r.so_lo} lô</Text>{r.saved_id && <Tag color="green" style={{ marginLeft: 6 }}>đã ghi</Tag>}</span> },
    { title: 'Máy · ướt (kg)', dataIndex: 'may_wet_kg', key: 'may_wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Máy · khô (kg)', dataIndex: 'may_dry_kg', key: 'may_dry_kg', align: 'right', render: (v, r) => <span>{fmtKg(v)} <Text type="secondary">({r.may_drc_pct ?? '—'} %)</Text></span> },
    { title: 'Giấy · ướt (kg) *', key: 'giay_wet', width: 150, render: (_, r) => <InputNumber style={{ width: '100%' }} min={0} step={10} value={r.giay_wet} disabled={!canWrite} onChange={(v) => up(r.rubber_type, { giay_wet: v === null || v === undefined ? null : Number(v) })} /> },
    { title: 'Giấy · khô (kg)', key: 'giay_dry', width: 140, render: (_, r) => <InputNumber style={{ width: '100%' }} min={0} step={10} value={r.giay_dry} disabled={!canWrite} placeholder="nếu giấy có" onChange={(v) => up(r.rubber_type, { giay_dry: v === null || v === undefined ? null : Number(v) })} /> },
    { title: 'Lệch (giấy − máy)', key: 'lech', align: 'right', render: (_, r) => { const l = lech(r); const p = lechPct(r); if (l === null) return '—'; const bad = vuot(r); return <Text strong type={bad ? 'danger' : 'success'}>{fmtSigned(l)} kg ({fmtSigned(p, 2)} %)</Text> } },
    { title: 'Lý do (nếu lệch)', key: 'ly_do', width: 200, render: (_, r) => <Select style={{ width: '100%' }} allowClear value={r.ly_do || undefined} disabled={!canWrite} status={vuot(r) && !r.ly_do ? 'error' : undefined} onChange={(v) => up(r.rubber_type, { ly_do: v ?? '' })} options={['Giấy chưa ghi phiếu cân mới', 'Máy chưa nhập phiếu cân', 'Lô chưa cân lại (hao ướt)', 'Xuất SX chưa ký đủ', 'Ghi nhầm / cộng sai trên giấy', 'Tồn đầu ước', 'Khác'].map((v) => ({ value: v, label: v }))} /> },
    { title: 'Ghi chú', key: 'note', width: 160, render: (_, r) => <Input value={r.note} disabled={!canWrite} onChange={(e) => up(r.rubber_type, { note: e.target.value })} /> },
    { title: '', key: 'x', width: 70, render: (_, r) => <Button size="small" type="primary" icon={<SaveOutlined />} disabled={!canWrite || r.giay_wet === null} loading={saving === r.rubber_type} onClick={() => save(r)} /> },
  ]

  const histCols: ColumnsType<RawReconcileRow> = [
    { title: 'Ngày', dataIndex: 'ngay', key: 'ngay', render: (v) => new Date(v).toLocaleDateString('vi-VN') },
    { title: 'Loại mủ', dataIndex: 'rubber_type_name', key: 'rubber_type_name' },
    { title: 'Giấy ướt', dataIndex: 'giay_wet_kg', key: 'giay_wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Máy ướt', dataIndex: 'may_wet_kg', key: 'may_wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Lệch', key: 'lech', align: 'right', render: (_, r) => <Text strong type={r.vuot_nguong ? 'danger' : 'success'}>{fmtSigned(r.lech_wet_kg)} kg ({fmtSigned(r.lech_wet_pct, 2)} %)</Text> },
    { title: 'Máy khô', dataIndex: 'may_dry_kg', key: 'may_dry_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Ngưỡng', dataIndex: 'nguong_pct', key: 'nguong_pct', align: 'right', render: (v, r) => (r.vuot_nguong ? <Tag color="red">vượt {v} %</Tag> : <Tag color="green">≤ {v} %</Tag>) },
    { title: 'Lý do', dataIndex: 'ly_do', key: 'ly_do', render: (v, r) => v || (r.vuot_nguong ? <Tag color="red">chưa ghi</Tag> : '—') },
    { title: 'Người ghi', dataIndex: 'nguoi_ghi', key: 'nguoi_ghi' },
    { title: '', key: 'x', render: (_, r) => <Popconfirm title="Xóa dòng đối chiếu này?" okText="Xóa" cancelText="Không" onConfirm={async () => { try { await rawReconcileService.xoa(r.id); message.success('Đã xóa'); load() } catch (e: any) { message.error(e?.message) } }}><Button size="small" danger icon={<DeleteOutlined />} disabled={!canWrite} /></Popconfirm> },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Đối chiếu giấy – máy</Title>
                <Text type="secondary">Chạy song song: cuối ngày ghi tồn ướt sổ giấy từng loại mủ, máy so với sổ máy đến ngày đó · lệch quá {nguong} % phải ghi lý do · không đụng sổ máy</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={(id) => setFacilityId(id)} allowAll={false} style={{ minWidth: 180 }} />
              <Input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value || todayLocal())} style={{ width: 150 }} />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!history.length}>CSV 60 ngày</Button>
            </Space>
          </Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} />}
        {!canWrite && !rawRole.loading && <Alert type="warning" showIcon message="Chỉ thủ kho NVL, QC hoặc BGĐ mới ghi đối chiếu." />}

        <Row gutter={[12, 12]}>
          <Col xs={8}><Card size="small"><Statistic title="Ngày đã đối chiếu (60 ngày)" value={stats.days} /></Card></Col>
          <Col xs={8}><Card size="small"><Statistic title="Dòng vượt ngưỡng" value={stats.over} valueStyle={{ color: stats.over ? '#C1291F' : '#1E7D3A' }} /></Card></Col>
          <Col xs={8}><Card size="small"><Statistic title="Lần gần nhất" value={stats.last ? new Date(stats.last).toLocaleDateString('vi-VN') : '—'} /></Card></Col>
        </Row>

        <Card size="small" title={<Space>Số sổ giấy ngày {new Date(date).toLocaleDateString('vi-VN')}<Text type="secondary">· máy: tồn đến hết ngày này</Text></Space>}
          extra={<Space><Select style={{ minWidth: 220 }} showSearch optionFilterProp="label" allowClear placeholder="Thêm loại giấy có, máy không" value={addType} onChange={setAddType} options={types.filter((t) => !rows.some((r) => r.rubber_type === t.code)).map((t) => ({ value: t.code, label: `${t.name} (${t.code})` }))} /><Button onClick={addRow} disabled={!addType}>Thêm dòng</Button><Button type="primary" icon={<SaveOutlined />} onClick={saveAll} loading={saving === '*'} disabled={!canWrite}>Lưu tất cả</Button></Space>}>
          <Table<EntryRow> rowKey="rubber_type" columns={columns} dataSource={rows} size="small" loading={loading} pagination={false} locale={{ emptyText: 'Sổ máy chưa có tồn đến ngày này. Nếu giấy có hàng, thêm loại ở trên.' }} />
        </Card>

        <Card size="small" bodyStyle={{ padding: 0 }} title="Lịch sử đối chiếu · 60 ngày">
          <Table<RawReconcileRow> rowKey="id" columns={histCols} dataSource={history} size="small" pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: 'Chưa đối chiếu lần nào' }} />
        </Card>
      </Space>
    </div>
  )
}
