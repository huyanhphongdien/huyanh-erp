// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Chi tiết lệnh xuất: cân thực tế + ký ba bước (GĐ2)
// File: src/pages/wms/raw/RawIssueDetailPage.tsx · Route: /wms/nvl/xuat/:id
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Descriptions, Empty, Input, InputNumber, Modal, Row, Space, Spin, Steps, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { rawIssueService, RAW_ISSUE_PURPOSE_LABELS, RAW_ISSUE_STATUS_COLORS, RAW_ISSUE_STATUS_LABELS, type RawIssueLine, type RawIssueOrder } from '../../../services/wms/rawIssueService'
import { useRawRole } from '../../../hooks/useRawRole'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' %')
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '')

export default function RawIssueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<RawIssueOrder | null>(null)
  const [lines, setLines] = useState<RawIssueLine[]>([])
  const rawRole = useRawRole(order?.facility_id ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, number | null>>({})
  const [savingLine, setSavingLine] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const r = await rawIssueService.get(id)
      if (!r) { setOrder(null); setLines([]); return }
      setOrder(r.order); setLines(r.lines)
      setDraft(Object.fromEntries(r.lines.map((l) => [l.id, l.actual_wet_kg])))
    } catch (e: any) { setError(e?.message || 'Không tải được lệnh') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const saveLine = async (l: RawIssueLine) => {
    const v = draft[l.id]
    if (v === null || v === undefined) return
    setSavingLine(l.id)
    try { await rawIssueService.ghiCan(l.id, v); message.success(`Đã ghi ${fmtKg(v)} kg cho lô ${l.batch_no}`); await load() }
    catch (e: any) { message.error(e?.message || 'Không ghi được') }
    finally { setSavingLine(null) }
  }

  const sign = (buoc: 'submit' | 'qc_confirm' | 'receive' | 'cancel') => {
    if (!order) return
    const titles = { submit: 'Bên giao ký: đã cân xong, gửi QS?', qc_confirm: 'Giám sát chất lượng xác nhận số cân?', receive: 'Thủ kho nhận: TRỪ SỔ KHO KHÔ ngay?', cancel: 'Hủy lệnh xuất này?' }
    let reason = ''
    Modal.confirm({
      title: titles[buoc],
      content: buoc === 'receive'
        ? <div>Sổ sẽ trừ {fmtKg(lines.reduce((s, l) => s + (l.actual_wet_kg ?? 0), 0))} kg ướt theo DRC hiện tại của từng lô. Không có bước hoàn tác; sai thì BGĐ điều chỉnh.</div>
        : buoc === 'cancel' ? <Input.TextArea rows={2} placeholder="Lý do hủy" onChange={(e) => { reason = e.target.value }} /> : null,
      okText: buoc === 'cancel' ? 'Hủy lệnh' : 'Ký', okButtonProps: { danger: buoc === 'cancel' }, cancelText: 'Quay lại',
      onOk: async () => {
        setSigning(true)
        try {
          const r = await rawIssueService.ky(order.id, buoc, buoc === 'cancel' ? reason : null)
          message.success(buoc === 'receive' ? `Đã trừ sổ ${r.so_dong} lô · ${fmtKg(r.kho_kg)} kg khô` : 'Đã ký')
          await load()
        } catch (e: any) { message.error(e?.message || 'Không ký được') }
        finally { setSigning(false) }
      },
    })
  }

  if (loading && !order) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
  if (error) return <div style={{ padding: 16 }}><Alert type="error" showIcon message={error} /></div>
  if (!order) return <div style={{ padding: 16 }}><Empty description="Không tìm thấy lệnh xuất" /></div>

  const isDraft = order.status === 'draft'
  const chuaCan = lines.filter((l) => l.actual_wet_kg === null || l.actual_wet_kg <= 0).length
  const stepIdx = { draft: 0, submitted: 1, qc_confirmed: 2, received: 3, cancelled: 0 }[order.status]
  const tongUotKH = lines.reduce((s, l) => s + l.planned_wet_kg, 0)
  const tongKhoKH = lines.reduce((s, l) => s + l.planned_dry_kg, 0)
  const tongUotThuc = lines.reduce((s, l) => s + (l.actual_wet_kg ?? 0), 0)
  const tongKhoThuc = lines.reduce((s, l) => s + (l.actual_dry_kg ?? (l.actual_wet_kg ?? 0) * (l.ton_drc_pct ?? l.planned_drc_pct) / 100), 0)

  const columns: ColumnsType<RawIssueLine> = [
    { title: '#', dataIndex: 'line_no', key: 'line_no', width: 40 },
    { title: 'Lô', dataIndex: 'batch_no', key: 'batch_no', render: (v, r) => <a onClick={() => navigate(`/wms/nvl/lo/${r.batch_id}`)}><Text code>{v}</Text></a> },
    { title: 'Loại', dataIndex: 'rubber_type_name', key: 'rubber_type_name' },
    { title: 'Tuổi', dataIndex: 'tuoi_ngay', key: 'tuoi_ngay', align: 'right', render: (v) => (v === null ? '—' : `${v} ng`) },
    { title: 'Tồn ướt', dataIndex: 'ton_wet_kg', key: 'ton_wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'KH ướt', dataIndex: 'planned_wet_kg', key: 'planned_wet_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'DRC', key: 'drc', align: 'right', render: (_, r) => fmtPct(r.actual_drc_pct ?? r.ton_drc_pct ?? r.planned_drc_pct) },
    { title: 'Cân thực (kg ướt) · gõ rồi bấm Lưu', key: 'actual', width: 260, render: (_, r) => isDraft ? (
      <Space.Compact style={{ width: '100%' }}>
        <InputNumber min={0} max={r.ton_wet_kg ?? undefined} step={10} value={draft[r.id] ?? null} onChange={(v) => setDraft((d) => ({ ...d, [r.id]: v === null || v === undefined ? null : Number(v) }))} onPressEnter={() => saveLine(r)} style={{ flex: 1 }} disabled={!rawRole.perms.submit} placeholder="kg cân" />
        <Button type={draft[r.id] !== null && draft[r.id] !== undefined && draft[r.id] !== r.actual_wet_kg ? 'primary' : 'default'} icon={<SaveOutlined />} loading={savingLine === r.id} disabled={!rawRole.perms.submit || draft[r.id] === null || draft[r.id] === undefined || draft[r.id] === r.actual_wet_kg} onClick={() => saveLine(r)}>Lưu</Button>
      </Space.Compact>
    ) : <Text strong>{fmtKg(r.actual_wet_kg)}</Text> },
    { title: 'Khô trừ sổ', key: 'dry', align: 'right', render: (_, r) => r.actual_dry_kg !== null ? <Text strong>{fmtKg(r.actual_dry_kg)}</Text> : r.actual_wet_kg ? <Text type="secondary">≈ {fmtKg(r.actual_wet_kg * (r.ton_drc_pct ?? r.planned_drc_pct) / 100)}</Text> : <Text type="secondary">—</Text> },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl/xuat')} />
              <div>
                <Space size={8} wrap>
                  <Title level={3} style={{ margin: 0, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{order.code}</Title>
                  <Tag color={RAW_ISSUE_STATUS_COLORS[order.status]}>{RAW_ISSUE_STATUS_LABELS[order.status]}</Tag>
                  <Tag>{RAW_ISSUE_PURPOSE_LABELS[order.muc_dich]}</Tag>
                  {order.production_code && <Tag color="blue">LSX {order.production_code}{order.production_grade ? ` · ${order.production_grade}` : ''}</Tag>}
                </Space>
                <div><Text type="secondary">{order.facility_code} · tạo {fmtTime(order.created_at)}{order.nhu_cau_kho_kg ? ` · nhu cầu ${fmtKg(order.nhu_cau_kho_kg)} kg khô` : ''}{order.note ? ` · ${order.note}` : ''}</Text></div>
              </div>
            </Space>
          </Col>
          <Col><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button></Col>
        </Row>

        {order.status !== 'cancelled' && (
          <Card size="small">
            <Steps size="small" current={stepIdx} items={[
              { title: 'Cân từng lô', description: isDraft ? `${chuaCan} dòng chưa cân` : 'xong' },
              { title: 'Bên giao ký', description: order.submitted_name ? `${order.submitted_name} · ${fmtTime(order.submitted_at)}` : undefined },
              { title: 'QS xác nhận', description: order.qc_confirmed_name ? `${order.qc_confirmed_name} · ${fmtTime(order.qc_confirmed_at)}` : undefined },
              { title: 'Thủ kho nhận · trừ sổ', description: order.received_name ? `${order.received_name} · ${fmtTime(order.received_at)}` : undefined },
            ]} />
          </Card>
        )}
        {order.status === 'cancelled' && <Alert type="error" showIcon message={`Lệnh đã hủy ${fmtTime(order.cancelled_at)}`} description={order.cancel_reason || undefined} />}
        {!rawRole.perms.co_thu_kho && <Alert type="info" showIcon message="Chưa chỉ định thủ kho — bước 'nhận' đang mở cho mọi người." />}

        <Card size="small" title="Các lô xuất" bodyStyle={{ padding: 0 }}>
          <Table<RawIssueLine> rowKey="id" columns={columns} dataSource={lines} size="small" pagination={false}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}><Text strong>Tổng</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><Text strong>{fmtKg(tongUotKH)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right"><Text type="secondary">KH khô {fmtKg(tongKhoKH)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={7}><Text strong>{fmtKg(tongUotThuc)} kg</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right"><Text strong>{fmtKg(tongKhoThuc)}</Text></Table.Summary.Cell>
              </Table.Summary.Row>
            )} />
        </Card>

        <Row gutter={[12, 12]}>
          <Col xs={24} md={14}>
            <Card size="small" title="Ký">
              <Space wrap>
                {isDraft && <Button type="primary" disabled={chuaCan > 0 || !rawRole.perms.submit} loading={signing} onClick={() => sign('submit')}>1 · Bên giao ký ({chuaCan > 0 ? `còn ${chuaCan} dòng chưa cân` : 'đã cân đủ'})</Button>}
                {order.status === 'submitted' && <Button type="primary" disabled={!rawRole.perms.qc_confirm} loading={signing} onClick={() => sign('qc_confirm')}>2 · QS xác nhận</Button>}
                {order.status === 'qc_confirmed' && <Button type="primary" danger disabled={!rawRole.perms.receive} loading={signing} onClick={() => sign('receive')}>3 · Thủ kho nhận · trừ sổ</Button>}
                {['draft', 'submitted', 'qc_confirmed'].includes(order.status) && <Button disabled={!rawRole.perms.cancel} loading={signing} onClick={() => sign('cancel')}>Hủy lệnh</Button>}
                {order.status === 'received' && <Text type="success">Đã trừ sổ {fmtKg(order.actual_dry_kg)} kg khô lúc {fmtTime(order.received_at)}</Text>}
              </Space>
              {order.status === 'submitted' && !rawRole.perms.qc_confirm && <div style={{ marginTop: 8 }}><Text type="secondary">Bước này cần tài khoản phòng QC (HAP-QC) hoặc BGĐ.</Text></div>}
              {order.status === 'qc_confirmed' && !rawRole.perms.receive && <div style={{ marginTop: 8 }}><Text type="secondary">Bước này cần thủ kho NVL hoặc BGĐ.</Text></div>}
            </Card>
          </Col>
          <Col xs={24} md={10}>
            <Card size="small" title="Luật">
              <Descriptions size="small" column={1} colon={false} labelStyle={{ color: '#6B7280', width: 120 }}>
                <Descriptions.Item label="Trừ sổ">kg cân thực × DRC hiện tại của lô, tại bước thủ kho nhận</Descriptions.Item>
                <Descriptions.Item label="Lô dư">giữ nguyên mã lô và DRC, tồn giảm đúng kg đã lấy</Descriptions.Item>
                <Descriptions.Item label="Lệnh SX">{order.production_code ? 'ghi lô nguồn + DRC vào lệnh SX để truy xuất' : 'không gắn'}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  )
}
