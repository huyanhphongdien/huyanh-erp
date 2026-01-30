// ============================================================================
// USE EXTENSION REQUESTS HOOKS
// File: src/features/tasks/hooks/useExtensionRequests.ts
// Huy Anh ERP - React Query Hooks for Extension Requests
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extensionService } from '../../../services/extensionService';
import type {
  CreateExtensionRequestInput,
  ApproveExtensionInput,
} from '../../../types/extensionRequest';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const extensionKeys = {
  all: ['extensions'] as const,
  pending: (approverId: string) => [...extensionKeys.all, 'pending', approverId] as const,
  pendingDept: (deptId: string) => [...extensionKeys.all, 'pending-dept', deptId] as const,
  pendingAll: () => [...extensionKeys.all, 'pending-all'] as const,
  history: (taskId: string) => [...extensionKeys.all, 'history', taskId] as const,
  canRequest: (taskId: string, requesterId: string) => 
    [...extensionKeys.all, 'can-request', taskId, requesterId] as const,
  approver: (requesterId: string) => [...extensionKeys.all, 'approver', requesterId] as const,
  taskPending: (taskId: string) => [...extensionKeys.all, 'task-pending', taskId] as const,
  myRequests: (requesterId: string) => [...extensionKeys.all, 'my-requests', requesterId] as const,
  count: (approverId: string) => [...extensionKeys.all, 'count', approverId] as const,
};

// ============================================================================
// CHECK CAN REQUEST EXTENSION
// ============================================================================

export function useCanRequestExtension(taskId: string, requesterId: string) {
  return useQuery({
    queryKey: extensionKeys.canRequest(taskId, requesterId),
    queryFn: () => extensionService.canRequestExtension(taskId, requesterId),
    enabled: !!taskId && !!requesterId,
    staleTime: 30 * 1000, // 30s
  });
}

// ============================================================================
// GET APPROVER
// ============================================================================

export function useExtensionApprover(requesterId: string) {
  return useQuery({
    queryKey: extensionKeys.approver(requesterId),
    queryFn: () => extensionService.getApprover(requesterId),
    enabled: !!requesterId,
    staleTime: 5 * 60 * 1000, // 5 phút
  });
}

// ============================================================================
// GET PENDING REQUESTS (FOR APPROVER)
// ============================================================================

export function usePendingExtensionRequests(approverId: string) {
  return useQuery({
    queryKey: extensionKeys.pending(approverId),
    queryFn: () => extensionService.getPendingRequests(approverId),
    enabled: !!approverId,
    refetchInterval: 60 * 1000, // 1 phút
  });
}

// ============================================================================
// GET PENDING REQUESTS FOR MANAGER (IN DEPARTMENT)
// ============================================================================

export function usePendingExtensionRequestsForManager(departmentId: string) {
  return useQuery({
    queryKey: extensionKeys.pendingDept(departmentId),
    queryFn: () => extensionService.getPendingRequestsForManager(departmentId),
    enabled: !!departmentId,
    refetchInterval: 60 * 1000,
  });
}

// ============================================================================
// GET ALL PENDING REQUESTS (FOR EXECUTIVE)
// ============================================================================

export function useAllPendingExtensionRequests() {
  return useQuery({
    queryKey: extensionKeys.pendingAll(),
    queryFn: () => extensionService.getAllPendingRequests(),
    refetchInterval: 60 * 1000,
  });
}

// ============================================================================
// GET EXTENSION HISTORY FOR TASK
// ============================================================================

export function useTaskExtensionHistory(taskId: string) {
  return useQuery({
    queryKey: extensionKeys.history(taskId),
    queryFn: () => extensionService.getTaskExtensionHistory(taskId),
    enabled: !!taskId,
  });
}

// ============================================================================
// GET TASK PENDING REQUEST
// ============================================================================

export function useTaskPendingExtension(taskId: string) {
  return useQuery({
    queryKey: extensionKeys.taskPending(taskId),
    queryFn: () => extensionService.getTaskPendingRequest(taskId),
    enabled: !!taskId,
  });
}

// ============================================================================
// GET MY REQUESTS
// ============================================================================

export function useMyExtensionRequests(requesterId: string) {
  return useQuery({
    queryKey: extensionKeys.myRequests(requesterId),
    queryFn: () => extensionService.getMyRequests(requesterId),
    enabled: !!requesterId,
  });
}

// ============================================================================
// COUNT PENDING REQUESTS
// ============================================================================

export function usePendingExtensionCount(approverId: string) {
  return useQuery({
    queryKey: extensionKeys.count(approverId),
    queryFn: () => extensionService.countPendingRequests(approverId),
    enabled: !!approverId,
    refetchInterval: 60 * 1000,
  });
}

// ============================================================================
// CREATE EXTENSION REQUEST
// ============================================================================

export function useCreateExtensionRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExtensionRequestInput) =>
      extensionService.createRequest(input),
    onSuccess: (_data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: extensionKeys.all });
      queryClient.invalidateQueries({
        queryKey: extensionKeys.canRequest(variables.task_id, variables.requester_id),
      });
      queryClient.invalidateQueries({
        queryKey: extensionKeys.history(variables.task_id),
      });
    },
  });
}

// ============================================================================
// CREATE AND AUTO APPROVE (FOR EXECUTIVE)
// ============================================================================

export function useCreateAndAutoApproveExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExtensionRequestInput) =>
      extensionService.createAndAutoApprove(input),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: extensionKeys.all });
      queryClient.invalidateQueries({
        queryKey: extensionKeys.canRequest(variables.task_id, variables.requester_id),
      });
      queryClient.invalidateQueries({
        queryKey: extensionKeys.history(variables.task_id),
      });
      // Also invalidate tasks to update due_date
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ============================================================================
// APPROVE OR REJECT
// ============================================================================

export function useApproveExtensionRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ApproveExtensionInput) =>
      extensionService.approveOrReject(input),
    onSuccess: () => {
      // Invalidate all extension queries
      queryClient.invalidateQueries({ queryKey: extensionKeys.all });
      // Also invalidate tasks to update due_date
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ============================================================================
// CANCEL REQUEST
// ============================================================================

export function useCancelExtensionRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => extensionService.cancelRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extensionKeys.all });
    },
  });
}

// ============================================================================
// UPLOAD ATTACHMENT
// ============================================================================

export function useUploadExtensionAttachment() {
  return useMutation({
    mutationFn: ({ file, requesterId }: { file: File; requesterId: string }) =>
      extensionService.uploadAttachment(file, requesterId),
  });
}