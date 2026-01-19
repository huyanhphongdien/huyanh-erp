// src/features/tasks/hooks/useTasks.ts
// LƯU Ý: Đường dẫn từ hooks/ lên 3 cấp
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taskService } from '../../../services'
import type { CreateTaskInput, UpdateTaskInput, TaskFilter } from '../../../types'
 
export function useTasks(page = 1, limit = 10, filter?: TaskFilter) {
  return useQuery({
    queryKey: ['tasks', page, limit, filter],
    queryFn: () => taskService.getAll(page, limit, filter),
  })
}
 
export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => taskService.getById(id),
    enabled: !!id,
  })
}
 
export function useCreateTask() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (input: CreateTaskInput) => taskService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
 
export function useUpdateTask() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => 
      taskService.update(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', id] })
    },
  })
}
 
export function useDeleteTask() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => taskService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
 
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      taskService.updateStatus(id, status),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', id] })
    },
  })
}
