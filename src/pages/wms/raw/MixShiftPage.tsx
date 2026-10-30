// ============================================================================
// HÀNG CHÈN — Phiếu chèn theo ca: lấy đầu ca / trả cuối ca / ký (GĐ4)
// File: src/pages/wms/raw/MixShiftPage.tsx · Route: /wms/chen
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DatabaseOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { mixService, MIX_ISSUE_STATUS_COLORS, MIX_ISSUE_STATUS_LABELS, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, type MixBalance, type MixIssue, type MixLot, type MixPurpose, type ShiftLite } from '../../../services/wms/mixService'
import { rawIssueService, type ProductionOrderLite } from '../../../services/wms/rawIssueService'
import { useRawRole } from '../../../hooks/useRawRole'
import { usePhoneRedirect } from '../../../hooks/useIsPhone'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const OPEN: MixIssue['status'][] = ['issued', 'returned', 'submitted', 'qc_confirmed']

export default function MixShiftPage() {
  const navigate = useNavigate()
  usePhoneRedirect('/m/kho/chen')
  const [sp] = useSearchParams()
  const lotFilter = sp.get('lot')
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilityInit, setFacilityInit] = useState(false)
  const rawRole = useRawRole(facilityId ?? null)
  const [date, setDate] = useState(todayLocal())
  const [openIssues, setOpenIssues] = useState<MixIssue[]>([])
  const [dayIssues, setDayIssues] = useState<MixIssue[]>([])
  const [lotIssues, setLotIssues] = useState<MixIssue[]>([])
  const [balance, setBalance] = useState<MixBalance | null>(null)
  const [lots, setLots] = useState<MixLot[]>([])
  const [shifts, setShifts] = useState<ShiftLite[]>([])
  const [pos, setPos] = useState<ProductionOrderLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({ lotId: undefined as string | undefined, kg: null as number | null, shiftId: undefined as string | undefined, team: '', purpose: 'chay_lai' as MixPurpose, targetIndex: '', targetValue: null as number | null, poId: undefined as string | undefined, note: '' })

  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((x) => x.code.toUpperCase() === 'PD')
    setFacilityId((pd ?? facilities[0]).id); setFacilityInit(true)
  }, [facilities, facilityInit])

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setError(null)
    try {
      const [o, d, b, l, s, li] = await Promise.all([
        mixService.listIssues({ facilityId, status: OPEN }),
        mixService.listIssues({ facilityId, date }),
        mixService.balance(facilityId),
        mixService.listLots(facilityId),
        shifts.length ? Promise.resolve(shifts) : mixService.listShifts(),
        lotFilter ? mixService.listIssues({ facilityId, lotId: lotFilter, limit: 100 }) : Promise.resolve([] as MixIssue[]),
      ])
      setOpenIssues(o); setDayIssues(d); setBalance(b); setLots(l); setShifts(s); setLotIssues(li)
    } catch (e: any) { setError(e?.message || 'Không tải được phiếu chèn') }
    finally { setLoading(false) }
  }, [facilityId, date, lotFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useEffect(() => { if (open && !pos.length) rawIssueService.listProductionOrders().then(setPos).catch(() => setPos([])) }, [open, pos.length])

  const canWrite = rawRole.isKeeper || rawRole.isQC || rawRole.isBGD || rawRole.perms.submit
  const tieuHaoNgay = useMemo(() => dayIssues.filter((i) => i.status === 'received').reduce((s, i) => s + (i.kg_used ?? 0), 0), [dayIssues])
  const choKyNgay = useMemo(() => dayIssues.filter((i) => ['returned', 'submitted', 'qc_confirmed'].includes(i.status)).reduce((s, i) => s + (i.kg_used ?? 0), 0), [dayIssues])
  const lotsCoHang = useMemo(() => lots.filter((l) => l.ton_kg > 0.005), [lots])
  const lotChon = lotsCoHang.find((l) => l.id === f.lotId)

  const submit = async () => {
    if (!f.lotId) { message.warning('Chọn lô chèn'); return }
    if (!f.kg || f.kg <= 0) { message.warning('Nhập kg lấy đầu ca'); return }
    if (lotChon && f.kg > lotChon.ton_kg + 0.01) { message.warning(`Lô chỉ còn ${fmtKg(lotChon.ton_kg)} kg`); return }
    setSaving(true)
    try {
      const id = await mixService.lay({ lotId: f.lotId, kg: f.kg, shiftDate: date, shiftId: f.shiftId ?? null, team: f.team.trim() || null, purpose: f.purpose, targetIndex: f.purpose === 'nang_chi_so' ? f.targetIndex.trim() || null : null, targetValue: f.purpose === 'nang_chi_so' ? f.targetValue : null, productionOrderId: f.poId ?? null, note: f.note.trim() || null })
      message.success('Đã ghi lấy đầu ca — chụp 2 ảnh ở trang phiếu'); setOpen(false)
      setF({ lotId: undefined, kg: null, shiftId: undefined, team: '', purpose: 'chay_lai', targetIndex: '', targetValue: null, poId: undefined, note: '' })
      navigate(`/wms/chen/phieu/${id}`)
    } catch (e: any) { message.error(e?.message || 'Không ghi được') }
    finally { setSaving(false) }
  }

  const columns: ColumnsType<MixIssue> = [
    { title: 'Phiếu', dataIndex: 'code', key: 'code', render: (v, r) => <a onClick={() => navigate(`/wms/chen/phieu/${r.id}`)}><Text code>{v}</Text></a> },
    { title: 'Ngày · ca', key: 'ca', render: (_, r) => <span>{new Date(r.shift_date).toLocaleDateString('vi-VN')}{r.shift_name ? ` · ${r.shift_name}` : ''}{r.team ? <Text type="secondary"> · {r.team}</Text> : null}</span> },
    { title: 'Lô chèn', key: 'lot', render: (_, r) => <span><Text code>{r.lot_code}</Text> <Text type="secondary">{MIX_SOURCE_LABELS[r.source_type]}{r.lot_grade ? ` · ${r.lot_grade}` : ''}</Text></span> },
    { title: 'Mục đích', dataIndex: 'purpose', key: 'purpose', render: (v: MixPurpose, r) => <span>{MIX_PURPOSE_LABELS[v]}{r.target_index ? <Text type="secondary"> · {r.target_index} {r.target_value ?? ''}</Text> : null}</span> },
    { title: 'Lấy', dataIndex: 'kg_out', key: 'kg_out', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Trả', dataIndex: 'kg_return', key: 'kg_return', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Tiêu hao', dataIndex: 'kg_used', key: 'kg_used', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
    { title: 'Ảnh', key: 'anh', render: (_, r) => <span><Tag color={r.so_anh_lay >= 2 ? 'green' : 'red'}>lấy {r.so_anh_lay}</Tag><Tag color={r.so_anh_tra >= 2 ? 'green' : r.kg_return === null ? 'default' : 'red'}>trả {r.so_anh_tra}</Tag></span> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (v: MixIssue['status'], r) => <span><Tag color={MIX_ISSUE_STATUS_COLORS[v]}>{MIX_ISSUE_STATUS_LABELS[v]}</Tag>{r.handover_to_next && <Tag color="purple">bàn giao</Tag>}</span> },
    { title: 'Người lấy', dataIndex: 'out_name', key: 'out_name' },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <div>
              <Title level={3} style={{ margin: 0 }}>Hàng chèn theo ca</Title>
              <Text type="secondary">Lấy đầu ca → trả cuối ca → ký 3 bước · tiêu hao = lấy − trả · mỗi lần lấy/trả 2 ảnh bắt buộc · dòng CHÈN sổ ca tự điền</Text>
            </div>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={(id) => setFacilityId(id)} allowAll={false} style={{ minWidth: 180 }} />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocal())} style={{ width: 150 }} />
              <Button icon={<DatabaseOutlined />} onClick={() => navigate('/wms/chen/ton')}>Kho chèn</Button>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              <Button type="primary" icon={<PlusOutlined />} disabled={!canWrite || !lotsCoHang.length} onClick={() => setOpen(true)}>Lấy đầu ca</Button>
            </Space>
          </Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} />}
        {!loading && !lotsCoHang.length && <Alert type="info" showIcon message="Kho chèn chưa có lô nào còn hàng." action={<Button size="small" onClick={() => navigate('/wms/chen/ton')}>Nhập lô chèn</Button>} />}

        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Tại kho chèn (kg)" value={balance?.tai_kho_kg ?? 0} precision={0} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Đang ở dây chuyền (kg)" value={balance?.o_day_chuyen_kg ?? 0} precision={0} valueStyle={{ color: (balance?.o_day_chuyen_kg ?? 0) > 0 ? '#B7791F' : undefined }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title={`Tiêu hao ${new Date(date).toLocaleDateString('vi-VN')} (kg)`} value={tieuHaoNgay} precision={0} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Chờ ký (kg)" value={choKyNgay} precision={0} valueStyle={{ color: choKyNgay > 0 ? '#B7791F' : undefined }} /></Card></Col>
        </Row>

        {lotFilter && (
          <Card size="small" bodyStyle={{ padding: 0 }} title={<Space>Phiếu của lô {lotIssues[0]?.lot_code ?? ''}<Button size="small" onClick={() => navigate('/wms/chen')}>Bỏ lọc</Button></Space>}>
            <Table<MixIssue> rowKey="id" columns={columns} dataSource={lotIssues} size="small" pagination={false} locale={{ emptyText: 'Lô chưa có phiếu' }} />
          </Card>
        )}

        <Card size="small" bodyStyle={{ padding: 0 }} title={<Space>Phiếu đang mở (chưa đủ 3 chữ ký)<Tag color={openIssues.length ? 'gold' : 'default'}>{openIssues.length}</Tag></Space>}>
          <Table<MixIssue> rowKey="id" columns={columns} dataSource={openIssues} size="small" loading={loading} pagination={false} locale={{ emptyText: 'Không có phiếu đang mở' }} />
        </Card>

        <Card size="small" bodyStyle={{ padding: 0 }} title={`Phiếu ngày ${new Date(date).toLocaleDateString('vi-VN')}`}>
          <Table<MixIssue> rowKey="id" columns={columns} dataSource={dayIssues} size="small" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: 'Ngày này chưa có phiếu chèn' }} />
        </Card>

        <Modal open={open} title="Lấy hàng chèn đầu ca" onCancel={() => setOpen(false)} onOk={submit} okText="Ghi lấy đầu ca" cancelText="Hủy" confirmLoading={saving} width={620}>
          <Row gutter={[12, 10]}>
            <Col span={24}><Text>Lô chèn *</Text>
              <Select style={{ width: '100%' }} showSearch optionFilterProp="label" value={f.lotId} onChange={(v) => setF((x) => ({ ...x, lotId: v }))}
                options={lotsCoHang.map((l) => ({ value: l.id, disabled: l.source_type === 'dkl' && !l.metal_cleared, label: `${l.code} · ${MIX_SOURCE_LABELS[l.source_type]}${l.grade ? ' · ' + l.grade : ''} · tồn ${fmtKg(l.ton_kg)} kg${l.source_type === 'dkl' && !l.metal_cleared ? ' · CHƯA XỬ LÝ KIM LOẠI' : ''}` }))} />
              {lotChon && <Text type="secondary">{lotChon.source_desc || ''} · Po {lotChon.po ?? '—'} · Mooney {lotChon.mooney ?? '—'} · PRI {lotChon.pri ?? '—'}{lotChon.qc_allow_mix_pct !== null ? ` · trộn ≤ ${lotChon.qc_allow_mix_pct} %` : ''}{!lotChon.qc_allow_rerun ? ' · KHÔNG chạy lại' : ''}</Text>}
            </Col>
            <Col span={8}><Text>Kg lấy *</Text><InputNumber style={{ width: '100%' }} min={1} step={10} max={lotChon?.ton_kg} value={f.kg} onChange={(v) => setF((x) => ({ ...x, kg: v === null || v === undefined ? null : Number(v) }))} /></Col>
            <Col span={8}><Text>Ca</Text><Select style={{ width: '100%' }} allowClear value={f.shiftId} onChange={(v) => setF((x) => ({ ...x, shiftId: v }))} options={shifts.map((s) => ({ value: s.id, label: s.name || s.code }))} placeholder="Ca sản xuất" /></Col>
            <Col span={8}><Text>Tổ</Text><Input value={f.team} onChange={(e) => setF((x) => ({ ...x, team: e.target.value }))} placeholder="Tổ Đen / Tổ Trắng…" /></Col>
            <Col span={8}><Text>Mục đích</Text><Select style={{ width: '100%' }} value={f.purpose} onChange={(v) => setF((x) => ({ ...x, purpose: v }))} options={(Object.keys(MIX_PURPOSE_LABELS) as MixPurpose[]).map((k) => ({ value: k, label: MIX_PURPOSE_LABELS[k] }))} /></Col>
            {f.purpose === 'nang_chi_so' && <>
              <Col span={8}><Text>Chỉ số</Text><Select style={{ width: '100%' }} value={f.targetIndex || undefined} onChange={(v) => setF((x) => ({ ...x, targetIndex: v }))} options={['Po', 'PRI', 'Mooney', 'Tạp chất', 'Khác'].map((v) => ({ value: v, label: v }))} /></Col>
              <Col span={8}><Text>Mục tiêu</Text><InputNumber style={{ width: '100%' }} value={f.targetValue} onChange={(v) => setF((x) => ({ ...x, targetValue: v === null || v === undefined ? null : Number(v) }))} /></Col>
            </>}
            <Col span={24}><Text>Lệnh sản xuất (tùy chọn)</Text><Select style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" value={f.poId} onChange={(v) => setF((x) => ({ ...x, poId: v }))} options={pos.map((p) => ({ value: p.id, label: `${p.code}${p.target_grade ? ' · ' + p.target_grade : ''}` }))} /></Col>
            <Col span={24}><Text>Ghi chú</Text><Input value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} /></Col>
          </Row>
        </Modal>
      </Space>
    </div>
  )
}
