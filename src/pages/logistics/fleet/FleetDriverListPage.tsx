// ============================================================================
// FILE: src/pages/logistics/fleet/FleetDriverListPage.tsx
// MODULE: Vận tải / Đội xe — Danh mục Tài xế
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Modal, Form, Input, DatePicker, Switch, Space, Typography,
  message, Popconfirm, Tag, Breadcrumb,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, IdcardOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { fleetService, type FleetDriver } from '../../../services/logistics/fleetService'

const { Title, Text } = Typography

export default function FleetDriverListPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<FleetDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FleetDriver | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fleetService.listDrivers({ search: search || undefined }))
    } catch (e: any) {
      message.error('Lỗi tải tài xế: ' + (e?.message || e))
    }
    setLoading(false)
  }, [search])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ active: true })
    setModalOpen(true)
  }
  const openEdit = (r: FleetDriver) => {
    setEditing(r)
    form.setFieldsValue({ ...r, dob: r.dob ? dayjs(r.dob) : null })
    setModalOpen(true)
  }

  const onSave = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const payload = { ...v, dob: v.dob ? dayjs(v.dob).format('YYYY-MM-DD') : null }
      if (editing) await fleetService.updateDriver(editing.id, payload)
      else await fleetService.createDriver(payload)
      message.success(editing ? 'Đã cập nhật tài xế' : 'Đã thêm tài xế')
      setModalOpen(false)
      load()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('Lỗi lưu: ' + (e?.message || e))
    }
    setSaving(false)
  }

  const onDelete = async (r: FleetDriver) => {
    try {
      await fleetService.removeDriver(r.id)
      message.success('Đã xoá')
      load()
    } catch (e: any) {
      message.error('Lỗi xoá: ' + (e?.message || e))
    }
  }

  const columns = [
    { title: 'Họ tên', dataIndex: 'full_name', key: 'full_name', render: (v: string) => <b>{v}</b> },
    { title: 'SĐT', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '–' },
    { title: 'CCCD', dataIndex: 'id_no', key: 'id_no', render: (v: string) => v || '–' },
    { title: 'GPLX', dataIndex: 'license_no', key: 'license_no', render: (v: string, r: FleetDriver) => v ? `${v}${r.license_class ? ` (${r.license_class})` : ''}` : '–' },
    { title: 'Trạng thái', dataIndex: 'active', key: 'active', width: 110, render: (v: boolean) => v ? <Tag color="green">Đang làm</Tag> : <Tag>Nghỉ</Tag> },
    {
      title: '', key: 'act', width: 110, render: (_: any, r: FleetDriver) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xoá tài xế này?" onConfirm={() => onDelete(r)} okText="Xoá" cancelText="Huỷ">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 20, fontSize: 15 }}>
      <Breadcrumb style={{ marginBottom: 8 }} items={[
        { title: <a onClick={() => navigate('/logistics/dispatch')}>Vận tải</a> },
        { title: 'Tài xế' },
      ]} />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <Title level={4} style={{ margin: 0 }}><IdcardOutlined /> Danh mục tài xế</Title>
          <Space>
            <Input.Search placeholder="Tìm tên / SĐT / GPLX" allowClear style={{ width: 240 }}
              onSearch={setSearch} onChange={e => !e.target.value && setSearch('')} />
            <Button icon={<ReloadOutlined />} onClick={load} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm tài xế</Button>
          </Space>
        </div>
        <Table rowKey="id" size="middle" loading={loading} columns={columns as any} dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: false }} />
      </Card>

      <Modal title={editing ? 'Sửa tài xế' : 'Thêm tài xế'} open={modalOpen} onOk={onSave} confirmLoading={saving}
        onCancel={() => setModalOpen(false)} okText="Lưu" cancelText="Huỷ" destroyOnHidden>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="full_name" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="phone" label="SĐT" style={{ flex: 1 }}><Input placeholder="09xx" /></Form.Item>
            <Form.Item name="id_no" label="CCCD/CMND" style={{ flex: 1 }}><Input /></Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="license_no" label="Số GPLX" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="license_class" label="Hạng" style={{ width: 120 }}><Input placeholder="FC" /></Form.Item>
            <Form.Item name="dob" label="Ngày sinh" style={{ width: 150 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
          </Space>
          <Form.Item name="address" label="Địa chỉ"><Input /></Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="active" label="Đang làm việc" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        Tài xế được gắn vào đầu kéo ở mục Đội xe. Khi lập Lệnh điều động, chọn đầu kéo → tài xế tự điền.
      </Text>
    </div>
  )
}
