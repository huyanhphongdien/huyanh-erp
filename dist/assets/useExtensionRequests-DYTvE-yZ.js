import{u as d}from"./useQuery-D25hej-t.js";import{s as a,m as _}from"./index-Gbi2ncWH.js";import{u as c}from"./useMutation-Bxebw9s0.js";const q=2,o={async canRequestExtension(e,n){const{data:r,error:t}=await a.rpc("can_request_extension",{p_task_id:e,p_requester_id:n});if(t)throw console.error("Error checking extension eligibility:",t),new Error("Không thể kiểm tra điều kiện gia hạn");return!r||r.length===0?{can_request:!1,reason:"Không thể xác định điều kiện gia hạn",current_count:0,max_count:q}:r[0]},async getApprover(e){const{data:n,error:r}=await a.rpc("get_extension_approver",{p_requester_id:e});if(r)throw console.error("Error getting approver:",r),new Error("Không thể xác định người phê duyệt");return!n||n.length===0?null:n[0]},async createRequest(e){const n=await this.canRequestExtension(e.task_id,e.requester_id);if(!n.can_request)throw new Error(n.reason);const{data:r,error:t}=await a.from("task_extension_requests").insert({task_id:e.task_id,requester_id:e.requester_id,requester_level:e.requester_level,original_due_date:e.original_due_date,requested_due_date:e.requested_due_date,reason:e.reason,attachment_url:e.attachment_url||null,attachment_name:e.attachment_name||null,approver_id:e.approver_id,extension_number:n.current_count+1,status:"pending"}).select().single();if(t)throw console.error("Error creating extension request:",t),new Error("Không thể tạo yêu cầu gia hạn: "+t.message);return r},async createAndAutoApprove(e){const n=await this.createRequest(e),{data:r,error:t}=await a.from("task_extension_requests").update({status:"approved",approved_at:new Date().toISOString(),approver_comment:"Tự động duyệt (Ban Giám đốc)"}).eq("id",n.id).select().single();if(t)throw console.error("Error auto-approving:",t),new Error("Không thể tự động duyệt");return r},async approveOrReject(e){const n={status:e.status,approved_at:new Date().toISOString()};e.approver_comment&&(n.approver_comment=e.approver_comment);const{data:r,error:t}=await a.from("task_extension_requests").update(n).eq("id",e.id).eq("status","pending").select().single();if(t)throw console.error("Error approving/rejecting:",t),new Error("Không thể xử lý yêu cầu: "+t.message);return r},async cancelRequest(e){const{data:n,error:r}=await a.from("task_extension_requests").update({status:"cancelled"}).eq("id",e).eq("status","pending").select().single();if(r)throw console.error("Error cancelling request:",r),new Error("Không thể hủy yêu cầu");return n},async getPendingRequests(e){const{data:n,error:r}=await a.from("task_extension_requests").select(`
        *,
        task:tasks(
          id,
          name,
          code,
          status,
          department_id,
          department:departments(name)
        ),
        requester:employees!task_extension_requests_requester_id_fkey(
          id,
          full_name,
          code,
          position:positions(name, level)
        )
      `).eq("status","pending").eq("approver_id",e).order("created_at",{ascending:!1});if(r)throw console.error("Error fetching pending requests:",r),new Error("Không thể tải danh sách yêu cầu");return(n||[]).map(t=>({...t,task_name:t.task?.name,task_code:t.task?.code,task_status:t.task?.status,department_id:t.task?.department_id,department_name:t.task?.department?.name,requester_name:t.requester?.full_name,requester_code:t.requester?.code,requester_position:t.requester?.position?.name,requester_level:t.requester?.position?.level}))},async getPendingRequestsForManager(e){const{data:n,error:r}=await a.from("task_extension_requests").select(`
        *,
        task:tasks!inner(
          id,
          name,
          code,
          status,
          department_id,
          department:departments(name)
        ),
        requester:employees!task_extension_requests_requester_id_fkey(
          id,
          full_name,
          code,
          position:positions(name, level)
        )
      `).eq("status","pending").eq("task.department_id",e).order("created_at",{ascending:!1});if(r)throw console.error("Error fetching pending requests for manager:",r),new Error("Không thể tải danh sách yêu cầu");return(n||[]).map(t=>({...t,task_name:t.task?.name,task_code:t.task?.code,task_status:t.task?.status,department_id:t.task?.department_id,department_name:t.task?.department?.name,requester_name:t.requester?.full_name,requester_code:t.requester?.code,requester_position:t.requester?.position?.name,requester_level:t.requester?.position?.level}))},async getAllPendingRequests(){const{data:e,error:n}=await a.from("task_extension_requests").select(`
        *,
        task:tasks(
          id,
          name,
          code,
          status,
          department_id,
          department:departments(name)
        ),
        requester:employees!task_extension_requests_requester_id_fkey(
          id,
          full_name,
          code,
          position:positions(name, level)
        )
      `).eq("status","pending").order("created_at",{ascending:!1});if(n)throw console.error("Error fetching all pending requests:",n),new Error("Không thể tải danh sách yêu cầu");return(e||[]).map(r=>({...r,task_name:r.task?.name,task_code:r.task?.code,task_status:r.task?.status,department_id:r.task?.department_id,department_name:r.task?.department?.name,requester_name:r.requester?.full_name,requester_code:r.requester?.code,requester_position:r.requester?.position?.name,requester_level:r.requester?.position?.level}))},async getTaskExtensionHistory(e){const{data:n,error:r}=await a.from("task_extension_requests").select(`
        id,
        extension_number,
        original_due_date,
        requested_due_date,
        extension_days,
        reason,
        status,
        approver_comment,
        created_at,
        approved_at,
        requester:employees!task_extension_requests_requester_id_fkey(full_name),
        approver:employees!task_extension_requests_approver_id_fkey(full_name)
      `).eq("task_id",e).order("created_at",{ascending:!1});if(r)throw console.error("Error fetching extension history:",r),new Error("Không thể tải lịch sử gia hạn");return(n||[]).map(t=>({id:t.id,extension_number:t.extension_number,original_due_date:t.original_due_date,requested_due_date:t.requested_due_date,extension_days:t.extension_days,reason:t.reason,status:t.status,requester_name:t.requester?.full_name||"",approver_name:t.approver?.full_name||null,approver_comment:t.approver_comment,created_at:t.created_at,approved_at:t.approved_at}))},async getTaskPendingRequest(e){const{data:n,error:r}=await a.from("task_extension_requests").select("*").eq("task_id",e).eq("status","pending").maybeSingle();return r?(console.error("Error fetching pending request:",r),null):n},async countPendingRequests(e){const{count:n,error:r}=await a.from("task_extension_requests").select("*",{count:"exact",head:!0}).eq("status","pending").eq("approver_id",e);return r?(console.error("Error counting pending requests:",r),0):n||0},async countPendingRequestsByRole(e,n,r){try{if(n<=3){const{count:t,error:u}=await a.from("task_extension_requests").select("*",{count:"exact",head:!0}).eq("status","pending");if(u)throw u;return t||0}if(n<=5&&r){const{data:t,error:u}=await a.from("task_extension_requests").select(`
            id,
            approver_id,
            task:tasks!inner(department_id)
          `).eq("status","pending");if(u)throw u;return(t||[]).filter(i=>i.approver_id===e||i.task?.department_id===r).length}return 0}catch(t){return console.error("Error counting pending requests by role:",t),0}},async uploadAttachment(e,n){const r=e.name.split(".").pop(),u=`extension-attachments/${`${n}_${Date.now()}.${r}`}`,{data:l,error:i}=await a.storage.from("extension-attachments").upload(u,e,{cacheControl:"3600",upsert:!1});if(i)throw console.error("Error uploading file:",i),new Error("Không thể tải lên file: "+i.message);const{data:p}=a.storage.from("extension-attachments").getPublicUrl(l.path);return{url:p.publicUrl,name:e.name}},async getMyRequests(e){const{data:n,error:r}=await a.from("task_extension_requests").select(`
        *,
        task:tasks(
          id,
          name,
          code,
          status,
          department:departments(name)
        ),
        approver:employees!task_extension_requests_approver_id_fkey(
          full_name,
          position:positions(name)
        )
      `).eq("requester_id",e).order("created_at",{ascending:!1});if(r)throw console.error("Error fetching my requests:",r),new Error("Không thể tải danh sách yêu cầu");return(n||[]).map(t=>({...t,task_name:t.task?.name,task_code:t.task?.code,task_status:t.task?.status,department_name:t.task?.department?.name,approver_name:t.approver?.full_name,approver_position:t.approver?.position?.name}))}},s={all:["extensions"],pending:e=>[...s.all,"pending",e],pendingDept:e=>[...s.all,"pending-dept",e],pendingAll:()=>[...s.all,"pending-all"],history:e=>[...s.all,"history",e],canRequest:(e,n)=>[...s.all,"can-request",e,n],approver:e=>[...s.all,"approver",e],taskPending:e=>[...s.all,"task-pending",e],myRequests:e=>[...s.all,"my-requests",e],count:e=>[...s.all,"count",e]};function y(e,n){return d({queryKey:s.canRequest(e,n),queryFn:()=>o.canRequestExtension(e,n),enabled:!!e&&!!n,staleTime:30*1e3})}function f(e){return d({queryKey:s.approver(e),queryFn:()=>o.getApprover(e),enabled:!!e,staleTime:300*1e3})}function k(e){return d({queryKey:s.pending(e),queryFn:()=>o.getPendingRequests(e),enabled:!!e,refetchInterval:60*1e3})}function v(e){return d({queryKey:s.pendingDept(e),queryFn:()=>o.getPendingRequestsForManager(e),enabled:!!e,refetchInterval:60*1e3})}function x(){return d({queryKey:s.pendingAll(),queryFn:()=>o.getAllPendingRequests(),refetchInterval:60*1e3})}function w(){const e=_();return c({mutationFn:n=>o.createRequest(n),onSuccess:(n,r)=>{e.invalidateQueries({queryKey:s.all}),e.invalidateQueries({queryKey:s.canRequest(r.task_id,r.requester_id)}),e.invalidateQueries({queryKey:s.history(r.task_id)})}})}function E(){const e=_();return c({mutationFn:n=>o.createAndAutoApprove(n),onSuccess:(n,r)=>{e.invalidateQueries({queryKey:s.all}),e.invalidateQueries({queryKey:s.canRequest(r.task_id,r.requester_id)}),e.invalidateQueries({queryKey:s.history(r.task_id)}),e.invalidateQueries({queryKey:["tasks"]})}})}function R(){const e=_();return c({mutationFn:n=>o.approveOrReject(n),onSuccess:()=>{e.invalidateQueries({queryKey:s.all}),e.invalidateQueries({queryKey:["tasks"]})}})}function K(){return c({mutationFn:({file:e,requesterId:n})=>o.uploadAttachment(e,n)})}export{f as a,w as b,E as c,K as d,k as e,v as f,x as g,R as h,o as i,y as u};
