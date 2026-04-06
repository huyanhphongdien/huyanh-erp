import { supabase } from '../lib/supabase'

// Define types inline
interface PerformanceCriteria {
  id: string
  code: string
  name: string
  description?: string
  category?: string
  weight: number
  max_score: number
  sort_order: number
  status: string
  created_at: string
  updated_at: string
}

interface PerformanceCriteriaFormData {
  code: string
  name: string
  description?: string
  category?: string
  weight: number
  max_score: number
  sort_order?: number
  status?: string
}

interface PerformanceReview {
  id: string
  review_code: string
  employee_id: string
  reviewer_id?: string
  review_period: string
  review_type: string
  total_score?: number
  grade?: string
  status: string
  reviewer_comments?: string
  employee_comments?: string
  submitted_at?: string
  reviewed_at?: string
  created_at: string
  updated_at: string
}

interface PerformanceReviewFormData {
  employee_id: string
  reviewer_id?: string
  review_period: string
  review_type: string
  employee_comments?: string
}

interface _ReviewScore {
  id: string
  review_id: string
  criteria_id: string
  score: number
  weighted_score: number
  comments?: string
  created_at: string
}

interface PaginationParams {
  page: number
  pageSize: number
  search?: string
  status?: string
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
 
export const performanceService = {
  // ===== CRITERIA =====
  async getCriteria(params: PaginationParams): Promise<PaginatedResponse<PerformanceCriteria>> {
    const { page = 1, pageSize = 10, search, status } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
 
    let query = supabase
      .from('performance_criteria')
      .select('*', { count: 'exact' })
 
    if (status) query = query.eq('status', status)
    if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`)
 
    const { data, error, count } = await query
      .order('sort_order', { ascending: true })
      .range(from, to)
 
    if (error) throw error
 
    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },
 
  async getActiveCriteria(): Promise<PerformanceCriteria[]> {
    const { data, error } = await supabase
      .from('performance_criteria')
      .select('*')
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
 
    if (error) throw error
    return data || []
  },
 
  async createCriteria(formData: PerformanceCriteriaFormData): Promise<PerformanceCriteria> {
    const { data, error } = await supabase
      .from('performance_criteria')
      .insert(formData)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async updateCriteria(id: string, formData: Partial<PerformanceCriteriaFormData>): Promise<PerformanceCriteria> {
    const { data, error } = await supabase
      .from('performance_criteria')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async deleteCriteria(id: string): Promise<void> {
    const { error } = await supabase
      .from('performance_criteria')
      .delete()
      .eq('id', id)
 
    if (error) throw error
  },
 
  // ===== REVIEWS =====
  async getReviews(params: PaginationParams & { 
    employee_id?: string,
    reviewer_id?: string,
    period?: string 
  }): Promise<PaginatedResponse<PerformanceReview>> {
    const { page = 1, pageSize = 10, employee_id, reviewer_id, period, status } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
 
    let query = supabase
      .from('performance_reviews')
      .select(`
        *,
        employee:employees!performance_reviews_employee_id_fkey(id, code, full_name),
        reviewer:employees!performance_reviews_reviewer_id_fkey(id, full_name)
      `, { count: 'exact' })
 
    if (employee_id) query = query.eq('employee_id', employee_id)
    if (reviewer_id) query = query.eq('reviewer_id', reviewer_id)
    if (period) query = query.eq('review_period', period)
    if (status) query = query.eq('status', status)
 
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
 
    if (error) throw error
 
    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },
 
  async getReviewById(id: string): Promise<PerformanceReview> {
    const { data, error } = await supabase
      .from('performance_reviews')
      .select(`
        *,
        employee:employees!performance_reviews_employee_id_fkey(id, code, full_name),
        reviewer:employees!performance_reviews_reviewer_id_fkey(id, full_name),
        scores:review_scores(
          *,
          criteria:performance_criteria(*)
        )
      `)
      .eq('id', id)
      .single()
 
    if (error) throw error
    return data
  },
 
  async createReview(formData: PerformanceReviewFormData): Promise<PerformanceReview> {
    // Generate review code
    const year = new Date().getFullYear()
    const { data: existing } = await supabase
      .from('performance_reviews')
      .select('review_code')
      .ilike('review_code', `DG${year}%`)
      .order('review_code', { ascending: false })
      .limit(1)
 
    let reviewCode = `DG${year}-0001`
    if (existing && existing.length > 0) {
      const lastNum = parseInt(existing[0].review_code.slice(-4)) + 1
      reviewCode = `DG${year}-${String(lastNum).padStart(4, '0')}`
    }
 
    const { data, error } = await supabase
      .from('performance_reviews')
      .insert({ ...formData, review_code: reviewCode })
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async updateReview(id: string, formData: Partial<PerformanceReviewFormData>): Promise<PerformanceReview> {
    const { data, error } = await supabase
      .from('performance_reviews')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async submitReview(id: string): Promise<PerformanceReview> {
    const { data, error } = await supabase
      .from('performance_reviews')
      .update({ 
        status: 'submitted',
        submitted_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async saveScores(reviewId: string, scores: { criteria_id: string; score: number; comments?: string }[]): Promise<void> {
    // Xóa scores cũ
    await supabase.from('review_scores').delete().eq('review_id', reviewId)
 
    // Lấy criteria để tính weighted score
    const criteria = await this.getActiveCriteria()
    const criteriaMap = new Map(criteria.map(c => [c.id, c]))
 
    // Insert scores mới
    const scoresToInsert = scores.map(s => {
      const crit = criteriaMap.get(s.criteria_id)
      const weightedScore = crit ? (s.score / crit.max_score) * crit.weight : 0
      return {
        review_id: reviewId,
        criteria_id: s.criteria_id,
        score: s.score,
        weighted_score: weightedScore,
        comments: s.comments
      }
    })
 
    const { error } = await supabase
      .from('review_scores')
      .insert(scoresToInsert)
 
    if (error) throw error
 
    // Tính tổng điểm và xếp loại
    const totalScore = scoresToInsert.reduce((sum, s) => sum + (s.weighted_score || 0), 0)
    let grade = 'E'
    if (totalScore >= 90) grade = 'A'
    else if (totalScore >= 80) grade = 'B'
    else if (totalScore >= 70) grade = 'C'
    else if (totalScore >= 60) grade = 'D'
 
    await supabase
      .from('performance_reviews')
      .update({ total_score: totalScore, grade })
      .eq('id', reviewId)
  },
 
  async completeReview(id: string, reviewerId: string, comments: string): Promise<PerformanceReview> {
    const { data, error } = await supabase
      .from('performance_reviews')
      .update({ 
        status: 'reviewed',
        reviewer_id: reviewerId,
        reviewer_comments: comments,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  }
}

// ============================================================================
// PERFORMANCE DASHBOARD TYPES & SERVICE
// Aggregates task_evaluations + tasks for performance dashboard
// Grade: A(90+), B(75-89), C(60-74), D(40-59), F(<40)
// Final score = self × 40% + manager × 60%
// ============================================================================

export interface EmployeePerformance {
  employee_id: string;
  employee_name: string;
  department_name: string;
  department_id: string;
  avatar_url: string | null;
  total_tasks: number;
  completed_tasks: number;
  on_time_count: number;
  overdue_count: number;
  avg_self_score: number;
  avg_manager_score: number;
  final_score: number;
  on_time_rate: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface DepartmentPerformance {
  department_id: string;
  department_name: string;
  employee_count: number;
  avg_score: number;
  total_tasks: number;
  completed_tasks: number;
  on_time_rate: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface PerformanceKPIs {
  total_evaluated: number;
  avg_score: number;
  total_completed: number;
  on_time_rate: number;
  overdue_count: number;
  grade_distribution: { A: number; B: number; C: number; D: number; F: number };
}

export interface MonthlyTrend {
  month: string;
  avg_score: number;
  completed: number;
  on_time_rate: number;
}

export interface EmployeeTaskDetail {
  code: string;
  name: string;
  score: number;
  completed_date: string;
  on_time: boolean;
}

export interface EmployeeDetail {
  performance: EmployeePerformance;
  tasks: EmployeeTaskDetail[];
  trend: Array<{ month: string; score: number }>;
}

function calculateDashboardGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function getPeriodRange(period?: { month: number; year: number }): { from: string; to: string } {
  const now = new Date();
  const year = period?.year || now.getFullYear();
  const month = period?.month || (now.getMonth() + 1);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59`;
  return { from, to };
}

export const performanceDashboardService = {

  async getKPIs(period?: { month: number; year: number }): Promise<PerformanceKPIs> {
    try {
      const { from, to } = getPeriodRange(period);

      // ★ Lấy final_score trực tiếp từ tasks (không phụ thuộc task_evaluations)
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, status, due_date, assignee_id, completed_date, final_score, self_score, task_source')
        .eq('status', 'finished')
        .gte('completed_date', from)
        .lte('completed_date', to);

      if (tasksError) throw tasksError;

      // ★ Tính điểm weighted từ tasks.final_score + task_source
      // ★ Participants nhận điểm bằng assignee
      const evaluatedEmployees = new Set<string>();
      const employeeWeighted = new Map<string, { totalScore: number; totalWeight: number }>();

      // Fetch participants cho tất cả tasks
      const taskIds = (tasks || []).map((t: any) => t.id);
      let participantMap: Record<string, string[]> = {}; // taskId → [employeeIds]
      if (taskIds.length > 0) {
        const { data: assignments } = await supabase
          .from('task_assignments')
          .select('task_id, employee_id')
          .in('task_id', taskIds)
          .eq('role', 'participant')
          .eq('status', 'accepted');
        (assignments || []).forEach((a: any) => {
          if (!participantMap[a.task_id]) participantMap[a.task_id] = [];
          participantMap[a.task_id].push(a.employee_id);
        });
      }

      function addScore(empId: string, score: number, weight: number) {
        evaluatedEmployees.add(empId);
        if (!employeeWeighted.has(empId)) employeeWeighted.set(empId, { totalScore: 0, totalWeight: 0 });
        const emp = employeeWeighted.get(empId)!;
        emp.totalScore += score * weight;
        emp.totalWeight += weight;
      }

      (tasks || []).forEach((t: any) => {
        if (!t.assignee_id) return;
        const score = t.final_score || 0;
        if (score > 0) {
          const weight = t.task_source === 'recurring' ? 0.5 : t.task_source === 'self' ? 0.5 : 1.0;
          // Assignee
          addScore(t.assignee_id, score, weight);
          // Participants — cùng điểm, cùng weight
          const participants = participantMap[t.id] || [];
          participants.forEach(pid => addScore(pid, score, weight));
        }
      });

      const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      employeeWeighted.forEach(data => {
        const avg = data.totalWeight > 0 ? Math.round(data.totalScore / data.totalWeight) : 0;
        gradeDistribution[calculateDashboardGrade(avg)]++;
      });

      let onTimeCount = 0;
      let overdueCount = 0;
      (tasks || []).forEach(task => {
        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          dueDate.setHours(23, 59, 59, 999);
          const completedDate = task.completed_date ? new Date(task.completed_date) : new Date(to);
          if (completedDate <= dueDate) onTimeCount++;
          else overdueCount++;
        } else {
          onTimeCount++;
        }
      });

      const totalCompleted = (tasks || []).length;
      const empAvgs = Array.from(employeeWeighted.values()).map(d => d.totalWeight > 0 ? Math.round(d.totalScore / d.totalWeight) : 0);
      const avgScore = empAvgs.length > 0
        ? Math.round(empAvgs.reduce((a, b) => a + b, 0) / empAvgs.length)
        : 0;

      return {
        total_evaluated: evaluatedEmployees.size,
        avg_score: avgScore,
        total_completed: totalCompleted,
        on_time_rate: totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : 0,
        overdue_count: overdueCount,
        grade_distribution: gradeDistribution,
      };
    } catch (error) {
      console.error('Error fetching KPIs:', error);
      return {
        total_evaluated: 0, avg_score: 0, total_completed: 0,
        on_time_rate: 0, overdue_count: 0,
        grade_distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      };
    }
  },

  async getEmployeeRanking(params?: {
    department_id?: string; month?: number; year?: number; limit?: number;
  }): Promise<EmployeePerformance[]> {
    try {
      const period = params?.month && params?.year
        ? { month: params.month, year: params.year } : undefined;
      const { from, to } = getPeriodRange(period);

      let taskQuery = supabase
        .from('tasks')
        .select(`
          id, code, name, status, due_date, assignee_id, completed_date, task_source, final_score, self_score,
          assignee:employees!tasks_assignee_id_fkey (
            id, full_name, avatar_url, department_id,
            department:departments!employees_department_id_fkey (id, name)
          )
        `)
        .eq('status', 'finished')
        .gte('completed_date', from)
        .lte('completed_date', to);

      if (params?.department_id) {
        taskQuery = taskQuery.eq('department_id', params.department_id);
      }

      const { data: tasks, error: tasksError } = await taskQuery;
      if (tasksError) throw tasksError;
      if (!tasks || tasks.length === 0) return [];

      const taskIds = tasks.map(t => t.id);

      const { data: evaluations } = await supabase
        .from('task_evaluations')
        .select('task_id, score, employee_id')
        .in('task_id', taskIds);

      const { data: selfEvals } = await supabase
        .from('task_self_evaluations')
        .select('task_id, self_score, employee_id')
        .in('task_id', taskIds)
        .eq('status', 'approved');

      // Weight by task source: recurring/self=0.5, assigned/project=1.0
      function getTaskWeight(task: any): number {
        if (task.task_source === 'recurring') return 0.5;
        if (task.task_source === 'self') return 0.5;
        return 1.0; // assigned + project
      }

      const employeeMap = new Map<string, {
        employee_id: string; employee_name: string; avatar_url: string | null;
        department_name: string; department_id: string;
        total_tasks: number; completed_tasks: number;
        on_time_count: number; overdue_count: number;
        self_scores: number[]; manager_scores: number[];
        weighted_self_scores: { score: number; weight: number }[];
        weighted_manager_scores: { score: number; weight: number }[];
      }>();

      const evalMap = new Map<string, any>();
      (evaluations || []).forEach(e => evalMap.set(`${e.task_id}_${e.employee_id}`, e));
      const selfEvalMap = new Map<string, any>();
      (selfEvals || []).forEach(s => selfEvalMap.set(`${s.task_id}_${s.employee_id}`, s));

      tasks.forEach((task: any) => {
        const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;
        if (!assignee) return;
        const empId = assignee.id;
        const dept = Array.isArray(assignee.department) ? assignee.department[0] : assignee.department;

        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employee_id: empId,
            employee_name: assignee.full_name || '',
            avatar_url: assignee.avatar_url || null,
            department_name: dept?.name || '',
            department_id: assignee.department_id || dept?.id || '',
            total_tasks: 0, completed_tasks: 0,
            on_time_count: 0, overdue_count: 0,
            self_scores: [], manager_scores: [],
            weighted_self_scores: [], weighted_manager_scores: [],
          });
        }

        const emp = employeeMap.get(empId)!;
        emp.total_tasks++;
        emp.completed_tasks++;

        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          dueDate.setHours(23, 59, 59, 999);
          const completedDate = task.completed_date ? new Date(task.completed_date) : new Date();
          if (completedDate <= dueDate) emp.on_time_count++;
          else emp.overdue_count++;
        } else {
          emp.on_time_count++;
        }

        const evalKey = `${task.id}_${empId}`;
        const managerEval = evalMap.get(evalKey);
        const selfEval = selfEvalMap.get(evalKey);
        const weight = getTaskWeight(task);

        // ★ Ưu tiên: task.final_score (set bởi QuickEvalModal/auto-approve)
        //    Fallback: task_evaluations score
        //    Fallback: task.self_score
        const taskFinalScore = (task as any).final_score;
        const taskSelfScore = (task as any).self_score;

        if (taskFinalScore && taskFinalScore > 0) {
          // ★ Task đã có final_score → dùng trực tiếp (không áp công thức lần 2)
          const score = taskFinalScore;
          emp.manager_scores.push(score);
          emp.self_scores.push(score);
          emp.weighted_manager_scores.push({ score, weight });
          emp.weighted_self_scores.push({ score, weight });
        } else if (managerEval) {
          emp.manager_scores.push(managerEval.score);
          emp.self_scores.push(selfEval?.self_score || managerEval.score);
          emp.weighted_manager_scores.push({ score: managerEval.score, weight });
          emp.weighted_self_scores.push({ score: selfEval?.self_score || managerEval.score, weight });
        }
      });

      // ★ Participants nhận điểm bằng assignee
      if (taskIds.length > 0) {
        const { data: pAssignments } = await supabase
          .from('task_assignments')
          .select('task_id, employee_id, employee:employees!task_assignments_employee_id_fkey(id, full_name, avatar_url, department_id, department:departments!employees_department_id_fkey(id, name))')
          .in('task_id', taskIds)
          .eq('role', 'participant')
          .eq('status', 'accepted');

        (pAssignments || []).forEach((pa: any) => {
          const task = tasks.find((t: any) => t.id === pa.task_id);
          if (!task) return;
          const score = (task as any).final_score || 0;
          if (score <= 0) return;
          const weight = getTaskWeight(task);
          const emp = Array.isArray(pa.employee) ? pa.employee[0] : pa.employee;
          if (!emp) return;
          const dept = Array.isArray(emp.department) ? emp.department[0] : emp.department;
          const pid = emp.id;

          if (!employeeMap.has(pid)) {
            employeeMap.set(pid, {
              employee_id: pid, employee_name: emp.full_name || '', avatar_url: emp.avatar_url || null,
              department_name: dept?.name || '', department_id: emp.department_id || dept?.id || '',
              total_tasks: 0, completed_tasks: 0, on_time_count: 0, overdue_count: 0,
              self_scores: [], manager_scores: [], weighted_self_scores: [], weighted_manager_scores: [],
            });
          }
          const empData = employeeMap.get(pid)!;
          empData.total_tasks++;
          empData.completed_tasks++;
          empData.manager_scores.push(score);
          empData.self_scores.push(score);
          empData.weighted_manager_scores.push({ score, weight });
          empData.weighted_self_scores.push({ score, weight });
          // On-time check
          if (task.due_date) {
            const due = new Date(task.due_date); due.setHours(23, 59, 59, 999);
            const completed = task.completed_date ? new Date(task.completed_date) : new Date();
            if (completed <= due) empData.on_time_count++; else empData.overdue_count++;
          } else { empData.on_time_count++; }
        });
      }

      // ★ Fetch department baselines for volume scoring
      const deptIds = [...new Set(Array.from(employeeMap.values()).map(e => e.department_id).filter(Boolean))];
      const baselineMap = new Map<string, number>();
      if (deptIds.length > 0) {
        const { data: baselines } = await supabase
          .from('department_performance_baseline')
          .select('department_id, monthly_task_target')
          .in('department_id', deptIds);
        (baselines || []).forEach(b => baselineMap.set(b.department_id, b.monthly_task_target));
      }

      const result: EmployeePerformance[] = Array.from(employeeMap.values())
        .map(emp => {
          // ── Chất lượng: TB có trọng số từ final_score ──
          let totalWeightedManager = 0, totalManagerWeight = 0;
          emp.weighted_manager_scores.forEach(ws => {
            totalWeightedManager += ws.score * ws.weight;
            totalManagerWeight += ws.weight;
          });
          const qualityScore = totalManagerWeight > 0 ? Math.round(totalWeightedManager / totalManagerWeight) : 0;

          // ── Khối lượng: CV hoàn thành / kỳ vọng (tỷ lệ theo ngày trong tháng) ──
          const monthlyBaseline = baselineMap.get(emp.department_id) || 10;
          const now = new Date();
          const dayOfMonth = now.getDate();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const monthProgress = Math.max(0.1, dayOfMonth / daysInMonth); // tối thiểu 10%
          const expectedTasks = Math.max(1, Math.round(monthlyBaseline * monthProgress));
          const volumeScore = Math.min(100, Math.round((emp.completed_tasks / expectedTasks) * 100));

          // ── Công thức mới: CL×60% + KL×40% ──
          const finalScore = qualityScore > 0 || volumeScore > 0
            ? Math.round(qualityScore * 0.6 + volumeScore * 0.4) : 0;

          const onTimeRate = emp.completed_tasks > 0
            ? Math.round((emp.on_time_count / emp.completed_tasks) * 100) : 0;
          return {
            employee_id: emp.employee_id, employee_name: emp.employee_name,
            avatar_url: emp.avatar_url,
            department_name: emp.department_name, department_id: emp.department_id,
            total_tasks: emp.total_tasks, completed_tasks: emp.completed_tasks,
            on_time_count: emp.on_time_count, overdue_count: emp.overdue_count,
            avg_self_score: qualityScore, avg_manager_score: qualityScore,
            final_score: finalScore, on_time_rate: onTimeRate,
            grade: calculateDashboardGrade(finalScore),
          };
        })
        .sort((a, b) => b.final_score - a.final_score);

      return result.slice(0, params?.limit || 100);
    } catch (error) {
      console.error('Error fetching employee ranking:', error);
      return [];
    }
  },

  async getDepartmentComparison(period?: { month: number; year: number }): Promise<DepartmentPerformance[]> {
    try {
      const rankings = await performanceDashboardService.getEmployeeRanking({
        month: period?.month, year: period?.year, limit: 500,
      });

      const deptMap = new Map<string, {
        department_id: string; department_name: string;
        employees: Set<string>; scores: number[];
        total_tasks: number; completed_tasks: number; on_time_count: number;
      }>();

      rankings.forEach(emp => {
        const deptId = emp.department_id || 'unknown';
        if (!deptMap.has(deptId)) {
          deptMap.set(deptId, {
            department_id: deptId, department_name: emp.department_name || 'Không xác định',
            employees: new Set(), scores: [],
            total_tasks: 0, completed_tasks: 0, on_time_count: 0,
          });
        }
        const dept = deptMap.get(deptId)!;
        dept.employees.add(emp.employee_id);
        if (emp.final_score > 0) dept.scores.push(emp.final_score);
        dept.total_tasks += emp.total_tasks;
        dept.completed_tasks += emp.completed_tasks;
        dept.on_time_count += emp.on_time_count;
      });

      return Array.from(deptMap.values())
        .map(dept => {
          const avgScore = dept.scores.length > 0
            ? Math.round(dept.scores.reduce((a, b) => a + b, 0) / dept.scores.length) : 0;
          const onTimeRate = dept.completed_tasks > 0
            ? Math.round((dept.on_time_count / dept.completed_tasks) * 100) : 0;
          return {
            department_id: dept.department_id, department_name: dept.department_name,
            employee_count: dept.employees.size, avg_score: avgScore,
            total_tasks: dept.total_tasks, completed_tasks: dept.completed_tasks,
            on_time_rate: onTimeRate, grade: calculateDashboardGrade(avgScore),
          };
        })
        .sort((a, b) => b.avg_score - a.avg_score);
    } catch (error) {
      console.error('Error fetching department comparison:', error);
      return [];
    }
  },

  async getMonthlyTrend(months: number = 6): Promise<MonthlyTrend[]> {
    try {
      const result: MonthlyTrend[] = [];
      const now = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const { from, to } = getPeriodRange({ month, year });
        const monthLabel = `${String(month).padStart(2, '0')}/${year}`;

        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, due_date, completed_date')
          .eq('status', 'finished')
          .gte('updated_at', from)
          .lte('updated_at', to);

        const taskIds = (tasks || []).map(t => t.id);
        let avgScore = 0;
        if (taskIds.length > 0) {
          const { data: evals } = await supabase
            .from('task_evaluations')
            .select('score')
            .in('task_id', taskIds);
          if (evals && evals.length > 0) {
            avgScore = Math.round(evals.reduce((a, b) => a + b.score, 0) / evals.length);
          }
        }

        let onTimeCount = 0;
        (tasks || []).forEach(t => {
          if (t.due_date) {
            const due = new Date(t.due_date);
            due.setHours(23, 59, 59, 999);
            const completed = t.completed_date ? new Date(t.completed_date) : new Date();
            if (completed <= due) onTimeCount++;
          } else {
            onTimeCount++;
          }
        });

        result.push({
          month: monthLabel, avg_score: avgScore,
          completed: (tasks || []).length,
          on_time_rate: (tasks || []).length > 0
            ? Math.round((onTimeCount / (tasks || []).length) * 100) : 0,
        });
      }
      return result;
    } catch (error) {
      console.error('Error fetching monthly trend:', error);
      return [];
    }
  },

  async getEmployeeDetail(
    employeeId: string, period?: { month: number; year: number }
  ): Promise<EmployeeDetail | null> {
    try {
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select(`
          id, full_name, avatar_url, department_id,
          department:departments!employees_department_id_fkey (id, name)
        `)
        .eq('id', employeeId)
        .single();

      if (empError || !employee) return null;

      const { from, to } = getPeriodRange(period);
      const dept = Array.isArray((employee as any).department)
        ? (employee as any).department[0] : (employee as any).department;

      // ★ Dùng completed_date + tasks.final_score trực tiếp
      // ★ Bao gồm task là assignee HOẶC participant
      const { data: assignedTasks } = await supabase
        .from('tasks')
        .select('id, code, name, due_date, completed_date, task_source, self_score, final_score')
        .eq('status', 'finished')
        .eq('assignee_id', employeeId)
        .gte('completed_date', from)
        .lte('completed_date', to)
        .order('completed_date', { ascending: false });

      // Tìm thêm task mà employee là participant
      const { data: participatedAssignments } = await supabase
        .from('task_assignments')
        .select('task_id')
        .eq('employee_id', employeeId)
        .eq('role', 'participant')
        .eq('status', 'accepted');

      const participatedTaskIds = (participatedAssignments || []).map((a: any) => a.task_id);
      let participatedTasks: any[] = [];
      if (participatedTaskIds.length > 0) {
        const { data: ptasks } = await supabase
          .from('tasks')
          .select('id, code, name, due_date, completed_date, task_source, self_score, final_score')
          .eq('status', 'finished')
          .in('id', participatedTaskIds)
          .gte('completed_date', from)
          .lte('completed_date', to)
          .order('completed_date', { ascending: false });
        participatedTasks = ptasks || [];
      }

      // Merge + deduplicate
      const seenIds = new Set<string>();
      const tasks: any[] = [];
      for (const t of [...(assignedTasks || []), ...participatedTasks]) {
        if (!seenIds.has(t.id)) { seenIds.add(t.id); tasks.push(t); }
      }

      const taskDetails: EmployeeTaskDetail[] = [];
      let totalSelf = 0, selfCount = 0, totalWeighted = 0, totalWeight = 0;
      let onTimeCount = 0, overdueCount = 0;

      (tasks || []).forEach((task: any) => {
        const score = task.final_score || 0;
        const selfScore = task.self_score || 0;
        const weight = task.task_source === 'recurring' ? 0.5 : task.task_source === 'self' ? 0.5 : 1.0;

        let onTime = true;
        if (task.due_date) {
          const due = new Date(task.due_date);
          due.setHours(23, 59, 59, 999);
          const completed = task.completed_date ? new Date(task.completed_date) : new Date();
          onTime = completed <= due;
        }
        if (onTime) onTimeCount++; else overdueCount++;
        if (selfScore > 0) { totalSelf += selfScore; selfCount++; }
        if (score > 0) { totalWeighted += score * weight; totalWeight += weight; }

        taskDetails.push({
          code: task.code || '', name: task.name || '', score,
          completed_date: task.completed_date || '',
          on_time: onTime,
        });
      });

      const avgSelf = selfCount > 0 ? Math.round(totalSelf / selfCount) : 0;
      const avgManager = 0; // ★ Không tách manager nữa, dùng final_score trực tiếp
      const finalScore = totalWeight > 0 ? Math.round(totalWeighted / totalWeight) : 0;
      const completedTasks = (tasks || []).length;
      const onTimeRate = completedTasks > 0 ? Math.round((onTimeCount / completedTasks) * 100) : 0;

      // 6-month trend
      const trend: Array<{ month: string; score: number }> = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const mRange = getPeriodRange({ month: m, year: y });

        // ★ Dùng completed_date + final_score
        const { data: mTasks } = await supabase
          .from('tasks')
          .select('final_score, task_source')
          .eq('status', 'finished')
          .eq('assignee_id', employeeId)
          .gte('completed_date', mRange.from)
          .lte('completed_date', mRange.to)
          .not('final_score', 'is', null)
          .gt('final_score', 0);

        let mScore = 0;
        if (mTasks && mTasks.length > 0) {
          let tw = 0, ts = 0;
          mTasks.forEach((t: any) => {
            const w = t.task_source === 'recurring' ? 0.5 : t.task_source === 'self' ? 0.5 : 1.0;
            tw += (t.final_score || 0) * w; ts += w;
          });
          mScore = ts > 0 ? Math.round(tw / ts) : 0;
        }
        trend.push({ month: `${String(m).padStart(2, '0')}/${y}`, score: mScore });
      }

      return {
        performance: {
          employee_id: employeeId,
          employee_name: (employee as any).full_name || '',
          avatar_url: (employee as any).avatar_url || null,
          department_name: dept?.name || '',
          department_id: (employee as any).department_id || '',
          total_tasks: completedTasks, completed_tasks: completedTasks,
          on_time_count: onTimeCount, overdue_count: overdueCount,
          avg_self_score: avgSelf, avg_manager_score: avgManager,
          final_score: finalScore, on_time_rate: onTimeRate,
          grade: calculateDashboardGrade(finalScore),
        },
        tasks: taskDetails,
        trend,
      };
    } catch (error) {
      console.error('Error fetching employee detail:', error);
      return null;
    }
  },
};

export { calculateDashboardGrade };
export default performanceService