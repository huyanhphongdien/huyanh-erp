// src/services/taskReportService.ts
// Phase 6.3: Task Reports - Service Layer (FIXED RPC CALLS)
// ============================================================

import { supabase } from '../lib/supabase'

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