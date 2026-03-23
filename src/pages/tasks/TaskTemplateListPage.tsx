// ============================================================
// TASK TEMPLATE LIST PAGE
// File: src/pages/tasks/TaskTemplateListPage.tsx
// ============================================================
// 2 Tabs: Mau cong viec (Templates) + Lich tu dong (Recurring)
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Modal, Form, Input, Select, InputNumber,
  Tag, Switch, Space, Typography, Tabs, message, Popconfirm,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  PlayCircleOutlined, MinusCircleOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import { taskTemplateService, TaskTemplate, TEMPLATE_CATEGORIES } from '../../services/taskTemplateService'
import { taskRecurringService, RecurringRule, FREQ_LABELS, DAY_LABELS } from '../../services/taskRecurringService'

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

  // ── Employees for assignee select ──
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string }>>([])

  // ============================================================
  // DATA LOADING
  // ============================================================

  const loadTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true)
      const data = await taskTemplateService.getAll(false)
      setTemplates(data)
    } catch (err: any) {
      message.error('Loi tai danh sach mau: ' + err.message)
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
      message.error('Loi tai lich tu dong: ' + err.message)
    } finally {
      setLoadingRules(false)
    }
  }, [])

  const loadEmployees = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('employees')
        .select('id, full_name')
        .eq('status', 'active')
        .order('full_name')
      setEmployees(data || [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    loadTemplates()
    loadRecurringRules()
    loadEmployees()
  }, [loadTemplates, loadRecurringRules, loadEmployees])

  // ============================================================
  // TEMPLATE ACTIONS
  // ============================================================

  const handleCreateTask = async (templateId: string) => {
    try {
      const taskId = await taskTemplateService.createTaskFromTemplate(templateId)
      message.success('Da tao cong viec tu mau!')
      navigate(`/tasks/${taskId}`)
    } catch (err: any) {
      message.error('Loi tao task: ' + err.message)
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
        checklist_items: checklist?.map((c: { title: string }) => c.title) || [],
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
        checklist_items: (values.checklist_items || [])
          .filter((t: string) => t?.trim())
          .map((t: string) => ({ title: t.trim() })),
      }

      if (editingTemplate) {
        await taskTemplateService.update(editingTemplate.id, payload)
        message.success('Da cap nhat mau!')
      } else {
        await taskTemplateService.create(payload)
        message.success('Da tao mau moi!')
      }

      setTemplateModalOpen(false)
      templateForm.resetFields()
      setEditingTemplate(null)
      loadTemplates()
    } catch (err: any) {
      if (err.errorFields) return
      message.error('Loi luu mau: ' + err.message)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    try {
      await taskTemplateService.delete(id)
      message.success('Da xoa mau!')
      loadTemplates()
    } catch (err: any) {
      message.error('Loi xoa: ' + err.message)
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
        assignee_id: rule.assignee_id,
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
        assignee_id: values.assignee_id || null,
      }

      if (editingRule) {
        await taskRecurringService.update(editingRule.id, payload)
        message.success('Da cap nhat lich!')
      } else {
        await taskRecurringService.create(payload)
        message.success('Da tao lich moi!')
      }

      setRecurringModalOpen(false)
      recurringForm.resetFields()
      setEditingRule(null)
      loadRecurringRules()
    } catch (err: any) {
      if (err.errorFields) return
      message.error('Loi luu lich: ' + err.message)
    }
  }

  const handleToggleActive = async (rule: RecurringRule) => {
    try {
      await taskRecurringService.toggleActive(rule.id, !rule.is_active)
      message.success(rule.is_active ? 'Da tat lich' : 'Da bat lich')
      loadRecurringRules()
    } catch (err: any) {
      message.error('Loi cap nhat: ' + err.message)
    }
  }

  const handleDeleteRule = async (id: string) => {
    try {
      await taskRecurringService.delete(id)
      message.success('Da xoa lich!')
      loadRecurringRules()
    } catch (err: any) {
      message.error('Loi xoa: ' + err.message)
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
      title: 'Ten mau',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Danh muc',
      dataIndex: 'category',
      key: 'category',
      width: 140,
      render: (cat: string) => {
        const cfg = TEMPLATE_CATEGORIES[cat as keyof typeof TEMPLATE_CATEGORIES]
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{cat}</Tag>
      },
    },
    {
      title: 'Uu tien',
      dataIndex: 'default_priority',
      key: 'priority',
      width: 100,
      render: (p: string) => {
        const map: Record<string, { color: string; label: string }> = {
          urgent: { color: 'red', label: 'Khan cap' },
          high: { color: 'orange', label: 'Cao' },
          medium: { color: 'blue', label: 'Trung binh' },
          low: { color: 'default', label: 'Thap' },
        }
        const cfg = map[p] || { color: 'default', label: p }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Thoi gian',
      dataIndex: 'default_duration_days',
      key: 'duration',
      width: 100,
      render: (d: number) => `${d} ngay`,
    },
    {
      title: 'Checklist',
      dataIndex: 'checklist_items',
      key: 'checklist',
      width: 100,
      render: (items: any) => {
        const list = typeof items === 'string' ? JSON.parse(items) : items
        return `${(list || []).length} muc`
      },
    },
    {
      title: 'Thao tac',
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
            Tao task
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openTemplateModal(record)} />
          <Popconfirm title="Xoa mau nay?" onConfirm={() => handleDeleteTemplate(record.id)} okText="Xoa" cancelText="Huy">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const recurringColumns = [
    {
      title: 'Ten',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Mau',
      dataIndex: 'template_id',
      key: 'template',
      render: (tid: string) => {
        const t = templates.find(tpl => tpl.id === tid)
        return t ? t.name : <span style={{ color: '#999' }}>—</span>
      },
    },
    {
      title: 'Tan suat',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 140,
      render: (freq: string, record: RecurringRule) => {
        let label = FREQ_LABELS[freq as keyof typeof FREQ_LABELS] || freq
        if ((freq === 'weekly' || freq === 'biweekly') && record.day_of_week != null) {
          label += ` (${DAY_LABELS[record.day_of_week as keyof typeof DAY_LABELS] || ''})`
        }
        if (freq === 'monthly' && record.day_of_month) {
          label += ` (ngay ${record.day_of_month})`
        }
        return label
      },
    },
    {
      title: 'Lan cuoi tao',
      dataIndex: 'last_run_at',
      key: 'last_run',
      width: 150,
      render: (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—',
    },
    {
      title: 'Lan tiep theo',
      dataIndex: 'next_run_at',
      key: 'next_run',
      width: 150,
      render: (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—',
    },
    {
      title: 'Trang thai',
      dataIndex: 'is_active',
      key: 'active',
      width: 100,
      render: (active: boolean, record: RecurringRule) => (
        <Switch
          checked={active}
          onChange={() => handleToggleActive(record)}
          checkedChildren="Bat"
          unCheckedChildren="Tat"
        />
      ),
    },
    {
      title: 'Thao tac',
      key: 'actions',
      width: 120,
      render: (_: any, record: RecurringRule) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openRecurringModal(record)} />
          <Popconfirm title="Xoa lich nay?" onConfirm={() => handleDeleteRule(record.id)} okText="Xoa" cancelText="Huy">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
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
        Mau cong viec & Lich tu dong
      </Title>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'templates',
              label: 'Mau cong viec',
              children: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Select
                      allowClear
                      placeholder="Loc theo danh muc"
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
                      Tao mau moi
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
              label: 'Lich tu dong',
              children: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openRecurringModal()}
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                    >
                      Tao lich moi
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
        title={editingTemplate ? 'Sua mau cong viec' : 'Tao mau cong viec moi'}
        open={templateModalOpen}
        onOk={handleSaveTemplate}
        onCancel={() => {
          setTemplateModalOpen(false)
          setEditingTemplate(null)
          templateForm.resetFields()
        }}
        okText="Luu"
        cancelText="Huy"
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
        width={600}
        destroyOnClose
      >
        <Form form={templateForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Ten mau"
            rules={[{ required: true, message: 'Vui long nhap ten mau' }]}
          >
            <Input placeholder="VD: Kiem tra thiet bi hang tuan" />
          </Form.Item>

          <Form.Item name="description" label="Mo ta">
            <Input.TextArea rows={3} placeholder="Mo ta chi tiet mau cong viec" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="category" label="Danh muc" style={{ flex: 1 }} initialValue="general">
              <Select
                options={Object.entries(TEMPLATE_CATEGORIES).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                }))}
              />
            </Form.Item>

            <Form.Item name="default_priority" label="Uu tien" style={{ flex: 1 }} initialValue="medium">
              <Select
                options={[
                  { value: 'urgent', label: 'Khan cap' },
                  { value: 'high', label: 'Cao' },
                  { value: 'medium', label: 'Trung binh' },
                  { value: 'low', label: 'Thap' },
                ]}
              />
            </Form.Item>

            <Form.Item name="default_duration_days" label="Thoi gian (ngay)" style={{ flex: 1 }} initialValue={3}>
              <InputNumber min={1} max={365} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.List name="checklist_items">
            {(fields, { add, remove }) => (
              <>
                <label style={{ fontWeight: 500, marginBottom: 8, display: 'block' }}>
                  Checklist
                </label>
                {fields.map(({ key, name, ...rest }) => (
                  <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <Form.Item
                      {...rest}
                      name={name}
                      style={{ flex: 1, marginBottom: 0 }}
                      rules={[{ required: true, message: 'Nhap noi dung' }]}
                    >
                      <Input placeholder="Noi dung checklist" />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(name)}
                    />
                  </div>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  Them muc checklist
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* ── Create/Edit Recurring Modal ── */}
      <Modal
        title={editingRule ? 'Sua lich tu dong' : 'Tao lich tu dong moi'}
        open={recurringModalOpen}
        onOk={handleSaveRecurring}
        onCancel={() => {
          setRecurringModalOpen(false)
          setEditingRule(null)
          recurringForm.resetFields()
        }}
        okText="Luu"
        cancelText="Huy"
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
        width={520}
        destroyOnClose
      >
        <Form form={recurringForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Ten lich"
            rules={[{ required: true, message: 'Vui long nhap ten' }]}
          >
            <Input placeholder="VD: Kiem tra thiet bi moi thu Hai" />
          </Form.Item>

          <Form.Item
            name="template_id"
            label="Mau cong viec"
            rules={[{ required: true, message: 'Vui long chon mau' }]}
          >
            <Select
              placeholder="Chon mau"
              showSearch
              optionFilterProp="label"
              options={templates
                .filter(t => t.is_active)
                .map(t => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>

          <Form.Item
            name="frequency"
            label="Tan suat"
            rules={[{ required: true, message: 'Vui long chon tan suat' }]}
          >
            <Select
              placeholder="Chon tan suat"
              options={[
                { value: 'daily', label: 'Hang ngay' },
                { value: 'weekly', label: 'Hang tuan' },
                { value: 'biweekly', label: 'Hai tuan / lan' },
                { value: 'monthly', label: 'Hang thang' },
              ]}
            />
          </Form.Item>

          {(frequencyValue === 'weekly' || frequencyValue === 'biweekly') && (
            <Form.Item
              name="day_of_week"
              label="Ngay trong tuan"
              rules={[{ required: true, message: 'Chon ngay' }]}
            >
              <Select
                placeholder="Chon ngay"
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
              label="Ngay trong thang"
              rules={[{ required: true, message: 'Nhap ngay' }]}
            >
              <InputNumber min={1} max={28} style={{ width: '100%' }} placeholder="1 - 28" />
            </Form.Item>
          )}

          <Form.Item name="assignee_id" label="Nguoi duoc giao">
            <Select
              allowClear
              placeholder="Chon nhan vien"
              showSearch
              optionFilterProp="label"
              options={employees.map(e => ({ value: e.id, label: e.full_name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
