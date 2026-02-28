import { Loading } from './Loading'
 
interface Column<T> {
  key: keyof T | string
  title: string
  render?: (item: T) => React.ReactNode
  className?: string
}
 
interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  isLoading?: boolean
  emptyMessage?: string
  onRowClick?: (item: T) => void
}
 
export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  emptyMessage = 'Không có dữ liệu',
  onRowClick
}: DataTableProps<T>) {
  if (isLoading) {
    return <Loading text="Đang tải dữ liệu..." />
  }
 
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {emptyMessage}
      </div>
    )
  }
 
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className="px-6 py-3 text-left text-xs font-medium 
                  text-gray-500 uppercase tracking-wider"
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((item) => (
            <tr 
              key={item.id}
              onClick={() => onRowClick?.(item)}
              className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
            >
              {columns.map((column) => (
                <td 
                  key={String(column.key)}
                  className={`px-6 py-4 whitespace-nowrap ${column.className || ''}`}
                >
                  {column.render 
                    ? column.render(item) 
                    : String(item[column.key as keyof T] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
