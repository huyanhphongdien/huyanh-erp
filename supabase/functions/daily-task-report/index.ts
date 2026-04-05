// =============================================================================
// EDGE FUNCTION: daily-task-report (v2 - FIXED)
// Sửa:
// 1. Điểm danh chỉ lấy bản ghi date = hôm nay (loại ca đêm hôm trước)
// 2. HTML mobile-first: layout 1 cột, font lớn hơn, không bị cắt
// 3. Dự án 0%: hiển thị cảnh báo "Chưa cập nhật tiến độ"
// 4. Thêm người nhận: trunglxh@huyanhrubber.com
// =============================================================================
// Deploy: npx supabase functions deploy daily-task-report --no-verify-jwt
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') || '029187c4-44dd-4da0-b3e1-9ebda8f90b1a'
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') || 'ee1377e6-b52c-4326-88f2-c18c3b59fded'
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') || Deno.env.get('MICROSOFT_CLIENT_SECRET') || ''
const SENDER_EMAIL = Deno.env.get('EMAIL_FROM') || Deno.env.get('AZURE_SENDER_EMAIL') || 'huyanhphongdien@huyanhrubber.com'

// ★ CHÍNH THỨC — 4 người nhận
const REPORT_RECIPIENTS = [
  { name: 'Lê Văn Huy', email: 'huylv@huyanhrubber.com', role: 'Giám đốc' },
  { name: 'Hồ Thị Thủy', email: 'thuyht@huyanhrubber.com', role: 'Trợ lý Ban Giám đốc' },
  { name: 'Lê Xuân Trung', email: 'trunglxh@huyanhrubber.com', role: 'Quản lý' },
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com', role: 'IT Manager' },
]

const APP_URL = 'https://huyanhrubber.vn'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Microsoft Graph ───────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  )
  if (!response.ok) throw new Error(`Token error: ${await response.text()}`)
  const data = await response.json()
  return data.access_token
}

async function sendEmail(
  token: string,
  recipients: Array<{ name: string; email: string }>,
  subject: string,
  htmlBody: string
): Promise<void> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: recipients.map((r) => ({
            emailAddress: { address: r.email, name: r.name },
          })),
        },
        saveToSentItems: true,
      }),
    }
  )
  if (!response.ok) throw new Error(`Send email error: ${await response.text()}`)
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface TaskReportData {
  total_tasks: number
  tasks_by_status: Record<string, number>
  tasks_by_priority: Record<string, number>
  new_tasks_today: number
  completed_today: number
  overdue_tasks: number
  pending_evaluations: number
  pending_approvals: number
  approved_today: number
  rejected_today: number
  departments: Array<{ name: string; total: number; in_progress: number; completed: number; overdue: number }>
  overdue_details: Array<{ code: string; name: string; assignee: string; department: string; due_date: string; days_overdue: number; priority: string }>
  new_today_details: Array<{ code: string; name: string; assignee: string; department: string; priority: string; due_date: string }>
  completed_today_details: Array<{ code: string; name: string; assignee: string; department: string; score: number | null }>
}

interface AttendanceReportData {
  total_employees: number
  checked_in: number
  not_checked_in: number
  checked_out: number
  late_count: number
  on_leave_count: number
  business_trip_count: number
  auto_accounting_count: number
  departments: Array<{ name: string; total: number; checked_in: number; not_checked_in: number; late: number }>
  late_details: Array<{ name: string; department: string; shift_name: string; check_in_time: string; late_minutes: number }>
  not_checked_in_details: Array<{ name: string; department: string; position: string }>
}

interface ProjectReportData {
  total_projects: number
  active_projects: number
  projects: Array<{
    code: string; name: string; status: string; priority: string
    progress_pct: number; owner: string; department: string
    planned_end: string; is_overdue: boolean; open_risks: number
    open_issues: number; phase_current: string
    needs_update: boolean  // ← MỚI: dự án 0% cảnh báo
  }>
  milestones_approaching: Array<{
    project_name: string; milestone_name: string; due_date: string
    days_remaining: number; assignee: string; status: string
  }>
}

// ── Interface hiệu suất ──────────────────────────────────────────────────────
interface PerformanceReportData {
  avg_score: number
  total_evaluated: number
  total_completed: number
  grade: string
  top_employees: Array<{ name: string; department: string; score: number; grade: string }>
  bottom_employees: Array<{ name: string; department: string; score: number; grade: string }>
  dept_scores: Array<{ name: string; score: number; grade: string; count: number }>
}

// ── Interface cảnh báo đơn hàng bán ──────────────────────────────────────────
interface SalesAlertData {
  lc_expiring: Array<{ code: string; customer: string; lc_number: string; lc_bank: string; expiry_date: string; days_left: number; amount: number }>
  delivery_overdue: Array<{ code: string; customer: string; grade: string; qty: number; etd: string; days_overdue: number }>
  payment_overdue: Array<{ code: string; customer: string; amount: number; delivery_date: string; days_overdue: number; payment_terms: string }>
  pending_drafts: Array<{ code: string; customer: string; grade: string; qty: number; created_at: string; days_pending: number }>
  total_alerts: number
}

// ── Interface so sánh hôm qua ────────────────────────────────────────────────
interface YesterdayData {
  attendance_checked_in: number
  attendance_late: number
  attendance_not_checked_in: number
  tasks_new: number
  tasks_completed: number
  tasks_overdue: number
  projects_avg_progress: number
}

// ── Lấy dữ liệu CÔNG VIỆC ─────────────────────────────────────────────────────
// ── Lấy dữ liệu HÔM QUA để so sánh ─────────────────────────────────────────
async function fetchYesterdayData(supabase: any): Promise<YesterdayData> {
  const todayVN = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = yesterdayDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
  const monthStart = yesterday.substring(0, 7) + '-01'

  const yStart = `${yesterday}T00:00:00+07:00`
  const yEnd   = `${yesterday}T23:59:59+07:00`

  // Điểm danh hôm qua — gọi RPC với report_date = yesterday
  let att_checked_in = 0, att_late = 0, att_not_checked_in = 0
  try {
    const { data: rpcY } = await supabase.rpc('get_daily_attendance_report', { report_date: yesterday })
    if (rpcY) {
      const ciY = rpcY.checked_in_details || []
      const empY = (rpcY.all_active_employees || []).filter((e: any) => !['Ban Giám đốc', 'Phòng Kế toán'].includes(e.department_name))
      const onLeaveY = new Set(rpcY.on_leave_ids || [])
      const ciIdsY = new Set(ciY.map((a: any) => a.employee_id))
      att_checked_in = ciY.length
      att_late = ciY.filter((a: any) => a.late_minutes && a.late_minutes > 0).length
      att_not_checked_in = empY.filter((e: any) => !ciIdsY.has(e.id) && !onLeaveY.has(e.id)).length
    }
  } catch (e) { console.warn('⚠️ yesterday attendance error:', e) }

  // Công việc hôm qua
  const { count: tasks_new } = await supabase.from('tasks').select('id', { count: 'exact', head: true })
    .neq('status', 'draft').gte('created_at', yStart).lte('created_at', yEnd)
  // ★ Dùng completed_date thay vì updated_at
  const { count: tasks_completed } = await supabase.from('tasks').select('id', { count: 'exact', head: true })
    .eq('status', 'finished').gte('completed_date', yesterday).lte('completed_date', yesterday)

  // Quá hạn hôm qua (tính đến cuối ngày hôm qua)
  const { data: allTasksY } = await supabase.from('tasks')
    .select('id, status, due_date').neq('status', 'draft')
  const tasks_overdue = (allTasksY || []).filter((t: any) =>
    t.due_date && t.due_date < yesterday && t.due_date >= monthStart &&
    !['finished', 'cancelled'].includes(t.status)
  ).length

  // Tiến độ trung bình dự án hôm qua (dùng updated_at để lấy snapshot gần nhất trước hôm nay)
  const { data: projY } = await supabase.from('projects')
    .select('progress_pct')
    .not('status', 'in', '(cancelled,completed)')
  const pcts = (projY || []).map((p: any) => Number(p.progress_pct) || 0)
  const projects_avg_progress = pcts.length > 0 ? Math.round(pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length) : 0

  return {
    attendance_checked_in: att_checked_in,
    attendance_late: att_late,
    attendance_not_checked_in: att_not_checked_in,
    tasks_new: tasks_new || 0,
    tasks_completed: tasks_completed || 0,
    tasks_overdue,
    projects_avg_progress,
  }
}

async function fetchTaskReportData(supabase: any): Promise<TaskReportData> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
  const todayStart = `${today}T00:00:00+07:00`
  const todayEnd = `${today}T23:59:59+07:00`
  const monthStart = today.substring(0, 7) + '-01'

  // ★ Chỉ lấy task tháng hiện tại
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('id, status, priority, department_id, due_date, created_at, evaluation_status, assignee_id')
    .neq('status', 'draft')
    .gte('created_at', `${monthStart}T00:00:00`)

  const tasks = allTasks || []
  const tasks_by_status: Record<string, number> = {}
  const tasks_by_priority: Record<string, number> = {}
  let overdue_tasks = 0

  for (const t of tasks) {
    tasks_by_status[t.status] = (tasks_by_status[t.status] || 0) + 1
    tasks_by_priority[t.priority || 'medium'] = (tasks_by_priority[t.priority || 'medium'] || 0) + 1
    if (t.due_date && t.due_date < today && t.due_date >= monthStart && !['finished', 'cancelled'].includes(t.status)) {
      overdue_tasks++
    }
  }

  const { data: newToday } = await supabase
    .from('tasks')
    .select(`id, code, name, priority, due_date, status, assignee_id,
      departments!tasks_department_id_fkey(name),
      assignee:employees!tasks_assignee_id_fkey(full_name)`)
    .neq('status', 'draft')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)
    .order('created_at', { ascending: false })

  const new_today_details = (newToday || []).map((t: any) => ({
    code: t.code || '',
    name: t.name || '',
    assignee: t.assignee?.full_name || 'Chưa giao',
    department: t.departments?.name || '',
    priority: t.priority || 'medium',
    due_date: t.due_date || '',
  }))

  // ★ Hoàn thành HÔM NAY: dùng completed_date (không phải updated_at)
  const { data: completedToday } = await supabase
    .from('tasks')
    .select(`id, code, name, status, assignee_id,
      departments!tasks_department_id_fkey(name),
      assignee:employees!tasks_assignee_id_fkey(full_name)`)
    .eq('status', 'finished')
    .gte('completed_date', today)
    .lte('completed_date', today)

  const completed_today_details = []
  for (const t of (completedToday || [])) {
    const { data: approval } = await supabase
      .from('task_approvals').select('approved_score')
      .eq('task_id', t.id).eq('status', 'approved').limit(1)
    completed_today_details.push({
      code: t.code || '', name: t.name || '',
      assignee: t.assignee?.full_name || '',
      department: t.departments?.name || '',
      score: approval?.[0]?.approved_score || null,
    })
  }

  const { data: overdueData } = await supabase
    .from('tasks')
    .select(`id, code, name, priority, due_date,
      departments!tasks_department_id_fkey(name),
      assignee:employees!tasks_assignee_id_fkey(full_name)`)
    .lt('due_date', today).gte('due_date', monthStart)
    .not('status', 'in', '(finished,cancelled)').neq('status', 'draft')
    .order('due_date', { ascending: true }).limit(20)

  const overdue_details = (overdueData || []).map((t: any) => {
    const days = Math.floor((new Date(today).getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24))
    return {
      code: t.code || '', name: t.name || '',
      assignee: t.assignee?.full_name || 'Chưa giao',
      department: t.departments?.name || '',
      due_date: t.due_date, days_overdue: days,
      priority: t.priority || 'medium',
    }
  })

  // ★ Chỉ tính trong tháng hiện tại
  const { count: pendingEvals } = await supabase.from('tasks').select('id', { count: 'exact', head: true })
    .eq('status', 'finished').in('evaluation_status', ['none', 'pending_self_eval'])
    .gte('created_at', `${monthStart}T00:00:00`)
  const { count: pendingApprovals } = await supabase.from('tasks').select('id', { count: 'exact', head: true })
    .eq('evaluation_status', 'pending_approval')
    .gte('created_at', `${monthStart}T00:00:00`)
  const { count: approvedToday } = await supabase.from('task_approvals').select('id', { count: 'exact', head: true })
    .eq('status', 'approved').gte('approved_at', todayStart).lte('approved_at', todayEnd)
  const { count: rejectedToday } = await supabase.from('task_approvals').select('id', { count: 'exact', head: true })
    .eq('status', 'rejected').gte('approved_at', todayStart).lte('approved_at', todayEnd)

  // ★ Chỉ lấy phòng active
  const { data: departments } = await supabase.from('departments').select('id, name').eq('status', 'active').order('name')
  const deptStats = []
  for (const dept of (departments || [])) {
    const deptTasks = tasks.filter((t: any) => t.department_id === dept.id)
    if (deptTasks.length === 0) continue
    deptStats.push({
      name: dept.name,
      total: deptTasks.length,
      in_progress: deptTasks.filter((t: any) => t.status === 'in_progress').length,
      completed: deptTasks.filter((t: any) => ['completed', 'finished'].includes(t.status)).length,
      overdue: deptTasks.filter((t: any) => t.due_date && t.due_date < today && t.due_date >= monthStart && !['finished', 'cancelled'].includes(t.status)).length,
    })
  }

  return {
    total_tasks: tasks.length, tasks_by_status, tasks_by_priority,
    new_tasks_today: newToday?.length || 0,
    completed_today: completedToday?.length || 0,
    overdue_tasks, pending_evaluations: pendingEvals || 0,
    pending_approvals: pendingApprovals || 0,
    approved_today: approvedToday || 0, rejected_today: rejectedToday || 0,
    departments: deptStats, overdue_details, new_today_details,
    completed_today_details,
  }
}

// ── Lấy dữ liệu ĐIỂM DANH ────────────────────────────────────────────────────
// FIX: Chỉ lấy bản ghi có work_date = hôm nay (không lấy ca đêm hôm trước)
async function fetchAttendanceReportData(supabase: any): Promise<AttendanceReportData> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_daily_attendance_report', {
    report_date: today,
  })

  if (rpcError) {
    console.error('📊 [attendance] RPC error:', rpcError)
    return {
      total_employees: 0, checked_in: 0, not_checked_in: 0,
      checked_out: 0, late_count: 0, on_leave_count: 0,
      departments: [], late_details: [], not_checked_in_details: [],
    }
  }

  const checkedInDetails = rpcData?.checked_in_details || []
  const allEmployees = rpcData?.all_active_employees || []
  const onLeaveIds = new Set(rpcData?.on_leave_ids || [])

  console.log(`📊 [attendance] RPC OK: ${checkedInDetails.length} check-in, ${allEmployees.length} employees, ${onLeaveIds.size} on leave`)

  const checkedInIds = new Set(checkedInDetails.map((a: any) => a.employee_id))
  const checkedOut = checkedInDetails.filter((a: any) => a.check_out_time).length
  // ★ Loại KT khỏi danh sách trễ
  const lateRecords = checkedInDetails.filter((a: any) => a.late_minutes && a.late_minutes > 0 && a.department_name !== 'Phòng Kế toán')

  // ★ Đếm công tác + KT tự động
  const { count: businessTripCount } = await supabase.from('attendance').select('id', { count: 'exact', head: true })
    .eq('date', today).eq('status', 'business_trip')
  const { count: autoAccountingCount } = await supabase.from('attendance').select('id', { count: 'exact', head: true })
    .eq('date', today).ilike('notes', '%Phòng Kế toán%')

  // ★ Bỏ BGĐ + Phòng Kế toán (KT tự động chấm công)
  const EXCLUDED_DEPT_NAMES = ['Ban Giám đốc', 'Phòng Kế toán']
  const workingEmployees = allEmployees.filter((e: any) => !EXCLUDED_DEPT_NAMES.includes(e.department_name))
  const notCheckedInEmployees = workingEmployees.filter((e: any) =>
    !checkedInIds.has(e.id) && !onLeaveIds.has(e.id)
  )

  const deptMap = new Map<string, any>()
  for (const emp of workingEmployees) {
    const deptName = emp.department_name || 'Không rõ'
    if (!deptMap.has(deptName)) {
      deptMap.set(deptName, { name: deptName, total: 0, checked_in: 0, not_checked_in: 0, late: 0 })
    }
    const dept = deptMap.get(deptName)!
    dept.total++
    if (checkedInIds.has(emp.id)) {
      dept.checked_in++
      const record = checkedInDetails.find((a: any) => a.employee_id === emp.id)
      if (record?.late_minutes > 0) dept.late++
    } else if (!onLeaveIds.has(emp.id)) {
      dept.not_checked_in++
    }
  }

  // ★ Thêm Phòng Kế toán = 100% (tự động chấm công)
  if (autoAccountingCount && autoAccountingCount > 0) {
    deptMap.set('Phòng Kế toán', { name: 'Phòng Kế toán', total: autoAccountingCount, checked_in: autoAccountingCount, not_checked_in: 0, late: 0 })
  }

  return {
    total_employees: workingEmployees.length,
    checked_in: checkedInDetails.length,
    not_checked_in: notCheckedInEmployees.length,
    checked_out: checkedOut,
    late_count: lateRecords.length,
    on_leave_count: onLeaveIds.size,
    business_trip_count: businessTripCount || 0,
    auto_accounting_count: autoAccountingCount || 0,
    departments: Array.from(deptMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    late_details: lateRecords.map((a: any) => ({
      name: a.full_name || 'N/A',
      department: a.department_name || '',
      shift_name: a.shift_name || '',
      check_in_time: a.check_in_time
        ? new Date(a.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
        : '',
      late_minutes: a.late_minutes || 0,
    })).sort((a: any, b: any) => b.late_minutes - a.late_minutes),
    not_checked_in_details: notCheckedInEmployees.map((e: any) => ({
      name: e.full_name || '', department: e.department_name || '', position: e.position_name || '',
    })).sort((a: any, b: any) => a.department.localeCompare(b.department)),
  }
}

// ── Lấy dữ liệu DỰ ÁN ────────────────────────────────────────────────────────
// ── Lấy dữ liệu HIỆU SUẤT ──────────────────────────────────────────────────
async function fetchPerformanceData(supabase: any): Promise<PerformanceReportData> {
  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
    const monthStart = today.substring(0, 7) + '-01'
    const monthEnd = today

    // Task finished trong tháng có final_score
    const { data: tasks } = await supabase
      .from('tasks')
      .select('assignee_id, final_score, task_source')
      .eq('status', 'finished')
      .not('final_score', 'is', null)
      .gt('final_score', 0)
      .gte('completed_date', monthStart)
      .lte('completed_date', monthEnd)

    // Lấy employee info
    const empIds = [...new Set((tasks || []).map((t: any) => t.assignee_id).filter(Boolean))]
    let empMap = new Map<string, { name: string; dept: string }>()
    if (empIds.length > 0) {
      const { data: emps } = await supabase.from('employees')
        .select('id, full_name, department:departments!employees_department_id_fkey(name)')
        .in('id', empIds)
      ;(emps || []).forEach((e: any) => {
        const dept = Array.isArray(e.department) ? e.department[0] : e.department
        empMap.set(e.id, { name: e.full_name, dept: dept?.name || '' })
      })
    }

    // Tính điểm TB theo NV (weighted by task_source)
    const empScores = new Map<string, { scores: number[]; weights: number[] }>()
    ;(tasks || []).forEach((t: any) => {
      if (!t.assignee_id || !t.final_score) return
      if (!empScores.has(t.assignee_id)) empScores.set(t.assignee_id, { scores: [], weights: [] })
      const w = t.task_source === 'recurring' ? 0.5 : t.task_source === 'self' ? 0.3 : 1.0
      empScores.get(t.assignee_id)!.scores.push(t.final_score)
      empScores.get(t.assignee_id)!.weights.push(w)
    })

    function getGrade(s: number) { return s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : s >= 40 ? 'D' : 'F' }

    const empResults: Array<{ id: string; name: string; dept: string; score: number; grade: string }> = []
    empScores.forEach((data, empId) => {
      let totalW = 0, totalS = 0
      data.scores.forEach((s, i) => { totalS += s * data.weights[i]; totalW += data.weights[i] })
      const avg = totalW > 0 ? Math.round(totalS / totalW) : 0
      const info = empMap.get(empId)
      empResults.push({ id: empId, name: info?.name || '', dept: info?.dept || '', score: avg, grade: getGrade(avg) })
    })
    empResults.sort((a, b) => b.score - a.score)

    // Dept aggregation
    const deptMap = new Map<string, { scores: number[]; name: string }>()
    empResults.forEach(e => {
      if (!deptMap.has(e.dept)) deptMap.set(e.dept, { name: e.dept, scores: [] })
      deptMap.get(e.dept)!.scores.push(e.score)
    })
    const deptScores = Array.from(deptMap.values()).map(d => {
      const avg = Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length)
      return { name: d.name, score: avg, grade: getGrade(avg), count: d.scores.length }
    }).sort((a, b) => b.score - a.score)

    const allScores = empResults.map(e => e.score)
    const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0

    return {
      avg_score: avgScore,
      total_evaluated: empResults.length,
      total_completed: (tasks || []).length,
      grade: getGrade(avgScore),
      top_employees: empResults.slice(0, 3).map(e => ({ name: e.name, department: e.dept, score: e.score, grade: e.grade })),
      bottom_employees: empResults.length > 3 ? empResults.slice(-3).reverse().map(e => ({ name: e.name, department: e.dept, score: e.score, grade: e.grade })) : [],
      dept_scores: deptScores,
    }
  } catch (err) {
    console.error('Performance data error:', err)
    return { avg_score: 0, total_evaluated: 0, total_completed: 0, grade: 'F', top_employees: [], bottom_employees: [], dept_scores: [] }
  }
}

async function fetchProjectReportData(supabase: any): Promise<ProjectReportData> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

  const { data: allProjects } = await supabase
    .from('projects')
    .select(`id, code, name, status, priority, progress_pct,
      planned_start, planned_end, owner_id, department_id,
      owner:employees!projects_owner_id_fkey(full_name),
      department:departments!projects_department_id_fkey(name)`)
    .not('status', 'in', '(cancelled)')
    .order('priority', { ascending: true })

  const projects = allProjects || []
  const activeProjects = projects.filter((p: any) =>
    ['planning', 'approved', 'in_progress', 'on_hold'].includes(p.status)
  )

  const projectDetails = []
  for (const p of activeProjects) {
    const { count: openRisks } = await supabase.from('project_risks').select('id', { count: 'exact', head: true })
      .eq('project_id', p.id).not('status', 'in', '(closed,resolved)')
    const { count: openIssues } = await supabase.from('project_issues').select('id', { count: 'exact', head: true })
      .eq('project_id', p.id).in('status', ['open', 'in_progress', 'escalated'])
    const { data: currentPhase } = await supabase.from('project_phases').select('name')
      .eq('project_id', p.id).eq('status', 'in_progress').limit(1)

    const progress = Number(p.progress_pct) || 0
    const isOverdue = p.planned_end && p.planned_end < today && p.status !== 'completed'
    // FIX: Cờ "cần cập nhật" nếu dự án đang chạy nhưng tiến độ = 0%
    const needsUpdate = progress === 0 && ['in_progress', 'approved'].includes(p.status)

    projectDetails.push({
      code: p.code || '', name: p.name || '', status: p.status,
      priority: p.priority || 'medium', progress_pct: progress,
      owner: p.owner?.full_name || 'Chưa giao',
      department: p.department?.name || '',
      planned_end: p.planned_end || '',
      is_overdue: isOverdue, open_risks: openRisks || 0,
      open_issues: openIssues || 0,
      phase_current: currentPhase?.[0]?.name || '—',
      needs_update: needsUpdate,
    })
  }

  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekStr = nextWeek.toISOString().split('T')[0]

  const { data: upcomingMilestones } = await supabase
    .from('project_milestones')
    .select(`id, name, due_date, status, assignee_id,
      project:projects(name),
      assignee:employees!project_milestones_assignee_id_fkey(full_name)`)
    .gte('due_date', today).lte('due_date', nextWeekStr)
    .in('status', ['pending', 'approaching'])
    .order('due_date', { ascending: true }).limit(10)

  const milestones_approaching = (upcomingMilestones || []).map((m: any) => {
    const daysRemaining = Math.ceil((new Date(m.due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
    return {
      project_name: m.project?.name || '', milestone_name: m.name || '',
      due_date: m.due_date, days_remaining: daysRemaining,
      assignee: m.assignee?.full_name || 'Chưa giao', status: m.status,
    }
  })

  return {
    total_projects: projects.length, active_projects: activeProjects.length,
    projects: projectDetails, milestones_approaching,
  }
}

// ── HTML Mobile-First Template ─────────────────────────────────────────────────
// FIX: Layout 1 cột, tối ưu cho màn hình điện thoại, không bị cắt
// ── Lấy dữ liệu CẢNH BÁO ĐƠN HÀNG BÁN ─────────────────────────────────────
async function fetchSalesAlerts(supabase: any): Promise<SalesAlertData> {
  const now = new Date()
  const result: SalesAlertData = { lc_expiring: [], delivery_overdue: [], payment_overdue: [], pending_drafts: [], total_alerts: 0 }

  try {
    // 1. LC sắp hết hạn (< 7 ngày)
    const sevenDaysLater = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]
    const { data: lcOrders } = await supabase
      .from('sales_orders')
      .select('code, lc_number, lc_bank, lc_expiry_date, lc_amount, total_value_usd, customer:sales_customers!customer_id(name, short_name)')
      .not('lc_number', 'is', null)
      .neq('lc_number', '')
      .lte('lc_expiry_date', sevenDaysLater)
      .not('payment_status', 'eq', 'paid')

    for (const o of (lcOrders || [])) {
      const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const daysLeft = Math.ceil((new Date(o.lc_expiry_date).getTime() - now.getTime()) / 86400000)
      result.lc_expiring.push({
        code: o.code, customer: customer?.short_name || customer?.name || '-',
        lc_number: o.lc_number, lc_bank: o.lc_bank || '-',
        expiry_date: o.lc_expiry_date, days_left: daysLeft,
        amount: o.lc_amount || o.total_value_usd || 0,
      })
    }

    // 2. Giao hàng trễ hạn (ETD đã qua nhưng chưa shipped)
    const todayStr = now.toISOString().split('T')[0]
    const { data: lateOrders } = await supabase
      .from('sales_orders')
      .select('code, grade, quantity_tons, etd, customer:sales_customers!customer_id(name, short_name)')
      .in('status', ['confirmed', 'producing', 'ready', 'packing'])
      .lt('etd', todayStr)
      .not('etd', 'is', null)

    for (const o of (lateOrders || [])) {
      const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const daysOver = Math.ceil((now.getTime() - new Date(o.etd).getTime()) / 86400000)
      result.delivery_overdue.push({
        code: o.code, customer: customer?.short_name || customer?.name || '-',
        grade: o.grade?.replace('_', ' ') || '-', qty: o.quantity_tons || 0,
        etd: o.etd, days_overdue: daysOver,
      })
    }

    // 3. Thanh toán quá hạn (> 30 ngày sau giao hàng, chưa trả)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
    const { data: unpaidOrders } = await supabase
      .from('sales_orders')
      .select('code, total_value_usd, delivery_date, payment_terms, customer:sales_customers!customer_id(name, short_name)')
      .in('status', ['shipped', 'delivered', 'invoiced'])
      .in('payment_status', ['unpaid', 'partial'])
      .lt('delivery_date', thirtyDaysAgo)
      .not('delivery_date', 'is', null)

    for (const o of (unpaidOrders || [])) {
      const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const daysOver = Math.ceil((now.getTime() - new Date(o.delivery_date).getTime()) / 86400000)
      result.payment_overdue.push({
        code: o.code, customer: customer?.short_name || customer?.name || '-',
        amount: o.total_value_usd || 0, delivery_date: o.delivery_date,
        days_overdue: daysOver, payment_terms: o.payment_terms || '-',
      })
    }

    // 4. Đơn hàng pending > 3 ngày
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString()
    const { data: draftOrders } = await supabase
      .from('sales_orders')
      .select('code, grade, quantity_tons, created_at, customer:sales_customers!customer_id(name, short_name)')
      .eq('status', 'draft')
      .lt('created_at', threeDaysAgo)

    for (const o of (draftOrders || [])) {
      const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const daysPending = Math.ceil((now.getTime() - new Date(o.created_at).getTime()) / 86400000)
      result.pending_drafts.push({
        code: o.code, customer: customer?.short_name || customer?.name || '-',
        grade: o.grade?.replace('_', ' ') || '-', qty: o.quantity_tons || 0,
        created_at: o.created_at, days_pending: daysPending,
      })
    }

    result.total_alerts = result.lc_expiring.length + result.delivery_overdue.length + result.payment_overdue.length + result.pending_drafts.length
  } catch (e) {
    console.error('fetchSalesAlerts error:', e)
  }
  return result
}

function buildEmailHTML(
  taskData: TaskReportData,
  attendanceData: AttendanceReportData,
  projectData: ProjectReportData,
  performanceData: PerformanceReportData,
  yesterdayData: YesterdayData,
  salesAlerts: SalesAlertData,
  recipientName: string
): string {
  const today = new Date()
  const dateStr = today.toLocaleDateString('vi-VN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  })

  const priorityLabels: Record<string, string> = {
    urgent: '🔴 Khẩn cấp', high: '🟠 Cao', medium: '🟡 TB', low: '🟢 Thấp',
  }
  const priorityColors: Record<string, string> = {
    urgent: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#16A34A',
  }

  const attendanceRate = attendanceData.total_employees > 0
    ? Math.round((attendanceData.checked_in / attendanceData.total_employees) * 100) : 0
  const attendanceRateColor = attendanceRate >= 90 ? '#16A34A' : attendanceRate >= 70 ? '#D97706' : '#DC2626'

  // ── Helper so sánh % thay đổi so hôm qua ──
  // lowerIsBetter: trễ/vắng/quá hạn thì giảm = tốt (xanh)
  const delta = (now: number, prev: number, lowerIsBetter = false) => {
    if (prev === 0 && now === 0) return '<span style="font-size:10px;color:#9CA3AF;">= hôm qua</span>'
    if (prev === 0) return '<span style="font-size:10px;color:#9CA3AF;">Mới hôm nay</span>'
    const pct = Math.round(((now - prev) / prev) * 100)
    if (pct === 0) return '<span style="font-size:10px;color:#9CA3AF;">= hôm qua</span>'
    const better = lowerIsBetter ? pct < 0 : pct > 0
    const arrow = pct > 0 ? '▲' : '▼'
    const color = better ? '#16A34A' : '#DC2626'
    const sign  = pct > 0 ? '+' : ''
    return `<span style="font-size:10px;color:${color};font-weight:600;">${arrow} ${sign}${pct}%</span>`
  }
  // deltaPct: dùng cho chỉ số đã là % (tiến độ dự án)
  const deltaPct = (now: number, prev: number, lowerIsBetter = false) => {
    const diff = now - prev
    if (diff === 0) return '<span style="font-size:10px;color:#9CA3AF;">= hôm qua</span>'
    const better = lowerIsBetter ? diff < 0 : diff > 0
    const arrow = diff > 0 ? '▲' : '▼'
    const color = better ? '#16A34A' : '#DC2626'
    const sign  = diff > 0 ? '+' : ''
    return `<span style="font-size:10px;color:${color};font-weight:600;">${arrow} ${sign}${diff} điểm%</span>`
  }

  // ── Section header helper ──
  const sectionHeader = (icon: string, title: string) => `
    <div style="background:#1B4D3E;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;margin-top:24px;">
      <p style="margin:0;font-size:15px;font-weight:700;">${icon} ${title}</p>
    </div>`

  // ── Stat card — dùng 2 cột trên mobile ──
  const statGrid = (items: Array<{ label: string; value: string | number; color: string; bg: string }>) => {
    const cells = items.map(it => `
      <td width="${Math.floor(100/items.length)}%" style="padding:12px 4px;text-align:center;background:${it.bg};">
        <div style="font-size:24px;font-weight:700;color:${it.color};">${it.value}</div>
        <div style="font-size:11px;color:#6B7280;margin-top:2px;line-height:1.3;">${it.label}</div>
      </td>`).join('')
    return `<table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E5E7EB;border-top:none;">
      <tr>${cells}</tr></table>`
  }

  // ── ĐIỂM DANH THEO PHÒNG BAN (1 cột, không table ngang) ──
  const attendanceDeptBlock = attendanceData.departments.map(d => {
    const rate = d.total > 0 ? Math.round((d.checked_in / d.total) * 100) : 0
    const barColor = rate >= 90 ? '#16A34A' : rate >= 70 ? '#D97706' : '#DC2626'
    return `
    <div style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:600;color:#1B4D3E;">${d.name}</span>
        <span style="font-size:13px;font-weight:700;color:${barColor};">${rate}%</span>
      </div>
      <div style="background:#E5E7EB;border-radius:3px;height:5px;margin:5px 0;">
        <div style="background:${barColor};border-radius:3px;height:5px;width:${Math.min(rate,100)}%;"></div>
      </div>
      <table width="100%" cellspacing="0"><tr>
        <td style="font-size:11px;color:#374151;">Tổng: <strong>${d.total}</strong></td>
        <td style="font-size:11px;color:#16A34A;">✅ ${d.checked_in}</td>
        <td style="font-size:11px;color:${d.not_checked_in > 0 ? '#DC2626' : '#9CA3AF'};">❌ ${d.not_checked_in}</td>
        <td style="font-size:11px;color:${d.late > 0 ? '#D97706' : '#9CA3AF'};">⏰ ${d.late}</td>
      </tr></table>
    </div>`
  }).join('')

  // ── ĐI TRỄ ──
  const lateBlock = attendanceData.late_details.slice(0, 15).map(l => `
    <div style="padding:8px 0;border-bottom:1px solid #FEF3C7;">
      <div style="font-size:13px;font-weight:600;color:#92400E;">${l.name}
        <span style="font-weight:400;color:#D97706;"> — Trễ ${l.late_minutes} phút</span>
      </div>
      <div style="font-size:11px;color:#9CA3AF;margin-top:2px;">${l.department} | Ca: ${l.shift_name} | Vào: ${l.check_in_time}</div>
    </div>`).join('')

  // ── CHƯA CHECK-IN ──
  const notCheckedInBlock = attendanceData.not_checked_in_details.slice(0, 20).map(n => `
    <div style="padding:7px 0;border-bottom:1px solid #FEE2E2;">
      <div style="font-size:13px;font-weight:600;color:#991B1B;">${n.name}</div>
      <div style="font-size:11px;color:#9CA3AF;margin-top:2px;">${n.department} | ${n.position}</div>
    </div>`).join('')

  // ── CÔNG VIỆC QUÁ HẠN ──
  const overdueBlock = taskData.overdue_details.map(t => `
    <div style="padding:8px 0;border-bottom:1px solid #FEE2E2;">
      <div style="font-size:12px;font-weight:700;color:#1B4D3E;">${t.code}
        <span style="font-weight:400;color:#DC2626;"> — Quá ${t.days_overdue} ngày</span>
      </div>
      <div style="font-size:13px;color:#374151;margin:2px 0;">${t.name}</div>
      <div style="font-size:11px;color:#9CA3AF;">${t.assignee} | ${t.department}
        <span style="color:${priorityColors[t.priority] || '#D97706'};"> | ${priorityLabels[t.priority] || t.priority}</span>
      </div>
    </div>`).join('')

  // ── CÔNG VIỆC MỚI ──
  const newTodayBlock = taskData.new_today_details.map(t => `
    <div style="padding:8px 0;border-bottom:1px solid #FEF3C7;">
      <div style="font-size:12px;font-weight:700;color:#1B4D3E;">${t.code}</div>
      <div style="font-size:13px;color:#374151;margin:2px 0;">${t.name}</div>
      <div style="font-size:11px;color:#9CA3AF;">${t.assignee} | ${t.department}
        <span style="color:${priorityColors[t.priority] || '#D97706'};"> | ${priorityLabels[t.priority] || t.priority}</span>
        ${t.due_date ? ` | Hạn: ${t.due_date}` : ''}
      </div>
    </div>`).join('')

  // ── HOÀN THÀNH HÔM NAY ──
  const completedBlock = taskData.completed_today_details.map(t => `
    <div style="padding:8px 0;border-bottom:1px solid #D1FAE5;">
      <div style="font-size:12px;font-weight:700;color:#1B4D3E;">${t.code}
        ${t.score !== null ? `<span style="font-weight:400;color:#16A34A;"> — ${t.score}/10 điểm</span>` : ''}
      </div>
      <div style="font-size:13px;color:#374151;margin:2px 0;">${t.name}</div>
      <div style="font-size:11px;color:#9CA3AF;">${t.assignee} | ${t.department}</div>
    </div>`).join('')

  // ── CÔNG VIỆC THEO PHÒNG BAN ──
  const deptTaskBlock = taskData.departments.map(d => {
    const rate = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0
    return `
    <div style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:13px;font-weight:600;color:#1B4D3E;">${d.name}</span>
        <span style="font-size:12px;color:#6B7280;">HT: ${rate}%</span>
      </div>
      <table width="100%" cellspacing="0" style="margin-top:4px;"><tr>
        <td style="font-size:11px;color:#374151;">Tổng: <strong>${d.total}</strong></td>
        <td style="font-size:11px;color:#2563EB;">🔄 ${d.in_progress}</td>
        <td style="font-size:11px;color:#16A34A;">✅ ${d.completed}</td>
        <td style="font-size:11px;color:${d.overdue > 0 ? '#DC2626' : '#9CA3AF'};">⚠️ ${d.overdue}</td>
      </tr></table>
    </div>`
  }).join('')

  // ── DỰ ÁN ──
  const projectBlock = projectData.projects.map(p => {
    const progressColor = p.progress_pct >= 80 ? '#16A34A' : p.progress_pct >= 50 ? '#D97706' : '#DC2626'
    const statusLabels: Record<string, string> = {
      planning: '📋 Lập kế hoạch', approved: '✅ Đã duyệt',
      in_progress: '🔄 Đang chạy', on_hold: '⏸️ Tạm dừng',
    }
    return `
    <div style="padding:12px;margin-bottom:8px;border:1px solid #E5E7EB;border-radius:8px;background:#FAFAFA;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div>
          <span style="font-size:12px;font-weight:700;color:#1B4D3E;">${p.code}</span>
          ${p.is_overdue ? '<span style="font-size:11px;color:#DC2626;font-weight:600;"> ⚠️ QUÁ HẠN</span>' : ''}
          ${p.needs_update ? '<span style="font-size:11px;color:#D97706;font-weight:600;"> 📝 CHƯA CẬP NHẬT</span>' : ''}
        </div>
        <div style="font-size:18px;font-weight:700;color:${progressColor};">${p.progress_pct}%</div>
      </div>
      <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px;">${p.name}</div>
      <div style="background:#E5E7EB;border-radius:4px;height:6px;margin-bottom:8px;">
        <div style="background:${progressColor};border-radius:4px;height:6px;width:${Math.min(p.progress_pct, 100)}%;"></div>
      </div>
      <table width="100%" cellspacing="0"><tr>
        <td style="font-size:11px;color:#6B7280;">${statusLabels[p.status] || p.status}</td>
        <td style="font-size:11px;color:#6B7280;text-align:right;">${p.phase_current}</td>
      </tr><tr>
        <td style="font-size:11px;color:#9CA3AF;">👤 ${p.owner} • ${p.department}</td>
        <td style="font-size:11px;color:${p.is_overdue ? '#DC2626' : '#9CA3AF'};text-align:right;">📅 ${p.planned_end || '—'}</td>
      </tr></table>
      ${(p.open_risks > 0 || p.open_issues > 0) ? `
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #E5E7EB;">
        ${p.open_risks > 0 ? `<span style="font-size:11px;color:#DC2626;margin-right:12px;">⚡ ${p.open_risks} rủi ro</span>` : ''}
        ${p.open_issues > 0 ? `<span style="font-size:11px;color:#D97706;">🔧 ${p.open_issues} vấn đề</span>` : ''}
      </div>` : ''}
      ${p.needs_update ? `
      <div style="margin-top:6px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:4px;padding:6px 8px;">
        <p style="margin:0;font-size:11px;color:#92400E;">⚠️ Dự án đang chạy nhưng tiến độ chưa được cập nhật (0%). Đề nghị cập nhật tiến độ thực tế.</p>
      </div>` : ''}
    </div>`
  }).join('')

  // ── MILESTONES SẮP ĐẾN HẠN ──
  const milestoneBlock = projectData.milestones_approaching.map(m => `
    <div style="padding:8px 0;border-bottom:1px solid #FEF3C7;">
      <div style="font-size:12px;color:#9CA3AF;">${m.project_name}</div>
      <div style="font-size:13px;font-weight:600;color:#374151;margin:2px 0;">${m.milestone_name}</div>
      <div style="font-size:11px;color:#9CA3AF;">${m.assignee} | Hạn: ${m.due_date}
        <span style="color:${m.days_remaining <= 2 ? '#DC2626' : '#D97706'};font-weight:600;"> — còn ${m.days_remaining} ngày</span>
      </div>
    </div>`).join('')

  // ── Build trạng thái tasks ──
  const statusLabels: Record<string, string> = {
    todo: 'Chờ làm', in_progress: 'Đang làm', completed: 'Chờ duyệt',
    finished: 'Hoàn thành', cancelled: 'Đã hủy', on_hold: 'Tạm dừng',
  }
  const statusColors: Record<string, string> = {
    todo: '#6B7280', in_progress: '#2563EB', completed: '#D97706',
    finished: '#16A34A', cancelled: '#9CA3AF', on_hold: '#7C3AED',
  }

  const taskStatusBlock = Object.entries(taskData.tasks_by_status)
    .filter(([, count]) => count > 0)
    .sort(([,a],[,b]) => (b as number) - (a as number))
    .map(([status, count]) => {
      const pct = taskData.total_tasks > 0 ? Math.round((count as number) / taskData.total_tasks * 100) : 0
      const color = statusColors[status] || '#6B7280'
      return `
    <div style="display:flex;align-items:center;margin-bottom:7px;">
      <div style="width:90px;font-size:12px;color:#374151;flex-shrink:0;">${statusLabels[status] || status}</div>
      <div style="flex:1;background:#E5E7EB;border-radius:4px;height:10px;margin:0 8px;">
        <div style="background:${color};border-radius:4px;height:10px;width:${pct}%;"></div>
      </div>
      <div style="font-size:12px;font-weight:700;color:${color};width:40px;text-align:right;">${count}</div>
      <div style="font-size:11px;color:#9CA3AF;width:32px;text-align:right;">${pct}%</div>
    </div>`}).join('')

  const priorityLabelsFull: Record<string, string> = {
    urgent: '🔴 Khẩn cấp', high: '🟠 Cao', medium: '🟡 Trung bình', low: '🟢 Thấp',
  }
  const taskPriorityBlock = Object.entries(taskData.tasks_by_priority)
    .filter(([, count]) => count > 0)
    .sort(([a],[b]) => {
      const order = ['urgent','high','medium','low']
      return order.indexOf(a) - order.indexOf(b)
    })
    .map(([priority, count]) => {
      const color = priorityColors[priority] || '#6B7280'
      const pct = taskData.total_tasks > 0 ? Math.round((count as number) / taskData.total_tasks * 100) : 0
      return `
    <div style="display:flex;align-items:center;margin-bottom:7px;">
      <div style="width:110px;font-size:12px;color:#374151;flex-shrink:0;">${priorityLabelsFull[priority] || priority}</div>
      <div style="flex:1;background:#E5E7EB;border-radius:4px;height:10px;margin:0 8px;">
        <div style="background:${color};border-radius:4px;height:10px;width:${pct}%;"></div>
      </div>
      <div style="font-size:12px;font-weight:700;color:${color};width:40px;text-align:right;">${count}</div>
      <div style="font-size:11px;color:#9CA3AF;width:32px;text-align:right;">${pct}%</div>
    </div>`}).join('')

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#1B4D3E 0%,#2D8B6E 100%);padding:20px 16px;">
    <p style="color:#fff;margin:0;font-size:18px;font-weight:700;">📊 Báo cáo Tổng hợp Hằng ngày</p>
    <p style="color:#A7F3D0;margin:4px 0 0;font-size:12px;">${dateStr}</p>
    <p style="color:#6EE7B7;margin:2px 0 0;font-size:11px;">HUY ANH RUBBER — ERP System</p>
  </div>

  <div style="padding:16px;">
    <p style="color:#374151;font-size:13px;margin:0 0 16px;">
      Kính gửi <strong>${recipientName}</strong>,<br>
      Báo cáo tổng hợp hôm nay — dữ liệu thống kê trong tháng ${new Date().toLocaleDateString('vi-VN', { month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })}:
    </p>

    <!-- ═══════════════════════════════════════════════════ -->
    <!-- PHẦN 1: ĐIỂM DANH                                   -->
    <!-- ═══════════════════════════════════════════════════ -->
    ${sectionHeader('🕐', 'Điểm danh hôm nay')}

    <!-- 5 chỉ số tổng quan -->
    <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E5E7EB;border-top:none;">
      <tr>
        <td width="20%" style="padding:12px 4px;text-align:center;background:#F0FDF4;">
          <div style="font-size:26px;font-weight:700;color:#16A34A;">${attendanceData.checked_in}</div>
          <div style="font-size:10px;color:#6B7280;margin-top:2px;line-height:1.3;">Đã<br>check-in</div>
          <div style="margin-top:4px;">${delta(attendanceData.checked_in, yesterdayData.attendance_checked_in)}</div>
        </td>
        <td width="20%" style="padding:12px 4px;text-align:center;background:#FEF2F2;">
          <div style="font-size:26px;font-weight:700;color:#DC2626;">${attendanceData.not_checked_in}</div>
          <div style="font-size:10px;color:#6B7280;margin-top:2px;line-height:1.3;">Chưa<br>check-in</div>
          <div style="margin-top:4px;">${delta(attendanceData.not_checked_in, yesterdayData.attendance_not_checked_in, true)}</div>
        </td>
        <td width="20%" style="padding:12px 4px;text-align:center;background:#FFFBEB;">
          <div style="font-size:26px;font-weight:700;color:#D97706;">${attendanceData.late_count}</div>
          <div style="font-size:10px;color:#6B7280;margin-top:2px;line-height:1.3;">Đi<br>trễ</div>
          <div style="margin-top:4px;">${delta(attendanceData.late_count, yesterdayData.attendance_late, true)}</div>
        </td>
        <td width="20%" style="padding:12px 4px;text-align:center;background:#EFF6FF;">
          <div style="font-size:26px;font-weight:700;color:#2563EB;">${attendanceData.checked_out}</div>
          <div style="font-size:10px;color:#6B7280;margin-top:2px;line-height:1.3;">Đã<br>check-out</div>
        </td>
        <td width="20%" style="padding:12px 4px;text-align:center;background:#F9FAFB;">
          <div style="font-size:26px;font-weight:700;color:${attendanceRateColor};">${attendanceRate}%</div>
          <div style="font-size:10px;color:#6B7280;margin-top:2px;line-height:1.3;">Tỷ lệ<br>đi làm</div>
        </td>
      </tr>
    </table>

    <!-- Tóm tắt nhanh -->
    <div style="background:#F8FAFC;border-radius:0 0 8px 8px;padding:10px 12px;border:1px solid #E5E7EB;border-top:none;margin-bottom:16px;">
      <table width="100%" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#6B7280;">Tổng NV (trừ BGĐ+KT): <strong style="color:#374151;">${attendanceData.total_employees}</strong></td>
          <td style="font-size:12px;color:#6B7280;text-align:right;">Nghỉ phép: <strong style="color:#7C3AED;">${attendanceData.on_leave_count}</strong></td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#0EA5E9;padding-top:4px;">✈️ Công tác: <strong>${attendanceData.business_trip_count}</strong></td>
          <td style="font-size:12px;color:#059669;text-align:right;padding-top:4px;">🏦 KT (tự động): <strong>${attendanceData.auto_accounting_count}</strong></td>
        </tr>
      </table>
    </div>

    <!-- Điểm danh theo phòng ban -->
    <div style="margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1B4D3E;">🏢 Theo Phòng ban</p>
      ${attendanceDeptBlock}
    </div>

    <!-- Đi trễ -->
    ${attendanceData.late_details.length > 0 ? `
    <div style="margin-bottom:12px;background:#FFFBEB;border-radius:8px;padding:12px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#D97706;">⏰ Nhân viên đi trễ (${attendanceData.late_count} người)</p>
      ${lateBlock}
    </div>` : ''}

    <!-- Chưa check-in -->
    ${attendanceData.not_checked_in_details.length > 0 ? `
    <div style="margin-bottom:12px;background:#FEF2F2;border-radius:8px;padding:12px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#DC2626;">❌ Chưa check-in (${attendanceData.not_checked_in} người)</p>
      ${notCheckedInBlock}
    </div>` : `
    <div style="margin-bottom:12px;background:#F0FDF4;border-radius:8px;padding:10px;text-align:center;">
      <p style="margin:0;color:#16A34A;font-size:13px;font-weight:600;">✅ Tất cả nhân viên đã check-in</p>
    </div>`}

    <!-- ═══════════════════════════════════════════════════ -->
    <!-- PHẦN 2: CÔNG VIỆC                                   -->
    <!-- ═══════════════════════════════════════════════════ -->
    ${sectionHeader('📋', 'Công việc hôm nay')}

    <!-- 4 chỉ số tổng quan -->
    <!-- Task stat row với delta -->
    <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E5E7EB;border-top:none;margin-bottom:0;">
      <tr>
        <td width="25%" style="padding:12px 4px;text-align:center;background:#EFF6FF;">
          <div style="font-size:24px;font-weight:700;color:#1D4ED8;">${taskData.total_tasks}</div>
          <div style="font-size:10px;color:#6B7280;line-height:1.3;">Tổng<br>công việc</div>
        </td>
        <td width="25%" style="padding:12px 4px;text-align:center;background:#F0FDF4;">
          <div style="font-size:24px;font-weight:700;color:#16A34A;">${taskData.completed_today}</div>
          <div style="font-size:10px;color:#6B7280;line-height:1.3;">Hoàn thành<br>hôm nay</div>
          <div style="margin-top:3px;">${delta(taskData.completed_today, yesterdayData.tasks_completed)}</div>
        </td>
        <td width="25%" style="padding:12px 4px;text-align:center;background:#FFFBEB;">
          <div style="font-size:24px;font-weight:700;color:#D97706;">${taskData.new_tasks_today}</div>
          <div style="font-size:10px;color:#6B7280;line-height:1.3;">Giao mới<br>hôm nay</div>
          <div style="margin-top:3px;">${delta(taskData.new_tasks_today, yesterdayData.tasks_new)}</div>
        </td>
        <td width="25%" style="padding:12px 4px;text-align:center;background:${taskData.overdue_tasks > 0 ? '#FEF2F2' : '#F9FAFB'};">
          <div style="font-size:24px;font-weight:700;color:${taskData.overdue_tasks > 0 ? '#DC2626' : '#6B7280'};">${taskData.overdue_tasks}</div>
          <div style="font-size:10px;color:#6B7280;line-height:1.3;">Quá<br>hạn</div>
          <div style="margin-top:3px;">${delta(taskData.overdue_tasks, yesterdayData.tasks_overdue, true)}</div>
        </td>
      </tr>
    </table>

    <!-- Đánh giá & Phê duyệt -->
    <div style="margin-top:12px;background:#F8FAFC;border-radius:8px;padding:12px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1B4D3E;">📋 Đánh giá & Phê duyệt</p>
      <table width="100%" cellspacing="0"><tr>
        <td style="font-size:12px;color:#6B7280;padding:3px 0;">⏳ Chờ tự đánh giá: <strong style="color:#D97706;">${taskData.pending_evaluations}</strong></td>
        <td style="font-size:12px;color:#6B7280;padding:3px 0;">🔍 Chờ phê duyệt: <strong style="color:#2563EB;">${taskData.pending_approvals}</strong></td>
      </tr><tr>
        <td style="font-size:12px;color:#6B7280;padding:3px 0;">✅ Đã duyệt hôm nay: <strong style="color:#16A34A;">${taskData.approved_today}</strong></td>
        <td style="font-size:12px;color:#6B7280;padding:3px 0;">❌ Từ chối: <strong style="color:#DC2626;">${taskData.rejected_today}</strong></td>
      </tr></table>
    </div>

    <!-- CV theo phòng ban -->
    ${taskData.departments.length > 0 ? `
    <div style="margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1B4D3E;">🏢 Công việc theo Phòng ban</p>
      ${deptTaskBlock}
    </div>` : ''}

    <!-- Quá hạn -->
    ${taskData.overdue_details.length > 0 ? `
    <div style="margin-bottom:12px;background:#FEF2F2;border-radius:8px;padding:12px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#DC2626;">⚠️ Công việc quá hạn (${taskData.overdue_details.length})</p>
      ${overdueBlock}
    </div>` : `
    <div style="margin-bottom:12px;background:#F0FDF4;border-radius:8px;padding:10px;text-align:center;">
      <p style="margin:0;color:#16A34A;font-size:13px;font-weight:600;">✅ Không có công việc quá hạn trong tháng</p>
    </div>`}

    <!-- Giao mới hôm nay -->
    ${taskData.new_today_details.length > 0 ? `
    <div style="margin-bottom:12px;background:#FFFBEB;border-radius:8px;padding:12px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#D97706;">📝 Giao mới hôm nay (${taskData.new_today_details.length})</p>
      ${newTodayBlock}
    </div>` : `
    <div style="margin-bottom:12px;background:#F9FAFB;border-radius:8px;padding:10px;text-align:center;">
      <p style="margin:0;color:#9CA3AF;font-size:12px;">Hôm nay không có công việc mới được giao</p>
    </div>`}

    <!-- Hoàn thành hôm nay -->
    ${taskData.completed_today_details.length > 0 ? `
    <div style="margin-bottom:12px;background:#F0FDF4;border-radius:8px;padding:12px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#16A34A;">✅ Hoàn thành hôm nay (${taskData.completed_today_details.length})</p>
      ${completedBlock}
    </div>` : `
    <div style="margin-bottom:12px;background:#F9FAFB;border-radius:8px;padding:10px;text-align:center;">
      <p style="margin:0;color:#9CA3AF;font-size:12px;">Hôm nay chưa có công việc nào hoàn thành</p>
    </div>`}

    <!-- ═══════════════════════════════════════════════════ -->
    <!-- PHẦN 3: HIỆU SUẤT                                   -->
    <!-- ═══════════════════════════════════════════════════ -->
    ${performanceData.total_evaluated > 0 ? `
    ${sectionHeader('📈', 'Hiệu suất tháng')}

    <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E5E7EB;border-top:none;">
      <tr>
        <td width="33%" style="padding:12px 4px;text-align:center;background:#F0FDF4;">
          <div style="font-size:28px;font-weight:700;color:#1B4D3E;">${performanceData.avg_score}</div>
          <div style="font-size:10px;color:#6B7280;">Điểm TB</div>
        </td>
        <td width="33%" style="padding:12px 4px;text-align:center;background:#EFF6FF;">
          <div style="font-size:28px;font-weight:700;color:#2563EB;">${performanceData.total_evaluated}</div>
          <div style="font-size:10px;color:#6B7280;">NV được đánh giá</div>
        </td>
        <td width="33%" style="padding:12px 4px;text-align:center;background:#F9FAFB;">
          <div style="font-size:28px;font-weight:700;color:${performanceData.grade === 'A' ? '#16A34A' : performanceData.grade === 'B' ? '#2563EB' : '#D97706'};">Hạng ${performanceData.grade}</div>
          <div style="font-size:10px;color:#6B7280;">Xếp hạng chung</div>
        </td>
      </tr>
    </table>

    ${performanceData.top_employees.length > 0 ? `
    <div style="margin-top:12px;background:#F0FDF4;border-radius:8px;padding:12px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#16A34A;">🏆 Top NV xuất sắc</p>
      ${performanceData.top_employees.map((e, i) => `
        <div style="padding:6px 0;border-bottom:1px solid #D1FAE5;">
          <span style="font-size:13px;font-weight:600;color:#1B4D3E;">${['🥇','🥈','🥉'][i] || ''} ${e.name}</span>
          <span style="float:right;font-size:13px;font-weight:700;color:${e.score >= 90 ? '#16A34A' : '#2563EB'};">${e.score}đ (${e.grade})</span>
          <div style="font-size:11px;color:#9CA3AF;">${e.department}</div>
        </div>`).join('')}
    </div>` : ''}

    ${performanceData.bottom_employees.length > 0 ? `
    <div style="margin-top:8px;background:#FEF2F2;border-radius:8px;padding:12px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#DC2626;">⚠️ NV cần cải thiện</p>
      ${performanceData.bottom_employees.map(e => `
        <div style="padding:6px 0;border-bottom:1px solid #FEE2E2;">
          <span style="font-size:13px;font-weight:600;color:#374151;">${e.name}</span>
          <span style="float:right;font-size:13px;font-weight:700;color:${e.score < 60 ? '#DC2626' : '#D97706'};">${e.score}đ (${e.grade})</span>
          <div style="font-size:11px;color:#9CA3AF;">${e.department}</div>
        </div>`).join('')}
    </div>` : ''}

    ${performanceData.dept_scores.length > 0 ? `
    <div style="margin-top:8px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1B4D3E;">🏢 Hiệu suất theo Phòng ban</p>
      ${performanceData.dept_scores.map(d => {
        const barColor = d.score >= 80 ? '#16A34A' : d.score >= 60 ? '#D97706' : '#DC2626'
        return `
        <div style="padding:8px 0;border-bottom:1px solid #F3F4F6;">
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:13px;font-weight:600;color:#1B4D3E;">${d.name}</span>
            <span style="font-size:13px;font-weight:700;color:${barColor};">${d.score}đ (${d.grade})</span>
          </div>
          <div style="background:#E5E7EB;border-radius:3px;height:5px;margin:4px 0;">
            <div style="background:${barColor};border-radius:3px;height:5px;width:${Math.min(d.score,100)}%;"></div>
          </div>
          <div style="font-size:11px;color:#9CA3AF;">${d.count} NV được đánh giá</div>
        </div>`
      }).join('')}
    </div>` : ''}
    ` : ''}

    ${salesAlerts.total_alerts > 0 ? `
    ${sectionHeader('🚨', 'Cảnh báo Đơn hàng Bán')}

    ${salesAlerts.lc_expiring.length > 0 ? `
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#DC2626;">🔴 LC sắp hết hạn (${salesAlerts.lc_expiring.length})</p>
      ${salesAlerts.lc_expiring.map(lc => `
        <div style="padding:8px 10px;margin-bottom:4px;background:#FEF2F2;border-radius:6px;border-left:3px solid #DC2626;">
          <div style="font-size:13px;font-weight:600;color:#991B1B;">${lc.code} — ${lc.customer}</div>
          <div style="font-size:12px;color:#7F1D1D;">LC: ${lc.lc_number} | NH: ${lc.lc_bank} | $${lc.amount.toLocaleString()}</div>
          <div style="font-size:12px;font-weight:700;color:#DC2626;">⏰ ${lc.days_left <= 0 ? 'ĐÃ HẾT HẠN' : `Còn ${lc.days_left} ngày`} (${lc.expiry_date})</div>
        </div>
      `).join('')}
    </div>` : ''}

    ${salesAlerts.delivery_overdue.length > 0 ? `
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#EA580C;">🟠 Giao hàng trễ hạn (${salesAlerts.delivery_overdue.length})</p>
      ${salesAlerts.delivery_overdue.map(o => `
        <div style="padding:8px 10px;margin-bottom:4px;background:#FFF7ED;border-radius:6px;border-left:3px solid #EA580C;">
          <div style="font-size:13px;font-weight:600;color:#9A3412;">${o.code} — ${o.customer}</div>
          <div style="font-size:12px;color:#7C2D12;">${o.grade} | ${o.qty}T | ETD: ${o.etd}</div>
          <div style="font-size:12px;font-weight:700;color:#EA580C;">⚠️ Trễ ${o.days_overdue} ngày</div>
        </div>
      `).join('')}
    </div>` : ''}

    ${salesAlerts.payment_overdue.length > 0 ? `
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#D97706;">🟡 Thanh toán quá hạn > 30 ngày (${salesAlerts.payment_overdue.length})</p>
      ${salesAlerts.payment_overdue.map(o => `
        <div style="padding:8px 10px;margin-bottom:4px;background:#FFFBEB;border-radius:6px;border-left:3px solid #D97706;">
          <div style="font-size:13px;font-weight:600;color:#92400E;">${o.code} — ${o.customer}</div>
          <div style="font-size:12px;color:#78350F;">$${o.amount.toLocaleString()} | ${o.payment_terms} | Giao: ${o.delivery_date}</div>
          <div style="font-size:12px;font-weight:700;color:#D97706;">💰 Quá hạn ${o.days_overdue} ngày</div>
        </div>
      `).join('')}
    </div>` : ''}

    ${salesAlerts.pending_drafts.length > 0 ? `
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#6B7280;">⬜ Đơn hàng Draft > 3 ngày (${salesAlerts.pending_drafts.length})</p>
      ${salesAlerts.pending_drafts.map(o => `
        <div style="padding:6px 10px;margin-bottom:4px;background:#F9FAFB;border-radius:6px;border-left:3px solid #9CA3AF;">
          <div style="font-size:12px;color:#374151;">${o.code} — ${o.customer} | ${o.grade} ${o.qty}T | Pending ${o.days_pending} ngày</div>
        </div>
      `).join('')}
    </div>` : ''}
    ` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin:20px 0 8px;">
      <a href="${APP_URL}" style="display:inline-block;background:#1B4D3E;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
        🔗 Truy cập hệ thống ERP
      </a>
    </div>
  </div>

  <!-- FOOTER -->
  <div style="background:#F9FAFB;padding:12px 16px;border-top:1px solid #E5E7EB;">
    <p style="margin:0;font-size:10px;color:#9CA3AF;text-align:center;">
      Email tự động từ Huy Anh ERP — Gửi lúc 17:30 hằng ngày<br>
      Liên hệ IT: minhld@huyanhrubber.com
    </p>
  </div>

</div>
</body>
</html>`
}

// ── Main Handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    console.log('📊 [daily-task-report] Starting...')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const [taskData, attendanceData, projectData, performanceData, yesterdayData, salesAlerts, accessToken] = await Promise.all([
      fetchTaskReportData(supabase),
      fetchAttendanceReportData(supabase),
      fetchProjectReportData(supabase),
      fetchPerformanceData(supabase),
      fetchYesterdayData(supabase),
      fetchSalesAlerts(supabase),
      getAccessToken(),
    ])

    const todayLabel = new Date().toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
    })

    for (const recipient of REPORT_RECIPIENTS) {
      console.log(`📧 Sending to ${recipient.name}...`)
      const overdueTag = taskData.overdue_tasks > 0 ? `⚠️ ${taskData.overdue_tasks} quá hạn` : '✅ Tốt'
      const attendanceTag = attendanceData.late_count > 0 ? `⏰ ${attendanceData.late_count} trễ` : '✅ Đầy đủ'
      const salesTag = salesAlerts.total_alerts > 0 ? ` | 🚨 ${salesAlerts.total_alerts} cảnh báo bán` : ''
      const subject = `📊 Báo cáo ${todayLabel} — ${overdueTag} | ${attendanceTag}${salesTag} | Huy Anh ERP`
      const html = buildEmailHTML(taskData, attendanceData, projectData, performanceData, yesterdayData, salesAlerts, recipient.name)
      await sendEmail(accessToken, [recipient], subject, html)
      console.log(`✅ Sent to ${recipient.email}`)
    }

    // Ghi log
    try {
      await supabase.from('email_notifications').insert({
        recipient_email: REPORT_RECIPIENTS.map((r) => r.email).join(', '),
        notification_type: 'daily_report',
        subject: `Báo cáo ${todayLabel}`,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    } catch (logErr) {
      console.warn('⚠️ Could not log:', logErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipients: REPORT_RECIPIENTS.map((r) => r.email),
        summary: {
          attendance: { total: attendanceData.total_employees, checked_in: attendanceData.checked_in, late: attendanceData.late_count },
          tasks: { total: taskData.total_tasks, overdue: taskData.overdue_tasks, completed_today: taskData.completed_today },
          projects: { active: projectData.active_projects, needs_update: projectData.projects.filter(p => p.needs_update).length },
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('❌ [daily-task-report] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})