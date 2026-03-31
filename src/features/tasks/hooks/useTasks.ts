// src/features/tasks/hooks/useTasks.ts
// ============================================================================
// v4: Phase 2 — Thêm project + phase join cho breadcrumb
// THAY ĐỔI:
// - fetchTaskById: thêm project:projects(...), phase:project_phases(...)
// - fetchTasks: thêm project:projects(...) cho danh sách
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

// ============ INLINE TYPES ============
interface TaskFilter {
  search?: string
  department_id?: string
  assignee_id?: string
  assigner_id?: string
  status?: string | string[]
  priority?: string
  date_from?: string
  date_to?: string
  due_date_from?: string
  due_date_to?: string
  created_date_from?: string
  created_date_to?: string
}

interface Task {
  id: string
  code?: string
  name: string
  title?: string
  description?: string
  department_id?: string
  assigner_id?: string
  assignee_id?: string
  start_date?: string
  due_date?: string
  status: string
  priority: string
  progress: number
  notes?: string
  is_self_assigned?: boolean
  evaluation_status?: string
  parent_task_id?: string
  project_id?: string
  phase_id?: string
  created_at?: string
  updated_at?: string
  completed_date?: string
  // Relations
  department?: { id: string; code?: string; name: string } | null
  assigner?: { id: string; code?: string; full_name: string } | null
  assignee?: { id: string; code?: string; full_name: string } | null
  project?: { id: string; code: string; name: string } | null
  phase?: { id: string; name: string } | null
}

interface TaskListResponse {
  data: Task[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface CreateTaskInput {
  name?: string
  title?: string
  description?: string
  department_id?: string
  assigner_id?: string
  assignee_id?: string
  start_date?: string
  due_date?: string
  status?: string
  priority?: string
  progress?: number
  notes?: string
}

// ============ COMMON SELECT ============
// Tập trung 1 chỗ để dễ maintain
// NOTE: tasks_phase_id_fkey ĐÃ CÓ. tasks_project_id_fkey CẦN TẠO.
// Nếu chưa có FK project_id → chạy:
//   ALTER TABLE tasks ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
// Hoặc nếu chưa có column:
//   ALTER TABLE tasks ADD COLUMN project_id uuid REFERENCES projects(id);
const TASK_SELECT_WITH_RELATIONS = `
  *,
  department:departments(id, code, name),
  assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
  assignee:employees!tasks_assignee_id_fkey(id, code, full_name),
  project:projects!tasks_project_id_fkey(id, code, name),
  phase:project_phases!tasks_phase_id_fkey(id, name)
`

const TASK_LIST_SELECT = `
  *,
  department:departments(id, code, name),
  assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
  assignee:employees!tasks_assignee_id_fkey(id, code, full_name),
  project:projects!tasks_project_id_fkey(id, code, name)
`

// ============ SERVICE FUNCTIONS ============
async function fetchTasks(
  page: number,
  pageSize: number,
  filter?: TaskFilter
): Promise<TaskListResponse> {
  console.log('🔍 [useTasks] fetchTasks called:', { page, pageSize, filter })

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('tasks')
    .select(TASK_LIST_SELECT, { count: 'exact' })

  // Apply filters
  if (filter?.search) {
    const searchTerm = `%${filter.search}%`
    query = query.or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
  }

  if (filter?.department_id) {
    query = query.eq('department_id', filter.department_id)
  }

  if (filter?.assignee_id) {
    query = query.eq('assignee_id', filter.assignee_id)
  }

  if (filter?.assigner_id) {
    query = query.eq('assigner_id', filter.assigner_id)
  }

  if (filter?.status) {
    if (Array.isArray(filter.status)) {
      query = query.in('status', filter.status)
    } else {
      query = query.eq('status', filter.status)
    }
  }

  if (filter?.priority) {
    query = query.eq('priority', filter.priority)
  }

  // ★ Date filters — due_date
  if (filter?.date_from || filter?.due_date_from) {
    query = query.gte('due_date', filter.date_from || filter.due_date_from!)
  }
  if (filter?.date_to || filter?.due_date_to) {
    query = query.lte('due_date', filter.date_to || filter.due_date_to!)
  }

  // ★ Date filters — created_at
  if (filter?.created_date_from) {
    query = query.gte('created_at', filter.created_date_from + 'T00:00:00')
  }
  if (filter?.created_date_to) {
    query = query.lte('created_at', filter.created_date_to + 'T23:59:59')
  }

  // ★ Mặc định: chỉ hiện task tháng hiện tại (created_at >= đầu tháng)
  if (!filter?.date_from && !filter?.due_date_from && !filter?.created_date_from && !filter?.search) {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`
    query = query.gte('created_at', monthStart)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('❌ [useTasks] Error:', error)
    throw error
  }

  // Map name -> title cho UI + normalize relations
  const mappedData = (data || []).map(task => ({
    ...task,
    title: task.name || task.title || '',
    department: Array.isArray(task.department) ? task.department[0] : task.department,
    assigner: Array.isArray(task.assigner) ? task.assigner[0] : task.assigner,
    assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee,
    project: Array.isArray(task.project) ? task.project[0] : task.project,
  }))

  return {
    data: mappedData,
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  }
}

async function fetchTaskById(id: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT_WITH_RELATIONS)
    .eq('id', id)
    .single()

  if (error) throw error
  if (!data) return null

  // Normalize FK arrays
  return {
    ...data,
    title: data.name || data.title,
    department: Array.isArray(data.department) ? data.department[0] : data.department,
    assigner: Array.isArray(data.assigner) ? data.assigner[0] : data.assigner,
    assignee: Array.isArray(data.assignee) ? data.assignee[0] : data.assignee,
    project: Array.isArray(data.project) ? data.project[0] : data.project,
    phase: Array.isArray(data.phase) ? data.phase[0] : data.phase,
  }
}

async function createTask(input: CreateTaskInput): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, name: input.title || input.name })
    .select()
    .single()

  if (error) throw error
  return data
}

async function updateTask(id: string, input: CreateTaskInput): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...input, name: input.title || input.name })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============ HOOKS ============
export function useTasks(page = 1, pageSize = 10, filter?: TaskFilter) {
  return useQuery({
    queryKey: ['tasks', page, pageSize, filter],
    queryFn: () => fetchTasks(page, pageSize, filter),
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => fetchTaskById(id),
    enabled: !!id,
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateTaskInput }) =>
      updateTask(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', id] })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}