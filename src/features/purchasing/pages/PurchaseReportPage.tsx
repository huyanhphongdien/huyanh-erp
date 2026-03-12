// ============================================================================
// FILE: src/features/purchasing/pages/PurchaseReportPage.tsx
// MODULE: Mua hàng — Huy Anh Rubber ERP
// PHASE: P7 — Dashboard Báo cáo mua hàng
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Download,
  Calendar,
  Filter,
  ChevronRight,
  Package,
  Users,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  PieChart,
  ShoppingCart,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
} from 'recharts'

import purchaseReportService, {
  type PurchaseSummary,
  type MonthlySpending,
  type TopSupplier,
  type SpendingByCategory,
  type OverdueInvoice,
  type RecentOrder,
  type ReportFilters,
} from '../../../services/purchaseReportService'

import { exportPurchaseReport } from '../../../utils/purchaseExportExcel'

// ============================================================================
// CONSTANTS
// ============================================================================

const PIE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: '#9CA3AF' },
  confirmed: { label: 'Đã duyệt', color: '#3B82F6' },
  delivering: { label: 'Đang giao', color: '#F59E0B' },
  partial: { label: 'Giao 1 phần', color: '#8B5CF6' },
  completed: { label: 'Hoàn thành', color: '#10B981' },
  cancelled: { label: 'Hủy', color: '#EF4444' },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatVND(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return n.toLocaleString('vi-VN')
}

function formatFullVND(n: number): string {
  return n.toLocaleString('vi-VN') + ' ₫'
}

function formatDate(d: string): string {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('vi-VN')
}

// ============================================================================
// CUSTOM TOOLTIP
// ============================================================================

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-900 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="flex justify-between gap-4">
          <span>{entry.name}:</span>
          <span className="font-medium">{formatFullVND(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PurchaseReportPage() {
  // State
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<PurchaseSummary | null>(null)
  const [monthlyData, setMonthlyData] = useState<MonthlySpending[]>([])
  const [topSuppliers, setTopSuppliers] = useState<TopSupplier[]>([])
  const [categorySpending, setCategorySpending] = useState<SpendingByCategory[]>([])
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])

  // Filters
  const [dateRange, setDateRange] = useState<'all' | '3m' | '6m' | '12m' | 'custom'>('12m')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exporting, setExporting] = useState(false)

  // ============================================
  // FETCH
  // ============================================

  const getFilters = useCallback((): ReportFilters => {
    const now = new Date()
    let from_date: string | undefined
    let to_date: string | undefined

    switch (dateRange) {
      case '3m':
        from_date = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0]
        break
      case '6m':
        from_date = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0]
        break
      case '12m':
        from_date = new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString().split('T')[0]
        break
      case 'custom':
        from_date = fromDate || undefined
        to_date = toDate || undefined
        break
      default:
        break
    }

    return { from_date, to_date }
  }, [dateRange, fromDate, toDate])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const filters = getFilters()
      const monthsBack = dateRange === '3m' ? 3 : dateRange === '6m' ? 6 : 12

      const [summaryRes, monthlyRes, suppliersRes, categoryRes, overdueRes, recentRes] =
        await Promise.allSettled([
          purchaseReportService.getSummary(filters),
          purchaseReportService.getMonthlySpending(monthsBack),
          purchaseReportService.getTopSuppliers(10, filters),
          purchaseReportService.getSpendingByCategory(filters),
          purchaseReportService.getOverdueInvoices(10),
          purchaseReportService.getRecentOrders(8),
        ])

      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value)
      if (monthlyRes.status === 'fulfilled') setMonthlyData(monthlyRes.value)
      if (suppliersRes.status === 'fulfilled') setTopSuppliers(suppliersRes.value)
      if (categoryRes.status === 'fulfilled') setCategorySpending(categoryRes.value)
      if (overdueRes.status === 'fulfilled') setOverdueInvoices(overdueRes.value)
      if (recentRes.status === 'fulfilled') setRecentOrders(recentRes.value)
    } catch (err) {
      console.error('Error fetching report data:', err)
    } finally {
      setLoading(false)
    }
  }, [getFilters, dateRange])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ============================================
  // EXPORT EXCEL
  // ============================================

  const handleExport = async (type: 'orders' | 'invoices' | 'payments' | 'debt') => {
    setExporting(true)
    try {
      const filters = getFilters()
      const data = await purchaseReportService.getExportData(type, filters)

      if (!data || data.length === 0) {
        alert('Không có dữ liệu để xuất')
        return
      }

      // Tạo label cho date range
      const rangeLabels: Record<string, string> = {
        '3m': '3 tháng gần nhất',
        '6m': '6 tháng gần nhất',
        '12m': '12 tháng gần nhất',
        'all': 'Tất cả',
        'custom': filters.from_date && filters.to_date ? `${filters.from_date} → ${filters.to_date}` : '',
      }

      await exportPurchaseReport(type, data, rangeLabels[dateRange] || '')
    } catch (err) {
      console.error('Export error:', err)
      alert('Lỗi khi xuất dữ liệu')
    } finally {
      setExporting(false)
    }
  }

  // ============================================
  // RENDER — Summary Cards
  // ============================================

  const renderSummaryCards = () => {
    if (!summary) return null

    const cards = [
      {
        title: 'Tổng đơn hàng',
        value: summary.total_orders,
        format: 'number' as const,
        icon: ShoppingCart,
        color: 'blue',
        sub: `Tháng này: ${summary.orders_this_month}`,
        trend: summary.growth_pct,
      },
      {
        title: 'Giá trị đặt hàng',
        value: summary.total_order_amount,
        format: 'vnd' as const,
        icon: DollarSign,
        color: 'emerald',
        sub: `TB/đơn: ${formatVND(summary.avg_order_value)}`,
      },
      {
        title: 'Đã thanh toán',
        value: summary.total_paid,
        format: 'vnd' as const,
        icon: CreditCard,
        color: 'green',
        sub: `Hóa đơn: ${formatVND(summary.total_invoiced)}`,
      },
      {
        title: 'Công nợ còn lại',
        value: summary.total_debt,
        format: 'vnd' as const,
        icon: FileText,
        color: summary.overdue_debt > 0 ? 'red' : 'amber',
        sub: summary.overdue_debt > 0
          ? `Quá hạn: ${formatVND(summary.overdue_debt)}`
          : 'Không có nợ quá hạn',
        alert: summary.overdue_debt > 0,
      },
    ]

    const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
      blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200' },
      emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-200' },
      green: { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-200' },
      amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200' },
      red: { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-red-200' },
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((card, i) => {
          const cm = colorMap[card.color] || colorMap.blue
          const Icon = card.icon
          return (
            <div
              key={i}
              className={`bg-white rounded-xl border ${cm.border} p-5 relative overflow-hidden`}
            >
              {/* Alert indicator */}
              {card.alert && (
                <div className="absolute top-0 right-0 w-0 h-0 border-l-[20px] border-l-transparent border-t-[20px] border-t-red-500" />
              )}

              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-500">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {card.format === 'vnd'
                      ? formatVND(card.value)
                      : card.value.toLocaleString('vi-VN')}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg ${cm.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${cm.icon}`} />
                </div>
              </div>

              {/* Trend */}
              {card.trend !== undefined && (
                <div className="mt-2 flex items-center gap-1 text-xs">
                  {card.trend > 0 ? (
                    <>
                      <ArrowUpRight className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-green-600">+{card.trend.toFixed(1)}%</span>
                    </>
                  ) : card.trend < 0 ? (
                    <>
                      <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-red-600">{card.trend.toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <Minus className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-gray-400">0%</span>
                    </>
                  )}
                  <span className="text-gray-400">so tháng trước</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ============================================
  // RENDER — Monthly Chart
  // ============================================

  const renderMonthlyChart = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Chi phí mua hàng theo tháng</h3>
          <p className="text-sm text-gray-500">Giá trị đặt hàng, hóa đơn, thanh toán</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-blue-500" /> Đặt hàng
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500" /> Hóa đơn
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500" /> Thanh toán
          </span>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: '#6B7280' }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              tickFormatter={(v) => formatVND(v)}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="order_amount" name="Đặt hàng" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="invoiced_amount" name="Hóa đơn" fill="#F59E0B" radius={[3, 3, 0, 0]} />
            <Bar dataKey="paid_amount" name="Thanh toán" fill="#10B981" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  // ============================================
  // RENDER — Top Suppliers + Category Pie
  // ============================================

  const renderAnalytics = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Top NCC */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-500" />
          Top nhà cung cấp
        </h3>

        {topSuppliers.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-3">
            {topSuppliers.slice(0, 7).map((s, i) => (
              <div key={s.supplier_id} className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {s.supplier_name}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 ml-2">
                      {formatVND(s.total_amount)}
                    </p>
                  </div>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min(s.pct_of_total, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[11px] text-gray-400">
                      {s.total_orders} hóa đơn
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {s.pct_of_total.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chi phí theo nhóm */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-amber-500" />
          Chi phí theo nhóm vật tư
        </h3>

        {categorySpending.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Chưa có dữ liệu</p>
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={categorySpending}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="total_amount"
                  nameKey="category_name"
                >
                  {categorySpending.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatFullVND(Number(value))}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(value) => (
                    <span className="text-gray-600">{value}</span>
                  )}
                />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )

  // ============================================
  // RENDER — Overdue Invoices
  // ============================================

  const renderOverdueInvoices = () => {
    if (overdueInvoices.length === 0) return null

    return (
      <div className="bg-white rounded-xl border border-red-200 p-5 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          Hóa đơn quá hạn thanh toán
          <span className="ml-auto text-sm font-normal text-red-500">
            {overdueInvoices.length} hóa đơn
          </span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 pr-3 font-medium">Mã HĐ</th>
                <th className="pb-2 pr-3 font-medium">Nhà cung cấp</th>
                <th className="pb-2 pr-3 font-medium text-right">Tổng tiền</th>
                <th className="pb-2 pr-3 font-medium text-right">Còn nợ</th>
                <th className="pb-2 pr-3 font-medium">Hạn TT</th>
                <th className="pb-2 font-medium text-center">Quá hạn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {overdueInvoices.map((inv) => (
                <tr key={inv.invoice_id} className="hover:bg-red-50/50">
                  <td className="py-2 pr-3">
                    <span className="font-medium text-gray-900">
                      {inv.invoice_code || inv.invoice_number}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-gray-600">{inv.supplier_name}</td>
                  <td className="py-2 pr-3 text-right text-gray-600">
                    {formatFullVND(inv.total_amount)}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold text-red-600">
                    {formatFullVND(inv.remaining_amount)}
                  </td>
                  <td className="py-2 pr-3 text-gray-500">{formatDate(inv.due_date)}</td>
                  <td className="py-2 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        inv.days_overdue > 30
                          ? 'bg-red-100 text-red-700'
                          : inv.days_overdue > 7
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {inv.days_overdue} ngày
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER — Recent Orders
  // ============================================

  const renderRecentOrders = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-gray-400" />
        Đơn hàng gần đây
      </h3>

      {recentOrders.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Chưa có đơn hàng</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 pr-3 font-medium">Mã ĐH</th>
                <th className="pb-2 pr-3 font-medium">Ngày</th>
                <th className="pb-2 pr-3 font-medium">Nhà cung cấp</th>
                <th className="pb-2 pr-3 font-medium text-right">Giá trị</th>
                <th className="pb-2 pr-3 font-medium text-center">Trạng thái</th>
                <th className="pb-2 font-medium">Thanh toán</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentOrders.map((order) => {
                const statusInfo = STATUS_LABELS[order.status] || {
                  label: order.status,
                  color: '#9CA3AF',
                }
                return (
                  <tr key={order.id} className="hover:bg-gray-50/50">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-blue-600">{order.order_code}</span>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{formatDate(order.order_date)}</td>
                    <td className="py-2 pr-3 text-gray-600 max-w-[200px] truncate">
                      {order.supplier_names}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium text-gray-900">
                      {formatVND(order.total_amount)}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: statusInfo.color + '15',
                          color: statusInfo.color,
                        }}
                      >
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              order.payment_progress >= 100
                                ? 'bg-green-500'
                                : order.payment_progress > 0
                                  ? 'bg-blue-500'
                                  : 'bg-gray-300'
                            }`}
                            style={{ width: `${Math.min(order.payment_progress, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-9">
                          {order.payment_progress}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // ============================================
  // RENDER — Export Section
  // ============================================

  const renderExportSection = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Download className="w-5 h-5 text-gray-400" />
        Xuất báo cáo
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            key: 'orders' as const,
            label: 'Đơn hàng',
            icon: ShoppingCart,
            desc: 'DS đơn hàng + giá trị',
          },
          {
            key: 'invoices' as const,
            label: 'Hóa đơn',
            icon: FileText,
            desc: 'DS hóa đơn NCC',
          },
          {
            key: 'payments' as const,
            label: 'Thanh toán',
            icon: CreditCard,
            desc: 'Lịch sử thanh toán',
          },
          {
            key: 'debt' as const,
            label: 'Công nợ',
            icon: AlertTriangle,
            desc: 'Nợ còn lại theo NCC',
          },
        ].map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => handleExport(item.key)}
              disabled={exporting}
              className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors disabled:opacity-50"
            >
              <Icon className="w-6 h-6 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
              <span className="text-[11px] text-gray-400 text-center">{item.desc}</span>
              <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                <Download className="w-3 h-3" /> Excel
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            Báo cáo mua hàng
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tổng quan chi phí, công nợ và thống kê mua hàng
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date range filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['3m', '6m', '12m', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  dateRange === range
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {range === '3m'
                  ? '3 tháng'
                  : range === '6m'
                    ? '6 tháng'
                    : range === '12m'
                      ? '12 tháng'
                      : 'Tất cả'}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Tải lại"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-500">Đang tải dữ liệu báo cáo...</span>
        </div>
      ) : (
        <>
          {renderSummaryCards()}
          {renderMonthlyChart()}
          {renderOverdueInvoices()}
          {renderAnalytics()}
          {renderRecentOrders()}
          {renderExportSection()}
        </>
      )}
    </div>
  )
}