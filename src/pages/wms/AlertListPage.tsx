// ============================================================================
// FILE: src/pages/wms/AlertListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Bước 5.6: Danh sách cảnh báo
// MÔ TẢ: Tab filter, severity badge, pull-to-refresh, dismiss
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Bell, AlertTriangle, Package, Clock, Beaker,
  RefreshCw, Loader2, ChevronRight, X, Filter
} from 'lucide-react'
import { alertService, type StockAlert, type AlertType } from '../../services/wms/alertService'

// ============================================================================
// TYPES
// ============================================================================

type TabKey = 'all' | 'stock' | 'expiry' | 'qc'

const TABS: Array<{ key: TabKey; label: string; icon: any; types: AlertType[] }> = [
  { key: 'all', label: 'Tất cả', icon: Bell, types: [] },
  { key: 'stock', label: 'Tồn kho', icon: Package, types: ['low_stock', 'over_stock'] },
  { key: 'expiry', label: 'Hết hạn', icon: Clock, types: ['expiring', 'expired'] },
  { key: 'qc', label: 'QC', icon: Beaker, types: ['needs_recheck', 'needs_blend'] },
]

// ============================================================================
// COMPONENT
// ============================================================================

const AlertListPage = () => {
  const navigate = useNavigate()

  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // --------------------------------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------------------------------

  const loadAlerts = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      else setLoading(true)

      const data = await alertService.checkAllAlerts()
      setAlerts(data)
    } catch (err) {
      console.error('Load alerts error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  // --------------------------------------------------------------------------
  // FILTER
  // --------------------------------------------------------------------------

  const tab = TABS.find(t => t.key === activeTab)!
  const filteredAlerts = alerts
    .filter(a => !dismissedIds.has(a.id))
    .filter(a => {
      if (activeTab === 'all') return true
      return tab.types.includes(a.type)
    })

  // Tab counts
  const tabCounts: Record<TabKey, number> = {
    all: alerts.filter(a => !dismissedIds.has(a.id)).length,
    stock: alerts.filter(a => !dismissedIds.has(a.id) && ['low_stock', 'over_stock'].includes(a.type)).length,
    expiry: alerts.filter(a => !dismissedIds.has(a.id) && ['expiring', 'expired'].includes(a.type)).length,
    qc: alerts.filter(a => !dismissedIds.has(a.id) && ['needs_recheck', 'needs_blend'].includes(a.type)).length,
  }

  // --------------------------------------------------------------------------
  // DISMISS
  // --------------------------------------------------------------------------

  const handleDismiss = (alertId: string) => {
    setDismissedIds(prev => new Set([...prev, alertId]))
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'high': return { border: 'border-l-red-500', bg: 'bg-red-50', icon: '🔴', text: 'Cao' }
      case 'medium': return { border: 'border-l-amber-500', bg: 'bg-amber-50', icon: '🟡', text: 'Trung bình' }
      case 'low': return { border: 'border-l-blue-500', bg: 'bg-blue-50', icon: '🟢', text: 'Thấp' }
      default: return { border: 'border-l-gray-400', bg: 'bg-gray-50', icon: '⚪', text: '' }
    }
  }

  const getAlertTypeIcon = (type: AlertType) => {
    switch (type) {
      case 'low_stock': return <Package className="w-4 h-4 text-red-500" />
      case 'over_stock': return <Package className="w-4 h-4 text-amber-500" />
      case 'expiring': return <Clock className="w-4 h-4 text-amber-500" />
      case 'expired': return <Clock className="w-4 h-4 text-red-500" />
      case 'needs_recheck': return <Beaker className="w-4 h-4 text-blue-500" />
      case 'needs_blend': return <Beaker className="w-4 h-4 text-purple-500" />
      default: return <AlertTriangle className="w-4 h-4 text-gray-400" />
    }
  }

  // --------------------------------------------------------------------------
  // LOADING
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#1B4D3E] mx-auto mb-3" />
          <p className="text-sm text-gray-500">Đang kiểm tra cảnh báo...</p>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F7F5F2]">

      {/* ========== HEADER ========== */}
      <div className="bg-[#1B4D3E] text-white px-4 pt-[env(safe-area-inset-top)] pb-3">
        <div className="flex items-center gap-3 pt-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full
              bg-white/10 active:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold">Cảnh báo</h1>
            <p className="text-xs text-white/60 mt-0.5">
              {tabCounts.all} cảnh báo đang hoạt động
            </p>
          </div>
          <button
            onClick={() => loadAlerts(true)}
            disabled={refreshing}
            className="w-10 h-10 flex items-center justify-center rounded-full
              bg-white/10 active:bg-white/20 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ========== TABS ========== */}
      <div className="bg-white border-b border-gray-100 flex overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap
              border-b-2 transition-colors shrink-0
              ${activeTab === t.key
                ? 'border-[#1B4D3E] text-[#1B4D3E]'
                : 'border-transparent text-gray-400'}`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {tabCounts[t.key] > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold
                ${activeTab === t.key ? 'bg-[#1B4D3E] text-white' : 'bg-gray-100 text-gray-500'}`}>
                {tabCounts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========== ALERT LIST ========== */}
      <div className="px-4 pb-8">
        {filteredAlerts.length === 0 ? (
          <div className="mt-8 text-center">
            <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-3">
              <Bell className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">Không có cảnh báo nào</p>
            <p className="text-xs text-gray-400 mt-1">
              {activeTab === 'all' ? 'Tất cả hoạt động kho đều bình thường' : `Không có cảnh báo ${tab.label.toLowerCase()}`}
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {filteredAlerts.map(alert => {
              const style = getSeverityStyle(alert.severity)

              return (
                <div
                  key={alert.id}
                  className={`border-l-4 ${style.border} ${style.bg} rounded-xl p-3
                    transition-all duration-200`}
                  style={{ animation: 'slideIn 0.3s ease-out' }}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Icon */}
                    <div className="mt-0.5 shrink-0">
                      {getAlertTypeIcon(alert.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 leading-tight">
                        {alert.message}
                      </p>
                      {alert.detail && (
                        <p className="text-xs text-gray-500 mt-0.5">{alert.detail}</p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold
                          ${alert.severity === 'high' ? 'bg-red-100 text-red-700'
                            : alert.severity === 'medium' ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'}`}>
                          {style.text}
                        </span>

                        {alert.material_id && (
                          <button
                            onClick={() => navigate(`/wms/inventory/${alert.material_id}`)}
                            className="text-[10px] text-[#2D8B6E] font-medium flex items-center gap-0.5"
                          >
                            Xem chi tiết <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Dismiss */}
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="p-1.5 rounded-lg hover:bg-black/5 transition-colors shrink-0"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ========== ANIMATIONS ========== */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

export default AlertListPage