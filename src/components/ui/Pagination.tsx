interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}
 
export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null
 
  const pages = []
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i)
  }
 
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1 border rounded-lg disabled:opacity-50 
          disabled:cursor-not-allowed hover:bg-gray-100"
      >
        ←
      </button>
 
      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`px-3 py-1 border rounded-lg ${
            page === currentPage 
              ? 'bg-primary text-white' 
              : 'hover:bg-gray-100'
          }`}
        >
          {page}
        </button>
      ))}
 
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1 border rounded-lg disabled:opacity-50 
          disabled:cursor-not-allowed hover:bg-gray-100"
      >
        →
      </button>
    </div>
  )
}
