// ============================================================================
// TASK RECURRING GENERATOR — Supabase Edge Function
// Chay moi ngay luc 7:30 AM (Vietnam time), truoc task-reminders
// Tu dong tao task tu recurring rules + templates
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
  const createdTasks: string[] = []

  try {
    const now = new Date()

    // ================================================================
    // 1. Query active recurring rules that are due for generation
    // ================================================================
    const { data: rules, error: rulesError } = await supabase
      .from('task_recurring_rules')
      .select('*')
      .eq('is_active', true)
      .lte('next_generation_at', now.toISOString())

    if (rulesError) {
      throw new Error(`Failed to query recurring rules: ${rulesError.message}`)
    }

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({
        timestamp: now.toISOString(),
        message: 'No recurring rules due for generation',
        total_created: 0,
        details: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ================================================================
    // 2. Process each rule
    // ================================================================
    for (const rule of rules) {
      try {
        let template: any = null

        // 2a. Get template if template_id exists
        if (rule.template_id) {
          const { data: tmpl, error: tmplError } = await supabase
            .from('task_templates')
            .select('*')
            .eq('id', rule.template_id)
            .single()

          if (tmplError) {
            console.error(`Template not found for rule ${rule.id}: ${tmplError.message}`)
            continue
          }
          template = tmpl
        }

        // 2b. Build task data
        const dateSuffix = now.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })

        const taskName = template
          ? `${template.name} — ${dateSuffix}`
          : `${rule.name} — ${dateSuffix}`

        const durationDays = template?.default_duration_days || 7
        const dueDate = new Date(now.getTime() + durationDays * 86400000)

        // 2c. Xác định danh sách người được giao
        // Ưu tiên: assignee_ids (mảng) > assignee_id (đơn) > template default
        let assigneeList: (string | null)[] = []
        if (rule.assignee_ids && Array.isArray(rule.assignee_ids) && rule.assignee_ids.length > 0) {
          assigneeList = rule.assignee_ids
        } else if (rule.assignee_id) {
          assigneeList = [rule.assignee_id]
        } else if (template?.default_assignee_id) {
          assigneeList = [template.default_assignee_id]
        } else {
          assigneeList = [null] // Tạo 1 task không giao ai
        }

        // 2d. Tạo task cho từng người được giao
        for (const assigneeId of assigneeList) {
          const taskData = {
            name: taskName,
            description: template?.description || null,
            priority: template?.default_priority || 'medium',
            status: 'in_progress',
            progress: 1,
            due_date: dueDate.toISOString().split('T')[0],
            assignee_id: assigneeId,
            department_id: rule.department_id || template?.department_id || null,
            created_at: now.toISOString(),
          }

          const { data: newTask, error: taskError } = await supabase
            .from('tasks')
            .insert(taskData)
            .select('id, code, name')
            .single()

          if (taskError) {
            console.error(`Failed to create task for rule ${rule.id}, assignee ${assigneeId}: ${taskError.message}`)
            continue
          }

          // Tạo checklist items từ template
          let checklistItems = template?.checklist_items || []
          if (typeof checklistItems === 'string') {
            try { checklistItems = JSON.parse(checklistItems) } catch { checklistItems = [] }
          }
          if (Array.isArray(checklistItems) && checklistItems.length > 0) {
            const checklistData = checklistItems.map((item: any, index: number) => ({
              task_id: newTask.id,
              title: item.title,
              is_completed: false,
              sort_order: index,
            }))

            const { error: checklistError } = await supabase
              .from('task_checklist_items')
              .insert(checklistData)

            if (checklistError) {
              console.error(`Failed to create checklist for task ${newTask.id}: ${checklistError.message}`)
            }
          }

          createdTasks.push(newTask.code || newTask.id)
        } // end for assigneeList

        // 2e. Calculate next_generation_at based on frequency
        const nextGenerationAt = calculateNextGeneration(rule, now)

        // 2f. Update rule: last_generated_at + next_generation_at
        const { error: updateError } = await supabase
          .from('task_recurring_rules')
          .update({
            last_generated_at: now.toISOString(),
            next_generation_at: nextGenerationAt.toISOString(),
          })
          .eq('id', rule.id)

        if (updateError) {
          console.error(`Failed to update rule ${rule.id}: ${updateError.message}`)
        }

      } catch (ruleError) {
        console.error(`Error processing rule ${rule.id}:`, ruleError)
      }
    }

    // ================================================================
    // 3. Return summary
    // ================================================================
    const summary = {
      timestamp: now.toISOString(),
      total_created: createdTasks.length,
      total_rules_processed: rules.length,
      details: createdTasks,
    }

    console.log('Recurring Generator:', JSON.stringify(summary, null, 2))

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Recurring Generator Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate next generation date based on rule frequency.
 * Supported frequencies: daily, weekly, monthly
 */
function calculateNextGeneration(rule: any, from: Date): Date {
  const next = new Date(from)

  switch (rule.frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break

    case 'weekly':
      // Advance 7 days, then adjust to the target day_of_week if specified
      next.setDate(next.getDate() + 7)
      if (rule.day_of_week !== null && rule.day_of_week !== undefined) {
        // day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
        const currentDay = next.getDay()
        const targetDay = rule.day_of_week
        const diff = (targetDay - currentDay + 7) % 7
        next.setDate(next.getDate() + diff)
      }
      break

    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      if (rule.day_of_month !== null && rule.day_of_month !== undefined) {
        // Clamp to valid day for the month
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        next.setDate(Math.min(rule.day_of_month, maxDay))
      }
      break

    default:
      // Fallback: next day
      next.setDate(next.getDate() + 1)
      console.warn(`Unknown frequency "${rule.frequency}" for rule ${rule.id}, defaulting to daily`)
  }

  // Set time to 22:50 UTC (5:50 AM VN) — trước cron 23:00 UTC (6:00 AM VN)
  // Đảm bảo next_generation_at luôn < cron time để được pick up
  next.setUTCHours(22, 50, 0, 0)

  return next
}
