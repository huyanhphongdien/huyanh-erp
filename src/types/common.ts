// ============================================================================
// SHARED TYPES - Common types used across multiple services
// File: src/types/common.ts
// ============================================================================

export interface BatchResult {
  success: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

export interface PaginationParams {
  page: number
  pageSize: number
  search?: string
  status?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}