// ============================================================================
// APPROVAL EVIDENCE FORM - Modal nhập thông tin phê duyệt bên ngoài
// File: src/features/purchasing/pages/components/orders/ApprovalEvidenceForm.tsx
// ============================================================================
// - Nhập: số đề xuất, ngày duyệt, người duyệt
// - Upload file bằng chứng (image/PDF) lên Supabase Storage
// - Hiển thị file đã upload + xóa
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import {
  X,
  Upload,
  FileText,
  FileImage,
  Trash2,
  Eye,
  Loader2,
  Shield,
  Plus,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '../../../../../lib/supabase'

// ===== TYPES =====

export interface ApprovalDocument {
  name: string
  url: string
  type: string       // mime type
  size: number        // bytes
  path?: string       // storage path (for deletion)
}

export interface ApprovalEvidenceData {
  approval_number: string
  approval_date: string
  approved_by_name: string
  approval_documents: ApprovalDocument[]
}

interface ApprovalEvidenceFormProps {
  show: boolean
  onClose: () => void
  onSave: (data: ApprovalEvidenceData) => Promise<void>
  orderId: string
  initialData?: {
    approval_number?: string | null
    approval_date?: string | null
    approved_by_name?: string | null
    approval_documents?: ApprovalDocument[] | null
  }
}

// ===== CONSTANTS =====

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const STORAGE_BUCKET = 'purchase-approvals'

// ===== AUTO-GENERATE HELPERS =====

/**
 * Tạo số đề xuất tự động: DX-YYYY-NNNNNN (6 chữ số)
 * Tìm số lớn nhất trong DB rồi +1
 */
async function generateApprovalNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `DX-${year}-`

  const { data, error } = await supabase
    .from('order_code')
    .select('approval_number')
    .ilike('approval_number', `${prefix}%`)
    .order('approval_number', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Error generating approval number:', error)
    return `${prefix}000001`
  }

  let nextNum = 1
  if (data && data.length > 0 && data[0].approval_number) {
    const numStr = data[0].approval_number.replace(prefix, '')
    const num = parseInt(numStr, 10)
    if (!isNaN(num)) {
      nextNum = num + 1
    }
  }

  return `${prefix}${nextNum.toString().padStart(6, '0')}`
}

/**
 * Lấy tên Giám đốc từ bảng employees (qua position)
 */
async function getDirectorName(): Promise<string | null> {
  // Tìm theo position name chứa "Giám đốc" (không phải Phó Giám đốc)
  const { data, error } = await supabase
    .from('employees')
    .select(`
      full_name,
      position:positions!employees_position_id_fkey(name)
    `)
    .eq('status', 'active')
    .not('position_id', 'is', null)

  if (error || !data) {
    console.error('Error fetching director:', error)
    return 'Lê Văn Huy' // Fallback
  }

  // Tìm người có position = "Giám đốc" (exact hoặc starts with, nhưng không phải "Phó Giám đốc")
  const director = data.find((emp: any) => {
    const posName = emp.position?.name || ''
    return posName === 'Giám đốc' || (posName.includes('Giám đốc') && !posName.includes('Phó'))
  })

  return director ? `${director.full_name} - Giám đốc` : 'Lê Văn Huy - Giám đốc'
}

// ===== COMPONENT =====

export function ApprovalEvidenceForm({
  show,
  onClose,
  onSave,
  orderId,
  initialData,
}: ApprovalEvidenceFormProps) {
  // Form fields
  const [approvalNumber, setApprovalNumber] = useState(initialData?.approval_number || '')
  const [approvalDate, setApprovalDate] = useState(initialData?.approval_date || '')
  const [approvedByName, setApprovedByName] = useState(initialData?.approved_by_name || '')

  // Files
  const [existingDocs, setExistingDocs] = useState<ApprovalDocument[]>(
    initialData?.approval_documents || []
  )
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [removedDocs, setRemovedDocs] = useState<ApprovalDocument[]>([])

  // UI state
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  // ===== AUTO-GENERATE DEFAULTS =====
  useEffect(() => {
    if (!show || initialized.current) return
    initialized.current = true

    const loadDefaults = async () => {
      setLoadingDefaults(true)
      try {
        // 1. Auto-generate approval_number nếu chưa có
        if (!initialData?.approval_number) {
          const generatedNumber = await generateApprovalNumber()
          setApprovalNumber(generatedNumber)
        }

        // 2. Default ngày duyệt = hôm nay nếu chưa có
        if (!initialData?.approval_date) {
          setApprovalDate(new Date().toISOString().split('T')[0])
        }

        // 3. Lấy Giám đốc làm người duyệt mặc định
        if (!initialData?.approved_by_name) {
          const directorName = await getDirectorName()
          if (directorName) {
            setApprovedByName(directorName)
          }
        }
      } catch (err) {
        console.error('Error loading defaults:', err)
      } finally {
        setLoadingDefaults(false)
      }
    }

    loadDefaults()
  }, [show])

  // Reset initialized khi đóng modal
  useEffect(() => {
    if (!show) {
      initialized.current = false
    }
  }, [show])

  if (!show) return null

  // ===== FILE HANDLING =====

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `"${file.name}" — Chỉ chấp nhận file ảnh (JPG, PNG, GIF, WebP) và PDF`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" — Kích thước tối đa 10MB`
    }
    return null
  }

  const addFiles = (files: FileList | File[]) => {
    const fileArr = Array.from(files)
    const errors: string[] = []

    const validFiles = fileArr.filter((file) => {
      const err = validateFile(file)
      if (err) {
        errors.push(err)
        return false
      }
      // Check duplicate
      const isDuplicate = newFiles.some((f) => f.name === file.name && f.size === file.size)
      return !isDuplicate
    })

    if (errors.length > 0) {
      setError(errors.join('\n'))
      setTimeout(() => setError(null), 5000)
    }

    if (validFiles.length > 0) {
      setNewFiles((prev) => [...prev, ...validFiles])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files)
      e.target.value = '' // Reset input
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files)
    }
  }

  const removeNewFile = (idx: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const removeExistingDoc = (doc: ApprovalDocument) => {
    setExistingDocs((prev) => prev.filter((d) => d.url !== doc.url))
    setRemovedDocs((prev) => [...prev, doc])
  }

  // ===== UPLOAD TO SUPABASE STORAGE =====

  const uploadFilesToStorage = async (files: File[]): Promise<ApprovalDocument[]> => {
    const uploaded: ApprovalDocument[] = []

    for (const file of files) {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${orderId}/${timestamp}_${safeName}`

      const { data, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        throw new Error(`Lỗi upload "${file.name}": ${uploadError.message}`)
      }

      // Lấy public URL
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path)

      uploaded.push({
        name: file.name,
        url: urlData.publicUrl,
        type: file.type,
        size: file.size,
        path: path,
      })
    }

    return uploaded
  }

  const deleteFilesFromStorage = async (docs: ApprovalDocument[]) => {
    const paths = docs.filter((d) => d.path).map((d) => d.path!)
    if (paths.length === 0) return

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(paths)

    if (error) {
      console.error('Delete storage error:', error)
      // Không throw, chỉ log
    }
  }

  // ===== SAVE =====

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      // 1. Upload new files
      let uploadedDocs: ApprovalDocument[] = []
      if (newFiles.length > 0) {
        setUploading(true)
        uploadedDocs = await uploadFilesToStorage(newFiles)
        setUploading(false)
      }

      // 2. Delete removed files from storage
      if (removedDocs.length > 0) {
        await deleteFilesFromStorage(removedDocs)
      }

      // 3. Combine existing + new documents
      const allDocuments = [...existingDocs, ...uploadedDocs]

      // 4. Save via callback
      await onSave({
        approval_number: approvalNumber.trim(),
        approval_date: approvalDate,
        approved_by_name: approvedByName.trim(),
        approval_documents: allDocuments,
      })

      // Done
      onClose()
    } catch (err: any) {
      setError(err.message || 'Lỗi lưu thông tin phê duyệt')
      setUploading(false)
    } finally {
      setSaving(false)
    }
  }

  // ===== HELPERS =====

  const isImage = (typeOrName: string) =>
    /^image\/|\.jpe?g|\.png|\.gif|\.webp/i.test(typeOrName)

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const totalFiles = existingDocs.length + newFiles.length

  // ===== RENDER =====

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Thông tin phê duyệt
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số đề xuất / Số phiếu duyệt
              </label>
              <input
                type="text"
                value={approvalNumber}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-0.5">Mã tự động tạo bởi hệ thống</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày duyệt
                </label>
                <input
                  type="date"
                  value={approvalDate}
                  onChange={(e) => setApprovalDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Người duyệt
                </label>
                <input
                  type="text"
                  value={loadingDefaults ? 'Đang tải...' : approvedByName}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File bằng chứng phê duyệt ({totalFiles} file)
            </label>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">
                Kéo thả file vào đây hoặc <span className="text-blue-600 font-medium">chọn file</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Ảnh (JPG, PNG, GIF, WebP) hoặc PDF • Tối đa 10MB/file
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Existing files */}
          {existingDocs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">Đã upload</p>
              {existingDocs.map((doc, idx) => {
                const DocIcon = isImage(doc.type || doc.name) ? FileImage : FileText
                return (
                  <div
                    key={`existing-${idx}`}
                    className="flex items-center gap-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <DocIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm text-gray-700 flex-1 truncate">{doc.name}</span>
                    <span className="text-xs text-gray-400">
                      {doc.size ? formatFileSize(doc.size) : ''}
                    </span>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Xem"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => removeExistingDoc(doc)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* New files (pending upload) */}
          {newFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">
                Chờ upload ({newFiles.length} file)
              </p>
              {newFiles.map((file, idx) => {
                const DocIcon = isImage(file.type) ? FileImage : FileText
                return (
                  <div
                    key={`new-${idx}`}
                    className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg"
                  >
                    <DocIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm text-gray-700 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                    <button
                      onClick={() => removeNewFile(idx)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Bỏ"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Đóng
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploading ? 'Đang upload...' : 'Đang lưu...'}
              </>
            ) : (
              'Lưu thông tin'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApprovalEvidenceForm