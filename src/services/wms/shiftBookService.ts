// ============================================================================
// FILE: src/services/wms/shiftBookService.ts
// MODULE: Kho (WMS) — M3 Sổ ca ép bành
// MÔ TẢ: Số hoá đúng biểu mẫu giấy CL.BMQT.SX.04.06 "BÁO CÁO SẢN XUẤT NHẬP KHO
//        HÀNG NGÀY" (phiên bản 01, hiệu lực 20/5/2019), nhà máy dùng hằng ngày.
// BẢNG: shift_production_reports · shift_production_lines
//        + view v_shift_production_lines, v_shift_stock_balance
//
// HAI QUY TẮC ĐỊNH HÌNH CẢ FILE NÀY:
//
//  1. NGƯỜI CHỈ GÕ SỐ BÀNH. Kilogam và TỒN đều do máy tính.
//     Tờ giấy có 24 dòng × 6 ô = 144 ô, nhưng thông tin THẬT SỰ MỚI của ca 27/8/2026 chỉ là
//     ba con số: 118 · 10 · 432. Người ghi hiện mất 10–15 phút cộng trừ tay cột tồn.
//     Nếu màn hình bắt gõ lại 144 ô cho "đầy đủ" thì tuần thứ ba sẽ có người bỏ.
//     Ngoại lệ DUY NHẤT: mã CHÈN chưa ai xác nhận cỡ bành ⇒ phải nhập kg tay.
//
//  2. BA CHỮ KÝ, VÀ CHỈ CHỮ KÝ THỨ BA MỚI ĐỘNG VÀO TỒN KHO.
//     BÊN GIAO (sản xuất) → GIÁM SÁT CHẤT LƯỢNG (QS) → BÊN NHẬN (Thủ kho).
//     Đây là kiểm soát nhà máy đã có từ 2019, không phải phát minh của phần mềm.
//     `v_shift_stock_balance` chỉ cộng phiếu `status='received'`.
//
// ⚠ ĐỪNG dùng `rubberGradeService.calculateBaleCount/calculateWeightFromBales` cho việc này:
//   hai hàm đó gõ cứng 33,33 kg trong khi cỡ bành nằm ở `materials.weight_per_unit` và
//   khác nhau theo mã (35 · 33,33 · 30 · 111,1111). Dùng nhầm thì 19.600 kg ra 588 bành
//   thay vì 560. Ở đây luôn đọc `weight_per_unit` của chính mã đó.
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

/** Ba bước ký trên tờ giấy, cộng hai trạng thái kỹ thuật. */
export type ShiftBookStatus = 'draft' | 'submitted' | 'qc_confirmed' | 'received' | 'cancelled'

export const SHIFT_STATUS_LABEL: Record<ShiftBookStatus, string> = {
  draft:        'Nháp',
  submitted:    'Sản xuất đã giao',
  qc_confirmed: 'QC đã xác nhận',
  received:     'Thủ kho đã nhận',
  cancelled:    'Đã huỷ',
}

/** Màu theo bộ token của mock — xem docs mock Kho. */
export const SHIFT_STATUS_COLOR: Record<ShiftBookStatus, string> = {
  draft:        'default',
  submitted:    'blue',
  qc_confirmed: 'gold',
  received:     'green',
  cancelled:    'red',
}

/** Một dòng của danh mục 24 mã in sẵn trên biểu mẫu. */
export interface ShiftMaterial {
  id: string
  code: string
  sku: string | null
  name: string
  unit: string | null
  /** kg mỗi bành. NULL = chưa ai xác nhận (chỉ mã CHÈN) ⇒ bắt nhập kg tay. */
  weightPerUnit: number | null
  sortOrder: number
}

/** Một dòng nhập của một ca. `nhapKg` là số MÁY TÍNH, không phải số người gõ. */
export interface ShiftLine {
  id?: string
  materialId: string
  code: string
  materialName: string
  sortOrder: number
  unit: string | null
  weightPerUnit: number | null
  nhapBanh: number
  xuatBanh: number
  nhapKg: number | null
  xuatKg: number | null
  /** true = máy không tính được kg, người phải nhập tay. Đúng một mã: CHÈN. */
  phaiNhapKgTay: boolean
  nhapKgManual?: number | null
  xuatKgManual?: number | null
  note?: string | null
}

export interface ShiftBook {
  id: string
  facilityId: string | null
  facilityName?: string | null
  reportDate: string
  shift: string
  team: string | null
  shiftFrom: string | null
  shiftTo: string | null
  headcount: number | null
  incidents: string | null
  handoverNotes: string | null
  status: ShiftBookStatus
  isOpening: boolean
  submittedAt: string | null
  qcConfirmedAt: string | null
  receivedAt: string | null
  createdAt: string
}

export interface ShiftBookInput {
  facilityId: string
  reportDate: string
  shift: string
  team?: string | null
  shiftFrom?: string | null
  shiftTo?: string | null
  headcount?: number | null
  incidents?: string | null
  handoverNotes?: string | null
}

/** Số bành người gõ cho một mã. Không có kg — kg là việc của máy. */
export interface ShiftLineInput {
  materialId: string
  nhapBanh: number
  xuatBanh?: number
  /** CHỈ truyền cho mã không có weight_per_unit (CHÈN). Truyền ở mã khác là tạo nguồn sự thật thứ hai. */
  nhapKgManual?: number | null
  xuatKgManual?: number | null
  note?: string | null
}

export interface ShiftTotals {
  nhapBanh: number
  nhapKg: number
  xuatBanh: number
  xuatKg: number
  /** Bành của các mã hàng KHÔNG ĐẠT (DKL + SẢN PHẨM LỖI). */
  loiBanh: number
  loiKg: number
  /** Có dòng nào chưa tính được kg không — giao diện phải cảnh báo trước khi gửi. */
  thieuKg: boolean
}

/**
 * Mã hàng KHÔNG ĐẠT trên biểu mẫu. HAI mã, không phải một:
 *  DKL = dính kim loại · LOI = sản phẩm lỗi, chờ tái chế.
 * Dùng để tách "tổng sản lượng" với "sản lượng đạt" — xem ghi chú ở `computeTotals`.
 */
export const MA_HANG_KHONG_DAT = ['DKL', 'LOI'] as const

// ============================================================================
// HELPERS
// ============================================================================

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * PostgREST trả cột `numeric` về dưới dạng CHUỖI. Cộng dồn bằng `+=` trên chuỗi là NỐI CHUỖI
 * chứ không báo lỗi — tổng ra một dãy số vô nghĩa mà không có gì cảnh báo.
 * Cùng lý do salesLotService và arAgingService đều bọc num().
 */
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Kilogam của một dòng. LUÔN đọc cỡ bành của CHÍNH mã đó.
 * Trả null khi mã chưa có cỡ bành và người cũng chưa nhập tay — nghĩa là "chưa biết",
 * KHÁC HẲN 0. Trả 0 ở đây là nói dối rằng ca đó không làm ra gì.
 */
export function kgCuaDong(banh: number, weightPerUnit: number | null, kgManual?: number | null): number | null {
  if (kgManual !== null && kgManual !== undefined) return round2(kgManual)
  if (weightPerUnit === null || weightPerUnit === undefined) return null
  return round2(banh * weightPerUnit)
}

/**
 * Cộng tổng một ca.
 *
 * ⚠ VỀ TIỀN KHOÁN: chủ doanh nghiệp chốt ngày 28/08/2026 rằng phiếu khoán vẫn tính theo
 * TỔNG SẢN LƯỢNG LÀM ĐƯỢC (`nhapKg`), gồm cả hàng lỗi, **cho tới khi có thay đổi**.
 * Hàm này vì vậy trả về CẢ HAI: `nhapKg` (tổng) và `loiKg` (phần không đạt), để:
 *   · phiếu khoán lấy `nhapKg` theo đúng quy định hiện hành, và
 *   · lãnh đạo nhìn thấy khoảng chênh mỗi tháng mà quyết định, chứ không ai phải thuyết phục ai.
 * Đừng nhúng chính sách vào phép tính — đổi quy định thì đổi chỗ ĐỌC, không sửa chỗ TÍNH.
 */
export function computeTotals(lines: ShiftLine[]): ShiftTotals {
  let nhapBanh = 0, nhapKg = 0, xuatBanh = 0, xuatKg = 0, loiBanh = 0, loiKg = 0
  let thieuKg = false

  for (const l of lines) {
    nhapBanh += l.nhapBanh
    xuatBanh += l.xuatBanh
    const nk = kgCuaDong(l.nhapBanh, l.weightPerUnit, l.nhapKgManual)
    const xk = kgCuaDong(l.xuatBanh, l.weightPerUnit, l.xuatKgManual)
    if (nk === null && l.nhapBanh > 0) thieuKg = true
    if (xk === null && l.xuatBanh > 0) thieuKg = true
    nhapKg += nk ?? 0
    xuatKg += xk ?? 0
    if ((MA_HANG_KHONG_DAT as readonly string[]).includes(l.code)) {
      loiBanh += l.nhapBanh
      loiKg += nk ?? 0
    }
  }
  return {
    nhapBanh, nhapKg: round2(nhapKg),
    xuatBanh, xuatKg: round2(xuatKg),
    loiBanh, loiKg: round2(loiKg),
    thieuKg,
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const shiftBookService = {
  /**
   * 24 mã in sẵn trên biểu mẫu, ĐÚNG THỨ TỰ TỜ GIẤY.
   * ⚠ Sắp lại theo tên hay theo mã cho "gọn" là ép người nhập dò từng dòng — mà dò thì gõ
   * nhầm dòng, và gõ nhầm dòng thì sai cả tồn kho lẫn tiền khoán.
   */
  async listMaterials(): Promise<ShiftMaterial[]> {
    const { data, error } = await supabase
      .from('materials')
      .select('id, code, sku, name, unit, weight_per_unit, sort_order')
      .not('sort_order', 'is', null)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data || []).map((m: Record<string, unknown>) => ({
      id: String(m.id),
      code: String(m.code ?? ''),
      sku: (m.sku as string) ?? null,
      name: String(m.name ?? ''),
      unit: (m.unit as string) ?? null,
      weightPerUnit: numOrNull(m.weight_per_unit),
      sortOrder: num(m.sort_order),
    }))
  },

  /** Danh sách phiếu ca, mới nhất trước. */
  async listReports(opts?: { facilityId?: string; limit?: number }): Promise<ShiftBook[]> {
    let q = supabase
      .from('shift_production_reports')
      .select('id, facility_id, report_date, shift, team, shift_from, shift_to, headcount, incidents, handover_notes, status, is_opening, submitted_at, qc_confirmed_at, received_at, created_at, facility:facilities!facility_id(name)')
      .order('report_date', { ascending: false })
      .order('shift', { ascending: false })
      .limit(opts?.limit ?? 100)
    if (opts?.facilityId) q = q.eq('facility_id', opts.facilityId)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(mapReport)
  },

  async getReport(id: string): Promise<{ report: ShiftBook; lines: ShiftLine[] }> {
    const { data: r, error: rErr } = await supabase
      .from('shift_production_reports')
      .select('id, facility_id, report_date, shift, team, shift_from, shift_to, headcount, incidents, handover_notes, status, is_opening, submitted_at, qc_confirmed_at, received_at, created_at, facility:facilities!facility_id(name)')
      .eq('id', id)
      .single()
    if (rErr) throw rErr

    // Đọc qua VIEW, không đọc thẳng bảng — view là nơi kilogam được tính.
    const { data: ls, error: lErr } = await supabase
      .from('v_shift_production_lines')
      .select('*')
      .eq('report_id', id)
      .order('sort_order', { ascending: true })
    if (lErr) throw lErr

    return { report: mapReport(r), lines: (ls || []).map(mapLine) }
  },

  /** Tìm phiếu của một ca — để màn hình mở lại đúng phiếu đang làm dở thay vì tạo trùng. */
  async findReport(facilityId: string, reportDate: string, shift: string): Promise<ShiftBook | null> {
    const { data, error } = await supabase
      .from('shift_production_reports')
      .select('id, facility_id, report_date, shift, team, shift_from, shift_to, headcount, incidents, handover_notes, status, is_opening, submitted_at, qc_confirmed_at, received_at, created_at')
      .eq('facility_id', facilityId)
      .eq('report_date', reportDate)
      .eq('shift', shift)
      .neq('status', 'cancelled')
      .maybeSingle()
    if (error) throw error
    return data ? mapReport(data) : null
  },

  async createReport(input: ShiftBookInput): Promise<ShiftBook> {
    const { data, error } = await supabase
      .from('shift_production_reports')
      .insert({
        facility_id: input.facilityId,
        report_date: input.reportDate,
        shift: input.shift,
        team: input.team ?? null,
        shift_from: input.shiftFrom ?? null,
        shift_to: input.shiftTo ?? null,
        headcount: input.headcount ?? null,
        incidents: input.incidents ?? null,
        handover_notes: input.handoverNotes ?? null,
        status: 'draft',
      })
      .select('*')
      .single()
    if (error) throw error
    return mapReport(data)
  },

  async updateReport(id: string, patch: Partial<ShiftBookInput>): Promise<void> {
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.team !== undefined) body.team = patch.team
    if (patch.shiftFrom !== undefined) body.shift_from = patch.shiftFrom
    if (patch.shiftTo !== undefined) body.shift_to = patch.shiftTo
    if (patch.headcount !== undefined) body.headcount = patch.headcount
    if (patch.incidents !== undefined) body.incidents = patch.incidents
    if (patch.handoverNotes !== undefined) body.handover_notes = patch.handoverNotes
    const { error } = await supabase.from('shift_production_reports').update(body).eq('id', id)
    if (error) throw error
  },

  /**
   * Ghi các dòng của một ca.
   *
   * ⚠ Dòng có SỐ 0 ở mọi ô thì XOÁ, không lưu — ràng buộc `spl_khong_rong` của bảng cũng chặn.
   *   Lưu 24 dòng trong đó 21 dòng toàn số 0 là làm bẩn sổ và làm chậm mọi truy vấn về sau.
   *
   * ⚠ `nhapKgManual` chỉ được truyền cho mã KHÔNG có `weight_per_unit`. Truyền ở mã khác là
   *   tạo nguồn sự thật thứ hai cho một con số máy đã tính được — chính là lỗi mà cả thiết kế
   *   này sinh ra để tránh. Hàm tự lọc bỏ, không tin phía gọi.
   */
  async saveLines(reportId: string, lines: ShiftLineInput[], materials: ShiftMaterial[]): Promise<void> {
    const byId = new Map(materials.map((m) => [m.id, m]))
    const giu = lines.filter((l) => {
      const m = byId.get(l.materialId)
      if (!m) return false
      return (l.nhapBanh ?? 0) > 0 || (l.xuatBanh ?? 0) > 0
        || l.nhapKgManual != null || l.xuatKgManual != null
    })

    const rows = giu.map((l) => {
      const m = byId.get(l.materialId)!
      const choPhepNhapTay = m.weightPerUnit === null || m.weightPerUnit === undefined
      return {
        report_id: reportId,
        material_id: l.materialId,
        nhap_banh: Math.max(0, Math.trunc(l.nhapBanh ?? 0)),
        xuat_banh: Math.max(0, Math.trunc(l.xuatBanh ?? 0)),
        nhap_kg_manual: choPhepNhapTay ? (l.nhapKgManual ?? null) : null,
        xuat_kg_manual: choPhepNhapTay ? (l.xuatKgManual ?? null) : null,
        note: l.note ?? null,
      }
    })

    // ⚠ GHI TRƯỚC, XOÁ SAU — thứ tự này là cố ý và không được đảo lại.
    //   PostgREST không có giao dịch bắc qua hai lời gọi. Nếu xoá trước rồi mất sóng
    //   (wifi xưởng, 17h55, người ghi đứng giữa nhà máy) thì phiếu mất sạch dòng —
    //   kể cả phiếu QC đã ký. Ghi trước thì trường hợp xấu nhất chỉ là thừa vài dòng
    //   cũ, lần lưu sau dọn nốt; không bao giờ mất số đã nhập.
    if (rows.length) {
      const { error } = await supabase
        .from('shift_production_lines')
        .upsert(rows, { onConflict: 'report_id,material_id' })
      if (error) throw error
    }

    // Dọn những dòng người dùng vừa xoá hết số. Dòng toàn số 0 không được lưu:
    // ràng buộc `spl_khong_rong` cũng chặn, và một ca 24 dòng trong đó 21 dòng rỗng
    // làm bẩn sổ lẫn mọi truy vấn về sau.
    const giuIds = rows.map((r) => r.material_id)
    let q = supabase.from('shift_production_lines').delete().eq('report_id', reportId)
    if (giuIds.length) q = q.not('material_id', 'in', `(${giuIds.join(',')})`)
    const { error: dErr } = await q
    if (dErr) throw dErr
  },

  /**
   * Ba bước ký. Mỗi bước chỉ đi được từ đúng một trạng thái trước đó — không nhảy cóc,
   * không quay lui. Ai bấm được nút nào là việc của giao diện; ở đây chặn thứ tự.
   *
   * ⚠ Bước 3 (`received`) là bước DUY NHẤT làm tồn kho thay đổi, vì `v_shift_stock_balance`
   *   chỉ cộng phiếu `status='received'`. Trước đó mọi con số chỉ là đề nghị.
   */
  async advance(id: string, buoc: 'submit' | 'qc_confirm' | 'receive', employeeId?: string | null): Promise<void> {
    const map = {
      submit:     { from: 'draft',        to: 'submitted',    atCol: 'submitted_at',    byCol: 'submitted_by' },
      qc_confirm: { from: 'submitted',    to: 'qc_confirmed', atCol: 'qc_confirmed_at', byCol: 'qc_confirmed_by' },
      receive:    { from: 'qc_confirmed', to: 'received',     atCol: 'received_at',     byCol: 'received_by' },
    }[buoc]

    const body: Record<string, unknown> = {
      status: map.to,
      [map.atCol]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (employeeId) body[map.byCol] = employeeId

    // `.eq('status', from)` là chốt chống hai người bấm cùng lúc: người thứ hai không khớp
    // trạng thái nên không đổi được dòng nào, và ta báo lỗi thay vì ghi đè lặng lẽ.
    const { data, error } = await supabase
      .from('shift_production_reports')
      .update(body)
      .eq('id', id)
      .eq('status', map.from)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('Phiếu đã đổi trạng thái ở nơi khác. Tải lại trang rồi thử lại.')
    }
  },

  /** Huỷ phiếu. KHÔNG xoá — tờ giấy đã ký thì khoá, sai thì lập phiếu điều chỉnh. */
  async cancelReport(id: string, lyDo: string): Promise<void> {
    if (!lyDo?.trim()) throw new Error('Phải ghi lý do huỷ phiếu')
    const { error } = await supabase
      .from('shift_production_reports')
      .update({
        status: 'cancelled',
        handover_notes: `[HUỶ] ${lyDo.trim()}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .neq('status', 'received')   // đã vào kho thì không huỷ được, phải điều chỉnh
    if (error) throw error
  },

  /**
   * Tồn kho hiện tại theo mã, CHỈ cộng từ phiếu đã được thủ kho nhận.
   * Dùng để hiện cột "tồn ca trước" trên màn hình nhập — người ghi không phải lật tờ ca trước
   * rồi cộng trừ tay 24 dòng như hiện nay.
   */
  async getBalance(facilityId: string): Promise<Record<string, { tonBanh: number; tonKg: number }>> {
    const { data, error } = await supabase
      .from('v_shift_stock_balance')
      .select('material_id, ton_banh, ton_kg')
      .eq('facility_id', facilityId)
    if (error) throw error
    const out: Record<string, { tonBanh: number; tonKg: number }> = {}
    for (const r of (data || []) as Array<Record<string, unknown>>) {
      out[String(r.material_id)] = { tonBanh: num(r.ton_banh), tonKg: num(r.ton_kg) }
    }
    return out
  },
}

// ============================================================================
// MAPPERS
// ============================================================================

function mapReport(r: Record<string, unknown>): ShiftBook {
  const f = Array.isArray(r.facility) ? r.facility[0] : r.facility
  return {
    id: String(r.id),
    facilityId: (r.facility_id as string) ?? null,
    facilityName: (f as { name?: string } | null)?.name ?? null,
    reportDate: String(r.report_date ?? ''),
    shift: String(r.shift ?? ''),
    team: (r.team as string) ?? null,
    shiftFrom: (r.shift_from as string) ?? null,
    shiftTo: (r.shift_to as string) ?? null,
    headcount: numOrNull(r.headcount),
    incidents: (r.incidents as string) ?? null,
    handoverNotes: (r.handover_notes as string) ?? null,
    status: (r.status as ShiftBookStatus) ?? 'draft',
    isOpening: Boolean(r.is_opening),
    submittedAt: (r.submitted_at as string) ?? null,
    qcConfirmedAt: (r.qc_confirmed_at as string) ?? null,
    receivedAt: (r.received_at as string) ?? null,
    createdAt: String(r.created_at ?? ''),
  }
}

function mapLine(l: Record<string, unknown>): ShiftLine {
  return {
    id: String(l.id),
    materialId: String(l.material_id),
    code: String(l.code ?? ''),
    materialName: String(l.material_name ?? ''),
    sortOrder: num(l.sort_order),
    unit: (l.unit as string) ?? null,
    weightPerUnit: numOrNull(l.weight_per_unit),
    nhapBanh: num(l.nhap_banh),
    xuatBanh: num(l.xuat_banh),
    nhapKg: numOrNull(l.nhap_kg),
    xuatKg: numOrNull(l.xuat_kg),
    phaiNhapKgTay: Boolean(l.phai_nhap_kg_tay),
    // View chỉ trả `nhap_kg` = COALESCE(số gõ tay, số máy tính). Với mã phải nhập tay thì chính
    // nó LÀ số người đã gõ — trả về đúng ô đó, nếu không màn hình nạp lại sẽ mất số và
    // computeTotals báo "thiếu kg" trên một dòng thật ra đã đầy đủ.
    nhapKgManual: l.phai_nhap_kg_tay ? numOrNull(l.nhap_kg) : null,
    xuatKgManual: l.phai_nhap_kg_tay ? numOrNull(l.xuat_kg) : null,
    note: (l.note as string) ?? null,
  }
}
