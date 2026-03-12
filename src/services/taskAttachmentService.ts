// ============================================================================
// TASK ATTACHMENT SERVICE
// File: src/services/taskAttachmentService.ts
// Huy Anh ERP System - Phase 4.5: File Attachments
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  is_deleted: boolean;
  // Relations
  uploader?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  } | null;
}

export interface UploadAttachmentInput {
  task_id: string;
  file: File;
  description?: string;
  uploaded_by: string;
}

export interface AttachmentStats {
  count: number;
  totalSize: number;
  maxCount: number;
  maxTotalSize: number;
  canUpload: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const ATTACHMENT_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,      // 10MB per file
  MAX_FILES_PER_TASK: 10,               // 10 files per task
  MAX_TOTAL_SIZE_PER_TASK: 50 * 1024 * 1024, // 50MB total per task
  BUCKET_NAME: 'task-attachments',
  
  ALLOWED_TYPES: {
    // Documents
    'application/pdf': { label: 'PDF', icon: '📄' },
    'application/msword': { label: 'Word', icon: '📝' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'Word', icon: '📝' },
    'application/vnd.ms-excel': { label: 'Excel', icon: '📊' },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { label: 'Excel', icon: '📊' },
    'application/vnd.ms-powerpoint': { label: 'PowerPoint', icon: '📽️' },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { label: 'PowerPoint', icon: '📽️' },
    // Images
    'image/jpeg': { label: 'JPEG', icon: '🖼️' },
    'image/png': { label: 'PNG', icon: '🖼️' },
    'image/gif': { label: 'GIF', icon: '🖼️' },
    'image/webp': { label: 'WebP', icon: '🖼️' },
    // Archives
    'application/zip': { label: 'ZIP', icon: '📦' },
    'application/x-rar-compressed': { label: 'RAR', icon: '📦' },
    'application/x-7z-compressed': { label: '7Z', icon: '📦' },
    // Text
    'text/plain': { label: 'Text', icon: '📃' },
    'text/csv': { label: 'CSV', icon: '📃' },
  } as Record<string, { label: string; icon: string }>,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format file size cho hiển thị
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Lấy icon cho file type
 */
export function getFileIcon(fileType: string | null): string {
  if (!fileType) return '📎';
  return ATTACHMENT_CONFIG.ALLOWED_TYPES[fileType]?.icon || '📎';
}

/**
 * Lấy label cho file type
 */
export function getFileTypeLabel(fileType: string | null): string {
  if (!fileType) return 'File';
  return ATTACHMENT_CONFIG.ALLOWED_TYPES[fileType]?.label || 'File';
}

/**
 * Check xem file type có được phép không
 */
export function isAllowedFileType(fileType: string): boolean {
  return fileType in ATTACHMENT_CONFIG.ALLOWED_TYPES;
}

/**
 * Check xem có phải là image không
 */
export function isImageFile(fileType: string | null): boolean {
  if (!fileType) return false;
  return fileType.startsWith('image/');
}

/**
 * Generate unique file path
 */
function generateFilePath(taskId: string, uploaderId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${taskId}/${uploaderId}_${timestamp}_${sanitizedFileName}`;
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Lấy danh sách attachments của task
 */
export async function getTaskAttachments(taskId: string): Promise<{
  data: TaskAttachment[];
  error: Error | null;
}> {
  console.log('📎 [taskAttachmentService] getTaskAttachments:', taskId);

  try {
    const { data, error } = await supabase
      .from('task_attachments')
      .select(`
        *,
        uploader:employees!task_attachments_uploaded_by_fkey(
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('task_id', taskId)
      .eq('is_deleted', false)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    // Transform data
    const attachments: TaskAttachment[] = (data || []).map((item: any) => ({
      ...item,
      uploader: Array.isArray(item.uploader) ? item.uploader[0] : item.uploader,
    }));

    console.log('✅ [taskAttachmentService] Found', attachments.length, 'attachments');
    return { data: attachments, error: null };
  } catch (error) {
    console.error('❌ [taskAttachmentService] getTaskAttachments error:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Lấy thống kê attachments của task
 */
export async function getAttachmentStats(taskId: string): Promise<AttachmentStats> {
  console.log('📎 [taskAttachmentService] getAttachmentStats:', taskId);

  try {
    const { data, error } = await supabase
      .from('task_attachments')
      .select('file_size')
      .eq('task_id', taskId)
      .eq('is_deleted', false);

    if (error) throw error;

    const count = data?.length || 0;
    const totalSize = data?.reduce((sum, item) => sum + (item.file_size || 0), 0) || 0;

    return {
      count,
      totalSize,
      maxCount: ATTACHMENT_CONFIG.MAX_FILES_PER_TASK,
      maxTotalSize: ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_PER_TASK,
      canUpload: count < ATTACHMENT_CONFIG.MAX_FILES_PER_TASK && 
                 totalSize < ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_PER_TASK,
    };
  } catch (error) {
    console.error('❌ [taskAttachmentService] getAttachmentStats error:', error);
    return {
      count: 0,
      totalSize: 0,
      maxCount: ATTACHMENT_CONFIG.MAX_FILES_PER_TASK,
      maxTotalSize: ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_PER_TASK,
      canUpload: true,
    };
  }
}

/**
 * Upload file attachment
 */
export async function uploadAttachment(input: UploadAttachmentInput): Promise<{
  data: TaskAttachment | null;
  error: Error | null;
}> {
  console.log('📎 [taskAttachmentService] uploadAttachment:', {
    task_id: input.task_id,
    file_name: input.file.name,
    file_size: input.file.size,
    file_type: input.file.type,
  });

  try {
    // Validate file type
    if (!isAllowedFileType(input.file.type)) {
      throw new Error(`Loại file không được hỗ trợ: ${input.file.type}`);
    }

    // Validate file size
    if (input.file.size > ATTACHMENT_CONFIG.MAX_FILE_SIZE) {
      throw new Error(`File quá lớn. Tối đa ${formatFileSize(ATTACHMENT_CONFIG.MAX_FILE_SIZE)}`);
    }

    // Check stats before upload
    const stats = await getAttachmentStats(input.task_id);
    if (stats.count >= ATTACHMENT_CONFIG.MAX_FILES_PER_TASK) {
      throw new Error(`Đã đạt giới hạn ${ATTACHMENT_CONFIG.MAX_FILES_PER_TASK} file/task`);
    }
    if (stats.totalSize + input.file.size > ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_PER_TASK) {
      throw new Error(`Đã đạt giới hạn dung lượng ${formatFileSize(ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_PER_TASK)}/task`);
    }

    // Generate file path
    const filePath = generateFilePath(input.task_id, input.uploaded_by, input.file.name);

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENT_CONFIG.BUCKET_NAME)
      .upload(filePath, input.file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Storage upload error:', uploadError);
      throw new Error('Lỗi upload file: ' + uploadError.message);
    }

    // Insert record to database
    const { data, error: dbError } = await supabase
      .from('task_attachments')
      .insert({
        task_id: input.task_id,
        file_name: input.file.name,
        file_path: filePath,
        file_size: input.file.size,
        file_type: input.file.type,
        description: input.description || null,
        uploaded_by: input.uploaded_by,
      })
      .select(`
        *,
        uploader:employees!task_attachments_uploaded_by_fkey(
          id,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (dbError) {
      // Rollback: xóa file đã upload
      await supabase.storage
        .from(ATTACHMENT_CONFIG.BUCKET_NAME)
        .remove([filePath]);
      throw dbError;
    }

    console.log('✅ [taskAttachmentService] Upload success:', data.id);
    return {
      data: {
        ...data,
        uploader: Array.isArray(data.uploader) ? data.uploader[0] : data.uploader,
      },
      error: null,
    };
  } catch (error) {
    console.error('❌ [taskAttachmentService] uploadAttachment error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Soft delete attachment
 */
export async function deleteAttachment(
  attachmentId: string,
  deletedBy: string
): Promise<{ success: boolean; error: Error | null }> {
  console.log('📎 [taskAttachmentService] deleteAttachment:', attachmentId);

  try {
    // Soft delete in database
    const { error } = await supabase
      .from('task_attachments')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy,
      })
      .eq('id', attachmentId);

    if (error) throw error;

    // Note: Không xóa file thật trong storage để có thể recover
    // Có thể setup cron job để xóa file sau 30 ngày

    console.log('✅ [taskAttachmentService] Delete success');
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ [taskAttachmentService] deleteAttachment error:', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Lấy URL download file
 */
export async function getDownloadUrl(filePath: string): Promise<{
  url: string | null;
  error: Error | null;
}> {
  console.log('📎 [taskAttachmentService] getDownloadUrl:', filePath);

  try {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_CONFIG.BUCKET_NAME)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) throw error;

    return { url: data.signedUrl, error: null };
  } catch (error) {
    console.error('❌ [taskAttachmentService] getDownloadUrl error:', error);
    return { url: null, error: error as Error };
  }
}

/**
 * Lấy URL preview cho image
 */
export function getImagePreviewUrl(filePath: string): string {
  const { data } = supabase.storage
    .from(ATTACHMENT_CONFIG.BUCKET_NAME)
    .getPublicUrl(filePath, {
      transform: {
        width: 400,
        height: 400,
        resize: 'contain',
      },
    });

  return data.publicUrl;
}

// ============================================================================
// SERVICE OBJECT (Alternative export)
// ============================================================================

export const taskAttachmentService = {
  getTaskAttachments,
  getAttachmentStats,
  uploadAttachment,
  deleteAttachment,
  getDownloadUrl,
  getImagePreviewUrl,
  // Helpers
  formatFileSize,
  getFileIcon,
  getFileTypeLabel,
  isAllowedFileType,
  isImageFile,
  // Config
  config: ATTACHMENT_CONFIG,
};

export default taskAttachmentService;