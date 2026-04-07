// =============================================================================
// EDGE FUNCTION: daily-mechanic-task
// Tự động tạo CV "Kiểm tra thiết bị đầu ca" cho đội Cơ khí mỗi ngày 6h sáng
// Deploy: npx supabase functions deploy daily-mechanic-task --no-verify-jwt
// Cron: 0 6 * * * (6h sáng mỗi ngày, giờ VN = 23:00 UTC ngày trước)
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CHUNG_ID = '5ccb9562-1c9d-4564-a847-21d1f6d9a3d7' // Đặng Quang Chung - TP
const DEPT_ID = 'd0000000-0000-0000-0000-000000000002'   // Phòng QLSX

// 13 NV đội cơ khí
const PARTICIPANTS = [
  '5630503a-85a3-4c74-ac8e-43b681ea001f', // Châu Quốc Vịnh
  '495d9000-c0c5-4777-83b7-504f0b098957', // Hoàng Văn Anh
  'e4985344-713f-4921-b8f5-0687fdd64b6d', // Hoàng Xuân Quang
  'f834eee6-137e-407b-a0d7-1fb252ef9b91', // Lê Văn Hòa
  '388dc031-b7c9-4997-ac6a-7d3e1d4e2ca2', // Mai Bá Trung
  '02a6b75d-d28e-471a-9d29-def8d1bf6dfd', // Ngô Quý Trường Sơn
  '70037da0-3e3a-46e0-b012-4e343ff1be54', // Nguyễn Hào
  '5d7e69e8-f54f-426e-864a-332e361cfdcd', // Nguyễn Mạnh Thắng
  '9c6761c5-22f6-4141-a42f-bfc1cb3b4b90', // Nguyễn Quang Quốc
  'ffcc6128-a5c0-43a4-abb0-1cee029a2114', // Nguyễn Văn Cương
  '239295cb-c070-4d27-b5aa-6bfde029ce18', // Nguyễn Văn Cường
  '1a1ab5ea-f1a2-40ab-b3cc-5e7e6438fca1', // Phạm Bá Vinh
  '9cdcad95-fb04-448d-bd9a-8933302ad660', // Võ Văn Hoài
]

const CHECKLIST = [
  'Kiểm tra máy cán (dầu, nhiệt độ, dây đai) - Chụp đồng hồ nhiệt độ',
  'Kiểm tra máy ép (áp suất, khuôn, xi lanh) - Chụp đồng hồ áp',
  'Kiểm tra máy sấy (quạt, lò, nhiệt kế) - Chụp bảng nhiệt',
  'Kiểm tra hệ thống điện (tủ điện, CB, dây) - Chụp tủ điện',
  'Kiểm tra hệ thống nước (bơm, van, ống) - Chụp đồng hồ nước',
  'Ghi nhận bất thường (nếu có) - Chụp vị trí hư hỏng',
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Ngày hôm nay (VN timezone)
    const now = new Date()
    const vnDate = new Date(now.getTime() + 7 * 3600000) // UTC+7
    const dateStr = vnDate.toISOString().split('T')[0]
    const dayLabel = vnDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })

    // Check đã tạo CV hôm nay chưa (tránh duplicate)
    const code = `CK-${dateStr.replace(/-/g, '')}`
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ skip: true, message: `CV ${code} đã tồn tại` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Tạo task
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        code,
        name: `Kiểm tra thiết bị đầu ca ${dayLabel} - Đội Cơ khí`,
        description: `CV tự động tạo hàng ngày. Đội Cơ khí kiểm tra toàn bộ thiết bị trước ca sản xuất.`,
        status: 'draft',
        priority: 'medium',
        difficulty: 'normal',
        progress: 0,
        progress_mode: 'manual',
        task_source: 'recurring',
        assignee_id: CHUNG_ID,
        assigner_id: CHUNG_ID,
        department_id: DEPT_ID,
        start_date: dateStr,
        due_date: dateStr,
        notes: 'Tự động tạo 6h sáng hàng ngày',
      })
      .select('id')
      .single()

    if (taskErr) throw new Error(`Task create error: ${taskErr.message}`)

    // Update status to in_progress (task created as draft to pass validation)
    try {
      await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id)
    } catch {
      // Trigger may block — task stays as draft, still usable
      console.log('Note: could not set in_progress, task stays as draft')
    }

    // Tạo checklist
    const checklistRows = CHECKLIST.map((title, idx) => ({
      task_id: task.id,
      title,
      sort_order: idx + 1,
      requires_evidence: true,
      is_completed: false,
    }))

    const { error: clErr } = await supabase
      .from('task_checklist_items')
      .insert(checklistRows)

    if (clErr) console.error('Checklist error:', clErr.message)

    // Thêm participants
    const participantRows = PARTICIPANTS.map(empId => ({
      task_id: task.id,
      employee_id: empId,
      role: 'participant',
      status: 'accepted',
    }))

    const { error: pErr } = await supabase
      .from('task_assignments')
      .insert(participantRows)

    if (pErr) console.error('Participant error:', pErr.message)

    console.log(`✅ Created ${code} with ${CHECKLIST.length} checklist + ${PARTICIPANTS.length} participants`)

    return new Response(JSON.stringify({
      success: true,
      code,
      task_id: task.id,
      checklist: CHECKLIST.length,
      participants: PARTICIPANTS.length,
      date: dateStr,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Daily mechanic task error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
