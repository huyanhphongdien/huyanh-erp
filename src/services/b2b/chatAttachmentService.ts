// ============================================================================
// B2B CHAT ATTACHMENT SERVICE — Upload file, image, audio cho chat
// File: src/services/b2b/chatAttachmentService.ts
// Phase: E1.2.4
// ============================================================================

import { supabase } from '../../lib/supabase'
import { ChatAttachment } from './chatMessageService'

// ============================================
// CONSTANTS
// ============================================

const BUCKET_NAME = 'chat-attachments'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_AUDIO_TYPES,
  ...ALLOWED_FILE_TYPES,
]

// File type labels for UI
export const FILE_TYPE_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
  'audio/webm': 'WebM Audio',
  'audio/ogg': 'OGG Audio',
  'audio/mp4': 'M4A Audio',
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/aac': 'AAC',
  'application/pdf': 'PDF',
  'application/msword': 'Word (DOC)',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (DOCX)',
  'application/vnd.ms-excel': 'Excel (XLS)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (XLSX)',
  'text/plain': 'Text',
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate unique file path for storage
 * Format: rooms/{roomId}/{timestamp}-{random}-{filename}
 */
const generateFilePath = (roomId: string, fileName: string): string => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `rooms/${roomId}/${timestamp}-${random}-${sanitizedName}`
}

/**
 * Get file extension from MIME type
 */
const getExtensionFromMime = (mimeType: string): string => {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/aac': 'aac',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
  }
  return mimeToExt[mimeType] || 'bin'
}

/**
 * Get image dimensions
 */
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Get audio duration
 */
const getAudioDuration = (file: File | Blob): Promise<number> => {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.onloadedmetadata = () => {
      resolve(Math.ceil(audio.duration))
    }
    audio.onerror = reject
    audio.src = URL.createObjectURL(file)
  })
}

/**
 * Validate file before upload
 */
const validateFile = (file: File | Blob, allowedTypes: string[]): void => {
  const fileType = file instanceof File ? file.type : (file as Blob).type

  if (!allowedTypes.includes(fileType)) {
    throw new Error(`Loại file không được hỗ trợ: ${fileType}`)
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File quá lớn. Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  }
}

// ============================================
// SERVICE
// ============================================

export const chatAttachmentService = {
  /**
   * Upload single file (generic)
   */
  async uploadFile(
    roomId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<ChatAttachment> {
    validateFile(file, ALLOWED_MIME_TYPES)

    const filePath = generateFilePath(roomId, file.name)

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) throw error

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    const attachment: ChatAttachment = {
      url: urlData.publicUrl,
      path: filePath,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    }

    // Get image dimensions if it's an image
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      try {
        const dimensions = await getImageDimensions(file)
        attachment.width = dimensions.width
        attachment.height = dimensions.height
      } catch (e) {
        console.warn('Could not get image dimensions:', e)
      }
    }

    // Get audio duration if it's an audio file
    if (ALLOWED_AUDIO_TYPES.includes(file.type)) {
      try {
        const duration = await getAudioDuration(file)
        attachment.duration = duration
      } catch (e) {
        console.warn('Could not get audio duration:', e)
      }
    }

    onProgress?.(100)
    return attachment
  },

  /**
   * Upload multiple files
   */
  async uploadFiles(
    roomId: string,
    files: File[],
    onProgress?: (fileIndex: number, percent: number) => void
  ): Promise<ChatAttachment[]> {
    const results: ChatAttachment[] = []

    for (let i = 0; i < files.length; i++) {
      const attachment = await this.uploadFile(roomId, files[i], (percent) => {
        onProgress?.(i, percent)
      })
      results.push(attachment)
    }

    return results
  },

  /**
   * Upload image (with validation)
   */
  async uploadImage(
    roomId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<ChatAttachment> {
    validateFile(file, ALLOWED_IMAGE_TYPES)
    return this.uploadFile(roomId, file, onProgress)
  },

  /**
   * Upload images (multiple)
   */
  async uploadImages(
    roomId: string,
    files: File[],
    onProgress?: (fileIndex: number, percent: number) => void
  ): Promise<ChatAttachment[]> {
    // Validate all files first
    files.forEach((file) => validateFile(file, ALLOWED_IMAGE_TYPES))
    return this.uploadFiles(roomId, files, onProgress)
  },

  /**
   * Upload audio (voice message)
   */
  async uploadAudio(
    roomId: string,
    audioBlob: Blob,
    fileName?: string
  ): Promise<ChatAttachment> {
    validateFile(audioBlob, ALLOWED_AUDIO_TYPES)

    const ext = getExtensionFromMime(audioBlob.type)
    const name = fileName || `voice-${Date.now()}.${ext}`
    const filePath = generateFilePath(roomId, name)

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, audioBlob, {
        cacheControl: '3600',
        upsert: false,
        contentType: audioBlob.type,
      })

    if (error) throw error

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    // Get duration
    let duration = 0
    try {
      duration = await getAudioDuration(audioBlob)
    } catch (e) {
      console.warn('Could not get audio duration:', e)
    }

    return {
      url: urlData.publicUrl,
      path: filePath,
      fileName: name,
      fileSize: audioBlob.size,
      fileType: audioBlob.type,
      duration,
    }
  },

  /**
   * Upload document (PDF, Word, Excel)
   */
  async uploadDocument(
    roomId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<ChatAttachment> {
    validateFile(file, ALLOWED_FILE_TYPES)
    return this.uploadFile(roomId, file, onProgress)
  },

  /**
   * Delete file from storage
   */
  async deleteFile(filePath: string): Promise<void> {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath])

    if (error) throw error
  },

  /**
   * Delete multiple files
   */
  async deleteFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(filePaths)

    if (error) throw error
  },

  /**
   * Get file preview URL (for images)
   */
  getPreviewUrl(filePath: string, width = 200, height = 200): string {
    const { data } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath, {
        transform: {
          width,
          height,
          resize: 'contain',
        },
      })

    return data.publicUrl
  },

  /**
   * Check if file type is image
   */
  isImage(fileType: string): boolean {
    return ALLOWED_IMAGE_TYPES.includes(fileType)
  },

  /**
   * Check if file type is audio
   */
  isAudio(fileType: string): boolean {
    return ALLOWED_AUDIO_TYPES.includes(fileType)
  },

  /**
   * Check if file type is document
   */
  isDocument(fileType: string): boolean {
    return ALLOWED_FILE_TYPES.includes(fileType)
  },

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  },

  /**
   * Format duration for display (audio)
   */
  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  },
}

export default chatAttachmentService