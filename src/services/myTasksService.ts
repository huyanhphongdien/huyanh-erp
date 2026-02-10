// ============================================================================
// MY TASKS SERVICE - FIXED VERSION v4
// File: src/services/myTasksService.ts
// 
// FIXED: 
// 1. Loại trừ tasks có status "draft" khỏi danh sách công việc của nhân viên
// 2. Dùng 'finished' thay vì 'completed' (khớp với database constraint)
// 3. Dùng 'paused' thay vì 'on_hold' (khớp với database constraint)
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface MyTask {
  id: string
  code: string
  name: string
  description?: string | null
  department_id?: string | null
  assigner_id?: string | null
  assignee_id?: string | null
  start_date?: string | null
  due_date?: string | null
  status: string
  priority: string
  progress: number
  notes?: string | null
  is_self_assigned?: boolean
  evaluation_status?: string | null
  created_at?: string
  updated_at?: string
  // Relations
  department?: {
    id: string
    name: string
  } | null
  assigner?: {
    id: string
    full_name: string
  } | null
  // Thêm field để biết role của user trong task
  my_role?: 'assignee' | 'participant'
  // Self evaluation fields - CRITICAL for workflow
  has_self_evaluation: boolean
  self_evaluation_status?: string | null
  self_evaluation_id?: string | null
}

export interface MyTasksFilter {
  status?: string
  priority?: string
  department_id?: string
  search?: string
  from_date?: string
  to_date?: string
  include_draft?: boolean  // Thêm option để bao gồm draft (mặc định false)
}

export interface MyTasksResponse {
  data: MyTask[]
  total: number
}

// ============================================================================
// CONSTANTS - KHỚP VỚI DATABASE CONSTRAINTS
// Database: draft, in_progress, paused, finished, cancelled
// ============================================================================

// Các status mà nhân viên KHÔNG nên thấy
const EXCLUDED_STATUSES_FOR_EMPLOYEE = ['draft']

// ✅ FIXED: Status đã hoàn thành - dùng 'finished' không phải 'completed'
const _COMPLETED_STATUSES = ['finished', 'cancelled']

// ============================================================================
// SERVICE
// ============================================================================

export const myTasksService = {
  /**
   * Lấy danh sách công việc của tôi
   * Bao gồm:
   * 1. Tasks mà tôi là người phụ trách chính (assignee_id = myId)
   * 2. Tasks mà tôi tham gia (trong task_assignments)
   * 
   * FIX v4: Dùng 'finished' thay vì 'completed'
   */
  async getMyTasks(employeeId: string, filter?: MyTasksFilter): Promise<MyTasksResponse> {
    console.log('📋 [myTasksService] getMyTasks for:', employeeId)
    console.log('📋 [myTasksService] Filter:', filter)

    try {
      // ============================================
      // QUERY 1: Tasks tôi là người phụ trách chính
      // ============================================
      let assigneeQuery = supabase
        .from('tasks')
        .select(`
          id,
          code,
          name,
          description,
          department_id,
          assigner_id,
          assignee_id,
          start_date,
          due_date,
          status,
          priority,
          progress,
          notes,
          is_self_assigned,
          evaluation_status,
          created_at,
          updated_at,
          department:departments(id, name),
          assigner:employees!tasks_assigner_id_fkey(id, full_name)
        `, { count: 'exact' })
        .eq('assignee_id', employeeId)

      // *** CRITICAL FIX: Loại trừ draft status (trừ khi được yêu cầu) ***
      if (!filter?.include_draft) {
        assigneeQuery = assigneeQuery.not('status', 'in', `(${EXCLUDED_STATUSES_FOR_EMPLOYEE.join(',')})`)
      }

      // Apply filters
      if (filter?.status && filter.status !== 'all') {
        assigneeQuery = assigneeQuery.eq('status', filter.status)
      }
      if (filter?.priority && filter.priority !== 'all') {
        assigneeQuery = assigneeQuery.eq('priority', filter.priority)
      }
      if (filter?.department_id && filter.department_id !== 'all') {
        assigneeQuery = assigneeQuery.eq('department_id', filter.department_id)
      }
      if (filter?.search) {
        assigneeQuery = assigneeQuery.or(`name.ilike.%${filter.search}%,code.ilike.%${filter.search}%`)
      }
      if (filter?.from_date) {
        assigneeQuery = assigneeQuery.gte('due_date', filter.from_date)
      }
      if (filter?.to_date) {
        assigneeQuery = assigneeQuery.lte('due_date', filter.to_date)
      }

      const { data: assigneeTasks, error: assigneeError, count: _assigneeCount } = await assigneeQuery
        .order('updated_at', { ascending: false })

      if (assigneeError) {
        console.error('❌ [myTasksService] Error fetching assignee tasks:', assigneeError)
        throw assigneeError
      }

      console.log('✅ [myTasksService] Found', assigneeTasks?.length || 0, 'tasks as assignee (excluding draft)')

      // ============================================
      // QUERY 2: Tasks tôi tham gia (participants)
      // ============================================
      let participantQuery = supabase
        .from('task_assignments')
        .select(`
          task_id,
          role,
          status,
          task:tasks(
            id,
            code,
            name,
            description,
            department_id,
            assigner_id,
            assignee_id,
            start_date,
            due_date,
            status,
            priority,
            progress,
            notes,
            is_self_assigned,
            evaluation_status,
            created_at,
            updated_at,
            department:departments(id, name),
            assigner:employees!tasks_assigner_id_fkey(id, full_name)
          )
        `)
        .eq('employee_id', employeeId)
        .neq('status', 'removed')

      const { data: participantData, error: participantError } = await participantQuery

      if (participantError) {
        console.error('❌ [myTasksService] Error fetching participant tasks:', participantError)
        // Không throw, chỉ log và tiếp tục với assignee tasks
      }

      console.log('✅ [myTasksService] Found', participantData?.length || 0, 'tasks as participant')

      // ============================================
      // QUERY 3: Lấy tất cả self-evaluations của employee này
      // ============================================
      const { data: selfEvaluations, error: evalError } = await supabase
        .from('task_self_evaluations')
        .select('id, task_id, status')
        .eq('employee_id', employeeId)

      if (evalError) {
        console.error('❌ [myTasksService] Error fetching self-evaluations:', evalError)
        // Không throw, tiếp tục với empty map
      }

      // Tạo map để lookup nhanh: task_id -> { has_self_evaluation, status, id }
      const selfEvalMap = new Map<string, { has: boolean; status: string; id: string }>()
      if (selfEvaluations) {
        for (const eval_ of selfEvaluations) {
          selfEvalMap.set(eval_.task_id, {
            has: true,
            status: eval_.status,
            id: eval_.id
          })
        }
      }

      console.log('✅ [myTasksService] Found', selfEvalMap.size, 'self-evaluations')

      // ============================================
      // COMBINE & DEDUPLICATE & ENRICH
      // ============================================
      const taskMap = new Map<string, MyTask>()

      // Add assignee tasks first (có priority cao hơn)
      if (assigneeTasks) {
        for (const task of assigneeTasks) {
          const evalInfo = selfEvalMap.get(task.id)
          
          taskMap.set(task.id, {
            ...task,
            my_role: 'assignee' as const,
            department: Array.isArray(task.department) ? task.department[0] : task.department,
            assigner: Array.isArray(task.assigner) ? task.assigner[0] : task.assigner,
            // CRITICAL: Thêm self-evaluation info
            has_self_evaluation: evalInfo?.has || false,
            self_evaluation_status: evalInfo?.status || null,
            self_evaluation_id: evalInfo?.id || null,
          })
        }
      }

      // Add participant tasks (chỉ nếu chưa có trong map VÀ không phải draft)
      if (participantData) {
        for (const assignment of participantData) {
          const task = assignment.task as any
          if (task && !taskMap.has(task.id)) {
            // *** CRITICAL FIX: Skip draft tasks cho participants ***
            if (!filter?.include_draft && EXCLUDED_STATUSES_FOR_EMPLOYEE.includes(task.status)) {
              continue
            }
            
            // Apply filters manually for participant tasks
            if (filter?.status && filter.status !== 'all' && task.status !== filter.status) continue
            if (filter?.priority && filter.priority !== 'all' && task.priority !== filter.priority) continue
            if (filter?.department_id && filter.department_id !== 'all' && task.department_id !== filter.department_id) continue
            if (filter?.search) {
              const searchLower = filter.search.toLowerCase()
              if (!task.name?.toLowerCase().includes(searchLower) && 
                  !task.code?.toLowerCase().includes(searchLower)) continue
            }

            const evalInfo = selfEvalMap.get(task.id)

            taskMap.set(task.id, {
              ...task,
              my_role: 'participant' as const,
              department: Array.isArray(task.department) ? task.department[0] : task.department,
              assigner: Array.isArray(task.assigner) ? task.assigner[0] : task.assigner,
              has_self_evaluation: evalInfo?.has || false,
              self_evaluation_status: evalInfo?.status || null,
              self_evaluation_id: evalInfo?.id || null,
            })
          }
        }
      }

      // Convert to array và sort
      const combinedTasks = Array.from(taskMap.values())
      combinedTasks.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0).getTime()
        const dateB = new Date(b.updated_at || b.created_at || 0).getTime()
        return dateB - dateA
      })

      console.log('✅ [myTasksService] Total combined tasks (excluding draft):', combinedTasks.length)

      return {
        data: combinedTasks,
        total: combinedTasks.length
      }

    } catch (error) {
      console.error('❌ [myTasksService] getMyTasks error:', error)
      throw error
    }
  },

  /**
   * Lấy task theo ID
   */
  async getMyTaskById(taskId: string, employeeId: string): Promise<MyTask | null> {
    console.log('📋 [myTasksService] getMyTaskById:', taskId, 'for employee:', employeeId)

    try {
      const { data: task, error } = await supabase
        .from('tasks')
        .select(`
          id,
          code,
          name,
          description,
          department_id,
          assigner_id,
          assignee_id,
          start_date,
          due_date,
          status,
          priority,
          progress,
          notes,
          is_self_assigned,
          evaluation_status,
          created_at,
          updated_at,
          department:departments(id, name),
          assigner:employees!tasks_assigner_id_fkey(id, full_name)
        `)
        .eq('id', taskId)
        .single()

      if (error) throw error
      if (!task) return null

      // Verify employee has access (là assignee hoặc participant)
      const isAssignee = task.assignee_id === employeeId

      if (!isAssignee) {
        // Check if participant
        const { data: assignment } = await supabase
          .from('task_assignments')
          .select('id')
          .eq('task_id', taskId)
          .eq('employee_id', employeeId)
          .neq('status', 'removed')
          .single()

        if (!assignment) {
          console.warn('⚠️ [myTasksService] Employee does not have access to task')
          return null
        }
      }

      // Get self-evaluation info
      const { data: selfEval } = await supabase
        .from('task_self_evaluations')
        .select('id, status')
        .eq('task_id', taskId)
        .eq('employee_id', employeeId)
        .single()

      return {
        ...task,
        my_role: isAssignee ? 'assignee' : 'participant',
        department: Array.isArray(task.department) ? task.department[0] : task.department,
        assigner: Array.isArray(task.assigner) ? task.assigner[0] : task.assigner,
        has_self_evaluation: !!selfEval,
        self_evaluation_status: selfEval?.status || null,
        self_evaluation_id: selfEval?.id || null,
      }

    } catch (error) {
      console.error('❌ [myTasksService] getMyTaskById error:', error)
      throw error
    }
  },

  /**
   * Cập nhật progress task
   */
  async updateProgress(taskId: string, progress: number): Promise<void> {
    console.log('📋 [myTasksService] updateProgress:', taskId, progress)

    const { error } = await supabase
      .from('tasks')
      .update({ 
        progress,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)

    if (error) {
      console.error('❌ [myTasksService] updateProgress error:', error)
      throw error
    }
  },

  /**
   * Cập nhật status task
   * ✅ FIXED: Dùng 'finished' thay vì 'completed'
   */
  async updateStatus(taskId: string, status: string): Promise<void> {
    console.log('📋 [myTasksService] updateStatus:', taskId, status)

    const updateData: any = { 
      status,
      updated_at: new Date().toISOString()
    }

    // ✅ FIXED: Nếu hoàn thành thì set progress = 100
    if (status === 'finished') {
      updateData.progress = 100
    }

    const { error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)

    if (error) {
      console.error('❌ [myTasksService] updateStatus error:', error)
      throw error
    }
  },

  /**
   * Đếm số task theo status
   * FIX: Loại trừ draft status
   */
  async getTaskCountsByStatus(employeeId: string): Promise<Record<string, number>> {
    console.log('📋 [myTasksService] getTaskCountsByStatus:', employeeId)

    const { data, error } = await supabase
      .from('tasks')
      .select('status')
      .eq('assignee_id', employeeId)
      .not('status', 'in', `(${EXCLUDED_STATUSES_FOR_EMPLOYEE.join(',')})`)

    if (error) {
      console.error('❌ [myTasksService] getTaskCountsByStatus error:', error)
      return {}
    }

    // ✅ FIXED: Dùng 'finished' và 'paused' thay vì 'completed' và 'on_hold'
    const counts: Record<string, number> = {
      total: data.length,
      in_progress: 0,
      paused: 0,       // ✅ Fixed: paused không phải on_hold
      finished: 0,     // ✅ Fixed: finished không phải completed
      cancelled: 0,
    }

    for (const task of data) {
      if (counts[task.status] !== undefined) {
        counts[task.status]++
      }
    }

    return counts
  },

  /**
   * Lấy danh sách task đã hoàn thành chưa có self-evaluation
   * Hoặc có self-evaluation bị yêu cầu sửa
   * ✅ FIXED: Dùng 'finished' thay vì 'completed'
   */
  async getCompletedTasksForEvaluation(employeeId: string): Promise<{ data: MyTask[]; error: Error | null }> {
    console.log('📋 [myTasksService] getCompletedTasksForEvaluation:', employeeId)

    try {
      // ✅ FIXED: Lấy tasks đã hoàn thành (finished) của employee
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id,
          code,
          name,
          description,
          department_id,
          assigner_id,
          assignee_id,
          start_date,
          due_date,
          status,
          priority,
          progress,
          notes,
          is_self_assigned,
          evaluation_status,
          created_at,
          updated_at,
          department:departments(id, name)
        `)
        .eq('assignee_id', employeeId)
        .in('status', ['finished'])  // ✅ Fixed: chỉ 'finished'
        .not('status', 'in', `(${EXCLUDED_STATUSES_FOR_EMPLOYEE.join(',')})`)

      if (tasksError) throw tasksError

      // Lấy danh sách task_id đã có self-evaluation
      const { data: evaluations, error: evalError } = await supabase
        .from('task_self_evaluations')
        .select('id, task_id, status')
        .eq('employee_id', employeeId)

      if (evalError) throw evalError

      // Tạo map để check nhanh
      const evaluationMap = new Map<string, { status: string; id: string }>()
      evaluations?.forEach(e => evaluationMap.set(e.task_id, { status: e.status, id: e.id }))

      // Filter tasks chưa có self-evaluation HOẶC có self-evaluation bị yêu cầu sửa
      const availableTasks: MyTask[] = tasks?.filter(t => {
        const evalInfo = evaluationMap.get(t.id)
        // Chưa có evaluation hoặc đang bị yêu cầu sửa
        return !evalInfo || evalInfo.status === 'revision_requested'
      }).map(t => {
        const evalInfo = evaluationMap.get(t.id)
        return {
          ...t,
          department: Array.isArray(t.department) ? t.department[0] : t.department,
          has_self_evaluation: !!evalInfo,
          self_evaluation_status: evalInfo?.status || null,
          self_evaluation_id: evalInfo?.id || null,
        }
      }) || []

      console.log('✅ [myTasksService] Found', availableTasks.length, 'tasks for evaluation')

      return { data: availableTasks, error: null }
    } catch (error) {
      console.error('❌ [myTasksService] getCompletedTasksForEvaluation error:', error)
      return { data: [], error: error as Error }
    }
  },

  /**
   * Lấy thống kê công việc của tôi
   * ✅ FIXED: Dùng 'finished' thay vì 'completed', 'paused' thay vì 'on_hold'
   */
  async getMyTasksStats(employeeId: string): Promise<{
    total: number
    in_progress: number
    paused: number
    finished: number
    cancelled: number
    overdue: number
    awaiting_self_eval: number
    pending_approval: number
    approved: number
  }> {
    console.log('📋 [myTasksService] getMyTasksStats:', employeeId)

    // Get all tasks (excluding draft)
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, status, due_date, progress')
      .eq('assignee_id', employeeId)
      .not('status', 'in', `(${EXCLUDED_STATUSES_FOR_EMPLOYEE.join(',')})`)

    if (error) {
      console.error('❌ [myTasksService] getMyTasksStats error:', error)
      return {
        total: 0,
        in_progress: 0,
        paused: 0,
        finished: 0,
        cancelled: 0,
        overdue: 0,
        awaiting_self_eval: 0,
        pending_approval: 0,
        approved: 0
      }
    }

    // Get self-evaluations
    const { data: selfEvals } = await supabase
      .from('task_self_evaluations')
      .select('task_id, status')
      .eq('employee_id', employeeId)

    const evalMap = new Map<string, string>()
    selfEvals?.forEach(e => evalMap.set(e.task_id, e.status))

    const now = new Date()
    const stats = {
      total: tasks.length,
      in_progress: 0,
      paused: 0,      // ✅ Fixed
      finished: 0,    // ✅ Fixed
      cancelled: 0,
      overdue: 0,
      awaiting_self_eval: 0,
      pending_approval: 0,
      approved: 0
    }

    for (const task of tasks) {
      // Count by status - ✅ FIXED: dùng 'finished' và 'paused'
      if (task.status === 'in_progress') stats.in_progress++
      else if (task.status === 'paused') stats.paused++       // ✅ Fixed
      else if (task.status === 'finished') stats.finished++   // ✅ Fixed
      else if (task.status === 'cancelled') stats.cancelled++

      // Count overdue (not finished and past due date) - ✅ FIXED
      if (task.due_date && !['finished', 'cancelled'].includes(task.status)) {
        const dueDate = new Date(task.due_date)
        if (dueDate < now) {
          stats.overdue++
        }
      }

      // Count self-evaluation status for finished tasks - ✅ FIXED
      if (task.status === 'finished' || task.progress >= 100) {
        const evalStatus = evalMap.get(task.id)
        if (!evalStatus) {
          stats.awaiting_self_eval++
        } else if (evalStatus === 'pending') {
          stats.pending_approval++
        } else if (evalStatus === 'approved') {
          stats.approved++
        }
        // Note: revision_requested tasks đếm vào awaiting_self_eval vì cần sửa lại
        else if (evalStatus === 'revision_requested') {
          stats.awaiting_self_eval++
        }
      }
    }

    console.log('📊 [myTasksService] Stats (excluding draft):', stats)

    return stats
  }
}

export default myTasksService