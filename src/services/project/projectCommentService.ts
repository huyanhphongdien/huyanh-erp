// ============================================================================
// PROJECT COMMENT SERVICE — Bình luận dự án + @mention
// File: src/services/project/projectCommentService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectComment {
  id: string
  project_id: string
  content: string
  author_id: string
  parent_comment_id: string | null
  mentioned_ids: string[]
  is_edited: boolean
  edited_at: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
  author?: {
    id: string
    full_name: string
    avatar_url?: string | null
  } | null
  replies?: ProjectComment[]
}

export interface MentionableUser {
  id: string
  full_name: string
  avatar_url?: string | null
  department_name?: string
}

// ============================================================================
// HELPERS
// ============================================================================

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return 'Vừa xong'
  if (diffMinutes < 60) return `${diffMinutes} phút trước`
  if (diffHours < 24) return `${diffHours} giờ trước`
  if (diffDays === 1) return 'Hôm qua'
  if (diffDays < 7) return `${diffDays} ngày trước`
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Parse @mentions from content text, return array of employee IDs */
export function parseMentions(content: string, users: MentionableUser[]): string[] {
  const mentionRegex = /@(\S+(?:\s\S+)?)/g
  const mentioned: string[] = []
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(content)) !== null) {
    const mentionText = match[1]
    // Find user whose name matches
    const user = users.find(u =>
      u.full_name.toLowerCase() === mentionText.toLowerCase() ||
      u.full_name.toLowerCase().startsWith(mentionText.toLowerCase())
    )
    if (user && !mentioned.includes(user.id)) {
      mentioned.push(user.id)
    }
  }
  return mentioned
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/** Lấy danh sách người có thể tag (thành viên dự án + NV cùng phòng ban) */
export async function getMentionableUsers(projectId: string): Promise<MentionableUser[]> {
  try {
    // Get project members
    const { data: members } = await supabase
      .from('project_members')
      .select('employee_id')
      .eq('project_id', projectId)

    const memberIds = (members || []).map(m => m.employee_id)

    // Get project owner
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, department_id')
      .eq('id', projectId)
      .single()

    if (project?.owner_id && !memberIds.includes(project.owner_id)) {
      memberIds.push(project.owner_id)
    }

    // Get department employees + project members
    let query = supabase
      .from('employees')
      .select('id, full_name, avatar_url, departments:department_id(name)')
      .eq('status', 'active')
      .order('full_name')

    if (project?.department_id) {
      // All from same dept + project members
      query = query.or(`department_id.eq.${project.department_id}${memberIds.length ? ',id.in.(${memberIds.join(",")})' : ''}`)
    } else if (memberIds.length) {
      query = query.in('id', memberIds)
    }

    const { data: employees } = await query.limit(50)

    return (employees || []).map((e: any) => ({
      id: e.id,
      full_name: e.full_name,
      avatar_url: e.avatar_url,
      department_name: Array.isArray(e.departments) ? e.departments[0]?.name : e.departments?.name,
    }))
  } catch (e) {
    console.error('[projectCommentService] getMentionableUsers error:', e)
    return []
  }
}

/** Lấy comments của dự án */
export async function getComments(projectId: string): Promise<ProjectComment[]> {
  try {
    const { data, error } = await supabase
      .from('project_comments')
      .select(`*, author:employees!project_comments_author_id_fkey(id, full_name, avatar_url)`)
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })

    if (error) throw error

    const comments = (data || []).map((item: any) => ({
      ...item,
      author: Array.isArray(item.author) ? item.author[0] : item.author,
    }))

    // Build tree
    const roots: ProjectComment[] = []
    const repliesMap: Record<string, ProjectComment[]> = {}

    comments.forEach((c: ProjectComment) => {
      if (c.parent_comment_id) {
        if (!repliesMap[c.parent_comment_id]) repliesMap[c.parent_comment_id] = []
        repliesMap[c.parent_comment_id].push(c)
      } else {
        roots.push(c)
      }
    })

    return roots.map(c => ({ ...c, replies: repliesMap[c.id] || [] }))
  } catch (e) {
    console.error('[projectCommentService] getComments error:', e)
    return []
  }
}

/** Tạo comment mới */
export async function createComment(input: {
  project_id: string
  content: string
  author_id: string
  parent_comment_id?: string | null
  mentioned_ids?: string[]
}): Promise<ProjectComment | null> {
  try {
    if (!input.content.trim()) return null

    const { data, error } = await supabase
      .from('project_comments')
      .insert({
        project_id: input.project_id,
        content: input.content.trim(),
        author_id: input.author_id,
        parent_comment_id: input.parent_comment_id || null,
        mentioned_ids: input.mentioned_ids || [],
      })
      .select(`*, author:employees!project_comments_author_id_fkey(id, full_name, avatar_url)`)
      .single()

    if (error) throw error

    return {
      ...data,
      author: Array.isArray(data.author) ? data.author[0] : data.author,
      replies: [],
    }
  } catch (e) {
    console.error('[projectCommentService] createComment error:', e)
    return null
  }
}

/** Sửa comment */
export async function updateComment(commentId: string, content: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('project_comments')
      .update({ content: content.trim(), is_edited: true, edited_at: new Date().toISOString() })
      .eq('id', commentId)
    return !error
  } catch { return false }
}

/** Xóa comment (soft delete) */
export async function deleteComment(commentId: string): Promise<boolean> {
  try {
    const now = new Date().toISOString()
    await supabase.from('project_comments').update({ is_deleted: true, deleted_at: now }).eq('id', commentId)
    await supabase.from('project_comments').update({ is_deleted: true, deleted_at: now }).eq('parent_comment_id', commentId)
    return true
  } catch { return false }
}

/** Đếm comments */
export async function getCommentCount(projectId: string): Promise<number> {
  const { count } = await supabase
    .from('project_comments')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_deleted', false)
  return count || 0
}
