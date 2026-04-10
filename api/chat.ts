// ============================================================================
// VERCEL SERVERLESS FUNCTION — AI Chat Proxy
// File: api/chat.ts
// Nhận câu hỏi tiếng Việt → gọi Claude API + Supabase tools → trả lời
// ============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// CONFIG
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const MODEL = 'claude-haiku-4-5-20251001' // Fast + cheap for chat

// ============================================================================
// SUPABASE CLIENT (service role — bypasses RLS for admin queries)
// ============================================================================

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS = [
  {
    name: 'query_attendance',
    description: 'Tra cứu chấm công theo tháng. Trả về tổng công, đi trễ, vắng, danh sách NV chưa check-in hôm nay. Dùng khi hỏi: "ai đi trễ", "công tháng", "ai chưa check-in", "tỉ lệ chuyên cần".',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number', description: 'Năm (mặc định năm nay)' },
        month: { type: 'number', description: 'Tháng (1-12, mặc định tháng này)' },
        employee_name: { type: 'string', description: 'Tên NV cần tra (tìm gần đúng, optional)' },
        query_type: { type: 'string', enum: ['monthly_summary', 'today_absent', 'late_ranking'], description: 'Loại query' },
      },
      required: ['query_type'],
    },
  },
  {
    name: 'query_employees',
    description: 'Tìm thông tin nhân viên: họ tên, mã NV, phòng ban, chức vụ, email. Dùng khi hỏi: "thông tin NV", "phòng ban nào", "bao nhiêu NV".',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Tên hoặc mã NV cần tìm (optional)' },
        department: { type: 'string', description: 'Tên phòng ban (optional)' },
        count_only: { type: 'boolean', description: 'Chỉ đếm số lượng (true/false)' },
      },
    },
  },
  {
    name: 'query_tasks',
    description: 'Tra cứu công việc/task: quá hạn, đang chạy, hoàn thành. Dùng khi hỏi: "task quá hạn", "công việc tuần này", "ai đang làm gì".',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['overdue', 'in_progress', 'completed', 'all'], description: 'Lọc theo status' },
        assignee_name: { type: 'string', description: 'Tên người được giao (optional)' },
        limit: { type: 'number', description: 'Số lượng kết quả (mặc định 10)' },
      },
      required: ['status'],
    },
  },
  {
    name: 'query_inventory',
    description: 'Tra cứu tồn kho: số tấn, vị trí kho. Dùng khi hỏi: "tồn kho SVR10", "còn bao nhiêu tấn", "kho nào còn hàng".',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_name: { type: 'string', description: 'Tên sản phẩm (SVR10, TSR, RSS..., optional)' },
      },
    },
  },
  {
    name: 'query_sales',
    description: 'Tra cứu doanh thu, đơn hàng bán. Dùng khi hỏi: "doanh thu tháng", "đơn hàng mới", "so sánh doanh thu".',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        query_type: { type: 'string', enum: ['monthly_revenue', 'order_count', 'top_customers'], description: 'Loại query' },
      },
      required: ['query_type'],
    },
  },
]

// ============================================================================
// TOOL HANDLERS
// ============================================================================

async function handleTool(name: string, input: any): Promise<string> {
  const sb = getSupabase()
  if (!sb) return JSON.stringify({ error: 'Supabase chưa cấu hình' })

  const now = new Date()
  const year = input.year || now.getFullYear()
  const month = input.month || (now.getMonth() + 1)
  const today = now.toISOString().split('T')[0]

  try {
    switch (name) {
      case 'query_attendance': {
        if (input.query_type === 'today_absent') {
          const { data: allEmp } = await sb.from('employees').select('id, code, full_name, department:departments!employees_department_id_fkey(name)').eq('status', 'active')
          const { data: todayAtt } = await sb.from('attendance').select('employee_id').eq('date', today)
          const checkedIn = new Set((todayAtt || []).map(a => a.employee_id))
          const absent = (allEmp || []).filter(e => !checkedIn.has(e.id)).map(e => ({
            name: e.full_name, code: e.code,
            dept: Array.isArray(e.department) ? e.department[0]?.name : (e.department as any)?.name,
          }))
          return JSON.stringify({ today, total_employees: allEmp?.length || 0, checked_in: checkedIn.size, absent_count: absent.length, absent_employees: absent.slice(0, 20) })
        }
        if (input.query_type === 'late_ranking') {
          const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
          const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`
          const { data: lateAtt } = await sb.from('attendance').select('employee_id, late_minutes').gte('date', monthStart).lte('date', monthEnd).gt('late_minutes', 0)
          const countMap: Record<string, number> = {}
          ;(lateAtt || []).forEach(a => { countMap[a.employee_id] = (countMap[a.employee_id] || 0) + 1 })
          const empIds = Object.keys(countMap)
          if (empIds.length === 0) return JSON.stringify({ month: `${month}/${year}`, late_employees: [] })
          const { data: emps } = await sb.from('employees').select('id, code, full_name').in('id', empIds)
          const ranking = (emps || []).map(e => ({ name: e.full_name, code: e.code, late_count: countMap[e.id] })).sort((a, b) => b.late_count - a.late_count).slice(0, 15)
          return JSON.stringify({ month: `${month}/${year}`, late_employees: ranking })
        }
        // monthly_summary
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
        const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`
        let query = sb.from('attendance').select('employee_id, work_units, late_minutes, status').gte('date', monthStart).lte('date', monthEnd)
        const { data: atts } = await query
        const empSet = new Set((atts || []).map(a => a.employee_id))
        const totalCong = (atts || []).reduce((s, a) => s + (a.work_units || 1), 0)
        const lateDays = (atts || []).filter(a => a.late_minutes > 0).length
        return JSON.stringify({ month: `${month}/${year}`, unique_employees: empSet.size, total_records: atts?.length || 0, total_cong: Math.round(totalCong * 10) / 10, total_late_records: lateDays })
      }

      case 'query_employees': {
        let query = sb.from('employees').select('id, code, full_name, email, department:departments!employees_department_id_fkey(name), position:positions!employees_position_id_fkey(name)').eq('status', 'active')
        if (input.search) query = query.ilike('full_name', `%${input.search}%`)
        if (input.count_only) {
          const { count } = await sb.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'active')
          return JSON.stringify({ total_active_employees: count })
        }
        const { data } = await query.order('full_name').limit(20)
        return JSON.stringify({ employees: (data || []).map(e => ({ name: e.full_name, code: e.code, email: e.email, dept: Array.isArray(e.department) ? e.department[0]?.name : (e.department as any)?.name, position: Array.isArray(e.position) ? e.position[0]?.name : (e.position as any)?.name })) })
      }

      case 'query_tasks': {
        let query = sb.from('tasks').select('id, name, code, status, due_date, priority, assignee:task_assignments(employee:employees(full_name))')
        if (input.status === 'overdue') {
          query = query.lt('due_date', today).not('status', 'in', '("completed","accepted","cancelled")')
        } else if (input.status === 'in_progress') {
          query = query.in('status', ['new', 'in_progress'])
        } else if (input.status === 'completed') {
          query = query.in('status', ['completed', 'accepted'])
        }
        const { data } = await query.order('due_date', { ascending: true }).limit(input.limit || 10)
        return JSON.stringify({ tasks: (data || []).map((t: any) => ({ name: t.name, code: t.code, status: t.status, due_date: t.due_date, priority: t.priority, assignees: (t.assignee || []).map((a: any) => a.employee?.full_name || a.employee?.[0]?.full_name).filter(Boolean) })) })
      }

      case 'query_inventory': {
        let query = sb.from('inventory').select('id, material:materials(name, code), warehouse:warehouses(name), quantity_kg, lot_number')
        if (input.product_name) query = query.ilike('materials.name', `%${input.product_name}%`)
        const { data } = await query.gt('quantity_kg', 0).order('quantity_kg', { ascending: false }).limit(20)
        const items = (data || []).map((i: any) => ({
          material: Array.isArray(i.material) ? i.material[0]?.name : i.material?.name,
          warehouse: Array.isArray(i.warehouse) ? i.warehouse[0]?.name : i.warehouse?.name,
          quantity_kg: i.quantity_kg,
          quantity_tons: Math.round(i.quantity_kg / 100) / 10,
          lot: i.lot_number,
        }))
        const totalKg = items.reduce((s: number, i: any) => s + (i.quantity_kg || 0), 0)
        return JSON.stringify({ items, total_kg: totalKg, total_tons: Math.round(totalKg / 100) / 10 })
      }

      case 'query_sales': {
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
        const monthEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
        if (input.query_type === 'monthly_revenue') {
          const { data } = await sb.from('sales_orders').select('total_value_usd, status').gte('order_date', monthStart).lt('order_date', monthEnd).not('status', 'eq', 'cancelled')
          const total = (data || []).reduce((s, o) => s + (o.total_value_usd || 0), 0)
          return JSON.stringify({ month: `${month}/${year}`, order_count: data?.length || 0, total_revenue_usd: Math.round(total), total_revenue_vnd: Math.round(total * 25000) })
        }
        if (input.query_type === 'top_customers') {
          const { data } = await sb.from('sales_orders').select('customer:sales_customers(name), total_value_usd').gte('order_date', monthStart).lt('order_date', monthEnd).not('status', 'eq', 'cancelled')
          const custMap: Record<string, number> = {}
          ;(data || []).forEach((o: any) => {
            const name = Array.isArray(o.customer) ? o.customer[0]?.name : o.customer?.name
            if (name) custMap[name] = (custMap[name] || 0) + (o.total_value_usd || 0)
          })
          const top = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, rev]) => ({ name, revenue_usd: Math.round(rev) }))
          return JSON.stringify({ month: `${month}/${year}`, top_customers: top })
        }
        return JSON.stringify({ error: 'Unknown sales query type' })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message })
  }
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `Bạn là trợ lý AI của hệ thống ERP Huy Anh Rubber (Công ty TNHH MTV Cao su Huy Anh Phong Điền).

Quy tắc:
- Trả lời bằng tiếng Việt, ngắn gọn, thân thiện
- Sử dụng tools để tra cứu dữ liệu thật từ hệ thống, KHÔNG bịa số liệu
- Khi hiện số tiền VNĐ: dùng dấu chấm ngăn hàng nghìn (VD: 12.500.000 VNĐ)
- Khi hiện USD: dùng dấu phẩy (VD: $125,000)
- Số tấn: 1 tấn = 1,000 kg
- Ký hiệu chấm công: HC=Hành chính, S=Ca sáng, C2=Ca chiều, Đ=Ca đêm, CT=Công tác, P=Nghỉ phép, X=Vắng, 2ca=2 ca
- Nếu không tìm thấy data, nói rõ "Không tìm thấy dữ liệu" thay vì đoán
- Nếu câu hỏi không liên quan ERP, trả lời ngắn rồi hướng về hệ thống`

// ============================================================================
// HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY chưa cấu hình. Thêm vào Vercel Environment Variables.' })
  }

  const { message, history = [] } = req.body
  if (!message) return res.status(400).json({ error: 'Missing message' })

  try {
    // Build messages
    const messages = [
      ...history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message },
    ]

    // First call — Claude may request tools
    let response = await callClaude(messages)
    let content = response.content

    // Tool use loop (max 3 iterations)
    for (let i = 0; i < 3; i++) {
      const toolUses = content.filter((c: any) => c.type === 'tool_use')
      if (toolUses.length === 0) break

      // Execute all tool calls
      const toolResults = await Promise.all(
        toolUses.map(async (tu: any) => ({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: await handleTool(tu.name, tu.input),
        }))
      )

      // Continue conversation with tool results
      messages.push({ role: 'assistant', content })
      messages.push({ role: 'user', content: toolResults })
      response = await callClaude(messages)
      content = response.content
    }

    // Extract final text
    const textBlocks = content.filter((c: any) => c.type === 'text')
    const answer = textBlocks.map((c: any) => c.text).join('\n')

    return res.status(200).json({ answer, model: response.model })
  } catch (err: any) {
    console.error('Chat API error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

async function callClaude(messages: any[]) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  })
  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Claude API ${resp.status}: ${errText}`)
  }
  return resp.json()
}
