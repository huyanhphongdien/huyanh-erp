// ============================================================================
// FILE: src/pages/logistics/fleet/FleetVehicleListPage.tsx
// MODULE: Vận tải / Đội xe — Danh mục Phương tiện (đầu kéo / rơ-moóc / xe khác)
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, DatePicker, Select, Switch,
  Space, Typography, message, Popconfirm, Tag, Tabs, Alert, Breadcrumb,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, TruckOutlined, WarningOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  fleetService, VEHICLE_KIND_LABELS,
  type FleetVehicle, type VehicleKind, type FleetDriver, type ExpiryWarning,
} from '../../../services/logistics/fleetService'

const { Title } = Typography

const KIND_COLOR: Record<VehicleKind, string> = { tractor: 'blue', trailer: 'gold', other: 'default' }

function fmtDate(s?: string | null): string {
  if (!s) return '–'
  return dayjs(s).format('DD/MM/YYYY')
}
function expiryTag(s?: string | null) {
  if (!s) return <span style={{ color: '#bbb' }}>–</span>
  const days = dayjs(s).startOf('day').diff(dayjs().startOf('day'), 'day')
  const color = days < 0 ? 'red' : days <= 30 ? 'orange' : undefined
  return <Tag color={color} style={{ margin: 0 }}>{fmtDate(s)}</Tag>
}

export default function FleetVehicleListPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<FleetVehicle[]>([])
  const [drivers, setDrivers] = useState<FleetDriver[]>([])
  const [warnings, setWarnings] = useState<ExpiryWarning[]>([])
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<VehicleKind | 'all'>('all')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FleetVehicle | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const watchKind = Form.useWatch('kind', form)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [v, d, w] = await Promise.all([
        fleetService.listVehicles({ kind: kind === 'all' ? undefined : kind, search: search || undefined }),
        fleetService.listDrivers({ active: true }),
        fleetService.listExpiringSoon(30),
      ])
      setRows(v); setDrivers(d); setWarnings(w)
    } catch (e: any) {
      message.error('Lỗi tải đội xe: ' + (e?.message || e))
    }
    setLoading(false)
  }, [kind, search])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ active: true, kind: kind === 'all' ? 'tractor' : kind })
    setModalOpen(true)
  }
  const openEdit = (r: FleetVehicle) => {
    setEditing(r)
    form.setFieldsValue({
      ...r,
      inspection_expiry: r.inspection_expiry ? dayjs(r.inspection_expiry) : null,
      transit_expiry: r.transit_expiry ? dayjs(r.transit_expiry) : null,
      badge_expiry: r.badge_expiry ? dayjs(r.badge_expiry) : null,
      cavet_expiry: r.cavet_expiry ? dayjs(r.cavet_expiry) : null,
    })
    setModalOpen(true)
  }

  const onSave = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const d = (x: any) => (x ? dayjs(x).format('YYYY-MM-DD') : null)
      const payload = {
        ...v,
        inspection_expiry: d(v.inspection_expiry),
        transit_expiry: d(v.transit_expiry),
        badge_expiry: d(v.badge_expiry),
        cavet_expiry: d(v.cavet_expiry),
      }
      if (editing) await fleetService.updateVehicle(editing.id, payload)
      else await fleetService.createVehicle(payload)
      message.success(editing ? 'Đã cập nhật xe' : 'Đã thêm xe')
      setModalOpen(false)
      load()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('Lỗi lưu: ' + (e?.message || e))
    }
    setSaving(false)
  }

  const onDelete = async (r: FleetVehicle) => {
    try {
      await fleetService.removeVehicle(r.id)
      message.success('Đã xoá')
      load()
    } catch (e: any) {
      message.error('Lỗi xoá: ' + (e?.message || e))
    }
  }

  const columns = useMemo(() => [
    { title: 'Biển số', dataIndex: 'plate', key: 'plate', fixed: 'left' as const, width: 130, render: (v: string) => <b>{v}</b> },
    { title: 'Loại', dataIndex: 'kind', key: 'kind', width: 100, render: (k: VehicleKind) => <Tag color={KIND_COLOR[k]}>{VEHICLE_KIND_LABELS[k]}</Tag> },
    { title: 'Mã / Nhãn hiệu', key: 'brand', width: 160, render: (_: any, r: FleetVehicle) => <span>{[r.internal_code, r.brand].filter(Boolean).join(' · ') || '–'}</span> },
    { title: 'Tài xế', key: 'driver', width: 150, render: (_: any, r: FleetVehicle) => r.default_driver?.full_name || (r.kind === 'tractor' ? <span style={{ color: '#e8a33d' }}>Chưa gắn</span> : '–') },
    { title: 'Trọng tải', key: 'cap', width: 110, render: (_: any, r: FleetVehicle) => r.capacity_kg ? `${r.capacity_kg.toLocaleString('vi-VN')} kg` : (r.capacity_note || '–') },
    { title: 'Đăng kiểm', dataIndex: 'inspection_expiry', key: 'insp', width: 120, render: (v: string) => expiryTag(v) },
    { title: 'Phù hiệu', dataIndex: 'badge_expiry', key: 'badge', width: 120, render: (v: string) => expiryTag(v) },
    { title: 'Cửa khẩu', dataIndex: 'border_gate', key: 'gate', width: 100, render: (v: string) => v || '–' },
    {
      title: '', key: 'act', fixed: 'right' as const, width: 100, render: (_: any, r: FleetVehicle) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xoá xe này?" onConfirm={() => onDelete(r)} okText="Xoá" cancelText="Huỷ">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ], [])

  return (
    <div style={{ padding: 20, maxWidth: 1680, margin: '0 auto', fontSize: 15 }}>
      <Breadcrumb style={{ marginBottom: 8 }} items={[
        { title: <a onClick={() => navigate('/logistics/dispatch')}>Vận tải</a> },
        { title: 'Đội xe' },
      ]} />

      {warnings.length > 0 && (
        <Alert
          type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }}
          message={`${warnings.length} phương tiện sắp/đã hết hạn đăng kiểm hoặc phù hiệu`}
          description={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {warnings.slice(0, 12).map((w, i) => (
                <Tag key={i} color={w.days_left < 0 ? 'red' : 'orange'}>
                  {w.vehicle.plate} · {w.label} {w.days_left < 0 ? `quá ${-w.days_left}d` : `còn ${w.days_left}d`}
                </Tag>
              ))}
            </div>
          }
        />
      )}

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Title level={4} style={{ margin: 0 }}><TruckOutlined /> Danh mục đội xe</Title>
          <Space>
            <Input.Search placeholder="Tìm biển số / nhãn hiệu" allowClear style={{ width: 240 }}
              onSearch={setSearch} onChange={e => !e.target.value && setSearch('')} />
            <Button icon={<ReloadOutlined />} onClick={load} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm xe</Button>
          </Space>
        </div>

        <Tabs activeKey={kind} onChange={k => setKind(k as any)} items={[
          { key: 'all', label: `Tất cả` },
          { key: 'tractor', label: VEHICLE_KIND_LABELS.tractor },
          { key: 'trailer', label: VEHICLE_KIND_LABELS.trailer },
          { key: 'other', label: VEHICLE_KIND_LABELS.other },
        ]} />

        <Table rowKey="id" size="middle" loading={loading} columns={columns as any} dataSource={rows}
          scroll={{ x: 1180 }} pagination={{ pageSize: 20, showSizeChanger: false }} />
      </Card>

      <Modal title={editing ? `Sửa xe ${editing.plate}` : 'Thêm phương tiện'} open={modalOpen} onOk={onSave}
        confirmLoading={saving} onCancel={() => setModalOpen(false)} okText="Lưu" cancelText="Huỷ" width={760} destroyOnHidden>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Space style={{ display: 'flex' }} size="middle" align="start">
            <Form.Item name="plate" label="Biển số" style={{ width: 180 }} rules={[{ required: true, message: 'Nhập biển số' }]}>
              <Input placeholder="75H-02821" />
            </Form.Item>
            <Form.Item name="kind" label="Loại" style={{ width: 150 }} rules={[{ required: true }]}>
              <Select options={(['tractor', 'trailer', 'other'] as VehicleKind[]).map(k => ({ value: k, label: VEHICLE_KIND_LABELS[k] }))} />
            </Form.Item>
            <Form.Item name="internal_code" label="Mã nội bộ" style={{ width: 150 }}><Input placeholder="75H00604" /></Form.Item>
            <Form.Item name="brand" label="Nhãn hiệu" style={{ flex: 1 }}><Input placeholder="CNHTC / DOOSUNG" /></Form.Item>
          </Space>

          {watchKind === 'tractor' && (
            <Form.Item name="default_driver_id" label="Tài xế gắn (cố định)">
              <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn tài xế"
                options={drivers.map(d => ({ value: d.id, label: d.full_name }))} />
            </Form.Item>
          )}

          <Space style={{ display: 'flex' }} size="middle" align="start">
            <Form.Item name="year_made" label="Năm SX" style={{ width: 110 }}><InputNumber style={{ width: '100%' }} min={1990} max={2100} /></Form.Item>
            <Form.Item name="capacity_kg" label="Trọng tải (kg)" style={{ width: 150 }}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="capacity_note" label="Hoặc số ghế" style={{ width: 130 }}><Input placeholder="16 ghế" /></Form.Item>
            <Form.Item name="color" label="Màu" style={{ width: 120 }}><Input /></Form.Item>
            <Form.Item name="border_gate" label="Cửa khẩu" style={{ flex: 1 }}><Input placeholder="VN-LAO / CẢNG" /></Form.Item>
          </Space>

          <Space style={{ display: 'flex' }} size="middle" align="start">
            <Form.Item name="chassis_no" label="Số khung" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="engine_no" label="Số máy" style={{ flex: 1 }}><Input /></Form.Item>
          </Space>

          <Space style={{ display: 'flex' }} size="middle" align="start" wrap>
            <Form.Item name="inspection_expiry" label="Hạn đăng kiểm" style={{ width: 160 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="badge_expiry" label="Hạn phù hiệu" style={{ width: 160 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="transit_expiry" label="Hạn transit" style={{ width: 160 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="cavet_expiry" label="Hạn cavet NH" style={{ width: 160 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
          </Space>

          <Space style={{ display: 'flex' }} size="middle" align="start">
            <Form.Item name="transit_note" label="Ghi chú transit" style={{ flex: 1 }}><Input placeholder="chưa / Chạy cảng" /></Form.Item>
            <Form.Item name="note" label="Ghi chú" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="active" label="Đang dùng" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
