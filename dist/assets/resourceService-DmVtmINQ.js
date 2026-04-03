import{s as _}from"./index-DuaRnq-I.js";const E={owner:"Chủ dự án (PM)",co_owner:"Đồng quản lý",lead:"Trưởng nhóm",member:"Thành viên",reviewer:"Người review",observer:"Quan sát viên"},L={owner:"bg-purple-50 text-purple-700 border-purple-200",co_owner:"bg-indigo-50 text-indigo-700 border-indigo-200",lead:"bg-blue-50 text-blue-700 border-blue-200",member:"bg-green-50 text-green-700 border-green-200",reviewer:"bg-amber-50 text-amber-700 border-amber-200",observer:"bg-gray-50 text-gray-600 border-gray-200"},v={free:"bg-gray-100 text-gray-500",low:"bg-green-100 text-green-700",medium:"bg-blue-100 text-blue-700",high:"bg-amber-100 text-amber-700",over:"bg-red-100 text-red-700"},g=`
  *,
  employee:employees(
    id, full_name, employee_code:code, email, phone, avatar_url,
    department:departments!employees_department_id_fkey(id, name),
    position:positions(id, name)
  )
`,M=`
  *,
  employee:employees(
    id, full_name, employee_code:code, email, phone, avatar_url,
    department:departments!employees_department_id_fkey(id, name),
    position:positions(id, name)
  ),
  project:projects(
    id, code, name, status, planned_start, planned_end
  )
`;function S(r){return r<=0?v.free:r<=50?v.low:r<=80?v.medium:r<=100?v.high:v.over}const k={async addMember(r){const{project_id:i,employee_id:n,role:c="member",allocation_pct:p=100,start_date:a=null,end_date:m=null,responsibility:d=null}=r,{data:t}=await _.from("project_members").select("id, is_active").eq("project_id",i).eq("employee_id",n).maybeSingle();if(t){if(t.is_active)throw new Error("Nhân viên đã là thành viên dự án này");const{data:e,error:u}=await _.from("project_members").update({role:c,allocation_pct:p,start_date:a,end_date:m,responsibility:d,is_active:!0,left_at:null,joined_at:new Date().toISOString()}).eq("id",t.id).select(g).single();if(u)throw u;return e}const{data:s,error:o}=await _.from("project_members").insert({project_id:i,employee_id:n,role:c,allocation_pct:p,start_date:a,end_date:m,responsibility:d}).select(g).single();if(o)throw o;return s},async removeMember(r){const{error:i}=await _.from("project_members").update({is_active:!1,left_at:new Date().toISOString()}).eq("id",r);if(i)throw i},async deleteMember(r){const{error:i}=await _.from("project_members").delete().eq("id",r);if(i)throw i},async updateMember(r,i){const{data:n,error:c}=await _.from("project_members").update(i).eq("id",r).select(g).single();if(c)throw c;return n},async updateAllocation(r,i,n,c){const p={allocation_pct:i};n!==void 0&&(p.start_date=n),c!==void 0&&(p.end_date=c);const{data:a,error:m}=await _.from("project_members").update(p).eq("id",r).select(g).single();if(m)throw m;return a},async getMembers(r){const{project_id:i,role:n="all",is_active:c=!0,search:p}=r;let a=_.from("project_members").select(g).eq("project_id",i).order("role",{ascending:!0}).order("joined_at",{ascending:!0});n!=="all"&&(a=a.eq("role",n)),c!=="all"&&(a=a.eq("is_active",c));const{data:m,error:d}=await a;if(d)throw d;let t=m||[];if(p){const s=p.toLowerCase();t=t.filter(o=>o.employee?.full_name?.toLowerCase().includes(s)||o.employee?.employee_code?.toLowerCase().includes(s)||o.employee?.email?.toLowerCase().includes(s))}return t},async getMemberById(r){const{data:i,error:n}=await _.from("project_members").select(g).eq("id",r).maybeSingle();if(n)throw n;return i},async getEmployeeWorkload(r,i,n){const{data:c,error:p}=await _.from("employees").select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `).eq("id",r).single();if(p)throw p;let a=_.from("project_members").select(M).eq("employee_id",r).eq("is_active",!0);const{data:m,error:d}=await a;if(d)throw d;const s=(m||[]).filter(e=>{const u=e.project?.status;return!(!["planning","approved","in_progress"].includes(u||"")||i&&e.end_date&&e.end_date<i||n&&e.start_date&&e.start_date>n)}),o=s.reduce((e,u)=>e+(u.allocation_pct||0),0);return{employee_id:c.id,employee_name:c.full_name,employee_code:c.employee_code,department_name:c.department?.name||"",position_name:c.position?.name||"",avatar_url:c.avatar_url,total_allocation_pct:o,project_count:s.length,projects:s.map(e=>({project_id:e.project?.id||"",project_code:e.project?.code||"",project_name:e.project?.name||"",project_status:e.project?.status||"",role:e.role,allocation_pct:e.allocation_pct,start_date:e.start_date,end_date:e.end_date})),is_overallocated:o>100}},async getOverallocated(r=100){const{data:i,error:n}=await _.from("project_members").select(`
        employee_id,
        allocation_pct,
        role,
        start_date,
        end_date,
        project:projects(id, code, name, status)
      `).eq("is_active",!0);if(n)throw n;const c=(i||[]).filter(t=>{const s=t.project?.status;return["planning","approved","in_progress"].includes(s)}),p=new Map;for(const t of c){const s=t.employee_id;p.has(s)||p.set(s,{total:0,projects:[]});const o=p.get(s);o.total+=t.allocation_pct||0,o.projects.push({project_id:t.project?.id||"",project_code:t.project?.code||"",project_name:t.project?.name||"",project_status:t.project?.status||"",role:t.role,allocation_pct:t.allocation_pct,start_date:t.start_date,end_date:t.end_date})}const a=Array.from(p.entries()).filter(([,t])=>t.total>r).map(([t])=>t);if(a.length===0)return[];const{data:m,error:d}=await _.from("employees").select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `).in("id",a);if(d)throw d;return(m||[]).map(t=>{const s=p.get(t.id);return{employee_id:t.id,employee_name:t.full_name,employee_code:t.employee_code,department_name:t.department?.name||"",position_name:t.position?.name||"",avatar_url:t.avatar_url,total_allocation_pct:s.total,project_count:s.projects.length,projects:s.projects,is_overallocated:!0}}).sort((t,s)=>s.total_allocation_pct-t.total_allocation_pct)},async getDepartmentCapacity(r,i,n){const{data:c,error:p}=await _.from("employees").select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `).eq("department_id",r).eq("status","active");if(p)throw p;const a=c||[];if(a.length===0){const{data:l}=await _.from("departments").select("id, name").eq("id",r).single();return{department_id:r,department_name:l?.name||"",total_employees:0,allocated_employees:0,available_employees:0,overallocated_employees:0,avg_allocation_pct:0,employees:[]}}const m=a.map(l=>l.id),{data:d,error:t}=await _.from("project_members").select(`
        employee_id,
        allocation_pct,
        role,
        start_date,
        end_date,
        is_active,
        project:projects(id, code, name, status)
      `).in("employee_id",m).eq("is_active",!0);if(t)throw t;const s=new Map;for(const l of d||[]){const y=l.project?.status;if(!["planning","approved","in_progress"].includes(y)||i&&l.end_date&&l.end_date<i||n&&l.start_date&&l.start_date>n)continue;const f=l.employee_id;s.has(f)||s.set(f,[]),s.get(f).push({project_id:l.project?.id||"",project_code:l.project?.code||"",project_name:l.project?.name||"",project_status:l.project?.status||"",role:l.role,allocation_pct:l.allocation_pct,start_date:l.start_date,end_date:l.end_date})}const o=a.map(l=>{const y=s.get(l.id)||[],f=y.reduce((w,h)=>w+h.allocation_pct,0);return{employee_id:l.id,employee_name:l.full_name,employee_code:l.employee_code,department_name:l.department?.name||"",position_name:l.position?.name||"",avatar_url:l.avatar_url,total_allocation_pct:f,project_count:y.length,projects:y,is_overallocated:f>100}}),e=o.filter(l=>l.project_count>0).length,u=o.filter(l=>l.is_overallocated).length,b=o.reduce((l,y)=>l+y.total_allocation_pct,0),j=a.length>0?b/a.length:0;return{department_id:r,department_name:a[0]?.department?.name||"",total_employees:a.length,allocated_employees:e,available_employees:a.length-e,overallocated_employees:u,avg_allocation_pct:Math.round(j*10)/10,employees:o.sort((l,y)=>y.total_allocation_pct-l.total_allocation_pct)}},async getAvailableEmployees(r,i=80){let n=_.from("employees").select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `).eq("status","active");r&&(n=n.eq("department_id",r));const{data:c,error:p}=await n;if(p)throw p;const a=c||[];if(a.length===0)return[];const m=a.map(o=>o.id),{data:d,error:t}=await _.from("project_members").select(`
        employee_id,
        allocation_pct,
        project:projects(status)
      `).in("employee_id",m).eq("is_active",!0);if(t)throw t;const s=new Map;for(const o of d||[]){const e=o.project?.status;if(!["planning","approved","in_progress"].includes(e))continue;const u=o.employee_id;s.set(u,(s.get(u)||0)+(o.allocation_pct||0))}return a.map(o=>{const e=s.get(o.id)||0;return{employee_id:o.id,employee_name:o.full_name,employee_code:o.employee_code,department_name:o.department?.name||"",position_name:o.position?.name||"",avatar_url:o.avatar_url,current_allocation_pct:e,available_pct:Math.max(0,100-e)}}).filter(o=>o.current_allocation_pct<=i).sort((o,e)=>o.current_allocation_pct-e.current_allocation_pct)},async getProjectResourceStats(r){const i=await this.getMembers({project_id:r,is_active:"all"}),n=i.filter(d=>d.is_active),c={};let p=0;for(const d of n)c[d.role]=(c[d.role]||0)+1,p+=d.allocation_pct||0;let a=0;const m=new Set;for(const d of n)if(!m.has(d.employee_id)){m.add(d.employee_id);try{(await this.getEmployeeWorkload(d.employee_id)).is_overallocated&&a++}catch{}}return{total_members:i.length,active_members:n.length,by_role:c,avg_allocation:n.length>0?Math.round(p/n.length*10)/10:0,overallocated_count:a}},async searchEmployeesForProject(r,i,n){const{data:c}=await _.from("project_members").select("employee_id").eq("project_id",r).eq("is_active",!0),p=new Set((c||[]).map(e=>e.employee_id));let a=_.from("employees").select(`
        id, full_name, employee_code:code, avatar_url,
        department:departments!employees_department_id_fkey(id, name),
        position:positions(id, name)
      `).eq("status","active").limit(20);n&&(a=a.eq("department_id",n)),i&&(a=a.or(`full_name.ilike.%${i}%,code.ilike.%${i}%`));const{data:m,error:d}=await a;if(d)throw d;const t=(m||[]).map(e=>e.id),{data:s}=await _.from("project_members").select("employee_id, allocation_pct, project:projects(status)").in("employee_id",t).eq("is_active",!0),o=new Map;for(const e of s||[]){const u=e.project?.status;["planning","approved","in_progress"].includes(u)&&o.set(e.employee_id,(o.get(e.employee_id)||0)+(e.allocation_pct||0))}return(m||[]).map(e=>({id:e.id,full_name:e.full_name,employee_code:e.employee_code,department_name:e.department?.name||"",position_name:e.position?.name||"",avatar_url:e.avatar_url,current_allocation_pct:o.get(e.id)||0,already_member:p.has(e.id)}))}};export{L as M,E as a,S as g,k as r};
