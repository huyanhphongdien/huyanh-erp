// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Phiếu kiểm kê: đếm từng lô, duyệt ghi sổ (GĐ3)
// File: src/pages/wms/raw/RawStocktakeDetailPage.tsx · Route: /wms/nvl/kiem-ke/:id
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Input, InputNumber, Modal, Row, Select, Space, Spin, Steps, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, ReloadOutlined, SaveOutlined, MobileOutlined } from '@ant-design/icons'
import { useIsPhone } from '../../../hooks/useIsPhone'
import { rawStocktakeService, RAW_STOCKTAKE_STATUS_COLORS, RAW_STOCKTAKE_STATUS_LABELS, type RawStocktake, type RawStocktakeLine } from '../../../services/wms/rawStocktakeService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { fmtKg, fmtPct, fmtSigned, fmtDate, fmtDateTime } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'

const { Title, Text } = Typography
const LY_DO = ['Tạp chất / đất lẫn', 'Mẫu DRC đầu vào không đại diện', 'Cân sai lúc nhập', 'Lô chồng lẫn, cân lẫn lô', 'Mất mát / thất thoát', 'Khác']
type Draft = { wet: number | null; drc: number | null; lyDo: string }

export default function RawStocktakeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const [st, setSt] = useState<RawStocktake | null>(null)
  const [lines, setLines] = useState<RawStocktakeLine[]>([])
  const rawRole = useRawRole(st?.facility_id ?? null)
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, Draft>>({})
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
    } catch (e: any) { setError(dichLoiHeThong(e, 'Không tải được phiếu')) }
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

  // Dòng có số đếm khác số đã lưu (để tô nút Lưu + gom "Lưu tất cả")
  const isDirty = (l: RawStocktakeLine) => {
    const d = draft[l.id]
    if (!d || d.wet === null) return false
    return d.wet !== l.counted_wet_kg || (d.drc ?? null) !== (l.counted_drc_pct ?? null) || (d.lyDo || '') !== (l.ly_do || '')
  }
  const thieuLyDo = (l: RawStocktakeLine) => {
    const lech = previewLech(l)
    return lech !== null && Math.abs(lech) > settings.nguong_lech_kho_pct && !draft[l.id]?.lyDo ? lech : null
  }

  // Ghi xong một dòng thì cập nhật ĐÚNG dòng đó trong state — không tải lại cả phiếu (finding #6):
  // tải lại vừa chậm vừa reset nháp của các dòng khác đang gõ dở.
  const applySaved = (l: RawStocktakeLine, d: Draft, r: Awaited<ReturnType<typeof rawStocktakeService.ghiDem>>) => {
    setLines((ls) => ls.map((x) => (x.id === l.id ? {
      ...x, counted_wet_kg: d.wet, counted_drc_pct: d.drc, counted_dry_kg: r.counted_dry_kg, chenh_kho_kg: r.chenh_kho_kg,
      lech_kho_pct: r.lech_kho_pct, ly_do: d.lyDo || null, counted_at: x.counted_at ?? new Date().toISOString(),
    } : x)))
    if (!l.counted_at) setSt((s) => (s ? { ...s, so_lo_chua_dem: Math.max(0, s.so_lo_chua_dem - 1) } : s))
  }

  const saveLine = async (l: RawStocktakeLine) => {
    const d = draft[l.id]
    if (!d || d.wet === null) return
    const lech = thieuLyDo(l)
    if (lech !== null) { message.warning(`Lô ${l.batch_no} lệch khô ${fmtSigned(lech, 2)} %, chọn lý do`); return }
    setSaving(l.id)
    try { const r = await rawStocktakeService.ghiDem(l.id, d.wet, d.drc, d.lyDo || null); applySaved(l, d, r); message.success(`Đã lưu lô ${l.batch_no}`, 1) }
    catch (e: any) { message.error(dichLoiHeThong(e, 'Không ghi được')) }
    finally { setSaving(null) }
  }

  // Lưu mọi dòng đã gõ mà chưa lưu — cùng luật chặn thiếu lý do như "Lưu tất cả" của Đối chiếu giấy – máy
  const saveAll = async () => {
    const todo = lines.filter(isDirty)
    if (!todo.length) { message.info('Không có dòng nào cần lưu'); return }
    const thieu = todo.find((l) => thieuLyDo(l) !== null)
    if (thieu) { message.warning(`Lô ${thieu.batch_no}: lệch khô vượt ${settings.nguong_lech_kho_pct} %, chọn lý do trước`); return }
    setSaving('*')
    let ok = 0
    try {
      for (const l of todo) {
        const d = draft[l.id]
        const r = await rawStocktakeService.ghiDem(l.id, d.wet as number, d.drc, d.lyDo || null)
        applySaved(l, d, r); ok++
      }
      message.success(`Đã lưu ${ok} lô`)
    } catch (e: any) {
      message.error(`${ok ? `Đã lưu ${ok}/${todo.length} lô. ` : ''}${dichLoiHeThong(e, 'Không ghi được')}`)
    } finally { setSaving(null) }
  }

  const sign = (buoc: 'count_done' | 'approve' | 'cancel') => {
    if (!st) return
    // Ký "đếm xong" sẽ tải lại phiếu → số đã gõ mà chưa lưu sẽ mất: bắt lưu trước
    const chuaLuu = lines.filter(isDirty).length
    if (buoc === 'count_done' && chuaLuu > 0) { message.warning(`Còn ${chuaLuu} dòng đã gõ mà chưa lưu — bấm "Lưu tất cả" trước khi gửi duyệt`); return }
    const chenh = lines.reduce((s, l) => s + (l.chenh_kho_kg ?? 0), 0)
    Modal.confirm({
      title: buoc === 'count_done' ? 'Đếm xong, gửi duyệt?' : buoc === 'approve' ? 'Duyệt kiểm kê: GHI ĐIỀU CHỈNH VÀO SỔ và khóa kỳ?' : 'Hủy phiếu kiểm kê?',
      content: buoc === 'approve' ? `Chênh khô tổng ${fmtSigned(chenh)} kg · ${lines.filter((l) => (l.lech_kho_pct ?? 0) !== 0).length} lô có chênh. Sau duyệt, sổ khóa đến ${fmtDate(st.ngay_kiem_ke)}.` : undefined,
      okText: buoc === 'cancel' ? 'Hủy phiếu' : 'Xác nhận', okButtonProps: { danger: buoc !== 'count_done' }, cancelText: 'Quay lại',
      onOk: async () => {
        setSigning(true)
        try {
          const r = await rawStocktakeService.ky(st.id, buoc)
          message.success(buoc === 'approve' ? `Đã ghi sổ ${r.so_lo_dieu_chinh} lô · chênh ${fmtSigned(r.chenh_kho_kg)} kg khô` : 'Đã cập nhật')
          await load()
        } catch (e: any) { message.error(dichLoiHeThong(e, 'Không thực hiện được')) }
        finally { setSigning(false) }
      },
    })
  }

  if (loading && !st) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
  if (error) return <div style={{ padding: 16 }}><Alert type="error" showIcon message={error} action={<Button size="small" onClick={load}>Thử lại</Button>} /></div>
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
      ? <InputNumber size="small" min={0} step={10} value={draft[r.id]?.wet ?? null} onChange={(v) => setDraft((d) => ({ ...d, [r.id]: { ...(d[r.id] ?? { wet: null, drc: null, lyDo: '' }), wet: v === null || v === undefined ? null : Number(v) } }))} onPressEnter={() => saveLine(r)} style={{ width: '100%' }} />
      : fmtKg(r.counted_wet_kg) },
    { title: 'DRC đo', key: 'cd', width: 110, render: (_, r) => editable
      ? <InputNumber size="small" min={1} max={100} step={0.1} placeholder={String(r.book_drc_pct ?? '')} value={draft[r.id]?.drc ?? null} onChange={(v) => setDraft((d) => ({ ...d, [r.id]: { ...(d[r.id] ?? { wet: null, drc: null, lyDo: '' }), drc: v === null || v === undefined ? null : Number(v) } }))} onPressEnter={() => saveLine(r)} style={{ width: '100%' }} />
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
      <Button size="small" type={isDirty(r) ? 'primary' : 'default'} icon={<SaveOutlined />} loading={saving === r.id} disabled={draft[r.id]?.wet === null || draft[r.id]?.wet === undefined || saving === '*'} onClick={() => saveLine(r)}>Lưu</Button>
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
                <div><Text type="secondary">{st.facility_code} · ngày kiểm kê {fmtDate(st.ngay_kiem_ke)} · {st.so_lo} lô · ngưỡng lệch khô {settings.nguong_lech_kho_pct} %{st.note ? ` · ${st.note}` : ''}</Text></div>
              </div>
            </Space>
          </Col>
          <Col><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button></Col>
        </Row>

        {isPhone && (
          <Alert type="info" showIcon message="Đang mở trên điện thoại — bản điện thoại đếm từng lô dễ hơn"
            action={<Button size="small" type="primary" icon={<MobileOutlined />} onClick={() => navigate('/m/kho/kiem-ke')}>Mở bản điện thoại</Button>} />
        )}
        {st.status !== 'cancelled' && (
          <Card size="small"><Steps size="small" current={stepIdx} items={[
            { title: 'Thủ kho đếm', description: st.status === 'draft' ? `${st.so_lo_chua_dem} lô chưa đếm` : `${st.counted_name ?? ''}` },
            { title: 'Duyệt · ghi sổ · khóa kỳ', description: st.approved_name ? `${st.approved_name} · ${fmtDateTime(st.approved_at)}` : 'BGĐ hoặc người được giao duyệt' },
            { title: 'Xong' },
          ]} /></Card>
        )}

        <Card size="small" title="Các lô" bodyStyle={{ padding: 0 }}
          extra={editable ? (
            <Space size={8}>
              <Text type="secondary" style={{ fontSize: 12 }}>gõ số rồi Enter để lưu dòng</Text>
              <Button type="primary" size="small" icon={<SaveOutlined />} loading={saving === '*'} disabled={!lines.some(isDirty) || (saving !== null && saving !== '*')} onClick={saveAll}>
                Lưu tất cả{lines.filter(isDirty).length ? ` (${lines.filter(isDirty).length})` : ''}
              </Button>
            </Space>
          ) : null}>
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
            {st.status === 'approved' && <Text type="success">Đã ghi sổ và khóa kỳ đến {fmtDate(st.ngay_kiem_ke)}</Text>}
          </Space>
          {st.status === 'counted' && !rawRole.perms.approve_adjust && <div style={{ marginTop: 8 }}><Text type="secondary">Bước duyệt cần BGĐ (cấp ≤ 3) hoặc người có trong bảng người duyệt điều chỉnh.</Text></div>}
        </Card>
      </Space>
    </div>
  )
}
