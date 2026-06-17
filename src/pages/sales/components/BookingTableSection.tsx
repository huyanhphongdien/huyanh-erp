// ============================================================================
// BOOKING TABLE SECTION — Nhiều booking/lô cho 1 đơn (Mức 2, tab Vận chuyển)
// File: src/pages/sales/components/BookingTableSection.tsx
// ============================================================================
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Button, Modal, Form, Input, InputNumber, DatePicker, Tag, Tooltip,
  Popconfirm, message, Space,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, FilePdfOutlined, EyeOutlined, PaperClipOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesBookingService, type SalesBooking } from '../../../services/sales/salesBookingService'

const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')

export default function BookingTableSection({ orderId, canEdit }: { orderId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<SalesBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SalesBooking | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file_url: string; file_name: string } | null>(null)
  const [form] = Form.useForm()
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await salesBookingService.list(orderId)) } catch { /* ignore */ }
    setLoading(false)
  }, [orderId])
  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setEditing(null); setPendingFile(null)
    form.resetFields()
    form.setFieldsValue({ lot_label: `Lot ${rows.length + 1}` })
    setOpen(true)
  }
  const openEdit = (b: SalesBooking) => {
    setEditing(b)
    setPendingFile(b.file_url ? { file_url: b.file_url, file_name: b.file_name || 'file' } : null)
    form.setFieldsValue({
      ...b,
      etd: b.etd ? dayjs(b.etd) : null,
      eta: b.eta ? dayjs(b.eta) : null,
    })
    setOpen(true)
  }

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const r = await salesBookingService.uploadFile(orderId, file)
      setPendingFile(r)
      message.success('Đã tải file: ' + r.file_name)
    } catch (e: unknown) {
      message.error('Tải file lỗi: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setUploading(false) }
  }

  const handleSave = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const input = {
        lot_label: v.lot_label || null,
        booking_no: v.booking_no || null,
        shipping_line: v.shipping_line || null,
        vessel_name: v.vessel_name || null,
        voyage_no: v.voyage_no || null,
        etd: v.etd ? v.etd.format('YYYY-MM-DD') : null,
        eta: v.eta ? v.eta.format('YYYY-MM-DD') : null,
        cutoff: v.cutoff || null,
        container_count: v.container_count ?? null,
        port_of_loading: v.port_of_loading || null,
        port_of_destination: v.port_of_destination || null,
        bl_number: v.bl_number || null,
        file_url: pendingFile?.file_url || null,
        file_name: pendingFile?.file_name || null,
        notes: v.notes || null,
      }
      if (editing) await salesBookingService.update(editing.id, input)
      else await salesBookingService.create(orderId, input)
      message.success('Đã lưu booking')
      setOpen(false)
      load()
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return
      message.error('Lưu lỗi: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setSaving(false) }
  }

  const handleDelete = async (b: SalesBooking) => {
    try { await salesBookingService.remove(b.id); message.success('Đã xóa'); load() }
    catch (e: unknown) { message.error('Xóa lỗi: ' + (e instanceof Error ? e.message : String(e))) }
  }

  const columns: ColumnsType<SalesBooking> = [
    { title: 'Lô', dataIndex: 'lot_label', width: 70, render: (v) => v ? <Tag color="blue">{v}</Tag> : '—' },
    { title: 'Số booking', dataIndex: 'booking_no', width: 120, render: (v) => v ? <b>{v}</b> : '—' },
    { title: 'Hãng tàu', dataIndex: 'shipping_line', width: 100, render: (v) => v || '—' },
    {
      title: 'Tàu / Voy', key: 'vessel', width: 150,
      render: (_, r) => r.vessel_name ? `${r.vessel_name}${r.voyage_no ? ' ' + r.voyage_no : ''}` : '—',
    },
    { title: 'ETD', dataIndex: 'etd', width: 95, render: fDate },
    { title: 'ETA', dataIndex: 'eta', width: 95, render: fDate },
    { title: 'Cutoff', dataIndex: 'cutoff', width: 100, render: (v) => v || '—' },
    { title: 'Cont', dataIndex: 'container_count', width: 55, align: 'right', render: (v) => v ?? '—' },
    {
      title: 'File', key: 'file', width: 56, align: 'center',
      render: (_, r) => r.file_url
        ? <Tooltip title={r.file_name || 'Xem file'}><Button type="text" size="small" icon={<FilePdfOutlined style={{ color: '#cf1322' }} />} onClick={() => window.open(r.file_url!, '_blank')} /></Tooltip>
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    ...(canEdit ? [{
      title: '', key: 'act', width: 70, fixed: 'right' as const,
      render: (_: unknown, r: SalesBooking) => (
        <Space size={2}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xóa booking này?" okText="Xóa" cancelText="Hủy" onConfirm={() => handleDelete(r)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ]

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: '#d48806', fontSize: 13 }}>
          📋 BOOKING THEO LÔ {rows.length > 0 && <Tag style={{ marginLeft: 4 }}>{rows.length}</Tag>}
        </span>
        {canEdit && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>Thêm booking</Button>}
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: 'Chưa có booking. Bấm "Thêm booking" để khai báo từng lô.' }}
      />

      <Modal
        title={editing ? 'Sửa booking' : 'Thêm booking / lô'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saving}
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="lot_label" label="Lô"><Input placeholder="Lot 1" /></Form.Item>
            <Form.Item name="booking_no" label="Số booking"><Input placeholder="271516317" /></Form.Item>
            <Form.Item name="shipping_line" label="Hãng tàu"><Input placeholder="MAERSK / ONE…" /></Form.Item>
            <Form.Item name="container_count" label="Số container"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="vessel_name" label="Tàu"><Input placeholder="MCC DANANG" /></Form.Item>
            <Form.Item name="voyage_no" label="Voy No."><Input placeholder="612N" /></Form.Item>
            <Form.Item name="etd" label="ETD"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="eta" label="ETA"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="cutoff" label="Cutoff" tooltip="vd: 06/06 10:00 hoặc Sat 10:00"><Input placeholder="06/06 10:00" /></Form.Item>
            <Form.Item name="bl_number" label="B/L Number"><Input placeholder="(điền sau)" /></Form.Item>
            <Form.Item name="port_of_loading" label="Cảng xếp (POL)"><Input placeholder="Da Nang" /></Form.Item>
            <Form.Item name="port_of_destination" label="Cảng đích (POD)"><Input placeholder="Shanghai" /></Form.Item>
          </div>
          <Form.Item name="notes" label="Ghi chú"><Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>

          {/* File đính kèm */}
          <div style={{ marginTop: 4 }}>
            <input ref={fileRef} type="file" accept=".pdf,image/*,.docx,.xlsx" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = '' }} />
            <Space>
              <Button icon={<PaperClipOutlined />} size="small" loading={uploading} onClick={() => fileRef.current?.click()}>
                {pendingFile ? 'Đổi file' : 'Đính kèm file booking/B/L'}
              </Button>
              {pendingFile && (
                <>
                  <a href={pendingFile.file_url} target="_blank" rel="noreferrer"><EyeOutlined /> {pendingFile.file_name}</a>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setPendingFile(null)} />
                </>
              )}
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
