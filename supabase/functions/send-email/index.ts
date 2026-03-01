// =============================================================================
// EDGE FUNCTION: daily-task-report (V2)
// Gửi báo cáo tổng hợp Công việc + Dự án hằng ngày lúc 17:30 VN
// Người nhận: GĐ Lê Văn Huy + Trợ lý Hồ Thị Thủy + IT Lê Duy Minh
// =============================================================================
// Deploy: npx supabase functions deploy daily-task-report --no-verify-jwt
// Schedule: pg_cron chạy lúc 10:30 UTC (= 17:30 VN)
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

// ★ Người nhận báo cáo
const REPORT_RECIPIENTS = [
  { name: 'Lê Văn Huy', email: 'huylv@huyanhrubber.com', role: 'Giám đốc' },
  { name: 'Hồ Thị Thủy', email: 'thuyht@huyanhrubber.com', role: 'Trợ lý Ban Giám đốc' },
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com', role: 'Trưởng phòng IT' },
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

// ══════════════════════════════════════════════════════════════════════════════
// DATA TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface TaskReportData {
  month_label: string
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
  approved_month: number
  rejected_month: number
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

interface ProjectReportData {
  total_projects: number
  projects_by_status: Record<string, number>
  active_projects: Array<{
    code: string
    name: string
    status: string
    priority: string
    progress_pct: number
    planned_end: string
    owner_name: string
    days_remaining: number
    phase_count: number
    milestone_total: number
    milestone_completed: number
    open_risks: number
    open_issues: number
  }>
  upcoming_milestones: Array<{
    project_code: string
    project_name: string
    milestone_name: string
    due_date: string
    days_until: number
    status: string
  }>
  overdue_milestones: Array<{
    project_code: string
    project_name: string
    milestone_name: string
    due_date: string
    days_overdue: number
    assignee_name: string
  }>
  high_risks: Array<{
    project_code: string
    risk_title: string
    probability: number
    impact: number
    score: number
    owner_name: string
  }>
}

// ══════════════════════════════════════════════════════════════════════════════
// FETCH TASK DATA (giữ nguyên logic V1)
// ══════════════════════════════════════════════════════════════════════════════

async function fetchTaskData(supabase: any): Promise<TaskReportData> {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const todayStart = `${today}T00:00:00+07:00`
  const todayEnd = `${today}T23:59:59+07:00`

  // ★ Tính đầu tháng & cuối tháng hiện tại (múi giờ VN)
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00+07:00`
  const lastDay = new Date(year, month + 1, 0).getDate() // ngày cuối tháng
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59+07:00`
  const monthLabel = `Tháng ${month + 1}/${year}`

  // 1. Tổng quan tasks TRONG THÁNG (created hoặc due_date trong tháng, không tính draft)
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('id, status, priority, department_id, due_date, created_at, evaluation_status')
    .neq('status', 'draft')
    .or(`created_at.gte.${monthStart},due_date.gte.${monthStart}`)
    .or(`created_at.lte.${monthEnd},due_date.lte.${monthEnd}`)

  // Filter chính xác: task thuộc tháng nếu created_at HOẶC due_date nằm trong tháng
  const tasks = (allTasks || []).filter((t: any) => {
    const created = t.created_at ? new Date(t.created_at) : null
    const due = t.due_date ? new Date(t.due_date) : null
    const ms = new Date(monthStart)
    const me = new Date(monthEnd)
    return (created && created >= ms && created <= me) || (due && due >= ms && due <= me)
  })

  const tasks_by_status: Record<string, number> = {}
  const tasks_by_priority: Record<string, number> = {}
  let overdue_tasks = 0

  for (const t of tasks) {
    tasks_by_status[t.status] = (tasks_by_status[t.status] || 0) + 1
    tasks_by_priority[t.priority || 'medium'] = (tasks_by_priority[t.priority || 'medium'] || 0) + 1
    if (t.due_date && t.due_date < today && !['finished', 'cancelled'].includes(t.status)) {
      overdue_tasks++
    }
  }

  // 2. Công việc mới hôm nay
  const { data: newToday } = await supabase
    .from('tasks')
    .select(`code, name, id, priority, due_date, status, departments!tasks_department_id_fkey(name)`)
    .neq('status', 'draft')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)
    .order('created_at', { ascending: false })

  const newTodayDetails = []
  for (const t of (newToday || [])) {
    const { data: taskAssign } = await supabase
      .from('task_assignments')
      .select('employee_id, employees(full_name)')
      .eq('task_id', t.id)
      .limit(1)

    newTodayDetails.push({
      code: t.code || '',
      name: t.name || '',
      assignee: taskAssign?.[0]?.employees?.full_name || 'Chưa giao',
      department: t.departments?.name || '',
      priority: t.priority || 'medium',
      due_date: t.due_date || '',
    })
  }

  // 3. Công việc hoàn thành hôm nay
  const { data: completedToday } = await supabase
    .from('tasks')
    .select(`id, code, name, status, departments!tasks_department_id_fkey(name)`)
    .eq('status', 'finished')
    .gte('updated_at', todayStart)
    .lte('updated_at', todayEnd)

  const completedTodayDetails = []
  for (const t of (completedToday || [])) {
    const { data: approval } = await supabase
      .from('task_approvals')
      .select('approved_score')
      .eq('task_id', t.id)
      .eq('status', 'approved')
      .limit(1)

    const { data: taskAssign } = await supabase
      .from('task_assignments')
      .select('employees(full_name)')
      .eq('task_id', t.id)
      .limit(1)

    completedTodayDetails.push({
      code: t.code || '',
      name: t.name || '',
      assignee: taskAssign?.[0]?.employees?.full_name || '',
      department: t.departments?.name || '',
      score: approval?.[0]?.approved_score || null,
    })
  }

  // 4. Overdue details (chỉ task có due_date trong tháng hiện tại)
  const { data: overdueData } = await supabase
    .from('tasks')
    .select(`id, code, name, priority, due_date, departments!tasks_department_id_fkey(name)`)
    .lt('due_date', today)
    .gte('due_date', monthStart)
    .not('status', 'in', '("finished","cancelled")')
    .neq('status', 'draft')
    .order('due_date', { ascending: true })
    .limit(20)

  const overdue_details = []
  for (const t of (overdueData || [])) {
    const dueDate = new Date(t.due_date)
    const todayDate = new Date(today)
    const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

    const { data: taskAssign } = await supabase
      .from('task_assignments')
      .select('employees(full_name)')
      .eq('task_id', t.id)
      .limit(1)

    overdue_details.push({
      code: t.code || '',
      name: t.name || '',
      assignee: taskAssign?.[0]?.employees?.full_name || 'Chưa giao',
      department: t.departments?.name || '',
      due_date: t.due_date,
      days_overdue: daysOverdue,
      priority: t.priority || 'medium',
    })
  }

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

  // 6b. Approved/Rejected trong tháng
  const { count: approvedMonth } = await supabase
    .from('task_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .gte('approved_at', monthStart)
    .lte('approved_at', monthEnd)

  const { count: rejectedMonth } = await supabase
    .from('task_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'rejected')
    .gte('approved_at', monthStart)
    .lte('approved_at', monthEnd)

  // 7. Theo phòng ban
  const { data: departments } = await supabase.from('departments').select('id, name').order('name')

  const deptStats = []
  for (const dept of (departments || [])) {
    const deptTasks = tasks.filter((t: any) => t.department_id === dept.id)
    if (deptTasks.length === 0) continue
    deptStats.push({
      name: dept.name,
      total: deptTasks.length,
      in_progress: deptTasks.filter((t: any) => t.status === 'in_progress').length,
      completed: deptTasks.filter((t: any) => ['completed', 'finished'].includes(t.status)).length,
      overdue: deptTasks.filter((t: any) => t.due_date && t.due_date < today && !['finished', 'cancelled'].includes(t.status)).length,
    })
  }

  return {
    month_label: monthLabel,
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
    approved_month: approvedMonth || 0,
    rejected_month: rejectedMonth || 0,
    departments: deptStats,
    overdue_details,
    new_today_details: newTodayDetails,
    completed_today_details: completedTodayDetails,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FETCH PROJECT DATA (MỚI — V2)
// ══════════════════════════════════════════════════════════════════════════════

async function fetchProjectData(supabase: any): Promise<ProjectReportData> {
  const today = new Date().toISOString().split('T')[0]

  // 1. Tất cả projects (không tính cancelled)
  const { data: allProjects } = await supabase
    .from('projects')
    .select('id, code, name, status, priority, progress_pct, planned_start, planned_end, owner_id, department_id')
    .neq('status', 'cancelled')
    .order('priority', { ascending: true })

  const projects = allProjects || []

  // Status counts
  const projects_by_status: Record<string, number> = {}
  for (const p of projects) {
    projects_by_status[p.status] = (projects_by_status[p.status] || 0) + 1
  }

  // 2. Chi tiết từng dự án đang hoạt động (in_progress, planning, approved)
  const activeStatuses = ['in_progress', 'planning', 'approved']
  const activeProjects = projects.filter((p: any) => activeStatuses.includes(p.status))

  const active_projects = []
  for (const p of activeProjects) {
    // Owner name
    let ownerName = '—'
    if (p.owner_id) {
      const { data: owner } = await supabase
        .from('employees').select('full_name').eq('id', p.owner_id).maybeSingle()
      ownerName = owner?.full_name || '—'
    }

    // Phase count
    const { count: phaseCount } = await supabase
      .from('project_phases')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', p.id)

    // Milestones
    const { data: milestones } = await supabase
      .from('project_milestones')
      .select('id, status')
      .eq('project_id', p.id)

    const msTotal = milestones?.length || 0
    const msCompleted = milestones?.filter((m: any) => m.status === 'completed').length || 0

    // Open risks
    const { count: openRisks } = await supabase
      .from('project_risks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', p.id)
      .not('status', 'in', '("closed","resolved")')

    // Open issues
    const { count: openIssues } = await supabase
      .from('project_issues')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', p.id)
      .in('status', ['open', 'in_progress', 'escalated'])

    // Days remaining
    const plannedEnd = p.planned_end ? new Date(p.planned_end) : null
    const daysRemaining = plannedEnd
      ? Math.ceil((plannedEnd.getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
      : 999

    active_projects.push({
      code: p.code,
      name: p.name,
      status: p.status,
      priority: p.priority || 'medium',
      progress_pct: Number(p.progress_pct) || 0,
      planned_end: p.planned_end || '',
      owner_name: ownerName,
      days_remaining: daysRemaining,
      phase_count: phaseCount || 0,
      milestone_total: msTotal,
      milestone_completed: msCompleted,
      open_risks: openRisks || 0,
      open_issues: openIssues || 0,
    })
  }

  // 3. Milestones sắp đến hạn (7 ngày tới)
  const in7days = new Date()
  in7days.setDate(in7days.getDate() + 7)
  const in7daysStr = in7days.toISOString().split('T')[0]

  const { data: upcomingMs } = await supabase
    .from('project_milestones')
    .select('id, name, due_date, status, project_id')
    .gte('due_date', today)
    .lte('due_date', in7daysStr)
    .in('status', ['pending', 'approaching'])
    .order('due_date', { ascending: true })
    .limit(10)

  const upcoming_milestones = []
  for (const m of (upcomingMs || [])) {
    const { data: proj } = await supabase
      .from('projects').select('code, name').eq('id', m.project_id).maybeSingle()

    const daysUntil = Math.ceil((new Date(m.due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))

    upcoming_milestones.push({
      project_code: proj?.code || '',
      project_name: proj?.name || '',
      milestone_name: m.name,
      due_date: m.due_date,
      days_until: daysUntil,
      status: m.status,
    })
  }

  // 4. Milestones quá hạn
  const { data: overdueMs } = await supabase
    .from('project_milestones')
    .select('id, name, due_date, status, project_id, assignee_id')
    .lt('due_date', today)
    .in('status', ['pending', 'approaching', 'overdue'])
    .order('due_date', { ascending: true })
    .limit(10)

  const overdue_milestones = []
  for (const m of (overdueMs || [])) {
    const { data: proj } = await supabase
      .from('projects').select('code, name').eq('id', m.project_id).maybeSingle()

    let assigneeName = '—'
    if (m.assignee_id) {
      const { data: emp } = await supabase
        .from('employees').select('full_name').eq('id', m.assignee_id).maybeSingle()
      assigneeName = emp?.full_name || '—'
    }

    const daysOverdue = Math.floor((new Date(today).getTime() - new Date(m.due_date).getTime()) / (1000 * 60 * 60 * 24))

    overdue_milestones.push({
      project_code: proj?.code || '',
      project_name: proj?.name || '',
      milestone_name: m.name,
      due_date: m.due_date,
      days_overdue: daysOverdue,
      assignee_name: assigneeName,
    })
  }

  // 5. Rủi ro cao (score >= 6)
  const { data: risksData } = await supabase
    .from('project_risks')
    .select('id, title, probability, impact, project_id, owner_id, status')
    .not('status', 'in', '("closed","resolved")')
    .order('probability', { ascending: false })
    .limit(20)

  const high_risks = []
  for (const r of (risksData || [])) {
    const score = (r.probability || 0) * (r.impact || 0)
    if (score < 6) continue

    const { data: proj } = await supabase
      .from('projects').select('code').eq('id', r.project_id).maybeSingle()

    let ownerName = '—'
    if (r.owner_id) {
      const { data: emp } = await supabase
        .from('employees').select('full_name').eq('id', r.owner_id).maybeSingle()
      ownerName = emp?.full_name || '—'
    }

    high_risks.push({
      project_code: proj?.code || '',
      risk_title: r.title,
      probability: r.probability,
      impact: r.impact,
      score,
      owner_name: ownerName,
    })
  }

  // Sort by score desc
  high_risks.sort((a, b) => b.score - a.score)

  return {
    total_projects: projects.length,
    projects_by_status,
    active_projects,
    upcoming_milestones,
    overdue_milestones,
    high_risks: high_risks.slice(0, 5),
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HTML TEMPLATE
// ══════════════════════════════════════════════════════════════════════════════

function buildEmailHTML(
  taskData: TaskReportData,
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
    urgent: '🔴 Khẩn cấp', critical: '🔴 Khẩn cấp',
    high: '🟠 Cao', medium: '🟡 Trung bình', low: '🟢 Thấp',
  }
  const priorityColors: Record<string, string> = {
    urgent: '#DC2626', critical: '#DC2626',
    high: '#EA580C', medium: '#D97706', low: '#16A34A',
  }
  const statusLabels: Record<string, string> = {
    draft: 'Nháp', planning: 'Lập KH', approved: 'Đã duyệt',
    in_progress: 'Đang chạy', on_hold: 'Tạm dừng',
    completed: 'Hoàn thành', cancelled: 'Đã hủy',
    finished: 'Đã phê duyệt', pending: 'Chờ xử lý',
  }
  const statusColors: Record<string, string> = {
    draft: '#6B7280', planning: '#3B82F6', approved: '#6366F1',
    in_progress: '#059669', on_hold: '#D97706',
    completed: '#16A34A', cancelled: '#DC2626',
  }

  // ── TASK SECTION: Overdue rows ──
  let overdueRows = ''
  for (const t of taskData.overdue_details) {
    overdueRows += `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:600;color:#1B4D3E;">${t.code}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${t.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${t.assignee}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${t.department}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:${priorityColors[t.priority] || '#D97706'};">${priorityLabels[t.priority] || t.priority}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#DC2626;font-weight:600;">Quá ${t.days_overdue} ngày</td>
    </tr>`
  }

  // ── TASK SECTION: Department rows ──
  let deptRows = ''
  for (const d of taskData.departments) {
    const completionRate = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0
    deptRows += `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:500;">${d.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;">${d.total}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:#2563EB;">${d.in_progress}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:#16A34A;">${d.completed}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:${d.overdue > 0 ? '#DC2626' : '#6B7280'};font-weight:${d.overdue > 0 ? '600' : '400'};">${d.overdue}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;">${completionRate}%</td>
    </tr>`
  }

  // ── TASK SECTION: New today rows ──
  let newTodayRows = ''
  for (const t of taskData.new_today_details) {
    newTodayRows += `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#1B4D3E;">${t.code}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.assignee}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.department}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;color:${priorityColors[t.priority] || '#D97706'};">${priorityLabels[t.priority] || t.priority}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.due_date || '—'}</td>
    </tr>`
  }

  // ── TASK SECTION: Completed today rows ──
  let completedRows = ''
  for (const t of taskData.completed_today_details) {
    completedRows += `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#1B4D3E;">${t.code}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.assignee}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${t.department}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;">${t.score !== null ? `${t.score}/10` : '—'}</td>
    </tr>`
  }

  // ── PROJECT SECTION: Active projects rows ──
  let projectRows = ''
  for (const p of projectData.active_projects) {
    const progressColor = p.progress_pct >= 70 ? '#16A34A' : p.progress_pct >= 40 ? '#D97706' : '#DC2626'
    const daysColor = p.days_remaining <= 7 ? '#DC2626' : p.days_remaining <= 30 ? '#D97706' : '#16A34A'
    const msText = `${p.milestone_completed}/${p.milestone_total}`

    projectRows += `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#1B4D3E;">${p.code}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${p.name}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;">
        <span style="color:${statusColors[p.status] || '#6B7280'};font-weight:500;">${statusLabels[p.status] || p.status}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;">
        <div style="background:#E5E7EB;border-radius:10px;height:8px;width:60px;display:inline-block;vertical-align:middle;">
          <div style="background:${progressColor};border-radius:10px;height:8px;width:${Math.min(p.progress_pct, 100)}%;"></div>
        </div>
        <span style="font-weight:600;color:${progressColor};margin-left:4px;">${p.progress_pct}%</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;">${msText}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;color:${p.open_risks > 0 ? '#DC2626' : '#6B7280'};font-weight:${p.open_risks > 0 ? '600' : '400'};">${p.open_risks}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;color:${daysColor};font-weight:600;">${p.days_remaining > 0 ? `Còn ${p.days_remaining} ngày` : `Quá ${Math.abs(p.days_remaining)} ngày`}</td>
    </tr>`
  }

  // ── PROJECT SECTION: Upcoming milestones ──
  let upcomingMsRows = ''
  for (const m of projectData.upcoming_milestones) {
    upcomingMsRows += `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#1B4D3E;">${m.project_code}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${m.milestone_name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${m.due_date}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#D97706;font-weight:600;">Còn ${m.days_until} ngày</td>
    </tr>`
  }

  // ── PROJECT SECTION: Overdue milestones ──
  let overdueMsRows = ''
  for (const m of projectData.overdue_milestones) {
    overdueMsRows += `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#1B4D3E;">${m.project_code}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${m.milestone_name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${m.assignee_name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#DC2626;font-weight:600;">Quá ${m.days_overdue} ngày</td>
    </tr>`
  }

  // ── PROJECT SECTION: High risks ──
  let riskRows = ''
  for (const r of projectData.high_risks) {
    const scoreColor = r.score >= 9 ? '#DC2626' : r.score >= 6 ? '#EA580C' : '#D97706'
    riskRows += `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#1B4D3E;">${r.project_code}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${r.risk_title}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;color:${scoreColor};font-weight:700;">${r.score}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;">${r.owner_name}</td>
    </tr>`
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FULL HTML
  // ══════════════════════════════════════════════════════════════════════════

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:750px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    
    <!-- ═══ HEADER ═══ -->
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
      
      <p style="color:#374151;font-size:14px;margin:0 0 20px;">
        Kính gửi <strong>${recipientName}</strong>,<br>
        Dưới đây là báo cáo tổng hợp <strong>Công việc (${taskData.month_label})</strong> và <strong>Dự án</strong>:
      </p>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- PHẦN 1: CÔNG VIỆC                                      -->
      <!-- ═══════════════════════════════════════════════════════ -->
      
      <div style="background:#1B4D3E;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;margin-top:8px;">
        <h2 style="margin:0;font-size:16px;">📋 PHẦN 1: CÔNG VIỆC — ${taskData.month_label}</h2>
      </div>
      <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:20px;margin-bottom:24px;">

        <!-- Tổng quan CV -->
        <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
          <tr>
            <td width="25%" style="padding:4px;">
              <div style="background:#EFF6FF;border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#1D4ED8;">${taskData.total_tasks}</div>
                <div style="font-size:11px;color:#6B7280;margin-top:4px;">CV trong tháng</div>
              </div>
            </td>
            <td width="25%" style="padding:4px;">
              <div style="background:#F0FDF4;border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#16A34A;">${taskData.completed_today}</div>
                <div style="font-size:11px;color:#6B7280;margin-top:4px;">HT hôm nay</div>
              </div>
            </td>
            <td width="25%" style="padding:4px;">
              <div style="background:#FFFBEB;border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#D97706;">${taskData.new_tasks_today}</div>
                <div style="font-size:11px;color:#6B7280;margin-top:4px;">Giao mới</div>
              </div>
            </td>
            <td width="25%" style="padding:4px;">
              <div style="background:${taskData.overdue_tasks > 0 ? '#FEF2F2' : '#F9FAFB'};border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:${taskData.overdue_tasks > 0 ? '#DC2626' : '#6B7280'};">${taskData.overdue_tasks}</div>
                <div style="font-size:11px;color:#6B7280;margin-top:4px;">Quá hạn</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Đánh giá & Phê duyệt -->
        <div style="background:#F8FAFC;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
          <h3 style="margin:0 0 8px;font-size:13px;color:#1B4D3E;">📋 Đánh giá & Phê duyệt</h3>
          <table width="100%">
            <tr>
              <td width="25%" style="font-size:12px;color:#6B7280;">Chờ tự ĐG: <strong style="color:#D97706;">${taskData.pending_evaluations}</strong></td>
              <td width="25%" style="font-size:12px;color:#6B7280;">Chờ duyệt: <strong style="color:#2563EB;">${taskData.pending_approvals}</strong></td>
              <td width="25%" style="font-size:12px;color:#6B7280;">Đã duyệt (tháng): <strong style="color:#16A34A;">${taskData.approved_month}</strong></td>
              <td width="25%" style="font-size:12px;color:#6B7280;">Từ chối (tháng): <strong style="color:#DC2626;">${taskData.rejected_month}</strong></td>
            </tr>
            <tr>
              <td colspan="2" style="font-size:11px;color:#9CA3AF;padding-top:6px;">Hôm nay: duyệt ${taskData.approved_today} | từ chối ${taskData.rejected_today}</td>
              <td colspan="2"></td>
            </tr>
          </table>
        </div>

        <!-- Theo phòng ban -->
        ${deptRows ? `
        <h3 style="margin:0 0 10px;font-size:13px;color:#1B4D3E;">🏢 Theo Phòng ban</h3>
        <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;margin-bottom:16px;">
          <thead><tr style="background:#F9FAFB;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:600;">Phòng ban</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600;">Tổng</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600;">Đang làm</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600;">HT</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600;">Quá hạn</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600;">Tỷ lệ</th>
          </tr></thead>
          <tbody>${deptRows}</tbody>
        </table>` : ''}

        <!-- CV Quá hạn -->
        ${taskData.overdue_details.length > 0 ? `
        <h3 style="margin:0 0 10px;font-size:13px;color:#DC2626;">⚠️ CV Quá hạn (${taskData.overdue_details.length})</h3>
        <table width="100%" cellspacing="0" style="border:1px solid #FCA5A5;border-radius:6px;overflow:hidden;margin-bottom:16px;">
          <thead><tr style="background:#FEF2F2;">
            <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;">Mã</th>
            <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;">Tên</th>
            <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;">Người TH</th>
            <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;">Phòng</th>
            <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;">Ưu tiên</th>
            <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;">Trễ</th>
          </tr></thead>
          <tbody>${overdueRows}</tbody>
        </table>` : `
        <div style="background:#F0FDF4;border-radius:8px;padding:12px;margin-bottom:16px;text-align:center;">
          <p style="margin:0;color:#16A34A;font-size:13px;">✅ Không có công việc quá hạn</p>
        </div>`}

        <!-- CV Giao mới -->
        ${taskData.new_today_details.length > 0 ? `
        <h3 style="margin:0 0 10px;font-size:13px;color:#D97706;">📝 Giao mới hôm nay (${taskData.new_today_details.length})</h3>
        <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;margin-bottom:16px;">
          <thead><tr style="background:#FFFBEB;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Mã</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Tên</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Người nhận</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Phòng</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Ưu tiên</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Hạn</th>
          </tr></thead>
          <tbody>${newTodayRows}</tbody>
        </table>` : ''}

        <!-- CV Hoàn thành -->
        ${taskData.completed_today_details.length > 0 ? `
        <h3 style="margin:0 0 10px;font-size:13px;color:#16A34A;">✅ Hoàn thành hôm nay (${taskData.completed_today_details.length})</h3>
        <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;margin-bottom:16px;">
          <thead><tr style="background:#F0FDF4;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#166534;">Mã</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#166534;">Tên</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#166534;">Người TH</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#166534;">Phòng</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#166534;">Điểm</th>
          </tr></thead>
          <tbody>${completedRows}</tbody>
        </table>` : ''}

      </div>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- PHẦN 2: DỰ ÁN                                         -->
      <!-- ═══════════════════════════════════════════════════════ -->

      <div style="background:#6366F1;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:16px;">🏗️ PHẦN 2: DỰ ÁN</h2>
      </div>
      <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:20px;margin-bottom:24px;">

        ${projectData.total_projects === 0 ? `
        <div style="background:#F9FAFB;border-radius:8px;padding:20px;text-align:center;">
          <p style="margin:0;color:#6B7280;font-size:14px;">📭 Chưa có dự án nào trong hệ thống</p>
        </div>
        ` : `

        <!-- Tổng quan DA -->
        <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
          <tr>
            <td width="33%" style="padding:4px;">
              <div style="background:#EEF2FF;border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#4F46E5;">${projectData.total_projects}</div>
                <div style="font-size:11px;color:#6B7280;margin-top:4px;">Tổng dự án</div>
              </div>
            </td>
            <td width="33%" style="padding:4px;">
              <div style="background:#F0FDF4;border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#059669;">${projectData.active_projects.length}</div>
                <div style="font-size:11px;color:#6B7280;margin-top:4px;">Đang hoạt động</div>
              </div>
            </td>
            <td width="33%" style="padding:4px;">
              <div style="background:${projectData.overdue_milestones.length > 0 ? '#FEF2F2' : '#F9FAFB'};border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:${projectData.overdue_milestones.length > 0 ? '#DC2626' : '#6B7280'};">${projectData.overdue_milestones.length}</div>
                <div style="font-size:11px;color:#6B7280;margin-top:4px;">Milestone quá hạn</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- DA đang hoạt động -->
        ${projectData.active_projects.length > 0 ? `
        <h3 style="margin:0 0 10px;font-size:13px;color:#4F46E5;">📊 Dự án đang hoạt động</h3>
        <table width="100%" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;margin-bottom:16px;">
          <thead><tr style="background:#EEF2FF;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#3730A3;">Mã</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#3730A3;">Tên dự án</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#3730A3;">Trạng thái</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#3730A3;">Tiến độ</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#3730A3;">Milestones</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#3730A3;">Rủi ro</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#3730A3;">Deadline</th>
          </tr></thead>
          <tbody>${projectRows}</tbody>
        </table>` : ''}

        <!-- Milestone sắp đến hạn -->
        ${projectData.upcoming_milestones.length > 0 ? `
        <h3 style="margin:0 0 10px;font-size:13px;color:#D97706;">🎯 Milestones sắp đến hạn (7 ngày tới)</h3>
        <table width="100%" cellspacing="0" style="border:1px solid #FCD34D;border-radius:6px;overflow:hidden;margin-bottom:16px;">
          <thead><tr style="background:#FFFBEB;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Dự án</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Milestone</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Hạn</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#92400E;">Còn lại</th>
          </tr></thead>
          <tbody>${upcomingMsRows}</tbody>
        </table>` : ''}

        <!-- Milestone quá hạn -->
        ${projectData.overdue_milestones.length > 0 ? `
        <h3 style="margin:0 0 10px;font-size:13px;color:#DC2626;">⚠️ Milestones quá hạn (${projectData.overdue_milestones.length})</h3>
        <table width="100%" cellspacing="0" style="border:1px solid #FCA5A5;border-radius:6px;overflow:hidden;margin-bottom:16px;">
          <thead><tr style="background:#FEF2F2;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#991B1B;">Dự án</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#991B1B;">Milestone</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#991B1B;">Phụ trách</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#991B1B;">Trễ</th>
          </tr></thead>
          <tbody>${overdueMsRows}</tbody>
        </table>` : ''}

        <!-- Rủi ro cao -->
        ${projectData.high_risks.length > 0 ? `
        <h3 style="margin:0 0 10px;font-size:13px;color:#EA580C;">🔥 Rủi ro cao (Score ≥ 6)</h3>
        <table width="100%" cellspacing="0" style="border:1px solid #FDBA74;border-radius:6px;overflow:hidden;margin-bottom:16px;">
          <thead><tr style="background:#FFF7ED;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#9A3412;">Dự án</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#9A3412;">Rủi ro</th>
            <th style="padding:6px 10px;text-align:center;font-size:11px;color:#9A3412;">Điểm</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#9A3412;">Người xử lý</th>
          </tr></thead>
          <tbody>${riskRows}</tbody>
        </table>` : ''}

        `}

      </div>

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

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('📊 [daily-report] Starting V2...')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Lấy dữ liệu song song
    console.log('📊 [daily-report] Fetching task + project data...')
    const [taskData, projectData] = await Promise.all([
      fetchTaskData(supabase),
      fetchProjectData(supabase),
    ])

    console.log('📊 [daily-report] Task data:', {
      total: taskData.total_tasks,
      new: taskData.new_tasks_today,
      completed: taskData.completed_today,
      overdue: taskData.overdue_tasks,
    })
    console.log('📊 [daily-report] Project data:', {
      total: projectData.total_projects,
      active: projectData.active_projects.length,
      overdue_ms: projectData.overdue_milestones.length,
      high_risks: projectData.high_risks.length,
    })

    // 2. Lấy token Microsoft
    console.log('📊 [daily-report] Getting access token...')
    const accessToken = await getAccessToken()

    // 3. Gửi email cho từng người nhận
    const today = new Date().toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    })

    for (const recipient of REPORT_RECIPIENTS) {
      console.log(`📧 [daily-report] Sending to ${recipient.name} (${recipient.email})...`)

      // Subject line thông minh
      const alerts = []
      if (taskData.overdue_tasks > 0) alerts.push(`⚠️ ${taskData.overdue_tasks} CV quá hạn`)
      if (projectData.overdue_milestones.length > 0) alerts.push(`🎯 ${projectData.overdue_milestones.length} MS trễ`)
      if (projectData.high_risks.length > 0) alerts.push(`🔥 ${projectData.high_risks.length} rủi ro cao`)

      const alertText = alerts.length > 0 ? alerts.join(' | ') : '✅ Tốt'

      const subject = `📊 Báo cáo ${today} — ${alertText} | Huy Anh ERP`
      const html = buildEmailHTML(taskData, projectData, recipient.name)

      await sendEmail(accessToken, [recipient], subject, html)
      console.log(`✅ [daily-report] Sent to ${recipient.email}`)
    }

    // 4. Ghi log
    try {
      await supabase.from('email_notifications').insert({
        recipient_email: REPORT_RECIPIENTS.map((r) => r.email).join(', '),
        notification_type: 'daily_report',
        subject: `Báo cáo Tổng hợp ${today}`,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    } catch (logErr) {
      console.warn('⚠️ Could not log to email_notifications:', logErr)
    }

    console.log('✅ [daily-report] All emails sent successfully!')

    return new Response(
      JSON.stringify({
        success: true,
        version: 'v2',
        recipients: REPORT_RECIPIENTS.map((r) => r.email),
        summary: {
          tasks: {
            total: taskData.total_tasks,
            new_today: taskData.new_tasks_today,
            completed_today: taskData.completed_today,
            overdue: taskData.overdue_tasks,
          },
          projects: {
            total: projectData.total_projects,
            active: projectData.active_projects.length,
            overdue_milestones: projectData.overdue_milestones.length,
            high_risks: projectData.high_risks.length,
          },
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ [daily-report] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})