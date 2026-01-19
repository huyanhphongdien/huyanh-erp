// src/features/tasks/TaskListPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Button, DataTable, Pagination, Loading, 
  ConfirmDialog, ProgressBar 
} from '../../components/ui'
import { TaskStatusBadge } from './components/TaskStatusBadge'
import { TaskPriorityBadge } from './components/TaskPriorityBadge'
import { TaskFilters } from './components/TaskFilters'
import { useTasks, useDeleteTask } from './hooks/useTasks'
import { useDepartments, useEmployees } from '../hrm/hooks'
import type { Task, TaskFilter } from '../../types'
 
export function TaskListPage() {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<TaskFilter>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
 
  const { data, isLoading } = useTasks(page, 10, filter)
  const { data: departments } = useDepartments()
  const { data: employees } = useEmployees()
  const deleteMutation = useDeleteTask()
 
  const handleDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId)
      setDeleteId(null)
    }
  }
 
  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('vi-VN')
  }
 
  const columns = [
    { 
      key: 'code', 
      label: 'Mã CV',
      render: (task: Task) => (
        <Link to={`/tasks/${task.id}`} 
              className="text-primary hover:underline font-medium">
          {task.code}
        </Link>
      )
    },
    { 
      key: 'name', 
      label: 'Tên công việc',
      render: (task: Task) => (
        <div>
          <p className="font-medium">{task.name}</p>
          {task.parent_task && (
            <p className="text-xs text-gray-500">
              ↳ {task.parent_task.code}
            </p>
          )}
        </div>
      )
    },
    { 
      key: 'department', 
      label: 'Phòng ban',
      render: (task: Task) => task.department?.name || '-'
    },
    { 
      key: 'assignee', 
      label: 'Người phụ trách',
      render: (task: Task) => task.assignee?.full_name || '-'
    },
    { 
      key: 'due_date', 
      label: 'Hạn',
      render: (task: Task) => formatDate(task.due_date)
    },
    { 
      key: 'progress', 
      label: 'Tiến độ',
      render: (task: Task) => <ProgressBar value={task.progress} size="sm" />
    },
    { 
      key: 'priority', 
      label: 'Ưu tiên',
      render: (task: Task) => <TaskPriorityBadge priority={task.priority} />
    },
    { 
      key: 'status', 
      label: 'Trạng thái',
      render: (task: Task) => <TaskStatusBadge status={task.status} />
    },
    {
      key: 'actions',
      label: 'Thao tác',
      render: (task: Task) => (
        <div className="flex gap-2">
          <Link to={`/tasks/${task.id}/edit`}>
            <Button size="sm" variant="secondary">Sửa</Button>
          </Link>
          <Button 
            size="sm" 
            variant="danger" 
            onClick={() => setDeleteId(task.id)}
          >
            Xóa
          </Button>
        </div>
      )
    }
  ]
 
  if (isLoading) return <Loading />
 
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý Công việc</h1>
        <Link to="/tasks/new">
          <Button>+ Thêm công việc</Button>
        </Link>
      </div>
 
      <TaskFilters
        onFilter={setFilter}
        departments={departments?.data || []}
        employees={employees?.data || []}
      />
 
      <DataTable columns={columns} data={data?.data || []} />
 
      <Pagination
        currentPage={page}
        totalPages={Math.ceil((data?.total || 0) / 10)}
        onPageChange={setPage}
      />
 
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Xác nhận xóa"
        message="Bạn có chắc muốn xóa công việc này?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
