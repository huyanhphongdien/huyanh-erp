// ============================================================================
// FILE: src/hooks/useB2BChat.ts
// MODULE: B2B Platform - Huy Anh Rubber ERP
// DESCRIPTION: Custom hook quản lý state và realtime cho Chat
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { chatRoomService, type ChatRoom } from '../services/b2b/chatRoomService';
import { chatMessageService, type ChatMessage, type SendMessageData } from '../services/b2b/chatMessageService';
import { useAuthStore } from '../stores/authStore';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ============================================================================
// HOOK: useB2BChatRooms - Quản lý danh sách phòng chat
// ============================================================================

export function useB2BChatRooms(filters?: { room_type?: string; search?: string; filter?: string }) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await chatRoomService.getRooms({
        room_type: (filters?.room_type as any) || undefined,
        search: filters?.search,
        filter: (filters?.filter as any) || undefined,
      });
      setRooms(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải danh sách chat');
      console.error('Error fetching rooms:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Subscribe realtime
  useEffect(() => {
    fetchRooms();

    // Subscribe to room updates
    channelRef.current = chatRoomService.subscribeToRooms((payload: any) => {
      const updatedRoom = payload.new as ChatRoom;
      setRooms((prev) =>
        prev.map((room) =>
          room.id === updatedRoom.id
            ? { ...room, ...updatedRoom }
            : room
        ).sort((a, b) => {
          const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return dateB - dateA;
        })
      );
    }) as unknown as RealtimeChannel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchRooms]);

  return {
    rooms,
    isLoading,
    error,
    refetch: fetchRooms,
  };
}

// ============================================================================
// HOOK: useB2BChatRoom - Quản lý 1 phòng chat với realtime messages
// ============================================================================

export function useB2BChatRoom(roomId: string | null) {
  const { user } = useAuthStore();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch room info
  const fetchRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      setIsLoadingRoom(true);
      const data = await chatRoomService.getById(roomId);
      setRoom(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải thông tin phòng');
    } finally {
      setIsLoadingRoom(false);
    }
  }, [roomId]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!roomId) return;

    try {
      setIsLoadingMessages(true);
      const response = await chatMessageService.getMessages({ room_id: roomId });
      setMessages(response.data);

      // Mark as read
      await chatMessageService.markAsRead(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải tin nhắn');
    } finally {
      setIsLoadingMessages(false);
    }
  }, [roomId]);

  // Send message
  const sendMessage = useCallback(
    async (content: string, messageType?: SendMessageData['message_type'], metadata?: SendMessageData['metadata']) => {
      if (!roomId || !user?.employee_id || !content.trim()) return;

      try {
        setIsSending(true);
        setError(null);

        await chatMessageService.sendMessage({
          room_id: roomId,
          sender_id: user.employee_id,
          content: content.trim(),
          message_type: messageType,
          metadata,
        });

        // Message sẽ được thêm qua realtime subscription
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi gửi tin nhắn');
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [roomId, user]
  );

  // Subscribe realtime messages
  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setMessages([]);
      return;
    }

    fetchRoom();
    fetchMessages();

    // Subscribe to new messages
    channelRef.current = chatMessageService.subscribeToRoom(roomId, {
      onInsert: (newMessage: ChatMessage) => {
        setMessages((prev) => {
          // Tránh duplicate
          if (prev.some((m) => m.id === newMessage.id)) {
            return prev;
          }
          return [...prev, newMessage];
        });

        // Mark as read nếu là tin từ partner
        if (newMessage.sender_type === 'partner') {
          chatMessageService.markAsRead(roomId);
        }
      },
    }) as unknown as RealtimeChannel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [roomId, fetchRoom, fetchMessages]);

  return {
    room,
    messages,
    isLoadingRoom,
    isLoadingMessages,
    isSending,
    error,
    sendMessage,
    refetchMessages: fetchMessages,
  };
}

// ============================================================================
// HOOK: useB2BUnreadCount - Đếm số tin chưa đọc
// ============================================================================

export function useB2BUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const count = await chatRoomService.getTotalUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  }, []);

  useEffect(() => {
    fetchCount();

    // Refresh every 30 seconds
    const interval = setInterval(fetchCount, 30000);

    return () => clearInterval(interval);
  }, [fetchCount]);

  return { unreadCount, refetch: fetchCount };
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  useB2BChatRooms,
  useB2BChatRoom,
  useB2BUnreadCount,
};
