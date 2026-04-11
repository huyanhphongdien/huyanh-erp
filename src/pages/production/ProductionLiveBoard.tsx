// ============================================================================
// PRODUCTION LIVE BOARD — Full-screen dark theme cho TV nhà máy
// File: src/pages/production/ProductionLiveBoard.tsx
// Auto-refresh via Supabase Realtime, 55" TV optimized
// ============================================================================

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Typography, Tag, Progress, Spin } from 'antd'
import {
  ThunderboltOutlined, ClockCircleOutlined, CheckCircleOutlined,
  WarningOutlined, LoadingOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'

const { Text } = Typography

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  planned: { label: 'Chờ SX', color: '#8c8c8c', icon: '⏳' },
  in_progress: { label: 'Đang SX', color: '#52c41a', icon: '🔄' },
  completed: { label: 'Hoàn thành', color: '#1890ff', icon: '✅' },
  cancelled: { label: 'Đã hủy', color: '#ff4d4f', icon: '❌' },
}

export default function ProductionLiveBoard() {
  const queryClient = useQueryClient()
  const [currentTime, setCurrentTime] = useState(new Date())

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch active production orders
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['production-live-orders'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('production_orders')
        .select('*, product:materials(name, code)')
        .in('status', ['planned', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(6)
      return (data || []).map((o: any) => ({
        ...o,
        product: Array.isArray(o.product) ? o.product[0] : o.product,
      }))
    },
    refetchInterval: 10000, // Auto-refresh every 10s
  })

  // Fetch step progress per order
  const { data: stepsMap = {} } = useQuery({
    queryKey: ['production-live-steps', orders.map((o: any) => o.id).join(',')],
    queryFn: async () => {
      if (orders.length === 0) return {}
      const ids = orders.map((o: any) => o.id)
      const { data } = await supabase
        .from('production_step_logs')
        .select('production_order_id, step_number, step_name, status')
        .in('production_order_id', ids)
        .order('step_number')

      const map: Record<string, { total: number; completed: number; current: string }> = {}
      for (const s of (data || [])) {
        if (!map[s.production_order_id]) map[s.production_order_id] = { total: 0, completed: 0, current: '' }
        map[s.production_order_id].total++
        if (s.status === 'completed') map[s.production_order_id].completed++
        if (s.status === 'in_progress') map[s.production_order_id].current = `B${s.step_number}: ${s.step_name}`
      }
      return map
    },
    enabled: orders.length > 0,
    refetchInterval: 10000,
  })

  // Fetch today's summary
  const { data: todaySummary = { output: 0, downtime: 0, orders_count: 0 } } = useQuery({
    queryKey: ['production-live-summary'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]

      // Today's completed orders output
      const { data: completedToday } = await supabase
        .from('production_orders')
        .select('actual_quantity')
        .eq('status', 'completed')
        .gte('completed_at', today)

      const output = (completedToday || []).reduce((s: number, o: any) => s + (o.actual_quantity || 0), 0)

      // Today's downtime
      const { data: downtimes } = await supabase
        .from('production_downtimes')
        .select('duration_minutes')
        .gte('started_at', today)

      const downtime = (downtimes || []).reduce((s: number, d: any) => s + (d.duration_minutes || 0), 0)

      return { output: Math.round(output / 100) / 10, downtime, orders_count: orders.length }
    },
    refetchInterval: 30000,
  })

  // Supabase Realtime subscription — trigger refetch on changes
  useEffect(() => {
    const channel = supabase
      .channel('production-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['production-live-orders'] })
        queryClient.invalidateQueries({ queryKey: ['production-live-summary'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_step_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['production-live-steps'] })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'production_downtimes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['production-live-summary'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const timeStr = currentTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1628, #1a2744)',
      color: '#e5e7eb',
      padding: 24,
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            🏭 BẢNG GIÁM SÁT SẢN XUẤT
          </div>
          <div style={{ fontSize: 14, color: '#9ca3af', marginTop: 2 }}>
            HUY ANH RUBBER — Nhà máy Phong Điền
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
            {timeStr}
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{dateStr}</div>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Lệnh SX đang chạy', value: orders.filter((o: any) => o.status === 'in_progress').length, color: '#10b981', icon: '🔄' },
          { label: 'Sản lượng hôm nay', value: `${todaySummary.output}T`, color: '#3b82f6', icon: '📦' },
          { label: 'Dừng máy', value: `${todaySummary.downtime}p`, color: todaySummary.downtime > 60 ? '#ef4444' : '#f59e0b', icon: '⏱️' },
          { label: 'Chờ sản xuất', value: orders.filter((o: any) => o.status === 'planned').length, color: '#8b5cf6', icon: '⏳' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 16,
            padding: '20px 24px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>{kpi.icon} {kpi.label}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: kpi.color, fontFamily: "'JetBrains Mono', monospace" }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Production Order Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {isLoading ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60 }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 40, color: '#10b981' }} />} />
          </div>
        ) : orders.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60, color: '#6b7280' }}>
            Không có lệnh sản xuất đang chạy
          </div>
        ) : (
          orders.map((order: any) => {
            const steps = stepsMap[order.id] || { total: 10, completed: 0, current: '' }
            const progress = steps.total > 0 ? Math.round(steps.completed / steps.total * 100) : 0
            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.planned
            const isActive = order.status === 'in_progress'

            return (
              <div key={order.id} style={{
                background: isActive
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02))'
                  : 'rgba(255,255,255,0.03)',
                borderRadius: 16,
                padding: 20,
                border: `1px solid ${isActive ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                transition: 'all 0.3s',
              }}>
                {/* Order header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                      {order.order_code || 'LSX'}
                    </div>
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>
                      {order.product?.name || '—'}
                    </div>
                  </div>
                  <span style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: `${cfg.color}22`, color: cfg.color, border: `1px solid ${cfg.color}44`,
                  }}>
                    {cfg.icon} {cfg.label}
                  </span>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>Tiến độ</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>
                      {progress}% ({steps.completed}/{steps.total})
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}cc)`,
                      borderRadius: 4,
                      transition: 'width 0.5s',
                    }} />
                  </div>
                </div>

                {/* Current step */}
                {steps.current && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(16,185,129,0.1)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    fontSize: 13, color: '#10b981', fontWeight: 600,
                  }}>
                    🔄 {steps.current}
                  </div>
                )}

                {/* Quantity */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: '#6b7280' }}>
                  <span>KH: {order.target_quantity ? `${(order.target_quantity / 1000).toFixed(1)}T` : '—'}</span>
                  <span>TT: {order.actual_quantity ? `${(order.actual_quantity / 1000).toFixed(1)}T` : '—'}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer ticker */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
        padding: '8px 24px', fontSize: 13, color: '#9ca3af',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>Tự động cập nhật: 10 giây</span>
        <span>HUY ANH RUBBER — Quản lý sản xuất</span>
      </div>
    </div>
  )
}
