// ============================================================================
// TASK ANALYTICS SERVICE — Sprint 4 (M4 merge)
// File: src/services/taskAnalyticsService.ts
// ============================================================================
// Hợp nhất 2 service cũ:
// - taskStatsService  (Overview stats — dashboards counts)
// - taskReportService (Detailed reports — by department/position/employee)
//
// Cả 2 đều aggregate task data → để cùng 1 service Analytics duy nhất.
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// SECTION 1: OVERVIEW STATS (merged from taskStatsService)
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export interface DepartmentTaskStats {
  department_id: string;
  department_name: string;
  total_tasks: number;
  completed: number;      // Hiển thị "Hoàn thành" nhưng đếm 'finished'
  in_progress: number;
  pending: number;        // Đếm 'draft'
  on_hold: number;        // Hiển thị "Tạm dừng" nhưng đếm 'paused'
  cancelled: number;
  overdue: number;
  completion_rate: number;
  average_score: number;
}

export interface OverviewStats {
  total_tasks: number;
  completed: number;      // Đếm 'finished' tasks
  in_progress: number;
  pending: number;        // Đếm 'draft' tasks
  on_hold: number;        // Đếm 'paused' tasks
  cancelled: number;
  overdue: number;
  approved: number;
  completion_rate: number;
  average_score: number;
  by_department: DepartmentTaskStats[];
  by_status: { status: string; count: number; color: string }[];
  by_priority: { priority: string; count: number; color: string }[];
}

export interface StatsFilter {
  from_date: string;
  to_date: string;
  department_id?: string;
}

export interface TopEmployee {
  employee_id: string;
  employee_name: string;
  department_name: string;
  completed_count: number;
  average_score: number;
}

// Sprint 4 M4: renamed from OverdueTask → OverdueTaskSimple để tránh conflict
// với OverdueTask (rich version) merged từ taskReportService.
export interface OverdueTaskSimple {
  id: string;
  code: string;
  name: string;
  assignee_name: string;
  department_name: string;
  due_date: string;
  days_overdue: number;
}

// ============================================================================
// CONSTANTS - ✅ FIXED: Khớp với database constraints
// Database: draft, in_progress, paused, finished, cancelled
// ============================================================================

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',       // gray - Nháp
  in_progress: '#3b82f6', // blue - Đang làm
  paused: '#8b5cf6',      // purple - Tạm dừng (✅ thay vì on_hold)
  finished: '#22c55e',    // green - Hoàn thành (✅ thay vì completed)
  cancelled: '#ef4444',   // red - Đã hủy
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  in_progress: 'Đang làm',
  paused: 'Tạm dừng',     // ✅ thay vì on_hold
  finished: 'Hoàn thành', // ✅ thay vì completed
  cancelled: 'Đã hủy',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',  // red
  high: '#f97316',    // orange
  medium: '#3b82f6',  // blue
  low: '#6b7280',     // gray
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Khẩn cấp',
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ✅ FIXED: Dùng 'finished' thay vì 'completed'
function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'finished' || status === 'cancelled') return false;
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  const diffTime = today.getTime() - due.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Lấy thống kê tổng quan
 * ✅ FIXED: Đếm 'finished' thay vì 'completed', 'paused' thay vì 'on_hold'
 */
export async function getOverviewStats(filter: StatsFilter): Promise<{
  data: OverviewStats | null;
  error: Error | null;
}> {
  console.log('📊 [taskStatsService] getOverviewStats:', filter);

  try {
    // Build query
    let query = supabase
      .from('tasks')
      .select(`
        id,
        code,
        name,
        status,
        priority,
        due_date,
        department_id,
        assignee_id,
        evaluation_status,
        department:departments(id, name)
      `)
      .gte('created_at', filter.from_date)
      .lte('created_at', filter.to_date + 'T23:59:59');

    // Filter by department if specified
    if (filter.department_id && filter.department_id !== 'all') {
      query = query.eq('department_id', filter.department_id);
    }

    const { data: tasks, error: tasksError } = await query;

    if (tasksError) throw tasksError;

    if (!tasks || tasks.length === 0) {
      return {
        data: {
          total_tasks: 0,
          completed: 0,
          in_progress: 0,
          pending: 0,
          on_hold: 0,
          cancelled: 0,
          overdue: 0,
          approved: 0,
          completion_rate: 0,
          average_score: 0,
          by_department: [],
          by_status: [],
          by_priority: [],
        },
        error: null,
      };
    }

    // Get approval scores
    const taskIds = tasks.map(t => t.id);
    const { data: approvals } = await supabase
      .from('task_approvals')
      .select('task_id, approved_score')
      .in('task_id', taskIds)
      .eq('action', 'approved');

    const scoreMap = new Map<string, number>();
    approvals?.forEach(a => {
      if (a.approved_score) {
        scoreMap.set(a.task_id, a.approved_score);
      }
    });

    // Calculate overall stats
    let completed = 0;    // Đếm 'finished'
    let in_progress = 0;
    let pending = 0;      // Đếm 'draft'
    let on_hold = 0;      // Đếm 'paused'
    let cancelled = 0;
    let overdue = 0;
    let approved = 0;
    let totalScore = 0;
    let scoreCount = 0;

    // Group by department
    const deptMap = new Map<string, {
      id: string;
      name: string;
      total: number;
      completed: number;
      in_progress: number;
      pending: number;
      on_hold: number;
      cancelled: number;
      overdue: number;
      scores: number[];
    }>();

    // Group by status
    const statusCount: Record<string, number> = {};
    
    // Group by priority
    const priorityCount: Record<string, number> = {};

    tasks.forEach((task: any) => {
      const dept = Array.isArray(task.department) ? task.department[0] : task.department;
      const deptId = dept?.id || 'unknown';
      const deptName = dept?.name || 'Không xác định';

      // Initialize department stats
      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, {
          id: deptId,
          name: deptName,
          total: 0,
          completed: 0,
          in_progress: 0,
          pending: 0,
          on_hold: 0,
          cancelled: 0,
          overdue: 0,
          scores: [],
        });
      }

      const deptStats = deptMap.get(deptId)!;
      deptStats.total++;

      // Count by status
      statusCount[task.status] = (statusCount[task.status] || 0) + 1;
      
      // Count by priority
      priorityCount[task.priority] = (priorityCount[task.priority] || 0) + 1;

      // ✅ FIXED: Status counts - dùng 'finished', 'paused', 'draft'
      switch (task.status) {
        case 'finished':      // ✅ Fixed: thay vì 'completed'
          completed++;
          deptStats.completed++;
          break;
        case 'in_progress':
          in_progress++;
          deptStats.in_progress++;
          break;
        case 'draft':         // ✅ Fixed: thay vì 'pending'
          pending++;
          deptStats.pending++;
          break;
        case 'paused':        // ✅ Fixed: thay vì 'on_hold'
          on_hold++;
          deptStats.on_hold++;
          break;
        case 'cancelled':
          cancelled++;
          deptStats.cancelled++;
          break;
      }

      // Overdue check (đã sử dụng hàm isOverdue đã fix)
      if (isOverdue(task.due_date, task.status)) {
        overdue++;
        deptStats.overdue++;
      }

      // Approved count
      if (task.evaluation_status === 'approved') {
        approved++;
      }

      // Score
      const score = scoreMap.get(task.id);
      if (score) {
        totalScore += score;
        scoreCount++;
        deptStats.scores.push(score);
      }
    });

    // Build department stats array
    const by_department: DepartmentTaskStats[] = Array.from(deptMap.values())
      .map(d => ({
        department_id: d.id,
        department_name: d.name,
        total_tasks: d.total,
        completed: d.completed,
        in_progress: d.in_progress,
        pending: d.pending,
        on_hold: d.on_hold,
        cancelled: d.cancelled,
        overdue: d.overdue,
        completion_rate: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
        average_score: d.scores.length > 0 
          ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length) 
          : 0,
      }))
      .sort((a, b) => b.total_tasks - a.total_tasks);

    // Build status array với labels đúng
    const by_status = Object.entries(statusCount).map(([status, count]) => ({
      status: STATUS_LABELS[status] || status,
      count,
      color: STATUS_COLORS[status] || '#6b7280',
    }));

    // Build priority array
    const by_priority = Object.entries(priorityCount).map(([priority, count]) => ({
      priority: PRIORITY_LABELS[priority] || priority,
      count,
      color: PRIORITY_COLORS[priority] || '#6b7280',
    }));

    const total_tasks = tasks.length;
    const completion_rate = total_tasks > 0 ? Math.round((completed / total_tasks) * 100) : 0;
    const average_score = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

    console.log('✅ [taskStatsService] Stats calculated:', {
      total_tasks,
      completed,
      in_progress,
      pending,
      on_hold,
      overdue,
      approved,
    });

    return {
      data: {
        total_tasks,
        completed,
        in_progress,
        pending,
        on_hold,
        cancelled,
        overdue,
        approved,
        completion_rate,
        average_score,
        by_department,
        by_status,
        by_priority,
      },
      error: null,
    };
  } catch (error) {
    console.error('❌ [taskStatsService] getOverviewStats error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Lấy top nhân viên hoàn thành nhiều nhất
 * ✅ FIXED: Dùng 'finished' thay vì 'completed'
 */
export async function getTopEmployees(filter: StatsFilter, limit: number = 5): Promise<{
  data: TopEmployee[];
  error: Error | null;
}> {
  console.log('📊 [taskStatsService] getTopEmployees:', filter);

  try {
    let query = supabase
      .from('tasks')
      .select(`
        id,
        assignee_id,
        assignee:employees!tasks_assignee_id_fkey(id, full_name, department:departments(name))
      `)
      .eq('status', 'finished')  // ✅ Fixed: 'finished' thay vì 'completed'
      // A-H4 fix: thêm 'id' vào select để taskIds có giá trị
      .gte('created_at', filter.from_date)
      .lte('created_at', filter.to_date + 'T23:59:59');

    if (filter.department_id && filter.department_id !== 'all') {
      query = query.eq('department_id', filter.department_id);
    }

    const { data: tasks, error } = await query;

    if (error) throw error;

    // Get approval scores for completed tasks
    const taskIds = (tasks || []).map((t: any) => t.id);
    const { data: approvals } = taskIds.length > 0
      ? await supabase
          .from('task_approvals')
          .select('task_id, approved_score')
          .in('task_id', taskIds)
          .eq('action', 'approved')
      : { data: [] };

    const scoreByTask = new Map<string, number>();
    approvals?.forEach((a: any) => {
      if (a.approved_score) scoreByTask.set(a.task_id, a.approved_score);
    });

    // Count by employee
    const empMap = new Map<string, {
      id: string;
      name: string;
      department: string;
      count: number;
      scores: number[];
    }>();

    tasks?.forEach((task: any) => {
      const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;
      if (!assignee) return;

      const empId = assignee.id;
      const dept = Array.isArray(assignee.department) ? assignee.department[0] : assignee.department;

      if (!empMap.has(empId)) {
        empMap.set(empId, {
          id: empId,
          name: assignee.full_name,
          department: dept?.name || '',
          count: 0,
          scores: [],
        });
      }
      empMap.get(empId)!.count++;
      const score = scoreByTask.get(task.id);
      if (score) empMap.get(empId)!.scores.push(score);
    });

    // Sort and limit
    const topEmployees: TopEmployee[] = Array.from(empMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(e => ({
        employee_id: e.id,
        employee_name: e.name,
        department_name: e.department,
        completed_count: e.count,
        average_score: e.scores.length > 0
          ? Math.round(e.scores.reduce((a, b) => a + b, 0) / e.scores.length)
          : 0,
      }));

    return { data: topEmployees, error: null };
  } catch (error) {
    console.error('❌ [taskStatsService] getTopEmployees error:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Lấy danh sách công việc quá hạn
 * ✅ FIXED: Dùng 'finished' thay vì 'completed'
 */
export async function getOverdueTasks(filter: StatsFilter, limit: number = 10): Promise<{
  data: OverdueTaskSimple[];
  error: Error | null;
}> {
  console.log('📊 [taskStatsService] getOverdueTasks:', filter);

  try {
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('tasks')
      .select(`
        id,
        code,
        name,
        due_date,
        assignee:employees!tasks_assignee_id_fkey(full_name),
        department:departments(name)
      `)
      .lt('due_date', today)
      .not('status', 'in', '("finished","cancelled")')  // ✅ Fixed: 'finished' thay vì 'completed'
      .gte('created_at', filter.from_date)
      .lte('created_at', filter.to_date + 'T23:59:59')
      .order('due_date', { ascending: true })
      .limit(limit);

    if (filter.department_id && filter.department_id !== 'all') {
      query = query.eq('department_id', filter.department_id);
    }

    const { data: tasks, error } = await query;

    if (error) throw error;

    const overdueTasks: OverdueTaskSimple[] = (tasks || []).map((task: any) => {
      const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;
      const dept = Array.isArray(task.department) ? task.department[0] : task.department;

      return {
        id: task.id,
        code: task.code,
        name: task.name,
        assignee_name: assignee?.full_name || 'Chưa giao',
        department_name: dept?.name || '',
        due_date: task.due_date,
        days_overdue: getDaysOverdue(task.due_date),
      };
    });

    return { data: overdueTasks, error: null };
  } catch (error) {
    console.error('❌ [taskStatsService] getOverdueTasks error:', error);
    return { data: [], error: error as Error };
  }
}

// ============================================================================
// SERVICE OBJECT
// ============================================================================

export const taskStatsService = {
  getOverviewStats,
  getTopEmployees,
  getOverdueTasks,
};

// taskStatsService default removed (Sprint 4 M4 — use named export)
// ============================================================================
// SECTION 2: DETAILED REPORTS (merged from taskReportService)
// ============================================================================

// TYPES
// ============================================================================

export interface CompletionByDepartment {
  department_id: string
  department_code: string
  department_name: string
  total_tasks: number
  finished_tasks: number
  in_progress_tasks: number
  cancelled_tasks: number
  overdue_count: number
  completion_rate: number
  avg_score: number | null
}

export interface CompletionByPosition {
  position_id: string
  position_code: string
  position_name: string
  total_tasks: number
  finished_tasks: number
  in_progress_tasks: number
  cancelled_tasks: number
  overdue_count: number
  completion_rate: number
  avg_score: number | null
}

export interface CompletionByEmployee {
  employee_id: string
  employee_code: string
  employee_name: string
  department_id: string
  department_name: string
  position_id: string
  position_name: string
  total_tasks: number
  finished_tasks: number
  in_progress_tasks: number
  cancelled_tasks: number
  overdue_count: number
  on_time_count: number
  completion_rate: number
  on_time_rate: number
  avg_score: number | null
}

export interface CompletionTimeline {
  period: string
  total_tasks: number
  finished_tasks: number
  completion_rate: number
}

export interface PerformanceMetrics {
  total_tasks: number
  finished_tasks: number
  in_progress_tasks: number
  cancelled_tasks: number
  overdue_count: number
  on_time_count: number
  completion_rate: number
  on_time_rate: number
  overdue_rate: number
  avg_score: number | null
  avg_completion_days: number | null
}

export interface TopPerformer {
  employee_id: string
  employee_code: string
  employee_name: string
  department_name: string
  position_name: string
  total_tasks: number
  finished_tasks: number
  completion_rate: number
  on_time_rate: number
  avg_score: number | null
}

export interface OverdueTask {
  task_id: string
  task_code: string
  task_name: string
  assignee_id: string
  assignee_name: string
  department_id: string
  department_name: string
  due_date: string
  days_overdue: number
  priority: string
  status: string
}

// ============================================================================
// FILTER TYPES
// ============================================================================

interface DateRangeFilter {
  start_date?: string
  end_date?: string
}

interface DepartmentFilter extends DateRangeFilter {
  department_id?: string
}

interface PerformanceFilter extends DepartmentFilter {
  limit?: number
}

// ============================================================================
// SERVICE
// ============================================================================

const taskReportService = {
  // --------------------------------------------------------------------------
  // COMPLETION REPORTS
  // --------------------------------------------------------------------------

  async getCompletionByDepartment(filter: DateRangeFilter = {}): Promise<CompletionByDepartment[]> {
    console.log('[taskReportService.getCompletionByDepartment] Filter:', filter)
    
    const { data, error } = await supabase.rpc('get_completion_by_department', {
      p_start_date: filter.start_date || null,
      p_end_date: filter.end_date || null
    })

    if (error) {
      console.error('[taskReportService.getCompletionByDepartment] Error:', error)
      throw error
    }

    console.log('[taskReportService.getCompletionByDepartment] Result:', data?.length || 0)
    return data || []
  },

  async getCompletionByPosition(filter: DepartmentFilter = {}): Promise<CompletionByPosition[]> {
    console.log('[taskReportService.getCompletionByPosition] Filter:', filter)
    
    const { data, error } = await supabase.rpc('get_completion_by_position', {
      p_department_id: filter.department_id || null,
      p_start_date: filter.start_date || null,
      p_end_date: filter.end_date || null
    })

    if (error) {
      console.error('[taskReportService.getCompletionByPosition] Error:', error)
      throw error
    }

    console.log('[taskReportService.getCompletionByPosition] Result:', data?.length || 0)
    return data || []
  },

  async getCompletionByEmployee(filter: DepartmentFilter = {}): Promise<CompletionByEmployee[]> {
    console.log('[taskReportService.getCompletionByEmployee] Filter:', filter)
    
    const { data, error } = await supabase.rpc('get_completion_by_employee', {
      p_department_id: filter.department_id || null,
      p_start_date: filter.start_date || null,
      p_end_date: filter.end_date || null
    })

    if (error) {
      console.error('[taskReportService.getCompletionByEmployee] Error:', error)
      throw error
    }

    console.log('[taskReportService.getCompletionByEmployee] Result:', data?.length || 0)
    return data || []
  },

  async getCompletionTimeline(filter: DepartmentFilter & { group_by?: string } = {}): Promise<CompletionTimeline[]> {
    console.log('[taskReportService.getCompletionTimeline] Filter:', filter)
    
    const { data, error } = await supabase.rpc('get_completion_timeline', {
      p_department_id: filter.department_id || null,
      p_start_date: filter.start_date || null,
      p_end_date: filter.end_date || null,
      p_group_by: filter.group_by || 'month'
    })

    if (error) {
      console.error('[taskReportService.getCompletionTimeline] Error:', error)
      throw error
    }

    console.log('[taskReportService.getCompletionTimeline] Result:', data?.length || 0)
    return data || []
  },

  // --------------------------------------------------------------------------
  // PERFORMANCE REPORTS
  // --------------------------------------------------------------------------

  async getPerformanceMetrics(filter: DepartmentFilter = {}): Promise<PerformanceMetrics> {
    console.log('[taskReportService.getPerformanceMetrics] Filter:', filter)
    
    const { data, error } = await supabase.rpc('get_performance_metrics', {
      p_department_id: filter.department_id || null,
      p_start_date: filter.start_date || null,
      p_end_date: filter.end_date || null
    })

    if (error) {
      console.error('[taskReportService.getPerformanceMetrics] Error:', error)
      throw error
    }

    console.log('[taskReportService.getPerformanceMetrics] Result:', data)
    
    // Handle both array and single object response
    const result = Array.isArray(data) ? data[0] : data
    
    return result || {
      total_tasks: 0,
      finished_tasks: 0,
      in_progress_tasks: 0,
      cancelled_tasks: 0,
      overdue_count: 0,
      on_time_count: 0,
      completion_rate: 0,
      on_time_rate: 0,
      overdue_rate: 0,
      avg_score: null,
      avg_completion_days: null
    }
  },

  async getTopPerformers(filter: PerformanceFilter = {}): Promise<TopPerformer[]> {
    console.log('[taskReportService.getTopPerformers] Filter:', filter)
    console.log('[taskReportService.getTopPerformers] Limit:', filter.limit || 10)
    
    const { data, error } = await supabase.rpc('get_top_performers', {
      p_department_id: filter.department_id || null,
      p_start_date: filter.start_date || null,
      p_end_date: filter.end_date || null,
      p_limit: filter.limit || 10
    })

    if (error) {
      console.error('[taskReportService.getTopPerformers] Error:', error)
      throw error
    }

    console.log('[taskReportService.getTopPerformers] Result:', data?.length || 0)
    return data || []
  },

  async getOverdueTasks(filter: PerformanceFilter = {}): Promise<OverdueTask[]> {
    console.log('[taskReportService.getOverdueTasks] Filter:', filter)
    
    const { data, error } = await supabase.rpc('get_overdue_tasks', {
      p_department_id: filter.department_id || null,
      p_start_date: filter.start_date || null,
      p_end_date: filter.end_date || null,
      p_limit: filter.limit || 50
    })

    if (error) {
      console.error('[taskReportService.getOverdueTasks] Error:', error)
      throw error
    }

    console.log('[taskReportService.getOverdueTasks] Result:', data?.length || 0)
    return data || []
  },

  // --------------------------------------------------------------------------
  // TIME SERIES DATA (for charts)
  // --------------------------------------------------------------------------

  async getTimeSeriesData(filter: DepartmentFilter = {}): Promise<any[]> {
    console.log('[taskReportService.getTimeSeriesData] Filter:', filter)
    
    // Try to use RPC function, fallback to direct query
    try {
      const { data, error } = await supabase.rpc('get_completion_timeline', {
        p_department_id: filter.department_id || null,
        p_start_date: filter.start_date || null,
        p_end_date: filter.end_date || null,
        p_group_by: 'day'
      })

      if (error) throw error
      
      console.log('[taskReportService.getTimeSeriesData] Result:', data?.length || 0)
      return data || []
    } catch (error) {
      console.error('[taskReportService.getTimeSeriesData] Error:', error)
      return []
    }
  }
}

export default taskReportService