// ============================================================================
// FILE: src/components/project/GanttChart.tsx
// MODULE: Quản lý Dự án (Project Management) — Huy Anh Rubber ERP
// PHASE: PM4 — Bước 4.3 (Fixed: NaN guards, min dimensions)
// ============================================================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  ZoomIn,
  ZoomOut,
  ChevronRight,
  ChevronDown,
  Diamond,
  ListTree,
  GripVertical,
  AlertTriangle,
} from 'lucide-react'
import type { GanttItem, GanttDependency, GanttData } from '../../services/project/ganttService'

// ============================================================================
// TYPES
// ============================================================================

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

export interface GanttChartProps {
  data: GanttData
  zoomLevel?: ZoomLevel
  showCriticalPath?: boolean
  onItemClick?: (item: GanttItem) => void
  onDateChange?: (itemId: string, newStart: string, newEnd: string) => void
  onCreateDependency?: (sourceId: string, targetId: string) => void
  readOnly?: boolean
  className?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 56
const LEFT_PANEL_WIDTH = 360
const LEFT_PANEL_WIDTH_MOBILE = 0
const MIN_BAR_WIDTH = 6

const COLUMN_WIDTH: Record<ZoomLevel, number> = {
  day: 32,
  week: 80,
  month: 120,
  quarter: 160,
}

const COLORS = {
  brand: '#1B4D3E',
  brandLight: '#2D8B6E',
  accent: '#E8A838',
  critical: '#DC2626',
  criticalLight: '#FEE2E2',
  todayLine: '#2563EB',
  phaseBg: '#D1FAE5',
  phaseBar: '#2D6A4F',
  taskBar: '#1B4D3E',
  milestoneColor: '#E8A838',
  completedBar: '#16A34A',
  gridLine: '#E5E7EB',
  gridLineDark: '#D1D5DB',
  headerBg: '#F9FAFB',
  selectedBg: '#EFF6FF',
  dependencyArrow: '#9CA3AF',
  dependencyArrowCritical: '#DC2626',
}

// ============================================================================
// HELPERS
// ============================================================================

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function formatDateStr(date: Date): string {
  return date.toISOString().split('T')[0]
}

function addDaysToDate(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function formatShortDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`
}

function formatMonthYear(date: Date): string {
  const months = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12']
  return `${months[date.getMonth()]} ${date.getFullYear()}`
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function getQuarterLabel(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1
  return `Q${q} ${date.getFullYear()}`
}

/** Safe number — returns 0 for NaN/Infinity */
function safeNum(v: number): number {
  return isFinite(v) ? v : 0
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const MilestoneDiamond: React.FC<{
  cx: number; cy: number; size: number; color: string; completed: boolean
}> = ({ cx, cy, size, color, completed }) => {
  const half = size / 2
  const points = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`
  return (
    <polygon
      points={points}
      fill={completed ? color : 'white'}
      stroke={color}
      strokeWidth={2}
    />
  )
}

const DependencyArrow: React.FC<{
  fromX: number; fromY: number; toX: number; toY: number; isCritical: boolean
}> = ({ fromX, fromY, toX, toY, isCritical }) => {
  // Guard NaN
  if (!isFinite(fromX) || !isFinite(fromY) || !isFinite(toX) || !isFinite(toY)) return null

  const color = isCritical ? COLORS.dependencyArrowCritical : COLORS.dependencyArrow
  const midX = fromX + (toX - fromX) * 0.5

  const path = toX > fromX + 20
    ? `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`
    : `M ${fromX} ${fromY} H ${fromX + 12} V ${toY} H ${toX}`

  const arrowSize = 5
  const arrowHead = `M ${toX} ${toY} L ${toX - arrowSize} ${toY - arrowSize} L ${toX - arrowSize} ${toY + arrowSize} Z`

  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={isCritical ? '0' : '4 2'} />
      <path d={arrowHead} fill={color} />
    </g>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const GanttChart: React.FC<GanttChartProps> = ({
  data,
  zoomLevel: initialZoom = 'week',
  showCriticalPath = true,
  onItemClick,
  onDateChange,
  onCreateDependency,
  readOnly = false,
  className = '',
}) => {
  const [zoom, setZoom] = useState<ZoomLevel>(initialZoom)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [scrollLeft, setScrollLeft] = useState(0)

  const timelineRef = useRef<HTMLDivElement>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const colWidth = COLUMN_WIDTH[zoom]
  const leftWidth = isMobile ? LEFT_PANEL_WIDTH_MOBILE : LEFT_PANEL_WIDTH

  // ---- Timeline range ----
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const starts = data.items
      .map(i => parseDate(i.start))
      .filter((d): d is Date => d !== null)
    const ends = data.items
      .map(i => parseDate(i.end))
      .filter((d): d is Date => d !== null)

    if (starts.length === 0 || ends.length === 0) {
      const now = new Date()
      return {
        timelineStart: addDaysToDate(now, -7),
        timelineEnd: addDaysToDate(now, 90),
        totalDays: 97,
      }
    }

    const minStart = new Date(Math.min(...starts.map(d => d.getTime())))
    const maxEnd = new Date(Math.max(...ends.map(d => d.getTime())))

    const start = addDaysToDate(minStart, -14)
    const end = addDaysToDate(maxEnd, 14)

    return {
      timelineStart: start,
      timelineEnd: end,
      totalDays: Math.max(diffDays(start, end), 1), // at least 1 day
    }
  }, [data.items])

  // ---- Visible items ----
  const visibleItems = useMemo(() => {
    const items: GanttItem[] = []
    const phases = data.items.filter(i => i.type === 'phase')
    const children = data.items.filter(i => i.type !== 'phase')

    for (const phase of phases) {
      items.push(phase)
      if (!collapsedPhases.has(phase.id)) {
        items.push(...children.filter(c => c.parent_id === phase.id))
      }
    }

    const orphans = children.filter(
      c => !c.parent_id || !phases.some(p => p.id === c.parent_id)
    )
    items.push(...orphans)

    return items
  }, [data.items, collapsedPhases])

  // ---- Dimensions (with safe minimums) ----
  const totalHeight = Math.max(visibleItems.length * ROW_HEIGHT, ROW_HEIGHT)

  const timelineWidth = useMemo(() => {
    let w = 0
    switch (zoom) {
      case 'day': w = totalDays * colWidth; break
      case 'week': w = Math.ceil(totalDays / 7) * colWidth; break
      case 'month': w = Math.ceil(totalDays / 30) * colWidth; break
      case 'quarter': w = Math.ceil(totalDays / 90) * colWidth; break
    }
    return Math.max(w, 200)
  }, [totalDays, zoom, colWidth])

  const svgWidth = Math.max(timelineWidth + 20, 220)
  const svgHeight = Math.max(totalHeight + HEADER_HEIGHT + 10, HEADER_HEIGHT + 50)

  // ---- Position calculations (with NaN guard) ----
  const dateToX = useCallback((dateStr: string | null | undefined): number => {
    if (!dateStr) return 0
    const date = parseDate(dateStr)
    if (!date) return 0
    const days = diffDays(timelineStart, date)

    let x = 0
    switch (zoom) {
      case 'day': x = days * colWidth; break
      case 'week': x = (days / 7) * colWidth; break
      case 'month': x = (days / 30) * colWidth; break
      case 'quarter': x = (days / 90) * colWidth; break
    }
    return safeNum(x)
  }, [timelineStart, zoom, colWidth])

  const rowToY = (index: number): number => index * ROW_HEIGHT

  // ---- Handlers ----
  const handleTogglePhase = (phaseId: string) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  const handleItemClick = (item: GanttItem) => {
    setSelectedId(item.id)
    onItemClick?.(item)
  }

  const handleZoomIn = () => {
    const levels: ZoomLevel[] = ['quarter', 'month', 'week', 'day']
    const idx = levels.indexOf(zoom)
    if (idx < levels.length - 1) setZoom(levels[idx + 1])
  }

  const handleZoomOut = () => {
    const levels: ZoomLevel[] = ['quarter', 'month', 'week', 'day']
    const idx = levels.indexOf(zoom)
    if (idx > 0) setZoom(levels[idx - 1])
  }

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    setScrollLeft(target.scrollLeft)
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = target.scrollTop
    }
  }

  const handleLeftScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop
    }
  }

  // ---- Header marks ----
  const headerMarks = useMemo(() => {
    const marks: Array<{ x: number; label: string; isMain: boolean }> = []
    const cursor = new Date(timelineStart)

    switch (zoom) {
      case 'day':
        while (cursor <= timelineEnd) {
          const x = safeNum(diffDays(timelineStart, cursor) * colWidth)
          marks.push({ x, label: formatShortDate(cursor), isMain: cursor.getDay() === 1 })
          cursor.setDate(cursor.getDate() + 1)
        }
        break
      case 'week':
        while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() + 1)
        while (cursor <= timelineEnd) {
          const x = safeNum((diffDays(timelineStart, cursor) / 7) * colWidth)
          marks.push({ x, label: `W${getWeekNumber(cursor)} ${formatShortDate(cursor)}`, isMain: cursor.getDate() <= 7 })
          cursor.setDate(cursor.getDate() + 7)
        }
        break
      case 'month':
        cursor.setDate(1)
        while (cursor <= timelineEnd) {
          const x = safeNum((diffDays(timelineStart, cursor) / 30) * colWidth)
          marks.push({ x, label: formatMonthYear(cursor), isMain: cursor.getMonth() === 0 })
          cursor.setMonth(cursor.getMonth() + 1)
        }
        break
      case 'quarter':
        cursor.setDate(1)
        cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3)
        while (cursor <= timelineEnd) {
          const x = safeNum((diffDays(timelineStart, cursor) / 90) * colWidth)
          marks.push({ x, label: getQuarterLabel(cursor), isMain: true })
          cursor.setMonth(cursor.getMonth() + 3)
        }
        break
    }
    return marks
  }, [timelineStart, timelineEnd, zoom, colWidth])

  // ---- Today line ----
  const todayX = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return dateToX(formatDateStr(today))
  }, [dateToX])

  // ---- Item index map ----
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    visibleItems.forEach((item, idx) => map.set(item.id, idx))
    return map
  }, [visibleItems])

  // ---- Empty state ----
  if (data.items.length === 0) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 p-8 text-center ${className}`}>
        <ListTree className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-[14px] text-gray-500">Chưa có dữ liệu Gantt Chart</p>
        <p className="text-[12px] text-gray-400 mt-1">Thêm phases và tasks để hiển thị timeline</p>
      </div>
    )
  }

  // ---- RENDER ----
  return (
    <div className={`flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>

      {/* ===== TOOLBAR ===== */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <ListTree className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Gantt Chart</span>
          {data.critical_path.length > 0 && showCriticalPath && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
              Critical: {data.critical_path.length} items
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={zoom === 'quarter'}
            className="p-1.5 rounded-md hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <div className="flex bg-white rounded-md border border-gray-300 overflow-hidden">
            {(['day', 'week', 'month', 'quarter'] as ZoomLevel[]).map(level => (
              <button
                key={level}
                onClick={() => setZoom(level)}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  zoom === level ? 'bg-[#1B4D3E] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {level === 'day' ? 'Ngày' : level === 'week' ? 'Tuần' : level === 'month' ? 'Tháng' : 'Quý'}
              </button>
            ))}
          </div>

          <button
            onClick={handleZoomIn}
            disabled={zoom === 'day'}
            className="p-1.5 rounded-md hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ===== MAIN AREA ===== */}
      <div className="flex flex-1 overflow-hidden" style={{ height: Math.min(svgHeight, 600) }}>

        {/* ===== LEFT PANEL ===== */}
        {!isMobile && (
          <div
            ref={leftPanelRef}
            className="flex-shrink-0 border-r border-gray-200 overflow-y-auto overflow-x-hidden"
            style={{ width: leftWidth }}
            onScroll={handleLeftScroll}
          >
            <div
              className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 flex items-center px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
              style={{ height: HEADER_HEIGHT }}
            >
              <span className="flex-1">Tên</span>
              <span className="w-16 text-center">Bắt đầu</span>
              <span className="w-16 text-center">Kết thúc</span>
              <span className="w-10 text-center">%</span>
            </div>

            {visibleItems.map((item, idx) => {
              const isPhase = item.type === 'phase'
              const isMilestone = item.type === 'milestone'
              const isSelected = selectedId === item.id
              const isCollapsed = collapsedPhases.has(item.id)
              const hasChildren = isPhase && data.items.some(i => i.parent_id === item.id)
              const indent = item.parent_id ? 24 : 0

              return (
                <div
                  key={item.id}
                  className={`flex items-center px-3 border-b border-gray-100 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  } hover:bg-blue-50/50`}
                  style={{ height: ROW_HEIGHT, paddingLeft: 12 + indent }}
                  onClick={() => handleItemClick(item)}
                >
                  {isPhase && hasChildren ? (
                    <button
                      onClick={e => { e.stopPropagation(); handleTogglePhase(item.id) }}
                      className="p-0.5 mr-1 rounded hover:bg-gray-200"
                    >
                      {isCollapsed
                        ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                        : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      }
                    </button>
                  ) : (
                    <span className="w-5" />
                  )}

                  {isMilestone ? (
                    <Diamond className="w-3.5 h-3.5 text-amber-500 mr-1.5 flex-shrink-0" />
                  ) : isPhase ? (
                    <GripVertical className="w-3.5 h-3.5 text-emerald-600 mr-1.5 flex-shrink-0" />
                  ) : (
                    <span className="w-3.5 mr-1.5" />
                  )}

                  <span className={`flex-1 truncate text-sm ${
                    isPhase ? 'font-semibold text-gray-900' : 'text-gray-700'
                  } ${item.is_critical ? 'text-red-700' : ''}`}>
                    {item.name}
                  </span>

                  <span className="w-16 text-center text-xs text-gray-400 font-mono tabular-nums">
                    {item.start ? item.start.slice(5) : '—'}
                  </span>
                  <span className="w-16 text-center text-xs text-gray-400 font-mono tabular-nums">
                    {item.end ? item.end.slice(5) : '—'}
                  </span>

                  <span className={`w-10 text-center text-xs font-medium tabular-nums ${
                    item.progress >= 100 ? 'text-green-600' : item.progress > 0 ? 'text-blue-600' : 'text-gray-400'
                  }`}>
                    {item.progress}%
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* ===== TIMELINE SVG ===== */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-auto"
          onScroll={handleTimelineScroll}
        >
          <svg
            width={svgWidth}
            height={svgHeight}
            className="select-none"
          >
            {/* Header bg */}
            <rect x={0} y={0} width={svgWidth} height={HEADER_HEIGHT} fill={COLORS.headerBg} />

            {/* Header marks */}
            {headerMarks.map((mark, idx) => (
              <g key={idx}>
                <line
                  x1={mark.x} y1={HEADER_HEIGHT}
                  x2={mark.x} y2={svgHeight}
                  stroke={mark.isMain ? COLORS.gridLineDark : COLORS.gridLine}
                  strokeWidth={mark.isMain ? 1 : 0.5}
                />
                <text
                  x={mark.x + 4} y={HEADER_HEIGHT - 8}
                  fontSize={10}
                  fill={mark.isMain ? '#374151' : '#9CA3AF'}
                  fontFamily="monospace"
                >
                  {mark.label}
                </text>
              </g>
            ))}

            {/* Row backgrounds */}
            {visibleItems.map((item, idx) => (
              <rect
                key={`bg-${item.id}`}
                x={0} y={HEADER_HEIGHT + rowToY(idx)}
                width={svgWidth} height={ROW_HEIGHT}
                fill={selectedId === item.id ? COLORS.selectedBg : idx % 2 === 0 ? 'white' : '#FAFAFA'}
              />
            ))}

            {/* Row separator lines */}
            {visibleItems.map((_, idx) => (
              <line
                key={`line-${idx}`}
                x1={0} y1={HEADER_HEIGHT + rowToY(idx) + ROW_HEIGHT}
                x2={svgWidth} y2={HEADER_HEIGHT + rowToY(idx) + ROW_HEIGHT}
                stroke={COLORS.gridLine} strokeWidth={0.5}
              />
            ))}

            {/* Today line */}
            {todayX > 0 && isFinite(todayX) && (
              <g>
                <line
                  x1={todayX} y1={0} x2={todayX} y2={svgHeight}
                  stroke={COLORS.todayLine} strokeWidth={1.5} strokeDasharray="4 3"
                />
                <rect x={todayX - 18} y={2} width={36} height={16} rx={3} fill={COLORS.todayLine} />
                <text x={todayX} y={14} fontSize={9} fill="white" textAnchor="middle" fontWeight="bold">
                  HÔM NAY
                </text>
              </g>
            )}

            {/* Dependency arrows */}
            {data.dependencies.map(dep => {
              const sourceIdx = itemIndexMap.get(dep.source_id)
              const targetIdx = itemIndexMap.get(dep.target_id)
              if (sourceIdx === undefined || targetIdx === undefined) return null

              const sourceItem = visibleItems[sourceIdx]
              const targetItem = visibleItems[targetIdx]
              if (!sourceItem?.end || !targetItem?.start) return null

              const fromX = dateToX(sourceItem.end)
              const fromY = HEADER_HEIGHT + rowToY(sourceIdx) + ROW_HEIGHT / 2
              const toX = dateToX(targetItem.start)
              const toY = HEADER_HEIGHT + rowToY(targetIdx) + ROW_HEIGHT / 2

              const isCritical = showCriticalPath &&
                data.critical_path.includes(dep.source_id) &&
                data.critical_path.includes(dep.target_id)

              return (
                <DependencyArrow
                  key={dep.id}
                  fromX={fromX} fromY={fromY}
                  toX={toX} toY={toY}
                  isCritical={isCritical}
                />
              )
            })}

            {/* Gantt bars */}
            {visibleItems.map((item, idx) => {
              const y = HEADER_HEIGHT + rowToY(idx)
              const isCritical = showCriticalPath && (item.is_critical || false)

              // Skip items without dates
              if (!item.start) return null

              // Milestone → diamond
              if (item.type === 'milestone') {
                const cx = dateToX(item.start)
                if (!isFinite(cx)) return null
                const cy = y + ROW_HEIGHT / 2

                return (
                  <g key={item.id} className="cursor-pointer" onClick={() => handleItemClick(item)}>
                    <MilestoneDiamond
                      cx={cx} cy={cy} size={16}
                      color={isCritical ? COLORS.critical : COLORS.milestoneColor}
                      completed={item.progress >= 100}
                    />
                    {isMobile && (
                      <text x={cx + 12} y={cy + 4} fontSize={11} fill="#374151">{item.name}</text>
                    )}
                  </g>
                )
              }

              // Phase or Task → bar
              const barX = dateToX(item.start)
              const barEndX = item.end ? dateToX(item.end) : barX + MIN_BAR_WIDTH
              if (!isFinite(barX) || !isFinite(barEndX)) return null

              const barWidth = Math.max(barEndX - barX, MIN_BAR_WIDTH)
              const isPhase = item.type === 'phase'
              const barHeight = isPhase ? 20 : 14
              const barY = y + (ROW_HEIGHT - barHeight) / 2
              const barColor = isCritical
                ? COLORS.critical
                : item.color || (isPhase ? COLORS.phaseBar : COLORS.taskBar)

              const progressWidth = safeNum(Math.min(barWidth * (item.progress || 0) / 100, barWidth))

              return (
                <g key={item.id} className="cursor-pointer" onClick={() => handleItemClick(item)}>
                  {/* Critical path bg */}
                  {isCritical && (
                    <rect x={0} y={y} width={svgWidth} height={ROW_HEIGHT} fill={COLORS.criticalLight} opacity={0.3} />
                  )}

                  {/* Bar background */}
                  <rect
                    x={barX} y={barY} width={barWidth} height={barHeight}
                    fill={isPhase ? barColor : 'white'}
                    stroke={barColor} strokeWidth={isPhase ? 0 : 1.5}
                    rx={isPhase ? 2 : 4}
                    opacity={isPhase ? 0.25 : 1}
                  />

                  {/* Progress fill */}
                  {progressWidth > 0 && (
                    <rect
                      x={barX} y={barY} width={progressWidth} height={barHeight}
                      fill={barColor} rx={isPhase ? 2 : 4}
                      opacity={isPhase ? 0.5 : 0.85}
                    />
                  )}

                  {/* Phase bracket markers */}
                  {isPhase && (
                    <>
                      <rect x={barX} y={barY + barHeight - 4} width={6} height={4} fill={barColor} />
                      <rect x={barX + barWidth - 6} y={barY + barHeight - 4} width={6} height={4} fill={barColor} />
                    </>
                  )}

                  {/* Bar label */}
                  {(isMobile || barWidth > 60) && (
                    <text
                      x={barX + (isMobile ? barWidth + 6 : 6)}
                      y={barY + barHeight / 2 + 4}
                      fontSize={11} fill={isMobile ? '#374151' : 'white'}
                      fontWeight={isPhase ? '600' : '400'}
                      className="pointer-events-none"
                    >
                      {item.name.length > 25 ? item.name.slice(0, 25) + '…' : item.name}
                    </text>
                  )}

                  {/* Assignee badge */}
                  {item.assignee_name && barWidth > 100 && !isMobile && (
                    <text
                      x={barX + barWidth - 4} y={barY + barHeight / 2 + 3}
                      fontSize={9} fill="white" textAnchor="end" opacity={0.8}
                    >
                      {item.assignee_name}
                    </text>
                  )}

                  {/* Phase progress text */}
                  {isPhase && (item.progress || 0) > 0 && barWidth > 40 && (
                    <text
                      x={barX + barWidth / 2} y={barY + barHeight / 2 + 4}
                      fontSize={10} fill={barColor} textAnchor="middle" fontWeight="bold"
                    >
                      {item.progress}%
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 overflow-x-auto">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-2 rounded-sm" style={{ backgroundColor: COLORS.phaseBar, opacity: 0.4 }} />
          Phase
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-2 rounded" style={{ backgroundColor: COLORS.taskBar }} />
          Task
        </span>
        <span className="flex items-center gap-1.5">
          <Diamond className="w-3 h-3 text-amber-500" />
          Milestone
        </span>
        {showCriticalPath && (
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            Critical Path
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0 border-t-2 border-dashed" style={{ borderColor: COLORS.todayLine }} />
          Hôm nay
        </span>
      </div>
    </div>
  )
}

export default GanttChart