// ============================================================================
// ATTACHMENT SECTION COMPONENT
// File: src/features/tasks/components/AttachmentSection.tsx
// Huy Anh ERP System - Phase 4.5: File Attachments
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Paperclip,
  Upload,
  X,
  Download,
  Trash2,
  FileText,
  Image,
  File,
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  taskAttachmentService,
  TaskAttachment,
  AttachmentStats,
  formatFileSize,
  getFileIcon,
  isImageFile,
  isAllowedFileType,
  ATTACHMENT_CONFIG,
} from '../../../services/taskAttachmentService';

// ============================================================================
// TYPES
// ============================================================================

interface AttachmentSectionProps {
  taskId: string;
  currentUserId: string;
  canEdit?: boolean;
  className?: string;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

// File Type Icon
const FileTypeIcon: React.FC<{ fileType: string | null; className?: string }> = ({
  fileType,
  className = 'w-8 h-8',
}) => {
  if (isImageFile(fileType)) {
    return <Image className={`${className} text-green-500`} />;
  }
  if (fileType?.includes('pdf')) {
    return <FileText className={`${className} text-red-500`} />;
  }
  if (fileType?.includes('word') || fileType?.includes('document')) {
    return <FileText className={`${className} text-blue-500`} />;
  }
  if (fileType?.includes('excel') || fileType?.includes('sheet')) {
    return <FileText className={`${className} text-green-600`} />;
  }
  if (fileType?.includes('powerpoint') || fileType?.includes('presentation')) {
    return <FileText className={`${className} text-orange-500`} />;
  }
  if (fileType?.includes('zip') || fileType?.includes('rar') || fileType?.includes('7z')) {
    return <File className={`${className} text-yellow-600`} />;
  }
  return <File className={`${className} text-gray-500`} />;
};

// Image Preview Modal
const ImagePreviewModal: React.FC<{
  attachment: TaskAttachment;
  onClose: () => void;
  onDownload: () => void;
}> = ({ attachment, onClose, onDownload }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImage = async () => {
      const { url } = await taskAttachmentService.getDownloadUrl(attachment.file_path);
      setImageUrl(url);
      setLoading(false);
    };
    loadImage();
  }, [attachment.file_path]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2 min-w-0">
            <Image className="w-5 h-5 text-green-500 flex-shrink-0" />
            <span className="font-medium text-gray-900 truncate">{attachment.file_name}</span>
            <span className="text-sm text-gray-500">({formatFileSize(attachment.file_size)})</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image */}
        <div className="p-4 flex items-center justify-center bg-gray-100 min-h-[300px]">
          {loading ? (
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={attachment.file_name}
              className="max-w-full max-h-[70vh] object-contain"
            />
          ) : (
            <p className="text-gray-500">Không thể tải hình ảnh</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-gray-50">
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Tải xuống
          </button>
        </div>
      </div>
    </div>
  );
};

// Attachment Item
const AttachmentItem: React.FC<{
  attachment: TaskAttachment;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onPreview: (attachment: TaskAttachment) => void;
}> = ({ attachment, canDelete, onDelete, onPreview }) => {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { url, error } = await taskAttachmentService.getDownloadUrl(attachment.file_path);
      if (error || !url) {
        alert('Lỗi tải file: ' + (error?.message || 'Không thể tạo link download'));
        return;
      }
      // Open in new tab or trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.file_name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Xóa file "${attachment.file_name}"?`)) return;
    setDeleting(true);
    onDelete(attachment.id);
  };

  const isImage = isImageFile(attachment.file_type);

  return (
    <div className="group flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
      {/* Icon */}
      <div className="flex-shrink-0">
        <FileTypeIcon fileType={attachment.file_type} className="w-10 h-10" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate" title={attachment.file_name}>
          {attachment.file_name}
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{formatFileSize(attachment.file_size)}</span>
          {attachment.uploader && (
            <>
              <span>•</span>
              <span>{attachment.uploader.full_name}</span>
            </>
          )}
          <span>•</span>
          <span>
            {new Date(attachment.uploaded_at).toLocaleDateString('vi-VN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </span>
        </div>
        {attachment.description && (
          <p className="text-sm text-gray-600 mt-1 truncate" title={attachment.description}>
            {attachment.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isImage && (
          <button
            onClick={() => onPreview(attachment)}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Xem trước"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
          title="Tải xuống"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </button>
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title="Xóa"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

// Upload Area
const UploadArea: React.FC<{
  onFilesSelected: (files: FileList) => void;
  disabled?: boolean;
  stats: AttachmentStats;
}> = ({ onFilesSelected, disabled, stats }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesSelected(e.dataTransfer.files);
      }
    },
    [onFilesSelected]
  );

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = ''; // Reset để có thể chọn lại cùng file
    }
  };

  const acceptTypes = Object.keys(ATTACHMENT_CONFIG.ALLOWED_TYPES).join(',');

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
        ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={disabled ? undefined : handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptTypes}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />

      <Upload className={`w-10 h-10 mx-auto mb-3 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />

      <p className="text-sm font-medium text-gray-700">
        {dragActive ? 'Thả file vào đây' : 'Kéo thả file hoặc click để chọn'}
      </p>
      <p className="text-xs text-gray-500 mt-1">
        PDF, Word, Excel, Hình ảnh, ZIP (tối đa {formatFileSize(ATTACHMENT_CONFIG.MAX_FILE_SIZE)}/file)
      </p>

      {/* Stats */}
      <div className="mt-3 text-xs text-gray-500">
        Đã dùng: {stats.count}/{stats.maxCount} file • {formatFileSize(stats.totalSize)}/
        {formatFileSize(stats.maxTotalSize)}
      </div>
    </div>
  );
};

// Uploading Item
const UploadingItem: React.FC<{
  item: UploadingFile;
  onCancel?: () => void;
}> = ({ item, onCancel }) => (
  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
    <div className="flex-shrink-0">
      {item.status === 'uploading' && <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />}
      {item.status === 'success' && <CheckCircle className="w-8 h-8 text-green-500" />}
      {item.status === 'error' && <AlertCircle className="w-8 h-8 text-red-500" />}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 truncate">{item.file.name}</p>
      <p className="text-sm text-gray-500">
        {formatFileSize(item.file.size)}
        {item.status === 'uploading' && ` • Đang tải lên...`}
        {item.status === 'success' && ` • Hoàn tất`}
        {item.status === 'error' && (
          <span className="text-red-500"> • {item.error || 'Lỗi'}</span>
        )}
      </p>
    </div>
    {item.status === 'uploading' && onCancel && (
      <button
        onClick={onCancel}
        className="p-1 text-gray-500 hover:text-red-500 rounded"
        title="Hủy"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const AttachmentSection: React.FC<AttachmentSectionProps> = ({
  taskId,
  currentUserId,
  canEdit = false,
  className = '',
}) => {
  // State
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [stats, setStats] = useState<AttachmentStats>({
    count: 0,
    totalSize: 0,
    maxCount: ATTACHMENT_CONFIG.MAX_FILES_PER_TASK,
    maxTotalSize: ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_PER_TASK,
    canUpload: true,
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachment | null>(null);
  const [expanded, setExpanded] = useState(true);

  // Load attachments
  const loadAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const [attachmentsRes, statsRes] = await Promise.all([
        taskAttachmentService.getTaskAttachments(taskId),
        taskAttachmentService.getAttachmentStats(taskId),
      ]);
      setAttachments(attachmentsRes.data);
      setStats(statsRes);
    } catch (error) {
      console.error('Error loading attachments:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  // Handle files selected for upload
  const handleFilesSelected = async (files: FileList) => {
    const fileArray = Array.from(files);

    // Validate trước khi upload
    const validFiles: File[] = [];
    for (const file of fileArray) {
      if (!isAllowedFileType(file.type)) {
        alert(`File "${file.name}" không được hỗ trợ`);
        continue;
      }
      if (file.size > ATTACHMENT_CONFIG.MAX_FILE_SIZE) {
        alert(`File "${file.name}" quá lớn (max ${formatFileSize(ATTACHMENT_CONFIG.MAX_FILE_SIZE)})`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Check total count
    if (stats.count + validFiles.length > stats.maxCount) {
      alert(`Chỉ có thể upload thêm ${stats.maxCount - stats.count} file`);
      return;
    }

    // Add to uploading list
    const uploadingItems: UploadingFile[] = validFiles.map((file) => ({
      id: `${Date.now()}_${file.name}`,
      file,
      progress: 0,
      status: 'uploading' as const,
    }));
    setUploading((prev) => [...prev, ...uploadingItems]);

    // Upload each file
    for (const item of uploadingItems) {
      try {
        const { data, error } = await taskAttachmentService.uploadAttachment({
          task_id: taskId,
          file: item.file,
          uploaded_by: currentUserId,
        });

        if (error || !data) {
          setUploading((prev) =>
            prev.map((u) =>
              u.id === item.id
                ? { ...u, status: 'error' as const, error: error?.message || 'Lỗi upload' }
                : u
            )
          );
        } else {
          setUploading((prev) =>
            prev.map((u) => (u.id === item.id ? { ...u, status: 'success' as const } : u))
          );
          // Add to list
          setAttachments((prev) => [data, ...prev]);
          setStats((prev) => ({
            ...prev,
            count: prev.count + 1,
            totalSize: prev.totalSize + data.file_size,
            canUpload: prev.count + 1 < prev.maxCount,
          }));
        }
      } catch (error) {
        setUploading((prev) =>
          prev.map((u) =>
            u.id === item.id
              ? { ...u, status: 'error' as const, error: 'Lỗi không xác định' }
              : u
          )
        );
      }
    }

    // Clear completed uploads after 3 seconds
    setTimeout(() => {
      setUploading((prev) => prev.filter((u) => u.status === 'uploading'));
    }, 3000);
  };

  // Handle delete
  const handleDelete = async (attachmentId: string) => {
    const attachment = attachments.find((a) => a.id === attachmentId);
    if (!attachment) return;

    const { success, error } = await taskAttachmentService.deleteAttachment(
      attachmentId,
      currentUserId
    );

    if (success) {
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      setStats((prev) => ({
        ...prev,
        count: prev.count - 1,
        totalSize: prev.totalSize - attachment.file_size,
        canUpload: true,
      }));
    } else {
      alert('Lỗi xóa file: ' + (error?.message || 'Không xác định'));
    }
  };

  // Handle preview
  const handlePreview = (attachment: TaskAttachment) => {
    setPreviewAttachment(attachment);
  };

  // Handle download from preview
  const handleDownloadFromPreview = async () => {
    if (!previewAttachment) return;
    const { url } = await taskAttachmentService.getDownloadUrl(previewAttachment.file_path);
    if (url) {
      window.open(url, '_blank');
    }
  };

  // Check if user can delete
  const canDelete = (attachment: TaskAttachment) => {
    return canEdit || attachment.uploaded_by === currentUserId;
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Paperclip className="w-5 h-5 text-gray-600" />
          <span className="font-medium text-gray-900">File đính kèm</span>
          {attachments.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
              {attachments.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Upload Area */}
          {canEdit && (
            <UploadArea
              onFilesSelected={handleFilesSelected}
              disabled={!stats.canUpload}
              stats={stats}
            />
          )}

          {/* Uploading Items */}
          {uploading.length > 0 && (
            <div className="space-y-2">
              {uploading.map((item) => (
                <UploadingItem key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Attachments List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Paperclip className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>Chưa có file đính kèm</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <AttachmentItem
                  key={attachment.id}
                  attachment={attachment}
                  canDelete={canDelete(attachment)}
                  onDelete={handleDelete}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewAttachment && (
        <ImagePreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
          onDownload={handleDownloadFromPreview}
        />
      )}
    </div>
  );
};

export default AttachmentSection;