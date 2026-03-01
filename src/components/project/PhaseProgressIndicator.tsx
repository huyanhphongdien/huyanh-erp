// ============================================================================
// PHASE PROGRESS INDICATOR — Badge "(Auto · X/Y)" cho Phase accordion
// File: src/components/project/PhaseProgressIndicator.tsx
// Huy Anh Rubber ERP — Project Management Module
// ============================================================================

import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface PhaseProgressIndicatorProps {
  phaseId: string
  progressPct: number
  progressMode?: 'auto' | 'manual'
}

interface PhaseTaskStats {
  total: number
  completed: number
}

/**
 * Hiển thị progress % + label (Auto · X/Y) hoặc (Manual)
 * Dùng trong Phase accordion header
 */
const PhaseProgressIndicator: React.FC<PhaseProgressIndicatorProps> = ({
  phaseId,
  progressPct,
  progressMode = 'auto',
}) => {
  const [stats, setStats] = useState<PhaseTaskStats | null>(null)

  useEffect(() => {
    if (progressMode !== 'auto') return

    // Fetch task count cho phase này
    const fetchStats = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('phase_id', phaseId)
        .neq('status', 'cancelled')

      if (!error && data) {
        setStats({
          total: data.length,
          completed: data.filter(t => t.status === 'completed').length,
        })
      }
    }

    fetchStats()
  }, [phaseId, progressMode, progressPct])

  return (
    <span
      className="text-[11px] font-semibold text-gray-500"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {progressPct}%
      {progressMode === 'auto' && stats && stats.total > 0 && (
        <span className="ml-1 text-[10px] font-normal text-gray-400">
          (Auto · {stats.completed}/{stats.total})
        </span>
      )}
      {progressMode === 'manual' && (
        <span className="ml-1 text-[10px] font-normal text-amber-500">
          (Nhập tay)
        </span>
      )}
    </span>
  )
}

export default PhaseProgressIndicator