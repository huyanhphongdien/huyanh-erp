// ============================================================================
// CapacityDashboard — load real-time mỗi bộ phận
// File: src/pages/sales/components/CapacityDashboard.tsx
// Sprint 2 D5 (Sales Tracking & Control)
// ============================================================================

import { useEffect, useState } from 'react'
import { Card, Spin, Tooltip } from 'antd'
import { useNavigate } from 'react-router-dom'
import { salesStageService, type CapacityRow } from '../../../services/sales/salesStageService'
import {
  type SalesStage,
  SALES_STAGE_EMOJI,
  SALES_STAGE_LABELS,
} from '../../../services/sales/salesStages'

type LoadStatus = 'idle' | 'ok' | 'warn' | 'critical'

function classifyLoad(currentLoad: number, capacity: CapacityRow): LoadStatus {
  if (capacity.dept_code === 'delivered') return 'idle'  // terminal — không tính
  const pct = capacity.max_concurrent_orders > 0
    ? (currentLoad / capacity.max_concurrent_orders) * 100
    : 0
  if (pct >= capacity.critical_threshold_pct) return 'critical'
  if (pct >= capacity.warning_threshold_pct) return 'warn'
  if (pct < 30) return 'idle'
  return 'ok'
}

const STATUS_LABEL: Record<LoadStatus, string> = {
  idle: 'Rảnh',
  ok: 'OK',
  warn: 'Cận tải',
  critical: 'Quá tải',
}

const STATUS_COLOR: Record<LoadStatus, { fg: string; bg: string; bar: string }> = {
  idle:     { fg: '#10b981', bg: '#d1fae5', bar: '#10b981' },
  ok:       { fg: '#0a72ef', bg: '#dbeafe', bar: '#0a72ef' },
  warn:     { fg: '#f59e0b', bg: '#fef3c7', bar: '#f59e0b' },
  critical: { fg: '#ff5b4f', bg: '#fee2e2', bar: '#ff5b4f' },
}

export default function CapacityDashboard() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<CapacityRow[]>([])
  const [load, setLoad] = useState<Record<SalesStage, number>>({} as any)
  const [loading, setLoading] = useState(true)

  const fetch = async () => {
    setLoading(true)
    const [c, l] = await Promise.all([
      salesStageService.getCapacityConfig(),
      salesStageService.getDeptLoad(),
    ])
    setConfig(c)
    setLoad(l)
    setLoading(false)
  }

  useEffect(() => {
    fetch()
    // Refresh mỗi 60s để hiện load real-time
    const id = setInterval(fetch, 60_000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
      </Card>
    )
  }

  const activeConfig = config.filter(c => c.dept_code !== 'delivered')

  // Compute summary
  const totalActive = Object.entries(load)
    .filter(([k]) => k !== 'delivered')
    .reduce((s, [, v]) => s + (v as number), 0)
  const overloaded = activeConfig.filter(c =>
    classifyLoad(load[c.dept_code as SalesStage] || 0, c) === 'critical'
  )
  const idle = activeConfig.filter(c =>
    classifyLoad(load[c.dept_code as SalesStage] || 0, c) === 'idle'
  )

  return (
    <Card
      style={{ marginBottom: 16, borderRadius: 12 }}
      bodyStyle={{ padding: 16 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, color: '#1B4D3E' }}>📊 Capacity 7 bộ phận — real-time</span>
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>
            Tổng: <strong>{totalActive}</strong> đơn đang xử lý · auto refresh 60s
          </span>
        </div>
      }
      extra={
        <a onClick={() => navigate('/sales/kanban')} style={{ cursor: 'pointer', fontSize: 12 }}>
          Xem Kanban →
        </a>
      }
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
      }}>
        {activeConfig.map(c => {
          const stage = c.dept_code as SalesStage
          const current = load[stage] || 0
          const pct = c.max_concurrent_orders > 0
            ? Math.min(100, Math.round((current / c.max_concurrent_orders) * 100))
            : 0
          const status = classifyLoad(current, c)
          const colors = STATUS_COLOR[status]

          return (
            <Tooltip
              key={c.dept_code}
              title={`${c.dept_name} · SLA mặc định ${c.default_sla_hours}h · ${current}/${c.max_concurrent_orders} đơn`}
            >
              <div
                onClick={() => navigate(`/sales/kanban?stage=${stage}`)}
                style={{
                  border: `1px solid ${colors.bg}`,
                  borderLeft: `3px solid ${colors.bar}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  background: '#ffffff',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14 }}>{SALES_STAGE_EMOJI[stage]}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>
                      {SALES_STAGE_LABELS[stage]}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 9999,
                    background: colors.bg,
                    color: colors.fg,
                    textTransform: 'uppercase',
                  }}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>

                {/* Numbers */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{current}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>/ {c.max_concurrent_orders}</span>
                  <span style={{ fontSize: 11, color: colors.fg, marginLeft: 'auto', fontWeight: 600 }}>
                    {pct}%
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{
                  height: 4,
                  background: '#f3f4f6',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: colors.bar,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            </Tooltip>
          )
        })}
      </div>

      {/* Quick alerts row */}
      {(overloaded.length > 0 || idle.length > 0) && (
        <div style={{ marginTop: 12, padding: '8px 10px', background: '#f8f9fa', borderRadius: 6, fontSize: 12, color: '#374151' }}>
          {overloaded.length > 0 && (
            <span style={{ color: '#ff5b4f', fontWeight: 500 }}>
              ⚠️ Quá tải: {overloaded.map(c => c.dept_name).join(', ')}
            </span>
          )}
          {overloaded.length > 0 && idle.length > 0 && <span style={{ margin: '0 8px', color: '#d4d4d8' }}>·</span>}
          {idle.length > 0 && (
            <span style={{ color: '#10b981' }}>
              💚 Rảnh: {idle.map(c => c.dept_name).join(', ')}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}
