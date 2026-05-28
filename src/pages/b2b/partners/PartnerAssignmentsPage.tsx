// ============================================================================
// PARTNER ASSIGNMENTS PAGE — Phân công NV phụ trách Đại lý (admin)
// File: src/pages/b2b/partners/PartnerAssignmentsPage.tsx
// Migration: sprint1_08_b2b_chat_per_employee.sql
// ============================================================================
//
// Trang admin quản lý phân công NV ↔ ĐL.
// - Mỗi cặp (NV × ĐL) duy nhất 1 assignment
// - 1 ĐL có thể có nhiều NV (primary + backup)
// - Hỗ trợ: thêm/xóa phân công, chuyển NV primary
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Typography, Card, Row, Col, Space, Button, Table, Tag, Select, Modal,
  Checkbox, message, Empty, Input, Tooltip, Popconfirm, Switch,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, UserOutlined,
  StarFilled, StarOutlined, SearchOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import { partnerAssignmentService, type PartnerAssignment } from '../../../services/b2b/partnerAssignmentService'
import { partnerService, type Partner } from '../../../services/b2b/partnerService'
import { useAuthStore } from '../../../stores/authStore'
import { B2BSectionTabs, PARTNER_TABS } from '../../../components/b2b/B2BSectionTabs'

const { Title, Text } = Typography

interface EmployeeWithUser {
  id: string
  full_name: string
  code: string | null
  user_id: string
}

interface EnrichedRow extends PartnerAssignment {
  partner_name: string
  partner_code: string
  partner_tier: string | null
  employee_name: string
  employee_code: string | null
}

// ============================================================================

export default function PartnerAssignmentsPage() {
  const { user } = useAuthStore()
  const [assignments, setAssignments] = useState<PartnerAssignment[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [employees, setEmployees] = useState<EmployeeWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterUser, setFilterUser] = useState<string>('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalUserId, setModalUserId] = useState<string>('')
  const [modalPartnerIds, setModalPartnerIds] = useState<string[]>([])
  const [modalPrimary, setModalPrimary] = useState(false)
  const [modalSaving, setModalSaving] = useState(false)

  // ── Load all ──
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [assigns, parts, { data: emps }] = await Promise.all([
        partnerAssignmentService.getAll(),
        partnerService.getAllActive(),
        supabase
          .from('employees')
          .select('id, full_name, code, user_id')
          .not('user_id', 'is', null)
          .eq('status', 'active')
          .order('full_name'),
      ])
      setAssignments(assigns)
      setPartners(parts)
      setEmployees((emps || []) as EmployeeWithUser[])
    } catch (e: any) {
      message.error('Lỗi tải dữ liệu: ' + (e?.message || ''))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Enrich assignments with partner + employee data ──
  const enriched: EnrichedRow[] = useMemo(() => {
    const partnerMap = new Map(partners.map(p => [p.id, p]))
    const employeeMap = new Map(employees.map(e => [e.user_id, e]))
    return assignments.map(a => {
      const p = partnerMap.get(a.partner_id)
      const e = employeeMap.get(a.user_id)
      return {
        ...a,
        partner_name: p?.name || '(Không rõ)',
        partner_code: p?.code || '',
        partner_tier: p?.tier || null,
        employee_name: e?.full_name || '(Không rõ NV)',
        employee_code: e?.code || null,
      }
    })
  }, [assignments, partners, employees])

  // ── Filter rows ──
  const filteredRows = useMemo(() => {
    let rows = enriched
    if (filterUser) rows = rows.filter(r => r.user_id === filterUser)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.partner_name.toLowerCase().includes(q) ||
        r.partner_code.toLowerCase().includes(q) ||
        r.employee_name.toLowerCase().includes(q) ||
        (r.employee_code || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [enriched, filterUser, search])

  // ── Stats per user ──
  const statsPerUser = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of assignments) {
      map.set(a.user_id, (map.get(a.user_id) || 0) + 1)
    }
    return map
  }, [assignments])

  // ── Handlers ──
  const openAddModal = (presetUserId?: string) => {
    setModalUserId(presetUserId || '')
    setModalPartnerIds([])
    setModalPrimary(false)
    setModalOpen(true)
  }

  const handleSaveModal = async () => {
    if (!modalUserId) {
      message.warning('Chọn nhân viên')
      return
    }
    if (modalPartnerIds.length === 0) {
      message.warning('Chọn ít nhất 1 đại lý')
      return
    }
    setModalSaving(true)
    try {
      // Lấy partner_ids đã gán cho NV này để bỏ qua trùng (UNIQUE constraint)
      const existingForUser = new Set(
        assignments.filter(a => a.user_id === modalUserId).map(a => a.partner_id)
      )
      const newOnes = modalPartnerIds.filter(pid => !existingForUser.has(pid))
      if (newOnes.length === 0) {
        message.info('Tất cả đại lý đã được phân công NV này từ trước')
        setModalOpen(false)
        return
      }
      // Bulk insert
      for (const pid of newOnes) {
        await partnerAssignmentService.create({
          partner_id: pid,
          user_id: modalUserId,
          is_primary: modalPrimary,
        }, user?.id)
      }
      message.success(`Đã phân công ${newOnes.length} đại lý`)
      setModalOpen(false)
      loadAll()
    } catch (e: any) {
      message.error('Lưu thất bại: ' + (e?.message || ''))
    } finally {
      setModalSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await partnerAssignmentService.remove(id)
      message.success('Đã xóa phân công')
      loadAll()
    } catch (e: any) {
      message.error('Xóa thất bại: ' + (e?.message || ''))
    }
  }

  const handleTogglePrimary = async (row: EnrichedRow, isPrimary: boolean) => {
    try {
      await partnerAssignmentService.setPrimary(row.id, isPrimary)
      loadAll()
    } catch (e: any) {
      message.error('Đổi primary thất bại: ' + (e?.message || ''))
    }
  }

  // ── Table columns ──
  const columns: ColumnsType<EnrichedRow> = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_, r) => (
        <Space>
          <UserOutlined style={{ color: '#1B4D3E' }} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.employee_name}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.employee_code}</Text>
          </div>
        </Space>
      ),
      sorter: (a, b) => a.employee_name.localeCompare(b.employee_name),
    },
    {
      title: 'Đại lý',
      key: 'partner',
      render: (_, r) => (
        <Space>
          <div>
            <div style={{ fontWeight: 600 }}>{r.partner_name}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.partner_code}</Text>
          </div>
          {r.partner_tier && (
            <Tag color="purple" style={{ fontSize: 10 }}>{r.partner_tier}</Tag>
          )}
        </Space>
      ),
      sorter: (a, b) => a.partner_name.localeCompare(b.partner_name),
    },
    {
      title: 'Vai trò',
      dataIndex: 'is_primary',
      key: 'is_primary',
      width: 130,
      align: 'center',
      render: (val, r) => (
        <Tooltip title={val ? 'Phụ trách chính' : 'Hỗ trợ / Backup'}>
          <Space size={4}>
            <Switch
              size="small"
              checked={val}
              onChange={(checked) => handleTogglePrimary(r, checked)}
              checkedChildren={<StarFilled />}
              unCheckedChildren={<StarOutlined />}
            />
            <Text type={val ? 'warning' : 'secondary'} style={{ fontSize: 11 }}>
              {val ? 'Chính' : 'Backup'}
            </Text>
          </Space>
        </Tooltip>
      ),
      filters: [
        { text: 'Phụ trách chính', value: true },
        { text: 'Backup', value: false },
      ],
      onFilter: (val, r) => r.is_primary === val,
    },
    {
      title: 'Ngày phân công',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 130,
      render: (v) => <Text style={{ fontSize: 12 }}>{new Date(v).toLocaleDateString('vi-VN')}</Text>,
    },
    {
      title: '',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_, r) => (
        <Popconfirm
          title="Xóa phân công này?"
          description={`${r.employee_name} sẽ không còn phụ trách ${r.partner_name}`}
          onConfirm={() => handleRemove(r.id)}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  // ── RENDER ──
  return (
    <div style={{ padding: 24 }}>
      <B2BSectionTabs tabs={PARTNER_TABS} active="partner-assignments" />

      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Phân công Đại lý ↔ Nhân viên</Title>
          <Text type="secondary">
            Mỗi NV phụ trách 1 số đại lý nhất định. NV chỉ thấy chat của đại lý mình phụ trách.
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={loadAll}>Làm mới</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openAddModal()}>
              Thêm phân công
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Stats per employee */}
      {employees.length > 0 && (
        <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}
          title={<Text strong>Khối lượng theo NV</Text>}>
          <Space wrap size={[8, 8]}>
            {employees.map(emp => {
              const count = statsPerUser.get(emp.user_id) || 0
              return (
                <Tag.CheckableTag
                  key={emp.user_id}
                  checked={filterUser === emp.user_id}
                  onChange={() => setFilterUser(filterUser === emp.user_id ? '' : emp.user_id)}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  <UserOutlined style={{ marginRight: 4 }} />
                  {emp.full_name}
                  <Tag color={count > 0 ? 'green' : 'default'} style={{ marginLeft: 6, fontSize: 10 }}>
                    {count}
                  </Tag>
                </Tag.CheckableTag>
              )
            })}
            {filterUser && (
              <Button size="small" type="link" onClick={() => setFilterUser('')}>
                Xóa lọc
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* Search */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên NV hoặc đại lý..."
          prefix={<SearchOutlined />}
          allowClear
        />
      </Card>

      {/* Table */}
      <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table<EnrichedRow>
          dataSource={filteredRows}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 30, showSizeChanger: false, showTotal: (t) => `${t} phân công` }}
          locale={{ emptyText: <Empty description="Chưa có phân công nào — bấm 'Thêm phân công' để bắt đầu" /> }}
        />
      </Card>

      {/* Add modal */}
      <Modal
        title="Thêm phân công"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSaveModal}
        confirmLoading={modalSaving}
        okText="Lưu phân công"
        cancelText="Hủy"
        width={600}
      >
        <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 12 }}>
          <div>
            <Text strong>Nhân viên</Text>
            <Select
              value={modalUserId || undefined}
              onChange={setModalUserId}
              placeholder="Chọn nhân viên..."
              showSearch
              optionFilterProp="label"
              style={{ width: '100%', marginTop: 4 }}
              options={employees.map(e => ({
                value: e.user_id,
                label: `${e.full_name} (${e.code || '—'})`,
              }))}
            />
          </div>

          <div>
            <Text strong>Đại lý phụ trách</Text>
            <Select
              mode="multiple"
              value={modalPartnerIds}
              onChange={setModalPartnerIds}
              placeholder="Chọn 1 hoặc nhiều đại lý..."
              showSearch
              optionFilterProp="label"
              style={{ width: '100%', marginTop: 4 }}
              maxTagCount={6}
              options={partners.map(p => ({
                value: p.id,
                label: `${p.name} (${p.code})`,
              }))}
            />
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              Có thể chọn nhiều đại lý cùng lúc.
            </Text>
          </div>

          <Checkbox checked={modalPrimary} onChange={(e) => setModalPrimary(e.target.checked)}>
            Đặt làm NV phụ trách CHÍNH (primary) — có thể đổi sau
          </Checkbox>
        </Space>
      </Modal>
    </div>
  )
}
