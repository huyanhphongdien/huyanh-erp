// ============================================================================
// PHASE 4.3.1: EVALUATION SERVICE
// File: src/services/evaluationService.ts
// Huy Anh ERP System
// ============================================================================
// Database: task_evaluations
// ============================================================================
// UPDATED: Đồng bộ với database schema thực tế (2026-01-21)
// Rating values: 'excellent', 'good', 'average', 'below_average'
// ============================================================================

import { supabase } from '../lib/supabase';
import {
  TaskEvaluation,
  EvaluationWithRelations,
  CreateEvaluationInput,
  UpdateEvaluationInput,
  EvaluationFilters,
  EmployeeLeaderboardItem,
  DepartmentStats,
  EmployeeEvaluationStats,
  RatingDistribution,
  RatingLevel,
  calculateRating,
} from '../types/evaluation.types';

// Re-export types for convenience
export type {
  TaskEvaluation,
  EvaluationWithRelations,
  CreateEvaluationInput,
  UpdateEvaluationInput,
  EvaluationFilters,
  EmployeeLeaderboardItem,
  DepartmentStats,
  EmployeeEvaluationStats,
  RatingDistribution,
};

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Lấy danh sách evaluations với filter
 */
export async function getEvaluations(
  filters?: EvaluationFilters
): Promise<{ data: EvaluationWithRelations[]; error: Error | null }> {
  try {
    let query = supabase
      .from('task_evaluations')
      .select(`
        *,
        task:tasks!task_evaluations_task_id_fkey (
          id, code, name, status, department_id,
          department:departments!tasks_department_id_fkey (id, name)
        ),
        employee:employees!task_evaluations_employee_id_fkey (
          id, code, full_name, avatar_url, department_id,
          department:departments!employees_department_id_fkey (id, name)
        ),
        evaluator:employees!task_evaluations_evaluator_id_fkey (
          id, code, full_name, avatar_url
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.task_id) {
      query = query.eq('task_id', filters.task_id);
    }
    if (filters?.employee_id) {
      query = query.eq('employee_id', filters.employee_id);
    }
    if (filters?.evaluator_id) {
      query = query.eq('evaluator_id', filters.evaluator_id);
    }
    if (filters?.rating) {
      query = query.eq('rating', filters.rating);
    }
    if (filters?.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    if (filters?.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Lấy evaluation theo ID
 */
export async function getEvaluationById(
  id: string
): Promise<{ data: EvaluationWithRelations | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('task_evaluations')
      .select(`
        *,
        task:tasks!task_evaluations_task_id_fkey (
          id, code, name, status, department_id,
          department:departments!tasks_department_id_fkey (id, name)
        ),
        employee:employees!task_evaluations_employee_id_fkey (
          id, code, full_name, avatar_url, department_id,
          department:departments!employees_department_id_fkey (id, name)
        ),
        evaluator:employees!task_evaluations_evaluator_id_fkey (
          id, code, full_name, avatar_url
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching evaluation:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Lấy evaluation theo task_id
 */
export async function getEvaluationByTask(
  taskId: string
): Promise<{ data: EvaluationWithRelations | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('task_evaluations')
      .select(`
        *,
        employee:employees!task_evaluations_employee_id_fkey (
          id, code, full_name
        ),
        evaluator:employees!task_evaluations_evaluator_id_fkey (
          id, code, full_name
        )
      `)
      .eq('task_id', taskId)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching evaluation by task:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Lấy evaluations của employee
 */
export async function getEmployeeEvaluations(
  employeeId: string
): Promise<{ data: EvaluationWithRelations[]; error: Error | null }> {
  return getEvaluations({ employee_id: employeeId });
}

/**
 * Bảng xếp hạng nhân viên
 */
export async function getLeaderboard(
  filters?: {
    department_id?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
  }
): Promise<{ data: EmployeeLeaderboardItem[]; error: Error | null }> {
  try {
    let query = supabase
      .from('task_evaluations')
      .select(`
        score,
        rating,
        employee_id,
        employee:employees!task_evaluations_employee_id_fkey (
          id, code, full_name, avatar_url, department_id,
          department:departments!employees_department_id_fkey (id, name)
        )
      `);

    if (filters?.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    if (filters?.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by employee
    const employeeMap = new Map<string, {
      employee_id: string;
      employee_code: string;
      employee_name: string;
      avatar_url: string | null;
      department_id: string;
      department_name: string;
      total_tasks: number;
      total_score: number;
    }>();

    (data || []).forEach((item: any) => {
      const emp = item.employee;
      if (!emp) return;

      // Filter by department if needed
      if (filters?.department_id && emp.department_id !== filters.department_id) {
        return;
      }

      const existing = employeeMap.get(item.employee_id);
      if (existing) {
        existing.total_tasks++;
        existing.total_score += item.score;
      } else {
        employeeMap.set(item.employee_id, {
          employee_id: item.employee_id,
          employee_code: emp.code || '',
          employee_name: emp.full_name || '',
          avatar_url: emp.avatar_url,
          department_id: emp.department_id || '',
          department_name: emp.department?.name || '',
          total_tasks: 1,
          total_score: item.score,
        });
      }
    });

    // Calculate average and sort
    const leaderboard: EmployeeLeaderboardItem[] = Array.from(employeeMap.values())
      .map(emp => ({
        ...emp,
        average_score: Math.round(emp.total_score / emp.total_tasks),
        rating: calculateRating(Math.round(emp.total_score / emp.total_tasks)),
      }))
      .sort((a, b) => b.average_score - a.average_score);

    // Apply limit
    const limit = filters?.limit || 10;
    return { data: leaderboard.slice(0, limit), error: null };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Thống kê theo phòng ban
 * FIXED: Dùng English rating values: excellent, good, average, below_average
 */
export async function getDepartmentStats(
  filters?: {
    from_date?: string;
    to_date?: string;
  }
): Promise<{ data: DepartmentStats[]; error: Error | null }> {
  try {
    let query = supabase
      .from('task_evaluations')
      .select(`
        score,
        rating,
        employee:employees!task_evaluations_employee_id_fkey (
          department_id,
          department:departments!employees_department_id_fkey (id, name)
        )
      `);

    if (filters?.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    if (filters?.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by department
    // FIXED: Dùng English rating keys theo database constraint
    const deptMap = new Map<string, {
      department_id: string;
      department_name: string;
      total_evaluations: number;
      total_score: number;
      rating_distribution: RatingDistribution;
    }>();

    // FIXED: Dùng English values để khớp với database
    const validRatings: RatingLevel[] = ['excellent', 'good', 'average', 'below_average'];

    (data || []).forEach((item: any) => {
      const deptId = item.employee?.department_id;
      const deptName = item.employee?.department?.name;
      if (!deptId) return;

      const existing = deptMap.get(deptId);
      const rating = item.rating as RatingLevel;
      const isValidRating = validRatings.includes(rating);

      if (existing) {
        existing.total_evaluations++;
        existing.total_score += item.score;
        if (isValidRating) {
          existing.rating_distribution[rating]++;
        }
      } else {
        // FIXED: Dùng English keys
        const newRatingDist: RatingDistribution = {
          'excellent': 0,
          'good': 0,
          'average': 0,
          'below_average': 0,
        };
        if (isValidRating) {
          newRatingDist[rating] = 1;
        }
        deptMap.set(deptId, {
          department_id: deptId,
          department_name: deptName || '',
          total_evaluations: 1,
          total_score: item.score,
          rating_distribution: newRatingDist,
        });
      }
    });

    // Calculate average
    const stats: DepartmentStats[] = Array.from(deptMap.values())
      .map(dept => ({
        ...dept,
        average_score: Math.round(dept.total_score / dept.total_evaluations),
      }))
      .sort((a, b) => b.average_score - a.average_score);

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error fetching department stats:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Thống kê của nhân viên
 * FIXED: Dùng English rating values: excellent, good, average, below_average
 */
export async function getEmployeeStats(
  employeeId: string
): Promise<EmployeeEvaluationStats> {
  try {
    const { data, error } = await supabase
      .from('task_evaluations')
      .select('score, rating')
      .eq('employee_id', employeeId);

    if (error) throw error;

    // FIXED: Dùng English keys
    const ratingDistribution: RatingDistribution = {
      'excellent': 0,
      'good': 0,
      'average': 0,
      'below_average': 0,
    };

    const validRatings: RatingLevel[] = ['excellent', 'good', 'average', 'below_average'];

    let averageScore = 0;
    let rating: RatingLevel | string = 'average';

    if (data && data.length > 0) {
      let totalScore = 0;
      data.forEach(item => {
        totalScore += item.score;
        const itemRating = item.rating as RatingLevel;
        if (validRatings.includes(itemRating)) {
          ratingDistribution[itemRating]++;
        }
      });
      averageScore = Math.round(totalScore / data.length);
      rating = calculateRating(averageScore);
    }

    return {
      total: data?.length || 0,
      averageScore,
      rating,
      ratingDistribution,
    };
  } catch (error) {
    console.error('Error fetching employee stats:', error);
    throw error;
  }
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Tạo evaluation mới
 */
export async function createEvaluation(
  input: CreateEvaluationInput
): Promise<{ data: TaskEvaluation | null; error: Error | null }> {
  try {
    // Kiểm tra đã có evaluation chưa
    const { data: existing } = await getEvaluationByTask(input.task_id);
    if (existing) {
      throw new Error('Đã có đánh giá cho công việc này');
    }

    // Tính rating
    const rating = calculateRating(input.score);

    const { data, error } = await supabase
      .from('task_evaluations')
      .insert({
        task_id: input.task_id,
        employee_id: input.employee_id,
        evaluator_id: input.evaluator_id,
        score: input.score,
        content: input.content || null,
        rating,
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating evaluation:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Cập nhật evaluation
 */
export async function updateEvaluation(
  id: string,
  input: UpdateEvaluationInput
): Promise<{ data: TaskEvaluation | null; error: Error | null }> {
  try {
    const updateData: any = {
      ...input,
      updated_at: new Date().toISOString(),
    };

    // Tính rating mới nếu có score
    if (input.score !== undefined) {
      updateData.rating = calculateRating(input.score);
    }

    const { data, error } = await supabase
      .from('task_evaluations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating evaluation:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Xóa evaluation
 */
export async function deleteEvaluation(
  id: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('task_evaluations')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting evaluation:', error);
    return { success: false, error: error as Error };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const evaluationService = {
  // Queries
  getEvaluations,
  getEvaluationById,
  getEvaluationByTask,
  getEmployeeEvaluations,
  getLeaderboard,
  getDepartmentStats,
  getEmployeeStats,
  
  // Mutations
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
};

export default evaluationService;