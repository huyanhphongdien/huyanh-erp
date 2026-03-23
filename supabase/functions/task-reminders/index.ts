// ============================================================================
// TASK REMINDERS — Supabase Edge Function
// Chạy mỗi ngày lúc 8:00 AM (Vietnam time)
// 4 loại nhắc nhở: deadline, overdue, self-eval, approval
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = 'https://huyanhrubber.vn'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const results: string[] = []

  try {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    // ================================================================
    // 1. DEADLINE APPROACHING (1-3 ngày tới)
    // ================================================================
    const in1Day = new Date(now.getTime() + 1 * 86400000).toISOString().split('T')[0]
    const in3Days = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0]

    const { data: approachingTasks } = await supabase
      .from('tasks')
      .select('id, code, name, due_date, progress, assignee_id')
      .in('status', ['in_progress', 'draft'])
      .gte('due_date', in1Day)
      .lte('due_date', in3Days)

    for (const task of approachingTasks || []) {
      if (!task.assignee_id) continue
      const daysRemaining = Math.ceil((new Date(task.due_date).getTime() - now.getTime()) / 86400000)

      // Get assignee email
      const { data: emp } = await supabase
        .from('employees')
        .select('email, full_name')
        .eq('id', task.assignee_id)
        .single()

      if (emp?.email) {
        await sendEmail(supabase, emp.email, {
          subject: `[Huy Anh ERP] ⏰ Sắp đến hạn: ${task.name}`,
          html: buildDeadlineEmail(task, daysRemaining, emp.full_name),
        })
        results.push(`deadline: ${task.code} → ${emp.email} (${daysRemaining} ngày)`)
      }
    }

    // ================================================================
    // 2. OVERDUE (quá hạn) → gửi cho assignee + escalate manager
    // ================================================================
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, code, name, due_date, progress, assignee_id, department_id')
      .in('status', ['in_progress', 'draft'])
      .lt('due_date', todayStr)

    for (const task of overdueTasks || []) {
      if (!task.assignee_id) continue
      const daysOverdue = Math.ceil((now.getTime() - new Date(task.due_date).getTime()) / 86400000)

      // Get assignee
      const { data: emp } = await supabase
        .from('employees')
        .select('email, full_name')
        .eq('id', task.assignee_id)
        .single()

      if (emp?.email) {
        await sendEmail(supabase, emp.email, {
          subject: `[Huy Anh ERP] 🔴 Quá hạn ${daysOverdue} ngày: ${task.name}`,
          html: buildOverdueEmail(task, daysOverdue, emp.full_name),
        })
        results.push(`overdue-assignee: ${task.code} → ${emp.email} (${daysOverdue} ngày)`)
      }

      // Escalate to manager (find department manager)
      if (task.department_id && daysOverdue >= 2) {
        const { data: managers } = await supabase
          .from('employees')
          .select('email, full_name')
          .eq('department_id', task.department_id)
          .eq('is_manager', true)
          .eq('status', 'active')
          .limit(1)

        if (managers?.[0]?.email && managers[0].email !== emp?.email) {
          await sendEmail(supabase, managers[0].email, {
            subject: `[Huy Anh ERP] 🔴 Escalation: ${task.name} quá hạn ${daysOverdue} ngày`,
            html: buildOverdueEmail(task, daysOverdue, emp?.full_name || 'N/A', true),
          })
          results.push(`overdue-manager: ${task.code} → ${managers[0].email}`)
        }
      }
    }

    // ================================================================
    // 3. SELF-EVAL REMINDER (hoàn thành >3 ngày chưa tự đánh giá)
    // ================================================================
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString()

    const { data: needSelfEval } = await supabase
      .from('tasks')
      .select('id, code, name, assignee_id, updated_at')
      .eq('status', 'finished')
      .eq('self_evaluation_status', 'none')
      .lt('updated_at', threeDaysAgo)

    for (const task of needSelfEval || []) {
      if (!task.assignee_id) continue
      const daysSinceFinished = Math.ceil((now.getTime() - new Date(task.updated_at).getTime()) / 86400000)

      const { data: emp } = await supabase
        .from('employees')
        .select('email, full_name')
        .eq('id', task.assignee_id)
        .single()

      if (emp?.email) {
        await sendEmail(supabase, emp.email, {
          subject: `[Huy Anh ERP] 📝 Nhắc tự đánh giá: ${task.name}`,
          html: buildSelfEvalReminderEmail(task, daysSinceFinished),
        })
        results.push(`self-eval: ${task.code} → ${emp.email} (${daysSinceFinished} ngày)`)
      }
    }

    // ================================================================
    // 4. APPROVAL REMINDER (chờ duyệt >2 ngày)
    // ================================================================
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString()

    const { data: pendingApproval } = await supabase
      .from('tasks')
      .select('id, code, name, assignee_id, assigner_id, department_id, updated_at')
      .eq('self_evaluation_status', 'pending_approval')
      .lt('updated_at', twoDaysAgo)

    for (const task of pendingApproval || []) {
      const daysSinceSubmitted = Math.ceil((now.getTime() - new Date(task.updated_at).getTime()) / 86400000)

      // Get assignee name
      const { data: assignee } = await supabase
        .from('employees')
        .select('full_name')
        .eq('id', task.assignee_id)
        .single()

      // Find approver (assigner or department manager)
      const approverId = task.assigner_id
      if (approverId) {
        const { data: approver } = await supabase
          .from('employees')
          .select('email, full_name')
          .eq('id', approverId)
          .single()

        if (approver?.email) {
          await sendEmail(supabase, approver.email, {
            subject: `[Huy Anh ERP] ⏳ Chờ phê duyệt: ${task.name}`,
            html: buildApprovalReminderEmail(task, daysSinceSubmitted, assignee?.full_name || 'N/A'),
          })
          results.push(`approval: ${task.code} → ${approver.email} (${daysSinceSubmitted} ngày)`)
        }
      }
    }

    // ================================================================
    // RESPONSE
    // ================================================================
    const summary = {
      timestamp: now.toISOString(),
      total_reminders: results.length,
      details: results,
    }

    console.log('Task Reminders:', JSON.stringify(summary, null, 2))

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Task Reminders Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ============================================================================
// HELPERS
// ============================================================================

async function sendEmail(supabase: any, to: string, options: { subject: string; html: string }) {
  // Use Supabase Edge Function send-email or direct SMTP
  // This calls the existing send-email function
  const { error } = await supabase.functions.invoke('send-email', {
    body: {
      to,
      subject: options.subject,
      html: options.html,
    },
  })

  if (error) {
    console.error(`Failed to send to ${to}:`, error)
  }
}

function buildDeadlineEmail(task: any, daysRemaining: number, assigneeName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">⏰ Công việc sắp đến hạn!</h2>
      <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
        <p><strong>Mã:</strong> ${task.code}</p>
        <p><strong>Tên:</strong> ${task.name}</p>
        <p><strong>Hạn:</strong> <span style="color: #dc2626; font-weight: bold;">${new Date(task.due_date).toLocaleDateString('vi-VN')}</span></p>
        <p><strong>Còn lại:</strong> <span style="font-size: 18px; font-weight: bold; color: #dc2626;">${daysRemaining} ngày</span></p>
        <p><strong>Tiến độ:</strong> ${task.progress || 0}%</p>
      </div>
      <a href="${APP_URL}/tasks/${task.id}" style="display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Xem công việc</a>
    </div>
  `
}

function buildOverdueEmail(task: any, daysOverdue: number, assigneeName: string, isManager = false): string {
  const title = isManager ? '🔴 Escalation: Nhân viên quá hạn' : '🔴 Công việc đã quá hạn!'
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">${title}</h2>
      <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #dc2626;">
        <p><strong>Mã:</strong> ${task.code}</p>
        <p><strong>Tên:</strong> ${task.name}</p>
        ${isManager ? `<p><strong>Người thực hiện:</strong> ${assigneeName}</p>` : ''}
        <p><strong>Hạn:</strong> ${new Date(task.due_date).toLocaleDateString('vi-VN')}</p>
        <p><strong>Quá hạn:</strong> <span style="font-size: 18px; font-weight: bold; color: #dc2626;">${daysOverdue} ngày</span></p>
        <p><strong>Tiến độ:</strong> ${task.progress || 0}%</p>
      </div>
      <a href="${APP_URL}/tasks/${task.id}" style="display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Xem công việc</a>
    </div>
  `
}

function buildSelfEvalReminderEmail(task: any, daysSinceFinished: number): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #d97706;">📝 Nhắc nhở tự đánh giá</h2>
      <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fbbf24;">
        <p><strong>Mã:</strong> ${task.code}</p>
        <p><strong>Tên:</strong> ${task.name}</p>
        <p><strong>Đã qua:</strong> <span style="font-weight: bold; color: #d97706;">${daysSinceFinished} ngày</span> chưa tự đánh giá</p>
      </div>
      <p>Bạn đã hoàn thành công việc nhưng chưa tự đánh giá. Vui lòng thực hiện để quản lý phê duyệt.</p>
      <a href="${APP_URL}/self-evaluation?task_id=${task.id}" style="display: inline-block; background-color: #D97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Tự đánh giá</a>
    </div>
  `
}

function buildApprovalReminderEmail(task: any, daysWaiting: number, assigneeName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">⏳ Công việc chờ phê duyệt</h2>
      <div style="background-color: #f5f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #c4b5fd;">
        <p><strong>Mã:</strong> ${task.code}</p>
        <p><strong>Tên:</strong> ${task.name}</p>
        <p><strong>Người thực hiện:</strong> ${assigneeName}</p>
        <p><strong>Chờ duyệt:</strong> <span style="font-weight: bold; color: #7c3aed;">${daysWaiting} ngày</span></p>
      </div>
      <p>Nhân viên đã tự đánh giá. Vui lòng phê duyệt.</p>
      <a href="${APP_URL}/approvals" style="display: inline-block; background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Phê duyệt</a>
    </div>
  `
}
