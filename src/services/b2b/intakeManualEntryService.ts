// ============================================================================
// INTAKE MANUAL ENTRY SERVICE — Admin nhập tay phiếu cân (single + bulk CSV)
// File: src/services/b2b/intakeManualEntryService.ts
// ============================================================================
//
// Mục đích: tạm thời nhập tay phiếu nhập mủ vào `rubber_intake_batches` cho đến
// khi 3 wizard (Outright/Walkin/Production) wire-up auto createFromDeal.
//
// Flow:
//   1) Form single: 1 phiếu/lần, có upload ảnh phiếu cân.
//   2) Bulk CSV: import nhiều phiếu từ file CSV/Excel (data cũ).
//
// Sau khi insert, trigger DB `trg_intake_batch_recompute_bonus` tự gọi
// compute_monthly_bonus → bonus update realtime.

import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import type { RubberType } from '../../types/b2b.types'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SourceType = 'vietnam' | 'lao_direct' | 'lao_agent'

/** 5 loại mủ thô chi tiết — DB tự derive rubber_type (2 loại bonus). */
export type RawRubberType = 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to'

export const RAW_RUBBER_TYPE_LABELS: Record<RawRubberType, string> = {
  mu_nuoc: 'Mủ nước',
  mu_tap:  'Mủ tạp',
  mu_dong: 'Mủ đông',
  mu_chen: 'Mủ chén',
  mu_to:   'Mủ tờ',
}

/** Mapping client-side mirror DB function map_raw_to_bonus_type. */
export function mapRawToBonusType(raw: RawRubberType | null | undefined): RubberType | null {
  if (!raw) return null
  switch (raw) {
    case 'mu_nuoc': return 'nuoc'
    case 'mu_tap':
    case 'mu_dong':
    case 'mu_chen':
    case 'mu_to':
      return 'tap'
    default:
      return null
  }
}

export interface ManualIntakeInput {
  b2b_partner_id: string                  // bắt buộc — để tính bonus
  raw_rubber_type: RawRubberType          // bắt buộc — 5 loại chi tiết
  intake_date: string                     // YYYY-MM-DD
  net_weight_kg: number                   // bắt buộc
  source_type?: SourceType
  product_code?: string
  gross_weight_kg?: number
  drc_percent?: number
  unit_price?: number                     // đ/kg
  vehicle_plate?: string
  vehicle_label?: string
  invoice_no?: string
  location_name?: string
  buyer_name?: string
  notes?: string
  weighbridge_image_urls?: string[]
  // Sprint 1.4 (TL flow): ĐỐT + mã LLM gộp xe
  field_dot_reading?: number              // Metrolac reading (integer 100-350)
  consolidation_code?: string             // Mã LLM gộp xe
  facility_id?: string                    // optional — gán phiếu vào nhà máy
}

export interface CsvRow {
  rowIndex: number                        // 1-based row trong CSV (cho user track)
  partner_code: string
  partner_id?: string                     // resolved sau validate
  partner_name?: string
  raw_rubber_type: string                 // 5 loại chi tiết
  intake_date: string
  net_weight_kg: number
  gross_weight_kg?: number | null
  drc_percent?: number | null
  unit_price?: number | null
  vehicle_plate?: string
  invoice_no?: string
  notes?: string
  // Validation
  errors: string[]
  ok: boolean
}

export interface CreateResult {
  id: string
  code: string | null
  partner_id: string
  raw_rubber_type: RawRubberType
  rubber_type: RubberType | null              // derived qua trigger DB
  net_weight_kg: number
}

const RAW_TYPES_VALID: ReadonlySet<string> = new Set(['mu_nuoc', 'mu_tap', 'mu_dong', 'mu_chen', 'mu_to'])

// ─── Image upload ────────────────────────────────────────────────────────────

const BUCKET = 'weighbridge-images'

export async function uploadWeighbridgeImage(file: File, batchId: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const ts = Date.now()
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50)
  const path = `${batchId}/${ts}-${safe}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(`Upload ảnh thất bại: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// ─── Single entry ────────────────────────────────────────────────────────────

export const intakeManualEntryService = {
  /**
   * Tạo 1 phiếu nhập với (optional) upload ảnh.
   * Status = 'confirmed' ngay → trigger DB tự recompute bonus.
   */
  async createSingle(input: ManualIntakeInput, files?: File[]): Promise<CreateResult> {
    if (!input.b2b_partner_id) throw new Error('Bắt buộc chọn đại lý B2B')
    if (!input.raw_rubber_type || !RAW_TYPES_VALID.has(input.raw_rubber_type)) {
      throw new Error('Bắt buộc chọn loại mủ chi tiết (5 loại)')
    }
    if (!input.net_weight_kg || input.net_weight_kg <= 0) throw new Error('Net weight phải > 0')
    if (!input.intake_date) throw new Error('Bắt buộc ngày cân')

    // Step 1: Insert row trước (status='draft') để có id cho upload ảnh.
    // KHÔNG cần set rubber_type — DB trigger tự derive từ raw_rubber_type.
    const { data: inserted, error: insertErr } = await supabase
      .from('rubber_intake_batches')
      .insert({
        source_type: input.source_type ?? 'vietnam',
        intake_date: input.intake_date,
        b2b_partner_id: input.b2b_partner_id,
        raw_rubber_type: input.raw_rubber_type,
        net_weight_kg: input.net_weight_kg,
        gross_weight_kg: input.gross_weight_kg ?? input.net_weight_kg,
        drc_percent: input.drc_percent ?? null,
        unit_price: input.unit_price ?? null,
        product_code: input.product_code ?? input.raw_rubber_type.toUpperCase(),
        vehicle_plate: input.vehicle_plate ?? null,
        vehicle_label: input.vehicle_label ?? null,
        invoice_no: input.invoice_no ?? null,
        location_name: input.location_name ?? null,
        buyer_name: input.buyer_name ?? null,
        notes: input.notes ?? 'Nhập tay qua manual entry',
        status: 'draft',
        weighbridge_image_urls: input.weighbridge_image_urls ?? [],
        // Sprint 1.4 (TL flow): ĐỐT + mã LLM + facility
        field_dot_reading: input.field_dot_reading ?? null,
        consolidation_code: input.consolidation_code ?? null,
        facility_id: input.facility_id ?? null,
      })
      .select('id, code')
      .single()
    if (insertErr) throw insertErr

    const batchId = (inserted as { id: string }).id

    // Step 2: Upload ảnh (nếu có)
    let imageUrls: string[] = input.weighbridge_image_urls ?? []
    if (files && files.length > 0) {
      const uploaded: string[] = []
      for (const f of files) {
        try {
          const url = await uploadWeighbridgeImage(f, batchId)
          uploaded.push(url)
        } catch (e) {
          console.warn('[intakeManualEntry] Upload 1 ảnh fail:', e)
        }
      }
      imageUrls = [...imageUrls, ...uploaded]
    }

    // Step 3: Update images + chuyển status='confirmed' → trigger recompute bonus
    const { error: updateErr } = await supabase
      .from('rubber_intake_batches')
      .update({
        weighbridge_image_urls: imageUrls,
        status: 'confirmed',
      })
      .eq('id', batchId)
    if (updateErr) throw updateErr

    return {
      id: batchId,
      code: (inserted as { code: string | null }).code,
      partner_id: input.b2b_partner_id,
      raw_rubber_type: input.raw_rubber_type,
      rubber_type: mapRawToBonusType(input.raw_rubber_type),
      net_weight_kg: input.net_weight_kg,
    }
  },

  // ─── CSV / XLSX import ────────────────────────────────────────────────────

  /**
   * Parse file CSV hoặc XLSX → array CsvRow (chưa validate partner).
   * Columns expected (header row): intake_date, partner_code, rubber_type, net_weight_kg,
   * gross_weight_kg, drc_percent, unit_price, vehicle_plate, invoice_no, notes
   */
  async parseFile(file: File): Promise<CsvRow[]> {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true })

    return json.map((r, i) => {
      const errors: string[] = []
      const get = (k: string): string => {
        const v = r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()]
        return v == null ? '' : String(v).trim()
      }
      const getNum = (k: string): number | null => {
        const s = get(k)
        if (!s) return null
        const n = Number(s.replace(/,/g, ''))
        return Number.isFinite(n) ? n : null
      }

      const partner_code = get('partner_code')
      // Hỗ trợ 2 column name: `raw_rubber_type` (preferred) hoặc `rubber_type` (legacy CSV)
      const rubber_raw_value = get('raw_rubber_type') || get('rubber_type')
      const rubber_normalized = rubber_raw_value.toLowerCase().replace(/[^a-z_]/g, '')
      // Map shortcut nếu user gõ ngắn 'tap' → 'mu_tap', 'nuoc' → 'mu_nuoc' để dễ
      const raw_rubber_type =
        rubber_normalized === 'tap'  ? 'mu_tap'  :
        rubber_normalized === 'nuoc' ? 'mu_nuoc' :
        rubber_normalized === 'dong' ? 'mu_dong' :
        rubber_normalized === 'chen' ? 'mu_chen' :
        rubber_normalized === 'to'   ? 'mu_to'   :
        rubber_normalized
      const intake_date_raw = get('intake_date')
      const net_weight = getNum('net_weight_kg')

      // Normalize date: support YYYY-MM-DD, DD/MM/YYYY, Excel serial number
      let intake_date = intake_date_raw
      if (/^\d+(\.\d+)?$/.test(intake_date_raw)) {
        // Excel date serial
        const d = XLSX.SSF.parse_date_code(Number(intake_date_raw))
        if (d) intake_date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      } else if (/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(intake_date_raw)) {
        const m = intake_date_raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)!
        intake_date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      }

      if (!partner_code) errors.push('Thiếu partner_code')
      if (!RAW_TYPES_VALID.has(raw_rubber_type)) {
        errors.push(`rubber_type phải là 1 trong: mu_nuoc, mu_tap, mu_dong, mu_chen, mu_to (got: ${rubber_raw_value})`)
      }
      if (!intake_date || !/^\d{4}-\d{2}-\d{2}$/.test(intake_date)) errors.push(`intake_date format không hợp lệ (got: ${intake_date_raw})`)
      if (!net_weight || net_weight <= 0) errors.push('net_weight_kg phải > 0')

      return {
        rowIndex: i + 2, // +1 vì 0-based, +1 vì header row
        partner_code,
        raw_rubber_type,
        intake_date,
        net_weight_kg: net_weight ?? 0,
        gross_weight_kg: getNum('gross_weight_kg'),
        drc_percent: getNum('drc_percent'),
        unit_price: getNum('unit_price'),
        vehicle_plate: get('vehicle_plate') || undefined,
        invoice_no: get('invoice_no') || undefined,
        notes: get('notes') || undefined,
        errors,
        ok: errors.length === 0,
      }
    })
  },

  /**
   * Resolve partner_code (HAC-13 hoặc alias DEMO-XXX hoặc legacy TEHG01) → partner_id.
   * Mutate rows in-place, add errors nếu không resolve được.
   */
  async resolvePartnerCodes(rows: CsvRow[]): Promise<void> {
    const uniqueCodes = Array.from(new Set(rows.map((r) => r.partner_code).filter(Boolean)))
    if (uniqueCodes.length === 0) return

    // 1. Match qua hac13_code (b2b.partners.code đã sync = hac13)
    const { data: byHac13 } = await supabase
      .from('b2b_partners')
      .select('id, code, name')
      .in('code', uniqueCodes)
    const hac13Map: Record<string, { id: string; name: string }> = {}
    for (const p of (byHac13 ?? []) as Array<{ id: string; code: string; name: string }>) {
      hac13Map[p.code] = { id: p.id, name: p.name }
    }

    // 2. Match qua bp_search_keys ALIAS (cho code legacy DEMO-XXX, TEHG01...)
    const unresolved = uniqueCodes.filter((c) => !hac13Map[c])
    const aliasMap: Record<string, { id: string; name: string }> = {}
    if (unresolved.length > 0) {
      const { data: aliasRows } = await supabase
        .from('bp_search_keys')
        .select('key_value, bp_id, business_partner:business_partners!fk_bp_search_keys_bp_id(legal_name)')
        .eq('key_type', 'ALIAS')
        .in('key_value', unresolved)
      const bpIds = (aliasRows ?? []).map((r: { bp_id: string }) => r.bp_id)
      const { data: partnersByBp } = await supabase
        .from('b2b_partners')
        .select('id, bp_id, name')
        .in('bp_id', bpIds)
      const bpToPartner: Record<string, { id: string; name: string }> = {}
      for (const p of (partnersByBp ?? []) as Array<{ id: string; bp_id: string; name: string }>) {
        bpToPartner[p.bp_id] = { id: p.id, name: p.name }
      }
      for (const r of (aliasRows ?? []) as Array<{ key_value: string; bp_id: string }>) {
        const partner = bpToPartner[r.bp_id]
        if (partner) aliasMap[r.key_value] = partner
      }
    }

    // Apply resolution
    for (const r of rows) {
      const match = hac13Map[r.partner_code] ?? aliasMap[r.partner_code]
      if (match) {
        r.partner_id = match.id
        r.partner_name = match.name
      } else {
        r.errors.push(`Không tìm thấy đại lý với mã: ${r.partner_code}`)
        r.ok = false
      }
    }
  },

  /**
   * Bulk insert rows đã validate ok=true.
   * Trả về số lượng inserted thành công + danh sách lỗi nếu có.
   */
  async bulkImport(rows: CsvRow[]): Promise<{ inserted: number; failed: number; errors: string[] }> {
    const validRows = rows.filter((r) => r.ok && r.partner_id)
    if (validRows.length === 0) {
      return { inserted: 0, failed: rows.length, errors: ['Không có row nào hợp lệ.'] }
    }

    const errors: string[] = []
    let inserted = 0

    // Insert theo batch 50 row mỗi lần để tránh request quá lớn
    const CHUNK = 50
    for (let i = 0; i < validRows.length; i += CHUNK) {
      const chunk = validRows.slice(i, i + CHUNK)
      const payload = chunk.map((r) => ({
        source_type: 'vietnam',
        intake_date: r.intake_date,
        b2b_partner_id: r.partner_id!,
        raw_rubber_type: r.raw_rubber_type as RawRubberType,
        // rubber_type tự derive qua DB trigger
        net_weight_kg: r.net_weight_kg,
        gross_weight_kg: r.gross_weight_kg ?? r.net_weight_kg,
        drc_percent: r.drc_percent ?? null,
        unit_price: r.unit_price ?? null,
        product_code: r.raw_rubber_type.toUpperCase(),
        vehicle_plate: r.vehicle_plate ?? null,
        invoice_no: r.invoice_no ?? null,
        notes: r.notes ?? `Bulk CSV import (row ${r.rowIndex})`,
        status: 'confirmed',
      }))

      const { error, data } = await supabase
        .from('rubber_intake_batches')
        .insert(payload)
        .select('id')

      if (error) {
        errors.push(`Chunk ${i / CHUNK + 1}: ${error.message}`)
      } else {
        inserted += (data ?? []).length
      }
    }

    return {
      inserted,
      failed: rows.length - inserted,
      errors,
    }
  },

  /** Sinh CSV template để user download. */
  generateCsvTemplate(): Blob {
    const headers = [
      'intake_date', 'partner_code', 'raw_rubber_type',
      'net_weight_kg', 'gross_weight_kg', 'drc_percent',
      'unit_price', 'vehicle_plate', 'invoice_no', 'notes',
    ]
    const sample = [
      ['2026-05-15', '8999100012346', 'mu_tap',  '50000', '52500', '38.5', '14000', '76A-12345', 'INV001', 'Phiếu cân T5 mẫu — mủ tạp'],
      ['2026-05-20', 'DEMO-LAK2',     'mu_nuoc', '15000', '15750', '34.2', '11000', '76A-67890', '',       'Mủ nước'],
      ['2026-05-22', 'DEMO-TMHG',     'mu_dong', '80000', '84000', '40.0', '15000', '',         '',       'Mủ đông'],
      ['2026-05-25', 'DEMO-TNTH',     'mu_chen', '12000', '12600', '36.5', '13500', '',         '',       'Mủ chén'],
    ]
    const rows = [headers, ...sample].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n')
    return new Blob([rows], { type: 'text/csv;charset=utf-8' })
  },
}

export default intakeManualEntryService
