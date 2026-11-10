// ============================================================================
// HÀNG CHÈN — SỔ PALLET (p19, chủ DN 10/11/2026): khai báo pallet · chữ viết tắt · số kg (bì pallet rỗng)
//   Bản máy tính cho thủ kho / BGĐ: bảng HC1→HC30, sửa (tên, chữ viết tắt, số kg + lý do), tắt / bật, thêm bộ pallet, lịch sử.
//   Luật nằm ở DB (mix_pallets, fn_mix_pallet_khai / tat / tao_bo, v_mix_pallets). Điện thoại: /m/kho/chen/so-pallet.
// File: src/pages/wms/raw/MixPalletPage.tsx · Route: /wms/chen/pallet
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Space, Statistic, Switch, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { mixService, MIX_PALLET_BI_CU_NGAY, MIX_PALLET_LOG_LABELS, MIX_PALLET_TRANG_THAI_COLORS, MIX_PALLET_TRANG_THAI_LABELS, type MixPallet, type MixPalletLog } from '../../../services/wms/mixService'
import { useMixRole } from '../../../hooks/useMixRole'
import { usePhoneRedirect } from '../../../hooks/useIsPhone'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography
const kg1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }))
const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

export default function MixPalletPage() {
  usePhoneRedirect('/m/kho/chen/so-pallet')
  const navigate = useNavigate()
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  useEffect(() => { if (!facilityId && facilities?.length) setFacilityId((facilities.find((f) => f.code === 'PD') ?? facilities[0]).id) }, [facilities, facilityId])
  const role = useMixRole(facilityId ?? null)
  const canEdit = role.nhanKho
  const [rows, setRows] = useState<MixPallet[]>([])
  const [logs, setLogs] = useState<MixPalletLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTat, setShowTat] = useState(false)
  const [edit, setEdit] = useState<MixPallet | null>(null)
  const [them, setThem] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()
  const [formThem] = Form.useForm()

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setError(null)
    try {
      const [p, l] = await Promise.all([mixService.listPallets(facilityId), mixService.palletLogs(facilityId, null, 200).catch(() => [] as MixPalletLog[])])
      setRows(p); setLogs(l)
    } catch (e: any) { setError(e?.message || 'Không tải được Sổ pallet (cần chạy SQL wms_mix_p19_so_pallet.sql)') }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const dem = useMemo(() => ({
    trong: rows.filter((x) => x.trang_thai === 'trong').length, dc: rows.filter((x) => x.trang_thai === 'day_chuyen').length,
    chuaBi: rows.filter((x) => x.trang_thai === 'chua_bi').length, tat: rows.filter((x) => x.trang_thai === 'tat').length,
    canLai: rows.filter((x) => x.is_active && x.bi_kg !== null && (x.bi_cu_ngay ?? 0) > MIX_PALLET_BI_CU_NGAY).length,
  }), [rows])
  const hienThi = showTat ? rows : rows.filter((x) => x.is_active)
  const soMax = rows.reduce((m, x) => Math.max(m, x.so ?? 0), 0)

  const moSua = (p: MixPallet) => { setEdit(p); form.setFieldsValue({ ten: p.ten ?? '', code: p.code, bi_kg: p.bi_kg ?? undefined, ly_do: '' }) }
  async function luuSua() {
    if (!edit) return
    const v = await form.validateFields()
    setBusy(true)
    try {
      const r = await mixService.khaiPallet(edit.id, { ten: v.ten ?? null, code: v.code ?? null, biKg: v.bi_kg ?? null, lyDo: v.ly_do || null })
      message.success(`Đã ghi ${r.code} · ${kg1(r.bi_kg)} kg`)
      setEdit(null); await load()
    } catch (e: any) { message.error(e?.message || 'Không ghi được') }
    finally { setBusy(false) }
  }
  async function tat(p: MixPallet, tatHay: boolean, lyDo?: string) {
    try { await mixService.tatPallet(p.id, tatHay, lyDo ?? null); message.success(tatHay ? `Đã tắt ${p.code}` : `Đã bật lại ${p.code}`); await load() }
    catch (e: any) { message.error(e?.message || 'Không đổi được') }
  }
  async function themBo() {
    if (!facilityId) return
    const v = await formThem.validateFields()
    setBusy(true)
    try {
      const n = await mixService.taoBoPallet(facilityId, Number(v.tu), Number(v.den), { prefix: v.prefix || 'HC', ten: v.ten || null, biKg: v.bi_kg ?? null })
      message.success(n ? `Đã thêm ${n} pallet` : 'Các mã này đã có trong sổ')
      setThem(false); await load()
    } catch (e: any) { message.error(e?.message || 'Không thêm được') }
    finally { setBusy(false) }
  }

  const cols: ColumnsType<MixPallet> = [
    { title: 'Chữ viết tắt', dataIndex: 'code', width: 110, render: (v: string, r) => <Text strong style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: r.is_active ? '#0D2E25' : '#9CA3AF', textDecoration: r.is_active ? undefined : 'line-through' }}>{v}</Text> },
    { title: 'Pallet', dataIndex: 'ten', render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: 'Số kg (bì)', dataIndex: 'bi_kg', width: 110, align: 'right', render: (v: number | null) => v === null ? <Tag color="red">chưa khai</Tag> : <Text strong style={{ fontFamily: 'JetBrains Mono, Consolas, monospace' }}>{kg1(v)}</Text> },
    { title: 'Khai lúc · bởi', width: 190, render: (_, r) => r.bi_khai_at ? <span>{dt(r.bi_khai_at)}{r.bi_khai_name ? ` · ${r.bi_khai_name}` : ''}{(r.bi_cu_ngay ?? 0) > MIX_PALLET_BI_CU_NGAY && r.is_active ? <Tag color="gold" style={{ marginLeft: 6 }}>cân lại · {r.bi_cu_ngay} ngày</Tag> : null}</span> : <Text type="secondary">—</Text> },
    { title: 'Trạng thái', dataIndex: 'trang_thai', width: 130, render: (v: MixPallet['trang_thai'], r) => <Tag color={MIX_PALLET_TRANG_THAI_COLORS[v]}>{MIX_PALLET_TRANG_THAI_LABELS[v]}{v === 'tat' && r.tat_ly_do ? ` · ${r.tat_ly_do}` : ''}</Tag> },
    { title: 'Phiếu đang gắn', render: (_, r) => r.issue_id ? <Space size={4} wrap><a onClick={() => navigate(`/wms/chen/phieu/${r.issue_id}`)} style={{ fontFamily: 'JetBrains Mono, Consolas, monospace' }}>{r.issue_code}</a><Text type="secondary">{r.issue_lot_so_lo ? `lô ${r.issue_lot_so_lo} · ` : ''}{kg1(r.issue_kg_out)} kg · {dt(r.issue_out_at)}{r.issue_lenh_ma_gop ? ` · ${r.issue_lenh_ma_gop}` : ''}</Text></Space> : <Text type="secondary">—</Text> },
    { title: 'Ghi chú', dataIndex: 'note', render: (v: string | null, r) => <Text type="secondary">{v || ''}{r.so_lan_can_lai ? `${v ? ' · ' : ''}cân lại ${r.so_lan_can_lai} lần` : ''}</Text> },
    { title: 'Thao tác', width: 170, render: (_, r) => canEdit ? (
      <Space size={4}>
        {r.is_active && <Button size="small" onClick={() => moSua(r)}>{r.bi_kg === null ? 'Khai số kg' : 'Sửa · cân lại'}</Button>}
        {r.is_active && r.trang_thai !== 'day_chuyen' && <Popconfirm title={`Tắt ${r.code}?`} description="Pallet hỏng / không dùng nữa. Không hiện ở màn lấy; bật lại được." okText="Tắt" cancelText="Không" onConfirm={() => tat(r, true, 'tắt trên máy tính')}><Button size="small" danger>Tắt</Button></Popconfirm>}
        {!r.is_active && <Button size="small" onClick={() => tat(r, false)}>Bật lại</Button>}
      </Space>
    ) : null },
  ]
  const logCols: ColumnsType<MixPalletLog> = [
    { title: 'Lúc', dataIndex: 'at', width: 130, render: (v: string) => dt(v) },
    { title: 'Pallet', dataIndex: 'pallet_code', width: 100, render: (v: string) => <Text strong style={{ fontFamily: 'JetBrains Mono, Consolas, monospace' }}>{v}</Text> },
    { title: 'Việc', dataIndex: 'loai', width: 150, render: (v: MixPalletLog['loai']) => MIX_PALLET_LOG_LABELS[v] ?? v },
    { title: 'Thay đổi', render: (_, r) => r.loai === 'khai' || r.loai === 'can_lai' ? `${r.bi_cu === null ? '—' : kg1(r.bi_cu)} → ${kg1(r.bi_moi)} kg` : r.loai === 'doi_ma' ? `${r.code_cu} → ${r.code_moi}` : '' },
    { title: 'Lý do', dataIndex: 'ly_do', render: (v: string | null) => v || '' },
    { title: 'Người', dataIndex: 'by_name', width: 160, render: (v: string | null) => v || <Text type="secondary">hệ thống</Text> },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/chen')}>Hàng chèn</Button>
              <div>
                <Title level={3} style={{ margin: 0 }}>Sổ pallet hàng chèn</Title>
                <Text type="secondary">Khai báo pallet · chữ viết tắt (in trên pallet, tổ chạm lúc lấy) · số kg (bì pallet rỗng, cân một lần). Lúc lấy: kg = cân cả pallet − bì, chốt ngay. Cuối ca: dùng hết không cân, còn dư cân một lần.</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={(id) => setFacilityId(id)} allowAll={false} style={{ minWidth: 180 }} />
              <Switch checked={showTat} onChange={setShowTat} checkedChildren="cả pallet tắt" unCheckedChildren="ẩn pallet tắt" />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => { formThem.setFieldsValue({ prefix: 'HC', tu: soMax + 1, den: soMax + 10, ten: 'Pallet hàng chèn', bi_kg: undefined }); setThem(true) }}>Thêm pallet</Button>}
            </Space>
          </Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} />}
        {!canEdit && !role.loading && <Alert type="info" showIcon message="Chỉ thủ kho (bước 3 nhận kho) và Ban Giám đốc ghi được Sổ pallet. Bạn đang xem." />}
        {dem.chuaBi > 0 && <Alert type="warning" showIcon message={`${dem.chuaBi} pallet chưa khai số kg: tổ chưa chạm lấy được. Cân pallet rỗng rồi bấm "Khai số kg".`} />}
        <Row gutter={[12, 12]}>
          <Col xs={12} md={4}><Card size="small"><Statistic title="Pallet đang dùng" value={rows.filter((x) => x.is_active).length} /></Card></Col>
          <Col xs={12} md={4}><Card size="small"><Statistic title="Trống" value={dem.trong} valueStyle={{ color: '#15803D' }} /></Card></Col>
          <Col xs={12} md={4}><Card size="small"><Statistic title="Ở dây chuyền" value={dem.dc} valueStyle={{ color: dem.dc ? '#B7791F' : undefined }} /></Card></Col>
          <Col xs={12} md={4}><Card size="small"><Statistic title="Chưa khai số kg" value={dem.chuaBi} valueStyle={{ color: dem.chuaBi ? '#B91C1C' : undefined }} /></Card></Col>
          <Col xs={12} md={4}><Card size="small"><Statistic title={`Bì khai > ${MIX_PALLET_BI_CU_NGAY} ngày`} value={dem.canLai} valueStyle={{ color: dem.canLai ? '#B7791F' : undefined }} /></Card></Col>
          <Col xs={12} md={4}><Card size="small"><Statistic title="Tắt" value={dem.tat} /></Card></Col>
        </Row>
        <Card size="small" title={`Sổ pallet · ${hienThi.length} pallet`}>
          <Table<MixPallet> rowKey="id" size="small" loading={loading} columns={cols} dataSource={hienThi} pagination={false} scroll={{ x: 1100 }} />
        </Card>
        <Card size="small" title={`Lịch sử sổ pallet · ${logs.length}`}>
          <Table<MixPalletLog> rowKey="id" size="small" columns={logCols} dataSource={logs} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 900 }} />
        </Card>
      </Space>

      <Modal open={!!edit} title={edit ? `Khai báo pallet ${edit.code}` : ''} onCancel={() => setEdit(null)} onOk={luuSua} okText="Ghi" cancelText="Đóng" confirmLoading={busy} destroyOnHidden>
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="ten" label="Pallet (tên, loại)"><Input placeholder="Pallet gỗ 1,1 m · Pallet sắt" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="code" label="Chữ viết tắt" rules={[{ required: true, message: 'Gõ chữ viết tắt' }]} extra={edit?.trang_thai === 'day_chuyen' ? 'Đang ở dây chuyền: đổi sau khi trả phiếu' : 'In trên pallet, tổ chạm lúc lấy'}><Input style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', fontWeight: 700, textTransform: 'uppercase' }} disabled={edit?.trang_thai === 'day_chuyen'} /></Form.Item></Col>
            <Col span={12}><Form.Item name="bi_kg" label="Số kg (bì pallet rỗng)" rules={[{ required: true, message: 'Cân pallet rỗng rồi gõ số kg' }]}><InputNumber min={0.5} max={199} step={0.5} style={{ width: '100%' }} addonAfter="kg" /></Form.Item></Col>
          </Row>
          <Form.Item name="ly_do" label="Lý do (khi cân lại)"><Input placeholder="Thay ván, sửa pallet, tới kỳ cân lại…" /></Form.Item>
          {edit?.trang_thai === 'day_chuyen' && <Alert type="warning" showIcon message={`Phiếu ${edit.issue_code} đang mở giữ bì lúc lấy (${kg1(edit.bi_kg)} kg); số kg mới áp cho lần lấy sau.`} />}
        </Form>
      </Modal>
      <Modal open={them} title="Thêm pallet vào sổ" onCancel={() => setThem(false)} onOk={themBo} okText="Thêm" cancelText="Đóng" confirmLoading={busy} destroyOnHidden>
        <Form form={formThem} layout="vertical" style={{ marginTop: 8 }}>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="prefix" label="Chữ viết tắt" rules={[{ required: true }]}><Input style={{ textTransform: 'uppercase' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="tu" label="Số từ" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="den" label="đến" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="ten" label="Tên pallet (chung cho cả bộ)"><Input /></Form.Item>
          <Form.Item name="bi_kg" label="Số kg chung (để trống nếu sẽ cân từng pallet)"><InputNumber min={0.5} max={199} step={0.5} style={{ width: '100%' }} addonAfter="kg" /></Form.Item>
          <Text type="secondary">Mã đã có trong sổ sẽ bỏ qua. Pallet chưa có số kg thì tổ chưa chạm lấy được.</Text>
        </Form>
      </Modal>
    </div>
  )
}
