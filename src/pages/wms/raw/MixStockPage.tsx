// ============================================================================
// HÀNG CHÈN — Kho chèn: tồn theo lô, nhập lô mới, sổ chuyển động (GĐ4)
// File: src/pages/wms/raw/MixStockPage.tsx · Route: /wms/chen/ton
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Checkbox, Col, Input, InputNumber, Modal, Row, Select, Space, Statistic, Switch, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { mixService, MIX_LOT_STATUS_COLORS, MIX_LOT_STATUS_LABELS, MIX_SOURCE_LABELS, type MixBalance, type MixLot, type MixMovement, type MixSourceType } from '../../../services/wms/mixService'
import { useRawRole } from '../../../hooks/useRawRole'
import { usePhoneRedirect } from '../../../hooks/useIsPhone'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const GRADES = ['SVR 3L', 'SVR 5', 'SVR 10', 'SVR 20', 'SVR CV50', 'SVR CV60', 'SVR L', 'RSS 3', 'SBR 1502', 'Khác']

interface NewLot {
  sourceType: MixSourceType; sourceDesc: string; grade: string | undefined; kgIn: number | null
  po: number | null; mooney: number | null; pri: number | null; qcAllowMixPct: number | null; qcAllowRerun: boolean; metalCleared: boolean
  receivedDate: string; note: string; soLo: string
}
const EMPTY: NewLot = { sourceType: 'loi', sourceDesc: '', grade: undefined, kgIn: null, po: null, mooney: null, pri: null, qcAllowMixPct: null, qcAllowRerun: true, metalCleared: false, receivedDate: todayLocal(), note: '', soLo: '' }

export default function MixStockPage() {
  const navigate = useNavigate()
  usePhoneRedirect('/m/kho/chen/kho')
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilityInit, setFacilityInit] = useState(false)
  const rawRole = useRawRole(facilityId ?? null)
  const [lots, setLots] = useState<MixLot[]>([])
  const [balance, setBalance] = useState<MixBalance | null>(null)
  const [moves, setMoves] = useState<MixMovement[]>([])
  const [includeDone, setIncludeDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewLot>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD')
    setFacilityId((pd ?? facilities[0]).id); setFacilityInit(true)
  }, [facilities, facilityInit])

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setError(null)
    try {
      const [l, b, m] = await Promise.all([mixService.listLots(facilityId, includeDone), mixService.balance(facilityId), mixService.movements(facilityId, 14)])
      setLots(l); setBalance(b); setMoves(m)
    } catch (e: any) { setError(e?.message || 'Không tải được kho chèn') }
    finally { setLoading(false) }
  }, [facilityId, includeDone])

  useEffect(() => { load() }, [load])

  const canWrite = rawRole.isKeeper || rawRole.isQC || rawRole.isBGD
  const facilityCode = useMemo(() => facilities?.find((f) => f.id === facilityId)?.code ?? '', [facilities, facilityId])

  const submit = async () => {
    if (!facilityId || !form.kgIn || form.kgIn <= 0) { message.warning('Nhập khối lượng (kg)'); return }
    if (!form.soLo.trim()) { message.warning('Nhập số lô của hàng chèn'); return }
    if (form.sourceType === 'dkl' && !form.metalCleared) { message.warning('Lô dính kim loại phải đánh dấu "đã xử lý kim loại" trước khi được lấy chèn — vẫn nhập được, nhưng chưa lấy được'); }
    setSaving(true)
    try {
      await mixService.createLot({
        facilityId, sourceType: form.sourceType, sourceDesc: form.sourceDesc.trim() || null, grade: form.grade ?? null, kgIn: form.kgIn,
        po: form.po, mooney: form.mooney, pri: form.pri, qcAllowMixPct: form.qcAllowMixPct, qcAllowRerun: form.qcAllowRerun, metalCleared: form.metalCleared,
        receivedDate: form.receivedDate || null, note: form.note.trim() || null, soLo: form.soLo.trim().toUpperCase(),
      })
      message.success('Đã nhập lô chèn'); setOpen(false); setForm({ ...EMPTY, receivedDate: todayLocal() }); await load()
    } catch (e: any) { message.error(e?.message || 'Không nhập được') }
    finally { setSaving(false) }
  }

  const columns: ColumnsType<MixLot> = [
    { title: 'Số lô', dataIndex: 'so_lo', key: 'so_lo', render: (v) => (v ? <Text strong>{v}</Text> : <Tag color="red">chưa có số lô</Tag>) },
    { title: 'Mã lô', dataIndex: 'code', key: 'code', render: (v, r) => <a onClick={() => navigate(`/wms/chen?lot=${r.id}`)}><Text code>{v}</Text></a> },
    { title: 'Nguồn', dataIndex: 'source_type', key: 'source_type', render: (v: MixSourceType, r) => <span><Tag>{MIX_SOURCE_LABELS[v]}</Tag>{r.source_type === 'dkl' && (r.metal_cleared ? <Tag color="green">đã xử lý KL</Tag> : <Tag color="red">chưa xử lý KL</Tag>)}</span> },
    { title: 'Mô tả', dataIndex: 'source_desc', key: 'source_desc', render: (v, r) => <span>{v || '—'}{r.grade && <Text type="secondary"> · {r.grade}</Text>}</span> },
    { title: 'Nhập', dataIndex: 'kg_in', key: 'kg_in', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Tiêu hao', dataIndex: 'kg_used', key: 'kg_used', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Ở dây chuyền', dataIndex: 'kg_at_line', key: 'kg_at_line', align: 'right', render: (v) => (v > 0 ? <Text type="warning">{fmtKg(v)}</Text> : '—') },
    { title: 'Tồn kho', dataIndex: 'ton_kg', key: 'ton_kg', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
    { title: 'Po / Mooney / PRI', key: 'idx', render: (_, r) => <Text type="secondary">{[r.po, r.mooney, r.pri].map((x) => (x === null ? '—' : x)).join(' / ')}</Text> },
    { title: 'QC cho phép', key: 'qc', render: (_, r) => <span>{r.qc_allow_mix_pct !== null ? `trộn ≤ ${r.qc_allow_mix_pct} %` : 'không giới hạn'}{!r.qc_allow_rerun && <Tag color="red" style={{ marginLeft: 6 }}>không chạy lại</Tag>}</span> },
    { title: 'Tuổi', dataIndex: 'tuoi_ngay', key: 'tuoi_ngay', align: 'right', render: (v) => `${v} ng` },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (v: MixLot['status']) => <Tag color={MIX_LOT_STATUS_COLORS[v]}>{MIX_LOT_STATUS_LABELS[v]}</Tag> },
  ]

  const moveCols: ColumnsType<MixMovement> = [
    { title: 'Thời điểm', dataIndex: 'thoi_diem', key: 'thoi_diem', render: (v) => new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) },
    { title: 'Loại', dataIndex: 'loai', key: 'loai', render: (v) => ({ nhap_lo: <Tag color="green">Nhập lô</Tag>, lay: <Tag color="blue">Lấy</Tag>, tra: <Tag color="gold">Trả</Tag> } as any)[v] },
    { title: 'Lô', dataIndex: 'lot_code', key: 'lot_code', render: (v) => <Text code>{v}</Text> },
    { title: 'Phiếu', dataIndex: 'issue_code', key: 'issue_code', render: (v, r) => (v ? <a onClick={() => navigate(`/wms/chen/phieu/${r.issue_id}`)}><Text code>{v}</Text></a> : '—') },
    { title: 'kg', dataIndex: 'kg', key: 'kg', align: 'right', render: (v: number) => <Text strong type={v < 0 ? 'danger' : 'success'}>{v > 0 ? '+' : ''}{fmtKg(v)}</Text> },
    { title: 'Mô tả', dataIndex: 'mo_ta', key: 'mo_ta' },
    { title: 'Người', dataIndex: 'nguoi', key: 'nguoi' },
  ]

  const up = (patch: Partial<NewLot>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/chen')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Kho hàng chèn</Title>
                <Text type="secondary">Tồn = nhập − tiêu hao − đang ở dây chuyền · tính bằng kg · chỉ đổi khi phiếu chèn đủ 3 chữ ký</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={(id) => setFacilityId(id)} allowAll={false} style={{ minWidth: 180 }} />
              <span><Switch checked={includeDone} onChange={setIncludeDone} size="small" /> <Text type="secondary">cả lô đã hết / hủy</Text></span>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              <Button type="primary" icon={<PlusOutlined />} disabled={!canWrite} onClick={() => setOpen(true)}>Nhập lô chèn</Button>
            </Space>
          </Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} />}
        {!canWrite && !rawRole.loading && <Alert type="warning" showIcon message="Chỉ thủ kho NVL, QC hoặc BGĐ mới nhập lô chèn." />}

        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Tại kho chèn (kg)" value={balance?.tai_kho_kg ?? 0} precision={0} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Đang ở dây chuyền (kg)" value={balance?.o_day_chuyen_kg ?? 0} precision={0} valueStyle={{ color: (balance?.o_day_chuyen_kg ?? 0) > 0 ? '#B7791F' : undefined }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Nhập trong tháng (kg)" value={balance?.nhap_thang_kg ?? 0} precision={0} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Lô còn hàng" value={balance?.so_lo ?? 0} suffix={<Text type="secondary" style={{ fontSize: 13 }}>· tiêu hao tổng {fmtKg(balance?.tieu_hao_tong_kg)} kg</Text>} /></Card></Col>
        </Row>

        <Card size="small" bodyStyle={{ padding: 0 }} title="Lô chèn">
          <Table<MixLot> rowKey="id" columns={columns} dataSource={lots} size="small" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: 'Chưa có lô chèn nào. Bấm "Nhập lô chèn" để nhập tồn.' }} />
        </Card>

        <Card size="small" bodyStyle={{ padding: 0 }} title="Sổ chuyển động kho chèn · 14 ngày">
          <Table<MixMovement> rowKey={(r) => `${r.loai}-${r.lot_id}-${r.issue_id ?? ''}-${r.thoi_diem}`} columns={moveCols} dataSource={moves} size="small" pagination={{ pageSize: 15, showSizeChanger: false }} locale={{ emptyText: 'Chưa có chuyển động' }} />
        </Card>

        <Modal open={open} title={`Nhập lô chèn · ${facilityCode}`} onCancel={() => setOpen(false)} onOk={submit} okText="Nhập kho chèn" cancelText="Hủy" confirmLoading={saving} width={640}>
          <Row gutter={[12, 10]}>
            <Col span={12}><Text>Nguồn hàng</Text><Select style={{ width: '100%' }} value={form.sourceType} onChange={(v) => up({ sourceType: v })} options={(Object.keys(MIX_SOURCE_LABELS) as MixSourceType[]).map((k) => ({ value: k, label: MIX_SOURCE_LABELS[k] }))} /></Col>
            <Col span={12}><Text>Grade</Text><Select style={{ width: '100%' }} allowClear showSearch value={form.grade} onChange={(v) => up({ grade: v })} options={GRADES.map((g) => ({ value: g, label: g }))} placeholder="SVR 3L…" /></Col>
            <Col span={24}><Text>Số lô *</Text><Input value={form.soLo} onChange={(e) => up({ soLo: e.target.value })} placeholder="Số lô trên bao / chứng từ (vd S2308AB, SBR 1502 lô 2408)" style={{ textTransform: 'uppercase', fontWeight: 600 }} /></Col>
            <Col span={24}><Text>Mô tả nguồn</Text><Input value={form.sourceDesc} onChange={(e) => up({ sourceDesc: e.target.value })} placeholder="Hàng lỗi Po thấp tổ Đen 27/10 · SVR 3L kho TP · Cty Đại Lộc…" /></Col>
            <Col span={8}><Text>Khối lượng (kg) *</Text><InputNumber style={{ width: '100%' }} min={1} step={10} value={form.kgIn} onChange={(v) => up({ kgIn: v === null || v === undefined ? null : Number(v) })} /></Col>
            <Col span={8}><Text>Ngày nhập</Text><Input type="date" value={form.receivedDate} onChange={(e) => up({ receivedDate: e.target.value })} /></Col>
            <Col span={8}><Text>Trộn tối đa (%)</Text><InputNumber style={{ width: '100%' }} min={0} max={100} value={form.qcAllowMixPct} onChange={(v) => up({ qcAllowMixPct: v === null || v === undefined ? null : Number(v) })} placeholder="để trống = không giới hạn" /></Col>
            <Col span={8}><Text>Po</Text><InputNumber style={{ width: '100%' }} value={form.po} onChange={(v) => up({ po: v === null || v === undefined ? null : Number(v) })} /></Col>
            <Col span={8}><Text>Mooney</Text><InputNumber style={{ width: '100%' }} value={form.mooney} onChange={(v) => up({ mooney: v === null || v === undefined ? null : Number(v) })} /></Col>
            <Col span={8}><Text>PRI</Text><InputNumber style={{ width: '100%' }} value={form.pri} onChange={(v) => up({ pri: v === null || v === undefined ? null : Number(v) })} /></Col>
            <Col span={12}><Checkbox checked={form.qcAllowRerun} onChange={(e) => up({ qcAllowRerun: e.target.checked })}>QC cho phép chạy lại</Checkbox></Col>
            <Col span={12}><Checkbox checked={form.metalCleared} onChange={(e) => up({ metalCleared: e.target.checked })}>Đã xử lý kim loại (bắt buộc với DKL)</Checkbox></Col>
            <Col span={24}><Text>Ghi chú</Text><Input value={form.note} onChange={(e) => up({ note: e.target.value })} /></Col>
          </Row>
        </Modal>
      </Space>
    </div>
  )
}
