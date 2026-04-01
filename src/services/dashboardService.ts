// ============================================================================
// DASHBOARD SERVICE - MONTHLY FILTERED
// File: src/services/dashboardService.ts
// Huy Anh ERP System - Dashboard thống kê theo tháng hiện tại
// ============================================================================
// CHANGES:
// - ✅ Tất cả thống kê lọc theo tháng hiện tại (startOfMonth → endOfMonth)
// - ✅ getStats: Tổng CV tháng, hoàn thành tháng, quá hạn tháng, NV mới tháng
// - ✅ getTaskTrend: 4 tuần trong tháng (thay vì 8-12 tuần)
// - ✅ getDepartmentPerformance: Chỉ tính CV trong tháng
// - ✅ getTopEmployees: Chỉ tính điểm đánh giá CV trong tháng
// - ✅ getOverdueTasks: CV quá hạn có due_date trong tháng
// - ✅ getUpcomingTasks: CV sắp đến hạn trong tháng
// - ✅ getRecentActivities: Hoạt động trong tháng
// - ✅ getExpiringContracts: HĐ hết hạn trong tháng
// - ✅ getTaskStatusDistribution: Phân bổ trạng thái CV trong tháng
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface DashboardStats {
  totalEmployees: number;
  newEmployeesThisMonth: number;
  totalTasks: number;           // CV tạo trong tháng
  completedTasks: number;       // CV hoàn thành trong tháng
  completionRate: number;       // Tỷ lệ hoàn thành tháng
  overdueTasks: number;         // CV quá hạn (due_date trong tháng & chưa xong)
  pendingApprovals: number;     // Chờ duyệt (tổng hiện tại)
  leavesToday: number;
  upcomingDeadlines: number;    // Sắp đến hạn trong tháng
  // ✅ Thêm context tháng
  monthLabel: string;           // "Tháng 3/2026"
  newTasksThisWeek: number;     // CV tạo tuần này (trong tháng)
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

/**
 * Lấy khoảng thời gian đầu-cuối tháng hiện tại
 */
function getCurrentMonthRange(): { startOfMonth: string; endOfMonth: string; monthLabel: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0); // last day of month

  return {
    startOfMonth: startOfMonth.toISOString().split('T')[0], // "2026-03-01"
    endOfMonth: endOfMonth.toISOString().split('T')[0],     // "2026-03-31"
    monthLabel: `Tháng ${month + 1}/${year}`,
  };
}

/**
 * Lấy khoảng thời gian đầu-cuối tuần hiện tại
 */
function getCurrentWeekRange(): { startOfWeek: string; endOfWeek: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() + mondayOffset);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  return {
    startOfWeek: startOfWeek.toISOString().split('T')[0],
    endOfWeek: endOfWeek.toISOString().split('T')[0],
  };
}

// ============================================================================
// DASHBOARD SERVICE
// ============================================================================

export const dashboardService = {
  /**
   * Lấy thống kê tổng quan — FILTERED BY CURRENT MONTH
   */
  async getStats(): Promise<{ data: DashboardStats | null; error: Error | null }> {
    try {
      const { startOfMonth, endOfMonth, monthLabel } = getCurrentMonthRange();
      const { startOfWeek } = getCurrentWeekRange();
      const today = new Date().toISOString().split('T')[0];

      const [
        // Tổng NV active (không filter tháng)
        employeesResult,
        // NV mới trong tháng
        newEmployeesResult,
        // CV tạo trong tháng
        tasksInMonthResult,
        // CV tạo tuần này
        tasksThisWeekResult,
        // CV hoàn thành trong tháng (updated_at hoặc status changed trong tháng)
        completedInMonthResult,
        // CV quá hạn: due_date <= today & due_date trong tháng & chưa xong
        overdueInMonthResult,
        // Chờ duyệt (tổng hiện tại, không filter tháng vì cần action ngay)
        pendingApprovalsResult,
        // Nghỉ phép hôm nay
        leavesResult,
        // Sắp đến hạn: due_date từ today → cuối tháng & chưa xong
        upcomingInMonthResult,
      ] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),

        supabase.from('employees').select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('created_at', `${startOfMonth}T00:00:00`)
          .lte('created_at', `${endOfMonth}T23:59:59`),

        // ★ Chỉ task tháng hiện tại, bỏ draft
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .neq('status', 'draft')
          .gte('created_at', `${startOfMonth}T00:00:00`)
          .lte('created_at', `${endOfMonth}T23:59:59`),

        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .neq('status', 'draft')
          .gte('created_at', `${startOfWeek}T00:00:00`),

        // ★ CV hoàn thành: task TẠO trong tháng VÀ đã finished (cùng pool với totalTasks)
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .eq('status', 'finished')
          .neq('status', 'draft')
          .gte('created_at', `${startOfMonth}T00:00:00`)
          .lte('created_at', `${endOfMonth}T23:59:59`),

        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .lt('due_date', today)
          .gte('due_date', startOfMonth)
          .not('status', 'in', '("finished","completed","cancelled","draft")'),

        // ★ Chờ duyệt: nghỉ phép + tăng ca pending
        supabase.from('leave_requests').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),

        supabase.from('leave_requests').select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .lte('start_date', today)
          .gte('end_date', today),

        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .gte('due_date', today)
          .lte('due_date', endOfMonth)
          .not('status', 'in', '("finished","completed","cancelled")'),
      ]);

      const totalEmployees = employeesResult.count || 0;
      const newEmployeesThisMonth = newEmployeesResult.count || 0;
      const totalTasks = tasksInMonthResult.count || 0;
      const newTasksThisWeek = tasksThisWeekResult.count || 0;
      const completedTasks = completedInMonthResult.count || 0;
      const overdueTasks = overdueInMonthResult.count || 0;
      const pendingApprovals = pendingApprovalsResult.count || 0;
      const leavesToday = leavesResult.count || 0;
      const upcomingDeadlines = upcomingInMonthResult.count || 0;

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
          monthLabel,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  },

  /**
   * Phân bổ trạng thái CV — TRONG THÁNG
   */
  async getTaskStatusDistribution(): Promise<{ data: TaskStatusDistribution[]; error: Error | null }> {
    try {
      const { startOfMonth, endOfMonth } = getCurrentMonthRange();

      const { data, error } = await supabase
        .from('tasks')
        .select('status')
        .gte('created_at', `${startOfMonth}T00:00:00`)
        .lte('created_at', `${endOfMonth}T23:59:59`);

      if (error) throw error;

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
   * Xu hướng CV — TỪNG TUẦN TRONG THÁNG (4-5 tuần)
   */
  async getTaskTrend(weeks?: number): Promise<{ data: TaskTrend[]; error: Error | null }> {
    try {
      const { startOfMonth, endOfMonth } = getCurrentMonthRange();
      const trends: TaskTrend[] = [];

      // Chia tháng thành từng tuần
      const monthStart = new Date(`${startOfMonth}T00:00:00`);
      const monthEnd = new Date(`${endOfMonth}T23:59:59`);

      let weekStart = new Date(monthStart);

      while (weekStart <= monthEnd) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        // Cap at month end
        const effectiveEnd = weekEnd > monthEnd ? monthEnd : weekEnd;

        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = effectiveEnd.toISOString().split('T')[0];

        const [createdResult, completedResult] = await Promise.all([
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', `${weekStartStr}T00:00:00`)
            .lte('created_at', `${weekEndStr}T23:59:59`),
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'finished')
            .gte('updated_at', `${weekStartStr}T00:00:00`)
            .lte('updated_at', `${weekEndStr}T23:59:59`),
        ]);

        const weekLabel = `${weekStart.getDate()}/${weekStart.getMonth() + 1}` +
          `–${effectiveEnd.getDate()}/${effectiveEnd.getMonth() + 1}`;

        trends.push({
          date: weekStartStr,
          label: weekLabel,
          created: createdResult.count || 0,
          completed: completedResult.count || 0,
        });

        // Next week
        weekStart = new Date(weekStart);
        weekStart.setDate(weekStart.getDate() + 7);
      }

      return { data: trends, error: null };
    } catch (error) {
      return { data: [], error: error as Error };
    }
  },

  /**
   * Hiệu suất phòng ban — CV TRONG THÁNG
   */
  async getDepartmentPerformance(): Promise<{ data: DepartmentPerformance[]; error: Error | null }> {
    try {
      const { startOfMonth, endOfMonth } = getCurrentMonthRange();

      const { data: departments, error: deptError } = await supabase
        .from('departments')
        .select('id, name')
        .eq('status', 'active');

      if (deptError) throw deptError;

      // ✅ Chỉ lấy CV tạo trong tháng
      const { data: allTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, status, assignee_id')
        .gte('created_at', `${startOfMonth}T00:00:00`)
        .lte('created_at', `${endOfMonth}T23:59:59`);

      if (tasksError) throw tasksError;

      const assigneeIds = [...new Set((allTasks || []).map(t => t.assignee_id).filter(Boolean))];

      let employeeMap = new Map<string, string>();
      if (assigneeIds.length > 0) {
        const { data: employees } = await supabase
          .from('employees')
          .select('id, department_id')
          .in('id', assigneeIds);

        (employees || []).forEach(emp => {
          if (emp.department_id) employeeMap.set(emp.id, emp.department_id);
        });
      }

      // ✅ Chỉ lấy approvals cho CV trong tháng
      const taskIds = (allTasks || []).map(t => t.id);
      let allApprovals: any[] = [];
      if (taskIds.length > 0) {
        const { data: approvals } = await supabase
          .from('task_approvals')
          .select('approved_score, task_id')
          .eq('action', 'approved')
          .not('approved_score', 'is', null)
          .in('task_id', taskIds);
        allApprovals = approvals || [];
      }

      const taskMap = new Map<string, any>();
      (allTasks || []).forEach((task: any) => {
        const deptId = task.assignee_id ? employeeMap.get(task.assignee_id) : null;
        taskMap.set(task.id, { status: task.status, department_id: deptId });
      });

      const results: DepartmentPerformance[] = [];

      for (const dept of departments || []) {
        const deptTasks = (allTasks || []).filter((task: any) => {
          const deptId = task.assignee_id ? employeeMap.get(task.assignee_id) : null;
          return deptId === dept.id;
        });

        const totalTasks = deptTasks.length;
        const completedTasks = deptTasks.filter((task: any) => task.status === 'finished').length;

        const deptScores = allApprovals
          .filter((approval: any) => {
            const taskInfo = taskMap.get(approval.task_id);
            return taskInfo?.department_id === dept.id;
          })
          .map((approval: any) => approval.approved_score)
          .filter(Boolean);

        const avgScore = deptScores.length > 0
          ? Math.round(deptScores.reduce((a: number, b: number) => a + b, 0) / deptScores.length)
          : 0;

        results.push({
          department_id: dept.id,
          department_name: dept.name,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          avg_score: avgScore,
        });
      }

      results.sort((a, b) => {
        if (b.completion_rate !== a.completion_rate) return b.completion_rate - a.completion_rate;
        return b.total_tasks - a.total_tasks;
      });

      return { data: results, error: null };
    } catch (error) {
      console.error('❌ [getDepartmentPerformance] error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * Top nhân viên — CHỈ TÍNH CV HOÀN THÀNH TRONG THÁNG
   */
  async getTopEmployees(limit: number = 5): Promise<{ data: TopEmployee[]; error: Error | null }> {
    try {
      const { startOfMonth, endOfMonth } = getCurrentMonthRange();

      // ✅ Chỉ lấy CV hoàn thành (finished) trong tháng
      const { data: finishedTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, assignee_id')
        .eq('status', 'finished')
        .gte('updated_at', `${startOfMonth}T00:00:00`)
        .lte('updated_at', `${endOfMonth}T23:59:59`);

      if (tasksError) throw tasksError;
      if (!finishedTasks || finishedTasks.length === 0) return { data: [], error: null };

      const taskIds = finishedTasks.map(t => t.id);

      // Lấy approvals cho các CV này
      const { data: approvals, error: approvalError } = await supabase
        .from('task_approvals')
        .select('approved_score, rating, task_id')
        .eq('action', 'approved')
        .not('approved_score', 'is', null)
        .in('task_id', taskIds);

      if (approvalError) throw approvalError;

      // Lấy assignee info
      const assigneeIds = [...new Set(finishedTasks.map(t => t.assignee_id).filter(Boolean))] as string[];

      let employeeMap = new Map<string, any>();
      if (assigneeIds.length > 0) {
        const { data: employees } = await supabase
          .from('employees')
          .select('id, code, full_name, department_id')
          .in('id', assigneeIds);

        (employees || []).forEach(emp => employeeMap.set(emp.id, emp));
      }

      // Department names
      const deptIds = [...new Set(
        Array.from(employeeMap.values()).map(emp => emp.department_id).filter(Boolean)
      )] as string[];

      let deptMap = new Map<string, string>();
      if (deptIds.length > 0) {
        const { data: departments } = await supabase
          .from('departments')
          .select('id, name')
          .in('id', deptIds);
        (departments || []).forEach(d => deptMap.set(d.id, d.name));
      }

      // Build task -> assignee map
      const taskAssigneeMap = new Map<string, string>();
      finishedTasks.forEach(t => {
        if (t.assignee_id) taskAssigneeMap.set(t.id, t.assignee_id);
      });

      // Aggregate by employee
      const employeeStats: Record<string, {
        employee_id: string; employee_name: string; employee_code: string;
        department_name: string; total_score: number; count: number;
      }> = {};

      (approvals || []).forEach((approval) => {
        const assigneeId = taskAssigneeMap.get(approval.task_id);
        if (!assigneeId) return;
        const employee = employeeMap.get(assigneeId);
        if (!employee) return;

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

      // Cũng đếm NV hoàn thành CV nhưng chưa có approval
      finishedTasks.forEach(t => {
        if (!t.assignee_id) return;
        const employee = employeeMap.get(t.assignee_id);
        if (!employee) return;
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
      });

      const results: TopEmployee[] = Object.values(employeeStats)
        .map((emp) => ({
          employee_id: emp.employee_id,
          employee_name: emp.employee_name,
          employee_code: emp.employee_code,
          department_name: emp.department_name,
          completed_tasks: emp.count > 0 ? emp.count : 0,
          avg_score: emp.count > 0 ? Math.round(emp.total_score / emp.count) : 0,
          rating: getRating(emp.count > 0 ? emp.total_score / emp.count : 0),
        }))
        .filter(e => e.avg_score > 0)
        .sort((a, b) => b.avg_score - a.avg_score)
        .slice(0, limit);

      return { data: results, error: null };
    } catch (error) {
      console.error('❌ [getTopEmployees] error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * CV quá hạn — DUE_DATE TRONG THÁNG
   */
  async getOverdueTasks(limit: number = 10): Promise<{ data: OverdueTask[]; error: Error | null }> {
    try {
      const { startOfMonth } = getCurrentMonthRange();
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('tasks')
        .select('id, code, name, due_date, priority, assignee_id')
        .lt('due_date', today)
        .gte('due_date', startOfMonth)
        .not('status', 'in', '("finished","completed","cancelled")')
        .order('due_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      // Get assignee info
      const assigneeIds = [...new Set((data || []).map(t => t.assignee_id).filter(Boolean))] as string[];

      let employeeMap = new Map<string, any>();
      if (assigneeIds.length > 0) {
        const { data: employees } = await supabase
          .from('employees')
          .select('id, full_name, department_id')
          .in('id', assigneeIds);
        (employees || []).forEach(emp => employeeMap.set(emp.id, emp));
      }

      const deptIds = [...new Set(
        Array.from(employeeMap.values()).map(emp => emp.department_id).filter(Boolean)
      )] as string[];

      let deptMap = new Map<string, string>();
      if (deptIds.length > 0) {
        const { data: departments } = await supabase
          .from('departments')
          .select('id, name')
          .in('id', deptIds);
        (departments || []).forEach(d => deptMap.set(d.id, d.name));
      }

      const results: OverdueTask[] = (data || []).map((task: any) => {
        const dueDate = new Date(task.due_date);
        const todayDate = new Date(today);
        const daysOverdue = Math.ceil((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const employee = task.assignee_id ? employeeMap.get(task.assignee_id) : null;

        return {
          id: task.id,
          code: task.code || '',
          name: task.name || '',
          due_date: task.due_date,
          days_overdue: daysOverdue,
          assignee_name: employee?.full_name || 'Chưa giao',
          department_name: employee?.department_id ? (deptMap.get(employee.department_id) || '') : '',
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
   * CV sắp đến hạn — TỪ HÔM NAY → CUỐI THÁNG
   */
  async getUpcomingTasks(days?: number, limit: number = 10): Promise<{ data: UpcomingTask[]; error: Error | null }> {
    try {
      const { endOfMonth } = getCurrentMonthRange();
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('tasks')
        .select('id, code, name, due_date, priority, assignee_id')
        .gte('due_date', today)
        .lte('due_date', endOfMonth)
        .not('status', 'in', '("finished","completed","cancelled")')
        .order('due_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const assigneeIds = [...new Set((data || []).map(t => t.assignee_id).filter(Boolean))] as string[];

      let employeeMap = new Map<string, string>();
      if (assigneeIds.length > 0) {
        const { data: employees } = await supabase
          .from('employees')
          .select('id, full_name')
          .in('id', assigneeIds);
        (employees || []).forEach(emp => employeeMap.set(emp.id, emp.full_name));
      }

      const results: UpcomingTask[] = (data || []).map((task: any) => {
        const dueDate = new Date(task.due_date);
        const todayDate = new Date(today);
        const daysUntilDue = Math.ceil((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: task.id,
          code: task.code || '',
          name: task.name || '',
          due_date: task.due_date,
          days_until_due: daysUntilDue,
          assignee_name: task.assignee_id ? (employeeMap.get(task.assignee_id) || 'Chưa giao') : 'Chưa giao',
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
   * Hoạt động gần đây — TRONG THÁNG
   */
  async getRecentActivities(limit: number = 10): Promise<{ data: RecentActivity[]; error: Error | null }> {
    try {
      const { startOfMonth } = getCurrentMonthRange();

      const { data, error } = await supabase
        .from('task_activities')
        .select('id, action, description, created_at, actor_id, task_id')
        .gte('created_at', `${startOfMonth}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const actorIds = [...new Set((data || []).map(a => a.actor_id).filter(Boolean))] as string[];
      let actorMap = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: actors } = await supabase.from('employees').select('id, full_name').in('id', actorIds);
        (actors || []).forEach(a => actorMap.set(a.id, a.full_name));
      }

      const taskIds = [...new Set((data || []).map(a => a.task_id).filter(Boolean))] as string[];
      let taskMap = new Map<string, { code: string; name: string }>();
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase.from('tasks').select('id, code, name').in('id', taskIds);
        (tasks || []).forEach(t => taskMap.set(t.id, { code: t.code, name: t.name }));
      }

      const results: RecentActivity[] = (data || []).map((activity: any) => {
        const task = activity.task_id ? taskMap.get(activity.task_id) : null;
        return {
          id: activity.id,
          action: activity.action,
          description: activity.description || '',
          actor_name: activity.actor_id ? (actorMap.get(activity.actor_id) || 'Hệ thống') : 'Hệ thống',
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
   * HĐ sắp hết hạn — HẾT HẠN TRONG THÁNG
   */
  async getExpiringContracts(days?: number, limit: number = 5): Promise<{ data: ContractAlert[]; error: Error | null }> {
    try {
      const { startOfMonth, endOfMonth } = getCurrentMonthRange();
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('contracts')
        .select('id, end_date, employee_id, contract_type_id')
        .eq('status', 'active')
        .gte('end_date', today)
        .lte('end_date', endOfMonth)
        .order('end_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const employeeIds = [...new Set((data || []).map(c => c.employee_id).filter(Boolean))] as string[];
      let employeeMap = new Map<string, { code: string; full_name: string }>();
      if (employeeIds.length > 0) {
        const { data: employees } = await supabase.from('employees').select('id, code, full_name').in('id', employeeIds);
        (employees || []).forEach(emp => employeeMap.set(emp.id, { code: emp.code, full_name: emp.full_name }));
      }

      const typeIds = [...new Set((data || []).map(c => c.contract_type_id).filter(Boolean))] as string[];
      let typeMap = new Map<string, string>();
      if (typeIds.length > 0) {
        const { data: types } = await supabase.from('contract_types').select('id, name').in('id', typeIds);
        (types || []).forEach(t => typeMap.set(t.id, t.name));
      }

      const results: ContractAlert[] = (data || []).map((contract: any) => {
        const endDate = new Date(contract.end_date);
        const todayDate = new Date(today);
        const daysUntilExpiry = Math.ceil((endDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
        const employee = contract.employee_id ? employeeMap.get(contract.employee_id) : null;

        return {
          id: contract.id,
          employee_name: employee?.full_name || '',
          employee_code: employee?.code || '',
          contract_type: contract.contract_type_id ? (typeMap.get(contract.contract_type_id) || '') : '',
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