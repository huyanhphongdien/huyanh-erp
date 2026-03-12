// ============================================================================
// CONFIRM ORDER MODAL - Xác nhận đơn hàng + Upload bằng chứng phê duyệt
// File: src/features/purchasing/pages/components/orders/ConfirmOrderModal.tsx
// ============================================================================
// Flow: Bấm "Xác nhận" → Modal hiện:
//   - Số đề xuất (auto-gen DX-YYYY-NNNNNN)
//   - Ngày duyệt (default hôm nay)
//   - Người duyệt (default Giám đốc, readonly)
//   - Upload file PDF/ảnh bằng chứng (bắt buộc ≥1 file)
// → Xác nhận → Upload files → Save approval data → Confirm order
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import {
  X,
  Upload,
  FileText,
  ImageIcon,
  Trash2,
  Eye,
  Loader2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Calendar,
  User,
  Hash,
} from 'lucide-react'
import { supabase } from '../../../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface ApprovalDocument {
  name: string
  url: string
  type: string
  size: number
  path?: string
}

interface ConfirmOrderModalProps {
  show: boolean
  orderCode: string
  orderId: string
  loading?: boolean
  onClose: () => void
  onConfirm: (approvalData: {
    approval_number: string
    approval_date: string
    approved_by_name: string
    approval_documents: ApprovalDocument[]
  }) => Promise<void>
}

// ============================================================================
// HELPERS
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return ImageIcon
  return FileText
}

async function generateApprovalNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `DX-${year}-`

  try {
    // Đếm số đề xuất trong năm hiện tại
    const { count, error } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .ilike('approval_number', `${prefix}%`)

    if (error) throw error
    const next = ((count || 0) + 1).toString().padStart(6, '0')
    return `${prefix}${next}`
  } catch {
    // Fallback: timestamp
    const ts = Date.now().toString().slice(-6)
    return `${prefix}${ts}`
  }
}

async function fetchDefaultApprover(): Promise<string> {
  try {
    // Tìm Giám đốc (position hoặc role)
    const { data, error } = await supabase
      .from('employees')
      .select('full_name, position')
      .or('position.ilike.%giám đốc%,position.ilike.%giam doc%,position.ilike.%director%')
      .eq('status', 'active')
      .limit(1)
      .single()

    if (error || !data) {
      // Fallback: tìm theo tên
      const { data: byName } = await supabase
        .from('employees')
        .select('full_name, position')
        .ilike('full_name', '%Lê Văn Huy%')
        .limit(1)
        .single()

      if (byName) return `${byName.full_name} - ${byName.position || 'Giám đốc'}`
      return 'Lê Văn Huy - Giám đốc'
    }

    return `${data.full_name} - ${data.position || 'Giám đốc'}`
  } catch {
    return 'Lê Văn Huy - Giám đốc'
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ConfirmOrderModal({
  show,
  orderCode,
  orderId,
  loading: externalLoading,
  onClose,
  onConfirm,
}: ConfirmOrderModalProps) {
  // Form state
  const [approvalNumber, setApprovalNumber] = useState('')
  const [approvalDate, setApprovalDate] = useState('')
  const [approvedByName, setApprovedByName] = useState('')

  // File state
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)

  // UI state
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [initLoading, setInitLoading] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  // ===== INIT: Auto-generate defaults =====
  useEffect(() => {
    if (!show) {
      // Reset khi đóng
      initialized.current = false
      return
    }
    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      setInitLoading(true)
      setError(null)
      setFiles([])

      try {
        const [autoNumber, defaultApprover] = await Promise.all([
          generateApprovalNumber(),
          fetchDefaultApprover(),
        ])

        setApprovalNumber(autoNumber)
        setApprovalDate(new Date().toISOString().split('T')[0])
        setApprovedByName(defaultApprover)
      } catch (err) {
        console.error('Init error:', err)
        setApprovalNumber(`DX-${new Date().getFullYear()}-000001`)
        setApprovalDate(new Date().toISOString().split('T')[0])
        setApprovedByName('Lê Văn Huy - Giám đốc')
      } finally {
        setInitLoading(false)
      }
    }

    init()
  }, [show])

  // ===== FILE HANDLING =====
  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return
    const newFiles = Array.from(selectedFiles).filter((f) => {
      // Max 10MB per file
      if (f.size > 10 * 1024 * 1024) {
        setError(`File "${f.name}" vượt quá 10MB`)
        return false
      }
      // Only images and PDF
      if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
        setError(`File "${f.name}" không được hỗ trợ. Chỉ chấp nhận ảnh và PDF.`)
        return false
      }
      return true
    })

    setFiles((prev) => {
      const total = prev.length + newFiles.length
      if (total > 5) {
        setError('Tối đa 5 file')
        return prev
      }
      setError(null)
      return [...prev, ...newFiles]
    })
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setError(null)
  }

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  // ===== UPLOAD FILES TO SUPABASE STORAGE =====
  const uploadFiles = async (): Promise<ApprovalDocument[]> => {
    const docs: ApprovalDocument[] = []
    const totalFiles = files.length

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop() || 'bin'
      const timestamp = Date.now()
      const storagePath = `approvals/${orderId}/${timestamp}_${i}.${ext}`

      setUploadProgress(Math.round(((i + 0.5) / totalFiles) * 100))

      // Try 'purchase-approvals' bucket first, fallback to 'invoice-images'
      let uploadResult = await supabase.storage
        .from('purchase-approvals')
        .upload(storagePath, file, { upsert: true })

      if (uploadResult.error) {
        // Fallback bucket
        uploadResult = await supabase.storage
          .from('invoice-images')
          .upload(storagePath, file, { upsert: true })

        if (uploadResult.error) {
          throw new Error(`Upload thất bại: ${file.name} — ${uploadResult.error.message}`)
        }

        const { data: urlData } = supabase.storage
          .from('invoice-images')
          .getPublicUrl(storagePath)

        docs.push({
          name: file.name,
          url: urlData.publicUrl,
          type: file.type,
          size: file.size,
          path: storagePath,
        })
      } else {
        const { data: urlData } = supabase.storage
          .from('purchase-approvals')
          .getPublicUrl(storagePath)

        docs.push({
          name: file.name,
          url: urlData.publicUrl,
          type: file.type,
          size: file.size,
          path: storagePath,
        })
      }

      setUploadProgress(Math.round(((i + 1) / totalFiles) * 100))
    }

    return docs
  }

  // ===== SUBMIT =====
  const handleSubmit = async () => {
    setError(null)

    // Validate
    if (!approvalNumber.trim()) {
      setError('Vui lòng nhập số đề xuất')
      return
    }
    if (!approvalDate) {
      setError('Vui lòng chọn ngày duyệt')
      return
    }
    if (!approvedByName.trim()) {
      setError('Vui lòng nhập người duyệt')
      return
    }
    if (files.length === 0) {
      setError('Vui lòng upload ít nhất 1 file bằng chứng phê duyệt (ảnh/PDF)')
      return
    }

    setSaving(true)
    setUploading(true)

    try {
      // 1. Upload files
      const uploadedDocs = await uploadFiles()
      setUploading(false)

      // 2. Call parent's confirm with approval data
      await onConfirm({
        approval_number: approvalNumber.trim(),
        approval_date: approvalDate,
        approved_by_name: approvedByName.trim(),
        approval_documents: uploadedDocs,
      })
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  // ===== RENDER =====
  if (!show) return null

  const isLoading = saving || externalLoading
  const totalFileSize = files.reduce((s, f) => s + f.size, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Xác nhận đơn hàng</h3>
                <p className="text-sm text-gray-500">{orderCode}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-700">
              <strong>Lưu ý:</strong> Sau khi xác nhận, đơn hàng sẽ có hiệu lực và không thể sửa nội dung.
              Vui lòng nhập thông tin phê duyệt và upload bằng chứng.
            </p>
          </div>

          {initLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <span className="ml-2 text-gray-500">Đang tải...</span>
            </div>
          ) : (
            <>
              {/* Số đề xuất */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <Hash className="w-4 h-4 text-gray-400" />
                  Số đề xuất / Số phiếu duyệt
                </label>
                <input
                  type="text"
                  value={approvalNumber}
                  readOnly
                  className="w-full px-4 py-2.5 text-[15px] border border-gray-300 rounded-xl bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">Hệ thống tự tạo, tự động tăng</p>
              </div>

              {/* Ngày duyệt */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Ngày duyệt <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={approvalDate}
                  onChange={(e) => setApprovalDate(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 text-[15px] border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              {/* Người duyệt */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <User className="w-4 h-4 text-gray-400" />
                  Người duyệt
                </label>
                <input
                  type="text"
                  value={approvedByName}
                  readOnly
                  className="w-full px-4 py-2.5 text-[15px] border border-gray-300 rounded-xl bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">Mặc định: Giám đốc</p>
              </div>

              {/* Upload area */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <Upload className="w-4 h-4 text-gray-400" />
                  File đính kèm <span className="text-red-500">*</span>
                  <span className="text-xs text-gray-400 font-normal">(Ảnh/PDF đề xuất đã duyệt)</span>
                </label>

                {/* Drop zone */}
                <div
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                    dragOver
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    Kéo thả file vào đây hoặc <span className="text-blue-600 font-medium">chọn file</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Ảnh (JPG, PNG) hoặc PDF • Tối đa 5 file • Mỗi file ≤ 10MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,application/pdf"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files)}
                    disabled={isLoading}
                  />
                </div>

                {/* File list */}
                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((file, index) => {
                      const FileIcon = getFileIcon(file.type)
                      const isImage = file.type.startsWith('image/')
                      return (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2"
                        >
                          {/* Thumbnail or icon */}
                          {isImage ? (
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                              <FileIcon className="w-5 h-5 text-red-500" />
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                            <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                          </div>

                          {/* Preview button for images */}
                          {isImage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(URL.createObjectURL(file), '_blank')
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Xem trước"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeFile(index)
                            }}
                            disabled={isLoading}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}

                    {/* Summary */}
                    <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                      <span>
                        {files.length}/5 file • Tổng {formatFileSize(totalFileSize)}
                      </span>
                      {files.length < 5 && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                          disabled={isLoading}
                        >
                          + Thêm file
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Upload progress */}
          {uploading && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-700 font-medium">
                  Đang upload file... {uploadProgress}%
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || initLoading || files.length === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploading ? 'Đang upload...' : 'Đang xử lý...'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Xác nhận đơn hàng
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}