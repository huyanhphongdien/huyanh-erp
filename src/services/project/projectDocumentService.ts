// ============================================================================
// FILE: src/services/project/projectDocumentService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PM8: Tài liệu dự án — Supabase Storage + Database
// ============================================================================
// Schema khớp bảng project_documents:
//   id (uuid PK), project_id (uuid NOT NULL), phase_id (uuid),
//   name (varchar NOT NULL), description (text), file_url (text NOT NULL),
//   file_type (varchar), file_size (bigint), version (integer default 1),
//   category (varchar), previous_version_id (uuid), uploaded_by (uuid),
//   created_at (timestamptz), updated_at (timestamptz), file_path (text),
//   is_deleted (boolean default false), deleted_at (timestamptz),
//   uploaded_at (timestamptz default now()), tags (array)
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type DocCategory = 'plan' | 'report' | 'minutes' | 'contract' | 'design' | 'other'

export interface ProjectDocument {
  id: string
  project_id: string
  phase_id: string | null
  name: string                          // tên file gốc (NOT NULL)
  description: string | null
  file_url: string                      // public URL (NOT NULL)
  file_path: string | null              // path trên Storage
  file_type: string | null              // extension: pdf, xlsx, png...
  file_size: number                     // bigint
  version: number                       // integer, default 1
  category: string | null
  previous_version_id: string | null
  uploaded_by: string | null
  uploaded_at: string | null
  is_deleted: boolean
  tags: string[] | null
  created_at: string
  updated_at: string
  // Joined client-side
  uploader?: { id: string; full_name: string }
  phase?: { id: string; name: string }
}

export interface UploadDocParams {
  project_id: string
  file: File
  category?: DocCategory
  description?: string
  version?: number
  phase_id?: string | null
  tags?: string[]
  uploaded_by?: string | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BUCKET = 'project-documents'

export const DOC_CATEGORIES: Record<DocCategory, { label: string; color: string; icon: string }> = {
  plan:     { label: 'Kế hoạch',  color: '#3B82F6', icon: '📋' },
  report:   { label: 'Báo cáo',   color: '#10B981', icon: '📊' },
  minutes:  { label: 'Biên bản',  color: '#F59E0B', icon: '📝' },
  contract: { label: 'Hợp đồng',  color: '#8B5CF6', icon: '📜' },
  design:   { label: 'Thiết kế',  color: '#EC4899', icon: '📐' },
  other:    { label: 'Khác',      color: '#6B7280', icon: '📁' },
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

// ============================================================================
// HELPERS
// ============================================================================

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================================================
// SERVICE
// ============================================================================

export const projectDocumentService = {
  // --------------------------------------------------------------------------
  // LIST
  // --------------------------------------------------------------------------
  async getByProject(projectId: string): Promise<ProjectDocument[]> {
    const { data, error } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId)
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('created_at', { ascending: false })

    if (error) throw error

    const docs = (data || []) as ProjectDocument[]
    if (docs.length === 0) return []

    // Client-side join: uploader + phase
    const uploaderIds = new Set<string>()
    const phaseIds = new Set<string>()
    docs.forEach(d => {
      if (d.uploaded_by) uploaderIds.add(d.uploaded_by)
      if (d.phase_id) phaseIds.add(d.phase_id)
    })

    const [empRes, phaseRes] = await Promise.all([
      uploaderIds.size > 0
        ? supabase.from('employees').select('id, full_name').in('id', Array.from(uploaderIds))
        : { data: [] },
      phaseIds.size > 0
        ? supabase.from('project_phases').select('id, name').in('id', Array.from(phaseIds))
        : { data: [] },
    ])

    const empMap = new Map((empRes.data || []).map((e: any) => [e.id, e]))
    const phaseMap = new Map((phaseRes.data || []).map((p: any) => [p.id, p]))

    return docs.map(d => ({
      ...d,
      uploader: d.uploaded_by ? empMap.get(d.uploaded_by) : undefined,
      phase: d.phase_id ? phaseMap.get(d.phase_id) : undefined,
    }))
  },

  // --------------------------------------------------------------------------
  // UPLOAD
  // --------------------------------------------------------------------------
  async upload(params: UploadDocParams): Promise<ProjectDocument> {
    const { project_id, file, category, description, version, phase_id, tags, uploaded_by } = params

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File quá lớn. Tối đa ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
    }

    // 1. Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'bin'
    const storagePath = `${project_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file)

    if (uploadError) throw new Error(`Upload thất bại: ${uploadError.message}`)

    // 2. Get public URL (file_url is NOT NULL)
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

    // 3. Insert DB record — khớp schema
    const { data, error } = await supabase
      .from('project_documents')
      .insert({
        project_id,
        name: file.name,                        // varchar NOT NULL
        description: description || null,
        file_url: urlData.publicUrl,             // text NOT NULL
        file_path: storagePath,                  // text
        file_type: ext,                          // varchar
        file_size: file.size,                    // bigint
        version: version || 1,                   // integer (NOT string!)
        category: category || 'other',           // varchar
        phase_id: phase_id || null,
        tags: tags || null,                      // ARRAY
        uploaded_by: uploaded_by || null,
        uploaded_at: new Date().toISOString(),
        is_deleted: false,
      })
      .select()
      .single()

    if (error) {
      // Rollback: xóa file đã upload
      await supabase.storage.from(BUCKET).remove([storagePath])
      throw error
    }

    return data as ProjectDocument
  },

  // --------------------------------------------------------------------------
  // UPDATE metadata
  // --------------------------------------------------------------------------
  async update(id: string, updates: {
    category?: DocCategory
    description?: string | null
    version?: number
    phase_id?: string | null
    tags?: string[] | null
  }): Promise<ProjectDocument> {
    const { data, error } = await supabase
      .from('project_documents')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as ProjectDocument
  },

  // --------------------------------------------------------------------------
  // SOFT DELETE
  // --------------------------------------------------------------------------
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('project_documents')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // GET PUBLIC URL from file_path
  // --------------------------------------------------------------------------
  getPublicUrl(filePath: string): string {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
    return data.publicUrl
  },
}

export default projectDocumentService