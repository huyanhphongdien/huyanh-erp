// ============================================================================
// FILE: src/pages/wms/InventoryDetailPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Bước 5.5: Chi tiết tồn kho 1 sản phẩm
// MÔ TẢ: Tồn theo kho (breakdown), tồn theo lô, line chart biến động,
//         lịch sử xuất nhập gần đây
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, Warehouse, MapPin, Calendar, BarChart3,
  TrendingUp, TrendingDown, Clock, Loader2, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Beaker
} from 'lucide-react'
import { inventoryService, type StockMovement } from '../../services/wms/inventoryService'
import type { Material, StockBatch, InventoryTransaction } from '../../services/wms/wms.types'

// ============================================================================
// COMPONENT
// ============================================================================

const InventoryDetailPage = () => {
  const { materialId } = useParams<{ materialId: string }>()
  const navigate = useNavigate()

  // State
  const [material, setMaterial] = useState<Material | null>(null)
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'batches' | 'history' | 'chart'>('batches')
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!materialId) return
    try {
      setLoading(true)

      const [batchData, movementData, txData] = await Promise.all([
        inventoryService.getStockByBatch(materialId),
        inventoryService.getStockMovements(materialId, 30),
        inventoryService.getTransactionHistory({
          material_id: materialId,
          page: 1,
          pageSize: 20,
        }),
      ])

      setBatches(batchData)
      setMovements(movementData)
      setTransactions(txData.data)

      // Lấy material info từ batch đầu tiên hoặc query riêng
      if (batchData.length > 0 && batchData[0].material) {
        setMaterial(batchData[0].material as Material)
      }
    } catch (err) {
      console.error('Load inventory detail error:', err)
    } finally {
      setLoading(false)
    }
  }, [materialId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --------------------------------------------------------------------------
  // COMPUTED
  // --------------------------------------------------------------------------

  const totalQty = batches.reduce((sum, b) => sum + (b.quantity_remaining || 0), 0)
  const totalWeight = batches.reduce((sum, b) => {
    const wpUnit = (b.material as any)?.weight_per_unit || 0
    return sum + (b.quantity_remaining || 0) * wpUnit
  }, 0)

  // QC summary
  const qcPassed = batches.filter(b => b.qc_status === 'passed').length
  const qcWarning = batches.filter(b => b.qc_status === 'warning').length
  const qcFailed = batches.filter(b => b.qc_status === 'failed' || b.qc_status === 'needs_blend').length

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------

  const getQCBadge = (status: string) => {
    switch (status) {
      case 'passed':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">✅ Đạt</span>
      case 'warning':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">⚠️ Cảnh báo</span>
      case 'failed':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">❌ Không đạt</span>
      case 'needs_blend':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">🧪 Cần phối trộn</span>
      case 'pending':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">⏳ Chờ QC</span>
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">{status}</span>
    }
  }

  const getTxTypeLabel = (type: string) => {
    switch (type) {
      case 'in': return { label: 'Nhập kho', color: 'text-emerald-600', icon: '+' }
      case 'out': return { label: 'Xuất kho', color: 'text-red-600', icon: '-' }
      case 'adjust': return { label: 'Điều chỉnh', color: 'text-blue-600', icon: '±' }
      case 'transfer': return { label: 'Chuyển kho', color: 'text-purple-600', icon: '↔' }
      case 'blend_in': return { label: 'Nhập phối trộn', color: 'text-emerald-600', icon: '+' }
      case 'blend_out': return { label: 'Xuất phối trộn', color: 'text-amber-600', icon: '-' }
      default: return { label: type, color: 'text-gray-600', icon: '' }
    }
  }

  // --------------------------------------------------------------------------
  // CHART — Simple SVG bar chart
  // --------------------------------------------------------------------------

  const renderChart = () => {
    if (movements.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Chưa có dữ liệu biến động</p>
        </div>
      )
    }

    const maxBalance = Math.max(...movements.map(m => m.balance), 1)
    const chartHeight = 160
    const barWidth = Math.max(4, Math.floor(280 / movements.length) - 1)

    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Biến động tồn kho 30 ngày</h3>

        {/* SVG Chart */}
        <div className="overflow-x-auto">
          <svg
            width={Math.max(300, movements.length * (barWidth + 2))}
            height={chartHeight + 30}
            className="w-full"
          >
            {/* Bars */}
            {movements.map((m, i) => {
              const barHeight = (m.balance / maxBalance) * chartHeight
              const x = i * (barWidth + 2) + 5
              const y = chartHeight - barHeight

              return (
                <g key={m.date}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={2}
                    fill={m.balance < (material?.min_stock || 0) ? '#EF4444' : '#2D8B6E'}
                    opacity={0.8}
                  />
                  {/* Date label every 5 days */}
                  {i % 5 === 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={chartHeight + 15}
                      textAnchor="middle"
                      fontSize={8}
                      fill="#9CA3AF"
                    >
                      {new Date(m.date).getDate()}/{new Date(m.date).getMonth() + 1}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Min stock line */}
            {material?.min_stock && material.min_stock > 0 && (
              <>
                <line
                  x1={0}
                  y1={chartHeight - (material.min_stock / maxBalance) * chartHeight}
                  x2="100%"
                  y2={chartHeight - (material.min_stock / maxBalance) * chartHeight}
                  stroke="#EF4444"
                  strokeDasharray="4,4"
                  strokeWidth={1}
                />
                <text
                  x={5}
                  y={chartHeight - (material.min_stock / maxBalance) * chartHeight - 3}
                  fontSize={8}
                  fill="#EF4444"
                >
                  Min: {material.min_stock}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-[#2D8B6E]" />
            <span className="text-[10px] text-gray-400">Tồn bình thường</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span className="text-[10px] text-gray-400">Dưới tồn min</span>
          </div>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // LOADING
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1B4D3E]" />
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F7F5F2]">

      {/* ========== HEADER ========== */}
      <div className="bg-[#1B4D3E] text-white px-4 pt-[env(safe-area-inset-top)] pb-4">
        <div className="flex items-center gap-3 pt-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full
              bg-white/10 active:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">
              {material?.name || 'Chi tiết tồn kho'}
            </h1>
            <p className="text-xs text-white/60 mt-0.5">
              {material?.sku} • {material?.unit}
            </p>
          </div>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {totalQty.toLocaleString('vi-VN')}
            </p>
            <p className="text-[10px] text-white/60">Tồn ({material?.unit || 'bành'})</p>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {(totalWeight / 1000).toFixed(1)}
            </p>
            <p className="text-[10px] text-white/60">Khối lượng (tấn)</p>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {batches.length}
            </p>
            <p className="text-[10px] text-white/60">Số lô</p>
          </div>
        </div>
      </div>

      {/* ========== TABS ========== */}
      <div className="bg-white border-b border-gray-100 flex">
        {[
          { key: 'batches', label: `Theo lô (${batches.length})`, icon: Package },
          { key: 'chart', label: 'Biến động', icon: BarChart3 },
          { key: 'history', label: 'Lịch sử', icon: Clock },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium
              border-b-2 transition-colors
              ${activeTab === tab.key
                ? 'border-[#1B4D3E] text-[#1B4D3E]'
                : 'border-transparent text-gray-400'}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-8">

        {/* ========== TAB: BATCHES ========== */}
        {activeTab === 'batches' && (
          <div className="mt-4 space-y-2">
            {/* QC Summary */}
            <div className="flex gap-2 mb-3">
              {qcPassed > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 rounded-lg">
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-700 font-medium">{qcPassed} đạt</span>
                </div>
              )}
              {qcWarning > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] text-amber-700 font-medium">{qcWarning} cảnh báo</span>
                </div>
              )}
              {qcFailed > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-red-50 rounded-lg">
                  <Beaker className="w-3 h-3 text-red-500" />
                  <span className="text-[10px] text-red-700 font-medium">{qcFailed} cần xử lý</span>
                </div>
              )}
            </div>

            {batches.map(batch => (
              <div key={batch.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedBatch(expandedBatch === batch.id ? null : batch.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-800"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {batch.batch_no}
                        </p>
                        {getQCBadge(batch.qc_status || 'pending')}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {batch.received_date
                            ? new Date(batch.received_date).toLocaleDateString('vi-VN')
                            : '—'}
                        </span>
                        {batch.location && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {(batch.location as any)?.code || '—'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      <div>
                        <p className="text-lg font-bold text-[#1B4D3E]"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {batch.quantity_remaining}
                        </p>
                        <p className="text-[10px] text-gray-400">{material?.unit || 'bành'}</p>
                      </div>
                      {expandedBatch === batch.id
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />
                      }
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {expandedBatch === batch.id && (
                  <div className="px-4 pb-4 border-t border-gray-50"
                    style={{ animation: 'slideDown 0.2s ease-out' }}
                  >
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">SL ban đầu</p>
                        <p className="text-sm font-semibold text-gray-700">{batch.initial_quantity}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">SL còn lại</p>
                        <p className="text-sm font-semibold text-[#1B4D3E]">{batch.quantity_remaining}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">DRC ban đầu</p>
                        <p className="text-sm font-semibold text-gray-700">
                          {batch.initial_drc ? `${batch.initial_drc}%` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">DRC hiện tại</p>
                        <p className="text-sm font-semibold text-gray-700">
                          {batch.latest_drc ? `${batch.latest_drc}%` : '—'}
                        </p>
                      </div>
                      {batch.expiry_date && (
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Hết hạn</p>
                          <p className="text-sm font-semibold text-gray-700">
                            {new Date(batch.expiry_date).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                      )}
                      {batch.next_recheck_date && (
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Tái kiểm</p>
                          <p className="text-sm font-semibold text-gray-700">
                            {new Date(batch.next_recheck_date).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {batches.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Không có lô hàng nào</p>
              </div>
            )}
          </div>
        )}

        {/* ========== TAB: CHART ========== */}
        {activeTab === 'chart' && (
          <div className="mt-4">
            {renderChart()}

            {/* Daily summary */}
            <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">7 ngày gần nhất</h3>
              <div className="space-y-2">
                {movements.slice(-7).reverse().map(m => (
                  <div key={m.date} className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-500 w-20">
                      {new Date(m.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-3">
                      {m.in_quantity > 0 && (
                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-0.5">
                          <TrendingUp className="w-3 h-3" />+{m.in_quantity}
                        </span>
                      )}
                      {m.out_quantity > 0 && (
                        <span className="text-xs text-red-600 font-medium flex items-center gap-0.5">
                          <TrendingDown className="w-3 h-3" />-{m.out_quantity}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-16 text-right"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {m.balance}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========== TAB: HISTORY ========== */}
        {activeTab === 'history' && (
          <div className="mt-4 space-y-2">
            {transactions.map(tx => {
              const txInfo = getTxTypeLabel(tx.type)
              return (
                <div key={tx.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${txInfo.color}`}
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {txInfo.icon}{Math.abs(tx.quantity)}
                      </span>
                      <span className="text-xs text-gray-500">{txInfo.label}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  {tx.notes && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{tx.notes}</p>
                  )}
                </div>
              )
            })}

            {transactions.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Chưa có lịch sử giao dịch</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========== ANIMATIONS ========== */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default InventoryDetailPage