// ============================================================================
// TASK ASSIGNMENT SERVICE (WITH EMAIL INTEGRATION)
// File: src/services/taskAssignmentService.ts
// Huy Anh ERP System
// ============================================================================

import { supabase } from '../lib/supabase';
import { notifyTaskAssigned } from './emailService';
import type { 
  TaskAssignment, 
  CreateAssignmentInput, 
  UpdateAssignmentInput,
  AssignmentRole 
} from '../types/taskAssignment';

// ============================================================================
// SERVICE
// ============================================================================

export const taskAssignmentService = {
  /**
   * Lấy danh sách người tham gia của task
   */
  async getByTaskId(taskId: string): Promise<TaskAssignment[]> {
    console.log('📋 [assignmentService] getByTaskId:', taskId);

    const { data, error } = await supabase
      .from('task_assignments')
      .select(`
        *,
        employee:employee_id(
          id, 
          code, 
          full_name, 
          email, 
          avatar_url
        ),
        assigner:assigned_by(
          id, 
          full_name
        )
      `)
      .eq('task_id', taskId)
      .neq('status', 'removed')
      .order('role', { ascending: true })
      .order('assigned_at', { ascending: false });

    if (error) {
      console.error('❌ [assignmentService] getByTaskId error:', error);
      throw error;
    }

    console.log('✅ [assignmentService] Found', data?.length || 0, 'assignments');
    return data || [];
  },

  /**
   * Lấy danh sách công việc được giao cho employee
   */
  async getByEmployeeId(employeeId: string): Promise<TaskAssignment[]> {
    console.log('📋 [assignmentService] getByEmployeeId:', employeeId);

    const { data, error } = await supabase
      .from('task_assignments')
      .select(`
        *,
        task:tasks(id, code, name, status, priority, due_date)
      `)
      .eq('employee_id', employeeId)
      .neq('status', 'removed')
      .order('assigned_at', { ascending: false });

    if (error) {
      console.error('❌ [assignmentService] getByEmployeeId error:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Thêm người vào task + GỬI EMAIL
   */
  async create(input: CreateAssignmentInput): Promise<TaskAssignment> {
    console.log('➕ [assignmentService] create:', input);

    const { data, error } = await supabase
      .from('task_assignments')
      .insert({
        task_id: input.task_id,
        employee_id: input.employee_id,
        assigned_by: input.assigned_by,
        role: input.role || 'participant',
        status: 'pending',
        note: input.note,
        estimated_hours: input.estimated_hours,
        assigned_at: new Date().toISOString()
      })
      .select(`
        *,
        employee:employee_id(
          id, code, full_name, email
        )
      `)
      .single();

    if (error) {
      console.error('❌ [assignmentService] create error:', error);
      throw error;
    }

    // GỬI EMAIL THÔNG BÁO CHO NGƯỜI ĐƯỢC GIAO
    if (input.assigned_by) {
      // Lấy thông tin task để gửi email
      const { data: taskData } = await supabase
        .from('tasks')
        .select('code, name, description, priority, due_date')
        .eq('id', input.task_id)
        .single();

      notifyTaskAssigned(
        input.task_id,
        input.employee_id,
        input.assigned_by,
        {
          code: taskData?.code,
          name: taskData?.name,
          description: taskData?.description,
          priority: taskData?.priority,
          due_date: taskData?.due_date,
        }
      ).catch(err => console.error('📧 Email error (non-blocking):', err));
    }

    console.log('✅ [assignmentService] Created:', data.id);
    return data;
  },

  /**
   * Thêm nhiều người vào task cùng lúc (Bulk add) + GỬI EMAIL
   */
  async createBulk(
    taskId: string, 
    employeeIds: string[], 
    role: AssignmentRole = 'participant',
    assignedBy?: string
  ): Promise<TaskAssignment[]> {
    console.log('➕ [assignmentService] createBulk:', { 
      taskId, 
      count: employeeIds.length, 
      role 
    });

    const assignments = employeeIds.map(employeeId => ({
      task_id: taskId,
      employee_id: employeeId,
      assigned_by: assignedBy,
      role,
      status: 'pending' as const,
      assigned_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('task_assignments')
      .upsert(assignments, { 
        onConflict: 'task_id,employee_id,role',
        ignoreDuplicates: true 
      })
      .select(`
        *,
        employee:employee_id(
          id, code, full_name
        )
      `);

    if (error) {
      console.error('❌ [assignmentService] createBulk error:', error);
      throw error;
    }

    // GỬI EMAIL CHO TẤT CẢ NGƯỜI ĐƯỢC GIAO
    if (assignedBy) {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('code, name, description, priority, due_date')
        .eq('id', taskId)
        .single();

      // Gửi email song song cho tất cả
      employeeIds.forEach(employeeId => {
        notifyTaskAssigned(
          taskId,
          employeeId,
          assignedBy,
          {
            code: taskData?.code,
            name: taskData?.name,
            description: taskData?.description,
            priority: taskData?.priority,
            due_date: taskData?.due_date,
          }
        ).catch(err => console.error('📧 Email error (non-blocking):', err));
      });
    }

    console.log('✅ [assignmentService] Created', data?.length || 0, 'assignments');
    return data || [];
  },

  /**
   * Cập nhật assignment
   */
  async update(id: string, input: UpdateAssignmentInput): Promise<TaskAssignment> {
    console.log('✏️ [assignmentService] update:', id, input);

    const updateData: Record<string, any> = { ...input };
    
    if (input.status === 'accepted' && !updateData.accepted_at) {
      updateData.accepted_at = new Date().toISOString();
    }
    if (input.status === 'completed' && !updateData.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('task_assignments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ [assignmentService] update error:', error);
      throw error;
    }

    console.log('✅ [assignmentService] Updated:', id);
    return data;
  },

  /**
   * Xóa người khỏi task (soft delete)
   */
  async remove(id: string): Promise<void> {
    console.log('🗑️ [assignmentService] remove (soft):', id);

    const { error } = await supabase
      .from('task_assignments')
      .update({ status: 'removed' })
      .eq('id', id);

    if (error) {
      console.error('❌ [assignmentService] remove error:', error);
      throw error;
    }

    console.log('✅ [assignmentService] Removed:', id);
  },

  /**
   * Xóa người khỏi task (hard delete)
   */
  async delete(id: string): Promise<void> {
    console.log('🗑️ [assignmentService] delete (hard):', id);

    const { error } = await supabase
      .from('task_assignments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ [assignmentService] delete error:', error);
      throw error;
    }

    console.log('✅ [assignmentService] Deleted:', id);
  },

  /**
   * Chấp nhận assignment
   */
  async accept(id: string): Promise<TaskAssignment> {
    return this.update(id, { status: 'accepted' });
  },

  /**
   * Từ chối assignment
   */
  async decline(id: string, note?: string): Promise<TaskAssignment> {
    return this.update(id, { status: 'declined', note });
  },

  /**
   * Hoàn thành assignment
   */
  async complete(id: string, actualHours?: number): Promise<TaskAssignment> {
    return this.update(id, { 
      status: 'completed', 
      actual_hours: actualHours 
    });
  },

  /**
   * Đổi vai trò
   */
  async changeRole(id: string, newRole: AssignmentRole): Promise<TaskAssignment> {
    return this.update(id, { role: newRole });
  }
};

export default taskAssignmentService;