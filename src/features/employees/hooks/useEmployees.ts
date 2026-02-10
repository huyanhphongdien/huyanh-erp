// src/features/employees/hooks/useEmployees.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { employeeService } from '../../../services'
import type { EmployeeFormData, Gender } from '../../../types'

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

// Helper to convert form data to service input
function toServiceInput(input: EmployeeFormData) {
  return {
    ...input,
    // Cast gender to the expected type, or undefined if invalid
    gender: (['male', 'female', 'other'].includes(input.gender || '') 
      ? input.gender as Gender 
      : undefined),
  }
}

// Hook tạo employee
export function useCreateEmployee() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (input: EmployeeFormData) => employeeService.create(toServiceInput(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

// Hook cập nhật employee
export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EmployeeFormData> }) => {
      const serviceInput = {
        ...input,
        gender: input.gender && ['male', 'female', 'other'].includes(input.gender)
          ? input.gender as Gender
          : undefined,
      }
      return employeeService.update(id, serviceInput)
    },
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