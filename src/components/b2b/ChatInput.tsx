// ============================================================================
// FILE: src/pages/b2b/components/ChatInput.tsx
// MODULE: B2B Platform - Huy Anh Rubber ERP
// DESCRIPTION: Component input gửi tin nhắn với đính kèm file
// ============================================================================

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Send, Paperclip, Image, X, Loader2 } from 'lucide-react';
import { chatAttachmentService } from '../../services/b2b/chatAttachmentService';

// ============================================================================
// TYPES
// ============================================================================

interface ChatInputProps {
  roomId: string;
  onSend: (content: string, type?: 'text' | 'image' | 'file', metadata?: Record<string, unknown>) => Promise<void>;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

interface AttachedFile {
  file: File;
  preview?: string;
  type: 'image' | 'file';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function ChatInput({
  roomId,
  onSend,
  isSending = false,
  disabled = false,
  placeholder = 'Nhập tin nhắn...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    setError(null);

    // Auto resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError('File quá lớn. Tối đa 10MB.');
      return;
    }

    // Validate type
    const allowedTypes = type === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_FILE_TYPES;
    if (!allowedTypes.includes(file.type)) {
      setError(type === 'image' ? 'Chỉ hỗ trợ ảnh JPG, PNG, GIF, WebP' : 'Định dạng file không được hỗ trợ');
      return;
    }

    // Create preview for images
    let preview: string | undefined;
    if (type === 'image') {
      preview = URL.createObjectURL(file);
    }

    setAttachedFile({ file, preview, type });
    setError(null);

    // Reset input
    e.target.value = '';
  }, []);

  // Remove attached file
  const removeAttachment = useCallback(() => {
    if (attachedFile?.preview) {
      URL.revokeObjectURL(attachedFile.preview);
    }
    setAttachedFile(null);
  }, [attachedFile]);

  // Handle send
  const handleSend = useCallback(async () => {
    const trimmedMessage = message.trim();

    // Must have message or attachment
    if (!trimmedMessage && !attachedFile) return;

    try {
      setError(null);

      // If has attachment, upload first
      if (attachedFile) {
        setIsUploading(true);
        const attachment = await chatAttachmentService.uploadFile(roomId, attachedFile.file);
        const url = attachment.url;

        const metadata = {
          file_url: url,
          file_name: attachedFile.file.name,
          file_size: attachedFile.file.size,
          file_type: attachedFile.file.type,
          ...(attachedFile.type === 'image' && { image_url: url }),
        };

        await onSend(trimmedMessage || attachedFile.file.name, attachedFile.type, metadata);
        removeAttachment();
      } else {
        await onSend(trimmedMessage, 'text');
      }

      // Reset
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gửi tin nhắn');
    } finally {
      setIsUploading(false);
    }
  }, [message, attachedFile, roomId, onSend, removeAttachment]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSending && !isUploading && !disabled) {
        handleSend();
      }
    }
  }, [handleSend, isSending, isUploading, disabled]);

  const isDisabled = disabled || isSending || isUploading;

  return (
    <div className="border-t border-gray-200 bg-white p-3 safe-area-bottom">
      {/* Error message */}
      {error && (
        <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Attachment preview */}
      {attachedFile && (
        <div className="mb-2 p-2 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-3">
            {attachedFile.type === 'image' && attachedFile.preview ? (
              <img
                src={attachedFile.preview}
                alt="Preview"
                className="w-16 h-16 object-cover rounded-lg"
              />
            ) : (
              <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                <Paperclip className="w-6 h-6 text-gray-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate text-sm">
                {attachedFile.file.name}
              </p>
              <p className="text-xs text-gray-500">
                {(attachedFile.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={removeAttachment}
              className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              disabled={isUploading}
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2">
        {/* Attachment buttons */}
        <div className="flex gap-1">
          {/* Image button */}
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={isDisabled || !!attachedFile}
            className="p-2.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Đính kèm hình ảnh"
          >
            <Image className="w-5 h-5" />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            onChange={(e) => handleFileSelect(e, 'image')}
            className="hidden"
          />

          {/* File button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled || !!attachedFile}
            className="p-2.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Đính kèm file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_FILE_TYPES.join(',')}
            onChange={(e) => handleFileSelect(e, 'file')}
            className="hidden"
          />
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            rows={1}
            className="w-full px-4 py-2.5 bg-gray-100 border-0 rounded-2xl text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: '120px' }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isDisabled || (!message.trim() && !attachedFile)}
          className="p-3 bg-primary text-white rounded-full hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          title="Gửi tin nhắn"
        >
          {isSending || isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-400 mt-2 text-center">
        Nhấn Enter để gửi, Shift+Enter để xuống dòng
      </p>
    </div>
  );
}