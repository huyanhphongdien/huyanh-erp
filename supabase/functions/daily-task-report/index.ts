// =============================================================================
// EDGE FUNCTION: daily-task-report
// Gửi báo cáo tổng hợp công việc + điểm danh hằng ngày lúc 17:30 VN
// =============================================================================
// Deploy: npx supabase functions deploy daily-task-report --no-verify-jwt
// Schedule: pg_cron chạy lúc 10:30 UTC (= 17:30 VN)
// Test:   curl -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/daily-task-report" -H "Content-Type: application/json" -d "{}"
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') || '029187c4-44dd-4da0-b3e1-9ebda8f90b1a'
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') || 'ee1377e6-b52c-4326-88f2-c18c3b59fded'
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') || Deno.env.get('MICROSOFT_CLIENT_SECRET') || ''
const SENDER_EMAIL = Deno.env.get('EMAIL_FROM') || Deno.env.get('AZURE_SENDER_EMAIL') || 'huyanhphongdien@huyanhrubber.com'

// ★ CHÍNH THỨC — Gửi cho 3 người
const REPORT_RECIPIENTS = [
  { name: 'Lê Văn Huy', email: 'huylv@huyanhrubber.com', role: 'Giám đốc' },
  { name: 'Hồ Thị Thủy', email: 'thuyht@huyanhrubber.com', role: 'Trợ lý Ban Giám đốc' },
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com', role: 'IT Manager' },
]

const APP_URL = 'https://huyanhrubber.vn'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Microsoft Graph API ──────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token error: ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

async function sendEmail(
  token: string,
  recipients: Array<{ name: string; email: string }>,
  subject: string,
  htmlBody: string
): Promise<void> {
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`

  const message = {
    message: {
      subject,
      body: { contentType: 'HTML', content: htmlBody },
      toRecipients: recipients.map((r) => ({
        emailAddress: { address: r.email, name: r.name },
      })),
    },
    saveToSentItems: true,
  }

  const response = await fetch(graphUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Send email error: ${error}`)
  }
}

// ── Interfaces ───────────────────────────────────────────────────────────────

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
  departments: Array<{
    name: string
    total: number
    in_progress: number
    completed: number
    overdue: number
  }>
  overdue_details: Array<{
    code: string
    name: string
    assignee: string
    department: string
    due_date: string
    days_overdue: number
    priority: string
  }>
  new_today_details: Array<{
    code: string
    name: string
    assignee: string
    department: string
    priority: string
    due_date: string
  }>
  completed_today_details: Array<{
    code: string
    name: string
    assignee: string
    department: string
    score: number | null
  }>
}

interface AttendanceReportData {
  total_employees: number
  checked_in: number
  not_checked_in: number
  checked_out: number
  late_count: number
  on_leave_count: number
  departments: Array<{
    name: string
    total: number
    checked_in: number
    not_checked_in: number
    late: number
  }>
  late_details: Array<{
    name: string
    department: string
    shift_name: string
    check_in_time: string
    late_minutes: number
  }>
  not_checked_in_details: Array<{
    name: string
    department: string
    position: string
  }>
}

interface ProjectReportData {
  total_projects: number
  active_projects: number
  projects: Array<{
    code: string
    name: string
    status: string
    priority: string
    progress_pct: number
    owner: string
    department: string
    planned_end: string
    is_overdue: boolean
    open_risks: number
    open_issues: number
    phase_current: string
  }>
  milestones_approaching: Array<{
    project_name: string
    milestone_name: string
    due_date: string
    days_remaining: number
    assignee: string
    status: string
  }>
}

// ── Lấy dữ liệu CÔNG VIỆC ──────────────────────────────────────────────────

async function fetchTaskReportData(supabase: any): Promise<TaskReportData> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) // YYYY-MM-DD
  const todayStart = `${today}T00:00:00+07:00`
  const todayEnd = `${today}T23:59:59+07:00`
  const monthStart = today.substring(0, 7) + '-01' // YYYY-MM-01

  // 1. Tổng quan tasks (không tính draft)
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('id, status, priority, department_id, due_date, created_at, evaluation_status, assignee_id')
    .neq('status', 'draft')

  const tasks = allTasks || []

  const tasks_by_status: Record<string, number> = {}
  const tasks_by_priority: Record<string, number> = {}
  let overdue_tasks = 0

  for (const t of tasks) {
    tasks_by_status[t.status] = (tasks_by_status[t.status] || 0) + 1
    tasks_by_priority[t.priority || 'medium'] = (tasks_by_priority[t.priority || 'medium'] || 0) + 1
    // Chỉ tính quá hạn trong tháng hiện tại
    if (t.due_date && t.due_date < today && t.due_date >= monthStart && !['finished', 'cancelled'].includes(t.status)) {
      overdue_tasks++
    }
  }

  // 2. Công việc mới hôm nay — join luôn assignee + department
  const { data: newToday } = await supabase
    .from('tasks')
    .select(`
      id, code, name, priority, due_date, status, assignee_id,
      departments!tasks_department_id_fkey(name),
      assignee:employees!tasks_assignee_id_fkey(full_name)
    `)
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

  // 3. Công việc hoàn thành hôm nay
  const { data: completedToday } = await supabase
    .from('tasks')
    .select(`
      id, code, name, status, assignee_id,
      departments!tasks_department_id_fkey(name),
      assignee:employees!tasks_assignee_id_fkey(full_name)
    `)
    .eq('status', 'finished')
    .gte('updated_at', todayStart)
    .lte('updated_at', todayEnd)

  const completed_today_details = []
  for (const t of (completedToday || [])) {
    const { data: approval } = await supabase
      .from('task_approvals')
      .select('approved_score')
      .eq('task_id', t.id)
      .eq('status', 'approved')
      .limit(1)

    completed_today_details.push({
      code: t.code || '',
      name: t.name || '',
      assignee: t.assignee?.full_name || '',
      department: t.departments?.name || '',
      score: approval?.[0]?.approved_score || null,
    })
  }

  // 4. Overdue details — chỉ trong tháng hiện tại
  const { data: overdueData } = await supabase
    .from('tasks')
    .select(`
      id, code, name, priority, due_date,
      departments!tasks_department_id_fkey(name),
      assignee:employees!tasks_assignee_id_fkey(full_name)
    `)
    .lt('due_date', today)
    .gte('due_date', monthStart)
    .not('status', 'in', '(finished,cancelled)')
    .neq('status', 'draft')
    .order('due_date', { ascending: true })
    .limit(20)

  const overdue_details = (overdueData || []).map((t: any) => {
    const dueDate = new Date(t.due_date)
    const todayDate = new Date(today)
    const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    return {
      code: t.code || '',
      name: t.name || '',
      assignee: t.assignee?.full_name || 'Chưa giao',
      department: t.departments?.name || '',
      due_date: t.due_date,
      days_overdue: daysOverdue,
      priority: t.priority || 'medium',
    }
  })

  // 5. Pending evaluations & approvals
  const { count: pendingEvals } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .or('evaluation_status.is.null,evaluation_status.eq.not_started')

  const { count: pendingApprovals } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('evaluation_status', 'pending_approval')

  // 6. Approved/Rejected today
  const { count: approvedToday } = await supabase
    .from('task_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .gte('approved_at', todayStart)
    .lte('approved_at', todayEnd)

  const { count: rejectedToday } = await supabase
    .from('task_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'rejected')
    .gte('approved_at', todayStart)
    .lte('approved_at', todayEnd)

  // 7. Theo phòng ban
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .order('name')

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
    total_tasks: tasks.length,
    tasks_by_status,
    tasks_by_priority,
    new_tasks_today: newToday?.length || 0,
    completed_today: completedToday?.length || 0,
    overdue_tasks,
    pending_evaluations: pendingEvals || 0,
    pending_approvals: pendingApprovals || 0,
    approved_today: approvedToday || 0,
    rejected_today: rejectedToday || 0,
    departments: deptStats,
    overdue_details,
    new_today_details,
    completed_today_details: completed_today_details,
  }
}

// ── Lấy dữ liệu ĐIỂM DANH ──────────────────────────────────────────────────

async function fetchAttendanceReportData(supabase: any): Promise<AttendanceReportData> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

  // Gọi RPC function — SQL join chắc chắn hoạt động
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
  const lateRecords = checkedInDetails.filter((a: any) => a.late_minutes && a.late_minutes > 0)

  const workingEmployees = allEmployees.filter((e: any) => e.department_name !== 'Ban Giám đốc')
  const totalWorking = workingEmployees.length

  const notCheckedInEmployees = workingEmployees.filter((e: any) =>
    !checkedInIds.has(e.id) && !onLeaveIds.has(e.id)
  )

  const deptMap = new Map<string, { name: string; total: number; checked_in: number; not_checked_in: number; late: number }>()

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

  const late_details = lateRecords.map((a: any) => {
    const checkInTime = a.check_in_time
      ? new Date(a.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
      : ''
    return {
      name: a.full_name || 'N/A',
      department: a.department_name || '',
      shift_name: a.shift_name || '',
      check_in_time: checkInTime,
      late_minutes: a.late_minutes || 0,
    }
  }).sort((a: any, b: any) => b.late_minutes - a.late_minutes)

  const not_checked_in_details = notCheckedInEmployees.map((e: any) => ({
    name: e.full_name || '',
    department: e.department_name || '',
    position: e.position_name || '',
  })).sort((a: any, b: any) => (a.department || '').localeCompare(b.department || ''))

  return {
    total_employees: totalWorking,
    checked_in: checkedInDetails.length,
    not_checked_in: notCheckedInEmployees.length,
    checked_out: checkedOut,
    late_count: lateRecords.length,
    on_leave_count: onLeaveIds.size,
    departments: Array.from(deptMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    late_details,
    not_checked_in_details,
  }
}

// ── Lấy dữ liệu DỰ ÁN ───────────────────────────────────────────────────────

async function fetchProjectReportData(supabase: any): Promise<ProjectReportData> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

  // 1. Tất cả dự án đang active (không phải draft, cancelled, completed)
  const { data: allProjects } = await supabase
    .from('projects')
    .select(`
      id, code, name, status, priority, progress_pct,
      planned_start, planned_end,
      owner_id, department_id,
      owner:employees!projects_owner_id_fkey(full_name),
      department:departments!projects_department_id_fkey(name)
    `)
    .not('status', 'in', '(cancelled)')
    .order('priority', { ascending: true })

  const projects = allProjects || []
  const activeProjects = projects.filter((p: any) => 
    ['planning', 'approved', 'in_progress', 'on_hold'].includes(p.status)
  )

  // 2. Lấy risks + issues count cho mỗi dự án active
  const projectDetails = []
  for (const p of activeProjects) {
    // Risks mở
    const { count: openRisks } = await supabase
      .from('project_risks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', p.id)
      .not('status', 'in', '(closed,resolved)')

    // Issues mở
    const { count: openIssues } = await supabase
      .from('project_issues')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', p.id)
      .in('status', ['open', 'in_progress', 'escalated'])

    // Phase hiện tại (in_progress)
    const { data: currentPhase } = await supabase
      .from('project_phases')
      .select('name')
      .eq('project_id', p.id)
      .eq('status', 'in_progress')
      .limit(1)

    const isOverdue = p.planned_end && p.planned_end < today && p.status !== 'completed'

    projectDetails.push({
      code: p.code || '',
      name: p.name || '',
      status: p.status,
      priority: p.priority || 'medium',
      progress_pct: Number(p.progress_pct) || 0,
      owner: p.owner?.full_name || 'Chưa giao',
      department: p.department?.name || '',
      planned_end: p.planned_end || '',
      is_overdue: isOverdue,
      open_risks: openRisks || 0,
      open_issues: openIssues || 0,
      phase_current: currentPhase?.[0]?.name || '—',
    })
  }

  // 3. Milestones sắp đến hạn (trong 7 ngày tới)
  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekStr = nextWeek.toISOString().split('T')[0]

  const { data: upcomingMilestones } = await supabase
    .from('project_milestones')
    .select(`
      id, name, due_date, status, assignee_id,
      project:projects(name),
      assignee:employees!project_milestones_assignee_id_fkey(full_name)
    `)
    .gte('due_date', today)
    .lte('due_date', nextWeekStr)
    .in('status', ['pending', 'approaching'])
    .order('due_date', { ascending: true })
    .limit(10)

  const milestones_approaching = (upcomingMilestones || []).map((m: any) => {
    const dueDate = new Date(m.due_date)
    const todayDate = new Date(today)
    const daysRemaining = Math.ceil((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
    return {
      project_name: m.project?.name || '',
      milestone_name: m.name || '',
      due_date: m.due_date,
      days_remaining: daysRemaining,
      assignee: m.assignee?.full_name || 'Chưa giao',
      status: m.status,
    }
  })

  return {
    total_projects: projects.length,
    active_projects: activeProjects.length,
    projects: projectDetails,
    milestones_approaching,
  }
}

// ── HTML Template ────────────────────────────────────────────────────────────

function buildEmailHTML(
  taskData: TaskReportData,
  attendanceData: AttendanceReportData,
  projectData: ProjectReportData,
  recipientName: string
): string {
  const today = new Date()
  const dateStr = today.toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  })

  const priorityLabels: Record<string, string> = {
    urgent: '🔴 Khẩn cấp', high: '🟠 Cao', medium: '🟡 TB', low: '🟢 Thấp',
  }
  const priorityColors: Record<string, string> = {
    urgent: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#16A34A',
  }

  // ── Build ATTENDANCE section ──

  let attendanceDeptRows = ''
  for (const d of attendanceData.departments) {
    const rate = d.total > 0 ? Math.round((d.checked_in / d.total) * 100) : 0
    attendanceDeptRows += `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:500;">${d.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;">${d.total}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:#16A34A;font-weight:600;">${d.checked_in}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:${d.not_checked_in > 0 ? '#DC2626' : '#6B7280'};font-weight:${d.not_checked_in > 0 ? '600' : '400'};">${d.not_checked_in}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:${d.late > 0 ? '#D97706' : '#6B7280'};">${d.late}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;">${rate}%</td>
      </tr>`
  }

  let lateRows = ''
  for (const l of attendanceData.late_details.slice(0, 15)) {
    lateRows += `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${l.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${l.department}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${l.shift_name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${l.check_in_time}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#DC2626;font-weight:600;">Trễ ${l.late_minutes} phút</td>
      </tr>`
  }

  let notCheckedInRows = ''
  for (const n of attendanceData.not_checked_in_details.slice(0, 20)) {
    notCheckedInRows += `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${n.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${n.department}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${n.position}</td>
      </tr>`
  }

  // ── Build TASK sections ──

  let overdueRows = ''
  for (const t of taskData.overdue_details) {
    overdueRows += `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:600;color:#1B4D3E;">${t.code}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${t.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${t.assignee}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${t.department}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:${priorityColors[t.priority] || '#D97706'};">${priorityLabels[t.priority] || t.priority}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#DC2626;font-weight:600;">Quá ${t.days_overdue} ngày</td>
      </tr>`
  }

  let deptRows = ''
  for (const d of taskData.departments) {
    const completionRate = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0
    deptRows += `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:500;">${d.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;">${d.total}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:#2563EB;">${d.in_progress}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:#16A34A;">${d.completed}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:${d.overdue > 0 ? '#DC2626' : '#6B7280'};font-weight:${d.overdue > 0 ? '600' : '400'};">${d.overdue}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;">${completionRate}%</td>
      </tr>`
  }

  let newTodayRows = ''
  for (const t of taskData.new_today_details) {
    newTodayRows += `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#1B4D3E;">${t.code}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.assignee}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.department}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;color:${priorityColors[t.priority] || '#D97706'};">${priorityLabels[t.priority] || t.priority}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.due_date || '—'}</td>
      </tr>`
  }

  let completedRows = ''
  for (const t of taskData.completed_today_details) {
    completedRows += `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#1B4D3E;">${t.code}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.assignee}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.department}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;">${t.score !== null ? `${t.score}/10` : '—'}</td>
      </tr>`
  }

  // ── Attendance rate color ──
  const attendanceRate = attendanceData.total_employees > 0
    ? Math.round((attendanceData.checked_in / attendanceData.total_employees) * 100)
    : 0
  const attendanceRateColor = attendanceRate >= 90 ? '#16A34A' : attendanceRate >= 70 ? '#D97706' : '#DC2626'

  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:720px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    
    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#1B4D3E 0%,#2D8B6E 100%);padding:24px 32px;">
      <table width="100%"><tr>
        <td>
          <h1 style="color:#fff;margin:0;font-size:20px;">📊 Báo cáo Tổng hợp Hằng ngày</h1>
          <p style="color:#A7F3D0;margin:6px 0 0;font-size:13px;">${dateStr}</p>
        </td>
        <td align="right">
          <p style="color:#D1FAE5;margin:0;font-size:12px;">HUY ANH RUBBER</p>
          <p style="color:#A7F3D0;margin:2px 0 0;font-size:11px;">ERP System</p>
        </td>
      </tr></table>
    </div>

    <div style="padding:24px 32px;">
      
      <p style="color:#374151;font-size:14px;margin:0 0 24px;">
        Kính gửi <strong>${recipientName}</strong>,<br>
        Dưới đây là báo cáo tổng hợp công việc và điểm danh trong ngày:
      </p>

      <!-- ═══════════════════════════════════════════════════════════ -->
      <!-- PHẦN 1: ĐIỂM DANH                                          -->
      <!-- ═══════════════════════════════════════════════════════════ -->
      
      <div style="background:#1B4D3E;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;margin-top:8px;">
        <h2 style="margin:0;font-size:16px;">🕐 Điểm danh hôm nay</h2>
      </div>

      <!-- Tổng quan điểm danh -->
      <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;border:1px solid #E5E7EB;border-top:none;">
        <tr>
          <td width="20%" style="padding:16px 8px;text-align:center;background:#F0FDF4;">
            <div style="font-size:28px;font-weight:700;color:#16A34A;">${attendanceData.checked_in}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Đã check-in</div>
          </td>
          <td width="20%" style="padding:16px 8px;text-align:center;background:#FEF2F2;">
            <div style="font-size:28px;font-weight:700;color:#DC2626;">${attendanceData.not_checked_in}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Chưa check-in</div>
          </td>
          <td width="20%" style="padding:16px 8px;text-align:center;background:#FFFBEB;">
            <div style="font-size:28px;font-weight:700;color:#D97706;">${attendanceData.late_count}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Đi trễ</div>
          </td>
          <td width="20%" style="padding:16px 8px;text-align:center;background:#EFF6FF;">
            <div style="font-size:28px;font-weight:700;color:#2563EB;">${attendanceData.checked_out}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Đã check-out</div>
          </td>
          <td width="20%" style="padding:16px 8px;text-align:center;background:#F9FAFB;">
            <div style="font-size:28px;font-weight:700;color:${attendanceRateColor};">${attendanceRate}%</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Tỷ lệ đi làm</div>
          </td>
        </tr>
      </table>

      <!-- Điểm danh theo phòng ban -->
      ${attendanceDeptRows ? `
      <h3 style="margin:0 0 12px;font-size:14px;color:#1B4D3E;">🏢 Điểm danh theo Phòng ban</h3>
      <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#F9FAFB;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6B7280;font-weight:600;">Phòng ban</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Tổng</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Check-in</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Vắng</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Trễ</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Tỷ lệ</th>
          </tr>
        </thead>
        <tbody>${attendanceDeptRows}</tbody>
      </table>
      ` : ''}

      <!-- Nhân viên đi trễ -->
      ${attendanceData.late_details.length > 0 ? `
      <h3 style="margin:0 0 12px;font-size:14px;color:#D97706;">⏰ Đi trễ (${attendanceData.late_count})</h3>
      <table width="100%" cellspacing="0" style="border:1px solid #FDE68A;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#FFFBEB;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Họ tên</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Phòng ban</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Ca</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Giờ vào</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Trễ</th>
          </tr>
        </thead>
        <tbody>${lateRows}</tbody>
      </table>
      ` : ''}

      <!-- Chưa check-in -->
      ${attendanceData.not_checked_in_details.length > 0 ? `
      <h3 style="margin:0 0 12px;font-size:14px;color:#DC2626;">❌ Chưa check-in (${attendanceData.not_checked_in})</h3>
      <table width="100%" cellspacing="0" style="border:1px solid #FCA5A5;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#FEF2F2;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Họ tên</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Phòng ban</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Chức vụ</th>
          </tr>
        </thead>
        <tbody>${notCheckedInRows}</tbody>
      </table>
      ` : `
      <div style="background:#F0FDF4;border-radius:10px;padding:12px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#16A34A;font-size:13px;">✅ Tất cả nhân viên đã check-in</p>
      </div>
      `}

      <!-- ═══════════════════════════════════════════════════════════ -->
      <!-- PHẦN 2: CÔNG VIỆC                                           -->
      <!-- ═══════════════════════════════════════════════════════════ -->
      
      <div style="background:#1B4D3E;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;margin-top:28px;">
        <h2 style="margin:0;font-size:16px;">📋 Công việc hôm nay</h2>
      </div>

      <!-- Tổng quan công việc -->
      <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;border:1px solid #E5E7EB;border-top:none;">
        <tr>
          <td width="25%" style="padding:16px 4px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#1D4ED8;">${taskData.total_tasks}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Tổng công việc</div>
          </td>
          <td width="25%" style="padding:16px 4px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#16A34A;">${taskData.completed_today}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Hoàn thành hôm nay</div>
          </td>
          <td width="25%" style="padding:16px 4px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#D97706;">${taskData.new_tasks_today}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Giao mới hôm nay</div>
          </td>
          <td width="25%" style="padding:16px 4px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:${taskData.overdue_tasks > 0 ? '#DC2626' : '#6B7280'};">${taskData.overdue_tasks}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:4px;">Quá hạn</div>
          </td>
        </tr>
      </table>

      <!-- Đánh giá & Phê duyệt -->
      <div style="background:#F8FAFC;border-radius:10px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px;font-size:14px;color:#1B4D3E;">📋 Đánh giá & Phê duyệt</h3>
        <table width="100%">
          <tr>
            <td width="25%" style="font-size:12px;color:#6B7280;">Chờ tự đánh giá: <strong style="color:#D97706;">${taskData.pending_evaluations}</strong></td>
            <td width="25%" style="font-size:12px;color:#6B7280;">Chờ phê duyệt: <strong style="color:#2563EB;">${taskData.pending_approvals}</strong></td>
            <td width="25%" style="font-size:12px;color:#6B7280;">Đã duyệt: <strong style="color:#16A34A;">${taskData.approved_today}</strong></td>
            <td width="25%" style="font-size:12px;color:#6B7280;">Từ chối: <strong style="color:#DC2626;">${taskData.rejected_today}</strong></td>
          </tr>
        </table>
      </div>

      <!-- Công việc theo phòng ban -->
      ${deptRows ? `
      <h3 style="margin:0 0 12px;font-size:14px;color:#1B4D3E;">🏢 Công việc theo Phòng ban</h3>
      <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#F9FAFB;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6B7280;font-weight:600;">Phòng ban</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Tổng</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Đang làm</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Hoàn thành</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Quá hạn</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">Tỷ lệ HT</th>
          </tr>
        </thead>
        <tbody>${deptRows}</tbody>
      </table>
      ` : ''}

      <!-- Công việc quá hạn -->
      ${taskData.overdue_details.length > 0 ? `
      <h3 style="margin:0 0 12px;font-size:14px;color:#DC2626;">⚠️ Quá hạn (${taskData.overdue_details.length})</h3>
      <table width="100%" cellspacing="0" style="border:1px solid #FCA5A5;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#FEF2F2;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Mã</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Tên</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Người TH</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Phòng</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Ưu tiên</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#991B1B;font-weight:600;">Trễ</th>
          </tr>
        </thead>
        <tbody>${overdueRows}</tbody>
      </table>
      ` : `
      <div style="background:#F0FDF4;border-radius:10px;padding:12px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#16A34A;font-size:13px;">✅ Không có công việc quá hạn</p>
      </div>
      `}

      <!-- Giao mới hôm nay -->
      ${taskData.new_today_details.length > 0 ? `
      <h3 style="margin:0 0 12px;font-size:14px;color:#D97706;">📝 Giao mới hôm nay (${taskData.new_today_details.length})</h3>
      <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#FFFBEB;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Mã</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Tên</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Người nhận</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Phòng</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Ưu tiên</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Hạn</th>
          </tr>
        </thead>
        <tbody>${newTodayRows}</tbody>
      </table>
      ` : ''}

      <!-- Hoàn thành hôm nay -->
      ${taskData.completed_today_details.length > 0 ? `
      <h3 style="margin:0 0 12px;font-size:14px;color:#16A34A;">✅ Hoàn thành hôm nay (${taskData.completed_today_details.length})</h3>
      <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#F0FDF4;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#166534;">Mã</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#166534;">Tên</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#166534;">Người TH</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#166534;">Phòng</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#166534;">Điểm</th>
          </tr>
        </thead>
        <tbody>${completedRows}</tbody>
      </table>
      ` : ''}

      <!-- ═══════════════════════════════════════════════════════════ -->
      <!-- PHẦN 3: DỰ ÁN                                              -->
      <!-- ═══════════════════════════════════════════════════════════ -->

      ${projectData.active_projects > 0 ? `
      <div style="background:#1B4D3E;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;margin-top:28px;">
        <h2 style="margin:0;font-size:16px;">🗂️ Dự án (${projectData.active_projects} đang hoạt động)</h2>
      </div>

      <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#F9FAFB;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:600;">Dự án</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600;">Tiến độ</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:600;">Giai đoạn</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600;">Rủi ro</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600;">Vấn đề</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:600;">Hạn</th>
          </tr>
        </thead>
        <tbody>
          ${projectData.projects.map(p => {
            const progressColor = p.progress_pct >= 80 ? '#16A34A' : p.progress_pct >= 50 ? '#D97706' : '#DC2626'
            const barWidth = Math.min(p.progress_pct, 100)
            return `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;">
              <div style="font-size:13px;font-weight:600;color:#1B4D3E;">${p.code}</div>
              <div style="font-size:11px;color:#6B7280;">${p.name}</div>
              <div style="font-size:10px;color:#9CA3AF;">${p.owner} • ${p.department}</div>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;text-align:center;">
              <div style="font-size:14px;font-weight:700;color:${progressColor};">${p.progress_pct}%</div>
              <div style="background:#E5E7EB;border-radius:4px;height:6px;width:60px;margin:4px auto 0;">
                <div style="background:${progressColor};border-radius:4px;height:6px;width:${barWidth}%;"></div>
              </div>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">${p.phase_current}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:${p.open_risks > 0 ? '#DC2626' : '#6B7280'};font-weight:${p.open_risks > 0 ? '600' : '400'};">${p.open_risks}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:${p.open_issues > 0 ? '#D97706' : '#6B7280'};font-weight:${p.open_issues > 0 ? '600' : '400'};">${p.open_issues}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:12px;color:${p.is_overdue ? '#DC2626' : '#374151'};font-weight:${p.is_overdue ? '600' : '400'};">${p.planned_end || '—'}${p.is_overdue ? ' ⚠️' : ''}</td>
          </tr>`
          }).join('')}
        </tbody>
      </table>

      ${projectData.milestones_approaching.length > 0 ? `
      <h3 style="margin:0 0 12px;font-size:14px;color:#D97706;">🎯 Mốc quan trọng sắp đến hạn (7 ngày tới)</h3>
      <table width="100%" cellspacing="0" style="border:1px solid #FDE68A;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#FFFBEB;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Dự án</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Mốc</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Phụ trách</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;font-weight:600;">Hạn</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#92400E;font-weight:600;">Còn lại</th>
          </tr>
        </thead>
        <tbody>
          ${projectData.milestones_approaching.map(m => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${m.project_name}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:500;">${m.milestone_name}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${m.assignee}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${m.due_date}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;color:${m.days_remaining <= 2 ? '#DC2626' : '#D97706'};font-weight:600;">${m.days_remaining} ngày</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ` : ''}
      ` : ''}

      <!-- CTA -->
      <div style="text-align:center;margin:24px 0;">
        <a href="${APP_URL}" style="display:inline-block;background:#1B4D3E;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
          🔗 Truy cập hệ thống ERP
        </a>
      </div>

    </div>

    <!-- FOOTER -->
    <div style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;">
        Email tự động từ hệ thống Huy Anh ERP — Gửi lúc 17:30 hằng ngày<br>
        Nếu cần hỗ trợ, liên hệ Phòng IT: minhld@huyanhrubber.com
      </p>
    </div>

  </div>
</body>
</html>`
}

// ── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('📊 [daily-task-report] Starting...')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Lấy dữ liệu công việc
    console.log('📊 [daily-task-report] Fetching task data...')
    const taskData = await fetchTaskReportData(supabase)
    console.log('📊 [daily-task-report] Tasks:', {
      total: taskData.total_tasks,
      new: taskData.new_tasks_today,
      completed: taskData.completed_today,
      overdue: taskData.overdue_tasks,
    })

    // 2. Lấy dữ liệu điểm danh
    console.log('📊 [daily-task-report] Fetching attendance data...')
    const attendanceData = await fetchAttendanceReportData(supabase)
    console.log('📊 [daily-task-report] Attendance:', {
      total: attendanceData.total_employees,
      checkedIn: attendanceData.checked_in,
      late: attendanceData.late_count,
      notCheckedIn: attendanceData.not_checked_in,
    })

    // 3. Lấy dữ liệu dự án
    console.log('📊 [daily-task-report] Fetching project data...')
    const projectData = await fetchProjectReportData(supabase)
    console.log('📊 [daily-task-report] Projects:', {
      total: projectData.total_projects,
      active: projectData.active_projects,
      milestones: projectData.milestones_approaching.length,
    })

    // 4. Lấy token Microsoft
    console.log('📊 [daily-task-report] Getting access token...')
    const accessToken = await getAccessToken()

    // 4. Gửi email
    const today = new Date().toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    })

    for (const recipient of REPORT_RECIPIENTS) {
      console.log(`📧 Sending to ${recipient.name} (${recipient.email})...`)

      const overdueTag = taskData.overdue_tasks > 0 ? `⚠️ ${taskData.overdue_tasks} quá hạn` : '✅ Tốt'
      const attendanceTag = attendanceData.late_count > 0 ? `⏰ ${attendanceData.late_count} trễ` : '✅ Đầy đủ'
      const subject = `📊 Báo cáo ${today} — ${overdueTag} | ${attendanceTag} | Huy Anh ERP`

      const html = buildEmailHTML(taskData, attendanceData, projectData, recipient.name)

      await sendEmail(accessToken, [recipient], subject, html)
      console.log(`✅ Sent to ${recipient.email}`)
    }

    // 5. Ghi log
    try {
      await supabase.from('email_notifications').insert({
        recipient_email: REPORT_RECIPIENTS.map((r) => r.email).join(', '),
        notification_type: 'daily_report',
        subject: `Báo cáo ${today}`,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    } catch (logErr) {
      console.warn('⚠️ Could not log to email_notifications:', logErr)
    }

    console.log('✅ [daily-task-report] All done!')

    return new Response(
      JSON.stringify({
        success: true,
        recipients: REPORT_RECIPIENTS.map((r) => r.email),
        summary: {
          tasks: {
            total: taskData.total_tasks,
            new_today: taskData.new_tasks_today,
            completed_today: taskData.completed_today,
            overdue: taskData.overdue_tasks,
          },
          attendance: {
            total_employees: attendanceData.total_employees,
            checked_in: attendanceData.checked_in,
            late: attendanceData.late_count,
            not_checked_in: attendanceData.not_checked_in,
          },
          projects: {
            total: projectData.total_projects,
            active: projectData.active_projects,
            milestones_upcoming: projectData.milestones_approaching.length,
          },
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ [daily-task-report] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})