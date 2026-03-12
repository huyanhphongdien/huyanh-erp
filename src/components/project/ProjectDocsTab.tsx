// ============================================================================
// FILE: src/components/project/ProjectDocsTab.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PM8: Tab Tài liệu (Real Supabase data)
// ============================================================================
// Schema: version=integer, file_url=NOT NULL, name=NOT NULL
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, Plus, FileText, Image, FileSpreadsheet, File, Archive,
  Download, Trash2, MoreVertical, Search, X, FolderOpen, HardDrive,
  UploadCloud, Grid3X3, List, Edit3, Check, AlertCircle, Loader2, FileUp,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import projectDocumentService from '../../services/project/projectDocumentService'
import type { ProjectDocument, DocCategory } from '../../services/project/projectDocumentService'

// ============================================================================
// TYPES
// ============================================================================

interface Phase { id: string; name: string }
interface ProjectDocsTabProps { projectId: string; phases: Phase[] }

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORIES: { key: DocCategory | 'all'; label: string; icon: string; color: string }[] = [
  { key: 'all',      label: 'Tất cả',    icon: '📂', color: '#1B4D3E' },
  { key: 'plan',     label: 'Kế hoạch',  icon: '📋', color: '#3B82F6' },
  { key: 'report',   label: 'Báo cáo',   icon: '📊', color: '#10B981' },
  { key: 'minutes',  label: 'Biên bản',  icon: '📝', color: '#F59E0B' },
  { key: 'contract', label: 'Hợp đồng',  icon: '📜', color: '#8B5CF6' },
  { key: 'design',   label: 'Thiết kế',  icon: '📐', color: '#EC4899' },
  { key: 'other',    label: 'Khác',      icon: '📁', color: '#6B7280' },
]

const FILE_ICONS: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
  pdf:  { icon: <FileText className="w-5 h-5" />,        bg: 'bg-red-50',    color: 'text-red-600' },
  doc:  { icon: <FileText className="w-5 h-5" />,        bg: 'bg-blue-50',   color: 'text-blue-600' },
  docx: { icon: <FileText className="w-5 h-5" />,        bg: 'bg-blue-50',   color: 'text-blue-600' },
  xls:  { icon: <FileSpreadsheet className="w-5 h-5" />, bg: 'bg-green-50',  color: 'text-green-600' },
  xlsx: { icon: <FileSpreadsheet className="w-5 h-5" />, bg: 'bg-green-50',  color: 'text-green-600' },
  ppt:  { icon: <FileText className="w-5 h-5" />,        bg: 'bg-orange-50', color: 'text-orange-600' },
  pptx: { icon: <FileText className="w-5 h-5" />,        bg: 'bg-orange-50', color: 'text-orange-600' },
  jpg:  { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  jpeg: { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  png:  { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  gif:  { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  webp: { icon: <Image className="w-5 h-5" />,           bg: 'bg-purple-50', color: 'text-purple-600' },
  svg:  { icon: <Image className="w-5 h-5" />,           bg: 'bg-pink-50',   color: 'text-pink-600' },
  zip:  { icon: <Archive className="w-5 h-5" />,         bg: 'bg-amber-50',  color: 'text-amber-700' },
  rar:  { icon: <Archive className="w-5 h-5" />,         bg: 'bg-amber-50',  color: 'text-amber-700' },
  csv:  { icon: <FileSpreadsheet className="w-5 h-5" />, bg: 'bg-teal-50',   color: 'text-teal-600' },
}
const DEFAULT_ICON = { icon: <File className="w-5 h-5" />, bg: 'bg-gray-50', color: 'text-gray-500' }
const MAX_FILE_SIZE = 20 * 1024 * 1024

// ============================================================================
// HELPERS
// ============================================================================

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function ago(s: string): string {
  const ms = Date.now() - new Date(s).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'Vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} ngày trước`
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getIcon(fileName: string | null) {
  if (!fileName) return DEFAULT_ICON
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || DEFAULT_ICON
}

function getCat(c: string | null) {
  return CATEGORIES.find(x => x.key === c) || CATEGORIES[CATEGORIES.length - 1]
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ProjectDocsTab: React.FC<ProjectDocsTabProps> = ({ projectId, phases }) => {
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const versionInputRef = useRef<HTMLInputElement>(null)

  // Data
  const [docs, setDocs] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [activeCat, setActiveCat] = useState<DocCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [phaseFilter, setPhaseFilter] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  // Upload
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadCat, setUploadCat] = useState<DocCategory>('other')
  const [uploadPhase, setUploadPhase] = useState('')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Actions
  const [menuId, setMenuId] = useState<string | null>(null)
  const [versionDocId, setVersionDocId] = useState<string | null>(null)
  const [editDoc, setEditDoc] = useState<ProjectDocument | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editCat, setEditCat] = useState<DocCategory>('other')
  const [delDoc, setDelDoc] = useState<ProjectDocument | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on click outside (no backdrop needed)
  useEffect(() => {
    if (!menuId) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuId])

  // ==========================================================================
  // LOAD DATA
  // ==========================================================================

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      setDocs(await projectDocumentService.getByProject(projectId))
    } catch (err) {
      console.error('[DocsTab] Load failed:', err)
    } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { loadDocs() }, [loadDocs])

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  const filtered = docs.filter(d => {
    if (activeCat !== 'all' && d.category !== activeCat) return false
    if (phaseFilter && d.phase_id !== phaseFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!d.name.toLowerCase().includes(q) && !(d.description || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalSize = docs.reduce((s, d) => s + (d.file_size || 0), 0)
  const catCounts: Record<string, number> = {}
  docs.forEach(d => { const c = d.category || 'other'; catCounts[c] = (catCounts[c] || 0) + 1 })

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false) }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.size <= MAX_FILE_SIZE)
    if (files.length) { setUploadFiles(files); setShowUpload(true) }
  }, [])

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.size <= MAX_FILE_SIZE)
    if (files.length) { setUploadFiles(files); setShowUpload(true) }
    if (e.target) e.target.value = ''
  }

  // Upload → Supabase Storage + DB
  const doUpload = async () => {
    if (!uploadFiles.length) return
    setUploading(true); setUploadError(null)
    try {
      for (const file of uploadFiles) {
        await projectDocumentService.upload({
          project_id: projectId,
          file,
          category: uploadCat,
          description: uploadDesc || undefined,
          version: 1,                                // integer
          phase_id: uploadPhase || null,
          uploaded_by: user?.employee_id || null,
        })
      }
      await loadDocs()
      setShowUpload(false); setUploadFiles([]); setUploadCat('other'); setUploadPhase(''); setUploadDesc('')
    } catch (err: any) {
      setUploadError(err.message || 'Lỗi upload')
    } finally { setUploading(false) }
  }

  // Download — dùng file_url (NOT NULL, luôn có)
  const doDownload = (d: ProjectDocument) => {
    console.log('[DocsTab] ▶ doDownload:', d.name, d.file_url)
    window.open(d.file_url, '_blank')
    setMenuId(null)
  }

  // Soft delete
  const doDelete = async (d: ProjectDocument) => {
    console.log('[DocsTab] ▶ doDelete:', d.name)
    try {
      await projectDocumentService.delete(d.id)
      setDocs(prev => prev.filter(x => x.id !== d.id))
    } catch (err) { console.error('Delete failed:', err) }
    setDelDoc(null); setMenuId(null)
  }

  // Version upload — tạo doc mới với version + 1
  const doVersionUpload = (docId: string) => {
    console.log('[DocsTab] ▶ doVersionUpload:', docId)
    setVersionDocId(docId); versionInputRef.current?.click(); setMenuId(null)
  }

  const onVersionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && versionDocId) {
      const existing = docs.find(d => d.id === versionDocId)
      if (existing) {
        try {
          await projectDocumentService.upload({
            project_id: projectId,
            file: f,
            category: (existing.category as DocCategory) || 'other',
            description: existing.description || undefined,
            version: (existing.version || 1) + 1,     // integer + 1
            phase_id: existing.phase_id || null,
            uploaded_by: user?.employee_id || null,
          })
          await loadDocs()
        } catch (err) { console.error('Version upload failed:', err) }
      }
    }
    setVersionDocId(null)
    if (e.target) e.target.value = ''
  }

  // Edit metadata
  const openEdit = (d: ProjectDocument) => {
    console.log('[DocsTab] ▶ openEdit:', d.name)
    setEditDoc(d); setEditDesc(d.description || ''); setEditCat((d.category as DocCategory) || 'other'); setMenuId(null)
  }

  const saveEdit = async () => {
    if (!editDoc) return
    try {
      await projectDocumentService.update(editDoc.id, { description: editDesc || null, category: editCat })
      await loadDocs()
    } catch (err) { console.error('Edit failed:', err) }
    setEditDoc(null)
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className="relative">

      {/* DRAG OVERLAY */}
      {dragOver && (
        <div className="absolute inset-0 z-30 bg-[#1B4D3E]/10 backdrop-blur-sm rounded-xl border-2 border-dashed border-[#1B4D3E] flex items-center justify-center">
          <div className="text-center">
            <UploadCloud className="w-12 h-12 text-[#1B4D3E] mx-auto mb-2" />
            <p className="text-[14px] font-bold text-[#1B4D3E]">Thả file vào đây</p>
          </div>
        </div>
      )}

      {/* TOOLBAR */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-[#1B4D3E] text-white rounded-xl text-[13px] font-semibold active:bg-[#15402F]">
          <Plus className="w-4 h-4" /> Upload
        </button>
        <span className="text-[12px] text-gray-400 inline-flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5" /> {docs.length} file</span>
        <span className="text-[12px] text-gray-400 inline-flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> {fmtSize(totalSize)}</span>
        <div className="flex-1" />
        <button onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearch('') }}
          className={`p-2 rounded-lg ${showSearch ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' : 'text-gray-400 active:bg-gray-100'}`}>
          {showSearch ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>
        <button onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')} className="p-2 rounded-lg text-gray-400 active:bg-gray-100">
          {viewMode === 'list' ? <Grid3X3 className="w-4 h-4" /> : <List className="w-4 h-4" />}
        </button>
        <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)}
          className="text-[12px] bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:border-[#2D8B6E]">
          <option value="">Phases</option>
          {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* SEARCH */}
      {showSearch && (
        <div className="mb-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tài liệu..."
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-[14px] placeholder-gray-400 focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/30" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-gray-400" /></button>}
        </div>
      )}

      {/* CATEGORY CHIPS */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-4 -mx-1 px-1">
        {CATEGORIES.map(tab => {
          const active = activeCat === tab.key
          const cnt = tab.key === 'all' ? docs.length : (catCounts[tab.key] || 0)
          return (
            <button key={tab.key} onClick={() => setActiveCat(tab.key as any)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors
                ${active ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'}`}>
              {tab.icon} {tab.label}
              {cnt > 0 && <span className={`px-1 py-0.5 rounded-full text-[9px] font-bold leading-none ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{cnt}</span>}
            </button>
          )
        })}
      </div>

      {/* LOADING */}
      {loading && <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

      {/* EMPTY */}
      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center">
          <FolderOpen className="w-14 h-14 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] text-gray-500 font-medium">{search ? 'Không tìm thấy tài liệu' : 'Chưa có tài liệu'}</p>
          <p className="text-[12px] text-gray-400 mt-1">Kéo thả file hoặc nhấn Upload để thêm</p>
        </div>
      )}

      {/* LIST VIEW */}
      {!loading && viewMode === 'list' && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(doc => {
            const fi = getIcon(doc.name)
            const cat = getCat(doc.category)
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-100 active:scale-[0.99] transition-transform">
                <div className="flex items-start gap-3 p-3">
                  <div className={`w-10 h-10 rounded-lg ${fi.bg} flex items-center justify-center shrink-0 ${fi.color}`}>{fi.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1.5">
                      <p className="text-[13px] font-semibold text-gray-900 truncate leading-snug">{doc.name}</p>
                      <div className="relative shrink-0" ref={menuId === doc.id ? menuRef : undefined}>
                        <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === doc.id ? null : doc.id) }} className="p-1 rounded-lg active:bg-gray-100">
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </button>
                        {menuId === doc.id && (
                          <div className="absolute right-0 top-7 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[170px]">
                            <MenuBtn icon={<Download className="w-4 h-4" />} label="Tải xuống" onClick={() => doDownload(doc)} />
                            <MenuBtn icon={<Edit3 className="w-4 h-4" />} label="Sửa thông tin" onClick={() => openEdit(doc)} />
                            <MenuBtn icon={<FileUp className="w-4 h-4" />} label="Version mới" onClick={() => doVersionUpload(doc.id)} />
                            <div className="border-t border-gray-100 my-0.5" />
                            <MenuBtn icon={<Trash2 className="w-4 h-4" />} label="Xóa" onClick={() => { setDelDoc(doc); setMenuId(null) }} danger />
                          </div>
                        )}
                      </div>
                    </div>
                    {doc.description && <p className="text-[11px] text-gray-500 truncate mt-0.5">{doc.description}</p>}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: cat.color + '15', color: cat.color }}>{cat.icon} {cat.label}</span>
                      {doc.version > 1 && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded">v{doc.version}</span>
                      )}
                      {doc.phase && <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{doc.phase.name}</span>}
                      <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtSize(doc.file_size)}</span>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{ago(doc.uploaded_at || doc.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* GRID VIEW */}
      {!loading && viewMode === 'grid' && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {filtered.map(doc => {
            const fi = getIcon(doc.name)
            const cat = getCat(doc.category)
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-100 p-3 active:scale-[0.98] transition-transform relative">
                <div className={`w-11 h-11 rounded-xl ${fi.bg} flex items-center justify-center mb-2 ${fi.color}`}>
                  {React.cloneElement(fi.icon as React.ReactElement, { className: 'w-5.5 h-5.5' })}
                </div>
                <p className="text-[12px] font-semibold text-gray-900 truncate">{doc.name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="px-1 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: cat.color + '15', color: cat.color }}>{cat.label}</span>
                  {doc.version > 1 && <span className="text-[9px] font-bold text-blue-500">v{doc.version}</span>}
                </div>
                <p className="text-[10px] text-gray-400 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtSize(doc.file_size)}</p>
                <p className="text-[10px] text-gray-400">{ago(doc.uploaded_at || doc.created_at)}</p>
                <div className="absolute top-2 right-2" ref={menuId === doc.id ? menuRef : undefined}>
                  <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === doc.id ? null : doc.id) }} className="p-1 rounded-lg bg-white/80 shadow-sm active:bg-gray-100">
                    <MoreVertical className="w-3 h-3 text-gray-400" />
                  </button>
                  {menuId === doc.id && (
                    <div className="absolute right-0 top-7 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                      <MenuBtn icon={<Download className="w-3.5 h-3.5" />} label="Tải" onClick={() => doDownload(doc)} small />
                      <MenuBtn icon={<Edit3 className="w-3.5 h-3.5" />} label="Sửa" onClick={() => openEdit(doc)} small />
                      <MenuBtn icon={<FileUp className="w-3.5 h-3.5" />} label="Version" onClick={() => doVersionUpload(doc.id)} small />
                      <div className="border-t border-gray-100 my-0.5" />
                      <MenuBtn icon={<Trash2 className="w-3.5 h-3.5" />} label="Xóa" onClick={() => { setDelDoc(doc); setMenuId(null) }} danger small />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* HIDDEN INPUTS */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileSelect}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip,.rar,.csv" />
      <input ref={versionInputRef} type="file" className="hidden" onChange={onVersionFile} />

      {/* UPLOAD MODAL */}
      {showUpload && (
        <Modal onClose={() => !uploading && setShowUpload(false)}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-gray-900">Upload tài liệu</h2>
            <button onClick={() => !uploading && setShowUpload(false)} className="p-1.5 rounded-lg active:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>Files ({uploadFiles.length})</Label>
              <div className="mt-1.5 space-y-1.5">
                {uploadFiles.map((f, i) => {
                  const fi = getIcon(f.name)
                  return (
                    <div key={i} className="flex items-center gap-2.5 p-2 bg-gray-50 rounded-lg">
                      <div className={`w-7 h-7 rounded ${fi.bg} flex items-center justify-center ${fi.color}`}>
                        {React.cloneElement(fi.icon as React.ReactElement, { className: 'w-3.5 h-3.5' })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-gray-800 truncate">{f.name}</p>
                        <p className="text-[10px] text-gray-400">{fmtSize(f.size)}</p>
                      </div>
                      <button onClick={() => setUploadFiles(arr => arr.filter((_, j) => j !== i))} className="p-1 active:bg-gray-200 rounded"><X className="w-3.5 h-3.5 text-gray-400" /></button>
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <Label>Loại tài liệu</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {CATEGORIES.filter(t => t.key !== 'all').map(t => (
                  <button key={t.key} onClick={() => setUploadCat(t.key as DocCategory)}
                    className={`px-3 py-2 rounded-lg text-[12px] font-medium border ${uploadCat === t.key ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'}`}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Giai đoạn (tùy chọn)</Label>
              <select value={uploadPhase} onChange={e => setUploadPhase(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:border-[#2D8B6E]">
                <option value="">— Không chọn —</option>
                {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Mô tả (tùy chọn)</Label>
              <textarea value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} rows={2} placeholder="Mô tả ngắn..."
                className="w-full mt-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[14px] placeholder-gray-400 focus:outline-none focus:border-[#2D8B6E] resize-none" />
            </div>
            {uploadError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-600">{uploadError}</p>
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <button onClick={() => !uploading && setShowUpload(false)} disabled={uploading}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600 disabled:opacity-50">Hủy</button>
            <button onClick={doUpload} disabled={uploading || !uploadFiles.length}
              className="flex-1 py-3 rounded-xl bg-[#1B4D3E] text-white text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang upload...</> : <><Upload className="w-4 h-4" /> Upload</>}
            </button>
          </div>
        </Modal>
      )}

      {/* EDIT MODAL */}
      {editDoc && (
        <Modal onClose={() => setEditDoc(null)}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-gray-900">Sửa thông tin</h2>
            <button onClick={() => setEditDoc(null)} className="p-1.5 rounded-lg active:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2.5 p-2 bg-gray-50 rounded-lg">
              {(() => { const fi = getIcon(editDoc.name); return <div className={`w-8 h-8 rounded ${fi.bg} flex items-center justify-center ${fi.color}`}>{fi.icon}</div> })()}
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-gray-800 truncate">{editDoc.name}</p>
                <p className="text-[10px] text-gray-400">{fmtSize(editDoc.file_size)} • v{editDoc.version}</p>
              </div>
            </div>
            <div>
              <Label>Mô tả</Label>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
                className="w-full mt-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:border-[#2D8B6E] resize-none" />
            </div>
            <div>
              <Label>Loại</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {CATEGORIES.filter(t => t.key !== 'all').map(t => (
                  <button key={t.key} onClick={() => setEditCat(t.key as DocCategory)}
                    className={`px-2.5 py-1.5 rounded-lg text-[12px] font-medium border ${editCat === t.key ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'bg-white text-gray-600 border-gray-200'}`}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <button onClick={() => setEditDoc(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600">Hủy</button>
            <button onClick={saveEdit} className="flex-1 py-3 rounded-xl bg-[#1B4D3E] text-white text-[14px] font-semibold flex items-center justify-center gap-2">
              <Check className="w-4 h-4" /> Lưu
            </button>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRM */}
      {delDoc && (
        <Modal onClose={() => setDelDoc(null)} small>
          <div className="p-5 text-center">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3"><Trash2 className="w-6 h-6 text-red-500" /></div>
            <h3 className="text-[16px] font-bold text-gray-900">Xóa tài liệu?</h3>
            <p className="text-[13px] text-gray-500 mt-1">"{delDoc.name}" sẽ bị xóa.</p>
          </div>
          <div className="px-5 pb-5 flex gap-3">
            <button onClick={() => setDelDoc(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600">Hủy</button>
            <button onClick={() => doDelete(delDoc)} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[14px] font-semibold">Xóa</button>
          </div>
        </Modal>
      )}

    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{children}</span>
)

const MenuBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; small?: boolean }> = ({ icon, label, onClick, danger, small }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick() }}
    className={`w-full flex items-center gap-2 ${small ? 'px-3 py-2 text-[11px]' : 'px-3.5 py-2.5 text-[13px]'} ${danger ? 'text-red-600 active:bg-red-50' : 'text-gray-700 active:bg-gray-50'}`}>
    <span className="text-gray-400">{icon}</span> {label}
  </button>
)

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; small?: boolean }> = ({ children, onClose, small }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
    <div className="absolute inset-0 bg-black/40" onClick={onClose} />
    <div className={`relative bg-white w-full ${small ? 'sm:max-w-sm mx-6 sm:mx-auto rounded-2xl' : 'sm:max-w-lg sm:rounded-2xl rounded-t-2xl'} shadow-xl`}>{children}</div>
  </div>
)

export default ProjectDocsTab