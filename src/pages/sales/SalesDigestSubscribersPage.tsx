// ============================================================================
// SalesDigestSubscribersPage — admin manage digest email subscribers
// File: src/pages/sales/SalesDigestSubscribersPage.tsx
// Sprint 2 D8 (Sales Tracking & Control)
// ============================================================================

import { useEffect, useState } from 'react'
import {
  Card, Table, Button, Modal, Select, Switch,
  Popconfirm, message, Tag,
} from 'antd'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Subscriber {
  id: string
  employee_id: string
  receive_overdue: boolean
  receive_arriving: boolean
  receive_capacity: boolean
  schedule_time: string
  is_active: boolean
  created_at: string
  // Joined
  employee?: {
    id: string
    full_name: string
    code: string
    email: string | null
    department?: { name: string } | null
  } | null
}

interface EmployeeOption {
  id: string
  full_name: string
  code: string
  email: string | null
  department_name: string | null
}

export default function SalesDigestSubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [selectedEmpId, setSelectedEmpId] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const fetch = async () => {
    setLoading(true)
    const [subRes, empRes] = await Promise.all([
      supabase
        .from('sales_digest_subscribers')
        .select(`
          *,
          employee:employees!sales_digest_subscribers_employee_id_fkey(
            id, full_name, code, email,
            department:departments!employees_department_id_fkey(name)
          )
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('employees')
        .select(`
          id, full_name, code, email,
          department:departments!employees_department_id_fkey(name)
        `)
        .eq('status', 'active')
        .order('full_name'),
    ])
    if (subRes.error) {
      message.error('Lỗi load subscribers: ' + subRes.error.message)
    } else {
      const rows = (subRes.data || []).map((r: any) => ({
        ...r,
        employee: r.employee
          ? { ...r.employee, department: Array.isArray(r.employee.department) ? r.employee.department[0] : r.employee.department }
          : null,
      })) as Subscriber[]
      setSubscribers(rows)
    }
    if (!empRes.error) {
      setEmployees((empRes.data || []).map((e: any) => ({
        id: e.id,
        full_name: e.full_name,
        code: e.code,
        email: e.email,
        department_name: (Array.isArray(e.department) ? e.department[0] : e.department)?.name || null,
      })))
    }
    setLoading(false)
  }

  useEffect(() => { fetch() }, [])

  const handleAdd = async () => {
    if (!selectedEmpId) {
      message.warning('Chọn nhân viên')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('sales_digest_subscribers').insert({
      employee_id: selectedEmpId,
      receive_overdue: true,
      receive_arriving: true,
      receive_capacity: true,
      schedule_time: '08:00:00',
      is_active: true,
    })
    setSubmitting(false)
    if (error) {
      if (error.code === '23505') {
        message.warning('NV này đã đăng ký rồi')
      } else {
        message.error('Lỗi: ' + error.message)
      }
      return
    }
    message.success('Đã thêm subscriber')
    setAddModalOpen(false)
    setSelectedEmpId(undefined)
    fetch()
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('sales_digest_subscribers')
      .delete()
      .eq('id', id)
    if (error) {
      message.error('Lỗi xóa: ' + error.message)
      return
    }
    message.success('Đã xóa')
    fetch()
  }

  const handleToggle = async (sub: Subscriber, field: keyof Subscriber, value: boolean) => {
    const { error } = await supabase
      .from('sales_digest_subscribers')
      .update({ [field]: value })
      .eq('id', sub.id)
    if (error) {
      message.error('Lỗi: ' + error.message)
      return
    }
    fetch()
  }

  // Filter employees not already subscribed
  const availableEmployees = employees.filter(
    e => !subscribers.find(s => s.employee_id === e.id)
  )

  const columns = [
    {
      title: 'NV',
      key: 'employee',
      render: (_: any, r: Subscriber) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.employee?.full_name || '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {r.employee?.code} {r.employee?.department?.name && `· ${r.employee.department.name}`}
          </div>
        </div>
      ),
    },
    {
      title: 'Email',
      key: 'email',
      render: (_: any, r: Subscriber) => r.employee?.email
        ? <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.employee.email}</span>
        : <Tag color="red">Chưa có email</Tag>,
    },
    {
      title: 'Quá SLA',
      key: 'overdue',
      align: 'center' as const,
      render: (_: any, r: Subscriber) => (
        <Switch checked={r.receive_overdue} onChange={(v) => handleToggle(r, 'receive_overdue', v)} size="small" />
      ),
    },
    {
      title: 'Chuyển 24h',
      key: 'arriving',
      align: 'center' as const,
      render: (_: any, r: Subscriber) => (
        <Switch checked={r.receive_arriving} onChange={(v) => handleToggle(r, 'receive_arriving', v)} size="small" />
      ),
    },
    {
      title: 'Capacity',
      key: 'capacity',
      align: 'center' as const,
      render: (_: any, r: Subscriber) => (
        <Switch checked={r.receive_capacity} onChange={(v) => handleToggle(r, 'receive_capacity', v)} size="small" />
      ),
    },
    {
      title: 'Giờ nhận',
      key: 'schedule_time',
      align: 'center' as const,
      render: (_: any, r: Subscriber) => (
        <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
          {r.schedule_time?.substring(0, 5) || '08:00'}
        </span>
      ),
    },
    {
      title: 'Active',
      key: 'is_active',
      align: 'center' as const,
      render: (_: any, r: Subscriber) => (
        <Switch checked={r.is_active} onChange={(v) => handleToggle(r, 'is_active', v)} size="small" />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: any, r: Subscriber) => (
        <Popconfirm
          title="Xóa subscriber này?"
          onConfirm={() => handleDelete(r.id)}
          okText="Xóa" cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" size="small" danger icon={<Trash2 size={14} />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <Card
        title={
          <span style={{ color: '#1B4D3E', fontSize: 16 }}>
            👥 Sales Digest Subscribers
          </span>
        }
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<RefreshCw size={14} />} onClick={fetch}>Làm mới</Button>
            <Button
              type="primary"
              icon={<Plus size={14} />}
              onClick={() => setAddModalOpen(true)}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Thêm subscriber
            </Button>
          </div>
        }
        style={{ borderRadius: 12 }}
      >
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, fontSize: 12, color: '#374151' }}>
          📅 Cron daily 08:00 (VN time) sẽ render digest theo cấu hình mỗi NV và gửi email.
          Hiện tại tích hợp email send chưa setup — preview tại <a href="/sales/digest">/sales/digest</a>.
          Subscribers dùng để chuẩn bị danh sách nhận khi email infra sẵn sàng.
        </div>

        <Table
          columns={columns}
          dataSource={subscribers}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Add modal */}
      <Modal
        title="Thêm subscriber mới"
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => { setAddModalOpen(false); setSelectedEmpId(undefined) }}
        confirmLoading={submitting}
        okText="Thêm" cancelText="Hủy"
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <p style={{ fontSize: 13, marginBottom: 12 }}>Chọn nhân viên (chỉ NV active chưa đăng ký):</p>
        <Select
          showSearch
          value={selectedEmpId}
          onChange={setSelectedEmpId}
          placeholder="Tìm theo tên / mã / phòng..."
          style={{ width: '100%' }}
          filterOption={(input, opt) =>
            String(opt?.label || '').toLowerCase().includes(input.toLowerCase())
          }
          options={availableEmployees.map(e => ({
            value: e.id,
            label: `${e.full_name} (${e.code}) — ${e.department_name || '—'}${e.email ? '' : ' [chưa có email]'}`,
          }))}
        />
      </Modal>
    </div>
  )
}
