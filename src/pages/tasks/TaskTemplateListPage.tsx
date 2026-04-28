// ============================================================
// TASK TEMPLATE LIST PAGE
// File: src/pages/tasks/TaskTemplateListPage.tsx
// ============================================================
// 2 Tabs: Mẫu công việc (Templates) + Lịch tự động (Recurring)
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import {
  Card, Table, Button, Modal, Form, Input, Select, InputNumber,
  Tag, Switch, Space, Typography, Tabs, message, Popconfirm, Checkbox, Tooltip,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  PlayCircleOutlined, MinusCircleOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import {
  taskTemplateService, TaskTemplate, TEMPLATE_CATEGORIES,
  taskRecurringService, RecurringRule, FREQ_LABELS, DAY_LABELS,
} from '../../services/taskTemplateService'

const { Title } = Typography

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function TaskTemplateListPage() {
  const navigate = useNavigate()

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState('templates')

  // ── Templates state ──
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null)
  const [templateForm] = Form.useForm()

  // ── Recurring state ──
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([])
  const [loadingRules, setLoadingRules] = useState(false)
  const [recurringModalOpen, setRecurringModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)
  const [recurringForm] = Form.useForm()

  // ── Auth + Employees for assignee select ──
  const { user } = useAuthStore()
  const canDelete = user?.role === 'admin' || (user?.position_level != null && user.position_level <= 5)
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string; department_id: string | null }>>([])

  // ============================================================
  // DATA LOADING
  // ============================================================

  const loadTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true)
      const data = await taskTemplateService.getAll(true)
      setTemplates(data)
    } catch (err: any) {
      message.error('Lỗi tải danh sách mẫu: ' + err.message)
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  const loadRecurringRules = useCallback(async () => {
    try {
      setLoadingRules(true)
      const data = await taskRecurringService.getAll()
      setRecurringRules(data)
    } catch (err: any) {
      message.error('Lỗi tải lịch tự động: ' + err.message)
    } finally {
      setLoadingRules(false)
    }
  }, [])

  const loadEmployees = useCallback(async () => {
    try {
      const VIP_EMAILS = ['huylv@huyanhrubber.com', 'thuyht@huyanhrubber.com', 'trunglxh@huyanhrubber.com']
      const { data } = await supabase
        .from('employees')
        .select('id, full_name, department_id, email')
        .eq('status', 'active')
        .order('full_name')
      setEmployees((data || []).filter(e => !VIP_EMAILS.includes((e as any).email?.toLowerCase())))
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    loadTemplates()
    loadRecurringRules()
    loadEmployees()
  }, [loadTemplates, loadRecurringRules, loadEmployees])

  // Filter employees theo quyền:
  // Level 1: Giám đốc, Level 2: PGĐ/Trợ lý, Level 3: PGĐ/Trợ lý BGĐ
  // Level 4: Trưởng phòng, Level 5: Phó phòng
  // Level 6: Nhân viên, Level 7: Thực tập sinh
  const filteredEmployees = useMemo(() => {
    const level = user?.position_level || 7
    const isAdmin = user?.role === 'admin'
    const isManager = user?.is_manager

    if (isAdmin || level <= 3) {
      // BGĐ / Admin / PGĐ → tất cả nhân viên
      return employees
    }

    if (level <= 5 || isManager) {
      // Trưởng phòng (4) + Phó phòng (5) → nhân viên cùng phòng ban
      return employees.filter(e => e.department_id === user?.department_id)
    }

    // Nhân viên (6+) → chỉ chính mình
    return employees.filter(e => e.id === user?.employee_id)
  }, [employees, user])

  // ============================================================
  // TEMPLATE ACTIONS
  // ============================================================

  const handleCreateTask = (templateId: string) => {
    const level = user?.position_level || 7
    const isAdmin = user?.role === 'admin'
    const isBGD = isAdmin || level <= 2

    if (level >= 5 && !isBGD) {
      // Nhân viên → tự giao cho mình, navigate với mode=self
      navigate(`/tasks/create?mode=self&template_id=${templateId}`)
    } else {
      // Trưởng phòng / BGĐ → navigate form giao việc với template
      navigate(`/tasks/create?template_id=${templateId}`)
    }
  }

  const openTemplateModal = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template)
      const checklist = typeof template.checklist_items === 'string'
        ? JSON.parse(template.checklist_items)
        : template.checklist_items
      templateForm.setFieldsValue({
        name: template.name,
        description: template.description,
        category: template.category,
        default_priority: template.default_priority,
        default_duration_days: template.default_duration_days,
        is_routine: (template as any).is_routine || false,
        checklist_items: checklist?.map((c: { title: string; requires_evidence?: boolean }) => ({
          title: c.title,
          requires_evidence: c.requires_evidence || false,
        })) || [],
      })
    } else {
      setEditingTemplate(null)
      templateForm.resetFields()
    }
    setTemplateModalOpen(true)
  }

  const handleSaveTemplate = async () => {
    try {
      const values = await templateForm.validateFields()
      const payload = {
        name: values.name,
        description: values.description || null,
        category: values.category || 'general',
        default_priority: values.default_priority || 'medium',
        default_duration_days: values.default_duration_days || 3,
        is_routine: values.is_routine || false,
        checklist_items: (values.checklist_items || [])
          .filter((t: any) => typeof t === 'string' ? t?.trim() : t?.title?.trim())
          .map((t: any) => typeof t === 'string'
            ? { title: t.trim() }
            : { title: t.title.trim(), requires_evidence: t.requires_evidence || false }
          ),
      }

      if (editingTemplate) {
        await taskTemplateService.update(editingTemplate.id, payload)
        message.success('Đã cập nhật mẫu!')
      } else {
        await taskTemplateService.create(payload)
        message.success('Đã tạo mẫu mới!')
      }

      setTemplateModalOpen(false)
      templateForm.resetFields()
      setEditingTemplate(null)
      loadTemplates()
    } catch (err: any) {
      if (err.errorFields) return
      message.error('Lỗi lưu mẫu: ' + err.message)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    try {
      await taskTemplateService.delete(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      message.success('Đã xóa mẫu!')
    } catch (err: any) {
      message.error('Lỗi xóa: ' + err.message)
    }
  }

  // ============================================================
  // RECURRING ACTIONS
  // ============================================================

  const openRecurringModal = (rule?: RecurringRule) => {
    if (rule) {
      setEditingRule(rule)
      recurringForm.setFieldsValue({
        name: rule.name,
        template_id: rule.template_id,
        frequency: rule.frequency,
        day_of_week: rule.day_of_week,
        day_of_month: rule.day_of_month,
        assignee_ids: rule.assignee_ids || (rule.assignee_id ? [rule.assignee_id] : []),
      })
    } else {
      setEditingRule(null)
      recurringForm.resetFields()
    }
    setRecurringModalOpen(true)
  }

  const handleSaveRecurring = async () => {
    try {
      const values = await recurringForm.validateFields()
      const payload = {
        name: values.name,
        template_id: values.template_id,
        frequency: values.frequency,
        day_of_week: values.frequency === 'weekly' || values.frequency === 'biweekly' ? values.day_of_week : null,
        day_of_month: values.frequency === 'monthly' ? values.day_of_month : null,
        assignee_id: values.assignee_ids?.[0] || null,
        assignee_ids: values.assignee_ids || [],
      }

      if (editingRule) {
        await taskRecurringService.update(editingRule.id, payload)
        message.success('Đã cập nhật lịch!')
      } else {
        await taskRecurringService.create(payload)
        message.success('Đã tạo lịch mới!')
      }

      setRecurringModalOpen(false)
      recurringForm.resetFields()
      setEditingRule(null)
      loadRecurringRules()
    } catch (err: any) {
      if (err.errorFields) return
      message.error('Lỗi lưu lịch: ' + err.message)
    }
  }

  const handleToggleActive = async (rule: RecurringRule) => {
    try {
      await taskRecurringService.toggleActive(rule.id, !rule.is_active)
      message.success(rule.is_active ? 'Đã tắt lịch' : 'Đã bật lịch')
      loadRecurringRules()
    } catch (err: any) {
      message.error('Lỗi cập nhật: ' + err.message)
    }
  }

  const handleDeleteRule = async (id: string) => {
    try {
      await taskRecurringService.delete(id)
      setRecurringRules(prev => prev.filter(r => r.id !== id))
      message.success('Đã xóa lịch!')
    } catch (err: any) {
      message.error('Lỗi xóa: ' + err.message)
    }
  }

  // ============================================================
  // FILTERED DATA
  // ============================================================

  const filteredTemplates = categoryFilter
    ? templates.filter(t => t.category === categoryFilter)
    : templates

  // ============================================================
  // TABLE COLUMNS
  // ============================================================

  const templateColumns = [
    {
      title: 'Tên mẫu',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      key: 'category',
      width: 140,
      render: (cat: string) => {
        const cfg = TEMPLATE_CATEGORIES[cat as keyof typeof TEMPLATE_CATEGORIES]
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{cat}</Tag>
      },
    },
    {
      title: 'Ưu tiên',
      dataIndex: 'default_priority',
      key: 'priority',
      width: 100,
      render: (p: string) => {
        const map: Record<string, { color: string; label: string }> = {
          urgent: { color: 'red', label: 'Khẩn cấp' },
          high: { color: 'orange', label: 'Cao' },
          medium: { color: 'blue', label: 'Trung bình' },
          low: { color: 'default', label: 'Thấp' },
        }
        const cfg = map[p] || { color: 'default', label: p }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Thời gian',
      dataIndex: 'default_duration_days',
      key: 'duration',
      width: 100,
      render: (d: number) => `${d} ngày`,
    },
    {
      title: 'Checklist',
      dataIndex: 'checklist_items',
      key: 'checklist',
      width: 100,
      render: (items: any) => {
        const list = typeof items === 'string' ? JSON.parse(items) : items
        return `${(list || []).length} mục`
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 200,
      render: (_: any, record: TaskTemplate) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleCreateTask(record.id)}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Tạo việc
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openTemplateModal(record)} />
          {canDelete && (
            <Popconfirm title="Xóa mẫu này?" onConfirm={() => handleDeleteTemplate(record.id)} okText="Xóa" cancelText="Hủy">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const recurringColumns = [
    {
      title: 'Tên',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Mẫu',
      dataIndex: 'template_id',
      key: 'template',
      render: (tid: string) => {
        const t = templates.find(tpl => tpl.id === tid)
        return t ? t.name : <span style={{ color: '#999' }}>—</span>
      },
    },
    {
      title: 'Tần suất',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 140,
      render: (freq: string, record: RecurringRule) => {
        let label = FREQ_LABELS[freq as keyof typeof FREQ_LABELS] || freq
        if ((freq === 'weekly' || freq === 'biweekly') && record.day_of_week != null) {
          label += ` (${DAY_LABELS[record.day_of_week as keyof typeof DAY_LABELS] || ''})`
        }
        if (freq === 'monthly' && record.day_of_month) {
          label += ` (ngày ${record.day_of_month})`
        }
        return label
      },
    },
    {
      title: 'Lần cuối tạo',
      dataIndex: 'last_generated_at',
      key: 'last_run',
      width: 150,
      render: (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—',
    },
    {
      title: 'Lần tiếp theo',
      dataIndex: 'next_generation_at',
      key: 'next_run',
      width: 150,
      render: (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'active',
      width: 100,
      render: (active: boolean, record: RecurringRule) => (
        <Switch
          checked={active}
          onChange={() => handleToggleActive(record)}
          checkedChildren="Bật"
          unCheckedChildren="Tắt"
        />
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: RecurringRule) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openRecurringModal(record)} />
          {canDelete && (
            <Popconfirm
              title="Xóa lịch tự động?"
              description="Các công việc đã được tạo từ lịch này sẽ không bị xóa, nhưng sẽ không còn liên kết với lịch."
              onConfirm={() => handleDeleteRule(record.id)}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  // ============================================================
  // RENDER
  // ============================================================

  const frequencyValue = Form.useWatch('frequency', recurringForm)

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ color: '#1B4D3E', marginBottom: 24 }}>
        Mẫu công việc & Lịch tự động
      </Title>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'templates',
              label: 'Mẫu công việc',
              children: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Select
                      allowClear
                      placeholder="Lọc theo danh mục"
                      style={{ width: 220 }}
                      value={categoryFilter}
                      onChange={setCategoryFilter}
                      options={Object.entries(TEMPLATE_CATEGORIES).map(([k, v]) => ({
                        value: k,
                        label: v.label,
                      }))}
                    />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openTemplateModal()}
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                    >
                      Tạo mẫu mới
                    </Button>
                  </div>
                  <Table
                    dataSource={filteredTemplates}
                    columns={templateColumns}
                    rowKey="id"
                    loading={loadingTemplates}
                    pagination={{ pageSize: 10 }}
                    size="middle"
                  />
                </>
              ),
            },
            {
              key: 'recurring',
              label: 'Lịch tự động',
              children: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openRecurringModal()}
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                    >
                      Tạo lịch mới
                    </Button>
                  </div>
                  <Table
                    dataSource={recurringRules}
                    columns={recurringColumns}
                    rowKey="id"
                    loading={loadingRules}
                    pagination={{ pageSize: 10 }}
                    size="middle"
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      {/* ── Create/Edit Template Modal ── */}
      <Modal
        title={editingTemplate ? 'Sửa mẫu công việc' : 'Tạo mẫu công việc mới'}
        open={templateModalOpen}
        onOk={handleSaveTemplate}
        onCancel={() => {
          setTemplateModalOpen(false)
          setEditingTemplate(null)
          templateForm.resetFields()
        }}
        okText="Lưu"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
        width={600}
        destroyOnClose
      >
        <Form form={templateForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Tên mẫu"
            rules={[{ required: true, message: 'Vui lòng nhập tên mẫu' }]}
          >
            <Input placeholder="VD: Kiểm tra thiết bị hàng tuần" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả chi tiết mẫu công việc" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="category" label="Danh mục" style={{ flex: 1 }} initialValue="general">
              <Select
                options={Object.entries(TEMPLATE_CATEGORIES).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                }))}
              />
            </Form.Item>

            <Form.Item name="default_priority" label="Ưu tiên" style={{ flex: 1 }} initialValue="medium">
              <Select
                options={[
                  { value: 'urgent', label: 'Khẩn cấp' },
                  { value: 'high', label: 'Cao' },
                  { value: 'medium', label: 'Trung bình' },
                  { value: 'low', label: 'Thấp' },
                ]}
              />
            </Form.Item>

            <Form.Item name="default_duration_days" label="Thời gian (ngày)" style={{ flex: 1 }} initialValue={3}>
              <InputNumber min={1} max={365} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item name="is_routine" valuePropName="checked" label="Công việc lặp lại">
            <Switch />
          </Form.Item>
          <div style={{ marginTop: -12, marginBottom: 16, color: '#888', fontSize: 12 }}>
            Task tạo từ mẫu này sẽ có trọng số 0.5 khi tính hiệu suất
          </div>

          <Form.List name="checklist_items">
            {(fields, { add, remove }) => (
              <>
                <label style={{ fontWeight: 500, marginBottom: 8, display: 'block' }}>
                  Checklist
                </label>
                {fields.map(({ key, name, ...rest }) => (
                  <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <Form.Item
                      {...rest}
                      name={[name, 'title']}
                      style={{ flex: 1, marginBottom: 0 }}
                      rules={[{ required: true, message: 'Nhập nội dung' }]}
                    >
                      <Input placeholder="Nội dung checklist" />
                    </Form.Item>
                    <Form.Item
                      name={[name, 'requires_evidence']}
                      valuePropName="checked"
                      style={{ marginBottom: 0 }}
                    >
                      <Tooltip title="Yêu cầu bằng chứng (ảnh/PDF)">
                        <Checkbox>📷</Checkbox>
                      </Tooltip>
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(name)}
                    />
                  </div>
                ))}
                <Button type="dashed" onClick={() => add({ title: '', requires_evidence: false })} block icon={<PlusOutlined />}>
                  Thêm mục checklist
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* ── Create/Edit Recurring Modal ── */}
      <Modal
        title={editingRule ? 'Sửa lịch tự động' : 'Tạo lịch tự động mới'}
        open={recurringModalOpen}
        onOk={handleSaveRecurring}
        onCancel={() => {
          setRecurringModalOpen(false)
          setEditingRule(null)
          recurringForm.resetFields()
        }}
        okText="Lưu"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
        width={520}
        destroyOnClose
      >
        <Form form={recurringForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Tên lịch"
            rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
          >
            <Input placeholder="VD: Kiểm tra thiết bị mỗi thứ Hai" />
          </Form.Item>

          <Form.Item
            name="template_id"
            label="Mẫu công việc"
            rules={[{ required: true, message: 'Vui lòng chọn mẫu' }]}
          >
            <Select
              placeholder="Chọn mẫu"
              showSearch
              optionFilterProp="label"
              options={templates
                .filter(t => t.is_active)
                .map(t => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>

          <Form.Item
            name="frequency"
            label="Tần suất"
            rules={[{ required: true, message: 'Vui lòng chọn tần suất' }]}
          >
            <Select
              placeholder="Chọn tần suất"
              options={[
                { value: 'daily', label: 'Hàng ngày' },
                { value: 'weekly', label: 'Hàng tuần' },
                { value: 'biweekly', label: 'Hai tuần / lần' },
                { value: 'monthly', label: 'Hàng tháng' },
              ]}
            />
          </Form.Item>

          {(frequencyValue === 'weekly' || frequencyValue === 'biweekly') && (
            <Form.Item
              name="day_of_week"
              label="Ngày trong tuần"
              rules={[{ required: true, message: 'Chọn ngày' }]}
            >
              <Select
                placeholder="Chọn ngày"
                options={Object.entries(DAY_LABELS).map(([k, v]) => ({
                  value: Number(k),
                  label: v,
                }))}
              />
            </Form.Item>
          )}

          {frequencyValue === 'monthly' && (
            <Form.Item
              name="day_of_month"
              label="Ngày trong tháng"
              rules={[{ required: true, message: 'Nhập ngày' }]}
            >
              <InputNumber min={1} max={28} style={{ width: '100%' }} placeholder="1 - 28" />
            </Form.Item>
          )}

          <Form.Item name="assignee_ids" label="Người được giao">
            <Select
              mode="multiple"
              allowClear
              placeholder="Chọn nhân viên (nhiều người)"
              showSearch
              optionFilterProp="label"
              options={filteredEmployees.map(e => ({ value: e.id, label: e.full_name }))}
              maxTagCount={3}
              maxTagPlaceholder={(omitted) => `+${omitted.length} người`}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
