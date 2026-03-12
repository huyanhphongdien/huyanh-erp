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

export default performanceService