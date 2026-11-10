// ============================================================================
// FleetPaymentRequestDetailPage — chi tiết Đề nghị thanh toán chi phí xe (/logistics/costs/payment-requests/:id)
// File: src/pages/logistics/costs/FleetPaymentRequestDetailPage.tsx
//
// Luồng y như thanh toán mủ: Nháp (sửa dòng, thêm dòng tay) → Gửi duyệt → Duyệt (kế toán/BGĐ,
// khoá chi phí các chuyến) → Đánh dấu đã chi; Trả về nháp; Huỷ (nhả chuyến + tạm ứng). In A4 cùng mẫu.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Breadcrumb, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Select, Skeleton, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ArrowLeftOutlined, CheckCircleOutlined, DeleteOutlined, DollarOutlined, EditOutlined, LockOutlined, PlusOutlined, PrinterOutlined, SendOutlined, StopOutlined, UndoOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuthStore } from '../../../stores/authStore'
import { isFinanceUser } from '../../../lib/financeAccess'
import { fmtAmt } from '../../../services/logistics/fleetCostService'
import {
  fleetPaymentRequestService, FLEET_PR_METHOD_LABELS,
  type FleetPaymentRequest, type FleetPaymentRequestLine, type FleetPrPaymentMethod,
} from '../../../services/logistics/fleetPaymentRequestService'
import { AMBER, BRAND, INK_2, Kpi, MONO, OK, PrStatusTag, RED, thousands } from './fleetCostUi'

const { Text } = Typography
const fmtD = (iso?: string | null) => (iso ? dayjs(iso).format('DD/MM/YYYY') : '–')
const fmtDt = (iso?: string | null) => (iso ? dayjs(iso).format('DD/MM/YYYY HH:mm') : '–')
const LINE_TYPE: Record<string, { label: string; color: string }> = {
  trip: { label: 'Chuyến', color: 'blue' }, advance: { label: 'Trừ tạm ứng', color: 'orange' }, manual: { label: 'Khoản tay', color: 'default' },
}

export default function FleetPaymentRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canApprove = isFinanceUser(user)
  const [req, setReq] = useState<FleetPaymentRequest | null>(null)
  const [lines, setLines] = useState<FleetPaymentRequestLine[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoForm] = Form.useForm()
  const [lineOpen, setLineOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<FleetPaymentRequestLine | null>(null)
  const [lineForm] = Form.useForm()

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fleetPaymentRequestService.getById(id)
      if (!res) { message.error('Không tìm thấy đề nghị'); navigate('/logistics/costs'); return }
      setReq(res.request); setLines(res.lines)
    } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    finally { setLoading(false) }
  }, [id, navigate])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setActing(true)
    try { await fn(); message.success(okMsg); load() }
    catch (e: any) { message.error(e?.message || String(e)) }
    finally { setActing(false) }
  }

  const openInfo = () => {
    if (!req) return
    infoForm.setFieldsValue({ request_date: req.request_date, payee_name: req.payee_name || '', payment_method: req.payment_method, payee_account: req.payee_account || '', title: req.title || '', reason: req.reason || '', note: req.note || '' })
    setInfoOpen(true)
  }
  const saveInfo = async () => {
    const v = await infoForm.validateFields()
    await act(() => fleetPaymentRequestService.updateRequest(req!.id, v), 'Đã lưu')
    setInfoOpen(false)
  }
  const openLine = (l?: FleetPaymentRequestLine) => {
    setEditingLine(l || null)
    lineForm.setFieldsValue(l ? { description: l.description, amount: Math.abs(l.amount), note: l.note || '' } : { description: '', amount: undefined, note: '' })
    setLineOpen(true)
  }
  const saveLine = async () => {
    const v = await lineForm.validateFields()
    await act(async () => {
      if (editingLine) await fleetPaymentRequestService.updateLine(editingLine.id, { description: v.description, amount: editingLine.line_type === 'advance' ? -Math.abs(v.amount) : v.amount, note: v.note })
      else await fleetPaymentRequestService.addManualLine(req!.id, { description: v.description, amount: v.amount, note: v.note })
    }, editingLine ? 'Đã sửa dòng' : 'Đã thêm dòng')
    setLineOpen(false)
  }

  if (loading || !req) return <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}><Card><Skeleton active /></Card></div>
  const editable = req.status === 'draft'
  const [y, m] = (req.period_ym || '').split('-')

  const columns = [
    { title: '#', width: 44, render: (_: unknown, __: FleetPaymentRequestLine, i: number) => i + 1 },
    { title: 'Loại', dataIndex: 'line_type', width: 110, render: (v: string) => <Tag color={LINE_TYPE[v]?.color} style={{ margin: 0 }}>{LINE_TYPE[v]?.label || v}</Tag> },
    { title: 'Nội dung', dataIndex: 'description', render: (v: string, l: FleetPaymentRequestLine) => (
      <div>
        <div>{v}</div>
        {l.dispatch_order && <a style={{ ...MONO, fontSize: 12 }} onClick={() => navigate(`/logistics/dispatch/${l.dispatch_order!.id}`)}>mở lệnh {l.dispatch_order.code}</a>}
      </div>
    ) },
    { title: 'ĐVT', dataIndex: 'unit', width: 70, align: 'center' as const, render: (v: string | null) => v || '' },
    { title: 'SL', dataIndex: 'qty', width: 60, align: 'right' as const, render: (v: number) => <span style={MONO}>{fmtAmt(v)}</span> },
    { title: 'Đơn giá', dataIndex: 'unit_price', width: 120, align: 'right' as const, render: (v: number | null) => <span style={MONO}>{v != null ? fmtAmt(v) : ''}</span> },
    { title: 'Thành tiền', dataIndex: 'amount', width: 140, align: 'right' as const, render: (v: number) => <b style={{ ...MONO, color: v < 0 ? RED : undefined }}>{v < 0 ? '−' : ''}{fmtAmt(Math.abs(v))} ₫</b> },
    { title: 'Ghi chú', dataIndex: 'note', render: (v: string | null) => <span style={{ fontSize: 12, color: INK_2 }}>{v || ''}</span> },
    ...(editable ? [{ title: '', width: 80, render: (_: unknown, l: FleetPaymentRequestLine) => (
      <Space size={0}>
        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openLine(l)} />
        <Popconfirm title="Bỏ dòng này khỏi phiếu?" description={l.line_type === 'trip' ? 'Chuyến sẽ được nhả để gom phiếu khác.' : l.line_type === 'advance' ? 'Tạm ứng sẽ quay về trạng thái chưa đối soát.' : undefined} onConfirm={() => act(() => fleetPaymentRequestService.removeLine(l), 'Đã bỏ dòng')} okText="Bỏ" cancelText="Huỷ">
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ) }] : []),
  ]

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb style={{ marginBottom: 8 }} items={[{ title: <a onClick={() => navigate('/logistics/costs')}>Sổ chi phí đội xe</a> }, { title: 'Đề nghị thanh toán' }, { title: req.code }]} />
      <Card style={{ marginBottom: 14 }} styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <Space align="start" size={12}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/logistics/costs')} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: BRAND, ...MONO }}>{req.code}</span>
                <PrStatusTag status={req.status} />
                {req.status === 'approved' && <Tag icon={<LockOutlined />} style={{ margin: 0 }}>chi phí chuyến đã khoá</Tag>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{req.title || 'Đề nghị thanh toán chi phí xe'}</div>
              <div style={{ fontSize: 12.5, color: INK_2 }}>Lập {fmtDt(req.created_at)}{req.created_by_name ? ` · ${req.created_by_name}` : ''}{req.approved_at ? ` · Duyệt ${fmtDt(req.approved_at)}${req.approved_by_name ? ` bởi ${req.approved_by_name}` : ''}` : ''}{req.paid_at ? ` · Đã chi ${fmtDt(req.paid_at)}${req.paid_by_name ? ` bởi ${req.paid_by_name}` : ''}` : ''}</div>
            </div>
          </Space>
          <Space wrap>
            <Button icon={<PrinterOutlined />} onClick={() => navigate(`/logistics/costs/payment-requests/${req.id}/print`)}>In phiếu</Button>
            {editable && <Button icon={<EditOutlined />} onClick={openInfo}>Sửa thông tin</Button>}
            {req.status === 'draft' && (
              <Popconfirm title="Gửi duyệt phiếu này?" onConfirm={() => act(() => fleetPaymentRequestService.submit(req.id), 'Đã gửi duyệt')} okText="Gửi" cancelText="Huỷ" disabled={!lines.length}>
                <Button type="primary" icon={<SendOutlined />} loading={acting} disabled={!lines.length} style={lines.length ? { background: '#E8A838', borderColor: '#E8A838', color: '#0D2E25', fontWeight: 600 } : undefined}>Gửi duyệt</Button>
              </Popconfirm>
            )}
            {req.status === 'submitted' && (
              <Tooltip title={canApprove ? '' : 'Chỉ kế toán / BGĐ duyệt'}>
                <Popconfirm title="Duyệt đề nghị thanh toán?" description="Chi phí các chuyến trong phiếu sẽ bị khoá, không sửa được nữa." onConfirm={() => act(() => fleetPaymentRequestService.approve(req.id), 'Đã duyệt')} okText="Duyệt" cancelText="Huỷ" disabled={!canApprove}>
                  <Button type="primary" icon={<CheckCircleOutlined />} loading={acting} disabled={!canApprove}>Duyệt</Button>
                </Popconfirm>
              </Tooltip>
            )}
            {req.status === 'approved' && (
              <Tooltip title={canApprove ? '' : 'Chỉ kế toán / BGĐ xác nhận chi'}>
                <Popconfirm title={`Xác nhận đã chi ${fmtAmt(Math.abs(req.net_amount))} ₫ cho ${req.payee_name || 'tài xế'}?`} onConfirm={() => act(() => fleetPaymentRequestService.markPaid(req.id), 'Đã ghi nhận chi')} okText="Đã chi" cancelText="Huỷ" disabled={!canApprove}>
                  <Button type="primary" icon={<DollarOutlined />} loading={acting} disabled={!canApprove} style={{ background: OK, borderColor: OK }}>Đánh dấu đã chi</Button>
                </Popconfirm>
              </Tooltip>
            )}
            {(req.status === 'submitted' || req.status === 'approved') && (
              <Popconfirm title="Trả phiếu về Nháp để sửa?" onConfirm={() => act(() => fleetPaymentRequestService.revertToDraft(req.id), 'Đã trả về nháp')} okText="Trả về" cancelText="Huỷ">
                <Button icon={<UndoOutlined />}>Trả về nháp</Button>
              </Popconfirm>
            )}
            {['draft', 'submitted', 'approved'].includes(req.status) && (
              <Popconfirm title="Huỷ phiếu này?" description="Chuyến và tạm ứng trong phiếu được nhả để gom phiếu khác." onConfirm={() => act(() => fleetPaymentRequestService.cancel(req.id), 'Đã huỷ phiếu')} okText="Huỷ phiếu" cancelText="Không">
                <Button danger icon={<StopOutlined />}>Huỷ</Button>
              </Popconfirm>
            )}
            {req.status === 'draft' && (
              <Popconfirm title="Xoá hẳn phiếu nháp?" onConfirm={() => act(async () => { await fleetPaymentRequestService.remove(req.id); navigate('/logistics/costs') }, 'Đã xoá')} okText="Xoá" cancelText="Huỷ">
                <Button danger type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi label="Chi phí được tính" value={`${fmtAmt(req.total_expense)} ₫`} sub={`${lines.filter((l) => l.line_type === 'trip').length} chuyến · ${lines.filter((l) => l.line_type === 'manual').length} khoản tay`} />
        <Kpi label="Trừ tạm ứng" value={`${fmtAmt(req.total_advance)} ₫`} sub={`${lines.filter((l) => l.line_type === 'advance').length} phiếu tạm ứng`} tone={AMBER} />
        <Kpi label={req.net_amount < 0 ? 'Tài xế nộp lại' : 'Thực chi cho tài xế'} value={`${fmtAmt(Math.abs(req.net_amount))} ₫`} sub={req.payee_name || req.driver?.full_name || ''} tone={req.net_amount < 0 ? RED : OK} />
      </div>
      {req.net_amount < 0 && <Alert type="warning" showIcon style={{ marginBottom: 14 }} message="Tạm ứng lớn hơn chi phí: tài xế phải nộp lại phần chênh. Nếu muốn giữ tạm ứng cho kỳ sau, bỏ bớt dòng tạm ứng khỏi phiếu." />}

      <Card title="Thông tin phiếu" size="small" style={{ marginBottom: 14 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }} labelStyle={{ fontWeight: 600, fontSize: 12 }}>
          <Descriptions.Item label="Ngày phiếu">{fmtD(req.request_date)}</Descriptions.Item>
          <Descriptions.Item label="Kỳ chi phí">{m ? `Tháng ${m}/${y}` : '–'}</Descriptions.Item>
          <Descriptions.Item label="Tài xế">{req.driver?.full_name || '–'}</Descriptions.Item>
          <Descriptions.Item label="Người nhận tiền">{req.payee_name || '–'}</Descriptions.Item>
          <Descriptions.Item label="Hình thức">{FLEET_PR_METHOD_LABELS[req.payment_method]}</Descriptions.Item>
          <Descriptions.Item label="Tài khoản nhận">{req.payee_account || '–'}</Descriptions.Item>
          <Descriptions.Item label="Lý do" span={2}>{req.reason || '–'}</Descriptions.Item>
          {req.note && <Descriptions.Item label="Ghi chú" span={4}>{req.note}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Card title={`Các dòng (${lines.length})`} size="small" extra={editable && <Button size="small" icon={<PlusOutlined />} onClick={() => openLine()}>Thêm khoản tay</Button>}>
        <Table rowKey="id" size="small" pagination={false} dataSource={lines} columns={columns as any} scroll={{ x: 900 }}
          locale={{ emptyText: 'Phiếu chưa có dòng nào' }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#FFFBEB', fontWeight: 700 }}>
                <Table.Summary.Cell index={0} colSpan={6} align="right">{req.net_amount < 0 ? 'TÀI XẾ NỘP LẠI' : 'TỔNG CỘNG THỰC CHI'}</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><span style={{ ...MONO, color: '#92400E', fontSize: 15 }}>{fmtAmt(Math.abs(req.net_amount))} ₫</span></Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={editable ? 2 : 1} />
              </Table.Summary.Row>
            </Table.Summary>
          )} />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>Dòng chuyến = chi được tính của chuyến quy đổi VNĐ (không gồm cước thuê xe ngoài). Dòng tạm ứng là khấu trừ. Khoản LAK quy đổi theo tỷ giá từng khoản.</Text>
      </Card>

      <Modal title="Thông tin phiếu" open={infoOpen} onOk={saveInfo} confirmLoading={acting} onCancel={() => setInfoOpen(false)} okText="Lưu" cancelText="Huỷ" destroyOnHidden>
        <Form form={infoForm} layout="vertical" style={{ marginTop: 12 }}>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="request_date" label="Ngày phiếu" rules={[{ required: true }]} style={{ width: 160 }}><Input type="date" /></Form.Item>
            <Form.Item name="payee_name" label="Người nhận tiền" style={{ flex: 1 }}><Input maxLength={120} /></Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="payment_method" label="Hình thức nhận tiền" style={{ width: 220 }}>
              <Select options={(Object.keys(FLEET_PR_METHOD_LABELS) as FleetPrPaymentMethod[]).map((k) => ({ value: k, label: FLEET_PR_METHOD_LABELS[k] }))} />
            </Form.Item>
            <Form.Item name="payee_account" label="Tài khoản nhận (nếu chuyển khoản)" style={{ flex: 1 }}><Input maxLength={160} /></Form.Item>
          </Space>
          <Form.Item name="title" label="Tiêu đề (in dưới chữ ĐỀ NGHỊ THANH TOÁN)"><Input maxLength={160} /></Form.Item>
          <Form.Item name="reason" label="Lý do thanh toán"><Input.TextArea rows={2} maxLength={400} /></Form.Item>
          <Form.Item name="note" label="Ghi chú nội bộ"><Input maxLength={300} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingLine ? 'Sửa dòng' : 'Thêm khoản tay'} open={lineOpen} onOk={saveLine} confirmLoading={acting} onCancel={() => setLineOpen(false)} okText="Lưu" cancelText="Huỷ" destroyOnHidden>
        <Form form={lineForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="description" label="Nội dung" rules={[{ required: true, message: 'Nhập nội dung' }]}><Input maxLength={300} /></Form.Item>
          <Form.Item name="amount" label={editingLine?.line_type === 'advance' ? 'Số tiền khấu trừ (₫)' : 'Số tiền (₫)'} rules={[{ required: true, message: 'Nhập số tiền' }, { type: 'number', min: 1, message: 'Phải > 0' }]}>
            <InputNumber min={0} {...thousands} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input maxLength={300} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
