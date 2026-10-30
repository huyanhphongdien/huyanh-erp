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
import { mixService, MIX_ISSUE_STATUS_COLORS, MIX_ISSUE_STATUS_LABELS, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS, type MixBalance, type MixIssue, type MixLot, type MixPurpose, type MixViTri, type ShiftLite } from '../../../services/wms/mixService'
import { rawIssueService, type ProductionOrderLite } from '../../../services/wms/rawIssueService'
import { rawLotService, RAW_LOT_TRANG_THAI_LABELS, type RawLotBalance, type RawLotChen } from '../../../services/wms/rawLotService'
import { useMixRole } from '../../../hooks/useMixRole'
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
  const mixRole = useMixRole(facilityId ?? null)
  const [date, setDate] = useState(todayLocal())
  const [openIssues, setOpenIssues] = useState<MixIssue[]>([])
  // theo mã hàng đang chạy (một mã chạy nhiều ngày → không xem theo ngày)
  const [maAll, setMaAll] = useState<RawLotBalance[]>([])
  const [chenAll, setChenAll] = useState<RawLotChen[]>([])
  const [maId, setMaId] = useState<string | undefined>(undefined)
  const [maIssues, setMaIssues] = useState<MixIssue[]>([])
  const [chuaMa, setChuaMa] = useState<MixIssue[]>([])
  const [lotIssues, setLotIssues] = useState<MixIssue[]>([])
  const [balance, setBalance] = useState<MixBalance | null>(null)
  const [lots, setLots] = useState<MixLot[]>([])
  const [shifts, setShifts] = useState<ShiftLite[]>([])
  const [pos, setPos] = useState<ProductionOrderLite[]>([])
  const [maList, setMaList] = useState<RawLotBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [chayBusy, setChayBusy] = useState(false)
  const [f, setF] = useState({ lotId: undefined as string | undefined, kg: null as number | null, shiftId: undefined as string | undefined, team: '', purpose: 'chay_lai' as MixPurpose, targetIndex: '', targetValue: null as number | null, poId: undefined as string | undefined, note: '', rawLotIds: [] as string[], soBanh: null as number | null, grossKg: null as number | null, palletKg: 15 as number | null, viTri: undefined as MixViTri | undefined })

  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((x) => x.code.toUpperCase() === 'PD')
    setFacilityId((pd ?? facilities[0]).id); setFacilityInit(true)
  }, [facilities, facilityInit])

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setError(null)
    try {
      const [o, b, l, s, li, ma, ch, cm] = await Promise.all([
        mixService.listIssues({ facilityId, status: OPEN }),
        mixService.balance(facilityId),
        mixService.listLots(facilityId),
        shifts.length ? Promise.resolve(shifts) : mixService.listShifts(),
        lotFilter ? mixService.listIssues({ facilityId, lotId: lotFilter, limit: 100 }) : Promise.resolve([] as MixIssue[]),
        rawLotService.list(facilityId, { includeClosed: true }).catch(() => [] as RawLotBalance[]),
        rawLotService.chen(facilityId, { all: true }).catch(() => [] as RawLotChen[]),
        mixService.listIssues({ facilityId, chuaMa: true, limit: 50 }).catch(() => [] as MixIssue[]),
      ])
      setOpenIssues(o); setBalance(b); setLots(l); setShifts(s); setLotIssues(li); setChenAll(ch); setChuaMa(cm)
      const rank: Record<string, number> = { dang_chay: 0, san_sang: 1, da_chay_xong: 2 }
      const sorted = [...ma].sort((x, y) => (rank[x.trang_thai] ?? 3) - (rank[y.trang_thai] ?? 3) || (y.ngay_cuoi ?? '').localeCompare(x.ngay_cuoi ?? ''))
      setMaAll(sorted)
      setMaId((cur) => cur && sorted.some((x) => x.raw_lot_id === cur) ? cur : (sorted.find((x) => x.trang_thai === 'dang_chay') ?? sorted.find((x) => (ch.find((c) => c.raw_lot_id === x.raw_lot_id)?.chen_kg ?? 0) > 0) ?? sorted[0])?.raw_lot_id)
    } catch (e: any) { setError(e?.message || 'Không tải được phiếu chèn') }
    finally { setLoading(false) }
  }, [facilityId, lotFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!facilityId || !maId) { setMaIssues([]); return }
    let alive = true
    mixService.listIssues({ facilityId, rawLotId: maId, limit: 300 }).then((r) => { if (alive) setMaIssues(r.filter((i) => i.status !== 'cancelled')) }).catch(() => { if (alive) setMaIssues([]) })
    return () => { alive = false }
  }, [facilityId, maId, openIssues])
  useEffect(() => { if (open && !pos.length) rawIssueService.listProductionOrders().then(setPos).catch(() => setPos([])) }, [open, pos.length])
  useEffect(() => { if (open && facilityId) rawLotService.maDangChay(facilityId).then(setMaList).catch(() => setMaList([])) }, [open, facilityId])

  const canWrite = mixRole.khaiBao
  const choKyKg = useMemo(() => openIssues.filter((i) => ['returned', 'submitted', 'qc_confirmed'].includes(i.status)).reduce((s, i) => s + (i.kg_used ?? 0), 0), [openIssues])
  const maChon = maAll.find((x) => x.raw_lot_id === maId)
  const chenMa = chenAll.find((x) => x.raw_lot_id === maId)
  // phiếu của mã: xếp theo ngày · ca, đánh số lần L1, L2… trong từng ca
  // phiếu của mã: xếp theo thời gian, đánh số lần L1, L2… trong từng ca, cộng dồn tiêu hao (lũy kế) qua các lần chèn
  const maRows = useMemo(() => {
    const asc = [...maIssues].sort((a, b) => a.shift_date.localeCompare(b.shift_date) || (a.shift_id ?? '').localeCompare(b.shift_id ?? '') || a.out_at.localeCompare(b.out_at))
    const dem = new Map<string, number>(); let luyKe = 0
    const rows = asc.map((i) => { const k = `${i.shift_date}|${i.shift_id ?? ''}`; const n = (dem.get(k) ?? 0) + 1; dem.set(k, n); luyKe += i.kg_used ?? 0; return { ...i, lan: n, luyKe } })
    return rows.reverse()   // mới nhất trên cùng, lũy kế vẫn tính theo thời gian
  }, [maIssues])
  const tongMa = useMemo(() => {
    const s = { lan: maIssues.length, lay: 0, tra: 0, tieuHao: 0, daNhan: 0, choKy: 0, dayChuyen: 0, be: 0, mix: 0, banh: 0, ca: new Set<string>() }
    for (const i of maIssues) {
      s.lay += i.kg_out; s.tra += i.kg_return ?? 0; s.tieuHao += i.kg_used ?? 0; s.banh += i.so_banh ?? 0; s.ca.add(`${i.shift_date}|${i.shift_id ?? ''}`)
      if (i.status === 'received') s.daNhan += i.kg_used ?? 0
      else if (i.status === 'issued') s.dayChuyen += i.kg_out
      else s.choKy += i.kg_used ?? 0
      if (i.vi_tri === 'be_slap') s.be += i.kg_used ?? 0
      if (i.vi_tri === 'may_mix') s.mix += i.kg_used ?? 0
    }
    return s
  }, [maIssues])
  const tieuHaoMa = tongMa.daNhan
  const lotsCoHang = useMemo(() => lots.filter((l) => l.ton_kg > 0.005), [lots])
  const lotChon = lotsCoHang.find((l) => l.id === f.lotId)
  // kg hàng chèn: gõ thẳng, hoặc = hàng + pallet − bì (như sổ tay tổ ép)
  const kgNet = f.kg ?? f.grossKg   // cân tổng; bì khai lúc trả
  // khai / kết thúc mã đang chạy ngay trên máy tính (sổ mã đang chạy, SQL p10)
  const doiChay = async (batDau: boolean) => {
    if (!maChon) return
    setChayBusy(true)
    try {
      if (batDau) { const r = await rawLotService.batDauChay(maChon.raw_lot_id); message.success(r.da_chay ? `${r.ma} đã đang chạy` : `Đã khai ${r.ma} đang chạy — phiếu ca, phiếu chèn, lô TP từ giờ tự theo mã này`) }
      else { await rawLotService.ketThucChay(maChon.raw_lot_id); message.success(`${maChon.ma} đã kết thúc chạy`) }
      await load()
    } catch (e: any) { message.error(e?.message || 'Không khai được (cần chạy SQL p10)') }
    finally { setChayBusy(false) }
  }

  const submit = async () => {
    if (!f.lotId) { message.warning('Chọn lô chèn'); return }
    if (!f.viTri) { message.warning('Chọn chèn bể Slap hay chèn máy Mix'); return }
    if (!kgNet || kgNet <= 0) { message.warning('Nhập kg hàng chèn (hoặc cân cả pallet và bì)'); return }
    if (lotChon && kgNet > lotChon.ton_kg + 0.01) { message.warning(`Lô chỉ còn ${fmtKg(lotChon.ton_kg)} kg`); return }
    setSaving(true)
    try {
      const id = await mixService.lay({ lotId: f.lotId, kg: kgNet, viTri: f.viTri, rawLotIds: f.rawLotIds, soBanh: f.soBanh, grossKg: f.grossKg, palletKg: null, shiftDate: date, shiftId: f.shiftId ?? null, team: f.team.trim() || null, purpose: f.purpose, targetIndex: f.purpose === 'nang_chi_so' ? f.targetIndex.trim() || null : null, targetValue: f.purpose === 'nang_chi_so' ? f.targetValue : null, productionOrderId: f.poId ?? null, note: f.note.trim() || null })
      message.success('Đã ghi lấy đầu ca — chụp 2 ảnh ở trang phiếu'); setOpen(false)
      setF({ lotId: undefined, kg: null, shiftId: undefined, team: '', purpose: 'chay_lai', targetIndex: '', targetValue: null, poId: undefined, note: '', rawLotIds: [], soBanh: null, grossKg: null, palletKg: 15, viTri: undefined })
      navigate(`/wms/chen/phieu/${id}`)
    } catch (e: any) { message.error(e?.message || 'Không ghi được') }
    finally { setSaving(false) }
  }

  const columns: ColumnsType<MixIssue> = [
    { title: 'Phiếu', dataIndex: 'code', key: 'code', render: (v, r) => <a onClick={() => navigate(`/wms/chen/phieu/${r.id}`)}><Text code>{v}</Text></a> },
    { title: 'Ngày · ca', key: 'ca', render: (_, r) => <span>{new Date(r.shift_date).toLocaleDateString('vi-VN')}{r.shift_name ? ` · ${r.shift_name}` : ''}{r.team ? <Text type="secondary"> · {r.team}</Text> : null}</span> },
    { title: 'Lô chèn', key: 'lot', render: (_, r) => <span>{r.lot_so_lo ? <Text strong>{r.lot_so_lo} </Text> : null}<Text code>{r.lot_code}</Text> <Text type="secondary">{MIX_SOURCE_LABELS[r.source_type]}{r.lot_grade ? ` · ${r.lot_grade}` : ''}</Text></span> },
    { title: 'Chèn vào', key: 'vi_tri', render: (_, r) => <span>{r.vi_tri ? <Tag color={r.vi_tri === 'be_slap' ? 'cyan' : 'purple'}>{MIX_VI_TRI_LABELS[r.vi_tri]}</Tag> : null}{r.ma_goc_all ? <Tag color="geekblue">{r.ma_goc_all}</Tag> : <Text type="secondary">mã: theo phiếu ca</Text>}{r.so_banh !== null ? <Text type="secondary"> · {r.so_banh} bành</Text> : null}</span> },
    { title: 'Mục đích', dataIndex: 'purpose', key: 'purpose', render: (v: MixPurpose, r) => <span>{MIX_PURPOSE_LABELS[v]}{r.target_index ? <Text type="secondary"> · {r.target_index} {r.target_value ?? ''}</Text> : null}</span> },
    { title: 'Lấy', dataIndex: 'kg_out', key: 'kg_out', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Trả', dataIndex: 'kg_return', key: 'kg_return', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Tiêu hao', dataIndex: 'kg_used', key: 'kg_used', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
    { title: 'Ảnh', key: 'anh', render: (_, r) => <span><Tag color={r.so_anh_lay >= 2 ? 'green' : 'red'}>lấy {r.so_anh_lay}</Tag><Tag color={r.so_anh_tra >= 2 ? 'green' : r.kg_return === null ? 'default' : 'red'}>trả {r.so_anh_tra}</Tag></span> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (v: MixIssue['status'], r) => <span><Tag color={MIX_ISSUE_STATUS_COLORS[v]}>{MIX_ISSUE_STATUS_LABELS[v]}</Tag>{r.handover_to_next && <Tag color="purple">bàn giao</Tag>}</span> },
    { title: 'Người lấy', dataIndex: 'out_name', key: 'out_name' },
  ]

  // bảng theo mã: Lần + cột gốc + Lũy kế (sau Tiêu hao)
  const kgUsedIdx = columns.findIndex((c) => c.key === 'kg_used')
  const luyKeIdx = kgUsedIdx + 2   // +1 cột Lần, +1 vị trí sau Tiêu hao
  const maColumns: ColumnsType<MixIssue> = [
    { title: 'Lần', key: 'lan', width: 56, render: (_, r) => <Text strong>L{(r as MixIssue & { lan: number }).lan}</Text> },
    ...columns.slice(0, kgUsedIdx + 1),
    { title: 'Lũy kế', key: 'luy_ke', align: 'right', render: (_, r) => <Text type="secondary">{fmtKg((r as MixIssue & { luyKe: number }).luyKe)}</Text> },
    ...columns.slice(kgUsedIdx + 1),
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <div>
              <Title level={3} style={{ margin: 0 }}>Hàng chèn</Title>
              <Text type="secondary">QS lấy đầu ca → trả cuối ca → QS ký → QC duyệt → thủ kho nhận · tiêu hao = lấy − trả · 2 ảnh lúc lấy và lúc trả · bì pallet khai ở lần trả (dùng hết = cân pallet rỗng) · dòng CHÈN sổ ca tự điền</Text>
            </div>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={(id) => setFacilityId(id)} allowAll={false} style={{ minWidth: 180 }} />
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
          <Col xs={12} md={6}><Card size="small"><Statistic title={`Tiêu hao mã ${maChon?.ma ?? '—'} đã nhận (kg)`} value={chenMa?.chen_kg ?? tieuHaoMa} precision={0} suffix={chenMa?.ty_le_chen_pct !== null && chenMa?.ty_le_chen_pct !== undefined ? <Text type="secondary" style={{ fontSize: 13 }}>· {chenMa.ty_le_chen_pct} % hàng vào máy</Text> : undefined} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Chờ ký (kg)" value={choKyKg} precision={0} valueStyle={{ color: choKyKg > 0 ? '#B7791F' : undefined }} /></Card></Col>
        </Row>

        {lotFilter && (
          <Card size="small" bodyStyle={{ padding: 0 }} title={<Space>Phiếu của lô {lotIssues[0]?.lot_code ?? ''}<Button size="small" onClick={() => navigate('/wms/chen')}>Bỏ lọc</Button></Space>}>
            <Table<MixIssue> rowKey="id" columns={columns} dataSource={lotIssues} size="small" pagination={false} locale={{ emptyText: 'Lô chưa có phiếu' }} />
          </Card>
        )}

        <Card size="small" bodyStyle={{ padding: 0 }} title={<Space>Phiếu đang mở (chưa đủ 3 chữ ký)<Tag color={openIssues.length ? 'gold' : 'default'}>{openIssues.length}</Tag></Space>}>
          <Table<MixIssue> rowKey="id" columns={columns} dataSource={openIssues} size="small" loading={loading} pagination={false} locale={{ emptyText: 'Không có phiếu đang mở' }} />
        </Card>

        <Card size="small" bodyStyle={{ padding: 0 }}
          title={<Space wrap>Phiếu theo mã hàng đang chạy
            <Select style={{ minWidth: 260 }} showSearch optionFilterProp="label" value={maId} onChange={setMaId} placeholder="Chọn mã nguyên liệu"
              options={maAll.map((m) => ({ value: m.raw_lot_id, label: `${m.ma} · ${RAW_LOT_TRANG_THAI_LABELS[m.trang_thai]}${m.rubber_type_name ? ' · ' + m.rubber_type_name : ''}` }))} />
            {maChon && <Tag color={maChon.trang_thai === 'dang_chay' ? 'green' : maChon.trang_thai === 'san_sang' ? 'blue' : 'default'}>{RAW_LOT_TRANG_THAI_LABELS[maChon.trang_thai]}</Tag>}
            {maChon && (maChon.dang_chay_tu
              ? <Button size="small" loading={chayBusy} onClick={() => doiChay(false)}>Kết thúc chạy</Button>
              : <Button size="small" type="primary" ghost loading={chayBusy} disabled={!canWrite} onClick={() => doiChay(true)}>Khai mã này đang chạy</Button>)}
            {maChon && <Text type="secondary">{maChon.ngay_dau ? `về ${new Date(maChon.ngay_dau).toLocaleDateString('vi-VN')}` : ''}{maChon.ngay_cuoi && maChon.ngay_cuoi !== maChon.ngay_dau ? ` → ${new Date(maChon.ngay_cuoi).toLocaleDateString('vi-VN')}` : ''} · {maChon.so_xe} xe · xuất SX {fmtKg(maChon.xuat_sx_kho_kg)} kg khô</Text>}
          </Space>}>
          {maId && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: '#FAFAF7' }}>
              <Row gutter={[16, 8]}>
                <Col xs={12} md={4}><Statistic title="Số lần chèn" value={tongMa.lan} suffix={<Text type="secondary" style={{ fontSize: 12 }}>· {tongMa.ca.size} ca{tongMa.banh ? ` · ${tongMa.banh} bành` : ''}</Text>} /></Col>
                <Col xs={12} md={4}><Statistic title="Đã lấy (kg)" value={tongMa.lay} precision={0} /></Col>
                <Col xs={12} md={4}><Statistic title="Đã trả (kg)" value={tongMa.tra} precision={0} /></Col>
                <Col xs={12} md={6}><Statistic title="Tiêu hao lũy kế (kg)" value={tongMa.tieuHao} precision={0} valueStyle={{ color: '#1B4D3E', fontWeight: 700 }} suffix={<Text type="secondary" style={{ fontSize: 12 }}>· đã nhận {fmtKg(tongMa.daNhan)}{tongMa.choKy > 0 ? ` · chờ ký ${fmtKg(tongMa.choKy)}` : ''}</Text>} /></Col>
                <Col xs={12} md={6}><Statistic title="Đang ở dây chuyền (kg)" value={tongMa.dayChuyen} precision={0} valueStyle={{ color: tongMa.dayChuyen > 0 ? '#B7791F' : undefined }} suffix={<Text type="secondary" style={{ fontSize: 12 }}>chưa trả, chưa tính tiêu hao</Text>} /></Col>
              </Row>
              <Space wrap size={[8, 4]} style={{ marginTop: 6 }}>
                {tongMa.be > 0 && <Tag color="cyan">bể Slap {fmtKg(tongMa.be)} kg</Tag>}
                {tongMa.mix > 0 && <Tag color="purple">máy Mix {fmtKg(tongMa.mix)} kg</Tag>}
                {chenMa && chenMa.chen_kg > 0 && <>
                  {chenMa.chen_loi_kg > 0 && <Tag>lỗi {fmtKg(chenMa.chen_loi_kg)}</Tag>}
                  {chenMa.chen_dkl_kg > 0 && <Tag>DKL {fmtKg(chenMa.chen_dkl_kg)}</Tag>}
                  {chenMa.chen_chuan_kg > 0 && <Tag>chuẩn {fmtKg(chenMa.chen_chuan_kg)}</Tag>}
                  {chenMa.chen_khac_kg > 0 && <Tag>mua ngoài / khác {fmtKg(chenMa.chen_khac_kg)}</Tag>}
                  {chenMa.ty_le_chen_pct !== null && <Text type="secondary">{chenMa.ty_le_chen_pct} % hàng vào máy (đã nhận)</Text>}
                </>}
              </Space>
            </div>
          )}
          <Table<MixIssue> rowKey="id" columns={maColumns} dataSource={maRows} size="small" loading={loading}
            pagination={{ pageSize: 30, showSizeChanger: false }} locale={{ emptyText: maId ? 'Mã này chưa có phiếu chèn nào' : 'Chọn mã nguyên liệu' }}
            summary={() => maRows.length ? (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#F6FBF8' }}>
                  <Table.Summary.Cell index={0} colSpan={luyKeIdx - 3}><Text strong>Tổng {tongMa.lan} lần · {tongMa.ca.size} ca</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={luyKeIdx - 3} align="right"><Text strong>{fmtKg(tongMa.lay)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={luyKeIdx - 2} align="right"><Text strong>{fmtKg(tongMa.tra)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={luyKeIdx - 1} align="right"><Text strong style={{ color: '#1B4D3E' }}>{fmtKg(tongMa.tieuHao)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={luyKeIdx} align="right"><Text type="secondary">{fmtKg(tongMa.tieuHao)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={luyKeIdx + 1} colSpan={3} />
                </Table.Summary.Row>
              </Table.Summary>
            ) : null} />
        </Card>

        {chuaMa.length > 0 && (
          <Card size="small" bodyStyle={{ padding: 0 }} title={<Space>Phiếu chưa gắn mã hàng<Tag color="orange">{chuaMa.length}</Tag><Text type="secondary">máy gắn theo phiếu ca lúc thủ kho nhận, hoặc mở phiếu bấm Đổi mã</Text></Space>}>
            <Table<MixIssue> rowKey="id" columns={columns} dataSource={chuaMa} size="small" pagination={false} />
          </Card>
        )}

        <Modal open={open} title="Lấy hàng chèn đầu ca" onCancel={() => setOpen(false)} onOk={submit} okText="Ghi lấy đầu ca" cancelText="Hủy" confirmLoading={saving} width={620}>
          <Row gutter={[12, 10]}>
            <Col span={24}><Text>Lô chèn *</Text>
              <Select style={{ width: '100%' }} showSearch optionFilterProp="label" value={f.lotId} onChange={(v) => setF((x) => ({ ...x, lotId: v }))}
                options={lotsCoHang.map((l) => ({ value: l.id, disabled: l.source_type === 'dkl' && !l.metal_cleared, label: `${l.so_lo ? l.so_lo + ' · ' : 'CHƯA CÓ SỐ LÔ · '}${l.code} · ${MIX_SOURCE_LABELS[l.source_type]}${l.grade ? ' · ' + l.grade : ''} · tồn ${fmtKg(l.ton_kg)} kg${l.source_type === 'dkl' && !l.metal_cleared ? ' · CHƯA XỬ LÝ KIM LOẠI' : ''}` }))} />
              {lotChon && <Text type="secondary">{lotChon.source_desc || ''} · Po {lotChon.po ?? '—'} · Mooney {lotChon.mooney ?? '—'} · PRI {lotChon.pri ?? '—'}{lotChon.qc_allow_mix_pct !== null ? ` · trộn ≤ ${lotChon.qc_allow_mix_pct} %` : ''}{!lotChon.qc_allow_rerun ? ' · KHÔNG chạy lại' : ''}</Text>}
            </Col>
            <Col span={24}><Text>Chèn vào đâu *</Text><Select style={{ width: '100%' }} value={f.viTri} onChange={(v) => setF((x) => ({ ...x, viTri: v }))} placeholder="Chèn bể Slap / chèn máy Mix" options={(Object.keys(MIX_VI_TRI_LABELS) as MixViTri[]).map((k) => ({ value: k, label: `Chèn ${MIX_VI_TRI_LABELS[k]}` }))} /></Col>
            <Col span={24}><Text>Chèn vào mã nguyên liệu đang chạy</Text>
              <Select mode="multiple" style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" value={f.rawLotIds} onChange={(v) => setF((x) => ({ ...x, rawLotIds: v }))} placeholder="Để trống = lấy theo phiếu ca của ca này" options={maList.map((m) => ({ value: m.raw_lot_id, label: `${m.ma}${m.trang_thai === 'dang_chay' ? ' · đang chạy' : ''}` }))} />
              <Text type="secondary">Chọn nhiều mã nếu ca chạy chung (ví dụ KHMN-15 + 17): khi gom, kg chia đều.</Text>
            </Col>
            <Col span={6}><Text>Số bành <Text type="secondary">(tự tính)</Text></Text><InputNumber style={{ width: '100%' }} min={0} value={f.soBanh ?? (kgNet && lotChon ? Math.max(Math.round(Math.max(kgNet - (f.grossKg !== null ? 15 : 0), 0) / (lotChon.kg_per_banh || 35)), 1) : null)} onChange={(v) => setF((x) => ({ ...x, soBanh: v === null || v === undefined ? null : Number(v) }))} /></Col>
            <Col span={9}><Text>Cân cả pallet (kg) · bì khai lúc trả</Text><InputNumber style={{ width: '100%' }} min={0} step={10} value={f.grossKg} onChange={(v) => setF((x) => ({ ...x, grossKg: v === null || v === undefined ? null : Number(v), kg: null }))} /></Col>
            <Col span={9}><Text>Kg lấy (tạm = cân tổng) *</Text><InputNumber style={{ width: '100%' }} min={1} step={10} max={lotChon?.ton_kg} value={kgNet} onChange={(v) => setF((x) => ({ ...x, kg: v === null || v === undefined ? null : Number(v) }))} /></Col>
            <Col span={8}><Text>Ngày ca</Text><Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocal())} /></Col>
            <Col span={8}><Text>Ca</Text><Select style={{ width: '100%' }} allowClear value={f.shiftId} onChange={(v) => setF((x) => ({ ...x, shiftId: v }))} options={shifts.map((s) => ({ value: s.id, label: s.name || s.code }))} placeholder="Ca sản xuất" /></Col>
            <Col span={8}><Text>Tổ trưởng (ca của ai)</Text><Select style={{ width: '100%' }} allowClear value={f.team || undefined} onChange={(v) => setF((x) => ({ ...x, team: v ?? '' }))} options={[{ value: 'Vang', label: 'Ca Vang' }, { value: 'Hiền', label: 'Ca Hiền' }]} placeholder="Ca Vang / Ca Hiền" /></Col>
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
