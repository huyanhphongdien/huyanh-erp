// ============================================================================
// CONTRACT ANNEX SERVICE — Phụ lục (Annex) tự động (Nấc 2)
// File: src/services/sales/contractAnnexService.ts
//
// Sinh .docx phụ lục từ template_ANNEX.docx (giữ letterhead/logo mẫu thật),
// điền token bằng docxtemplater (delimiter { }, giống Nấc 1).
// v1: loại "Đổi số HĐ" (tiêu chí Đạt của roadmap). Mở rộng loại khác sau.
// ============================================================================

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { SALES_CONFIG } from '../../config/sales.config'

export type AnnexType = 'contract_no' // v1; sau: 'quantity' | 'price' | 'delivery'

export const ANNEX_TYPE_LABELS: Record<AnnexType, string> = {
  contract_no: 'Đổi số hợp đồng',
}

export interface AnnexInput {
  type: AnnexType
  /** HĐ gốc */
  origContractNo: string
  origContractDate: string // "11 May 2026"
  /** Khách */
  buyerName: string
  buyerAddress: string
  buyerRegistration?: string
  buyerMd?: string
  /** Phụ lục */
  annexDate: string // "1st June 2026"
  seq: number // AC.{seq}
  /** Thay đổi — loại 'contract_no' */
  newContractNo: string
}

/** Format ngày → "1st June 2026" (cho mặc định ô Ngày phụ lục). */
export function formatAnnexDate(d: Date = new Date()): string {
  const day = d.getDate()
  const j = day % 10, k = day % 100
  const suf = (j === 1 && k !== 11) ? 'st' : (j === 2 && k !== 12) ? 'nd' : (j === 3 && k !== 13) ? 'rd' : 'th'
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  return `${day}${suf} ${month} ${d.getFullYear()}`
}

/** Build bộ token theo loại phụ lục. */
function buildTokens(input: AnnexInput): Record<string, string> {
  const base = {
    annex_date: input.annexDate,
    buyer_name: input.buyerName || '',
    buyer_address: input.buyerAddress || '',
    buyer_registration: input.buyerRegistration || '—',
    buyer_md: input.buyerMd || '—',
    orig_contract_no: input.origContractNo,
    orig_contract_date: input.origContractDate,
  }

  if (input.type === 'contract_no') {
    const newNo = input.newContractNo.trim()
    return {
      ...base,
      annex_no: `${newNo}/AC.${input.seq}`,
      annex_subject: `TO CHANGE THE CONTRACT NUMBER from ${input.origContractNo} to ${newNo}`,
      amend_field: 'Contract Number',
      amend_old: input.origContractNo,
      amend_new: newNo,
      amend_effect: `From the effective date of this Annex, all references to Contract No. ${input.origContractNo} in the Contract and related documents shall be deemed to refer to Contract No. ${newNo}`,
    }
  }

  throw new Error(`Loại phụ lục chưa hỗ trợ: ${input.type}`)
}

/** Sinh .docx phụ lục → trả Blob. */
export async function generateAnnexDocx(input: AnnexInput): Promise<Blob> {
  const url = `${SALES_CONFIG.TEMPLATE_BASE}/template_ANNEX.docx`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Không tải được template Annex (template_ANNEX.docx)')
  const buf = await res.arrayBuffer()

  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' },
    paragraphLoop: true,
    linebreaks: true,
  })
  doc.render(buildTokens(input))

  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Blob
}

/** Tải file về máy. */
export function downloadAnnex(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
