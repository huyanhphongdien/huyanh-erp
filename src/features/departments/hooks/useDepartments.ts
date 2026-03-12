// src/features/departments/hooks/useDepartments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { departmentService } from '../../../services'
import type { DepartmentFormData } from '../../../types'

// Hook lấy danh sách departments
export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.getAll({ page: 1, pageSize: 100 }),
  })
}

// Hook lấy danh sách active (cho dropdown)
export function useDepartmentsActive() {
  return useQuery({
    queryKey: ['departments', 'active'],
    queryFn: () => departmentService.getAllActive(),
  })
}

// Hook lấy chi tiết 1 department
export function useDepartment(id: string) {
  return useQuery({
    queryKey: ['department', id],
    queryFn: () => departmentService.getById(id),
    enabled: !!id,
  })
}

// Hook tạo department
export function useCreateDepartment() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (input: DepartmentFormData) => departmentService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

// Hook cập nhật department
export function useUpdateDepartment() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DepartmentFormData> }) => 
      departmentService.update(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['department', id] })
    },
  })
}

// Hook xóa department
export function useDeleteDepartment() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => departmentService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}