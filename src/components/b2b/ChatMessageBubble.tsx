// ============================================================================
// FILE: src/pages/b2b/components/ChatMessageBubble.tsx
// MODULE: B2B Platform - Huy Anh Rubber ERP
// DESCRIPTION: Component hiển thị 1 tin nhắn trong phòng chat
// ============================================================================

import { memo } from 'react';
import { FileText, Image, Package, Check, CheckCheck } from 'lucide-react';
import type { ChatMessage } from '../../types/b2b.types';

// ============================================================================
// TYPES
// ============================================================================

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Hôm nay';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }

  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Tin nhắn hệ thống (system message)
 */
function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-center my-3">
      <div className="bg-gray-100 text-gray-600 text-sm px-4 py-2 rounded-full max-w-[80%] text-center">
        {message.content}
      </div>
    </div>
  );
}

/**
 * Tin nhắn booking (phiếu chốt mủ)
 */
function BookingMessage({ message }: { message: ChatMessage }) {
  const metadata = message.metadata;

  return (
    <div className="flex justify-center my-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-[85%]">
        <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
          <Package className="w-5 h-5" />
          <span>Phiếu chốt mủ</span>
          {metadata?.booking_code && (
            <span className="text-amber-600 font-mono text-sm">
              #{metadata.booking_code}
            </span>
          )}
        </div>
        <p className="text-gray-700 text-sm whitespace-pre-line">{message.content}</p>
        <p className="text-gray-400 text-xs mt-2">{formatTime(message.sent_at)}</p>
      </div>
    </div>
  );
}

/**
 * Tin nhắn hình ảnh
 */
function ImageMessage({
  message,
  isOwnMessage,
}: {
  message: ChatMessage;
  isOwnMessage: boolean;
}) {
  const imageUrl = message.metadata?.image_url || message.metadata?.file_url;

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl overflow-hidden ${
          isOwnMessage ? 'bg-primary' : 'bg-white border border-gray-200'
        }`}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Hình ảnh"
            className="max-w-full h-auto max-h-64 object-cover"
            loading="lazy"
          />
        )}
        {message.content && (
          <p
            className={`px-4 py-2 text-[15px] ${
              isOwnMessage ? 'text-white' : 'text-gray-800'
            }`}
          >
            {message.content}
          </p>
        )}
        <div
          className={`px-4 pb-2 flex items-center justify-end gap-1 ${
            isOwnMessage ? 'text-white/70' : 'text-gray-400'
          }`}
        >
          <span className="text-xs">{formatTime(message.sent_at)}</span>
          {isOwnMessage && (
            message.read_at ? (
              <CheckCheck className="w-4 h-4" />
            ) : (
              <Check className="w-4 h-4" />
            )
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Tin nhắn file
 */
function FileMessage({
  message,
  isOwnMessage,
}: {
  message: ChatMessage;
  isOwnMessage: boolean;
}) {
  const metadata = message.metadata;
  const fileName = metadata?.file_name || 'Tệp đính kèm';
  const fileSize = metadata?.file_size
    ? `${(metadata.file_size / 1024).toFixed(1)} KB`
    : '';

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
          isOwnMessage
            ? 'bg-primary text-white'
            : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        <a
          href={metadata?.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isOwnMessage ? 'bg-white/20' : 'bg-gray-100'
            }`}
          >
            <FileText
              className={`w-5 h-5 ${isOwnMessage ? 'text-white' : 'text-gray-500'}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-[15px]">{fileName}</p>
            {fileSize && (
              <p
                className={`text-xs ${
                  isOwnMessage ? 'text-white/70' : 'text-gray-400'
                }`}
              >
                {fileSize}
              </p>
            )}
          </div>
        </a>
        <div
          className={`flex items-center justify-end gap-1 mt-2 ${
            isOwnMessage ? 'text-white/70' : 'text-gray-400'
          }`}
        >
          <span className="text-xs">{formatTime(message.sent_at)}</span>
          {isOwnMessage && (
            message.read_at ? (
              <CheckCheck className="w-4 h-4" />
            ) : (
              <Check className="w-4 h-4" />
            )
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Tin nhắn text thông thường
 */
function TextMessage({
  message,
  isOwnMessage,
}: {
  message: ChatMessage;
  isOwnMessage: boolean;
}) {
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className="flex flex-col max-w-[75%]">
        {/* Sender name (chỉ hiện cho tin nhắn đối tác) */}
        {!isOwnMessage && (
          <span className="text-xs text-gray-500 mb-1 ml-3">
            {message.sender_name}
          </span>
        )}

        {/* Bubble */}
        <div
          className={`px-4 py-2.5 rounded-2xl ${
            isOwnMessage
              ? 'bg-primary text-white rounded-br-md'
              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
          }`}
        >
          <p className="text-[15px] whitespace-pre-wrap break-words">
            {message.content}
          </p>
          <div
            className={`flex items-center justify-end gap-1 mt-1 ${
              isOwnMessage ? 'text-white/70' : 'text-gray-400'
            }`}
          >
            <span className="text-xs">{formatTime(message.sent_at)}</span>
            {isOwnMessage && (
              message.read_at ? (
                <CheckCheck className="w-4 h-4" />
              ) : (
                <Check className="w-4 h-4" />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function ChatMessageBubble({ message, isOwnMessage }: ChatMessageBubbleProps) {
  // System message
  if (message.sender_type === 'system' || message.message_type === 'system') {
    return <SystemMessage message={message} />;
  }

  // Booking message
  if (message.message_type === 'booking') {
    return <BookingMessage message={message} />;
  }

  // Image message
  if (message.message_type === 'image') {
    return <ImageMessage message={message} isOwnMessage={isOwnMessage} />;
  }

  // File message
  if (message.message_type === 'file') {
    return <FileMessage message={message} isOwnMessage={isOwnMessage} />;
  }

  // Text message (default)
  return <TextMessage message={message} isOwnMessage={isOwnMessage} />;
}

// ============================================================================
// DATE SEPARATOR COMPONENT
// ============================================================================

export function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center my-4">
      <div className="flex-1 border-t border-gray-200" />
      <span className="px-4 text-xs text-gray-400 font-medium">
        {formatDate(date)}
      </span>
      <div className="flex-1 border-t border-gray-200" />
    </div>
  );
}

// ============================================================================
// EXPORT
// ============================================================================

export default memo(ChatMessageBubble);