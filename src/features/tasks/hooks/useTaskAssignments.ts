// src/features/tasks/hooks/useTaskAssignments.ts
// Phase 4.2: Task Assignment Hooks
 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taskAssignmentService } from '../../../services/taskAssignmentService'
import type { 
  CreateAssignmentInput, 
  UpdateAssignmentInput, 
  AssignmentRole 
} from '../../../types/taskAssignment'
 
// ============ QUERY KEYS ============
export const ASSIGNMENT_QUERY_KEYS = {
  all: ['task-assignments'] as const,
  byTask: (taskId: string) => ['task-assignments', 'task', taskId] as const,
  byEmployee: (employeeId: string) => ['task-assignments', 'employee', employeeId] as const,
}
 
// ============ QUERIES ============
 
/**
 * Hook lấy danh sách người tham gia của task
 */
export function useTaskAssignments(taskId: string) {
  return useQuery({
    queryKey: ASSIGNMENT_QUERY_KEYS.byTask(taskId),
    queryFn: () => taskAssignmentService.getByTaskId(taskId),
    enabled: !!taskId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
 
/**
 * Hook lấy danh sách công việc của employee
 */
export function useEmployeeAssignments(employeeId: string) {
  return useQuery({
    queryKey: ASSIGNMENT_QUERY_KEYS.byEmployee(employeeId),
    queryFn: () => taskAssignmentService.getByEmployeeId(employeeId),
    enabled: !!employeeId,
    staleTime: 1000 * 60 * 2,
  })
}
 
// ============ MUTATIONS ============
 
/**
 * Hook thêm người vào task
 */
export function useCreateAssignment() {
  const queryClient = useQueryClient()
 
  return useMutation({
    mutationFn: (input: CreateAssignmentInput) => 
      taskAssignmentService.create(input),
    onSuccess: (data) => {
      // Invalidate task assignments
      queryClient.invalidateQueries({ 
        queryKey: ASSIGNMENT_QUERY_KEYS.byTask(data.task_id) 
      })
      // Invalidate employee assignments nếu có
      if (data.employee_id) {
        queryClient.invalidateQueries({ 
          queryKey: ASSIGNMENT_QUERY_KEYS.byEmployee(data.employee_id) 
        })
      }
    },
  })
}
 
/**
 * Hook thêm nhiều người cùng lúc
 */
export function useBulkCreateAssignment() {
  const queryClient = useQueryClient()
 
  return useMutation({
    mutationFn: ({ 
      taskId, 
      employeeIds, 
      role, 
      assignedBy 
    }: {
      taskId: string
      employeeIds: string[]
      role?: AssignmentRole
      assignedBy?: string
    }) => taskAssignmentService.createBulk(taskId, employeeIds, role, assignedBy),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ASSIGNMENT_QUERY_KEYS.byTask(variables.taskId) 
      })
    },
  })
}
 
/**
 * Hook cập nhật assignment
 */
export function useUpdateAssignment() {
  const queryClient = useQueryClient()
 
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssignmentInput }) => 
      taskAssignmentService.update(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ASSIGNMENT_QUERY_KEYS.byTask(data.task_id) 
      })
    },
  })
}
 
/**
 * Hook xóa assignment
 */
export function useRemoveAssignment() {
  const queryClient = useQueryClient()
 
  return useMutation({
    mutationFn: ({ id, taskId }: { id: string; taskId: string }) => 
      taskAssignmentService.remove(id).then(() => taskId),
    onSuccess: (taskId) => {
      queryClient.invalidateQueries({ 
        queryKey: ASSIGNMENT_QUERY_KEYS.byTask(taskId) 
      })
    },
  })
}
 
/**
 * Hook chấp nhận/từ chối assignment
 */
export function useRespondAssignment() {
  const queryClient = useQueryClient()
 
  return useMutation({
    mutationFn: ({ 
      id, 
      accept, 
      note 
    }: { 
      id: string
      accept: boolean
      note?: string 
    }) => accept 
      ? taskAssignmentService.accept(id)
      : taskAssignmentService.decline(id, note),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ASSIGNMENT_QUERY_KEYS.byTask(data.task_id) 
      })
      if (data.employee_id) {
        queryClient.invalidateQueries({ 
          queryKey: ASSIGNMENT_QUERY_KEYS.byEmployee(data.employee_id) 
        })
      }
    },
  })
}
