// ============================================================================
// EMAIL SERVICE - COMPLETE
// File: src/services/emailService.ts
// Huy Anh ERP System
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type EmailNotificationType =
  | 'task_assigned'
  | 'task_completed_reminder'
  | 'self_evaluation_submitted'
  | 'task_approved'
  | 'task_rejected'
  | 'revision_requested'
  | 'evaluation_received'
  | 'deadline_reminder'
  | 'project_issue_assigned'
  | 'task_overdue_escalation'
  | 'self_eval_reminder'
  | 'approval_reminder';

export type EmailStatus = 'pending' | 'sent' | 'failed';

export interface SendEmailInput {
  recipient_id: string;
  notification_type: EmailNotificationType;
  task_id?: string;
  additional_data?: Record<string, any>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const APP_URL = 'https://huyanhrubber.vn';

const RATING_LABELS: Record<string, string> = {
  excellent: 'Xuất sắc',
  good: 'Tốt',
  average: 'Trung bình',
  below_average: 'Cần cải thiện',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Khẩn cấp',
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

const EMAIL_TEMPLATES: Record<EmailNotificationType, {
  subject: (data: any) => string;
  content: (data: any) => string;
}> = {
  // Khi giao việc mới
  task_assigned: {
    subject: (data) => `[Huy Anh ERP] Công việc mới: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Bạn được giao công việc mới</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Người giao:</strong> ${data.assigner_name}</p>
          <p><strong>Phòng ban:</strong> ${data.department_name || 'Chưa xác định'}</p>
          <p><strong>Độ ưu tiên:</strong> ${PRIORITY_LABELS[data.priority] || 'Bình thường'}</p>
          ${data.due_date ? `<p><strong>Hạn hoàn thành:</strong> ${new Date(data.due_date).toLocaleDateString('vi-VN')}</p>` : ''}
        </div>
        ${data.description ? `<p><strong>Mô tả:</strong></p><p style="background-color: #fafafa; padding: 15px; border-left: 4px solid #3b82f6;">${data.description}</p>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng đăng nhập hệ thống để xem chi tiết và bắt đầu công việc.</p>
        <a href="${APP_URL}/tasks/${data.task_id}" style="display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem công việc
        </a>
      </div>
    `,
  },

  // Nhắc nhở tự đánh giá khi task hoàn thành
  task_completed_reminder: {
    subject: (data) => `[Huy Anh ERP] Hoàn thành tự đánh giá: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Công việc đã hoàn thành - Vui lòng tự đánh giá</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Ngày hoàn thành:</strong> ${data.completed_date ? new Date(data.completed_date).toLocaleDateString('vi-VN') : 'Hôm nay'}</p>
        </div>
        <p>Công việc của bạn đã được đánh dấu hoàn thành. Vui lòng hoàn thành <strong>tự đánh giá</strong> để quản lý có thể phê duyệt kết quả.</p>
        <a href="${APP_URL}/my-tasks" style="display: inline-block; background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Tự đánh giá ngay
        </a>
      </div>
    `,
  },

  // Khi nhân viên submit self-evaluation → GỬI CHO MANAGER
  self_evaluation_submitted: {
    subject: (data) => `[Huy Anh ERP] Tự đánh giá mới cần phê duyệt: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Có tự đánh giá mới cần phê duyệt</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Nhân viên:</strong> ${data.employee_name}</p>
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Điểm tự chấm:</strong> <span style="font-size: 18px; font-weight: bold; color: #059669;">${data.self_score || 'N/A'}</span></p>
          <p><strong>Mức độ hoàn thành:</strong> ${data.completion_percentage || 0}%</p>
          ${data.quality_assessment ? `<p><strong>Đánh giá chất lượng:</strong> ${RATING_LABELS[data.quality_assessment] || data.quality_assessment}</p>` : ''}
        </div>
        ${data.achievements ? `
          <p><strong>Thành tựu đạt được:</strong></p>
          <p style="background-color: #ecfdf5; padding: 15px; border-left: 4px solid #10b981;">${data.achievements}</p>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng đăng nhập hệ thống để xem xét và phê duyệt.</p>
        <a href="${APP_URL}/approvals" style="display: inline-block; background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Phê duyệt ngay
        </a>
      </div>
    `,
  },

  // Khi task được phê duyệt → GỬI CHO NHÂN VIÊN
  task_approved: {
    subject: (data) => `[Huy Anh ERP] ✅ Công việc đã được phê duyệt: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">🎉 Công việc của bạn đã được phê duyệt!</h2>
        <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #10b981;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Người phê duyệt:</strong> ${data.approver_name}</p>
          <p><strong>Điểm đánh giá:</strong> <span style="font-size: 24px; font-weight: bold; color: #059669;">${data.score}</span>/100</p>
          <p><strong>Xếp loại:</strong> ${RATING_LABELS[data.rating] || data.rating}</p>
        </div>
        ${data.comments ? `
          <p><strong>Nhận xét từ quản lý:</strong></p>
          <p style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #22c55e; font-style: italic;">"${data.comments}"</p>
        ` : ''}
        <p style="color: #6b7280;">Cảm ơn bạn đã hoàn thành tốt công việc!</p>
        <a href="${APP_URL}/my-tasks" style="display: inline-block; background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem chi tiết
        </a>
      </div>
    `,
  },

  // Khi task bị từ chối → GỬI CHO NHÂN VIÊN
  task_rejected: {
    subject: (data) => `[Huy Anh ERP] ❌ Công việc cần xem xét lại: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Công việc chưa được phê duyệt</h2>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Người từ chối:</strong> ${data.approver_name}</p>
        </div>
        <p><strong>Lý do từ chối:</strong></p>
        <p style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; color: #991b1b;">${data.rejection_reason}</p>
        ${data.comments ? `
          <p><strong>Nhận xét thêm:</strong></p>
          <p style="background-color: #fffbeb; padding: 15px; border-left: 4px solid #f59e0b;">"${data.comments}"</p>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng xem xét lại và cập nhật công việc theo yêu cầu.</p>
        <a href="${APP_URL}/my-tasks" style="display: inline-block; background-color: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem và chỉnh sửa
        </a>
      </div>
    `,
  },

  // Yêu cầu bổ sung thông tin → GỬI CHO NHÂN VIÊN
  revision_requested: {
    subject: (data) => `[Huy Anh ERP] ⚠️ Yêu cầu bổ sung: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">Yêu cầu bổ sung thông tin</h2>
        <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fcd34d;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Người yêu cầu:</strong> ${data.approver_name}</p>
        </div>
        <p><strong>Nội dung cần bổ sung:</strong></p>
        <p style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b;">${data.additional_request}</p>
        ${data.additional_deadline ? `
          <p><strong>⏰ Hạn bổ sung:</strong> ${new Date(data.additional_deadline).toLocaleDateString('vi-VN')}</p>
        ` : ''}
        ${data.comments ? `
          <p><strong>Ghi chú thêm:</strong></p>
          <p style="font-style: italic; color: #6b7280;">"${data.comments}"</p>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng cập nhật tự đánh giá theo yêu cầu và gửi lại.</p>
        <a href="${APP_URL}/my-tasks" style="display: inline-block; background-color: #F59E0B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Cập nhật ngay
        </a>
      </div>
    `,
  },

  // Nhận được đánh giá từ manager
  evaluation_received: {
    subject: (data) => `[Huy Anh ERP] Bạn có đánh giá mới: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Bạn nhận được đánh giá mới</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Công việc:</strong> ${data.task_name}</p>
          <p><strong>Người đánh giá:</strong> ${data.evaluator_name}</p>
          <p><strong>Điểm:</strong> <span style="font-size: 20px; font-weight: bold;">${data.score}</span>/100</p>
        </div>
        <a href="${APP_URL}/my-tasks" style="display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem chi tiết
        </a>
      </div>
    `,
  },

  // Báo cáo vấn đề dự án — gửi cho người xử lý
  project_issue_assigned: {
    subject: (data) => `[Huy Anh ERP] Vấn đề dự án cần xử lý: ${data.issue_title}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">⚠️ Vấn đề dự án cần bạn xử lý</h2>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
          <p><strong>Dự án:</strong> ${data.project_name}</p>
          <p><strong>Vấn đề:</strong> ${data.issue_title}</p>
          <p><strong>Mức độ:</strong> <span style="color: ${data.severity === 'critical' ? '#dc2626' : data.severity === 'high' ? '#ea580c' : '#d97706'}; font-weight: bold;">${data.severity_label}</span></p>
          <p><strong>Người báo cáo:</strong> ${data.reporter_name}</p>
          ${data.due_date ? `<p><strong>Hạn xử lý:</strong> <span style="color: #dc2626; font-weight: bold;">${new Date(data.due_date).toLocaleDateString('vi-VN')}</span></p>` : ''}
        </div>
        ${data.description ? `
          <p><strong>Mô tả chi tiết:</strong></p>
          <p style="background-color: #fafafa; padding: 15px; border-left: 4px solid #ef4444;">${data.description}</p>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>Vui lòng đăng nhập hệ thống để xem chi tiết và xử lý vấn đề này.</p>
        <a href="${APP_URL}/projects/${data.project_id}" style="display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem dự án
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
          Email này được gửi tự động từ hệ thống Huy Anh ERP khi có vấn đề dự án cần xử lý.
        </p>
      </div>
    `,
  },

  // Nhắc nhở deadline
  deadline_reminder: {
    subject: (data) => `[Huy Anh ERP] ⏰ Sắp đến hạn: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">⏰ Công việc sắp đến hạn!</h2>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Hạn hoàn thành:</strong> <span style="color: #dc2626; font-weight: bold;">${new Date(data.due_date).toLocaleDateString('vi-VN')}</span></p>
          <p><strong>Còn lại:</strong> <span style="font-size: 18px; font-weight: bold; color: #dc2626;">${data.days_remaining} ngày</span></p>
          <p><strong>Tiến độ hiện tại:</strong> ${data.progress || 0}%</p>
        </div>
        <p>Vui lòng hoàn thành công việc trước thời hạn.</p>
        <a href="${APP_URL}/tasks/${data.task_id}" style="display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem công việc
        </a>
      </div>
    `,
  },

  // Công việc quá hạn — escalate cho manager
  task_overdue_escalation: {
    subject: (data) => `[Huy Anh ERP] 🔴 Quá hạn: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">🔴 Công việc đã quá hạn!</h2>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #dc2626;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Người thực hiện:</strong> ${data.assignee_name || 'Chưa gán'}</p>
          <p><strong>Hạn hoàn thành:</strong> <span style="color: #dc2626; font-weight: bold;">${new Date(data.due_date).toLocaleDateString('vi-VN')}</span></p>
          <p><strong>Quá hạn:</strong> <span style="font-size: 18px; font-weight: bold; color: #dc2626;">${data.days_overdue} ngày</span></p>
          <p><strong>Tiến độ:</strong> ${data.progress || 0}%</p>
        </div>
        <p>Công việc này đã vượt quá thời hạn. Vui lòng kiểm tra và xử lý.</p>
        <a href="${APP_URL}/tasks/${data.task_id}" style="display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Xem công việc
        </a>
      </div>
    `,
  },

  // Nhắc tự đánh giá (đã hoàn thành >3 ngày chưa tự đánh giá)
  self_eval_reminder: {
    subject: (data) => `[Huy Anh ERP] 📝 Nhắc tự đánh giá: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">📝 Nhắc nhở tự đánh giá</h2>
        <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fbbf24;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Hoàn thành lúc:</strong> ${data.finished_at ? new Date(data.finished_at).toLocaleDateString('vi-VN') : '—'}</p>
          <p><strong>Đã qua:</strong> <span style="font-weight: bold; color: #d97706;">${data.days_since_finished} ngày</span> chưa tự đánh giá</p>
        </div>
        <p>Bạn đã hoàn thành công việc nhưng chưa tự đánh giá. Vui lòng thực hiện tự đánh giá để quản lý có thể phê duyệt.</p>
        <a href="${APP_URL}/self-evaluation?task_id=${data.task_id}" style="display: inline-block; background-color: #D97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Tự đánh giá ngay
        </a>
      </div>
    `,
  },

  // Nhắc manager phê duyệt (chờ duyệt >2 ngày)
  approval_reminder: {
    subject: (data) => `[Huy Anh ERP] ⏳ Chờ phê duyệt: ${data.task_name}`,
    content: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">⏳ Công việc chờ phê duyệt</h2>
        <div style="background-color: #f5f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #c4b5fd;">
          <p><strong>Mã công việc:</strong> ${data.task_code}</p>
          <p><strong>Tên công việc:</strong> ${data.task_name}</p>
          <p><strong>Người thực hiện:</strong> ${data.assignee_name}</p>
          <p><strong>Gửi đánh giá lúc:</strong> ${data.submitted_at ? new Date(data.submitted_at).toLocaleDateString('vi-VN') : '—'}</p>
          <p><strong>Chờ duyệt:</strong> <span style="font-weight: bold; color: #7c3aed;">${data.days_waiting} ngày</span></p>
        </div>
        <p>Nhân viên đã hoàn thành tự đánh giá. Vui lòng phê duyệt.</p>
        <a href="${APP_URL}/approvals" style="display: inline-block; background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Phê duyệt
        </a>
      </div>
    `,
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Lấy thông tin recipient
 */
async function getRecipientInfo(recipientId: string) {
  console.log('🔍 [emailService] getRecipientInfo for:', recipientId);
  
  // Query đơn giản, không join để tránh lỗi multiple relationships
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, email, department_id')
    .eq('id', recipientId)
    .single();

  if (error) {
    console.error('❌ [emailService] Query error:', error.message);
    return null;
  }
  
  if (!data) {
    console.error('❌ [emailService] No data returned for:', recipientId);
    return null;
  }

  // Lấy department riêng nếu cần
  let department = null;
  if (data.department_id) {
    const { data: deptData } = await supabase
      .from('departments')
      .select('id, name')
      .eq('id', data.department_id)
      .single();
    department = deptData;
  }

  console.log('✅ [emailService] Found recipient:', data.full_name, data.email);
  return {
    ...data,
    department,
  };
}

/**
 * Lấy thông tin task
 */
async function getTaskInfo(taskId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, code, name, description, status, priority, progress, due_date, department_id')
    .eq('id', taskId)
    .single();

  if (error || !data) {
    console.error('❌ [emailService] Could not find task:', taskId);
    return null;
  }

  // Lấy department riêng
  let department = null;
  if (data.department_id) {
    const { data: deptData } = await supabase
      .from('departments')
      .select('id, name')
      .eq('id', data.department_id)
      .single();
    department = deptData;
  }

  return {
    ...data,
    department,
  };
}

/**
 * Gửi email notification
 */
export async function sendNotificationEmail(input: SendEmailInput): Promise<{ success: boolean; error: Error | null }> {
  console.log('📧 [emailService] sendNotificationEmail:', input.notification_type);

  try {
    // Lấy thông tin người nhận
    const recipient = await getRecipientInfo(input.recipient_id);
    if (!recipient || !recipient.email) {
      throw new Error('Recipient not found or has no email');
    }

    // Lấy thông tin task nếu có
    let taskInfo = null;
    if (input.task_id) {
      taskInfo = await getTaskInfo(input.task_id);
    }

    // Chuẩn bị data cho template
    const templateData = {
      recipient_name: recipient.full_name,
      department_name: recipient.department?.name,
      task_id: taskInfo?.id,
      task_code: taskInfo?.code,
      task_name: taskInfo?.name,
      task_description: taskInfo?.description,
      app_url: APP_URL,
      ...input.additional_data,
    };

    // Lấy template
    const template = EMAIL_TEMPLATES[input.notification_type];
    if (!template) {
      throw new Error(`Unknown notification type: ${input.notification_type}`);
    }

    const subject = template.subject(templateData);
    const content = template.content(templateData);

    // DEBUG - Xem data gửi đi
    console.log('📧 [emailService] ====== EMAIL DEBUG ======');
    console.log('📧 [emailService] To:', recipient.email);
    console.log('📧 [emailService] Subject:', subject);
    console.log('📧 [emailService] Body length:', content?.length);
    console.log('📧 [emailService] Body preview:', content?.substring(0, 200));
    
    const payload = {
      to: recipient.email,
      subject,
      body: content,
    };
    
    console.log('📧 [emailService] Full payload:', JSON.stringify(payload, null, 2));

    // Gọi Supabase Edge Function để gửi email
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: payload,
    });
    
    console.log('📧 [emailService] Response data:', data);
    console.log('📧 [emailService] Response error:', error);

    if (error) {
      console.error('❌ [emailService] Edge Function error:', error);
      throw error;
    }

    console.log('✅ [emailService] Email sent successfully to:', recipient.email);
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ [emailService] Error sending notification email:', error);
    return { success: false, error: error as Error };
  }
}

// ============================================================================
// NOTIFICATION TRIGGERS
// ============================================================================

/**
 * Gửi thông báo khi giao việc mới
 */
export async function notifyTaskAssigned(
  taskId: string,
  assigneeId: string,
  assignerId: string,
  taskData?: {
    code?: string;
    name?: string;
    description?: string;
    priority?: string;
    due_date?: string;
  }
): Promise<void> {
  console.log('📧 [emailService] notifyTaskAssigned');
  
  try {
    const { data: assigner } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', assignerId)
      .single();

    await sendNotificationEmail({
      recipient_id: assigneeId,
      notification_type: 'task_assigned',
      task_id: taskId,
      additional_data: {
        assigner_name: assigner?.full_name || 'Không xác định',
        description: taskData?.description,
        priority: taskData?.priority,
        due_date: taskData?.due_date,
      },
    });
  } catch (error) {
    console.error('❌ [emailService] Error notifying task assigned:', error);
  }
}

/**
 * Gửi nhắc nhở tự đánh giá khi task hoàn thành
 */
export async function notifyTaskCompletedReminder(
  taskId: string,
  employeeId: string
): Promise<void> {
  console.log('📧 [emailService] notifyTaskCompletedReminder');
  
  try {
    await sendNotificationEmail({
      recipient_id: employeeId,
      notification_type: 'task_completed_reminder',
      task_id: taskId,
      additional_data: {
        completed_date: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ [emailService] Error notifying task completed:', error);
  }
}

/**
 * Gửi thông báo khi có self-evaluation mới → GỬI CHO MANAGER
 */
export async function notifySelfEvaluationSubmitted(
  taskId: string,
  employeeId: string,
  selfScore: number | null,
  completionPercentage: number,
  qualityAssessment?: string,
  achievements?: string
): Promise<void> {
  console.log('📧 [emailService] notifySelfEvaluationSubmitted - START');
  console.log('📧 [emailService] Task ID:', taskId);
  console.log('📧 [emailService] Employee ID:', employeeId);
  
  try {
    // Lấy thông tin employee
    const { data: employee } = await supabase
      .from('employees')
      .select('full_name, department_id')
      .eq('id', employeeId)
      .single();

    console.log('📧 [emailService] Employee:', employee?.full_name);

    // Lấy thông tin task để tìm người giao việc và department
    const { data: task } = await supabase
      .from('tasks')
      .select('assigner_id, department_id')
      .eq('id', taskId)
      .single();

    if (!task) {
      console.log('📧 [emailService] Task not found!');
      return;
    }

    console.log('📧 [emailService] Task assigner_id:', task.assigner_id);
    console.log('📧 [emailService] Task department_id:', task.department_id);

    // Dùng department của employee nếu task không có department
    const departmentId = task.department_id || employee?.department_id;
    
    const sentTo: string[] = [];

    // 1. Gửi cho người giao việc
    if (task.assigner_id) {
      console.log('📧 [emailService] Sending to assigner:', task.assigner_id);
      await sendNotificationEmail({
        recipient_id: task.assigner_id,
        notification_type: 'self_evaluation_submitted',
        task_id: taskId,
        additional_data: {
          employee_name: employee?.full_name || 'Nhân viên',
          self_score: selfScore,
          completion_percentage: completionPercentage,
          quality_assessment: qualityAssessment,
          achievements: achievements,
        },
      });
      sentTo.push(task.assigner_id);
    }

    // 2. Gửi cho Trưởng/Phó phòng của department (nếu khác người giao việc)
    if (departmentId) {
      console.log('📧 [emailService] Finding managers in department:', departmentId);
      
      // Lấy position IDs của Trưởng phòng và Phó phòng
      const { data: managerPositions } = await supabase
        .from('positions')
        .select('id, code')
        .in('code', ['TP', 'PP']);

      console.log('📧 [emailService] Manager positions found:', managerPositions);

      if (managerPositions && managerPositions.length > 0) {
        const positionIds = managerPositions.map(p => p.id);

        // Lấy managers trong phòng ban, loại trừ những người đã gửi
        const { data: managers } = await supabase
          .from('employees')
          .select('id, full_name, position_id')
          .eq('department_id', departmentId)
          .in('position_id', positionIds);

        console.log('📧 [emailService] Managers found in department:', managers);

        if (managers) {
          for (const manager of managers) {
            // Bỏ qua nếu đã gửi cho người này rồi
            if (sentTo.includes(manager.id)) {
              console.log('📧 [emailService] Skip (already sent):', manager.full_name);
              continue;
            }

            console.log('📧 [emailService] Sending to manager:', manager.full_name);
            await sendNotificationEmail({
              recipient_id: manager.id,
              notification_type: 'self_evaluation_submitted',
              task_id: taskId,
              additional_data: {
                employee_name: employee?.full_name || 'Nhân viên',
                self_score: selfScore,
                completion_percentage: completionPercentage,
                quality_assessment: qualityAssessment,
                achievements: achievements,
              },
            });
            sentTo.push(manager.id);
          }
        }
      }
    }

    console.log('📧 [emailService] notifySelfEvaluationSubmitted - DONE. Sent to:', sentTo.length, 'recipients');
  } catch (error) {
    console.error('❌ [emailService] Error notifying self-evaluation submitted:', error);
  }
}

/**
 * Gửi thông báo khi task được phê duyệt → GỬI CHO NHÂN VIÊN
 */
export async function notifyTaskApproved(
  taskId: string,
  employeeId: string,
  approverId: string,
  score: number,
  rating: string,
  comments?: string
): Promise<void> {
  console.log('📧 [emailService] notifyTaskApproved');
  
  try {
    const { data: approver } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', approverId)
      .single();

    await sendNotificationEmail({
      recipient_id: employeeId,
      notification_type: 'task_approved',
      task_id: taskId,
      additional_data: {
        approver_name: approver?.full_name || 'Quản lý',
        score,
        rating,
        comments,
      },
    });
  } catch (error) {
    console.error('❌ [emailService] Error notifying task approved:', error);
  }
}

/**
 * Gửi thông báo khi task bị từ chối → GỬI CHO NHÂN VIÊN
 */
export async function notifyTaskRejected(
  taskId: string,
  employeeId: string,
  approverId: string,
  rejectionReason: string,
  comments?: string
): Promise<void> {
  console.log('📧 [emailService] notifyTaskRejected');
  
  try {
    const { data: approver } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', approverId)
      .single();

    await sendNotificationEmail({
      recipient_id: employeeId,
      notification_type: 'task_rejected',
      task_id: taskId,
      additional_data: {
        approver_name: approver?.full_name || 'Quản lý',
        rejection_reason: rejectionReason,
        comments,
      },
    });
  } catch (error) {
    console.error('❌ [emailService] Error notifying task rejected:', error);
  }
}

/**
 * Gửi thông báo yêu cầu bổ sung → GỬI CHO NHÂN VIÊN
 */
export async function notifyRevisionRequested(
  taskId: string,
  employeeId: string,
  approverId: string,
  additionalRequest: string,
  additionalDeadline?: string,
  comments?: string
): Promise<void> {
  console.log('📧 [emailService] notifyRevisionRequested');
  
  try {
    const { data: approver } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', approverId)
      .single();

    await sendNotificationEmail({
      recipient_id: employeeId,
      notification_type: 'revision_requested',
      task_id: taskId,
      additional_data: {
        approver_name: approver?.full_name || 'Quản lý',
        additional_request: additionalRequest,
        additional_deadline: additionalDeadline,
        comments,
      },
    });
  } catch (error) {
    console.error('❌ [emailService] Error notifying revision requested:', error);
  }
}

/**
 * Gửi nhắc nhở deadline
 */
export async function notifyDeadlineReminder(
  taskId: string,
  employeeId: string,
  dueDate: string,
  daysRemaining: number,
  progress?: number
): Promise<void> {
  console.log('📧 [emailService] notifyDeadlineReminder');
  
  try {
    await sendNotificationEmail({
      recipient_id: employeeId,
      notification_type: 'deadline_reminder',
      task_id: taskId,
      additional_data: {
        due_date: dueDate,
        days_remaining: daysRemaining,
        progress: progress || 0,
      },
    });
  } catch (error) {
    console.error('❌ [emailService] Error notifying deadline reminder:', error);
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const emailService = {
  sendNotificationEmail,
  notifyTaskAssigned,
  notifyTaskCompletedReminder,
  notifySelfEvaluationSubmitted,
  notifyTaskApproved,
  notifyTaskRejected,
  notifyRevisionRequested,
  notifyDeadlineReminder,
};

export default emailService;