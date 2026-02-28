// ============================================================================
// EXTENSION REQUEST SERVICE
// File: src/services/extensionService.ts
// Huy Anh ERP - Task Extension Request Service
// ============================================================================

import { supabase } from '../lib/supabase';
import type {
  ExtensionRequest,
  ExtensionRequestWithDetails,
  CreateExtensionRequestInput,
  ApproveExtensionInput,
  ExtensionApprover,
  CanRequestExtensionResult,
  ExtensionHistory,
} from '../types/extensionRequest';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_EXTENSIONS_PER_TASK = 2;

// ============================================================================
// MAIN SERVICE
// ============================================================================

export const extensionService = {
  // ==========================================================================
  // KIỂM TRA CÓ THỂ XIN GIA HẠN KHÔNG
  // ==========================================================================
  async canRequestExtension(
    taskId: string,
    requesterId: string
  ): Promise<CanRequestExtensionResult> {
    // Gọi database function
    const { data, error } = await supabase
      .rpc('can_request_extension', {
        p_task_id: taskId,
        p_requester_id: requesterId,
      });

    if (error) {
      console.error('Error checking extension eligibility:', error);
      throw new Error('Không thể kiểm tra điều kiện gia hạn');
    }

    if (!data || data.length === 0) {
      return {
        can_request: false,
        reason: 'Không thể xác định điều kiện gia hạn',
        current_count: 0,
        max_count: MAX_EXTENSIONS_PER_TASK,
      };
    }

    return data[0] as CanRequestExtensionResult;
  },

  // ==========================================================================
  // LẤY NGƯỜI PHÊ DUYỆT
  // ==========================================================================
  async getApprover(requesterId: string): Promise<ExtensionApprover | null> {
    const { data, error } = await supabase
      .rpc('get_extension_approver', {
        p_requester_id: requesterId,
      });

    if (error) {
      console.error('Error getting approver:', error);
      throw new Error('Không thể xác định người phê duyệt');
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0] as ExtensionApprover;
  },

  // ==========================================================================
  // TẠO YÊU CẦU GIA HẠN
  // ==========================================================================
  async createRequest(input: CreateExtensionRequestInput): Promise<ExtensionRequest> {
    // Kiểm tra điều kiện trước
    const canRequest = await this.canRequestExtension(input.task_id, input.requester_id);
    
    if (!canRequest.can_request) {
      throw new Error(canRequest.reason);
    }

    const { data, error } = await supabase
      .from('task_extension_requests')
      .insert({
        task_id: input.task_id,
        requester_id: input.requester_id,
        requester_level: input.requester_level,
        original_due_date: input.original_due_date,
        requested_due_date: input.requested_due_date,
        reason: input.reason,
        attachment_url: input.attachment_url || null,
        attachment_name: input.attachment_name || null,
        approver_id: input.approver_id,
        extension_number: canRequest.current_count + 1,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating extension request:', error);
      throw new Error('Không thể tạo yêu cầu gia hạn: ' + error.message);
    }

    return data as ExtensionRequest;
  },

  // ==========================================================================
  // TỰ ĐỘNG DUYỆT (CHO BAN GIÁM ĐỐC)
  // ==========================================================================
  async createAndAutoApprove(
    input: CreateExtensionRequestInput
  ): Promise<ExtensionRequest> {
    // Tạo request
    const request = await this.createRequest(input);

    // Tự động duyệt
    const { data, error } = await supabase
      .from('task_extension_requests')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approver_comment: 'Tự động duyệt (Ban Giám đốc)',
      })
      .eq('id', request.id)
      .select()
      .single();

    if (error) {
      console.error('Error auto-approving:', error);
      throw new Error('Không thể tự động duyệt');
    }

    return data as ExtensionRequest;
  },

  // ==========================================================================
  // PHÊ DUYỆT / TỪ CHỐI
  // ==========================================================================
  async approveOrReject(input: ApproveExtensionInput): Promise<ExtensionRequest> {
    const updateData: Record<string, any> = {
      status: input.status,
      approved_at: new Date().toISOString(),
    };

    if (input.approver_comment) {
      updateData.approver_comment = input.approver_comment;
    }

    const { data, error } = await supabase
      .from('task_extension_requests')
      .update(updateData)
      .eq('id', input.id)
      .eq('status', 'pending') // Chỉ update nếu đang pending
      .select()
      .single();

    if (error) {
      console.error('Error approving/rejecting:', error);
      throw new Error('Không thể xử lý yêu cầu: ' + error.message);
    }

    return data as ExtensionRequest;
  },

  // ==========================================================================
  // HỦY YÊU CẦU (BỞI NGƯỜI TẠO)
  // ==========================================================================
  async cancelRequest(requestId: string): Promise<ExtensionRequest> {
    const { data, error } = await supabase
      .from('task_extension_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) {
      console.error('Error cancelling request:', error);
      throw new Error('Không thể hủy yêu cầu');
    }

    return data as ExtensionRequest;
  },

  // ==========================================================================
  // LẤY DANH SÁCH CHỜ DUYỆT (CHO APPROVER)
  // ==========================================================================
  async getPendingRequests(approverId: string): Promise<ExtensionRequestWithDetails[]> {
    const { data, error } = await supabase
      .from('task_extension_requests')
      .select(`
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
      `)
      .eq('status', 'pending')
      .eq('approver_id', approverId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending requests:', error);
      throw new Error('Không thể tải danh sách yêu cầu');
    }

    // Transform data
    return (data || []).map((item: any) => ({
      ...item,
      task_name: item.task?.name,
      task_code: item.task?.code,
      task_status: item.task?.status,
      department_id: item.task?.department_id,
      department_name: item.task?.department?.name,
      requester_name: item.requester?.full_name,
      requester_code: item.requester?.code,
      requester_position: item.requester?.position?.name,
      requester_level: item.requester?.position?.level,
    }));
  },

  // ==========================================================================
  // LẤY DANH SÁCH PENDING CHO MANAGER (TRONG PHÒNG BAN)
  // ==========================================================================
  async getPendingRequestsForManager(
    departmentId: string
  ): Promise<ExtensionRequestWithDetails[]> {
    const { data, error } = await supabase
      .from('task_extension_requests')
      .select(`
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
      `)
      .eq('status', 'pending')
      .eq('task.department_id', departmentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending requests for manager:', error);
      throw new Error('Không thể tải danh sách yêu cầu');
    }

    return (data || []).map((item: any) => ({
      ...item,
      task_name: item.task?.name,
      task_code: item.task?.code,
      task_status: item.task?.status,
      department_id: item.task?.department_id,
      department_name: item.task?.department?.name,
      requester_name: item.requester?.full_name,
      requester_code: item.requester?.code,
      requester_position: item.requester?.position?.name,
      requester_level: item.requester?.position?.level,
    }));
  },

  // ==========================================================================
  // LẤY DANH SÁCH PENDING CHO EXECUTIVE (TẤT CẢ)
  // ==========================================================================
  async getAllPendingRequests(): Promise<ExtensionRequestWithDetails[]> {
    const { data, error } = await supabase
      .from('task_extension_requests')
      .select(`
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
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all pending requests:', error);
      throw new Error('Không thể tải danh sách yêu cầu');
    }

    return (data || []).map((item: any) => ({
      ...item,
      task_name: item.task?.name,
      task_code: item.task?.code,
      task_status: item.task?.status,
      department_id: item.task?.department_id,
      department_name: item.task?.department?.name,
      requester_name: item.requester?.full_name,
      requester_code: item.requester?.code,
      requester_position: item.requester?.position?.name,
      requester_level: item.requester?.position?.level,
    }));
  },

  // ==========================================================================
  // LẤY LỊCH SỬ GIA HẠN CỦA TASK
  // ==========================================================================
  async getTaskExtensionHistory(taskId: string): Promise<ExtensionHistory[]> {
    const { data, error } = await supabase
      .from('task_extension_requests')
      .select(`
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
      `)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching extension history:', error);
      throw new Error('Không thể tải lịch sử gia hạn');
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      extension_number: item.extension_number,
      original_due_date: item.original_due_date,
      requested_due_date: item.requested_due_date,
      extension_days: item.extension_days,
      reason: item.reason,
      status: item.status,
      requester_name: item.requester?.full_name || '',
      approver_name: item.approver?.full_name || null,
      approver_comment: item.approver_comment,
      created_at: item.created_at,
      approved_at: item.approved_at,
    }));
  },

  // ==========================================================================
  // LẤY YÊU CẦU PENDING CỦA TASK (NẾU CÓ)
  // ==========================================================================
  async getTaskPendingRequest(taskId: string): Promise<ExtensionRequest | null> {
    const { data, error } = await supabase
      .from('task_extension_requests')
      .select('*')
      .eq('task_id', taskId)
      .eq('status', 'pending')
      .maybeSingle();

    if (error) {
      console.error('Error fetching pending request:', error);
      return null;
    }

    return data as ExtensionRequest | null;
  },

  // ==========================================================================
  // ĐẾM SỐ YÊU CẦU CHỜ DUYỆT (CHO APPROVER CỤ THỂ)
  // ==========================================================================
  async countPendingRequests(approverId: string): Promise<number> {
    const { count, error } = await supabase
      .from('task_extension_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('approver_id', approverId);

    if (error) {
      console.error('Error counting pending requests:', error);
      return 0;
    }

    return count || 0;
  },

  // ==========================================================================
  // ĐẾM SỐ YÊU CẦU CHỜ DUYỆT THEO ROLE (CHO APPROVAL PAGE)
  // ==========================================================================
  async countPendingRequestsByRole(
    approverId: string,
    userLevel: number,
    departmentId: string | null
  ): Promise<number> {
    try {
      // Executive (Level 1-3): Xem tất cả
      if (userLevel <= 3) {
        const { count, error } = await supabase
          .from('task_extension_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        if (error) throw error;
        return count || 0;
      }

      // Manager (Level 4-5): Xem của department + assigned cho họ
      if (userLevel <= 5 && departmentId) {
        // Lấy tất cả pending requests với task info
        const { data, error } = await supabase
          .from('task_extension_requests')
          .select(`
            id,
            approver_id,
            task:tasks!inner(department_id)
          `)
          .eq('status', 'pending');

        if (error) throw error;

        // Đếm: requests được assign cho họ HOẶC trong department của họ
        const count = (data || []).filter((req: any) => 
          req.approver_id === approverId || 
          req.task?.department_id === departmentId
        ).length;

        return count;
      }

      // Employee: Không xem được
      return 0;
    } catch (error) {
      console.error('Error counting pending requests by role:', error);
      return 0;
    }
  },

  // ==========================================================================
  // UPLOAD FILE ĐÍNH KÈM
  // ==========================================================================
  async uploadAttachment(
    file: File,
    requesterId: string
  ): Promise<{ url: string; name: string }> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${requesterId}_${Date.now()}.${fileExt}`;
    const filePath = `extension-attachments/${fileName}`;

    const { data, error } = await supabase.storage
      .from('extension-attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading file:', error);
      throw new Error('Không thể tải lên file: ' + error.message);
    }

    // Lấy public URL
    const { data: urlData } = supabase.storage
      .from('extension-attachments')
      .getPublicUrl(data.path);

    return {
      url: urlData.publicUrl,
      name: file.name,
    };
  },

  // ==========================================================================
  // LẤY YÊU CẦU CỦA TÔI
  // ==========================================================================
  async getMyRequests(requesterId: string): Promise<ExtensionRequestWithDetails[]> {
    const { data, error } = await supabase
      .from('task_extension_requests')
      .select(`
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
      `)
      .eq('requester_id', requesterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching my requests:', error);
      throw new Error('Không thể tải danh sách yêu cầu');
    }

    return (data || []).map((item: any) => ({
      ...item,
      task_name: item.task?.name,
      task_code: item.task?.code,
      task_status: item.task?.status,
      department_name: item.task?.department?.name,
      approver_name: item.approver?.full_name,
      approver_position: item.approver?.position?.name,
    }));
  },
};

export default extensionService;