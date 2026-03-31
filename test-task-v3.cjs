const{createClient}=require('@supabase/supabase-js')
const s=createClient('https://dygveetaatqllhjusyzz.supabase.co','sb_secret_vP1cQXw4fRNuLlmynw-6rQ_wrhYC95R')

async function fullTest() {
  console.log('========================================')
  console.log('  TASK V3 - FULL SYSTEM TEST')
  console.log('========================================\n')
  let pass=0, fail=0
  function ok(name,cond,detail){if(cond){pass++;console.log('  OK '+name)}else{fail++;console.log('  FAIL '+name+(detail?' - '+detail:''))}}

  // 1. DB COLUMNS
  console.log('[1] DATABASE')
  const {data:t1,error:e1}=await s.from('tasks').select('self_score,manager_score,final_score,task_source,evidence_count').limit(1)
  ok('tasks columns exist', !e1, e1?.message)
  const {data:t2,error:e2}=await s.from('task_checklist_items').select('requires_evidence,evidence_url').limit(1)
  ok('checklist evidence columns', !e2, e2?.message)
  const {data:t3,error:e3}=await s.from('task_templates').select('is_routine').limit(1)
  ok('templates.is_routine', !e3, e3?.message)
  const {data:t4,error:e4}=await s.from('task_approvals').select('deadline,auto_approved').limit(1)
  ok('approvals.deadline', !e4, e4?.message)

  // 2. PERFORMANCE CONFIG
  console.log('\n[2] PERFORMANCE CONFIG')
  const {data:pc}=await s.from('performance_salary_config').select('grade,grade_label,min_score,max_score').order('min_score',{ascending:false})
  ok('5 hang A-F', pc&&pc.length===5, pc?.length+' rows')
  if(pc) pc.forEach(p=>console.log('     '+p.grade+' ('+p.grade_label+') '+p.min_score+'-'+p.max_score))

  // 3. STORAGE
  console.log('\n[3] STORAGE')
  const {data:bk}=await s.storage.listBuckets()
  ok('task-evidence bucket', bk?.some(b=>b.name==='task-evidence'))

  // 4. BACKFILL
  console.log('\n[4] BACKFILL task_source')
  const {count:sw}=await s.from('tasks').select('id',{count:'exact',head:true}).eq('is_self_assigned',true).neq('task_source','self')
  ok('Self tasks source=self', sw===0, sw+' not backfilled')
  const {count:pw}=await s.from('tasks').select('id',{count:'exact',head:true}).not('project_id','is',null).neq('task_source','project')
  ok('Project tasks source=project', pw===0, pw+' not backfilled')

  // 5. TEMPLATES
  console.log('\n[5] TEMPLATES')
  const {data:tpl}=await s.from('task_templates').select('name,is_routine,is_active,checklist_items').eq('is_active',true)
  ok('Active templates exist', tpl&&tpl.length>0, tpl?.length+' templates')
  let routine=0
  if(tpl) tpl.forEach(t=>{if(t.is_routine)routine++})
  ok('Has routine templates', routine>0, routine+' routine')

  // 6. RECURRING RULES
  console.log('\n[6] RECURRING RULES')
  const {data:rules}=await s.from('task_recurring_rules').select('name,is_active,frequency,next_generation_at,last_generated_at,assignee_ids,assignee_id,template_id')
  ok('Rules exist', rules&&rules.length>0, rules?.length+' rules')
  if(rules) rules.forEach(r=>{
    const cnt=r.assignee_ids?r.assignee_ids.length:(r.assignee_id?1:0)
    ok('  '+r.name+' ('+r.frequency+', '+cnt+' NV)', r.is_active&&cnt>0)
    if(r.next_generation_at){
      const h=new Date(r.next_generation_at).getUTCHours()
      ok('  next_gen UTC hour=22', h===22, 'actual='+h)
    }
    if(r.last_generated_at){
      const days=Math.floor((Date.now()-new Date(r.last_generated_at).getTime())/86400000)
      ok('  Last run < 2 days ago', days<2, days+' days ago')
    } else {
      ok('  Has run at least once', false, 'never run')
    }
  })

  // 7. EDGE FUNCTION TEST
  console.log('\n[7] EDGE FUNCTION')
  try{
    const resp=await fetch('https://dygveetaatqllhjusyzz.supabase.co/functions/v1/task-recurring-generator',{
      method:'POST',
      headers:{'Authorization':'Bearer sb_secret_vP1cQXw4fRNuLlmynw-6rQ_wrhYC95R','Content-Type':'application/json'},
      body:'{}'
    })
    const result=await resp.json()
    ok('Response OK (status '+resp.status+')', resp.ok)
    ok('Created '+result.total_created+' tasks', result.total_created!==undefined)
    if(result.details&&result.details.length>0) console.log('     Tasks:', result.details.join(', '))
  }catch(err){ok('Edge Function callable', false, err.message)}

  // 8. EVALUATIONS
  console.log('\n[8] EVALUATIONS')
  const {count:evalCount}=await s.from('task_evaluations').select('id',{count:'exact',head:true})
  ok('Has evaluations', evalCount>0, evalCount+' records')
  const {count:pendingEval}=await s.from('tasks').select('id',{count:'exact',head:true}).eq('status','finished').in('evaluation_status',['none','pending_self_eval'])
  console.log('     Pending eval: '+pendingEval+' tasks')

  // 9. TASKS BY SOURCE
  console.log('\n[9] TASKS BY SOURCE')
  const sources=['assigned','self','recurring','project']
  for(const src of sources){
    const {count:c}=await s.from('tasks').select('id',{count:'exact',head:true}).eq('task_source',src)
    console.log('     '+src+': '+(c||0)+' tasks')
  }

  // 10. VIP
  console.log('\n[10] VIP EXCLUSION')
  const {data:v1}=await s.from('employees').select('full_name').eq('email','huylv@huyanhrubber.com').single()
  ok('VIP 1: '+(v1?.full_name||'?'), !!v1)
  const {data:v2}=await s.from('employees').select('full_name').eq('email','thuyht@huyanhrubber.com').single()
  ok('VIP 2: '+(v2?.full_name||'?'), !!v2)

  // 11. RECURRING TASKS CREATED
  console.log('\n[11] RECURRING TASKS')
  const {data:recTasks}=await s.from('tasks').select('code,name,status,created_at,due_date').eq('task_source','recurring').order('created_at',{ascending:false}).limit(5)
  ok('Has recurring tasks', recTasks&&recTasks.length>0, (recTasks?.length||0)+' tasks')
  if(recTasks) recTasks.forEach(t=>console.log('     '+t.code+' | '+t.status+' | '+(t.name||'').substring(0,40)+' | due:'+t.due_date))

  // SUMMARY
  console.log('\n========================================')
  console.log('  RESULT: '+pass+' PASS | '+fail+' FAIL')
  console.log('========================================')
  if(fail>0) console.log('\n  FIX cac muc FAIL truoc khi ap dung!')
  else console.log('\n  READY - San sang ap dung ngay mai!')
}
fullTest()
