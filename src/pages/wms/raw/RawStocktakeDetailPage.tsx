// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Phiếu kiểm kê: đếm từng lô, duyệt ghi sổ (GĐ3)
// File: src/pages/wms/raw/RawStocktakeDetailPage.tsx · Route: /wms/nvl/kiem-ke/:id
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Input, InputNumber, Modal, Row, Select, Space, Spin, Steps, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { rawStocktakeService, RAW_STOCKTAKE_STATUS_COLORS, RAW_STOCKTAKE_STATUS_LABELS, type RawStocktake, type RawStocktakeLine } from '../../../services/wms/rawStocktakeService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtPct = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %')
const fmtSigned = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + fmtKg(n, d))
const LY_DO = ['Tạp chất / đất lẫn', 'Mẫu DRC đầu vào không đại diện', 'Cân sai lúc nhập', 'Lô chồng lẫn, cân lẫn lô', 'Mất mát / thất thoát', 'Khác']

export default function RawStocktakeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [st, setSt] = useState<RawStocktake | null>(null)
  const [lines, setLines] = useState<RawStocktakeLine[]>([])
  const rawRole = useRawRole(st?.facility_id ?? null)
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { wet: number | null; drc: number | null; lyDo: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const r = await rawStocktakeService.get(id)
      if (!r) { setSt(null); return }
      setSt(r.stocktake); setLines(r.lines)
      setDraft(Object.fromEntries(r.lines.map((l) => [l.id, { wet: l.counted_wet_kg, drc: l.counted_drc_pct, lyDo: l.ly_do ?? '' }])))
      setSettings(await rawSettingsService.getForFacility(r.stocktake.facility_id))
    } catch (e: any) { setError(e?.message || 'Không tải được phiếu') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const previewLech = (l: RawStocktakeLine) => {
    const d = draft[l.id]
    if (!d || d.wet === null) return null
    const drc = d.drc ?? l.book_drc_pct ?? 0
    const dry = Math.round(d.wet * drc) / 100
    return l.book_dry_kg > 0 ? (100 * (dry - l.book_dry_kg)) / l.book_dry_kg : null
  }

  const saveLine = async (l: RawStocktakeLine) => {
    const d = draft[l.id]
    if (!d || d.wet === null) return
    const lech = previewLech(l)
    if (lech !== null && Math.abs(lech) > settings.nguong_lech_kho_pct && !d.lyDo) { message.warning(`Lô ${l.batch_no} lệch khô ${lech.toFixed(2)} %, chọn lý do`); return }
    setSaving(l.id)
    try { await rawStocktakeService.ghiDem(l.id, d.wet, d.drc, d.lyDo || null); await load() }
    catch (e: any) { message.error(e?.message || 'Không ghi được') }
    finally { setSaving(null) }
  }

  const sign = (buoc: 'count_done' | 'approve' | 'cancel') => {
    if (!st) return
    const chenh = lines.reduce((s, l) => s + (l.chenh_kho_kg ?? 0), 0)
    Modal.confirm({
      title: buoc === 'count_done' ? 'Đếm xong, gửi duyệt?' : buoc === 'approve' ? 'Duyệt kiểm kê: GHI ĐIỀU CHỈNH VÀO SỔ và khóa kỳ?' : 'Hủy phiếu kiểm kê?',
      content: buoc === 'approve' ? `Chênh khô tổng ${fmtSigned(chenh)} kg · ${lines.filter((l) => (l.lech_kho_pct ?? 0) !== 0).length} lô có chênh. Sau duyệt, sổ khóa đến ${dayjs(st.ngay_kiem_ke).format('DD/MM/YYYY')}.` : undefined,
      okText: buoc === 'cancel' ? 'Hủy phiếu' : 'Xác nhận', okButtonProps: { danger: buoc !== 'count_done' }, cancelText: 'Quay lại',
      onOk: async () => {
        setSigning(true)
        try {
          const r = await rawStocktakeService.ky(st.id, buoc)
          message.success(buoc === 'approve' ? `Đã ghi sổ ${r.so_lo_dieu_chinh} lô · chênh ${fmtSigned(r.chenh_kho_kg)} kg khô` : 'Đã cập nhật')
          await load()
        } catch (e: any) { message.error(e?.message || 'Không thực hiện được') }
        finally { setSigning(false) }
      },
    })
  }

  if (loading && !st) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
  if (error) return <div style={{ padding: 16 }}><Alert type="error" showIcon message={error} /></div>
  if (!st) return <div style={{ padding: 16 }}><Empty description="Không tìm thấy phiếu kiểm kê" /></div>

  const editable = st.status === 'draft' && rawRole.perms.receive
  const stepIdx = { draft: 0, counted: 1, approved: 2, cancelled: 0 }[st.status]
  const tongBook = lines.reduce((s, l) => s + l.book_dry_kg, 0)
  const tongDem = lines.reduce((s, l) => s + (l.counted_dry_kg ?? 0), 0)

  const columns: ColumnsType<RawStocktakeLine> = [
    { title: 'Lô', dataIndex: 'batch_no', key: 'batch_no', render: (v, r) => <a onClick={() => navigate(`/wms/nvl/lo/${r.batch_id}`)}><Text code>{v}</Text></a> },
    { title: 'Loại', dataIndex: 'rubber_type_name', key: 'rubber_type_name' },
    { title: 'Tuổi', dataIndex: 'tuoi_ngay', key: 'tuoi_ngay', align: 'right', render: (v) => (v === null ? '—' : `${v} ng`) },
    { title: 'Sổ ướt', dataIndex: 'book_wet_kg', key: 'book_wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Sổ DRC', dataIndex: 'book_drc_pct', key: 'book_drc_pct', align: 'right', render: (v) => fmtPct(v) },
    { title: 'Sổ khô', dataIndex: 'book_dry_kg', key: 'book_dry_kg', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
    { title: 'Đếm ướt (kg)', key: 'cw', width: 130, render: (_, r) => editable
      ? <InputNumber size="small" min={0} step={10} value={draft[r.id]?.wet ?? null} onChange={(v) => setDraft((d) => ({ ...d, [r.id]: { ...(d[r.id] ?? { wet: null, drc: null, lyDo: '' }), wet: v === null || v === undefined ? null : Number(v) } }))} style={{ width: '100%' }} />
      : fmtKg(r.counted_wet_kg) },
    { title: 'DRC đo', key: 'cd', width: 110, render: (_, r) => editable
      ? <InputNumber size="small" min={1} max={100} step={0.1} placeholder={String(r.book_drc_pct ?? '')} value={draft[r.id]?.drc ?? null} onChange={(v) => setDraft((d) => ({ ...d, [r.id]: { ...(d[r.id] ?? { wet: null, drc: null, lyDo: '' }), drc: v === null || v === undefined ? null : Number(v) } }))} style={{ width: '100%' }} />
      : fmtPct(r.counted_drc_pct ?? r.book_drc_pct) },
    { title: 'Đếm khô', key: 'cdry', align: 'right', render: (_, r) => {
      const d = draft[r.id]; const drc = d?.drc ?? r.book_drc_pct ?? 0
      const dry = d?.wet !== null && d?.wet !== undefined ? Math.round(d.wet * drc) / 100 : r.counted_dry_kg
      return <Text strong>{fmtKg(dry)}</Text>
    } },
    { title: 'Lệch khô', key: 'lech', align: 'right', render: (_, r) => {
      const lech = editable ? previewLech(r) : r.lech_kho_pct
      if (lech === null || lech === undefined) return '—'
      return <Text strong type={Math.abs(lech) > settings.nguong_lech_kho_pct ? 'danger' : 'success'}>{fmtSigned(lech, 2)} %</Text>
    } },
    { title: 'Lý do (nếu vượt ngưỡng)', key: 'lydo', width: 220, render: (_, r) => {
      const lech = editable ? previewLech(r) : r.lech_kho_pct
      const need = lech !== null && lech !== undefined && Math.abs(lech) > settings.nguong_lech_kho_pct
      if (!editable) return r.ly_do || (need ? <Tag color="red">Chưa ghi</Tag> : <Text type="secondary">—</Text>)
      return <Select size="small" allowClear disabled={!need} placeholder={need ? 'Bắt buộc' : 'Trong ngưỡng'} value={draft[r.id]?.lyDo || undefined} onChange={(v) => setDraft((d) => ({ ...d, [r.id]: { ...(d[r.id] ?? { wet: null, drc: null, lyDo: '' }), lyDo: v ?? '' } }))} style={{ width: '100%' }} options={LY_DO.map((v) => ({ value: v, label: v }))} />
    } },
    { title: '', key: 'save', width: 90, render: (_, r) => editable ? (
      <Button size="small" type={draft[r.id]?.wet !== null && draft[r.id]?.wet !== r.counted_wet_kg ? 'primary' : 'default'} icon={<SaveOutlined />} loading={saving === r.id} disabled={draft[r.id]?.wet === null || draft[r.id]?.wet === undefined} onClick={() => saveLine(r)}>Lưu</Button>
    ) : r.counted_at ? <Tag color="green">đã đếm</Tag> : null },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl/kiem-ke')} />
              <div>
                <Space size={8} wrap>
                  <Title level={3} style={{ margin: 0, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{st.code}</Title>
                  <Tag color={RAW_STOCKTAKE_STATUS_COLORS[st.status]}>{RAW_STOCKTAKE_STATUS_LABELS[st.status]}</Tag>
                </Space>
                <div><Text type="secondary">{st.facility_code} · ngày kiểm kê {dayjs(st.ngay_kiem_ke).format('DD/MM/YYYY')} · {st.so_lo} lô · ngưỡng lệch khô {settings.nguong_lech_kho_pct} %{st.note ? ` · ${st.note}` : ''}</Text></div>
              </div>
            </Space>
          </Col>
          <Col><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button></Col>
        </Row>

        {st.status !== 'cancelled' && (
          <Card size="small"><Steps size="small" current={stepIdx} items={[
            { title: 'Thủ kho đếm', description: st.status === 'draft' ? `${st.so_lo_chua_dem} lô chưa đếm` : `${st.counted_name ?? ''}` },
            { title: 'Duyệt · ghi sổ · khóa kỳ', description: st.approved_name ? `${st.approved_name} · ${dayjs(st.approved_at).format('DD/MM HH:mm')}` : 'BGĐ hoặc người được giao duyệt' },
            { title: 'Xong' },
          ]} /></Card>
        )}

        <Card size="small" title="Các lô" bodyStyle={{ padding: 0 }}>
          <Table<RawStocktakeLine> rowKey="id" columns={columns} dataSource={lines} size="small" pagination={false}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}><Text strong>Tổng</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><Text strong>{fmtKg(tongBook)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6} colSpan={2} />
                <Table.Summary.Cell index={8} align="right"><Text strong>{fmtKg(tongDem)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right"><Text strong type={tongBook > 0 && Math.abs((100 * (tongDem - tongBook)) / tongBook) > settings.nguong_lech_kho_pct ? 'danger' : 'success'}>{tongBook > 0 ? fmtSigned((100 * (tongDem - tongBook)) / tongBook, 2) + ' %' : '—'}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={10} colSpan={2} />
              </Table.Summary.Row>
            )} />
        </Card>

        <Card size="small" title="Ký">
          <Space wrap>
            {st.status === 'draft' && <Button type="primary" disabled={st.so_lo_chua_dem > 0 || !rawRole.perms.receive} loading={signing} onClick={() => sign('count_done')}>1 · Đếm xong, gửi duyệt{st.so_lo_chua_dem > 0 ? ` (còn ${st.so_lo_chua_dem} lô)` : ''}</Button>}
            {st.status === 'counted' && <Button type="primary" danger disabled={!rawRole.perms.approve_adjust} loading={signing} onClick={() => sign('approve')}>2 · Duyệt · ghi sổ · khóa kỳ</Button>}
            {['draft', 'counted'].includes(st.status) && <Button disabled={!rawRole.perms.cancel} loading={signing} onClick={() => sign('cancel')}>Hủy phiếu</Button>}
            {st.status === 'approved' && <Text type="success">Đã ghi sổ và khóa kỳ đến {dayjs(st.ngay_kiem_ke).format('DD/MM/YYYY')}</Text>}
          </Space>
          {st.status === 'counted' && !rawRole.perms.approve_adjust && <div style={{ marginTop: 8 }}><Text type="secondary">Bước duyệt cần BGĐ (cấp ≤ 3) hoặc người có trong bảng người duyệt điều chỉnh.</Text></div>}
        </Card>
      </Space>
    </div>
  )
}
