import { useQuery } from '@tanstack/react-query'
import { contractService } from '../../services'
import { Card } from '../../components/ui'
 
export function ExpiringContractsWidget() {
  const { data: contracts, isLoading } = useQuery({
    queryKey: ['expiring-contracts'],
    queryFn: () => contractService.getExpiringContracts(30)
  })
 
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN')
  }
 
  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate)
    const today = new Date()
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }
 
  if (isLoading) {
    return <Card className="p-4">Đang tải...</Card>
  }
 
  if (!contracts || contracts.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold mb-2">Hợp đồng sắp hết hạn</h3>
        <p className="text-gray-500 text-sm">Không có hợp đồng nào sắp hết hạn trong 30 ngày tới</p>
      </Card>
    )
  }
 
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
        Hợp đồng sắp hết hạn ({contracts.length})
      </h3>
      <div className="space-y-3">
        {contracts.map(contract => {
          const days = getDaysRemaining(contract.end_date!)
          return (
            <div 
              key={contract.id} 
              className="flex justify-between items-center p-2 bg-yellow-50 rounded"
            >
              <div>
                <div className="font-medium">{(contract as any).employee?.full_name}</div>
                <div className="text-sm text-gray-600">
                  {(contract as any).contract_type?.name} - Hết hạn: {formatDate(contract.end_date!)}
                </div>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                days <= 7 
                  ? 'bg-red-100 text-red-800' 
                  : days <= 14 
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-yellow-100 text-yellow-800'
              }`}>
                Còn {days} ngày
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
