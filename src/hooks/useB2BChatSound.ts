// ============================================================================
// useB2BChatSound — Âm thanh chat B2B phía ERP, CHỈ kêu cho đúng phòng của NV
// File: src/hooks/useB2BChatSound.ts
// ============================================================================
// Tương tự portal: khi đại lý nhắn tin (sender_type='partner') vào phòng do
// nhân viên đang đăng nhập phụ trách (assigned_user_id = user.id) thì phát beep.
// Bỏ qua tin do nhà máy gửi (cả của mình lẫn NV khác) và tin ở phòng NV khác.
// ============================================================================

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Beep 2 nốt (Web Audio) — copy logic portal để đồng nhất. */
function playChatBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.connect(gain1); gain1.connect(ctx.destination)
    osc1.frequency.value = 880; osc1.type = 'sine'
    gain1.gain.setValueAtTime(0.3, ctx.currentTime)
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.3)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2); gain2.connect(ctx.destination)
    osc2.frequency.value = 1100; osc2.type = 'sine'
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45)
    osc2.start(ctx.currentTime + 0.15); osc2.stop(ctx.currentTime + 0.45)
    setTimeout(() => ctx.close(), 1000)
  } catch { /* AudioContext không khả dụng */ }
}

/**
 * Bật âm thanh chat B2B cho nhân viên đang đăng nhập.
 * @param userId auth user id (= assigned_user_id của phòng chat — sprint1_08)
 */
export function useB2BChatSound(userId: string | undefined) {
  const [roomIds, setRoomIds] = useState<string[]>([])

  // Nạp danh sách phòng NV phụ trách
  useEffect(() => {
    if (!userId) { setRoomIds([]); return }
    let alive = true
    supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('assigned_user_id', userId)
      .eq('is_active', true)
      .then(({ data }) => { if (alive) setRoomIds((data || []).map((r) => r.id as string)) })
    return () => { alive = false }
  }, [userId])

  // Subscribe chat_messages — chỉ beep cho tin của đại lý trong phòng của mình
  useEffect(() => {
    if (!userId || roomIds.length === 0) return
    const roomSet = new Set(roomIds)
    const channel = supabase
      .channel(`erp-chat-sound-${userId}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'b2b', table: 'chat_messages' },
        (payload: any) => {
          const msg = payload.new as Record<string, any>
          // Chỉ kêu khi ĐẠI LÝ nhắn (bỏ qua tin nhà máy: của mình lẫn NV khác)
          if (msg?.sender_type !== 'partner') return
          // Đúng phòng của NV này
          if (!roomSet.has(msg?.room_id as string)) return
          playChatBeep()
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, roomIds])
}
