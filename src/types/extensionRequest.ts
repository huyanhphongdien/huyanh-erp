// ============================================================================
// EXTENSION REQUEST TYPES
// File: src/types/extensionRequest.ts
// Huy Anh ERP - Task Extension Request Types
// ============================================================================

export type ExtensionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ExtensionRequest {
  id: string;
  task_id: string;
  requester_id: string;
  requester_level: number;
  original_due_date: string;
  requested_due_date: string;
  extension_days: number;
  reason: string;
  attachment_url: string | null;
  attachment_name: string | null;
  status: ExtensionStatus;
  approver_id: string | null;
  approved_at: string | null;
  approver_comment: string | null;
  extension_number: number;
  created_at: string;
  updated_at: string;
}

export interface ExtensionRequestWithDetails extends ExtensionRequest {
  // Task info
  task_name?: string;
  task_code?: string;
  task_status?: string;
  department_id?: string;
  department_name?: string;
  // Requester info
  requester_name?: string;
  requester_code?: string;
  requester_position?: string;
  // Approver info
  approver_name?: string;
  approver_position?: string;
}

export interface CreateExtensionRequestInput {
  task_id: string;
  requester_id: string;
  requester_level: number;
  original_due_date: string;
  requested_due_date: string;
  reason: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  approver_id: string;
  extension_number: number;
}

export interface ApproveExtensionInput {
  id: string;
  status: 'approved' | 'rejected';
  approver_id: string;
  approver_comment?: string;
}

export interface ExtensionApprover {
  approver_id: string;
  approver_name: string;
  approver_level: number;
  approval_type: 'self' | 'manager' | 'executive';
}

export interface CanRequestExtensionResult {
  can_request: boolean;
  reason: string;
  current_count: number;
  max_count: number;
}

export interface ExtensionHistory {
  id: string;
  extension_number: number;
  original_due_date: string;
  requested_due_date: string;
  extension_days: number;
  reason: string;
  status: ExtensionStatus;
  requester_name: string;
  approver_name: string | null;
  approver_comment: string | null;
  created_at: string;
  approved_at: string | null;
}