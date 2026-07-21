// ============================================================================
// TASK RECURRING GENERATOR — Supabase Edge Function (viết lại 0.4, 21/07/2026)
// Chạy mỗi ngày 06:00 VN (23:00 UTC). Sinh task từ recurring rules + templates.
//
// SỬA so với bản cũ:
//  L1. biweekly rơi vào default → sinh mỗi ngày.  → CÓ nhánh biweekly riêng.
//  L2. KHÔNG chống trùng.                          → dedup qua unique index
//      (recurring_rule_id, recurring_date, assignee_id) — bắt lỗi 23505 đúng tên constraint.
//  L3. Tìm người giao query employees.position_level (cột KHÔNG tồn tại).
//                                                    → join positions.level, lọc trong JS.
//  + Cổng lọc NGÀY: chỉ sinh khi HÔM NAY (giờ VN) đúng lịch rule (thứ/ngày trong tháng).
//    Bản cũ chỉ lọc next_generation_at rồi sinh thẳng → sai ngày.
//  + Múi giờ VN chuẩn cho tên việc + recurring_date + due_date.
//  + monthly: clamp ngày 29/30/31 về ngày cuối tháng (tháng 2).
//  + Copy cờ requires_evidence từ template sang checklist.
//  + work_category từ template.category.
//  + ?dryRun=1 : chạy khô — KHÔNG ghi việc, KHÔNG đẩy lịch — trả về việc SẼ sinh.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ── Múi giờ VN: coi giờ tường VN như UTC-fields của một Date đã +7h ──────────
function vnNow(): Date {
  return new Date(Date.now() + 7 * 3600 * 1000)
}
function vnDateStr(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function vnDateSuffix(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

// ── Cổng lọc ngày: rule có đến hạn HÔM NAY (giờ VN) không? ───────────────────
function isDueToday(rule: any, vn: Date): boolean {
  const dow = vn.getUTCDay()   // 0=CN..6=T7 (giờ VN)
  const dom = vn.getUTCDate()

  switch (rule.frequency) {
    case 'daily':
      return true

    case 'weekly': {
      if (Array.isArray(rule.days_of_week) && rule.days_of_week.length > 0) {
        return rule.days_of_week.includes(dow)
      }
      if (rule.day_of_week !== null && rule.day_of_week !== undefined) {
        return Number(rule.day_of_week) === dow
      }
      return dow === 1 // weekly không rõ thứ → mặc định Thứ 2
    }

    case 'biweekly': {
      const targetDow = (rule.day_of_week ?? 1) as number
      if (targetDow !== dow) return false
      // parity tuần tính từ epoch — 2 tuần/lần
      const dayNo = Math.floor(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) / 86400000)
      const weekNo = Math.floor((dayNo + 3) / 7)
      return weekNo % 2 === 0
    }

    case 'monthly': {
      if (rule.day_of_month !== null && rule.day_of_month !== undefined) {
        const maxDay = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, 0)).getUTCDate()
        const target = Math.min(Number(rule.day_of_month), maxDay) // ngày 30/31 → ngày cuối tháng 2
        return dom === target
      }
      return dom === 1 // monthly không rõ ngày → ngày 1
    }

    default:
      // Tần suất lạ → KHÔNG sinh (bản cũ mặc định daily = lỗi)
      console.warn(`Tần suất lạ "${rule.frequency}" rule ${rule.id} — bỏ qua.`)
      return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const now = new Date()
  const vn = vnNow()
  const today = vnDateStr(vn)
  const suffix = vnDateSuffix(vn)

  const created: string[] = []
  const wouldCreate: any[] = []
  const skippedDup: string[] = []
  const skippedNotDue: string[] = []

  try {
    // Đọc TẤT CẢ rule đang bật (chỉ ~8, sẽ ~85 — vẫn rẻ). KHÔNG lọc next_generation_at.
    const { data: rules, error: rulesError } = await supabase
      .from('task_recurring_rules')
      .select('*')
      .eq('is_active', true)
    if (rulesError) throw new Error(`Query rules: ${rulesError.message}`)

    for (const rule of rules ?? []) {
      try {
        // ── Cổng lọc ngày ──
        if (!isDueToday(rule, vn)) { skippedNotDue.push(rule.name); continue }

        // ── Template ──
        let template: any = null
        if (rule.template_id) {
          const { data: tmpl } = await supabase
            .from('task_templates').select('*').eq('id', rule.template_id)
            .eq('is_active', true).maybeSingle()
          if (!tmpl) { console.warn(`Template ${rule.template_id} (rule ${rule.id}) không tồn tại/tắt — bỏ.`); continue }
          template = tmpl
        }

        const taskName = template ? `${template.name} — ${suffix}` : `${rule.name} — ${suffix}`

        // ── Hạn chót theo tần suất ──
        let durationDays: number
        switch (rule.frequency) {
          case 'daily': durationDays = 0; break
          case 'weekly': durationDays = 2; break
          case 'biweekly': durationDays = 3; break
          default: durationDays = template?.default_duration_days || 7
        }
        const dueDate = new Date(vn)
        if (durationDays > 0) dueDate.setUTCDate(dueDate.getUTCDate() + durationDays)
        const dueDateStr = vnDateStr(dueDate)

        // ── Người được giao: assignee_ids > assignee_id > template default > [null] ──
        let assigneeList: (string | null)[] = []
        if (Array.isArray(rule.assignee_ids) && rule.assignee_ids.length > 0) assigneeList = rule.assignee_ids
        else if (rule.assignee_id) assigneeList = [rule.assignee_id]
        else if (template?.default_assignee_id) assigneeList = [template.default_assignee_id]
        else assigneeList = [null]

        for (const assigneeId of assigneeList) {
          // ── Phòng + người giao (L3: join positions.level, lọc JS) ──
          let deptId = rule.department_id || template?.department_id || null
          let assignerId: string | null = rule.created_by || null

          if (assigneeId) {
            const { data: emp } = await supabase
              .from('employees').select('department_id').eq('id', assigneeId).maybeSingle()
            if (emp?.department_id) {
              if (!deptId) deptId = emp.department_id
              if (!assignerId) {
                const { data: emps } = await supabase
                  .from('employees')
                  .select('id, position:positions(level)')
                  .eq('department_id', emp.department_id)
                  .eq('status', 'active')
                const managers = (emps ?? [])
                  .filter((e: any) => e.position?.level != null && e.position.level <= 5)
                  .sort((a: any, b: any) => a.position.level - b.position.level)
                if (managers.length) assignerId = managers[0].id
              }
            }
          }

          if (dryRun) {
            wouldCreate.push({ rule: rule.name, task: taskName, assignee_id: assigneeId,
              recurring_date: today, due_date: dueDateStr, assigner_id: assignerId,
              department_id: deptId, priority: template?.default_priority || 'medium' })
            continue
          }

          // ── INSERT task (dedup qua unique index) ──
          const taskData = {
            name: taskName,
            description: template?.description || null,
            priority: template?.default_priority || 'medium',
            status: 'in_progress',
            progress: 1,
            due_date: dueDateStr,
            assignee_id: assigneeId,
            assigner_id: assignerId,
            department_id: deptId,
            task_source: 'recurring',
            is_self_assigned: false,
            recurring_rule_id: rule.id,
            recurring_date: today,
            work_category: template?.category || null,
            created_at: now.toISOString(),
          }

          const { data: newTask, error: taskError } = await supabase
            .from('tasks').insert(taskData).select('id, code').single()

          if (taskError) {
            // Trùng đúng constraint dedup → đã sinh hôm nay, bỏ qua im lặng.
            if (taskError.code === '23505' && String(taskError.message).includes('uq_tasks_recurring_slot')) {
              skippedDup.push(`${rule.name} · ${assigneeId ?? 'no-assignee'}`)
              continue
            }
            // Lỗi khác (kể cả trùng tasks.code) → KHÔNG nuốt, log rõ.
            console.error(`INSERT task lỗi rule ${rule.id} assignee ${assigneeId}: [${taskError.code}] ${taskError.message}`)
            continue
          }

          // ── Checklist từ template + cờ ảnh ──
          let items = template?.checklist_items || []
          if (typeof items === 'string') { try { items = JSON.parse(items) } catch { items = [] } }
          if (Array.isArray(items) && items.length > 0) {
            const rows = items.map((it: any, i: number) => ({
              task_id: newTask.id,
              title: it.title,
              is_completed: false,
              sort_order: i,
              requires_evidence: !!it.requires_evidence,   // copy cờ ảnh
            }))
            const { error: clErr } = await supabase.from('task_checklist_items').insert(rows)
            if (clErr) console.error(`Checklist task ${newTask.id}: ${clErr.message}`)
          }

          created.push(newTask.code || newTask.id)
        } // end assigneeList

        // ── Cập nhật lịch (bỏ qua khi dryRun) ──
        if (!dryRun) {
          const nextGen = calculateNextGeneration(rule, vn)
          const { error: upErr } = await supabase
            .from('task_recurring_rules')
            .update({ last_generated_at: now.toISOString(), next_generation_at: nextGen.toISOString() })
            .eq('id', rule.id)
          if (upErr) console.error(`Update rule ${rule.id}: ${upErr.message}`)
        }

      } catch (ruleErr) {
        console.error(`Rule ${rule.id} lỗi:`, ruleErr)
      }
    }

    const summary = {
      dryRun,
      vn_today: today,
      total_rules: rules?.length ?? 0,
      total_created: created.length,
      skipped_not_due: skippedNotDue.length,
      skipped_duplicate: skippedDup.length,
      ...(dryRun ? { would_create: wouldCreate } : { created }),
      skipped_not_due_names: skippedNotDue,
      skipped_duplicate_names: skippedDup,
    }
    console.log('Recurring Generator:', JSON.stringify(summary))
    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Recurring Generator Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── Lịch chạy lần sau (chỉ để hiển thị; cổng thật là isDueToday) ─────────────
function calculateNextGeneration(rule: any, from: Date): Date {
  const next = new Date(from)
  switch (rule.frequency) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + 1); break
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7); break
    case 'biweekly':
      next.setUTCDate(next.getUTCDate() + 14); break   // L1: có nhánh riêng
    case 'monthly':
      next.setUTCDate(1)                                // tránh nhảy cóc qua tháng thiếu ngày
      next.setUTCMonth(next.getUTCMonth() + 1)
      if (rule.day_of_month != null) {
        const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
        next.setUTCDate(Math.min(Number(rule.day_of_month), maxDay))
      }
      break
    default:
      next.setUTCDate(next.getUTCDate() + 1)
  }
  next.setUTCHours(22, 50, 0, 0)
  return next
}
