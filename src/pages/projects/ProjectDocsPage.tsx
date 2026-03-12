// ============================================================================
// FILE: src/pages/projects/ProjectDocsPage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM8 — Bước 8.2: UI Tài liệu & Files
// ============================================================================
// Trang quản lý tài liệu dự án:
//   - Category tabs: Tất cả | Kế hoạch | Báo cáo | Biên bản | Hợp đồng | Thiết kế | Khác
//   - Drag-drop upload area + FAB quick upload
//   - File grid/list toggle
//   - Version history drawer
//   - Stats summary cards
// Design: Industrial Rubber Theme, mobile-first
// Brand: #1B4D3E primary, #E8A838 accent
// Touch targets ≥ 48px, no hover states (use active: states)
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft,
  Upload,
  Plus,
  FileText,
  Image,
  FileSpreadsheet,
  File,
  Presentation,
  Archive,
  Download,
  Trash2,
  MoreVertical,
  Search,
  X,
  Eye,
  FolderOpen,
  Clock,
  User,
  HardDrive,
  ChevronDown,
  ChevronRight,
  UploadCloud,
  RefreshCw,
  Grid3X3,
  List,
  Edit3,
  History,
  Check,
  AlertCircle,
  Loader2,
  FileUp,
  Filter,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

// ============================================================================
// TYPES
// ============================================================================

type DocCategory = 'plan' | 'report' | 'meeting_note' | 'contract' | 'design' | 'other'

interface ProjectDocument {
  id: string
  project_id: string
  phase_id: string | null
  name: string
  description: string | null
  file_url: string
  file_path: string
  file_type: string | null
  file_size: number
  version: number
  category: DocCategory | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
  phase?: { id: string; name: string } | null
  uploader?: { id: string; full_name: string; avatar_url?: string } | null
}

interface DocVersion {
  id: string
  version: number
  file_url: string
  file_size: number
  uploaded_by: string | null
  notes: string | null
  created_at: string
  uploader?: { id: string; full_name: string } | null
}

interface Phase {
  id: string
  name: string
}

interface DocStats {
  total_files: number
  total_size: number
  by_category: Record<string, number>
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_TABS: { key: DocCategory | 'all'; label: string; icon: string; color: string }[] = [
  { key: 'all',          label: 'Tất cả',    icon: '📂', color: '#1B4D3E' },
  { key: 'plan',         label: 'Kế hoạch',  icon: '📋', color: '#3B82F6' },
  { key: 'report',       label: 'Báo cáo',   icon: '📊', color: '#10B981' },
  { key: 'meeting_note', label: 'Biên bản',  icon: '📝', color: '#F59E0B' },
  { key: 'contract',     label: 'Hợp đồng',  icon: '📜', color: '#8B5CF6' },
  { key: 'design',       label: 'Thiết kế',  icon: '📐', color: '#EC4899' },
  { key: 'other',        label: 'Khác',      icon: '📁', color: '#6B7280' },
]

const FILE_ICON_MAP: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
  pdf:        { icon: <FileText className="w-5 h-5" />,        bg: 'bg-red-50',    color: 'text-red-600' },
  word:       { icon: <FileText className="w-5 h-5" />,        bg: 'bg-blue-50',   color: 'text-blue-600' },
  excel:      { icon: <FileSpreadsheet className="w-5 h-5" />, bg: 'bg-green-50',  color: 'text-green-600' },
  powerpoint: { icon: <Presentation className="w-5 h-5" />,    bg: 'bg-orange-50', color: 'text-orange-600' },
  jpeg:       { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  png:        { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  gif:        { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  webp:       { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  svg:        { icon: <Image className="w-5 h-5" />,           bg: 'bg-pink-50',   color: 'text-pink-600' },
  zip:        { icon: <Archive className="w-5 h-5" />,         bg: 'bg-amber-50',  color: 'text-amber-700' },
  rar:        { icon: <Archive className="w-5 h-5" />,         bg: 'bg-amber-50',  color: 'text-amber-700' },
  csv:        { icon: <FileSpreadsheet className="w-5 h-5" />, bg: 'bg-teal-50',   color: 'text-teal-600' },
  text:       { icon: <FileText className="w-5 h-5" />,        bg: 'bg-gray-50',   color: 'text-gray-600' },
  dxf:        { icon: <File className="w-5 h-5" />,            bg: 'bg-indigo-50', color: 'text-indigo-600' },
  dwg:        { icon: <File className="w-5 h-5" />,            bg: 'bg-indigo-50', color: 'text-indigo-600' },
}

const DEFAULT_FILE_ICON = { icon: <File className="w-5 h-5" />, bg: 'bg-gray-50', color: 'text-gray-500' }

/** Max file size: 20MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_PHASES: Phase[] = [
  { id: 'p1', name: 'Khảo sát & Phân tích' },
  { id: 'p2', name: 'Thiết kế hệ thống' },
  { id: 'p3', name: 'Phát triển modules' },
  { id: 'p4', name: 'Testing & UAT' },
  { id: 'p5', name: 'Go-live & Training' },
]

const MOCK_DOCS: ProjectDocument[] = [
  {
    id: 'd1', project_id: '1', phase_id: 'p1', name: 'SRS_Document_v3.pdf',
    description: 'Tài liệu đặc tả yêu cầu phần mềm', file_url: '#', file_path: '1/plan/srs.pdf',
    file_type: 'pdf', file_size: 2_340_000, version: 3, category: 'plan',
    uploaded_by: 'e1', created_at: '2025-02-10T08:30:00Z', updated_at: '2025-03-15T14:00:00Z',
    phase: { id: 'p1', name: 'Khảo sát & Phân tích' },
    uploader: { id: 'e1', full_name: 'Lê Duy Minh' },
  },
  {
    id: 'd2', project_id: '1', phase_id: 'p2', name: 'DB_Schema_Design.xlsx',
    description: 'Thiết kế database schema cho toàn bộ ERP', file_url: '#', file_path: '1/design/db.xlsx',
    file_type: 'excel', file_size: 890_000, version: 5, category: 'design',
    uploaded_by: 'e1', created_at: '2025-04-01T10:00:00Z', updated_at: '2026-02-20T09:00:00Z',
    phase: { id: 'p2', name: 'Thiết kế hệ thống' },
    uploader: { id: 'e1', full_name: 'Lê Duy Minh' },
  },
  {
    id: 'd3', project_id: '1', phase_id: 'p3', name: 'Bien_ban_hop_kickoff.docx',
    description: 'Biên bản họp khởi động dự án', file_url: '#', file_path: '1/meeting_note/kickoff.docx',
    file_type: 'word', file_size: 156_000, version: 1, category: 'meeting_note',
    uploaded_by: 'e1', created_at: '2025-01-15T14:30:00Z', updated_at: '2025-01-15T14:30:00Z',
    phase: { id: 'p3', name: 'Phát triển modules' },
    uploader: { id: 'e1', full_name: 'Lê Duy Minh' },
  },
  {
    id: 'd4', project_id: '1', phase_id: null, name: 'Hop_dong_Supabase_Pro.pdf',
    description: 'Hợp đồng dịch vụ Supabase Pro Plan', file_url: '#', file_path: '1/contract/supabase.pdf',
    file_type: 'pdf', file_size: 450_000, version: 1, category: 'contract',
    uploaded_by: 'e1', created_at: '2025-03-01T09:00:00Z', updated_at: '2025-03-01T09:00:00Z',
    phase: null,
    uploader: { id: 'e1', full_name: 'Lê Duy Minh' },
  },
  {
    id: 'd5', project_id: '1', phase_id: 'p3', name: 'Bao_cao_tien_do_T01_2026.pdf',
    description: 'Báo cáo tiến độ tháng 01/2026', file_url: '#', file_path: '1/report/jan2026.pdf',
    file_type: 'pdf', file_size: 1_200_000, version: 1, category: 'report',
    uploaded_by: 'e1', created_at: '2026-02-05T10:00:00Z', updated_at: '2026-02-05T10:00:00Z',
    phase: { id: 'p3', name: 'Phát triển modules' },
    uploader: { id: 'e1', full_name: 'Lê Duy Minh' },
  },
  {
    id: 'd6', project_id: '1', phase_id: 'p2', name: 'UI_Wireframes_WMS.png',
    description: 'Wireframe cho module WMS', file_url: '#', file_path: '1/design/wms_wireframe.png',
    file_type: 'png', file_size: 3_500_000, version: 2, category: 'design',
    uploaded_by: 'e1', created_at: '2025-06-10T08:00:00Z', updated_at: '2025-08-20T16:00:00Z',
    phase: { id: 'p2', name: 'Thiết kế hệ thống' },
    uploader: { id: 'e1', full_name: 'Lê Duy Minh' },
  },
  {
    id: 'd7', project_id: '1', phase_id: 'p3', name: 'Bao_cao_tien_do_T02_2026.pdf',
    description: 'Báo cáo tiến độ tháng 02/2026', file_url: '#', file_path: '1/report/feb2026.pdf',
    file_type: 'pdf', file_size: 980_000, version: 1, category: 'report',
    uploaded_by: 'e1', created_at: '2026-02-28T10:00:00Z', updated_at: '2026-02-28T10:00:00Z',
    phase: { id: 'p3', name: 'Phát triển modules' },
    uploader: { id: 'e1', full_name: 'Lê Duy Minh' },
  },
]

const MOCK_STATS: DocStats = {
  total_files: 7,
  total_size: 9_516_000,
  by_category: { plan: 1, design: 2, meeting_note: 1, contract: 1, report: 2 },
}

const MOCK_VERSIONS: DocVersion[] = [
  { id: 'v1', version: 1, file_url: '#', file_size: 1_800_000, uploaded_by: 'e1', notes: 'Phiên bản đầu tiên', created_at: '2025-02-10T08:30:00Z', uploader: { id: 'e1', full_name: 'Lê Duy Minh' } },
  { id: 'v2', version: 2, file_url: '#', file_size: 2_100_000, uploaded_by: 'e1', notes: 'Cập nhật use cases', created_at: '2025-02-25T10:00:00Z', uploader: { id: 'e1', full_name: 'Lê Duy Minh' } },
]

// ============================================================================
// HELPERS
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} giờ trước`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay} ngày trước`
  return formatDate(dateStr)
}

function getFileIcon(fileType: string | null): { icon: React.ReactNode; bg: string; color: string } {
  if (!fileType) return DEFAULT_FILE_ICON
  return FILE_ICON_MAP[fileType.toLowerCase()] || DEFAULT_FILE_ICON
}

function getCategoryConfig(cat: DocCategory | null) {
  const found = CATEGORY_TABS.find(t => t.key === cat)
  return found || CATEGORY_TABS[CATEGORY_TABS.length - 1] // fallback 'other'
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" vượt quá 20MB`
  }
  return null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProjectDocsPage() {
  const navigate = useNavigate()
  const { id: projectId } = useParams<{ id: string }>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const versionFileInputRef = useRef<HTMLInputElement>(null)

  // State
  const [docs, setDocs] = useState<ProjectDocument[]>(MOCK_DOCS)
  const [stats, setStats] = useState<DocStats>(MOCK_STATS)
  const [phases] = useState<Phase[]>(MOCK_PHASES)
  const [loading, setLoading] = useState(false)

  // Filters
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selectedPhase, setSelectedPhase] = useState<string>('')

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')

  // Upload
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadCategory, setUploadCategory] = useState<DocCategory>('other')
  const [uploadPhase, setUploadPhase] = useState<string>('')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Actions
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [showVersionHistory, setShowVersionHistory] = useState<string | null>(null)
  const [versions, setVersions] = useState<DocVersion[]>([])
  const [versionUploadDocId, setVersionUploadDocId] = useState<string | null>(null)

  // Edit
  const [editingDoc, setEditingDoc] = useState<ProjectDocument | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState<DocCategory>('other')

  // Confirm delete
  const [deleteDoc, setDeleteDoc] = useState<ProjectDocument | null>(null)

  // ==========================================================================
  // FILTERED DOCS
  // ==========================================================================

  const filteredDocs = docs.filter(doc => {
    if (activeCategory !== 'all' && doc.category !== activeCategory) return false
    if (selectedPhase && doc.phase_id !== selectedPhase) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = doc.name.toLowerCase().includes(q)
      const matchDesc = doc.description?.toLowerCase().includes(q)
      if (!matchName && !matchDesc) return false
    }
    return true
  })

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const errors: string[] = []
      const valid = files.filter(f => {
        const err = validateFile(f)
        if (err) { errors.push(err); return false }
        return true
      })
      if (errors.length > 0) setUploadError(errors.join('\n'))
      if (valid.length > 0) {
        setUploadFiles(valid)
        setShowUploadModal(true)
      }
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      const errors: string[] = []
      const valid = files.filter(f => {
        const err = validateFile(f)
        if (err) { errors.push(err); return false }
        return true
      })
      if (errors.length > 0) setUploadError(errors.join('\n'))
      if (valid.length > 0) {
        setUploadFiles(valid)
        setShowUploadModal(true)
      }
    }
    if (e.target) e.target.value = ''
  }

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return
    setUploading(true)
    setUploadError(null)

    try {
      // TODO: Gọi projectDocService.upload() cho mỗi file
      // Giả lập upload
      await new Promise(r => setTimeout(r, 1500))

      const newDocs: ProjectDocument[] = uploadFiles.map((file, idx) => ({
        id: `new-${Date.now()}-${idx}`,
        project_id: projectId || '1',
        phase_id: uploadPhase || null,
        name: file.name,
        description: uploadDescription || null,
        file_url: URL.createObjectURL(file),
        file_path: `${projectId}/${uploadCategory}/${file.name}`,
        file_type: file.name.split('.').pop() || null,
        file_size: file.size,
        version: 1,
        category: uploadCategory,
        uploaded_by: 'e1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase: phases.find(p => p.id === uploadPhase) || null,
        uploader: { id: 'e1', full_name: 'Lê Duy Minh' },
      }))

      setDocs(prev => [...newDocs, ...prev])
      setStats(prev => ({
        ...prev,
        total_files: prev.total_files + newDocs.length,
        total_size: prev.total_size + newDocs.reduce((s, d) => s + d.file_size, 0),
      }))

      // Reset
      setShowUploadModal(false)
      setUploadFiles([])
      setUploadCategory('other')
      setUploadPhase('')
      setUploadDescription('')
    } catch (err: any) {
      setUploadError(err.message || 'Lỗi upload file')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = (doc: ProjectDocument) => {
    // TODO: Gọi projectDocService.getDownloadUrl()
    window.open(doc.file_url, '_blank')
    setActiveMenu(null)
  }

  const handleDelete = async (doc: ProjectDocument) => {
    // TODO: Gọi projectDocService.delete()
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    setDeleteDoc(null)
    setActiveMenu(null)
  }

  const handleViewVersions = (doc: ProjectDocument) => {
    // TODO: Gọi projectDocService.getVersionHistory()
    setVersions(MOCK_VERSIONS)
    setShowVersionHistory(doc.id)
    setActiveMenu(null)
  }

  const handleVersionUpload = (docId: string) => {
    setVersionUploadDocId(docId)
    versionFileInputRef.current?.click()
    setActiveMenu(null)
  }

  const handleVersionFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !versionUploadDocId) return

    // TODO: Gọi projectDocService.updateVersion()
    const doc = docs.find(d => d.id === versionUploadDocId)
    if (doc) {
      setDocs(prev => prev.map(d =>
        d.id === versionUploadDocId
          ? { ...d, version: d.version + 1, file_size: file.size, updated_at: new Date().toISOString() }
          : d
      ))
    }
    setVersionUploadDocId(null)
    if (e.target) e.target.value = ''
  }

  const handleEditSave = async () => {
    if (!editingDoc) return
    // TODO: Gọi projectDocService.update()
    setDocs(prev => prev.map(d =>
      d.id === editingDoc.id
        ? { ...d, name: editName, description: editDescription || null, category: editCategory, updated_at: new Date().toISOString() }
        : d
    ))
    setEditingDoc(null)
  }

  const openEdit = (doc: ProjectDocument) => {
    setEditingDoc(doc)
    setEditName(doc.name)
    setEditDescription(doc.description || '')
    setEditCategory(doc.category || 'other')
    setActiveMenu(null)
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div
      className="min-h-screen bg-[#F7F5F2]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ===== DRAG OVERLAY ===== */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-[#1B4D3E]/20 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 mx-6 text-center border-2 border-dashed border-[#1B4D3E]">
            <UploadCloud className="w-16 h-16 text-[#1B4D3E] mx-auto mb-3" />
            <p className="text-lg font-bold text-[#1B4D3E]">Thả file vào đây</p>
            <p className="text-sm text-gray-500 mt-1">Tối đa 20MB mỗi file</p>
          </div>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Top bar */}
          <div className="flex items-center h-14 gap-3">
            <button
              onClick={() => navigate(projectId ? `/projects/${projectId}` : '/projects/list')}
              className="p-2 -ml-2 rounded-xl active:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[16px] font-bold text-gray-900 truncate">Tài liệu dự án</h1>
            </div>

            {/* Search toggle */}
            <button
              onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery('') }}
              className={`p-2 rounded-xl ${showSearch ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' : 'active:bg-gray-100 text-gray-500'}`}
            >
              {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>

            {/* View toggle */}
            <button
              onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="p-2 rounded-xl active:bg-gray-100 text-gray-500"
            >
              {viewMode === 'grid' ? <List className="w-5 h-5" /> : <Grid3X3 className="w-5 h-5" />}
            </button>
          </div>

          {/* Search bar */}
          {showSearch && (
            <div className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Tìm tài liệu..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[15px] placeholder-gray-400 focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/30"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Stats bar */}
          <div className="flex items-center gap-4 pb-2 text-[12px] text-gray-500 overflow-x-auto scrollbar-hide">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <FolderOpen className="w-3.5 h-3.5" />
              {stats.total_files} file
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <HardDrive className="w-3.5 h-3.5" />
              {formatFileSize(stats.total_size)}
            </span>
            {/* Phase filter */}
            <select
              value={selectedPhase}
              onChange={e => setSelectedPhase(e.target.value)}
              className="ml-auto text-[12px] bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:border-[#2D8B6E]"
            >
              <option value="">Tất cả phases</option>
              {phases.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Category tabs — horizontal scroll */}
          <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-3 scrollbar-hide">
            {CATEGORY_TABS.map(tab => {
              const isActive = activeCategory === tab.key
              const count = tab.key === 'all'
                ? stats.total_files
                : (stats.by_category[tab.key] || 0)

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveCategory(tab.key)}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold
                    whitespace-nowrap transition-colors border
                    ${isActive
                      ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                      : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
                    }
                  `}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span className={`
                      px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none
                      ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}
                    `}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">

        {/* Empty state */}
        {filteredDocs.length === 0 && !loading && (
          <div className="py-16 text-center">
            <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-[15px] font-medium">
              {searchQuery ? 'Không tìm thấy tài liệu' : 'Chưa có tài liệu nào'}
            </p>
            <p className="text-gray-400 text-[13px] mt-1">
              {searchQuery ? 'Thử từ khóa khác' : 'Kéo thả file hoặc nhấn nút + để upload'}
            </p>
          </div>
        )}

        {/* ===== LIST VIEW ===== */}
        {viewMode === 'list' && filteredDocs.length > 0 && (
          <div className="space-y-2">
            {filteredDocs.map(doc => {
              const fi = getFileIcon(doc.file_type)
              const catCfg = getCategoryConfig(doc.category)
              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-xl border border-gray-100 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-start gap-3 p-3.5">
                    {/* File icon */}
                    <div className={`w-10 h-10 rounded-lg ${fi.bg} flex items-center justify-center flex-shrink-0 ${fi.color}`}>
                      {fi.icon}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-gray-900 truncate leading-snug">
                            {doc.name}
                          </p>
                          {doc.description && (
                            <p className="text-[12px] text-gray-500 truncate mt-0.5">
                              {doc.description}
                            </p>
                          )}
                        </div>

                        {/* Actions menu */}
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === doc.id ? null : doc.id) }}
                            className="p-1.5 rounded-lg active:bg-gray-100"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-400" />
                          </button>

                          {activeMenu === doc.id && (
                            <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[180px]">
                              <button
                                onClick={() => handleDownload(doc)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 active:bg-gray-50"
                              >
                                <Download className="w-4 h-4 text-gray-400" /> Tải xuống
                              </button>
                              <button
                                onClick={() => openEdit(doc)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 active:bg-gray-50"
                              >
                                <Edit3 className="w-4 h-4 text-gray-400" /> Sửa thông tin
                              </button>
                              <button
                                onClick={() => handleVersionUpload(doc.id)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 active:bg-gray-50"
                              >
                                <FileUp className="w-4 h-4 text-gray-400" /> Upload phiên bản mới
                              </button>
                              {doc.version > 1 && (
                                <button
                                  onClick={() => handleViewVersions(doc)}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-700 active:bg-gray-50"
                                >
                                  <History className="w-4 h-4 text-gray-400" /> Lịch sử ({doc.version} phiên bản)
                                </button>
                              )}
                              <div className="border-t border-gray-100 my-1" />
                              <button
                                onClick={() => { setDeleteDoc(doc); setActiveMenu(null) }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-red-600 active:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" /> Xóa
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {/* Category badge */}
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                          style={{ backgroundColor: catCfg.color + '15', color: catCfg.color }}
                        >
                          {catCfg.icon} {catCfg.label}
                        </span>

                        {/* Version badge */}
                        {doc.version > 1 && (
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded">
                            v{doc.version}
                          </span>
                        )}

                        {/* Phase */}
                        {doc.phase && (
                          <span className="text-[11px] text-gray-400 truncate max-w-[120px]">
                            {doc.phase.name}
                          </span>
                        )}

                        {/* Size */}
                        <span className="text-[11px] text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {formatFileSize(doc.file_size)}
                        </span>

                        {/* Date */}
                        <span className="text-[11px] text-gray-400 ml-auto whitespace-nowrap">
                          {timeAgo(doc.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ===== GRID VIEW ===== */}
        {viewMode === 'grid' && filteredDocs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredDocs.map(doc => {
              const fi = getFileIcon(doc.file_type)
              const catCfg = getCategoryConfig(doc.category)
              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-xl border border-gray-100 p-3 active:scale-[0.98] transition-transform relative group"
                >
                  {/* File icon large */}
                  <div className={`w-12 h-12 rounded-xl ${fi.bg} flex items-center justify-center mb-2.5 ${fi.color}`}>
                    {React.cloneElement(fi.icon as React.ReactElement, { className: 'w-6 h-6' })}
                  </div>

                  {/* Name */}
                  <p className="text-[13px] font-semibold text-gray-900 truncate leading-snug">{doc.name}</p>

                  {/* Meta */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ backgroundColor: catCfg.color + '15', color: catCfg.color }}
                    >
                      {catCfg.label}
                    </span>
                    {doc.version > 1 && (
                      <span className="text-[9px] font-bold text-blue-500">v{doc.version}</span>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-400 mt-1.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatFileSize(doc.file_size)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(doc.updated_at)}</p>

                  {/* Actions overlay */}
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={() => setActiveMenu(activeMenu === doc.id ? null : doc.id)}
                      className="p-1.5 rounded-lg bg-white/80 active:bg-gray-100 shadow-sm"
                    >
                      <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
                    </button>

                    {activeMenu === doc.id && (
                      <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[160px]">
                        <button onClick={() => handleDownload(doc)} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-gray-700 active:bg-gray-50">
                          <Download className="w-3.5 h-3.5" /> Tải xuống
                        </button>
                        <button onClick={() => openEdit(doc)} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-gray-700 active:bg-gray-50">
                          <Edit3 className="w-3.5 h-3.5" /> Sửa
                        </button>
                        <button onClick={() => handleVersionUpload(doc.id)} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-gray-700 active:bg-gray-50">
                          <FileUp className="w-3.5 h-3.5" /> Version mới
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                        <button onClick={() => { setDeleteDoc(doc); setActiveMenu(null) }} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-600 active:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" /> Xóa
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== FAB — Quick Upload ===== */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="fixed bottom-6 right-6 z-20 w-14 h-14 bg-[#1B4D3E] text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={versionFileInputRef}
        type="file"
        className="hidden"
        onChange={handleVersionFileSelect}
      />

      {/* ===== UPLOAD MODAL ===== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !uploading && setShowUploadModal(false)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-[16px] font-bold text-gray-900">Upload tài liệu</h2>
              <button onClick={() => !uploading && setShowUploadModal(false)} className="p-1.5 rounded-lg active:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Files list */}
              <div>
                <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Files ({uploadFiles.length})</label>
                <div className="mt-2 space-y-2">
                  {uploadFiles.map((file, idx) => {
                    const ext = file.name.split('.').pop()?.toLowerCase() || ''
                    const fi = FILE_ICON_MAP[ext] || DEFAULT_FILE_ICON
                    return (
                      <div key={idx} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                        <div className={`w-8 h-8 rounded-lg ${fi.bg} flex items-center justify-center ${fi.color}`}>
                          {React.cloneElement(fi.icon as React.ReactElement, { className: 'w-4 h-4' })}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-800 truncate">{file.name}</p>
                          <p className="text-[11px] text-gray-400">{formatFileSize(file.size)}</p>
                        </div>
                        <button
                          onClick={() => setUploadFiles(f => f.filter((_, i) => i !== idx))}
                          className="p-1 rounded active:bg-gray-200"
                        >
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Loại tài liệu</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CATEGORY_TABS.filter(t => t.key !== 'all').map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setUploadCategory(tab.key as DocCategory)}
                      className={`
                        inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] font-medium border
                        ${uploadCategory === tab.key
                          ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                          : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'}
                      `}
                    >
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phase */}
              <div>
                <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Giai đoạn (tùy chọn)</label>
                <select
                  value={uploadPhase}
                  onChange={e => setUploadPhase(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[15px] text-gray-700 focus:outline-none focus:border-[#2D8B6E]"
                >
                  <option value="">— Không chọn —</option>
                  {phases.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Mô tả (tùy chọn)</label>
                <textarea
                  value={uploadDescription}
                  onChange={e => setUploadDescription(e.target.value)}
                  rows={2}
                  placeholder="Mô tả ngắn về tài liệu..."
                  className="w-full mt-1.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[15px] text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#2D8B6E] resize-none"
                />
              </div>

              {/* Error */}
              {uploadError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[13px] text-red-600 whitespace-pre-line">{uploadError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
              <button
                onClick={() => !uploading && setShowUploadModal(false)}
                disabled={uploading}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || uploadFiles.length === 0}
                className="flex-1 py-3 rounded-xl bg-[#1B4D3E] text-white text-[14px] font-semibold active:bg-[#15402F] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Đang upload...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload ({uploadFiles.length} file)</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== VERSION HISTORY DRAWER ===== */}
      {showVersionHistory && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowVersionHistory(null)} />
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[70vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-[16px] font-bold text-gray-900">Lịch sử phiên bản</h2>
              <button onClick={() => setShowVersionHistory(null)} className="p-1.5 rounded-lg active:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="px-5 py-4">
              {/* Current version */}
              {(() => {
                const doc = docs.find(d => d.id === showVersionHistory)
                if (!doc) return null
                return (
                  <div className="flex items-start gap-3 p-3 bg-[#1B4D3E]/5 rounded-xl border border-[#1B4D3E]/20 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-[#1B4D3E] text-white flex items-center justify-center text-[12px] font-bold">
                      v{doc.version}
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-gray-800">Phiên bản hiện tại</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {formatFileSize(doc.file_size)} • {formatDateTime(doc.updated_at)}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {doc.uploader?.full_name}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="p-2 rounded-lg active:bg-gray-100"
                    >
                      <Download className="w-4 h-4 text-[#1B4D3E]" />
                    </button>
                  </div>
                )
              })()}

              {/* Previous versions */}
              <div className="space-y-3">
                {versions.map(v => (
                  <div key={v.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 text-gray-600 flex items-center justify-center text-[12px] font-bold">
                      v{v.version}
                    </div>
                    <div className="flex-1">
                      {v.notes && <p className="text-[12px] text-gray-700">{v.notes}</p>}
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {formatFileSize(v.file_size)} • {formatDateTime(v.created_at)}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {v.uploader?.full_name}
                      </p>
                    </div>
                    <button
                      onClick={() => window.open(v.file_url, '_blank')}
                      className="p-2 rounded-lg active:bg-gray-200"
                    >
                      <Download className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== EDIT MODAL ===== */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingDoc(null)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-[16px] font-bold text-gray-900">Sửa thông tin</h2>
              <button onClick={() => setEditingDoc(null)} className="p-1.5 rounded-lg active:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Tên file</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[15px] focus:outline-none focus:border-[#2D8B6E]"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Mô tả</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full mt-1.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[15px] focus:outline-none focus:border-[#2D8B6E] resize-none"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Loại tài liệu</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CATEGORY_TABS.filter(t => t.key !== 'all').map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setEditCategory(tab.key as DocCategory)}
                      className={`
                        inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] font-medium border
                        ${editCategory === tab.key
                          ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                          : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'}
                      `}
                    >
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setEditingDoc(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600 active:bg-gray-50">
                Hủy
              </button>
              <button onClick={handleEditSave} className="flex-1 py-3 rounded-xl bg-[#1B4D3E] text-white text-[14px] font-semibold active:bg-[#15402F] flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRM ===== */}
      {deleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteDoc(null)} />
          <div className="relative bg-white mx-6 rounded-2xl shadow-xl max-w-sm w-full p-5">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-[16px] font-bold text-gray-900">Xóa tài liệu?</h3>
              <p className="text-[13px] text-gray-500 mt-1">
                "{deleteDoc.name}" sẽ bị xóa vĩnh viễn khỏi hệ thống.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteDoc(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600 active:bg-gray-50">
                Hủy
              </button>
              <button onClick={() => handleDelete(deleteDoc)} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[14px] font-semibold active:bg-red-600">
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menus */}
      {activeMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
      )}
    </div>
  )
}