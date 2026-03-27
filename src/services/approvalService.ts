// ============================================================================
// APPROVAL SERVICE - WITH PERMISSION FILTERING
// File: src/services/approvalService.ts
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT v2:
// - getCompletedWithoutEvaluation: thêm status 'overdue' vào query
// - CompletedTaskWithoutEval: thêm field overdue_flagged
// - Sort: task quá hạn nổi lên trên cùng trong tab
// ============================================================================

import { supabase } from '../lib/supabase';
import {
  getPermissionGroup,
  canUserApproveTask,
} from '../features/tasks/utils/taskPermissions';

// ============================================================================
// TYPES
// ============================================================================

export interface PendingEvaluation {
  id: string;
  task_id: string;
  employee_id: string;
  completion_percentage: number;
  self_score: number | null;
  quality_assessment: string | null;
  achievements: string | null;
  difficulties: string | null;
  solutions: string | null;
  recommendations: string | null;
  status: string;
  revision_count: number;
  submitted_at: string | null;
  created_at: string;
  // Relations
  task?: {
    id: string;
    code: string;
    name: string;
    status: string;
    priority: string;
    progress: number;
    due_date: string | null;
    department_id: string | null;
    assigner_id: string | null;
    department?: { id: string; name: string } | null;
    assigner?: {
      id: string;
      full_name: string;
      position?: { level: number } | null;
    } | null;
  } | null;
  employee?: {
    id: string;
    code: string;
    full_name: string;
    avatar_url?: string | null;
    department_id: string | null;
  } | null;
  canApprove?: boolean;
  permissionReason?: string;
}

export interface CompletedTaskWithoutEval {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
  due_date: string | null;
  completed_date?: string | null;
  department_id: string | null;
  assignee_id: string | null;
  assigner_id: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  department?: { id: string; name: string } | null;
  assignee?: {
    id: string;
    code: string;
    full_name: string;
    avatar_url?: string | null;
  } | null;
  assigner?: {
    id: string;
    full_name: string;
    position?: { level: number } | null;
  } | null;
  canApprove?: boolean;
  permissionReason?: string;
  // ← MỚI: flag để UI biết đây là task quá hạn
  overdue_flagged?: boolean;
}

export interface ApprovalStats {
  pending_evaluations: number;
  completed_without_eval: number;
  approved_this_week: number;
  rejected_this_week: number;
}

export interface ApproveInput {
  self_evaluation_id?: string;
  task_id: string;
  approver_id: string;
  score: number;
  comments?: string;
}

export interface RejectInput {
  self_evaluation_id: string;
  task_id: string;
  approver_id: string;
  rejection_reason: string;
  comments?: string;
}

export interface RequestRevisionInput {
  self_evaluation_id: string;
  task_id: string;
  approver_id: string;
  revision_request: string;
}

export interface QuickApproveInput {
  task_id: string;
  employee_id: string;
  approver_id: string;
  score: number;
  comments?: string;
}

export interface ApproveTaskInput {
  task_id: string;
  approver_id: string;
  score: number;
  rating?: string;
  comments?: string;
  self_evaluation_id?: string;
}

export interface RejectTaskInput {
  task_id: string;
  approver_id: string;
  rejection_reason: string;
  comments?: string;
  self_evaluation_id?: string;
}

export interface RequestInfoInput {
  task_id: string;
  approver_id: string;
  additional_request: string;
  self_evaluation_id?: string;
}

export interface ApprovalPermissionContext {
  userLevel: number;
  userDepartmentId: string;
  isAdmin: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateRating(score: number): string {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  return 'below_average';
}

// ============================================================================
// STANDALONE FUNCTIONS (for evaluationStore)
// ============================================================================

export async function getPendingApprovals(approverId: string): Promise<{ data: any[]; error: Error | null }> {
  console.log('📋 [getPendingApprovals] for approver:', approverId);
  
  try {
    const { data, error } = await supabase
      .from('task_self_evaluations')
      .select(`
        *,
        task:tasks(
          id, code, name, status, priority, progress, due_date, department_id, assigner_id,
          department:departments(id, name),
          assigner:employees!tasks_assigner_id_fkey(id, full_name, position_id)
        ),
        employee:employees(id, code, full_name, avatar_url, department_id)
      `)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true });

    if (error) throw error;

    const result = (data || []).map(item => ({
      ...item,
      task: Array.isArray(item.task) ? item.task[0] : item.task,
      employee: Array.isArray(item.employee) ? item.employee[0] : item.employee,
    }));

    return { data: result, error: null };
  } catch (error) {
    console.error('❌ [getPendingApprovals] error:', error);
    return { data: [], error: error as Error };
  }
}

export async function getApprovalHistory(params: { approver_id: string }): Promise<{ data: any[]; error: Error | null }> {
  console.log('📋 [getApprovalHistory] for approver:', params.approver_id);
  
  try {
    const { data, error } = await supabase
      .from('task_approvals')
      .select(`
        *,
        task:tasks(id, code, name),
        approver:employees!task_approvals_approver_id_fkey(id, full_name)
      `)
      .eq('approver_id', params.approver_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { 
      data: (data || []).map(item => ({
        ...item,
        task: Array.isArray(item.task) ? item.task[0] : item.task,
        approver: Array.isArray(item.approver) ? item.approver[0] : item.approver,
      })), 
      error: null 
    };
  } catch (error) {
    console.error('❌ [getApprovalHistory] error:', error);
    return { data: [], error: error as Error };
  }
}

export async function approveTask(input: ApproveTaskInput): Promise<{ success: boolean; error: Error | null }> {
  console.log('📋 [approveTask]:', input);
  
  try {
    const rating = input.rating || calculateRating(input.score);

    const { error: approvalError } = await supabase
      .from('task_approvals')
      .insert({
        task_id: input.task_id,
        approver_id: input.approver_id,
        action: 'approved',
        approved_score: input.score,
        original_score: input.score,
        rating: rating,
        comments: input.comments || null,
      });

    if (approvalError) throw approvalError;

    if (input.self_evaluation_id) {
      await supabase
        .from('task_self_evaluations')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', input.self_evaluation_id);
    }

    await supabase
      .from('tasks')
      .update({ evaluation_status: 'approved' })
      .eq('id', input.task_id);

    console.log('✅ [approveTask] Approved successfully');
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ [approveTask] error:', error);
    return { success: false, error: error as Error };
  }
}

export async function rejectTask(input: RejectTaskInput): Promise<{ success: boolean; error: Error | null }> {
  console.log('📋 [rejectTask]:', input);
  
  try {
    const { error: approvalError } = await supabase
      .from('task_approvals')
      .insert({
        task_id: input.task_id,
        approver_id: input.approver_id,
        action: 'rejected',
        comments: input.rejection_reason,
      });

    if (approvalError) throw approvalError;

    if (input.self_evaluation_id) {
      await supabase
        .from('task_self_evaluations')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', input.self_evaluation_id);
    }

    await supabase
      .from('tasks')
      .update({ evaluation_status: 'rejected' })
      .eq('id', input.task_id);

    console.log('✅ [rejectTask] Rejected successfully');
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ [rejectTask] error:', error);
    return { success: false, error: error as Error };
  }
}

export async function requestInfo(input: RequestInfoInput): Promise<{ success: boolean; error: Error | null }> {
  console.log('📋 [requestInfo]:', input);
  
  try {
    const { error: approvalError } = await supabase
      .from('task_approvals')
      .insert({
        task_id: input.task_id,
        approver_id: input.approver_id,
        action: 'revision_requested',
        comments: input.additional_request,
      });

    if (approvalError) throw approvalError;

    if (input.self_evaluation_id) {
      await supabase
        .from('task_self_evaluations')
        .update({ 
          status: 'revision_requested',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.self_evaluation_id);
    }

    await supabase
      .from('tasks')
      .update({ evaluation_status: 'revision_requested' })
      .eq('id', input.task_id);

    console.log('✅ [requestInfo] Revision requested successfully');
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ [requestInfo] error:', error);
    return { success: false, error: error as Error };
  }
}

// ============================================================================
// SERVICE OBJECT
// ============================================================================

export const approvalService = {

  async getPendingEvaluations(
    permissionContext?: ApprovalPermissionContext
  ): Promise<{ data: PendingEvaluation[]; error: Error | null }> {
    console.log('📋 [approvalService] getPendingEvaluations with permission:', permissionContext);

    try {
      const { data, error } = await supabase
        .from('task_self_evaluations')
        .select(`
          *,
          task:tasks(
            id, code, name, status, priority, progress, due_date, department_id, assigner_id,
            department:departments(id, name),
            assigner:employees!tasks_assigner_id_fkey(id, full_name, position_id)
          ),
          employee:employees(id, code, full_name, avatar_url, department_id)
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

      if (error) throw error;

      const positionIds = new Set<string>();
      (data || []).forEach(item => {
        const task = Array.isArray(item.task) ? item.task[0] : item.task;
        const assigner = task?.assigner as any;
        const posId = Array.isArray(assigner) ? assigner[0]?.position_id : assigner?.position_id;
        if (posId) positionIds.add(posId);
      });

      const positionLevelMap = new Map<string, number>();
      if (positionIds.size > 0) {
        const { data: positions } = await supabase
          .from('positions')
          .select('id, level')
          .in('id', Array.from(positionIds));
        positions?.forEach(p => positionLevelMap.set(p.id, p.level));
      }

      let result: PendingEvaluation[] = (data || []).map(item => {
        const task = Array.isArray(item.task) ? item.task[0] : item.task;
        const employee = Array.isArray(item.employee) ? item.employee[0] : item.employee;
        const assigner = task?.assigner as any;
        const assignerData = Array.isArray(assigner) ? assigner[0] : assigner;
        const assignerLevel = assignerData?.position_id 
          ? positionLevelMap.get(assignerData.position_id) || 6 
          : 6;

        return {
          ...item,
          task: task ? {
            ...task,
            assigner: assignerData ? { ...assignerData, position: { level: assignerLevel } } : null
          } : null,
          employee,
        };
      });

      if (permissionContext) {
        const { userLevel, userDepartmentId, isAdmin } = permissionContext;
        const userGroup = getPermissionGroup(userLevel);

        if (userGroup === 'employee' && !isAdmin) {
          return { data: [], error: null };
        }

        result = result
          .map(item => {
            const taskDeptId = item.task?.department_id || '';
            const assignerLevel = item.task?.assigner?.position?.level || 6;
            const permCheck = canUserApproveTask(userLevel, userDepartmentId, assignerLevel, taskDeptId, isAdmin);
            return { ...item, canApprove: permCheck.canApprove, permissionReason: permCheck.reason };
          })
          .filter(item => item.canApprove);
      }

      console.log('✅ [approvalService] Found', result.length, 'pending evaluations');
      return { data: result, error: null };
    } catch (error) {
      console.error('❌ [approvalService] getPendingEvaluations error:', error);
      return { data: [], error: error as Error };
    }
  },

  // ==========================================================================
  // ĐÃ CẬP NHẬT: Thêm status 'overdue' + field overdue_flagged
  // ==========================================================================
  async getCompletedWithoutEvaluation(
    permissionContext?: ApprovalPermissionContext
  ): Promise<{ data: CompletedTaskWithoutEval[]; error: Error | null }> {
    console.log('📋 [approvalService] getCompletedWithoutEvaluation with permission:', permissionContext);

    try {
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id, code, name, status, priority, progress, due_date, completed_date,
          department_id, assignee_id, assigner_id, created_at, updated_at,
          department:departments(id, name),
          assignee:employees!tasks_assignee_id_fkey(id, code, full_name, avatar_url),
          assigner:employees!tasks_assigner_id_fkey(id, full_name, position_id)
        `)
        // Lấy task hoàn thành (finished) HOẶC quá hạn (overdue)
        .in('status', ['finished', 'overdue'])
        // Loại task đã vào evaluation flow của manager (approved/rejected)
        // pending_self_eval = chưa tự đánh giá → vẫn phải hiện
        // pending_approval = đã tự đánh giá → thuộc tab "Chờ phê duyệt"
        .not('evaluation_status', 'in', '("pending_approval","approved","rejected")')
        // Chỉ lấy task có assignee (không có assignee thì không duyệt được)
        .not('assignee_id', 'is', null);

      if (tasksError) throw tasksError;

      const { data: evaluations, error: evalError } = await supabase
        .from('task_self_evaluations')
        .select('task_id');

      if (evalError) throw evalError;

      const evaluatedTaskIds = new Set(evaluations?.map(e => e.task_id) || []);

      // Collect position_ids để batch fetch
      const positionIds = new Set<string>();
      (tasks || []).forEach(t => {
        const assigner = t.assigner as any;
        const posId = Array.isArray(assigner) ? assigner[0]?.position_id : assigner?.position_id;
        if (posId) positionIds.add(posId);
      });

      const positionLevelMap = new Map<string, number>();
      if (positionIds.size > 0) {
        const { data: positions } = await supabase
          .from('positions')
          .select('id, level')
          .in('id', Array.from(positionIds));
        positions?.forEach(p => positionLevelMap.set(p.id, p.level));
      }

      let result: CompletedTaskWithoutEval[] = (tasks || [])
        .filter(t => !evaluatedTaskIds.has(t.id))
        .map(t => {
          const assigner = t.assigner as any;
          const assignerData = Array.isArray(assigner) ? assigner[0] : assigner;
          // Default level 6 (Employee) khi assigner NULL → manager được duyệt
          const assignerLevel = assignerData?.position_id 
            ? positionLevelMap.get(assignerData.position_id) || 6 
            : 6;

          return {
            ...t,
            department: Array.isArray(t.department) ? t.department[0] : t.department,
            assignee:   Array.isArray(t.assignee)   ? t.assignee[0]   : t.assignee,
            assigner:   assignerData ? { ...assignerData, position: { level: assignerLevel } } : null,
            // ← MỚI: task quá hạn được đánh dấu để UI hiện badge đỏ
            overdue_flagged: t.status === 'overdue',
          };
        });

      // Sort: overdue lên trước, sau đó theo due_date tăng dần
      result.sort((a, b) => {
        if (a.overdue_flagged && !b.overdue_flagged) return -1;
        if (!a.overdue_flagged && b.overdue_flagged) return 1;
        return new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime();
      });

      // Apply permission filtering
      if (permissionContext) {
        const { userLevel, userDepartmentId, isAdmin } = permissionContext;
        const userGroup = getPermissionGroup(userLevel);

        if (userGroup === 'employee' && !isAdmin) {
          return { data: [], error: null };
        }

        result = result
          .map(item => {
            const taskDeptId = item.department_id || '';
            const assignerLevel = item.assigner?.position?.level || 6;
            const permCheck = canUserApproveTask(userLevel, userDepartmentId, assignerLevel, taskDeptId, isAdmin);
            return { ...item, canApprove: permCheck.canApprove, permissionReason: permCheck.reason };
          })
          .filter(item => item.canApprove);
      }

      console.log('✅ [approvalService] Found', result.length, 'tasks (finished+overdue) without evaluation');
      return { data: result, error: null };
    } catch (error) {
      console.error('❌ [approvalService] getCompletedWithoutEvaluation error:', error);
      return { data: [], error: error as Error };
    }
  },

  async getApprovalStats(permissionContext?: ApprovalPermissionContext): Promise<ApprovalStats> {
    console.log('📋 [approvalService] getApprovalStats');

    try {
      const { data: pendingData } = await this.getPendingEvaluations(permissionContext);
      const pending_evaluations = pendingData?.length || 0;

      const { data: completedData } = await this.getCompletedWithoutEvaluation(permissionContext);
      const completed_without_eval = completedData?.length || 0;

      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const { data: approvedThisWeek } = await supabase
        .from('task_approvals')
        .select('id')
        .eq('action', 'approved')
        .gte('created_at', startOfWeek.toISOString());

      const { data: rejectedThisWeek } = await supabase
        .from('task_approvals')
        .select('id')
        .eq('action', 'rejected')
        .gte('created_at', startOfWeek.toISOString());

      return {
        pending_evaluations,
        completed_without_eval,
        approved_this_week: approvedThisWeek?.length || 0,
        rejected_this_week: rejectedThisWeek?.length || 0,
      };
    } catch (error) {
      console.error('❌ [approvalService] getApprovalStats error:', error);
      return { pending_evaluations: 0, completed_without_eval: 0, approved_this_week: 0, rejected_this_week: 0 };
    }
  },

  async checkApprovalPermission(
    taskId: string,
    permissionContext: ApprovalPermissionContext
  ): Promise<{ canApprove: boolean; reason?: string }> {
    try {
      const { data: task, error } = await supabase
        .from('tasks')
        .select(`
          id, department_id,
          assigner:employees!tasks_assigner_id_fkey(id, position_id)
        `)
        .eq('id', taskId)
        .maybeSingle();

      if (error || !task) {
        return { canApprove: false, reason: 'Không tìm thấy công việc' };
      }

      let assignerLevel = 1;
      const assigner = task.assigner as any;
      const assignerPositionId = Array.isArray(assigner) ? assigner[0]?.position_id : assigner?.position_id;

      if (assignerPositionId) {
        const { data: posData } = await supabase
          .from('positions')
          .select('level')
          .eq('id', assignerPositionId)
          .maybeSingle();
        if (posData?.level) assignerLevel = posData.level;
      }

      return canUserApproveTask(
        permissionContext.userLevel,
        permissionContext.userDepartmentId,
        assignerLevel,
        task.department_id,
        permissionContext.isAdmin
      );
    } catch (error) {
      console.error('Error checking approval permission:', error);
      return { canApprove: false, reason: 'Lỗi kiểm tra quyền' };
    }
  },

  async approve(input: ApproveInput): Promise<{ success: boolean; error: Error | null }> {
    return approveTask({
      task_id: input.task_id,
      approver_id: input.approver_id,
      score: input.score,
      comments: input.comments,
      self_evaluation_id: input.self_evaluation_id,
    });
  },

  async reject(input: RejectInput): Promise<{ success: boolean; error: Error | null }> {
    return rejectTask({
      task_id: input.task_id,
      approver_id: input.approver_id,
      rejection_reason: input.rejection_reason,
      comments: input.comments,
      self_evaluation_id: input.self_evaluation_id,
    });
  },

  async requestRevision(input: RequestRevisionInput): Promise<{ success: boolean; error: Error | null }> {
    return requestInfo({
      task_id: input.task_id,
      approver_id: input.approver_id,
      additional_request: input.revision_request,
      self_evaluation_id: input.self_evaluation_id,
    });
  },

  async quickApprove(input: QuickApproveInput): Promise<{ success: boolean; error: Error | null }> {
    console.log('📋 [approvalService] quickApprove:', input);

    try {
      const rating = calculateRating(input.score);

      // BƯỚC 1: Đảm bảo task có progress=100 và status=finished
      // Trigger validate_task_status_progress yêu cầu finished phải có progress=100
      // Task overdue thường có progress < 100 → phải update trước khi insert self_eval
      const { error: taskUpdateError } = await supabase
        .from('tasks')
        .update({
          progress: 100,
          status: 'finished',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.task_id)
        .in('status', ['overdue', 'in_progress', 'draft', 'assigned', 'paused']);
        // Chỉ update nếu chưa finished, tránh đụng task đã finished thật

      if (taskUpdateError) throw taskUpdateError;

      // BƯỚC 2: Insert self_evaluation
      const { error: selfEvalError } = await supabase
        .from('task_self_evaluations')
        .insert({
          task_id: input.task_id,
          employee_id: input.employee_id,
          completion_percentage: 100,
          self_score: input.score,
          quality_assessment: rating,
          status: 'approved',
          revision_count: 0,
          submitted_at: new Date().toISOString(),
        });

      if (selfEvalError) throw selfEvalError;

      // BƯỚC 3: Insert approval record
      const { error: approvalError } = await supabase
        .from('task_approvals')
        .insert({
          task_id: input.task_id,
          approver_id: input.approver_id,
          action: 'approved',
          approved_score: input.score,
          original_score: input.score,
          rating: rating,
          comments: input.comments || 'Phê duyệt nhanh bởi Manager',
        });

      if (approvalError) throw approvalError;

      // BƯỚC 4: Cập nhật evaluation_status
      await supabase
        .from('tasks')
        .update({ evaluation_status: 'approved' })
        .eq('id', input.task_id);

      console.log('✅ [approvalService] Quick approved successfully');
      return { success: true, error: null };
    } catch (error) {
      console.error('❌ [approvalService] quickApprove error:', error);
      return { success: false, error: error as Error };
    }
  },
};

export default approvalService;