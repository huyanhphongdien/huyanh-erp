// ============================================================================
// TASK KANBAN PAGE — Bảng Kanban công việc
// File: src/pages/tasks/TaskKanbanPage.tsx
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Card, Tag, Avatar, Progress, Badge, Select, Typography, Spin, message, Empty,
} from 'antd'
import {
  ReloadOutlined, UserOutlined, CalendarOutlined, CheckSquareOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const { Text, Title } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface KanbanTask {
  id: string
  code: string
  name: string
  status: string
  priority: string
  progress: number
  due_date: string | null
  assignee_id: string | null
  department_id: string | null
  assignee?: { id: string; full_name: string } | null
  department?: { id: string; name: string } | null
  checklist_total?: number
  checklist_done?: number
}

interface Department {
  id: string
  name: string
}

interface Employee {
  id: string
  full_name: string
}

// ============================================================================
// COLUMN CONFIG
// ============================================================================

const COLUMNS = [
  { key: 'draft', label: 'Nháp', color: '#8c8c8c', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
  { key: 'in_progress', label: 'Đang làm', color: '#1890ff', bgColor: '#e6f7ff', borderColor: '#91d5ff' },
  { key: 'paused', label: 'Tạm dừng', color: '#faad14', bgColor: '#fffbe6', borderColor: '#ffe58f' },
  { key: 'finished', label: 'Hoàn thành', color: '#52c41a', bgColor: '#f6ffed', borderColor: '#b7eb8f' },
]

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Thấp', color: 'default' },
  medium: { label: 'TB', color: 'blue' },
  high: { label: 'Cao', color: 'orange' },
  urgent: { label: 'Gấp', color: 'red' },
}

// ============================================================================
// HELPERS
// ============================================================================

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'finished' || status === 'cancelled') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return due < today
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

// ============================================================================
// KANBAN CARD COMPONENT
// ============================================================================

function KanbanCard({
  task,
  onDragStart,
  onClick,
}: {
  task: KanbanTask
  onDragStart: (e: React.DragEvent, taskId: string) => void
  onClick: (taskId: string) => void
}) {
  const overdue = isOverdue(task.due_date, task.status)
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
  const assigneeName = task.assignee?.full_name || ''

  return (
    <div
      draggable="true"
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => onClick(task.id)}
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 8,
        cursor: 'grab',
        border: '1px solid #f0f0f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Code */}
      <Text type="secondary" style={{ fontSize: 11 }}>{task.code}</Text>

      {/* Name */}
      <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 8px', lineHeight: 1.4 }}>
        {task.name}
      </div>

      {/* Priority + Due date row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <Tag color={priorityCfg.color} style={{ margin: 0, fontSize: 11 }}>
          {priorityCfg.label}
        </Tag>
        {task.due_date && (
          <span style={{
            fontSize: 11,
            color: overdue ? '#ff4d4f' : '#8c8c8c',
            fontWeight: overdue ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}>
            <CalendarOutlined style={{ fontSize: 10 }} />
            {formatDate(task.due_date)}
            {overdue && ' (trễ)'}
          </span>
        )}
      </div>

      {/* Progress */}
      <Progress
        percent={task.progress || 0}
        size="small"
        strokeColor={task.progress >= 100 ? '#52c41a' : '#1B4D3E'}
        style={{ marginBottom: 6 }}
      />

      {/* Bottom row: Assignee + Checklist */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Avatar size={20} icon={<UserOutlined />} style={{ backgroundColor: '#1B4D3E' }} />
          <Text style={{ fontSize: 11, color: '#595959', maxWidth: 100 }} ellipsis>
            {assigneeName || 'Chưa giao'}
          </Text>
        </div>
        {(task.checklist_total ?? 0) > 0 && (
          <span style={{ fontSize: 11, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 3 }}>
            <CheckSquareOutlined style={{ fontSize: 10 }} />
            {task.checklist_done || 0}/{task.checklist_total}
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// KANBAN COLUMN COMPONENT
// ============================================================================

function KanbanColumn({
  columnKey,
  label,
  color,
  bgColor,
  borderColor,
  tasks,
  onDragStart,
  onDrop,
  onCardClick,
  isDropTarget,
  onDragOver,
  onDragLeave,
}: {
  columnKey: string
  label: string
  color: string
  bgColor: string
  borderColor: string
  tasks: KanbanTask[]
  onDragStart: (e: React.DragEvent, taskId: string) => void
  onDrop: (e: React.DragEvent, status: string) => void
  onCardClick: (taskId: string) => void
  isDropTarget: boolean
  onDragOver: (e: React.DragEvent, status: string) => void
  onDragLeave: () => void
}) {
  return (
    <div
      style={{
        minWidth: 280,
        maxWidth: 320,
        flex: '1 1 280px',
        background: isDropTarget ? `${bgColor}` : '#fafafa',
        borderRadius: 10,
        border: isDropTarget ? `2px dashed ${color}` : `1px solid ${borderColor}`,
        transition: 'border 0.2s, background 0.2s',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 200px)',
      }}
      onDragOver={(e) => onDragOver(e, columnKey)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, columnKey)}
    >
      {/* Column Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: `2px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', background: color,
          }} />
          <Text strong style={{ fontSize: 14 }}>{label}</Text>
        </div>
        <Badge
          count={tasks.length}
          style={{ backgroundColor: color }}
          overflowCount={99}
        />
      </div>

      {/* Cards */}
      <div style={{
        padding: '8px 10px',
        overflowY: 'auto',
        flex: 1,
        minHeight: 100,
      }}>
        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Trống</Text>
          </div>
        ) : (
          tasks.map(task => (
            <KanbanCard
              key={task.id}
              task={task}
              onDragStart={onDragStart}
              onClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function TaskKanbanPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Filters
  const [filterDept, setFilterDept] = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<string | null>(null)

  // Dropdown options
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  // Load filter options
  useEffect(() => {
    async function loadOptions() {
      const [deptRes, empRes] = await Promise.all([
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('employees').select('id, full_name').eq('status', 'active').order('full_name'),
      ])
      setDepartments(deptRes.data || [])
      setEmployees(empRes.data || [])
    }
    loadOptions()
  }, [])

  // Load tasks
  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('tasks')
        .select(`
          id, code, name, status, priority, progress, due_date, assignee_id, department_id,
          assignee:employees!tasks_assignee_id_fkey(id, full_name),
          department:departments(id, name)
        `)
        .in('status', ['draft', 'in_progress', 'paused', 'finished'])
        .is('parent_task_id', null)
        .order('updated_at', { ascending: false })
        .limit(100)

      if (filterDept) query = query.eq('department_id', filterDept)
      if (filterAssignee) query = query.eq('assignee_id', filterAssignee)
      if (filterPriority) query = query.eq('priority', filterPriority)

      const { data, error } = await query

      if (error) throw error

      // Normalize relations
      const normalized = (data || []).map((t: any) => ({
        ...t,
        assignee: Array.isArray(t.assignee) ? t.assignee[0] : t.assignee,
        department: Array.isArray(t.department) ? t.department[0] : t.department,
      }))

      // Load checklist counts
      const taskIds = normalized.map((t: any) => t.id)
      if (taskIds.length > 0) {
        const { data: checklists } = await supabase
          .from('task_checklists')
          .select('task_id, is_completed')
          .in('task_id', taskIds)

        if (checklists) {
          const checkMap: Record<string, { total: number; done: number }> = {}
          for (const cl of checklists) {
            if (!checkMap[cl.task_id]) checkMap[cl.task_id] = { total: 0, done: 0 }
            checkMap[cl.task_id].total++
            if (cl.is_completed) checkMap[cl.task_id].done++
          }
          for (const t of normalized) {
            const info = checkMap[t.id]
            if (info) {
              t.checklist_total = info.total
              t.checklist_done = info.done
            }
          }
        }
      }

      setTasks(normalized)
    } catch (err: any) {
      message.error('Không thể tải danh sách công việc')
      console.error('Kanban load error:', err)
    }
    setLoading(false)
  }, [filterDept, filterAssignee, filterPriority])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(status)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    setDropTarget(null)

    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
    if (!taskId) return

    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) {
      setDraggedTaskId(null)
      return
    }

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: newStatus } : t
    ))

    setUpdating(true)
    try {
      const updateData: Record<string, any> = { status: newStatus }

      if (newStatus === 'finished') {
        updateData.progress = 100
        updateData.completed_date = new Date().toISOString()
      }

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)

      if (error) throw error

      message.success(`Chuyển sang "${COLUMNS.find(c => c.key === newStatus)?.label}"`)
    } catch (err: any) {
      // Revert
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: task.status } : t
      ))
      message.error('Không thể cập nhật trạng thái')
      console.error('Kanban drop error:', err)
    }

    setUpdating(false)
    setDraggedTaskId(null)
  }, [draggedTaskId, tasks])

  const handleCardClick = useCallback((taskId: string) => {
    navigate(`/tasks/${taskId}`)
  }, [navigate])

  // Group tasks by status
  const tasksByStatus: Record<string, KanbanTask[]> = {}
  for (const col of COLUMNS) {
    tasksByStatus[col.key] = tasks.filter(t => t.status === col.key)
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
          Bảng Kanban
        </Title>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Select
            placeholder="Phòng ban"
            allowClear
            style={{ minWidth: 150 }}
            value={filterDept}
            onChange={setFilterDept}
            options={departments.map(d => ({ value: d.id, label: d.name }))}
          />
          <Select
            placeholder="Người phụ trách"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 160 }}
            value={filterAssignee}
            onChange={setFilterAssignee}
            options={employees.map(e => ({ value: e.id, label: e.full_name }))}
          />
          <Select
            placeholder="Ưu tiên"
            allowClear
            style={{ minWidth: 110 }}
            value={filterPriority}
            onChange={setFilterPriority}
            options={[
              { value: 'low', label: 'Thấp' },
              { value: 'medium', label: 'Trung bình' },
              { value: 'high', label: 'Cao' },
              { value: 'urgent', label: 'Gấp' },
            ]}
          />
          <button
            onClick={() => loadTasks()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', borderRadius: 6,
              border: '1px solid #d9d9d9', background: '#fff',
              cursor: 'pointer', fontSize: 13,
            }}
          >
            <ReloadOutlined spin={loading} />
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {updating && (
        <div style={{
          position: 'fixed', top: 60, right: 20, zIndex: 1000,
          background: '#fff', padding: '8px 16px', borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Spin size="small" /> <Text style={{ fontSize: 13 }}>Đang cập nhật...</Text>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : tasks.length === 0 ? (
        <Empty description="Không có công việc nào" style={{ padding: 80 }} />
      ) : (
        <div style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 16,
        }}>
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.key}
              columnKey={col.key}
              label={col.label}
              color={col.color}
              bgColor={col.bgColor}
              borderColor={col.borderColor}
              tasks={tasksByStatus[col.key] || []}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onCardClick={handleCardClick}
              isDropTarget={dropTarget === col.key}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
