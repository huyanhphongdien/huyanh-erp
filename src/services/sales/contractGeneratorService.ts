// ============================================================================
// CONTRACT GENERATOR SERVICE
// File: src/services/sales/contractGeneratorService.ts
//
// Sinh file .docx (SC + PI) từ 4 template có sẵn ở /public/contract-templates/
// theo Incoterm (CIF/FOB) và loại văn bản (SC = Sales Contract, PI = Proforma Invoice).
//
// Template được build sẵn từ 4 file mẫu:
//   - SC + PI ( CIF)/SC- Yoong Do…   → template_SC_CIF.docx
//   - SC + PI ( CIF)/PI- Yoong Do…   → template_PI_CIF.docx
//   - SC + PI (FOB)/SC-APOLLO…       → template_SC_FOB.docx
//   - SC + PI (FOB)/PI- APOLLO…      → template_PI_FOB.docx
// (xem docs/contract-templates/build_templates.py)
// ============================================================================

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { saveAs } from 'file-saver'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type ContractKind = 'SC_CIF' | 'PI_CIF' | 'SC_FOB' | 'PI_FOB'

/** Toàn bộ field có trong placeholder của 4 template. */
export interface ContractFormData {
  contract_no: string         // HA20260053
  contract_date: string       // 08 May 2026

  buyer_name: string
  buyer_address: string
  buyer_phone?: string

  grade: string               // SVR3L, RSS3, ...
  quantity: string            // "20.16"
  unit_price: string          // "2,460"
  amount: string              // "49,593.60"
  amount_words?: string       // chỉ PI: "Forty-Nine Thousand…Cents Only"

  incoterm: string            // "CIF" | "FOB" | "CFR" | "CNF" | "DDP" | "EXW"
  pol: string                 // Port of loading
  pod?: string                // Port of discharge (CIF/CFR/DDP)

  packing_desc: string        // "35kg/bale with thick polybag, Wooden pallets"
  bales_total?: string        // "576"
  pallets_total?: string      // "16"
  containers: string          // "01"
  cont_type: string           // "20DC" | "40HC"

  shipment_time?: string      // "June, 2026" hoặc multi-lot string
  partial?: string            // "Allowed" | "Not Allowed"
  trans?: string              // "Allowed" | "Not Allowed"

  payment: string             // "LC at sight" | "CAD 5 days" | "T/T 100%"
  payment_extra?: string      // chi tiết LC nếu có

  claims_days?: string        // "20" (default)
  arbitration?: string        // "SICOM Singapore" | "LCIA London"
  freight_mark?: string       // "freight prepaid" | "freight Collect"
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const TEMPLATE_BASE = '/contract-templates'

/**
 * Map Incoterm → kiểu template (CIF/FOB).
 * - CIF / CFR / CNF / DDP → dùng template_*_CIF.docx (có Port of discharge + Insurance)
 * - FOB / EXW             → dùng template_*_FOB.docx
 */
export function deriveKind(incoterm: string, type: 'SC' | 'PI'): ContractKind {
  const upper = (incoterm || 'FOB').toUpperCase()
  const isCIF = ['CIF', 'CFR', 'CNF', 'DDP'].includes(upper)
  return `${type}_${isCIF ? 'CIF' : 'FOB'}` as ContractKind
}

async function loadTemplateBuffer(kind: ContractKind): Promise<ArrayBuffer> {
  const url = `${TEMPLATE_BASE}/template_${kind}.docx`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Không tải được template ${kind} (${url}): HTTP ${res.status}`)
  }
  return await res.arrayBuffer()
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/** Render template + form data → trả về Blob .docx. */
export async function generateContractBlob(
  kind: ContractKind,
  data: Partial<ContractFormData>,
): Promise<Blob> {
  const buffer = await loadTemplateBuffer(kind)
  const zip = new PizZip(buffer)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' },
    paragraphLoop: true,
    linebreaks: true,
    // Missing key → trả về empty (đỡ crash nếu thiếu field)
    nullGetter: () => '',
  })
  doc.render(data)
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}

/** Sinh + download trực tiếp xuống máy. */
export async function downloadContract(
  kind: ContractKind,
  data: Partial<ContractFormData>,
  filename?: string,
): Promise<void> {
  const blob = await generateContractBlob(kind, data)
  const name = filename || `${data.contract_no || 'contract'}_${kind}.docx`
  saveAs(blob, name)
}

/** Sinh đồng thời cả SC + PI cho 1 đơn hàng, return 2 Blob. */
export async function generateContractPair(
  incoterm: string,
  data: Partial<ContractFormData>,
): Promise<{ sc: Blob; pi: Blob; scKind: ContractKind; piKind: ContractKind }> {
  const scKind = deriveKind(incoterm, 'SC')
  const piKind = deriveKind(incoterm, 'PI')
  const [sc, pi] = await Promise.all([
    generateContractBlob(scKind, data),
    generateContractBlob(piKind, data),
  ])
  return { sc, pi, scKind, piKind }
}
