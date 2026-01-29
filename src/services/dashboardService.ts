// ============================================================================
// DASHBOARD SERVICE
// File: src/services/dashboardService.ts
// Huy Anh ERP System - Phase 6.1: Executive Dashboard
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface DashboardStats {
  totalEmployees: number;
  newEmployeesThisMonth: number;
  totalTasks: number;
  newTasksThisWeek: number;
  completedTasks: number;
  completionRate: number;
  overdueTasks: number;
  pendingApprovals: number;
  leavesToday: number;
  upcomingDeadlines: number;
}

export interface TaskStatusDistribution {
  status: string;
  label: string;
  count: number;
  color: string;
}

export interface TaskTrend {
  date: string;
  label: string;
  created: number;
  completed: number;
}

export interface DepartmentPerformance {
  department_id: string;
  department_name: string;
  total_tasks: number;
  completed_tasks: number;
  completion_rate: number;
  avg_score: number;
}

export interface TopEmployee {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department_name: string;
  completed_tasks: number;
  avg_score: number;
  rating: string;
}

export interface OverdueTask {
  id: string;
  code: string;
  name: string;
  due_date: string;
  days_overdue: number;
  assignee_name: string;
  department_name: string;
  priority: string;
}

export interface UpcomingTask {
  id: string;
  code: string;
  name: string;
  due_date: string;
  days_until_due: number;
  assignee_name: string;
  priority: string;
}

export interface RecentActivity {
  id: string;
  action: string;
  description: string;
  actor_name: string;
  task_name: string;
  task_code: string;
  created_at: string;
}

export interface ContractAlert {
  id: string;
  employee_name: string;
  employee_code: string;
  contract_type: string;
  end_date: string;
  days_until_expiry: number;
}

// ============================================================================
// STATUS CONFIG
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: '#9CA3AF' },
  in_progress: { label: 'Đang làm', color: '#3B82F6' },
  paused: { label: 'Tạm dừng', color: '#F59E0B' },
  finished: { label: 'Hoàn thành', color: '#10B981' },
  cancelled: { label: 'Đã hủy', color: '#EF4444' },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRating(score: number): string {
  if (score >= 90) return 'Xuất sắc';
  if (score >= 80) return 'Tốt';
  if (score >= 70) return 'Khá';
  if (score >= 60) return 'Trung bình';
  return 'Cần cải thiện';
}

// ============================================================================
// DASHBOARD SERVICE
// ============================================================================

export const dashboardService = {
  /**
   * Lấy thống kê tổng quan
   */
  async getStats(): Promise<{ data: DashboardStats | null; error: Error | null }> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
      const today = new Date().toISOString().split('T')[0];

      // Parallel queries
      const [
        employeesResult,
        newEmployeesResult,
        tasksResult,
        newTasksResult,
        completedResult,
        overdueResult,
        pendingApprovalsResult,
        leavesResult,
        upcomingResult,
      ] = await Promise.all([
        // Total employees
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        // New employees this month
        supabase.from('employees').select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('created_at', startOfMonth),
        // Total tasks
        supabase.from('tasks').select('id', { count: 'exact', head: true }),
        // New tasks this week
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .gte('created_at', startOfWeek),
        // Completed tasks
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .eq('status', 'finished'),
        // Overdue tasks
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .lt('due_date', today)
          .not('status', 'in', '("finished","cancelled")'),
        // Pending approvals
        supabase.from('task_self_evaluations').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        // Leaves today
        supabase.from('leave_requests').select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .lte('start_date', today)
          .gte('end_date', today),
        // Upcoming deadlines (7 days)
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .gte('due_date', today)
          .lte('due_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .not('status', 'in', '("finished","cancelled")'),
      ]);

      const totalEmployees = employeesResult.count || 0;
      const newEmployeesThisMonth = newEmployeesResult.count || 0;
      const totalTasks = tasksResult.count || 0;
      const newTasksThisWeek = newTasksResult.count || 0;
      const completedTasks = completedResult.count || 0;
      const overdueTasks = overdueResult.count || 0;
      const pendingApprovals = pendingApprovalsResult.count || 0;
      const leavesToday = leavesResult.count || 0;
      const upcomingDeadlines = upcomingResult.count || 0;

      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        data: {
          totalEmployees,
          newEmployeesThisMonth,
          totalTasks,
          newTasksThisWeek,
          completedTasks,
          completionRate,
          overdueTasks,
          pendingApprovals,
          leavesToday,
          upcomingDeadlines,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  },

  /**
   * Lấy phân bổ task theo trạng thái
   */
  async getTaskStatusDistribution(): Promise<{ data: TaskStatusDistribution[]; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('status');

      if (error) throw error;

      // Count by status
      const statusCounts: Record<string, number> = {};
      (data || []).forEach((task) => {
        const status = task.status || 'draft';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      const result: TaskStatusDistribution[] = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        label: STATUS_CONFIG[status]?.label || status,
        count,
        color: STATUS_CONFIG[status]?.color || '#9CA3AF',
      }));

      return { data: result, error: null };
    } catch (error) {
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy trend task theo thời gian (12 tuần gần nhất)
   */
  async getTaskTrend(weeks: number = 12): Promise<{ data: TaskTrend[]; error: Error | null }> {
    try {
      const trends: TaskTrend[] = [];
      const now = new Date();

      for (let i = weeks - 1; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const [createdResult, completedResult] = await Promise.all([
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', weekStart.toISOString())
            .lte('created_at', weekEnd.toISOString()),
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'finished')
            .gte('updated_at', weekStart.toISOString())
            .lte('updated_at', weekEnd.toISOString()),
        ]);

        trends.push({
          date: weekStart.toISOString().split('T')[0],
          label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
          created: createdResult.count || 0,
          completed: completedResult.count || 0,
        });
      }

      return { data: trends, error: null };
    } catch (error) {
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy hiệu suất theo phòng ban (dựa trên department của assignee)
   */
  async getDepartmentPerformance(): Promise<{ data: DepartmentPerformance[]; error: Error | null }> {
    try {
      // Get all active departments
      const { data: departments, error: deptError } = await supabase
        .from('departments')
        .select('id, name')
        .eq('status', 'active');

      if (deptError) throw deptError;

      // Get all tasks with assignee info
      const { data: allTasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id,
          status,
          assignee:employees!tasks_assignee_id_fkey(
            id,
            department_id
          )
        `);

      if (tasksError) throw tasksError;

      // Get all approved scores
      const { data: allApprovals, error: approvalsError } = await supabase
        .from('task_approvals')
        .select('approved_score, task_id')
        .eq('action', 'approved')
        .not('approved_score', 'is', null);

      if (approvalsError) throw approvalsError;

      // Build task map for quick lookup
      const taskMap = new Map<string, any>();
      (allTasks || []).forEach((task: any) => {
        const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;
        taskMap.set(task.id, {
          status: task.status,
          department_id: assignee?.department_id || null
        });
      });

      const results: DepartmentPerformance[] = [];

      for (const dept of departments || []) {
        // Filter tasks by assignee's department
        const deptTasks = (allTasks || []).filter((task: any) => {
          const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;
          return assignee?.department_id === dept.id;
        });

        const totalTasks = deptTasks.length;
        const completedTasks = deptTasks.filter((task: any) => task.status === 'finished').length;

        // Filter scores by assignee's department
        const deptScores = (allApprovals || [])
          .filter((approval: any) => {
            const taskInfo = taskMap.get(approval.task_id);
            return taskInfo?.department_id === dept.id;
          })
          .map((approval: any) => approval.approved_score)
          .filter(Boolean);

        const avgScore = deptScores.length > 0
          ? Math.round(deptScores.reduce((a: number, b: number) => a + b, 0) / deptScores.length)
          : 0;

        // Hiển thị tất cả phòng ban, kể cả chưa có task
        results.push({
          department_id: dept.id,
          department_name: dept.name,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          avg_score: avgScore,
        });
      }

      // Sort by completion rate desc, sau đó by total_tasks desc
      results.sort((a, b) => {
        if (b.completion_rate !== a.completion_rate) {
          return b.completion_rate - a.completion_rate;
        }
        return b.total_tasks - a.total_tasks;
      });

      return { data: results, error: null };
    } catch (error) {
      console.error('❌ [getDepartmentPerformance] error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy top nhân viên xuất sắc
   */
  async getTopEmployees(limit: number = 5): Promise<{ data: TopEmployee[]; error: Error | null }> {
    try {
      // Lấy tất cả approvals
      const { data: approvals, error: approvalError } = await supabase
        .from('task_approvals')
        .select('approved_score, rating, task_id')
        .eq('action', 'approved')
        .not('approved_score', 'is', null);

      if (approvalError) throw approvalError;

      if (!approvals || approvals.length === 0) {
        return { data: [], error: null };
      }

      // Lấy task_ids
      const taskIds = [...new Set(approvals.map(a => a.task_id))];

      // Lấy thông tin tasks với assignee
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id,
          assignee_id,
          assignee:employees!tasks_assignee_id_fkey(
            id,
            code,
            full_name,
            department_id
          )
        `)
        .in('id', taskIds);

      if (tasksError) throw tasksError;

      // Lấy department names
      const deptIds = [...new Set(
        (tasks || [])
          .map(t => {
            const assignee = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee;
            return (assignee as any)?.department_id;
          })
          .filter(Boolean)
      )] as string[];

      const { data: departments } = await supabase
        .from('departments')
        .select('id, name')
        .in('id', deptIds);

      const deptMap = new Map((departments || []).map(d => [d.id, d.name]));

      // Build task map
      const taskMap = new Map<string, any>();
      (tasks || []).forEach(t => {
        const assignee = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee;
        taskMap.set(t.id, {
          assignee_id: t.assignee_id,
          assignee: assignee
        });
      });

      // Aggregate by employee
      const employeeStats: Record<string, {
        employee_id: string;
        employee_name: string;
        employee_code: string;
        department_name: string;
        total_score: number;
        count: number;
      }> = {};

      approvals.forEach((approval) => {
        const task = taskMap.get(approval.task_id);
        if (!task?.assignee) return;

        const employee = task.assignee;
        const empId = employee.id;

        if (!employeeStats[empId]) {
          employeeStats[empId] = {
            employee_id: empId,
            employee_name: employee.full_name || '',
            employee_code: employee.code || '',
            department_name: deptMap.get(employee.department_id) || '',
            total_score: 0,
            count: 0,
          };
        }
        employeeStats[empId].total_score += approval.approved_score || 0;
        employeeStats[empId].count += 1;
      });

      const results: TopEmployee[] = Object.values(employeeStats)
        .map((emp) => ({
          employee_id: emp.employee_id,
          employee_name: emp.employee_name,
          employee_code: emp.employee_code,
          department_name: emp.department_name,
          completed_tasks: emp.count,
          avg_score: emp.count > 0 ? Math.round(emp.total_score / emp.count) : 0,
          rating: getRating(emp.count > 0 ? emp.total_score / emp.count : 0),
        }))
        .sort((a, b) => b.avg_score - a.avg_score)
        .slice(0, limit);

      return { data: results, error: null };
    } catch (error) {
      console.error('❌ [getTopEmployees] error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy danh sách task quá hạn
   */
  async getOverdueTasks(limit: number = 10): Promise<{ data: OverdueTask[]; error: Error | null }> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          code,
          name,
          due_date,
          priority,
          assignee:employees!tasks_assignee_id_fkey(full_name, department_id)
        `)
        .lt('due_date', today)
        .not('status', 'in', '("finished","cancelled")')
        .order('due_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      // Lấy department names
      const deptIds = [...new Set(
        (data || [])
          .map(t => {
            const assignee = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee;
            return (assignee as any)?.department_id;
          })
          .filter(Boolean)
      )] as string[];

      const { data: departments } = await supabase
        .from('departments')
        .select('id, name')
        .in('id', deptIds);

      const deptMap = new Map((departments || []).map(d => [d.id, d.name]));

      const results: OverdueTask[] = (data || []).map((task: any) => {
        const dueDate = new Date(task.due_date);
        const todayDate = new Date(today);
        const daysOverdue = Math.ceil((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;

        return {
          id: task.id,
          code: task.code || '',
          name: task.name || '',
          due_date: task.due_date,
          days_overdue: daysOverdue,
          assignee_name: assignee?.full_name || 'Chưa giao',
          department_name: deptMap.get(assignee?.department_id) || '',
          priority: task.priority || 'medium',
        };
      });

      return { data: results, error: null };
    } catch (error) {
      console.error('❌ [getOverdueTasks] error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy danh sách task sắp đến hạn
   */
  async getUpcomingTasks(days: number = 7, limit: number = 10): Promise<{ data: UpcomingTask[]; error: Error | null }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          code,
          name,
          due_date,
          priority,
          assignee:employees!tasks_assignee_id_fkey(full_name)
        `)
        .gte('due_date', today)
        .lte('due_date', futureDate)
        .not('status', 'in', '("finished","cancelled")')
        .order('due_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const results: UpcomingTask[] = (data || []).map((task: any) => {
        const dueDate = new Date(task.due_date);
        const todayDate = new Date(today);
        const daysUntilDue = Math.ceil((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
        const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;

        return {
          id: task.id,
          code: task.code || '',
          name: task.name || '',
          due_date: task.due_date,
          days_until_due: daysUntilDue,
          assignee_name: assignee?.full_name || 'Chưa giao',
          priority: task.priority || 'medium',
        };
      });

      return { data: results, error: null };
    } catch (error) {
      console.error('❌ [getUpcomingTasks] error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy hoạt động gần đây
   */
  async getRecentActivities(limit: number = 10): Promise<{ data: RecentActivity[]; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('task_activities')
        .select(`
          id,
          action,
          description,
          created_at,
          actor:employees!task_activities_actor_id_fkey(full_name),
          task:tasks(code, name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const results: RecentActivity[] = (data || []).map((activity: any) => {
        const actor = Array.isArray(activity.actor) ? activity.actor[0] : activity.actor;
        const task = Array.isArray(activity.task) ? activity.task[0] : activity.task;

        return {
          id: activity.id,
          action: activity.action,
          description: activity.description || '',
          actor_name: actor?.full_name || 'Hệ thống',
          task_name: task?.name || '',
          task_code: task?.code || '',
          created_at: activity.created_at,
        };
      });

      return { data: results, error: null };
    } catch (error) {
      console.error('❌ [getRecentActivities] error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy hợp đồng sắp hết hạn
   */
  async getExpiringContracts(days: number = 30, limit: number = 5): Promise<{ data: ContractAlert[]; error: Error | null }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('contracts')
        .select(`
          id,
          end_date,
          employee:employees(code, full_name),
          contract_type:contract_types(name)
        `)
        .eq('status', 'active')
        .gte('end_date', today)
        .lte('end_date', futureDate)
        .order('end_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const results: ContractAlert[] = (data || []).map((contract: any) => {
        const endDate = new Date(contract.end_date);
        const todayDate = new Date(today);
        const daysUntilExpiry = Math.ceil((endDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
        const employee = Array.isArray(contract.employee) ? contract.employee[0] : contract.employee;
        const contractType = Array.isArray(contract.contract_type) ? contract.contract_type[0] : contract.contract_type;

        return {
          id: contract.id,
          employee_name: employee?.full_name || '',
          employee_code: employee?.code || '',
          contract_type: contractType?.name || '',
          end_date: contract.end_date,
          days_until_expiry: daysUntilExpiry,
        };
      });

      return { data: results, error: null };
    } catch (error) {
      console.error('❌ [getExpiringContracts] error:', error);
      return { data: [], error: error as Error };
    }
  },
};

export default dashboardService;