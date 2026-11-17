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
import { approveTasksScored, computeAutoScore, ratingFromScore, type AutoSource } from './taskScoring';
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

// Xếp loại + hệ số tự duyệt: MỘT nguồn ở taskScoring.ts (Đợt 3 audit UI) — đừng chép lại ở đây.
const calculateRating = ratingFromScore;

export type AutoApproveSource = AutoSource;

export interface AutoApproveInput {
  task_id: string;
  approver_id: string;
  source: AutoApproveSource;
  self_score?: number;
  /** điểm cuối đã tính (vd QuickEvalModal); bỏ trống = computeAutoScore(source, self_score) */
  final_score?: number;
  comments?: string;
}

/**
 * Insert task_approvals row cho auto-approve flow (recurring/self/project/deptmanager).
 * Trigger update_participant_scores_on_approval sẽ tự lan tỏa shared_score
 * cho mọi participant của task. Caller chịu trách nhiệm UPDATE bảng tasks
 * (status, progress, scores, evaluation_status) trước khi gọi hàm này.
 *
 * A-H3 fix: THROW khi DB fail thay vì return silent. Caller cần try/catch.
 * Nếu fail: caller có thể compensate (rollback tasks update) hoặc ít nhất
 * user thấy error thay vì silent miss shared_score.
 */
export async function insertAutoApproval(input: AutoApproveInput): Promise<void> {
  // approved_score PHẢI bằng final_score trên việc — trước đây ghi cứng 80/85/90/100 bất kể tự chấm,
  // nên người cùng làm (trigger lan approved_score) nhận điểm khác người chính (130 việc lệch, 17/11/2026).
  const finalScore = input.final_score ?? computeAutoScore(input.source, input.self_score);
  const rating = calculateRating(finalScore);

  const { error } = await supabase.from('task_approvals').insert({
    task_id: input.task_id,
    approver_id: input.approver_id,
    action: 'approved',
    approved_score: finalScore,
    original_score: input.self_score ?? finalScore,
    rating,
    auto_approved: true,
    comments: input.comments ?? `Auto-approve: ${input.source} (${finalScore}đ)`,
  });

  if (error) {
    console.error('❌ [insertAutoApproval] DB insert failed — participants may miss shared_score:', error);
    throw new Error(`Auto-approve failed: ${error.message}. Manager cần phê duyệt thủ công để participants nhận điểm.`);
  }
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
  // Đi qua cửa duyệt CHUNG (taskScoring): input.score = điểm QL 0–100, điểm cuối tính theo công thức
  // chung (trộn tự chấm, hệ số khó, trừ trễ) và GHI final_score — bản cũ chỉ chèn task_approvals,
  // tasks.final_score không bao giờ được ghi ở đường này.
  try {
    const res = await approveTasksScored([{
      taskId: input.task_id,
      managerPoints: input.score,
      note: input.comments || null,
      selfEvaluationId: input.self_evaluation_id || null,
    }], input.approver_id, 'Phê duyệt');
    if (res.failed.length) throw new Error(res.failed[0].error);
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
        // Lấy task hoàn thành hoặc chờ đánh giá
        .in('status', ['finished', 'overdue', 'pending_review'])
        // Loại task đã được duyệt/từ chối
        .not('evaluation_status', 'in', '("approved","rejected")')
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
    // Phê duyệt nhanh việc CHƯA tự đánh giá → cửa duyệt chung với ignoreSelf (điểm = trọn điểm QL,
    // vẫn nhân hệ số khó / trừ trễ). Bản cũ chèn một bản "tự đánh giá" giả mang ĐIỂM CỦA QL vào
    // task_self_evaluations → báo cáo hiệu suất đếm điểm QL như điểm tự chấm của NV. Đã bỏ.
    // Việc còn mở (overdue/in_progress…) được approveTasksScored đưa lên progress 100 + finished.
    try {
      const res = await approveTasksScored([{
        taskId: input.task_id,
        managerPoints: input.score,
        note: input.comments || null,
        ignoreSelf: true,
      }], input.approver_id, 'Phê duyệt nhanh bởi Manager');
      if (res.failed.length) throw new Error(res.failed[0].error);
      return { success: true, error: null };
    } catch (error) {
      console.error('❌ [approvalService] quickApprove error:', error);
      return { success: false, error: error as Error };
    }
  },
};

export default approvalService;