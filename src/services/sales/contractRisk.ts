// ============================================================================
// CONTRACT RISK — Chấm "HĐ lạ" (Nấc 4) cho luồng duyệt Hợp đồng bán
// File: src/services/sales/contractRisk.ts
//
// Thuần (pure) — không gọi DB. Trả về mức + danh sách lý do để:
//  - Kiểm tra thấy đèn báo trước khi duyệt
//  - Chặn ký HĐ lạ cho tới khi Trung/Huy duyệt (risk_ack_*)
// ============================================================================

import { SALES_CONFIG } from '../../config/sales.config'

export type RiskReason = 'extra_terms' | 'bank_custom' | 'payment_custom' | 'upload_autofill_failed'
export type RiskLevel = 'standard' | 'unusual'

export const RISK_REASON_LABELS: Record<RiskReason, string> = {
  extra_terms: 'Có điều khoản gõ tay thêm',
  bank_custom: 'Ngân hàng nhận tiền khác mặc định',
  payment_custom: 'Điều kiện thanh toán khác chuẩn',
  upload_autofill_failed: 'File upload bị lỗi tự điền',
}

// Mẫu thanh toán "chuẩn" — nếu KHÔNG khớp mẫu nào → coi là lạ (cần soát).
// Cố ý rộng để tránh báo nhầm (LC/TT/CAD/DP/at sight/advance...).
const STANDARD_PAYMENT_RE =
  /\b(l\s*\/?\s*c|letter of credit|t\s*\/?\s*t|telegraphic|cad|cash against|d\s*\/?\s*[pa]|at sight|in advance|advance|irrevocable)\b/i

export interface RiskInput {
  extraTerms?: string | null
  bankAccountNo?: string | null
  paymentText?: string | null
  autofillWarning?: boolean
}

/** Chấm HĐ là standard | unusual + lý do. reasons rỗng = standard. */
export function computeContractRisk(input: RiskInput): { level: RiskLevel; reasons: RiskReason[] } {
  const reasons: RiskReason[] = []

  if (input.extraTerms && input.extraTerms.trim()) reasons.push('extra_terms')

  const defNo = (SALES_CONFIG.DEFAULT_BANK.bank_account_no || '').trim()
  const bankNo = (input.bankAccountNo || '').trim()
  if (bankNo && defNo && bankNo !== defNo) reasons.push('bank_custom')

  const pay = (input.paymentText || '').trim()
  if (pay && !STANDARD_PAYMENT_RE.test(pay)) reasons.push('payment_custom')

  if (input.autofillWarning) reasons.push('upload_autofill_failed')

  return { level: reasons.length > 0 ? 'unusual' : 'standard', reasons }
}

/** Đổi mã lý do → câu chữ tiếng Việt (cho UI). */
export function riskReasonText(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) return []
  return reasons
    .filter((r): r is RiskReason => typeof r === 'string' && r in RISK_REASON_LABELS)
    .map((r) => RISK_REASON_LABELS[r])
}
