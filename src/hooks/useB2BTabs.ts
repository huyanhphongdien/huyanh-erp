// ============================================================================
// useB2BTabs — Helper hooks để mở Deal/Chat thành tab từ mọi entry point
// File: src/hooks/useB2BTabs.ts
//
// Dùng các hook này thay cho navigate('/b2b/deals/:id') / navigate('/b2b/chat/:id')
// để giữ consistency giữa list pages + detail pages + dashboard + partners.
// ============================================================================

import { useCallback } from 'react'
import { useOpenTab } from './useOpenTab'

export function useOpenDealTab() {
  const openTab = useOpenTab()
  return useCallback(
    (deal: { id: string; deal_number?: string | null }) => {
      openTab({
        key: `b2b-deal-${deal.id}`,
        title: `Deal ${deal.deal_number || deal.id.slice(0, 8)}`,
        componentId: 'b2b-deal-detail',
        props: { id: deal.id },
        path: `/b2b/deals/${deal.id}`,
      })
    },
    [openTab],
  )
}

export function useOpenChatTab() {
  const openTab = useOpenTab()
  return useCallback(
    (room: { id: string; partner?: { name?: string | null } | null; partner_name?: string | null; room_name?: string | null }) => {
      const name = room.partner?.name || room.partner_name || room.room_name || 'Chat'
      openTab({
        key: `b2b-chat-${room.id}`,
        title: name,
        componentId: 'b2b-chat-room',
        props: { roomIdProp: room.id },
        path: `/b2b/chat/${room.id}`,
        parentKey: 'b2b-chat-list', // hiện ở sub-tab row dưới tab 'Chat Đại lý'
      })
    },
    [openTab],
  )
}

export function useOpenDealCreateTab() {
  const openTab = useOpenTab()
  return useCallback(
    (queryString?: string) => {
      openTab({
        key: 'b2b-deal-create',
        title: 'Tạo Deal mới',
        componentId: 'b2b-deal-create',
        props: {},
        path: queryString ? `/b2b/deals/new?${queryString}` : '/b2b/deals/new',
      })
    },
    [openTab],
  )
}
