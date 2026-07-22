// ============================================================================
// useMachineIssueAlerts — Cảnh báo MÁY HỎNG toàn cục trên ERP
// File: src/hooks/useMachineIssueAlerts.ts
//
// Trước đây chỉ màn /m/yeu-cau mới kêu → ngồi Dashboard là không biết máy hỏng.
// Hook này subscribe INSERT trên public.machine_issues và bắn chuông + rung +
// toast ở MỌI trang ERP. Máy ĐANG DỪNG (đỏ) → toast giữ lại tới khi bấm.
//
// App Android đã có FCM push riêng → bỏ qua khi chạy native để khỏi báo đúp.
// ============================================================================

import { useEffect, useRef } from 'react'
import { notification } from 'antd'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface IssueRow {
  id: string
  equipment_code: string | null
  severity: string | null
  symptom: string | null
  reporter_name: string | null
  status: string | null
}

// Chuông ngắn bằng WebAudio (không cần file âm thanh)
function chime(urgent: boolean) {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    const ac = new AC()
    const beep = (at: number, freq: number) => {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.connect(g); g.connect(ac.destination)
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ac.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + 0.45)
      o.start(ac.currentTime + at)
      o.stop(ac.currentTime + at + 0.5)
    }
    // Đỏ: 2 tiếng gấp. Vàng: 1 tiếng.
    beep(0, urgent ? 880 : 660)
    if (urgent) beep(0.28, 990)
  } catch { /* im lặng */ }
}

/** Gọi 1 lần ở MainLayout — idempotent. */
export function useMachineIssueAlerts(enabled: boolean = true) {
  const navigate = useNavigate()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (Capacitor.isNativePlatform()) return   // app native đã có FCM push
    if (channelRef.current) return              // đã subscribe

    const channel = supabase
      .channel(`machine-issue-global-${Date.now().toString(36)}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'machine_issues' },
        (payload: any) => {
          const r = payload.new as IssueRow
          if (!r?.id) return
          const urgent = r.severity === 'do'

          chime(urgent)
          if (navigator.vibrate) navigator.vibrate(urgent ? [200, 100, 200] : [150])

          const open = () => navigate('/m/yeu-cau')
          const desc = `${r.equipment_code || 'Máy'} — ${r.symptom || 'có sự cố'}`
            + (r.reporter_name ? ` · báo bởi ${r.reporter_name}` : ' · người báo ẩn danh')
            + '. Bấm để mở hàng chờ nhận việc.'

          const fn = urgent ? notification.error : notification.warning
          fn({
            key: `machine-issue-${r.id}`,
            message: urgent ? '🔴 MÁY ĐANG DỪNG' : '🟡 Máy báo bất thường',
            description: desc,
            placement: 'topRight',
            duration: urgent ? 0 : 10,   // đỏ: giữ tới khi bấm/đóng
            onClick: open,
            style: { cursor: 'pointer', borderLeft: `5px solid ${urgent ? '#C1291F' : '#B7791F'}` },
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
