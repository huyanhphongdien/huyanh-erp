import{s as i}from"./index-BEXYchCg.js";const k={async getParticipants(a){console.log("👥 [taskParticipantService] getParticipants for task:",a);try{const{data:t,error:r}=await i.from("task_assignments").select(`
          id,
          task_id,
          employee_id,
          role,
          status,
          note,
          invited_by,
          invitation_note,
          assigned_at,
          accepted_at,
          responded_at,
          created_at,
          employee:employees!task_assignments_employee_id_fkey(
            id,
            code,
            full_name,
            email,
            department_id,
            department:departments!employees_department_id_fkey(name),
            position:positions(name, level)
          ),
          inviter:employees!task_assignments_invited_by_fkey(full_name)
        `).eq("task_id",a).eq("role","participant").not("status","in","(removed,declined)").order("created_at",{ascending:!0});if(r)throw r;const n=(t||[]).map(e=>({id:e.id,task_id:e.task_id,employee_id:e.employee_id,role:e.role,status:e.status,note:e.note,invited_by:e.invited_by,invitation_note:e.invitation_note,assigned_at:e.assigned_at,accepted_at:e.accepted_at,responded_at:e.responded_at,created_at:e.created_at,employee_code:e.employee?.code,employee_name:e.employee?.full_name,employee_email:e.employee?.email,employee_department_id:e.employee?.department_id,employee_department_name:e.employee?.department?.name,employee_position_name:e.employee?.position?.name,employee_position_level:e.employee?.position?.level,inviter_name:e.inviter?.full_name}));return console.log("✅ [taskParticipantService] Found",n.length,"participants"),{data:n,error:null}}catch(t){return console.error("❌ [taskParticipantService] getParticipants error:",t),{data:[],error:t}}},async checkCanAddParticipant(a,t,r){console.log("🔍 [taskParticipantService] checkCanAddParticipant:",{requesterId:a,targetEmployeeId:t,taskId:r});try{const{data:n,error:e}=await i.from("employees").select(`
          id,
          department_id,
          position:positions(level)
        `).eq("id",a).single();if(e||!n)return{can_add:!1,add_type:null,reason:"Không tìm thấy thông tin người yêu cầu"};const{data:o,error:m}=await i.from("employees").select("id, department_id").eq("id",t).single();if(m||!o)return{can_add:!1,add_type:null,reason:"Không tìm thấy nhân viên"};const{data:c,error:u}=await i.from("tasks").select("id, department_id, assignee_id").eq("id",r).single();if(u||!c)return{can_add:!1,add_type:null,reason:"Không tìm thấy công việc"};const{data:d}=await i.from("task_assignments").select("id").eq("task_id",r).eq("employee_id",t).not("status","in","(removed,declined)").single();if(d)return{can_add:!1,add_type:null,reason:"Nhân viên đã là người tham gia"};if(c.assignee_id===t)return{can_add:!1,add_type:null,reason:"Nhân viên đã là người phụ trách chính"};const l=n.position?.level||99,_=n.department_id,p=o.department_id;return l<=3?{can_add:!0,add_type:"direct",reason:"Được phép thêm trực tiếp"}:l<=5?_===p?{can_add:!0,add_type:"direct",reason:"Được phép thêm trực tiếp (cùng phòng)"}:{can_add:!1,add_type:null,reason:"Chỉ được thêm nhân viên trong phòng ban của bạn"}:_===p?{can_add:!0,add_type:"request",reason:"Gửi yêu cầu tham gia"}:{can_add:!1,add_type:null,reason:"Chỉ được mời đồng nghiệp cùng phòng ban"}}catch(n){return console.error("❌ [taskParticipantService] checkCanAddParticipant error:",n),{can_add:!1,add_type:null,reason:"Có lỗi xảy ra"}}},async addParticipant(a){console.log("➕ [taskParticipantService] addParticipant:",a);try{const t=await this.checkCanAddParticipant(a.invited_by,a.employee_id,a.task_id);if(!t.can_add)return{success:!1,error:t.reason};const r=t.add_type==="direct"?"accepted":"pending",n=t.add_type==="direct"?new Date().toISOString():null,{data:e,error:o}=await i.from("task_assignments").insert({task_id:a.task_id,employee_id:a.employee_id,role:"participant",status:r,invited_by:a.invited_by,invitation_note:a.invitation_note||null,assigned_at:new Date().toISOString(),accepted_at:n}).select(`
          id,
          task_id,
          employee_id,
          role,
          status,
          invited_by,
          invitation_note,
          assigned_at,
          accepted_at,
          created_at,
          employee:employees!task_assignments_employee_id_fkey(
            code,
            full_name,
            department:departments!employees_department_id_fkey(name),
            position:positions(name, level)
          )
        `).single();if(o)throw o;return console.log("✅ [taskParticipantService] Added participant:",e.id,"status:",r),{success:!0,data:{id:e.id,task_id:e.task_id,employee_id:e.employee_id,role:e.role,status:e.status,invited_by:e.invited_by,invitation_note:e.invitation_note,assigned_at:e.assigned_at,accepted_at:e.accepted_at,created_at:e.created_at,employee_code:e.employee?.code,employee_name:e.employee?.full_name,employee_department_name:e.employee?.department?.name,employee_position_name:e.employee?.position?.name,employee_position_level:e.employee?.position?.level}}}catch(t){return console.error("❌ [taskParticipantService] addParticipant error:",t),{success:!1,error:t.message||"Không thể thêm người tham gia"}}},async removeParticipant(a){console.log("➖ [taskParticipantService] removeParticipant:",a);try{const{error:t}=await i.from("task_assignments").update({status:"removed",responded_at:new Date().toISOString()}).eq("id",a);if(t)throw t;return console.log("✅ [taskParticipantService] Removed participant:",a),{success:!0}}catch(t){return console.error("❌ [taskParticipantService] removeParticipant error:",t),{success:!1,error:t.message||"Không thể xóa người tham gia"}}},async getPendingRequests(a){console.log("📬 [taskParticipantService] getPendingRequests for:",a);try{const{data:t,error:r}=await i.from("task_assignments").select(`
          id,
          task_id,
          employee_id,
          invited_by,
          invitation_note,
          created_at,
          task:tasks(
            code,
            name,
            description,
            status,
            priority,
            due_date,
            progress
          ),
          inviter:employees!task_assignments_invited_by_fkey(
            full_name,
            code,
            department:departments!employees_department_id_fkey(name)
          )
        `).eq("employee_id",a).eq("status","pending").eq("role","participant").order("created_at",{ascending:!1});if(r)throw r;const n=(t||[]).map(e=>({id:e.id,task_id:e.task_id,employee_id:e.employee_id,invited_by:e.invited_by,invitation_note:e.invitation_note,requested_at:e.created_at,task_code:e.task?.code,task_name:e.task?.name,task_description:e.task?.description,task_status:e.task?.status,task_priority:e.task?.priority,task_due_date:e.task?.due_date,task_progress:e.task?.progress||0,inviter_name:e.inviter?.full_name,inviter_code:e.inviter?.code,inviter_department_name:e.inviter?.department?.name}));return console.log("✅ [taskParticipantService] Found",n.length,"pending requests"),{data:n,error:null}}catch(t){return console.error("❌ [taskParticipantService] getPendingRequests error:",t),{data:[],error:t}}},async countPendingRequests(a){try{const{count:t,error:r}=await i.from("task_assignments").select("id",{count:"exact",head:!0}).eq("employee_id",a).eq("status","pending").eq("role","participant");if(r)throw r;return t||0}catch(t){return console.error("❌ [taskParticipantService] countPendingRequests error:",t),0}},async acceptRequest(a){console.log("✅ [taskParticipantService] acceptRequest:",a);try{const{error:t}=await i.from("task_assignments").update({status:"accepted",accepted_at:new Date().toISOString(),responded_at:new Date().toISOString()}).eq("id",a);if(t)throw t;return console.log("✅ [taskParticipantService] Accepted request:",a),{success:!0}}catch(t){return console.error("❌ [taskParticipantService] acceptRequest error:",t),{success:!1,error:t.message||"Không thể chấp nhận yêu cầu"}}},async rejectRequest(a,t){console.log("❌ [taskParticipantService] rejectRequest:",a);try{const{error:r}=await i.from("task_assignments").update({status:"declined",note:t||null,responded_at:new Date().toISOString()}).eq("id",a);if(r)throw r;return console.log("✅ [taskParticipantService] Rejected request:",a),{success:!0}}catch(r){return console.error("❌ [taskParticipantService] rejectRequest error:",r),{success:!1,error:r.message||"Không thể từ chối yêu cầu"}}},async getAvailableEmployees(a,t){console.log("👥 [taskParticipantService] getAvailableEmployees for task:",a,"requester:",t);try{const{data:r,error:n}=await i.from("employees").select(`
          id,
          department_id,
          position:positions(level)
        `).eq("id",t).single();if(n)return console.error("❌ [taskParticipantService] Error fetching requester:",n),{data:[],error:new Error("Không tìm thấy thông tin người dùng")};if(!r)return console.error("❌ [taskParticipantService] Requester not found"),{data:[],error:new Error("Không tìm thấy thông tin người dùng")};console.log("✅ [taskParticipantService] Requester info:",r);const{data:e,error:o}=await i.from("tasks").select("id, assignee_id").eq("id",a).single();if(o||!e)return console.error("❌ [taskParticipantService] Task not found:",o),{data:[],error:new Error("Không tìm thấy công việc")};console.log("✅ [taskParticipantService] Task info:",e);const{data:m}=await i.from("task_assignments").select("employee_id").eq("task_id",a).not("status","in","(removed,declined)"),c=new Set;c.add(t),e.assignee_id&&c.add(e.assignee_id),m&&m.forEach(s=>{s.employee_id&&c.add(s.employee_id)}),console.log("📋 [taskParticipantService] Excluded IDs:",Array.from(c));const u=r.position?.level||99,d=r.department_id;console.log("👤 [taskParticipantService] Requester level:",u,"dept:",d);let l=i.from("employees").select(`
          id,
          code,
          full_name,
          email,
          department_id,
          department:departments!employees_department_id_fkey(name),
          position:positions(name, level)
        `).eq("status","active").order("full_name",{ascending:!0});u>3&&d&&(console.log("🔒 [taskParticipantService] Filtering by department:",d),l=l.eq("department_id",d));const{data:_,error:p}=await l;if(p)throw console.error("❌ [taskParticipantService] Query error:",p),p;console.log("📊 [taskParticipantService] Raw query returned:",_?.length||0,"employees");const y=(_||[]).filter(s=>!c.has(s.id));console.log("📊 [taskParticipantService] After filtering excluded:",y.length,"employees");const g=y.map(s=>({id:s.id,code:s.code,full_name:s.full_name,email:s.email,department_id:s.department_id,department_name:s.department?.name||"",position_name:s.position?.name,position_level:s.position?.level}));return console.log("✅ [taskParticipantService] Found",g.length,"available employees"),{data:g,error:null}}catch(r){return console.error("❌ [taskParticipantService] getAvailableEmployees error:",r),{data:[],error:r}}}};export{k as t};
