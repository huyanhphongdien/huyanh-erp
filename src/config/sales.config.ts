// ============================================================================
// SALES MODULE CONFIG
// File: src/config/sales.config.ts
//
// Gom các constant của workflow ký HĐ bán quốc tế (review/sign/bank).
// Khi thêm reviewer/signer mới: sửa danh sách ở đây + sync migration SQL
// tương ứng (sales_contract_workflow_v2/v3_*.sql).
// ============================================================================

export const SALES_CONFIG = {
  /** Default reviewer khi Sale submit. */
  DEFAULT_REVIEWER_EMAIL: 'phulv@huyanhrubber.com',

  /** Whitelist email được duyệt/trả lại HĐ. Đồng bộ với
   *  docs/migrations/sales_contract_workflow_v2_reviewers.sql */
  REVIEWER_EMAILS: [
    'phulv@huyanhrubber.com', // Phú LV — Kế toán (default)
    'minhld@huyanhrubber.com', // Minh LD — Admin (backup reviewer)
  ],

  /** Whitelist email được ký HĐ. Đồng bộ với
   *  docs/migrations/sales_contract_workflow_v3_signers.sql */
  SIGNER_EMAILS: [
    'trunglxh@huyanhrubber.com', // Mr. Trung
    'huylv@huyanhrubber.com', // Mr. Huy
  ],

  /** Whitelist email được xóa file HĐ (hard delete). Đồng bộ với
   *  docs/migrations/sales_contract_files_multi_v4.sql */
  DELETE_PERMISSION_EMAILS: [
    'minhld@huyanhrubber.com',
    'thuyht@huyanhrubber.com',
    'huylv@huyanhrubber.com',
    'trunglxh@huyanhrubber.com',
  ],

  /** Supabase Storage bucket cho file HĐ (cả legacy upload + workflow PDF đã ký). */
  CONTRACT_BUCKET: 'sales-contracts',

  /** TTL cho signed URL khi mở/tải file (giây). */
  SIGNED_URL_TTL_SEC: 120,

  /** Path prefix cho template trong /public/. */
  TEMPLATE_BASE: '/contract-templates',

  /** Tối đa số file upload cùng lúc (legacy section). */
  MAX_CONTRACT_FILES: 10,

  /** Tối đa kích thước 1 file upload (MB). */
  MAX_FILE_SIZE_MB: 20,

  /** Default bank info (Vietin Hue) — fallback khi Phú LV chưa nhập. */
  DEFAULT_BANK: {
    bank_account_name: 'HUY ANH RUBBER COMPANY LIMITED',
    bank_account_no: '111002648221',
    bank_full_name:
      'VIETNAM JOINT STOCK COMMERCIAL BANK FOR INDUSTRY AND TRADE HUE BRANCH',
    bank_address: '02 LE QUY DON STREET, THUAN HOA WARD, HUE CITY, VIET NAM',
    bank_swift: 'ICBVVNVX460',
  },
}

export function isAllowedReviewer(email?: string | null): boolean {
  if (!email) return false
  return SALES_CONFIG.REVIEWER_EMAILS.includes(email.toLowerCase())
}

export function isAllowedSigner(email?: string | null): boolean {
  if (!email) return false
  return SALES_CONFIG.SIGNER_EMAILS.includes(email.toLowerCase())
}

export function isAllowedToDelete(email?: string | null): boolean {
  if (!email) return false
  return SALES_CONFIG.DELETE_PERMISSION_EMAILS.includes(email.toLowerCase())
}
