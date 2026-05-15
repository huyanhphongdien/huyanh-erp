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

// ============================================================================
// Bank presets — chọn 1 phát, fill 5 field tự động ở Review HĐ page.
// Account name luôn 'HUY ANH RUBBER COMPANY LIMITED' (đã đăng ký với từng bank).
// Tài khoản USD của Huy Anh Rubber tại các bank chi nhánh Huế.
// ============================================================================

export interface BankPreset {
  value: string                    // key
  label: string                    // short display (cho dropdown)
  bank_account_name: string        // luôn 'HUY ANH RUBBER COMPANY LIMITED'
  bank_account_no: string          // số tài khoản USD
  bank_full_name: string           // tên đầy đủ trên contract / L/C
  bank_address: string             // địa chỉ chi nhánh
  bank_swift: string               // SWIFT code
}

export const BANK_PRESETS: BankPreset[] = [
  {
    value: 'VTB_HUE',
    label: 'Vietin Bank — Hue Branch (default)',
    bank_account_name: 'HUY ANH RUBBER COMPANY LIMITED',
    bank_account_no: '111002648221',
    bank_full_name: 'VIETNAM JOINT STOCK COMMERCIAL BANK FOR INDUSTRY AND TRADE HUE BRANCH',
    bank_address: '02 LE QUY DON STREET, THUAN HOA WARD, HUE CITY, VIET NAM',
    bank_swift: 'ICBVVNVX460',
  },
  {
    value: 'VCB_HUE',
    label: 'Vietcombank — Hue Branch',
    bank_account_name: 'HUY ANH RUBBER COMPANY LIMITED',
    bank_account_no: '0071001046372',
    bank_full_name: 'JOINT STOCK COMMERCIAL BANK FOR FOREIGN TRADE OF VIETNAM — HUE BRANCH',
    bank_address: '78 HUNG VUONG STREET, PHU NHUAN WARD, HUE CITY, VIET NAM',
    bank_swift: 'BFTVVNVX',
  },
  {
    value: 'BIDV_HUE',
    label: 'BIDV — Hue Branch',
    bank_account_name: 'HUY ANH RUBBER COMPANY LIMITED',
    bank_account_no: '5510020372',
    bank_full_name: 'JOINT STOCK COMMERCIAL BANK FOR INVESTMENT AND DEVELOPMENT OF VIETNAM — HUE BRANCH',
    bank_address: '41 HUNG VUONG STREET, PHU NHUAN WARD, HUE CITY, VIET NAM',
    bank_swift: 'BIDVVNVX',
  },
  {
    value: 'AGRI_HUE',
    label: 'Agribank — Hue Branch',
    bank_account_name: 'HUY ANH RUBBER COMPANY LIMITED',
    bank_account_no: '4000201014000',
    bank_full_name: 'VIETNAM BANK FOR AGRICULTURE AND RURAL DEVELOPMENT — HUE BRANCH',
    bank_address: '10 HOANG HOA THAM STREET, VINH NINH WARD, HUE CITY, VIET NAM',
    bank_swift: 'VBAAVNVX540',
  },
  {
    value: 'TPB_HUE',
    label: 'TP Bank — Hue Branch',
    bank_account_name: 'HUY ANH RUBBER COMPANY LIMITED',
    bank_account_no: '78468686868',
    bank_full_name: 'TIEN PHONG COMMERCIAL JOINT STOCK BANK — HUE BRANCH',
    bank_address: '37 HA NOI STREET, PHU NHUAN WARD, HUE CITY, VIET NAM',
    bank_swift: 'TPBVVNVX',
  },
  {
    value: 'EXIM_HUE',
    label: 'Eximbank — Hue Branch',
    bank_account_name: 'HUY ANH RUBBER COMPANY LIMITED',
    bank_account_no: '100201085',
    bank_full_name: 'VIETNAM EXPORT IMPORT COMMERCIAL JOINT STOCK BANK — HUE BRANCH',
    bank_address: '07 HUNG VUONG STREET, PHU HOI WARD, HUE CITY, VIET NAM',
    bank_swift: 'EBVIVNVX',
  },
  {
    value: 'UOB_HCM',
    label: 'UOB — Ho Chi Minh City',
    bank_account_name: 'HUY ANH RUBBER COMPANY LIMITED',
    bank_account_no: '1039019421',
    bank_full_name: 'UNITED OVERSEAS BANK (VIETNAM) LIMITED — HO CHI MINH CITY BRANCH',
    bank_address: 'CENTRAL PLAZA, 17 LE DUAN BOULEVARD, DISTRICT 1, HO CHI MINH CITY, VIET NAM',
    bank_swift: 'UOVBVNVX',
  },
]

export function getBankPreset(value: string | null | undefined): BankPreset | null {
  if (!value) return null
  return BANK_PRESETS.find((b) => b.value === value) || null
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
