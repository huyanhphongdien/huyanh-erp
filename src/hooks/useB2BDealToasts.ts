// ============================================================================
// useB2BDealToasts — Global realtime toast khi b2b_deals đổi trạng thái
// File: src/hooks/useB2BDealToasts.ts
//
// Subscribe `public.b2b_deals` UPDATE events → hiển thị toast notification
// ngắn ở mọi trang trong ERP (không phụ thuộc user đang ở page nào).
//
// Yêu cầu migration: docs/migrations/b2b_deals_realtime.sql đã chạy.
//   - b2b_deals trong publication supabase_realtime
//   - REPLICA IDENTITY FULL
// ============================================================================

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { notification } from 'antd'
import { supabase } from '../lib/supabase'
import { DEAL_STATUS_LABELS } from '../types/b2b.constants'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface DealRow {
  id: string
  deal_number: string
  partner_id: string
  status: string
  actual_drc: number | null
  qc_status: string | null
  stock_in_count: number | null
}

/**
 * Bật global toast cho b2b_deals UPDATE events + b2b_drc_disputes INSERT events.
 * Gọi 1 lần ở AppLayout (hoặc root component) — idempotent.
 */
export function useB2BDealToasts(enabled: boolean = true) {
  const navigate = useNavigate()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (channelRef.current) return  // đã subscribe rồi

    const channel = supabase
      .channel(`b2b-global-${Date.now().toString(36)}`)
      // Base tables ở schema 'b2b' (public.b2b_* là view) — realtime phải listen schema gốc
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'b2b',
          table: 'deals',
        },
        (payload: any) => {
          const oldRow = payload.old as DealRow
          const newRow = payload.new as DealRow
          handleDealChange(oldRow, newRow, navigate)
        },
      )
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'b2b',
          table: 'drc_disputes',
        },
        (payload: any) => {
          const d = payload.new as { id: string; dispute_number: string; deal_id: string; actual_drc: number; expected_drc: number }
          notification.warning({
            key: `dispute-new-${d.id}`,
            message: `Khiếu nại DRC mới — ${d.dispute_number}`,
            description: `DRC thực ${d.actual_drc}% vs dự kiến ${d.expected_drc}%. Click để xử lý.`,
            placement: 'bottomRight',
            duration: 6,
            onClick: () => navigate(`/b2b/disputes`),
          })
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [enabled, navigate])
}

function handleDealChange(
  oldRow: DealRow | null,
  newRow: DealRow,
  navigate: ReturnType<typeof useNavigate>,
) {
  if (!newRow?.deal_number) return

  const goToDeal = () => navigate(`/b2b/deals/${newRow.id}`)
  const key = `deal-${newRow.id}`

  // 1. Status đổi
  if (oldRow && oldRow.status !== newRow.status) {
    const statusLabel = DEAL_STATUS_LABELS[newRow.status as keyof typeof DEAL_STATUS_LABELS] || newRow.status

    if (newRow.status === 'accepted') {
      notification.success({
        key,
        message: `Deal ${newRow.deal_number} đã được duyệt`,
        description: 'Click để xem chi tiết',
        placement: 'bottomRight',
        duration: 4,
        onClick: goToDeal,
      })
    } else if (newRow.status === 'settled') {
      notification.success({
        key,
        message: `Deal ${newRow.deal_number} đã quyết toán`,
        description: 'Click để xem phiếu',
        placement: 'bottomRight',
        duration: 4,
        onClick: goToDeal,
      })
    } else if (newRow.status === 'cancelled') {
      notification.warning({
        key,
        message: `Deal ${newRow.deal_number} đã hủy`,
        placement: 'bottomRight',
        duration: 4,
        onClick: goToDeal,
      })
    } else {
      notification.info({
        key,
        message: `Deal ${newRow.deal_number}: ${statusLabel}`,
        placement: 'bottomRight',
        duration: 3,
        onClick: goToDeal,
      })
    }
    return
  }

  // 2. QC vừa xong (actual_drc vừa có hoặc qc_status đổi)
  if (
    oldRow &&
    (oldRow.actual_drc == null && newRow.actual_drc != null) ||
    (oldRow && oldRow.qc_status !== newRow.qc_status && newRow.qc_status && newRow.qc_status !== 'pending')
  ) {
    if (newRow.qc_status === 'failed') {
      notification.error({
        key: `qc-${newRow.id}`,
        message: `QC FAIL — Deal ${newRow.deal_number}`,
        description: `DRC thực tế = ${newRow.actual_drc}%`,
        placement: 'bottomRight',
        duration: 6,
        onClick: goToDeal,
      })
    } else if (newRow.qc_status === 'warning') {
      notification.warning({
        key: `qc-${newRow.id}`,
        message: `QC cảnh báo — Deal ${newRow.deal_number}`,
        description: `DRC thực tế = ${newRow.actual_drc}%`,
        placement: 'bottomRight',
        duration: 5,
        onClick: goToDeal,
      })
    } else if (newRow.qc_status === 'passed') {
      notification.success({
        key: `qc-${newRow.id}`,
        message: `QC đạt — Deal ${newRow.deal_number}`,
        description: `DRC thực tế = ${newRow.actual_drc}%`,
        placement: 'bottomRight',
        duration: 4,
        onClick: goToDeal,
      })
    }
    return
  }

  // 3. Stock-in đầu tiên
  if (oldRow && (oldRow.stock_in_count || 0) === 0 && (newRow.stock_in_count || 0) > 0) {
    notification.info({
      key: `stockin-${newRow.id}`,
      message: `Đã nhập kho — Deal ${newRow.deal_number}`,
      placement: 'bottomRight',
      duration: 3,
      onClick: goToDeal,
    })
  }
}
