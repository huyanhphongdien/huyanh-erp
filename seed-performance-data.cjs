const{createClient}=require('@supabase/supabase-js')
const s=createClient('https://dygveetaatqllhjusyzz.supabase.co','sb_publishable_TmhOgRteyuVScb3v114oNw_UrZ_OKKQ')

async function seed() {
  console.log('=== SEED PERFORMANCE DATA ===\n')

  // 1. Get employees
  const {data: employees} = await s.from('employees').select('id, full_name, department_id').eq('status','active').limit(20)
  if (!employees || employees.length === 0) { console.log('No employees!'); return }
  console.log('Found', employees.length, 'employees')

  // 2. Get departments
  const {data: depts} = await s.from('departments').select('id, name')
  const deptMap = {}
  if (depts) depts.forEach(d => deptMap[d.id] = d.name)

  // 3. For each employee, create 3-5 evaluated tasks
  let taskCount = 0
  let evalCount = 0

  for (const emp of employees) {
    const numTasks = 3 + Math.floor(Math.random() * 3) // 3-5 tasks

    for (let i = 0; i < numTasks; i++) {
      const taskNames = [
        'Kiểm tra thiết bị định kỳ',
        'Báo cáo công việc tuần',
        'Bảo trì máy móc',
        'Kiểm kê kho hàng',
        'Trực ca sản xuất',
        'QC kiểm tra chất lượng',
        'Vệ sinh khu vực làm việc',
        'Chuẩn bị nguyên liệu',
        'Giao nhận hàng hóa',
        'Họp giao ban sáng',
      ]

      const name = taskNames[Math.floor(Math.random() * taskNames.length)]
      const selfScore = 60 + Math.floor(Math.random() * 41) // 60-100
      const managerScore = 50 + Math.floor(Math.random() * 51) // 50-100
      const finalScore = Math.round(selfScore * 0.4 + managerScore * 0.6)

      // Random date in March 2026
      const day = 1 + Math.floor(Math.random() * 25)
      const dueDay = day + 2 + Math.floor(Math.random() * 3)
      const completedDay = day + Math.floor(Math.random() * 4) // may be before or after due
      const onTime = completedDay <= dueDay

      const createdAt = `2026-03-${String(day).padStart(2,'0')}T08:00:00+07:00`
      const dueDate = `2026-03-${String(Math.min(dueDay, 28)).padStart(2,'0')}`
      const completedDate = `2026-03-${String(Math.min(completedDay, 27)).padStart(2,'0')}`

      // Create task
      const {data: task, error: tErr} = await s.from('tasks').insert({
        name: `${name} — ${emp.full_name.split(' ').pop()}`,
        status: 'finished',
        progress: 100,
        priority: ['low','medium','medium','high'][Math.floor(Math.random()*4)],
        assignee_id: emp.id,
        department_id: emp.department_id,
        due_date: dueDate,
        completed_date: completedDate,
        evaluation_status: 'approved',
        self_score: selfScore,
        created_at: createdAt,
      }).select('id, code').single()

      if (tErr) {
        // Skip if error (constraint violation etc)
        continue
      }
      taskCount++

      // Create evaluation
      const grade = finalScore >= 90 ? 'excellent' : finalScore >= 75 ? 'good' : finalScore >= 60 ? 'average' : 'below_average'

      const {error: eErr} = await s.from('task_evaluations').insert({
        task_id: task.id,
        employee_id: emp.id,
        evaluator_id: emp.id, // self for simplicity
        score: finalScore,
        rating: grade,
        created_at: completedDate + 'T17:00:00+07:00',
      })

      if (!eErr) evalCount++
    }

    process.stdout.write('.')
  }

  console.log('\n')
  console.log('Tasks created:', taskCount)
  console.log('Evaluations created:', evalCount)
  console.log('\n=== DONE ===')
}

seed().catch(e => console.error('ERROR:', e.message))
