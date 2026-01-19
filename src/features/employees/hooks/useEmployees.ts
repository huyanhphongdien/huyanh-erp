// src/features/employees/hooks/useEmployees.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { employeeService } from '../../../services'
import type { EmployeeFormData } from '../../../types'

// Hook lấy danh sách employees
export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: () => employeeService.getAll({ page: 1, pageSize: 100 }),
  })
}

// Hook lấy chi tiết 1 employee
export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeeService.getById(id),
    enabled: !!id,
  })
}

// Hook tạo employee
export function useCreateEmployee() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (input: EmployeeFormData) => employeeService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

// Hook cập nhật employee
export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EmployeeFormData> }) => 
      employeeService.update(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['employee', id] })
    },
  })
}

// Hook xóa employee
export function useDeleteEmployee() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => employeeService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}