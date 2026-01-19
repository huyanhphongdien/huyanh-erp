// src/features/tasks/components/TaskFilters.tsx
import { useState } from 'react'
import { Input, Select, Button } from '../../../components/ui'
import type { TaskFilter, TaskStatus, TaskPriority } from '../../../types'
 
interface TaskFiltersProps {
  onFilter: (filter: TaskFilter) => void
  departments: { id: string; name: string }[]
  employees: { id: string; full_name: string }[]
}
 
export function TaskFilters({ onFilter, departments, employees }: TaskFiltersProps) {
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
 
  const handleFilter = () => {
    onFilter({
      search: search || undefined,
      department_id: departmentId || undefined,
      assignee_id: assigneeId || undefined,
      status: status as TaskStatus || undefined,
      priority: priority as TaskPriority || undefined,
    })
  }
 
  const handleReset = () => {
    setSearch('')
    setDepartmentId('')
    setAssigneeId('')
    setStatus('')
    setPriority('')
    onFilter({})
  }
 
  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Input
          placeholder="Tìm kiếm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          options={[
            { value: '', label: 'Tất cả phòng ban' },
            ...departments.map(d => ({ value: d.id, label: d.name }))
          ]}
        />
        <Select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          options={[
            { value: '', label: 'Tất cả người phụ trách' },
            ...employees.map(e => ({ value: e.id, label: e.full_name }))
          ]}
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '', label: 'Tất cả trạng thái' },
            { value: 'new', label: 'Mới' },
            { value: 'in_progress', label: 'Đang làm' },
            { value: 'pending_review', label: 'Chờ duyệt' },
            { value: 'completed', label: 'Hoàn thành' },
            { value: 'cancelled', label: 'Đã hủy' },
            { value: 'on_hold', label: 'Tạm dừng' },
          ]}
        />
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={[
            { value: '', label: 'Tất cả độ ưu tiên' },
            { value: 'low', label: 'Thấp' },
            { value: 'medium', label: 'Trung bình' },
            { value: 'high', label: 'Cao' },
            { value: 'urgent', label: 'Khẩn cấp' },
          ]}
        />
        <div className="flex gap-2">
          <Button onClick={handleFilter}>Lọc</Button>
          <Button variant="secondary" onClick={handleReset}>Reset</Button>
        </div>
      </div>
    </div>
  )
}
