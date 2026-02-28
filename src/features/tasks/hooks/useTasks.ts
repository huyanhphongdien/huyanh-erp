// src/features/tasks/hooks/useTasks.ts
// ============================================================================
// FIX: 
// 1. Thêm enabled condition - không fetch khi filter undefined
// 2. Thêm null safety cho data mapping
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
  priority?: string | string[]
}

interface Task {
  id: string
  code?: string
  name?: string
  title?: string
  description?: string | null
  department_id?: string | null
  assigner_id?: string | null
  assignee_id?: string | null
  start_date?: string | null
  due_date?: string | null
  completed_date?: string | null
  status: string
  priority: string
  progress: number
  notes?: string | null
  created_at?: string
  updated_at?: string
  department?: { id: string; code?: string; name: string } | null
  assigner?: { id: string; code?: string; full_name: string } | null
  assignee?: { id: string; code?: string; full_name: string } | null
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
    .select(`
      *,
      department:departments(id, code, name),
      assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
      assignee:employees!tasks_assignee_id_fkey(id, code, full_name)
    `, { count: 'exact' })

  // Apply filters
  if (filter?.search) {
    const searchTerm = `%${filter.search}%`
    query = query.or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
    console.log('📝 Applied search:', filter.search)
  }

  if (filter?.department_id) {
    query = query.eq('department_id', filter.department_id)
    console.log('🏢 Applied department:', filter.department_id)
  }

  if (filter?.assignee_id) {
    query = query.eq('assignee_id', filter.assignee_id)
    console.log('👤 Applied assignee:', filter.assignee_id)
  }

  if (filter?.status) {
    if (Array.isArray(filter.status)) {
      query = query.in('status', filter.status)
    } else {
      query = query.eq('status', filter.status)
    }
    console.log('📊 Applied status:', filter.status)
  }

  if (filter?.priority) {
    if (Array.isArray(filter.priority)) {
      query = query.in('priority', filter.priority)
    } else {
      query = query.eq('priority', filter.priority)
    }
    console.log('⚡ Applied priority:', filter.priority)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('❌ [useTasks] Error:', error)
    throw error
  }

  // ★ FIX: Null safety - đảm bảo data luôn là array
  const safeData = Array.isArray(data) ? data : []

  // Map name -> title cho UI + normalize relations
  const mappedData = safeData.map(task => ({
    ...task,
    title: task.name || task.title || '',
    // ★ FIX: Normalize Supabase relations (có thể trả về array thay vì object)
    department: Array.isArray(task.department) ? task.department[0] : task.department,
    assigner: Array.isArray(task.assigner) ? task.assigner[0] : task.assigner,
    assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee,
  }))

  console.log('✅ [useTasks] Result:', { count, returned: mappedData.length })

  return {
    data: mappedData,
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize)
  }
}

async function fetchTaskById(id: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      department:departments(id, code, name),
      assigner:employees!tasks_assigner_id_fkey(id, code, full_name),
      assignee:employees!tasks_assignee_id_fkey(id, code, full_name)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data ? { 
    ...data, 
    title: data.name || data.title,
    // ★ FIX: Normalize relations
    department: Array.isArray(data.department) ? data.department[0] : data.department,
    assigner: Array.isArray(data.assigner) ? data.assigner[0] : data.assigner,
    assignee: Array.isArray(data.assignee) ? data.assignee[0] : data.assignee,
  } : null
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

// ★ FIX: Thêm enabled condition + placeholderData để tránh crash
export function useTasks(page = 1, pageSize = 10, filter?: TaskFilter) {
  return useQuery({
    queryKey: ['tasks', page, pageSize, filter],
    queryFn: () => fetchTasks(page, pageSize, filter),
    // ★ FIX: Không fetch khi filter chưa sẵn sàng (undefined = đang loading permissions)
    enabled: filter !== undefined,
    // ★ FIX: Đảm bảo luôn có data structure đúng để .map() không crash
    placeholderData: {
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    },
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