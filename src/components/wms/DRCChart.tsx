// ============================================================================
// FILE: src/components/wms/DRCChart.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P6 — Sprint 6D-1 — Biểu đồ DRC theo thời gian
// ============================================================================
// Recharts line chart:
// - Line: DRC qua các lần kiểm
// - Reference areas: vùng đạt (xanh), cảnh báo (vàng), ngoài khoảng (đỏ)
// - Reference lines: drc_standard (nét đứt xanh), drc_min/max (nét đứt đỏ)
// - Custom dots: 🟢 passed, 🟡 warning, 🔴 failed
// - Tooltip tiếng Việt đầy đủ
// - Responsive, mobile-first
// ============================================================================

import React, { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import { Loader2 } from 'lucide-react'
import qcService from '../../services/wms/qcService'
import type { BatchQCResult, MaterialQCStandard } from '../../services/wms/wms.types'

// ============================================================================
// TYPES
// ============================================================================

interface DRCChartProps {
  batchId: string
  standard?: MaterialQCStandard | null
  /** Nếu true, component tự fetch QC history + standard */
  autoFetch?: boolean
  /** Nếu cung cấp, dùng thay vì fetch */
  data?: BatchQCResult[]
  /** Chiều cao tối thiểu (px) */
  minHeight?: number
  /** Hiển thị legend */
  showLegend?: boolean
}

interface ChartPoint {
  date: string         // "15/02"
  fullDate: string     // "15/02/2025"
  drc: number | null
  result: string       // 'passed' | 'warning' | 'failed' | 'pending'
  checkType: string    // 'initial' | 'recheck' | 'blend' | 'export'
  tester?: string
  notes?: string
}

// ============================================================================
// HELPERS
// ============================================================================

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CHECK_TYPE_LABELS: Record<string, string> = {
  initial: 'Kiểm tra ban đầu',
  recheck: 'Tái kiểm',
  blend: 'Sau phối trộn',
  export: 'Trước xuất khẩu',
}

const RESULT_LABELS: Record<string, string> = {
  passed: 'Đạt',
  warning: 'Cảnh báo',
  failed: 'Không đạt',
  pending: 'Chờ',
}

const RESULT_COLORS: Record<string, string> = {
  passed: '#16A34A',
  warning: '#D97706',
  failed: '#DC2626',
  pending: '#9CA3AF',
}

// ============================================================================
// CUSTOM DOT — màu theo kết quả QC
// ============================================================================

const CustomDot: React.FC<any> = (props) => {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined) return null

  const color = RESULT_COLORS[payload?.result] || RESULT_COLORS.pending
  const isFailed = payload?.result === 'failed'

  return (
    <g>
      {/* Outer ring for emphasis on failed */}
      {isFailed && (
        <circle cx={cx} cy={cy} r={8} fill={color} fillOpacity={0.15} />
      )}
      {/* Main dot */}
      <circle
        cx={cx}
        cy={cy}
        r={isFailed ? 5 : 4}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
      />
    </g>
  )
}

// ============================================================================
// CUSTOM TOOLTIP
// ============================================================================

const CustomTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null

  const data = payload[0].payload as ChartPoint

  return (
    <div
      className="
        bg-white rounded-xl shadow-lg border border-gray-100
        px-3.5 py-2.5 max-w-[220px]
      "
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
    >
      {/* Date */}
      <p className="text-[11px] text-gray-400 mb-1">{data.fullDate}</p>

      {/* DRC value */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: RESULT_COLORS[data.result] || '#9CA3AF' }}
        />
        <span
          className="text-[16px] font-bold"
          style={{
            color: RESULT_COLORS[data.result] || '#374151',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {data.drc != null ? `${data.drc}%` : '—'}
        </span>
      </div>

      {/* Result + Check type */}
      <p className="text-[11px] text-gray-600">
        {RESULT_LABELS[data.result] || data.result}
        {' · '}
        {CHECK_TYPE_LABELS[data.checkType] || data.checkType}
      </p>

      {/* Notes */}
      {data.notes && (
        <p className="text-[10px] text-gray-400 mt-1 truncate">
          {data.notes}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// LEGEND
// ============================================================================

const ChartLegend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 mt-2">
    <span className="flex items-center gap-1 text-[10px] text-gray-500">
      <span className="w-6 h-2 bg-emerald-100 rounded-sm inline-block border border-emerald-200" />
      Đạt chuẩn
    </span>
    <span className="flex items-center gap-1 text-[10px] text-gray-500">
      <span className="w-6 h-2 bg-amber-100 rounded-sm inline-block border border-amber-200" />
      Cảnh báo
    </span>
    <span className="flex items-center gap-1 text-[10px] text-gray-500">
      <span className="w-6 h-2 bg-red-50 rounded-sm inline-block border border-red-200" />
      Ngoài khoảng
    </span>
    <span className="flex items-center gap-1 text-[10px] text-gray-500">
      <span className="w-4 border-t border-dashed border-emerald-600 inline-block" />
      DRC chuẩn
    </span>
  </div>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const DRCChart: React.FC<DRCChartProps> = ({
  batchId,
  standard: externalStandard,
  autoFetch = true,
  data: externalData,
  minHeight = 220,
  showLegend = true,
}) => {
  const [qcHistory, setQcHistory] = useState<BatchQCResult[]>(externalData || [])
  const [standard, setStandard] = useState<MaterialQCStandard | null>(externalStandard ?? null)
  const [loading, setLoading] = useState(autoFetch && !externalData)

  // Fetch data if autoFetch
  useEffect(() => {
    if (!autoFetch || externalData) return

    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch QC history
        const history = await qcService.getQCHistory(batchId)
        setQcHistory(history)

        // Fetch standard if not provided
        if (!externalStandard && history.length > 0) {
          // Get material_id from batch
          const { data: batch } = await (await import('../../lib/supabase')).supabase
            .from('stock_batches')
            .select('material_id')
            .eq('id', batchId)
            .single()

          if (batch?.material_id) {
            const std = await qcService.getStandard(batch.material_id)
            setStandard(std)
          }
        }
      } catch (err) {
        console.error('Lỗi fetch DRC chart data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [batchId, autoFetch, externalData, externalStandard])

  // Update if external data changes
  useEffect(() => {
    if (externalData) setQcHistory(externalData)
  }, [externalData])

  useEffect(() => {
    if (externalStandard !== undefined) setStandard(externalStandard ?? null)
  }, [externalStandard])

  // --------------------------------------------------------------------------
  // CHART DATA
  // --------------------------------------------------------------------------

  const chartData: ChartPoint[] = qcHistory
    .filter(qc => qc.drc_value != null)
    .map(qc => ({
      date: formatShortDate(qc.tested_at),
      fullDate: formatFullDate(qc.tested_at),
      drc: qc.drc_value ?? null,
      result: qc.result,
      checkType: qc.check_type,
      tester: undefined, // tester_id → could resolve name
      notes: qc.notes ?? undefined,
    }))

  // Y-axis domain
  const drcValues = chartData.map(d => d.drc).filter((v): v is number => v !== null)
  const stdMin = standard?.drc_min ?? 55
  const stdMax = standard?.drc_max ?? 65
  const allValues = [...drcValues, stdMin, stdMax]
  const yMin = Math.floor(Math.min(...allValues) - 2)
  const yMax = Math.ceil(Math.max(...allValues) + 2)

  // Standard values
  const drcStandard = standard?.drc_standard
  const drcMin = standard?.drc_min
  const drcMax = standard?.drc_max
  const warnLow = standard?.drc_warning_low
  const warnHigh = standard?.drc_warning_high

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  // Loading
  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-xl"
        style={{ minHeight }}
      >
        <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
      </div>
    )
  }

  // No data
  if (chartData.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-gray-50 rounded-xl text-center px-4"
        style={{ minHeight }}
      >
        <p className="text-[13px] text-gray-400">Chưa có dữ liệu QC</p>
        <p className="text-[11px] text-gray-300 mt-1">Biểu đồ DRC sẽ hiện sau khi có kết quả kiểm tra</p>
      </div>
    )
  }

  // Single point — show value instead of chart
  if (chartData.length === 1) {
    const point = chartData[0]
    return (
      <div
        className="bg-gray-50 rounded-xl px-4 py-5 text-center"
        style={{ minHeight: Math.min(minHeight, 120) }}
      >
        <p className="text-[11px] text-gray-400 mb-1">{point.fullDate} · {CHECK_TYPE_LABELS[point.checkType]}</p>
        <p
          className="text-[28px] font-bold"
          style={{
            color: RESULT_COLORS[point.result] || '#374151',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {point.drc}%
        </p>
        <p className="text-[12px] mt-1" style={{ color: RESULT_COLORS[point.result] }}>
          {RESULT_LABELS[point.result]}
        </p>
        {showLegend && standard && (
          <p className="text-[10px] text-gray-400 mt-2">
            Chuẩn: {standard.drc_standard}% · Khoảng: {stdMin}–{stdMax}%
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={minHeight}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -15, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />

          {/* Reference Areas — vùng màu nền */}
          {/* Vùng cảnh báo dưới: drc_min → warnLow */}
          {drcMin != null && warnLow != null && warnLow > drcMin && (
            <ReferenceArea
              y1={drcMin}
              y2={warnLow}
              fill="#FEF3C7"
              fillOpacity={0.4}
              ifOverflow="hidden"
            />
          )}
          {/* Vùng đạt: warnLow → warnHigh */}
          {warnLow != null && warnHigh != null && (
            <ReferenceArea
              y1={warnLow}
              y2={warnHigh}
              fill="#D1FAE5"
              fillOpacity={0.4}
              ifOverflow="hidden"
            />
          )}
          {/* Vùng cảnh báo trên: warnHigh → drc_max */}
          {warnHigh != null && drcMax != null && drcMax > warnHigh && (
            <ReferenceArea
              y1={warnHigh}
              y2={drcMax}
              fill="#FEF3C7"
              fillOpacity={0.4}
              ifOverflow="hidden"
            />
          )}

          {/* Reference Lines — ngưỡng */}
          {drcMin != null && (
            <ReferenceLine
              y={drcMin}
              stroke="#EF4444"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: `Min ${drcMin}`, position: 'insideBottomLeft', fontSize: 9, fill: '#EF4444' }}
            />
          )}
          {drcMax != null && (
            <ReferenceLine
              y={drcMax}
              stroke="#EF4444"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: `Max ${drcMax}`, position: 'insideTopLeft', fontSize: 9, fill: '#EF4444' }}
            />
          )}
          {drcStandard != null && (
            <ReferenceLine
              y={drcStandard}
              stroke="#16A34A"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              label={{ value: `Chuẩn ${drcStandard}`, position: 'insideTopRight', fontSize: 9, fill: '#16A34A' }}
            />
          )}

          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={{ stroke: '#E5E7EB' }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />

          <Tooltip content={<CustomTooltip />} />

          <Line
            type="monotone"
            dataKey="drc"
            stroke="#1B4D3E"
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 6, stroke: '#1B4D3E', strokeWidth: 2, fill: '#fff' }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      {showLegend && <ChartLegend />}
    </div>
  )
}

export default DRCChart