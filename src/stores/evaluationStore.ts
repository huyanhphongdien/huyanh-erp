// ============================================================================
// SELF EVALUATION SERVICE (WITH EMAIL INTEGRATION)
// File: src/services/selfEvaluationService.ts
// Huy Anh ERP System
// ============================================================================

import { supabase } from '../lib/supabase';
import { notifySelfEvaluationSubmitted } from '../services/emailService';

// ============================================================================
// TYPES
// ============================================================================

export interface SelfEvaluation {
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
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'needs_revision';
  revision_count: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSelfEvaluationInput {
  task_id: string;
  employee_id: string;
  completion_percentage?: number;
  self_score?: number | null;
  quality_assessment?: string | null;
  achievements?: string | null;
  difficulties?: string | null;
  solutions?: string | null;
  recommendations?: string | null;
  status?: 'draft' | 'pending';
}

export interface UpdateSelfEvaluationInput {
  completion_percentage?: number;
  self_score?: number | null;
  quality_assessment?: string | null;
  achievements?: string | null;
  difficulties?: string | null;
  solutions?: string | null;
  recommendations?: string | null;
  status?: 'draft' | 'pending' | 'approved' | 'rejected' | 'needs_revision';
}

export interface SelfEvaluationFilter {
  employee_id?: string;
  task_id?: string;
  status?: string;
}

// ============================================================================
// NAMED EXPORT FUNCTIONS (for evaluationStore compatibility)
// ============================================================================

/**
 * Lấy danh sách self-evaluations với filter
 */
export async function getSelfEvaluations(filter?: SelfEvaluationFilter): Promise<{ data: SelfEvaluation[]; error: Error | null }> {
  console.log('📋 [selfEvaluationService] getSelfEvaluations:', filter);

  try {
    let query = supabase
      .from('task_self_evaluations')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter?.employee_id) {
      query = query.eq('employee_id', filter.employee_id);
    }

    if (filter?.task_id) {
      query = query.eq('task_id', filter.task_id);
    }

    if (filter?.status) {
      query = query.eq('status', filter.status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('❌ [selfEvaluationService] getSelfEvaluations error:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Tạo self-evaluation mới (named export)
 */
export async function createSelfEvaluation(input: CreateSelfEvaluationInput): Promise<{ data: SelfEvaluation | null; error: Error | null }> {
  console.log('➕ [selfEvaluationService] createSelfEvaluation:', input);

  try {
    const { data, error } = await supabase
      .from('task_self_evaluations')
      .insert({
        task_id: input.task_id,
        employee_id: input.employee_id,
        completion_percentage: input.completion_percentage || 0,
        self_score: input.self_score || null,
        quality_assessment: input.quality_assessment || null,
        achievements: input.achievements || null,
        difficulties: input.difficulties || null,
        solutions: input.solutions || null,
        recommendations: input.recommendations || null,
        status: input.status || 'draft',
        revision_count: 0,
        submitted_at: input.status === 'pending' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;

    // Nếu submit luôn (status = pending), gửi email cho managers
    if (input.status === 'pending' && data) {
      console.log('📧 [selfEvaluationService] Submitting - sending email to managers');
      notifySelfEvaluationSubmitted(
        input.task_id,
        input.employee_id,
        data.self_score,
        data.completion_percentage,
        data.quality_assessment,
        data.achievements
      ).catch(err => console.error('📧 Email error (non-blocking):', err));
    }

    console.log('✅ [selfEvaluationService] Created:', data?.id);
    return { data, error: null };
  } catch (error) {
    console.error('❌ [selfEvaluationService] createSelfEvaluation error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Cập nhật self-evaluation (named export)
 */
export async function updateSelfEvaluation(id: string, input: UpdateSelfEvaluationInput): Promise<{ data: SelfEvaluation | null; error: Error | null }> {
  console.log('✏️ [selfEvaluationService] updateSelfEvaluation:', id, input);

  try {
    // Lấy thông tin hiện tại trước
    const { data: current } = await supabase
      .from('task_self_evaluations')
      .select('task_id, employee_id, status')
      .eq('id', id)
      .single();

    const updateData: Record<string, any> = {
      ...input,
      updated_at: new Date().toISOString(),
    };

    // Nếu chuyển sang pending (submit), cập nhật submitted_at
    if (input.status === 'pending') {
      updateData.submitted_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('task_self_evaluations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Nếu vừa submit (status chuyển sang pending), gửi email cho managers
    if (input.status === 'pending' && current?.status !== 'pending' && current?.task_id && current?.employee_id && data) {
      console.log('📧 [selfEvaluationService] Status changed to pending - sending email to managers');
      notifySelfEvaluationSubmitted(
        current.task_id,
        current.employee_id,
        data.self_score,
        data.completion_percentage,
        data.quality_assessment,
        data.achievements
      ).catch(err => console.error('📧 Email error (non-blocking):', err));
    }

    console.log('✅ [selfEvaluationService] Updated:', id);
    return { data, error: null };
  } catch (error) {
    console.error('❌ [selfEvaluationService] updateSelfEvaluation error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Xóa self-evaluation (named export)
 */
export async function deleteSelfEvaluation(id: string): Promise<{ error: Error | null }> {
  console.log('🗑️ [selfEvaluationService] deleteSelfEvaluation:', id);

  try {
    const { error } = await supabase
      .from('task_self_evaluations')
      .delete()
      .eq('id', id);

    if (error) throw error;

    console.log('✅ [selfEvaluationService] Deleted:', id);
    return { error: null };
  } catch (error) {
    console.error('❌ [selfEvaluationService] deleteSelfEvaluation error:', error);
    return { error: error as Error };
  }
}

// ============================================================================
// SERVICE OBJECT (for direct usage)
// ============================================================================

export const selfEvaluationService = {
  /**
   * Lấy self-evaluation theo task_id
   */
  async getByTaskId(taskId: string): Promise<SelfEvaluation | null> {
    console.log('📋 [selfEvaluationService] getByTaskId:', taskId);

    const { data, error } = await supabase
      .from('task_self_evaluations')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('❌ [selfEvaluationService] getByTaskId error:', error);
      throw error;
    }

    return data;
  },

  /**
   * Lấy danh sách self-evaluations của employee
   */
  async getByEmployeeId(employeeId: string): Promise<SelfEvaluation[]> {
    console.log('📋 [selfEvaluationService] getByEmployeeId:', employeeId);

    const { data, error } = await supabase
      .from('task_self_evaluations')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [selfEvaluationService] getByEmployeeId error:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Tạo self-evaluation mới
   */
  async create(input: CreateSelfEvaluationInput): Promise<SelfEvaluation> {
    const result = await createSelfEvaluation(input);
    if (result.error) throw result.error;
    return result.data!;
  },

  /**
   * Cập nhật self-evaluation
   */
  async update(id: string, input: UpdateSelfEvaluationInput): Promise<SelfEvaluation> {
    const result = await updateSelfEvaluation(id, input);
    if (result.error) throw result.error;
    return result.data!;
  },

  /**
   * Submit self-evaluation (chuyển từ draft sang pending) + GỬI EMAIL
   */
  async submit(id: string): Promise<SelfEvaluation> {
    console.log('📤 [selfEvaluationService] submit:', id);

    // Lấy thông tin hiện tại
    const { data: current, error: fetchError } = await supabase
      .from('task_self_evaluations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      throw new Error('Self-evaluation not found');
    }

    // Update status to pending
    const { data, error } = await supabase
      .from('task_self_evaluations')
      .update({ 
        status: 'pending',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ [selfEvaluationService] submit error:', error);
      throw error;
    }

    // Update task evaluation_status
    await supabase
      .from('tasks')
      .update({ 
        evaluation_status: 'pending_approval',
        updated_at: new Date().toISOString()
      })
      .eq('id', current.task_id);

    // GỬI EMAIL CHO MANAGERS
    console.log('📧 [selfEvaluationService] Sending email to managers...');
    notifySelfEvaluationSubmitted(
      current.task_id,
      current.employee_id,
      data.self_score,
      data.completion_percentage,
      data.quality_assessment,
      data.achievements
    ).catch(err => console.error('📧 Email error (non-blocking):', err));

    console.log('✅ [selfEvaluationService] Submitted:', id);
    return data;
  },

  /**
   * Lưu draft
   */
  async saveDraft(id: string, input: UpdateSelfEvaluationInput): Promise<SelfEvaluation> {
    console.log('💾 [selfEvaluationService] saveDraft:', id);
    return this.update(id, { ...input, status: 'draft' });
  },

  /**
   * Xóa self-evaluation
   */
  async delete(id: string): Promise<void> {
    const result = await deleteSelfEvaluation(id);
    if (result.error) throw result.error;
  },

  /**
   * Lấy self-evaluation theo ID
   */
  async getById(id: string): Promise<SelfEvaluation | null> {
    console.log('📋 [selfEvaluationService] getById:', id);

    const { data, error } = await supabase
      .from('task_self_evaluations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('❌ [selfEvaluationService] getById error:', error);
      throw error;
    }

    return data;
  },

  /**
   * Kiểm tra task đã có self-evaluation chưa
   */
  async existsForTask(taskId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('task_self_evaluations')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', taskId);

    if (error) {
      console.error('❌ [selfEvaluationService] existsForTask error:', error);
      return false;
    }

    return (count || 0) > 0;
  },
};

export default selfEvaluationService;