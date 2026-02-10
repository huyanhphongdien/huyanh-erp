// ============================================================================
// APPROVAL SERVICE - WITH PERMISSION FILTERING
// File: src/services/approvalService.ts
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT: 
// - Khi Manager phê duyệt task, điểm sẽ được ghi cho participants qua trigger
// - Thêm phân quyền theo Position Level (EXECUTIVE/MANAGER/EMPLOYEE)
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
  // Permission info (thêm sau khi filter)
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
  // Permission info
  canApprove?: boolean;
  permissionReason?: string;
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

// Types for evaluationStore compatibility
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

// Permission context cho filtering
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

/**
 * Lấy danh sách pending approvals cho manager
 */
export async function getPendingApprovals(approverId: string): Promise<{ data: any[]; error: Error | null }> {
  console.log('📋 [getPendingApprovals] for approver:', approverId);
  
  try {
    // FIX: Bỏ nested position query để tránh lỗi 406
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

    // Transform data
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

/**
 * Lấy lịch sử phê duyệt của manager
 */
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

/**
 * Phê duyệt task
 * NOTE: Điểm cho participants được cập nhật TỰ ĐỘNG qua database trigger
 */
export async function approveTask(input: ApproveTaskInput): Promise<{ success: boolean; error: Error | null }> {
  console.log('📋 [approveTask]:', input);
  
  try {
    const rating = input.rating || calculateRating(input.score);

    // 1. Insert approval record
    // ⚡ Trigger "trigger_update_participant_scores" sẽ tự động cập nhật điểm cho participants
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

    // 2. Update self-evaluation status if provided
    if (input.self_evaluation_id) {
      await supabase
        .from('task_self_evaluations')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', input.self_evaluation_id);
    }

    // 3. Update task evaluation_status
    await supabase
      .from('tasks')
      .update({ evaluation_status: 'approved' })
      .eq('id', input.task_id);

    // ⚡ Điểm cho participants đã được cập nhật TỰ ĐỘNG qua trigger
    console.log('✅ [approveTask] Approved successfully (participants scores updated via trigger)');
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ [approveTask] error:', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Từ chối task
 */
export async function rejectTask(input: RejectTaskInput): Promise<{ success: boolean; error: Error | null }> {
  console.log('📋 [rejectTask]:', input);
  
  try {
    // 1. Insert rejection record
    const { error: approvalError } = await supabase
      .from('task_approvals')
      .insert({
        task_id: input.task_id,
        approver_id: input.approver_id,
        action: 'rejected',
        comments: input.rejection_reason,
      });

    if (approvalError) throw approvalError;

    // 2. Update self-evaluation status
    if (input.self_evaluation_id) {
      await supabase
        .from('task_self_evaluations')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', input.self_evaluation_id);
    }

    // 3. Update task evaluation_status
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

/**
 * Yêu cầu bổ sung thông tin
 */
export async function requestInfo(input: RequestInfoInput): Promise<{ success: boolean; error: Error | null }> {
  console.log('📋 [requestInfo]:', input);
  
  try {
    // 1. Insert revision request record
    const { error: approvalError } = await supabase
      .from('task_approvals')
      .insert({
        task_id: input.task_id,
        approver_id: input.approver_id,
        action: 'revision_requested',
        comments: input.additional_request,
      });

    if (approvalError) throw approvalError;

    // 2. Update self-evaluation status
    if (input.self_evaluation_id) {
      await supabase
        .from('task_self_evaluations')
        .update({ 
          status: 'revision_requested',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.self_evaluation_id);
    }

    // 3. Update task evaluation_status
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
// SERVICE OBJECT (for ApprovalPage) - WITH PERMISSION FILTERING
// ============================================================================

export const approvalService = {
  /**
   * Lấy danh sách tự đánh giá chờ phê duyệt
   * CẬP NHẬT: Filter theo quyền của user (Position Level)
   */
  async getPendingEvaluations(
    permissionContext?: ApprovalPermissionContext
  ): Promise<{ data: PendingEvaluation[]; error: Error | null }> {
    console.log('📋 [approvalService] getPendingEvaluations with permission:', permissionContext);

    try {
      // Query với assigner info để check permission
      // FIX: Bỏ nested position query để tránh lỗi 406
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

      // Collect all position_ids để batch fetch
      const positionIds = new Set<string>();
      (data || []).forEach(item => {
        const task = Array.isArray(item.task) ? item.task[0] : item.task;
        const assigner = task?.assigner as any;
        const posId = Array.isArray(assigner) ? assigner[0]?.position_id : assigner?.position_id;
        if (posId) positionIds.add(posId);
      });

      // Batch fetch positions
      const positionLevelMap = new Map<string, number>();
      if (positionIds.size > 0) {
        const { data: positions } = await supabase
          .from('positions')
          .select('id, level')
          .in('id', Array.from(positionIds));
        positions?.forEach(p => positionLevelMap.set(p.id, p.level));
      }

      // Transform data
      let result: PendingEvaluation[] = (data || []).map(item => {
        const task = Array.isArray(item.task) ? item.task[0] : item.task;
        const employee = Array.isArray(item.employee) ? item.employee[0] : item.employee;
        
        // Extract assigner info với level từ map
        const assigner = task?.assigner as any;
        const assignerData = Array.isArray(assigner) ? assigner[0] : assigner;
        const assignerLevel = assignerData?.position_id 
          ? positionLevelMap.get(assignerData.position_id) || 1 
          : 1; // Default = Executive (safe)

        return {
          ...item,
          task: task ? {
            ...task,
            assigner: assignerData ? {
              ...assignerData,
              position: { level: assignerLevel }
            } : null
          } : null,
          employee,
        };
      });

      // Apply permission filtering if context provided
      if (permissionContext) {
        const { userLevel, userDepartmentId, isAdmin } = permissionContext;
        const userGroup = getPermissionGroup(userLevel);

        // EMPLOYEE không có quyền duyệt → Trả về rỗng
        if (userGroup === 'employee' && !isAdmin) {
          console.log('📋 [approvalService] User is EMPLOYEE, returning empty');
          return { data: [], error: null };
        }

        // Filter và thêm permission info
        result = result
          .map(item => {
            const taskDeptId = item.task?.department_id || '';
            const assignerLevel = item.task?.assigner?.position?.level || 6;

            const permCheck = canUserApproveTask(
              userLevel,
              userDepartmentId,
              assignerLevel,
              taskDeptId,
              isAdmin
            );

            return {
              ...item,
              canApprove: permCheck.canApprove,
              permissionReason: permCheck.reason,
            };
          })
          .filter(item => item.canApprove); // Chỉ trả về những task được phép duyệt

        console.log(`📋 [approvalService] Filtered to ${result.length} approvable evaluations`);
      }

      console.log('✅ [approvalService] Found', result.length, 'pending evaluations');
      return { data: result, error: null };
    } catch (error) {
      console.error('❌ [approvalService] getPendingEvaluations error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy danh sách công việc hoàn thành nhưng chưa có tự đánh giá
   * CẬP NHẬT: Filter theo quyền của user (Position Level)
   */
  async getCompletedWithoutEvaluation(
    permissionContext?: ApprovalPermissionContext
  ): Promise<{ data: CompletedTaskWithoutEval[]; error: Error | null }> {
    console.log('📋 [approvalService] getCompletedWithoutEvaluation with permission:', permissionContext);

    try {
      // Lấy tasks đã hoàn thành với assigner info
      // FIX: Bỏ nested position query để tránh lỗi 406
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id, code, name, status, priority, progress, due_date, completed_date,
          department_id, assignee_id, assigner_id, created_at, updated_at,
          department:departments(id, name),
          assignee:employees!tasks_assignee_id_fkey(id, code, full_name, avatar_url),
          assigner:employees!tasks_assigner_id_fkey(id, full_name, position_id)
        `)
        .eq('status', 'finished');

      if (tasksError) throw tasksError;

      // Lấy danh sách task_id đã có self-evaluation
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

      // Batch fetch positions
      const positionLevelMap = new Map<string, number>();
      if (positionIds.size > 0) {
        const { data: positions } = await supabase
          .from('positions')
          .select('id, level')
          .in('id', Array.from(positionIds));
        positions?.forEach(p => positionLevelMap.set(p.id, p.level));
      }

      // Filter tasks chưa có self-evaluation và transform
      let result: CompletedTaskWithoutEval[] = (tasks || [])
        .filter(t => !evaluatedTaskIds.has(t.id))
        .map(t => {
          const assigner = t.assigner as any;
          const assignerData = Array.isArray(assigner) ? assigner[0] : assigner;
          const assignerLevel = assignerData?.position_id 
            ? positionLevelMap.get(assignerData.position_id) || 1 
            : 1; // Default = Executive (safe)

          return {
            ...t,
            department: Array.isArray(t.department) ? t.department[0] : t.department,
            assignee: Array.isArray(t.assignee) ? t.assignee[0] : t.assignee,
            assigner: assignerData ? {
              ...assignerData,
              position: { level: assignerLevel }
            } : null,
          };
        });

      // Apply permission filtering if context provided
      if (permissionContext) {
        const { userLevel, userDepartmentId, isAdmin } = permissionContext;
        const userGroup = getPermissionGroup(userLevel);

        // EMPLOYEE không có quyền duyệt → Trả về rỗng
        if (userGroup === 'employee' && !isAdmin) {
          console.log('📋 [approvalService] User is EMPLOYEE, returning empty');
          return { data: [], error: null };
        }

        // Filter và thêm permission info
        result = result
          .map(item => {
            const taskDeptId = item.department_id || '';
            const assignerLevel = item.assigner?.position?.level || 1; // Default = Executive

            const permCheck = canUserApproveTask(
              userLevel,
              userDepartmentId,
              assignerLevel,
              taskDeptId,
              isAdmin
            );

            return {
              ...item,
              canApprove: permCheck.canApprove,
              permissionReason: permCheck.reason,
            };
          })
          .filter(item => item.canApprove);

        console.log(`📋 [approvalService] Filtered to ${result.length} approvable tasks`);
      }

      console.log('✅ [approvalService] Found', result.length, 'completed tasks without evaluation');
      return { data: result, error: null };
    } catch (error) {
      console.error('❌ [approvalService] getCompletedWithoutEvaluation error:', error);
      return { data: [], error: error as Error };
    }
  },

  /**
   * Lấy thống kê phê duyệt
   * CẬP NHẬT: Tính theo quyền của user
   */
  async getApprovalStats(permissionContext?: ApprovalPermissionContext): Promise<ApprovalStats> {
    console.log('📋 [approvalService] getApprovalStats');

    try {
      // Đếm pending evaluations (đã filter theo quyền)
      const { data: pendingData } = await this.getPendingEvaluations(permissionContext);
      const pending_evaluations = pendingData?.length || 0;

      // Đếm completed without eval (đã filter theo quyền)
      const { data: completedData } = await this.getCompletedWithoutEvaluation(permissionContext);
      const completed_without_eval = completedData?.length || 0;

      // Đếm approved/rejected tuần này
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
      return {
        pending_evaluations: 0,
        completed_without_eval: 0,
        approved_this_week: 0,
        rejected_this_week: 0,
      };
    }
  },

  /**
   * Kiểm tra quyền phê duyệt trước khi thực hiện
   * FIX: Tách riêng query position để tránh lỗi 406
   */
  async checkApprovalPermission(
    taskId: string,
    permissionContext: ApprovalPermissionContext
  ): Promise<{ canApprove: boolean; reason?: string }> {
    try {
      // 1. Lấy thông tin task và assigner (KHÔNG nested position)
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

      // 2. Fetch position level riêng nếu có position_id
      let assignerLevel = 1; // Default = Executive (safe default)
      const assigner = task.assigner as any;
      const assignerPositionId = Array.isArray(assigner) 
        ? assigner[0]?.position_id 
        : assigner?.position_id;

      if (assignerPositionId) {
        const { data: posData } = await supabase
          .from('positions')
          .select('level')
          .eq('id', assignerPositionId)
          .maybeSingle();
        
        if (posData?.level) {
          assignerLevel = posData.level;
        }
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

  /**
   * Phê duyệt tự đánh giá
   * NOTE: Điểm cho participants được cập nhật TỰ ĐỘNG qua database trigger
   */
  async approve(input: ApproveInput): Promise<{ success: boolean; error: Error | null }> {
    return approveTask({
      task_id: input.task_id,
      approver_id: input.approver_id,
      score: input.score,
      comments: input.comments,
      self_evaluation_id: input.self_evaluation_id,
    });
  },

  /**
   * Từ chối tự đánh giá
   */
  async reject(input: RejectInput): Promise<{ success: boolean; error: Error | null }> {
    return rejectTask({
      task_id: input.task_id,
      approver_id: input.approver_id,
      rejection_reason: input.rejection_reason,
      comments: input.comments,
      self_evaluation_id: input.self_evaluation_id,
    });
  },

  /**
   * Yêu cầu chỉnh sửa
   */
  async requestRevision(input: RequestRevisionInput): Promise<{ success: boolean; error: Error | null }> {
    return requestInfo({
      task_id: input.task_id,
      approver_id: input.approver_id,
      additional_request: input.revision_request,
      self_evaluation_id: input.self_evaluation_id,
    });
  },

  /**
   * Phê duyệt nhanh (cho task chưa có self-evaluation)
   * NOTE: Điểm cho participants được cập nhật TỰ ĐỘNG qua database trigger
   */
  async quickApprove(input: QuickApproveInput): Promise<{ success: boolean; error: Error | null }> {
    console.log('📋 [approvalService] quickApprove:', input);

    try {
      const rating = calculateRating(input.score);

      // 1. Tạo self-evaluation thay cho nhân viên (người phụ trách chính)
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

      // 2. Tạo approval record
      // ⚡ Trigger sẽ tự động cập nhật điểm cho participants
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

      // 3. Cập nhật task evaluation_status
      await supabase
        .from('tasks')
        .update({ evaluation_status: 'approved' })
        .eq('id', input.task_id);

      // ⚡ Điểm cho participants đã được cập nhật TỰ ĐỘNG qua trigger
      console.log('✅ [approvalService] Quick approved successfully (participants scores updated via trigger)');
      return { success: true, error: null };
    } catch (error) {
      console.error('❌ [approvalService] quickApprove error:', error);
      return { success: false, error: error as Error };
    }
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export default approvalService;