// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Tạo lệnh xuất, chọn lô theo FIFO (GĐ2)
// File: src/pages/wms/raw/RawIssueCreatePage.tsx · Route: /wms/nvl/xuat/new
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Checkbox, Col, Input, InputNumber, Progress, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { rawIssueService, RAW_ISSUE_PURPOSE_LABELS, type FifoPick, type ProductionOrderLite, type RawIssuePurpose } from '../../../services/wms/rawIssueService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_RUBBER_TYPE_LABELS, RAW_SETTINGS_DEFAULT, type RawRubberType, type RawSettings } from '../../../services/wms/raw.types'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'
import { useRawRole } from '../../../hooks/useRawRole'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' %')

const RAW_TYPES_FOR_PRODUCTION: RawRubberType[] = ['mu_dong', 'mu_tap', 'mu_chen', 'mu_to', 'mu_nuoc', 'svr_10', 'svr_20', 'svr_3l', 'svr_l', 'svr_5', 'svr_cv50', 'svr_cv60', 'rss_1', 'rss_3', 'latex_60', 'sbr_1502']

export default function RawIssueCreatePage() {
  const navigate = useNavigate()
  const rawRole = useRawRole()
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [mucDich, setMucDich] = useState<RawIssuePurpose>('production')
  const [productionOrders, setProductionOrders] = useState<ProductionOrderLite[]>([])
  const [productionOrderId, setProductionOrderId] = useState<string | undefined>(undefined)
  const [targetGrade, setTargetGrade] = useState<string | undefined>(undefined)
  const [needDry, setNeedDry] = useState<number>(10000)
  const [types, setTypes] = useState<RawRubberType[]>(['mu_dong', 'mu_tap', 'mu_chen'])
  const [maxTap, setMaxTap] = useState<number | null>(40)
  const [note, setNote] = useState('')
  const [picks, setPicks] = useState<FifoPick[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)

  useEffect(() => {
    if (facilityId || !facilities?.length) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD')
    setFacilityId((pd ?? facilities[0]).id)
  }, [facilities, facilityId])

  useEffect(() => { rawIssueService.listProductionOrders().then(setProductionOrders).catch(() => setProductionOrders([])) }, [])
  useEffect(() => { if (facilityId) rawSettingsService.getForFacility(facilityId).then(setSettings).catch(() => undefined) }, [facilityId])

  // Chọn lệnh SX → lấy grade + giới hạn chèn theo grade làm gợi ý
  useEffect(() => {
    const po = productionOrders.find((p) => p.id === productionOrderId)
    if (po?.target_grade) setTargetGrade(po.target_grade)
  }, [productionOrderId, productionOrders])

  const goiY = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    try { setPicks(await rawIssueService.goiYFifo({ facilityId, rubberTypes: types, needDryKg: needDry, maxTapPct: mucDich === 'production' ? maxTap : null })) }
    catch (e: any) { message.error(e?.message || 'Không tải được lô') }
    finally { setLoading(false) }
  }, [facilityId, types, needDry, maxTap, mucDich])

  useEffect(() => { goiY() }, [goiY])

  const th = useMemo(() => rawIssueService.tongHop(picks, needDry), [picks, needDry])
  const tapWarn = mucDich === 'production' && maxTap !== null && th.tapPct > maxTap

  const toggle = (id: string) => setPicks((ps) => ps.map((p) => (p.batch_id === id ? { ...p, selected: !p.selected } : p)))
  const setPlanned = (id: string, v: number | null) => setPicks((ps) => ps.map((p) => (p.batch_id === id ? { ...p, planned_wet_kg: Math.max(0, Math.min(v ?? 0, p.wet_kg)) } : p)))

  const handleCreate = async () => {
    if (!facilityId) return
    const lines = picks.filter((p) => p.selected && p.planned_wet_kg > 0).map((p) => ({ batch_id: p.batch_id, planned_wet_kg: p.planned_wet_kg }))
    if (!lines.length) { message.warning('Chưa chọn lô nào'); return }
    setSaving(true)
    try {
      const id = await rawIssueService.create({
        facilityId, mucDich, productionOrderId: productionOrderId ?? null, targetGrade: targetGrade ?? null,
        needDryKg: needDry, maxTapPct: mucDich === 'production' ? maxTap : null, note: note.trim() || null, lines,
      })
      message.success('Đã tạo lệnh xuất · tiếp theo: cân thực tế từng lô rồi ký')
      navigate(`/wms/nvl/xuat/${id}`)
    } catch (e: any) { message.error(e?.message || 'Không tạo được lệnh') }
    finally { setSaving(false) }
  }

  const columns: ColumnsType<FifoPick> = [
    { title: '', key: 'sel', width: 40, render: (_, r) => <Checkbox checked={r.selected} onChange={() => toggle(r.batch_id)} aria-label={`Chọn lô ${r.batch_no}`} /> },
    { title: 'Lô', dataIndex: 'batch_no', key: 'batch_no', render: (v) => <Text code>{v}</Text> },
    { title: 'Loại', dataIndex: 'rubber_type_name', key: 'rubber_type_name' },
    { title: 'NCC', dataIndex: 'supplier_name', key: 'supplier_name', ellipsis: true, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Tuổi', dataIndex: 'tuoi_ngay', key: 'tuoi_ngay', align: 'right', render: (v) => <Text strong type={v > settings.tuoi_lo_canh_bao_ngay ? 'danger' : undefined}>{v} ng</Text> },
    { title: 'Tồn ướt', dataIndex: 'wet_kg', key: 'wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'DRC', dataIndex: 'drc_pct', key: 'drc_pct', align: 'right', render: (v) => fmtPct(v) },
    { title: 'Tồn khô', dataIndex: 'dry_kg', key: 'dry_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Lấy (kg ướt)', key: 'planned', width: 150, render: (_, r) => <InputNumber size="small" min={0} max={r.wet_kg} step={100} value={r.planned_wet_kg} disabled={!r.selected} onChange={(v) => setPlanned(r.batch_id, v === null ? null : Number(v))} style={{ width: '100%' }} /> },
    { title: 'Khô KH', key: 'dryp', align: 'right', render: (_, r) => r.selected ? <Text strong>{fmtKg((r.drc_pct ?? 0) * r.planned_wet_kg / 100)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Ghi chú', key: 'note', render: (_, r) => <Space size={4} wrap>{r.tuoi_ngay > settings.tuoi_lo_canh_bao_ngay && <Tag color="red">Quá tuổi · ưu tiên</Tag>}{r.ngay_tu_lan_do >= settings.can_lai_truoc_xuat_ngay && r.nhom === 'mu_tho' && <Tag color="gold">Đo DRC đã {r.ngay_tu_lan_do} ngày</Tag>}{r.ton_dau_uoc && <Tag color="gold">DRC ước</Tag>}</Space> },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl/xuat')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Tạo lệnh xuất nguyên liệu</Title>
                <Text type="secondary">Bước 1 chọn lô (gợi ý FIFO) · bước 2 cân thực tế từng lô · bước 3 ký ba bước, thủ kho nhận mới trừ sổ</Text>
              </div>
            </Space>
          </Col>
        </Row>

        {!rawRole.loading && !rawRole.perms.submit && <Alert type="warning" showIcon message="Tài khoản chưa gắn hồ sơ nhân viên, không lập được lệnh." />}

        <Card size="small" title="Lệnh">
          <Row gutter={[12, 12]}>
            <Col xs={24} md={5}><Text type="secondary" style={{ fontSize: 12 }}>Nhà máy</Text>
              <Select value={facilityId} onChange={setFacilityId} style={{ width: '100%' }} options={(facilities ?? []).map((f) => ({ value: f.id, label: `${f.code} · ${f.name}` }))} /></Col>
            <Col xs={24} md={5}><Text type="secondary" style={{ fontSize: 12 }}>Mục đích</Text>
              <Select<RawIssuePurpose> value={mucDich} onChange={setMucDich} style={{ width: '100%' }} options={(Object.keys(RAW_ISSUE_PURPOSE_LABELS) as RawIssuePurpose[]).map((k) => ({ value: k, label: RAW_ISSUE_PURPOSE_LABELS[k] }))} /></Col>
            <Col xs={24} md={7}><Text type="secondary" style={{ fontSize: 12 }}>Lệnh sản xuất (nếu có)</Text>
              <Select allowClear showSearch optionFilterProp="label" value={productionOrderId} onChange={setProductionOrderId} style={{ width: '100%' }} placeholder="Chọn lệnh SX đang mở"
                options={productionOrders.map((p) => ({ value: p.id, label: `${p.code}${p.target_grade ? ' · ' + p.target_grade : ''}${p.target_quantity ? ' · ' + fmtKg(p.target_quantity) + ' kg' : ''} · ${p.status}` }))} /></Col>
            <Col xs={12} md={3}><Text type="secondary" style={{ fontSize: 12 }}>Grade đích</Text>
              <Select allowClear value={targetGrade} onChange={setTargetGrade} style={{ width: '100%' }} options={Object.keys(settings.gioi_han_chen_pct).map((g) => ({ value: g, label: g.replace('_', ' ') }))} /></Col>
            <Col xs={12} md={4}><Text type="secondary" style={{ fontSize: 12 }}>Nhu cầu kg khô</Text>
              <InputNumber value={needDry} min={1} step={500} onChange={(v) => setNeedDry(Number(v ?? 0))} style={{ width: '100%' }} /></Col>
          </Row>
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} md={12}><Text type="secondary" style={{ fontSize: 12 }}>Loại hàng cho phép</Text>
              <Select mode="multiple" value={types} onChange={setTypes} style={{ width: '100%' }} options={RAW_TYPES_FOR_PRODUCTION.map((t) => ({ value: t, label: RAW_RUBBER_TYPE_LABELS[t] }))} /></Col>
            <Col xs={12} md={4}><Text type="secondary" style={{ fontSize: 12 }}>Mủ tạp tối đa (% khô)</Text>
              <InputNumber value={maxTap} min={0} max={100} onChange={(v) => setMaxTap(v === null ? null : Number(v))} style={{ width: '100%' }} disabled={mucDich !== 'production'} /></Col>
            <Col xs={24} md={8}><Text type="secondary" style={{ fontSize: 12 }}>Ghi chú</Text>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ca, dây chuyền, người nhận…" /></Col>
          </Row>
        </Card>

        <Row gutter={[12, 12]}>
          <Col xs={24} xl={17}>
            <Card size="small" title="Lô đủ điều kiện · xếp theo tuổi giảm dần" extra={<Button size="small" icon={<ReloadOutlined />} onClick={goiY} loading={loading}>Gợi ý lại</Button>}>
              <Table<FifoPick> rowKey="batch_id" columns={columns} dataSource={picks} size="small" loading={loading} pagination={false}
                rowClassName={(r) => (r.selected ? 'ant-table-row-selected' : '')}
                locale={{ emptyText: 'Không có lô nào của loại đã chọn còn hàng ở nhà máy này' }} />
            </Card>
          </Col>
          <Col xs={24} xl={7}>
            <Card size="small" title="Tổng hợp">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div><Text style={{ fontSize: 26, fontWeight: 700, color: '#1B4D3E' }}>{fmtKg(th.dry)}</Text><Text type="secondary"> / {fmtKg(needDry)} kg khô · {fmtPct(th.pct)}</Text></div>
                <Progress percent={Math.min(100, Math.round(th.pct))} showInfo={false} strokeColor="#1B4D3E" />
                {th.chenh < 0 ? <Text type="warning">Thiếu {fmtKg(-th.chenh)} kg khô · tick thêm lô</Text>
                  : th.chenh > 0 ? <Text style={{ color: '#1D4ED8' }}>Vượt {fmtKg(th.chenh)} kg khô · giảm "Lấy" ở lô cuối hoặc để cân thực quyết định</Text>
                  : <Text type="success">Vừa đủ</Text>}
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                  <Row justify="space-between"><Text type="secondary">Số lô</Text><Text strong>{th.soLo}</Text></Row>
                  <Row justify="space-between"><Text type="secondary">Ướt kế hoạch</Text><Text strong>{fmtKg(th.wet)} kg</Text></Row>
                  <Row justify="space-between"><Text type="secondary">DRC bình quân</Text><Text strong>{fmtPct(th.drcBq)}</Text></Row>
                  <Row justify="space-between"><Text type="secondary">Mủ tạp</Text><Text strong type={tapWarn ? 'danger' : undefined}>{fmtPct(th.tapPct)} khô</Text></Row>
                  <Row justify="space-between"><Text type="secondary">Tuổi lô lâu nhất</Text><Text strong>{th.tuoiMax} ngày</Text></Row>
                </div>
                {tapWarn && <Alert type="warning" showIcon message={`Mủ tạp vượt ${maxTap} % · bỏ bớt lô tạp hoặc thêm mủ đông`} />}
                <Button type="primary" block size="large" icon={<CheckCircleOutlined />} loading={saving} disabled={th.soLo === 0 || !rawRole.perms.submit} onClick={handleCreate}>Tạo lệnh xuất</Button>
                <Text type="secondary" style={{ fontSize: 12 }}>Tạo xong chưa trừ sổ. Thủ kho cân từng lô khi lấy, ghi kg thực, rồi ký ba bước.</Text>
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  )
}
