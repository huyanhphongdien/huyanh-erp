// ============================================================================
// FILE: src/pages/wms/StockCheckPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Bước 5.7: Kiểm kê tồn kho
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ClipboardCheck, Warehouse, Package, Search,
  Check, X, AlertTriangle, Loader2, ArrowRight, ArrowUp,
  ArrowDown, Minus, Save
} from 'lucide-react'
import {
  stockCheckService,
  type StockCheck,
  type StockCheckItem,
} from '../../services/wms/stockCheckService'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

const StockCheckPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Steps: select_warehouse → checking → review
  const [step, setStep] = useState<'select_warehouse' | 'checking' | 'review'>('select_warehouse')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [loadingWarehouses, setLoadingWarehouses] = useState(true)
  const [stockCheck, setStockCheck] = useState<StockCheck | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [showOnlyDiscrepancy, setShowOnlyDiscrepancy] = useState(false)

  // Load warehouses
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('warehouses')
          .select('id, code, name, type')
          .eq('is_active', true)
          .order('code')
        setWarehouses(data || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingWarehouses(false)
      }
    }
    load()
  }, [])

  // Create stock check
  const handleCreateCheck = async () => {
    if (!selectedWarehouse) return
    try {
      setCreating(true)
      const check = await stockCheckService.createStockCheck({
        warehouse_id: selectedWarehouse,
        created_by: user?.employee_id || user?.id,
        notes: '',
      })
      setStockCheck(check)
      setStep('checking')
    } catch (err: any) {
      alert(err.message || 'Lỗi tạo kiểm kê')
    } finally {
      setCreating(false)
    }
  }

  // Update item actual quantity
  const handleUpdateItem = (itemId: string, actualQty: number) => {
    if (!stockCheck?.items) return
    setStockCheck({
      ...stockCheck,
      items: stockCheck.items.map(item => {
        if (item.id !== itemId) return item
        return stockCheckService.updateCheckItem(item, {
          actual_quantity: actualQty,
          checked_by: user?.employee_id || user?.id,
        })
      }),
    })
  }

  // Finalize
  const handleFinalize = async () => {
    if (!stockCheck || !user) return
    try {
      setSaving(true)
      const result = await stockCheckService.finalizeStockCheck(stockCheck, user.employee_id || user.id)
      alert(`Kiểm kê hoàn tất!\n• ${result.adjustments} dòng chênh lệch\n• ${result.transactions_created} phiếu điều chỉnh`)
      navigate('/wms')
    } catch (err: any) {
      alert(err.message || 'Lỗi hoàn tất kiểm kê')
    } finally {
      setSaving(false)
    }
  }

  // Computed
  const items = stockCheck?.items || []
  const summary = stockCheckService.summarizeDiscrepancy(items)
  const checkedCount = items.filter(i => i.actual_quantity !== undefined && i.actual_quantity !== null).length

  // Filtered items
  const filteredItems = items.filter(item => {
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!item.batch_no?.toLowerCase().includes(s) &&
          !item.material_name?.toLowerCase().includes(s) &&
          !item.material_sku?.toLowerCase().includes(s)) {
        return false
      }
    }
    if (showOnlyDiscrepancy) {
      return item.actual_quantity !== undefined && item.discrepancy !== 0
    }
    return true
  })

  // Helpers
  const getDiscrepancyStyle = (disc: number) => {
    if (disc === 0) return { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <Check className="w-3 h-3" /> }
    if (disc > 0) return { bg: 'bg-blue-50', text: 'text-blue-700', icon: <ArrowUp className="w-3 h-3" /> }
    return { bg: 'bg-red-50', text: 'text-red-700', icon: <ArrowDown className="w-3 h-3" /> }
  }

  const warehouseName = warehouses.find(w => w.id === selectedWarehouse)?.name || ''

  // ========== STEP 1: CHỌN KHO ==========
  if (step === 'select_warehouse') {
    return (
      <div className="min-h-screen bg-[#F7F5F2]">
        <div className="bg-[#1B4D3E] text-white px-4 pt-[env(safe-area-inset-top)] pb-4">
          <div className="flex items-center gap-3 pt-3">
            <button onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold">Kiểm kê tồn kho</h1>
              <p className="text-xs text-white/60 mt-0.5">Bước 1: Chọn kho kiểm kê</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3">
          {loadingWarehouses ? (
            <div className="text-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E] mx-auto" />
            </div>
          ) : (
            warehouses.map(wh => (
              <button
                key={wh.id}
                onClick={() => setSelectedWarehouse(wh.id)}
                className={`w-full p-4 rounded-xl border text-left transition-all
                  active:scale-[0.98]
                  ${selectedWarehouse === wh.id
                    ? 'border-[#1B4D3E] bg-[#1B4D3E]/5 ring-1 ring-[#1B4D3E]'
                    : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                    ${selectedWarehouse === wh.id ? 'bg-[#1B4D3E] text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <Warehouse className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{wh.name}</p>
                    <p className="text-xs text-gray-400">{wh.code} • {wh.type === 'finished' ? 'Thành phẩm' : 'NVL'}</p>
                  </div>
                  {selectedWarehouse === wh.id && (
                    <Check className="w-5 h-5 text-[#1B4D3E] ml-auto" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3
          pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            onClick={handleCreateCheck}
            disabled={!selectedWarehouse || creating}
            className={`w-full min-h-[48px] flex items-center justify-center gap-2
              text-[14px] font-bold text-white rounded-xl
              active:scale-[0.97] transition-transform
              ${selectedWarehouse ? 'bg-[#1B4D3E]' : 'bg-gray-300 cursor-not-allowed'}`}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            {creating ? 'Đang tạo...' : 'Bắt đầu kiểm kê'}
          </button>
        </div>
      </div>
    )
  }

  // ========== STEP 2: NHẬP SỐ LIỆU ==========
  if (step === 'checking') {
    return (
      <div className="min-h-screen bg-[#F7F5F2]">
        <div className="bg-[#1B4D3E] text-white px-4 pt-[env(safe-area-inset-top)] pb-3">
          <div className="flex items-center gap-3 pt-3">
            <button onClick={() => setStep('select_warehouse')}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-base font-bold">Kiểm kê: {warehouseName}</h1>
              <p className="text-xs text-white/60 mt-0.5">
                {stockCheck?.code} • {checkedCount}/{items.length} đã kiểm
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E8A838] rounded-full transition-all duration-300"
              style={{ width: `${items.length > 0 ? (checkedCount / items.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Search + Filter */}
        <div className="px-4 py-3 bg-white border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Tìm lô, sản phẩm..."
              className="w-full pl-10 pr-4 py-2.5 text-[15px] bg-gray-50 border border-gray-200
                rounded-xl focus:outline-none focus:border-[#2D8B6E]"
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowOnlyDiscrepancy(false)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium
                ${!showOnlyDiscrepancy ? 'bg-[#1B4D3E] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Tất cả ({items.length})
            </button>
            <button
              onClick={() => setShowOnlyDiscrepancy(true)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium
                ${showOnlyDiscrepancy ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Chênh lệch ({summary.surplus_count + summary.shortage_count})
            </button>
          </div>
        </div>

        {/* Items List */}
        <div className="px-4 py-3 pb-[120px] space-y-2">
          {filteredItems.map(item => {
            const hasValue = item.actual_quantity !== undefined && item.actual_quantity !== null
            const discStyle = hasValue ? getDiscrepancyStyle(item.discrepancy) : null

            return (
              <div key={item.id}
                className={`bg-white rounded-xl border p-4 shadow-sm
                  ${hasValue && item.discrepancy !== 0 ? 'border-red-200' : 'border-gray-100'}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {item.batch_no}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.material_name} • {item.location_code || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase">Hệ thống</p>
                    <p className="text-base font-bold text-gray-600"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {item.system_quantity}
                    </p>
                  </div>
                </div>

                {/* Input actual quantity */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-400 uppercase mb-1 block">SL thực tế</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={item.actual_quantity ?? ''}
                      onChange={e => {
                        const val = e.target.value === '' ? undefined : Number(e.target.value)
                        if (val !== undefined) handleUpdateItem(item.id, val)
                      }}
                      placeholder="Nhập SL..."
                      className={`w-full px-3 py-2.5 text-[15px] font-semibold border rounded-xl
                        focus:outline-none focus:ring-1
                        ${hasValue && item.discrepancy !== 0
                          ? 'border-red-300 focus:ring-red-300 bg-red-50/30'
                          : hasValue
                            ? 'border-emerald-300 focus:ring-emerald-300 bg-emerald-50/30'
                            : 'border-gray-200 focus:ring-[#2D8B6E]'}`}
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    />
                  </div>

                  {/* Discrepancy badge */}
                  {hasValue && (
                    <div className={`px-3 py-2 rounded-xl ${discStyle!.bg} min-w-[80px] text-center`}>
                      <p className="text-[10px] text-gray-400 uppercase">Chênh lệch</p>
                      <p className={`text-base font-bold ${discStyle!.text} flex items-center justify-center gap-0.5`}
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {discStyle!.icon}
                        {item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3
          pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400">Đã kiểm: {checkedCount}/{items.length}</span>
            {summary.shortage_count > 0 && (
              <span className="text-xs text-red-500 font-medium">• {summary.shortage_count} thiếu</span>
            )}
            {summary.surplus_count > 0 && (
              <span className="text-xs text-blue-500 font-medium">• {summary.surplus_count} thừa</span>
            )}
          </div>
          <button
            onClick={() => setStep('review')}
            disabled={checkedCount < items.length}
            className={`w-full min-h-[48px] flex items-center justify-center gap-2
              text-[14px] font-bold text-white rounded-xl
              active:scale-[0.97] transition-transform
              ${checkedCount >= items.length ? 'bg-[#E8A838]' : 'bg-gray-300 cursor-not-allowed'}`}
          >
            Xem kết quả <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  // ========== STEP 3: REVIEW & CONFIRM ==========
  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <div className="bg-[#1B4D3E] text-white px-4 pt-[env(safe-area-inset-top)] pb-4">
        <div className="flex items-center gap-3 pt-3">
          <button onClick={() => setStep('checking')}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">Kết quả kiểm kê</h1>
            <p className="text-xs text-white/60 mt-0.5">{stockCheck?.code} • {warehouseName}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 pb-[100px]">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-700"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>{summary.match_count}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">Khớp</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-700"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>+{summary.total_surplus}</p>
            <p className="text-[10px] text-blue-600 mt-0.5">Thừa ({summary.surplus_count})</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-red-700"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>-{summary.total_shortage}</p>
            <p className="text-[10px] text-red-600 mt-0.5">Thiếu ({summary.shortage_count})</p>
          </div>
        </div>

        {/* Discrepancy list */}
        {(summary.surplus_count + summary.shortage_count) > 0 ? (
          <>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Các dòng chênh lệch
            </h3>
            <div className="space-y-2">
              {items.filter(i => i.discrepancy !== 0).map(item => {
                const style = getDiscrepancyStyle(item.discrepancy)
                return (
                  <div key={item.id} className={`${style.bg} rounded-xl p-3 border-l-4
                    ${item.discrepancy > 0 ? 'border-l-blue-500' : 'border-l-red-500'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{item.batch_no}</p>
                        <p className="text-xs text-gray-500">{item.material_name}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${style.text}`}
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          HT: {item.system_quantity} → TT: {item.actual_quantity}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Warning */}
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-amber-700 font-medium">Xác nhận điều chỉnh?</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Hệ thống sẽ tạo phiếu điều chỉnh tự động cho {summary.surplus_count + summary.shortage_count} dòng chênh lệch.
                  Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-10">
            <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-3">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-base font-bold text-emerald-700">Tồn kho hoàn toàn khớp!</p>
            <p className="text-sm text-gray-400 mt-1">Không có chênh lệch nào được phát hiện</p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3
        pb-[max(12px,env(safe-area-inset-bottom))] flex gap-2">
        <button
          onClick={() => setStep('checking')}
          className="min-h-[48px] px-4 text-[14px] font-medium text-gray-600
            rounded-xl border border-gray-200 active:scale-[0.97] transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={handleFinalize}
          disabled={saving}
          className="flex-1 min-h-[48px] flex items-center justify-center gap-2
            text-[14px] font-bold text-white bg-[#1B4D3E] rounded-xl
            active:scale-[0.97] transition-transform
            shadow-[0_2px_8px_rgba(27,77,62,0.3)]"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Đang xử lý...' : 'Xác nhận & Điều chỉnh'}
        </button>
      </div>
    </div>
  )
}

export default StockCheckPage