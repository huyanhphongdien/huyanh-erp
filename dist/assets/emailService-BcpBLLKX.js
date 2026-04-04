import{c as p,s}from"./index-DmSylCUL.js";const m=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8",key:"7n84p3"}]],$=p("at-sign",m);const u=[["path",{d:"M3 5h.01",key:"18ugdj"}],["path",{d:"M3 12h.01",key:"nlz23k"}],["path",{d:"M3 19h.01",key:"noohij"}],["path",{d:"M8 5h13",key:"1pao27"}],["path",{d:"M8 12h13",key:"1za7za"}],["path",{d:"M8 19h13",key:"m83p4d"}]],w=p("list",u);const f=[["path",{d:"M20 18v-2a4 4 0 0 0-4-4H4",key:"5vmcpk"}],["path",{d:"m9 17-5-5 5-5",key:"nvlc11"}]],A=p("reply",f),o="https://huyanhrubber.vn",g={excellent:"Xuất sắc",good:"Tốt",average:"Trung bình",below_average:"Cần cải thiện"},y={critical:"Khẩn cấp",high:"Cao",medium:"Trung bình",low:"Thấp"},x={task_assigned:{subject:n=>`[Huy Anh ERP] Công việc mới: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Bạn được giao công việc mới</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Người giao:</strong> ${n.assigner_name}</p>
          <p><strong>Phòng ban:</strong> ${n.department_name||"Chưa xác định"}</p>
          <p><strong>Độ ưu tiên:</strong> ${y[n.priority]||"Bình thường"}</p>
          ${n.due_date?`<p><strong>Hạn hoàn thành:</strong> ${new Date(n.due_date).toLocaleDateString("vi-VN")}</p>`:""}
        </div>
        ${n.description?`<p><strong>Mô tả:</strong></p><p style="background-color: #fafafa; padding: 15px; border-left: 4px solid #3b82f6;">${n.description}</p>`:""}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng đăng nhập hệ thống để xem chi tiết và bắt đầu công việc.</p>
        <a href="${o}/tasks/${n.task_id}" style="display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem công việc
        </a>
      </div>
    `},task_completed_reminder:{subject:n=>`[Huy Anh ERP] Hoàn thành tự đánh giá: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Công việc đã hoàn thành - Vui lòng tự đánh giá</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Ngày hoàn thành:</strong> ${n.completed_date?new Date(n.completed_date).toLocaleDateString("vi-VN"):"Hôm nay"}</p>
        </div>
        <p>Công việc của bạn đã được đánh dấu hoàn thành. Vui lòng hoàn thành <strong>tự đánh giá</strong> để quản lý có thể phê duyệt kết quả.</p>
        <a href="${o}/my-tasks" style="display: inline-block; background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Tự đánh giá ngay
        </a>
      </div>
    `},self_evaluation_submitted:{subject:n=>`[Huy Anh ERP] Tự đánh giá mới cần phê duyệt: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Có tự đánh giá mới cần phê duyệt</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Nhân viên:</strong> ${n.employee_name}</p>
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Điểm tự chấm:</strong> <span style="font-size: 18px; font-weight: bold; color: #059669;">${n.self_score||"N/A"}</span></p>
          <p><strong>Mức độ hoàn thành:</strong> ${n.completion_percentage||0}%</p>
          ${n.quality_assessment?`<p><strong>Đánh giá chất lượng:</strong> ${g[n.quality_assessment]||n.quality_assessment}</p>`:""}
        </div>
        ${n.achievements?`
          <p><strong>Thành tựu đạt được:</strong></p>
          <p style="background-color: #ecfdf5; padding: 15px; border-left: 4px solid #10b981;">${n.achievements}</p>
        `:""}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng đăng nhập hệ thống để xem xét và phê duyệt.</p>
        <a href="${o}/approvals" style="display: inline-block; background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Phê duyệt ngay
        </a>
      </div>
    `},task_approved:{subject:n=>`[Huy Anh ERP] ✅ Công việc đã được phê duyệt: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">🎉 Công việc của bạn đã được phê duyệt!</h2>
        <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #10b981;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Người phê duyệt:</strong> ${n.approver_name}</p>
          <p><strong>Điểm đánh giá:</strong> <span style="font-size: 24px; font-weight: bold; color: #059669;">${n.score}</span>/100</p>
          <p><strong>Xếp loại:</strong> ${g[n.rating]||n.rating}</p>
        </div>
        ${n.comments?`
          <p><strong>Nhận xét từ quản lý:</strong></p>
          <p style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #22c55e; font-style: italic;">"${n.comments}"</p>
        `:""}
        <p style="color: #6b7280;">Cảm ơn bạn đã hoàn thành tốt công việc!</p>
        <a href="${o}/my-tasks" style="display: inline-block; background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem chi tiết
        </a>
      </div>
    `},task_rejected:{subject:n=>`[Huy Anh ERP] ❌ Công việc cần xem xét lại: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Công việc chưa được phê duyệt</h2>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Người từ chối:</strong> ${n.approver_name}</p>
        </div>
        <p><strong>Lý do từ chối:</strong></p>
        <p style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; color: #991b1b;">${n.rejection_reason}</p>
        ${n.comments?`
          <p><strong>Nhận xét thêm:</strong></p>
          <p style="background-color: #fffbeb; padding: 15px; border-left: 4px solid #f59e0b;">"${n.comments}"</p>
        `:""}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng xem xét lại và cập nhật công việc theo yêu cầu.</p>
        <a href="${o}/my-tasks" style="display: inline-block; background-color: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem và chỉnh sửa
        </a>
      </div>
    `},revision_requested:{subject:n=>`[Huy Anh ERP] ⚠️ Yêu cầu bổ sung: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">Yêu cầu bổ sung thông tin</h2>
        <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fcd34d;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Người yêu cầu:</strong> ${n.approver_name}</p>
        </div>
        <p><strong>Nội dung cần bổ sung:</strong></p>
        <p style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b;">${n.additional_request}</p>
        ${n.additional_deadline?`
          <p><strong>⏰ Hạn bổ sung:</strong> ${new Date(n.additional_deadline).toLocaleDateString("vi-VN")}</p>
        `:""}
        ${n.comments?`
          <p><strong>Ghi chú thêm:</strong></p>
          <p style="font-style: italic; color: #6b7280;">"${n.comments}"</p>
        `:""}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng cập nhật tự đánh giá theo yêu cầu và gửi lại.</p>
        <a href="${o}/my-tasks" style="display: inline-block; background-color: #F59E0B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Cập nhật ngay
        </a>
      </div>
    `},evaluation_received:{subject:n=>`[Huy Anh ERP] Bạn có đánh giá mới: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Bạn nhận được đánh giá mới</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Công việc:</strong> ${n.task_name}</p>
          <p><strong>Người đánh giá:</strong> ${n.evaluator_name}</p>
          <p><strong>Điểm:</strong> <span style="font-size: 20px; font-weight: bold;">${n.score}</span>/100</p>
        </div>
        <a href="${o}/my-tasks" style="display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem chi tiết
        </a>
      </div>
    `},project_issue_assigned:{subject:n=>`[Huy Anh ERP] Vấn đề dự án cần xử lý: ${n.issue_title}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">⚠️ Vấn đề dự án cần bạn xử lý</h2>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
          <p><strong>Dự án:</strong> ${n.project_name}</p>
          <p><strong>Vấn đề:</strong> ${n.issue_title}</p>
          <p><strong>Mức độ:</strong> <span style="color: ${n.severity==="critical"?"#dc2626":n.severity==="high"?"#ea580c":"#d97706"}; font-weight: bold;">${n.severity_label}</span></p>
          <p><strong>Người báo cáo:</strong> ${n.reporter_name}</p>
          ${n.due_date?`<p><strong>Hạn xử lý:</strong> <span style="color: #dc2626; font-weight: bold;">${new Date(n.due_date).toLocaleDateString("vi-VN")}</span></p>`:""}
        </div>
        ${n.description?`
          <p><strong>Mô tả chi tiết:</strong></p>
          <p style="background-color: #fafafa; padding: 15px; border-left: 4px solid #ef4444;">${n.description}</p>
        `:""}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng đăng nhập hệ thống để xem chi tiết và xử lý vấn đề này.</p>
        <a href="${o}/projects/${n.project_id}" style="display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem dự án
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
          Email này được gửi tự động từ hệ thống Huy Anh ERP khi có vấn đề dự án cần xử lý.
        </p>
      </div>
    `},deadline_reminder:{subject:n=>`[Huy Anh ERP] ⏰ Sắp đến hạn: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">⏰ Công việc sắp đến hạn!</h2>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Hạn hoàn thành:</strong> <span style="color: #dc2626; font-weight: bold;">${new Date(n.due_date).toLocaleDateString("vi-VN")}</span></p>
          <p><strong>Còn lại:</strong> <span style="font-size: 18px; font-weight: bold; color: #dc2626;">${n.days_remaining} ngày</span></p>
          <p><strong>Tiến độ hiện tại:</strong> ${n.progress||0}%</p>
        </div>
        <p>Vui lòng hoàn thành công việc trước thời hạn.</p>
        <a href="${o}/tasks/${n.task_id}" style="display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem công việc
        </a>
      </div>
    `},task_overdue_escalation:{subject:n=>`[Huy Anh ERP] 🔴 Quá hạn: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">🔴 Công việc đã quá hạn!</h2>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #dc2626;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Người thực hiện:</strong> ${n.assignee_name||"Chưa gán"}</p>
          <p><strong>Hạn hoàn thành:</strong> <span style="color: #dc2626; font-weight: bold;">${new Date(n.due_date).toLocaleDateString("vi-VN")}</span></p>
          <p><strong>Quá hạn:</strong> <span style="font-size: 18px; font-weight: bold; color: #dc2626;">${n.days_overdue} ngày</span></p>
          <p><strong>Tiến độ:</strong> ${n.progress||0}%</p>
        </div>
        <p>Công việc này đã vượt quá thời hạn. Vui lòng kiểm tra và xử lý.</p>
        <a href="${o}/tasks/${n.task_id}" style="display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem công việc
        </a>
      </div>
    `},self_eval_reminder:{subject:n=>`[Huy Anh ERP] 📝 Nhắc tự đánh giá: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">📝 Nhắc nhở tự đánh giá</h2>
        <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fbbf24;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Hoàn thành lúc:</strong> ${n.finished_at?new Date(n.finished_at).toLocaleDateString("vi-VN"):"—"}</p>
          <p><strong>Đã qua:</strong> <span style="font-weight: bold; color: #d97706;">${n.days_since_finished} ngày</span> chưa tự đánh giá</p>
        </div>
        <p>Bạn đã hoàn thành công việc nhưng chưa tự đánh giá. Vui lòng thực hiện tự đánh giá để quản lý có thể phê duyệt.</p>
        <a href="${o}/self-evaluation?task_id=${n.task_id}" style="display: inline-block; background-color: #D97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Tự đánh giá ngay
        </a>
      </div>
    `},approval_reminder:{subject:n=>`[Huy Anh ERP] ⏳ Chờ phê duyệt: ${n.task_name}`,content:n=>`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">⏳ Công việc chờ phê duyệt</h2>
        <div style="background-color: #f5f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #c4b5fd;">
          <p><strong>Mã công việc:</strong> ${n.task_code}</p>
          <p><strong>Tên công việc:</strong> ${n.task_name}</p>
          <p><strong>Người thực hiện:</strong> ${n.assignee_name}</p>
          <p><strong>Gửi đánh giá lúc:</strong> ${n.submitted_at?new Date(n.submitted_at).toLocaleDateString("vi-VN"):"—"}</p>
          <p><strong>Chờ duyệt:</strong> <span style="font-weight: bold; color: #7c3aed;">${n.days_waiting} ngày</span></p>
        </div>
        <p>Nhân viên đã hoàn thành tự đánh giá. Vui lòng phê duyệt.</p>
        <a href="${o}/approvals" style="display: inline-block; background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Phê duyệt
        </a>
      </div>
    `}};async function b(n){console.log("🔍 [emailService] getRecipientInfo for:",n);const{data:e,error:t}=await s.from("employees").select("id, full_name, email, department_id").eq("id",n).single();if(t)return console.error("❌ [emailService] Query error:",t.message),null;if(!e)return console.error("❌ [emailService] No data returned for:",n),null;let i=null;if(e.department_id){const{data:r}=await s.from("departments").select("id, name").eq("id",e.department_id).single();i=r}return console.log("✅ [emailService] Found recipient:",e.full_name,e.email),{...e,department:i}}async function v(n){const{data:e,error:t}=await s.from("tasks").select("id, code, name, description, status, priority, progress, due_date, department_id").eq("id",n).single();if(t||!e)return console.error("❌ [emailService] Could not find task:",n),null;let i=null;if(e.department_id){const{data:r}=await s.from("departments").select("id, name").eq("id",e.department_id).single();i=r}return{...e,department:i}}async function _(n){console.log("📧 [emailService] sendNotificationEmail:",n.notification_type);try{const e=await b(n.recipient_id);if(!e||!e.email)throw new Error("Recipient not found or has no email");let t=null;n.task_id&&(t=await v(n.task_id));const i={recipient_name:e.full_name,department_name:e.department?.name,task_id:t?.id,task_code:t?.code,task_name:t?.name,task_description:t?.description,app_url:o,...n.additional_data},r=x[n.notification_type];if(!r)throw new Error(`Unknown notification type: ${n.notification_type}`);const l=r.subject(i),c=r.content(i);console.log("📧 [emailService] ====== EMAIL DEBUG ======"),console.log("📧 [emailService] To:",e.email),console.log("📧 [emailService] Subject:",l),console.log("📧 [emailService] Body length:",c?.length),console.log("📧 [emailService] Body preview:",c?.substring(0,200));const d={to:e.email,subject:l,body:c};console.log("📧 [emailService] Full payload:",JSON.stringify(d,null,2));const{data:h,error:a}=await s.functions.invoke("send-email",{body:d});if(console.log("📧 [emailService] Response data:",h),console.log("📧 [emailService] Response error:",a),a)throw console.error("❌ [emailService] Edge Function error:",a),a;return console.log("✅ [emailService] Email sent successfully to:",e.email),{success:!0,error:null}}catch(e){return console.error("❌ [emailService] Error sending notification email:",e),{success:!1,error:e}}}async function S(n,e,t,i){console.log("📧 [emailService] notifyTaskAssigned");try{const{data:r}=await s.from("employees").select("full_name").eq("id",t).single();await _({recipient_id:e,notification_type:"task_assigned",task_id:n,additional_data:{assigner_name:r?.full_name||"Không xác định",description:i?.description,priority:i?.priority,due_date:i?.due_date}})}catch(r){console.error("❌ [emailService] Error notifying task assigned:",r)}}export{$ as A,w as L,A as R,S as n,_ as s};
