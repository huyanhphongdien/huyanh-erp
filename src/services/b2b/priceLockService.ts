// ============================================================================
// FILE: src/services/b2b/priceLockService.ts
// MODULE: Thu mua — Phiếu chốt giá (PHIẾU CHỐT GIÁ, BM CL.BMQT.KH.01.01)
// Thoả thuận giá TRƯỚC khi cân. Bảng: public.b2b_price_lock_tickets.
// ============================================================================

import { supabase } from '../../lib/supabase'

const TABLE = 'b2b_price_lock_tickets'

export type PriceLockStatus = 'draft' | 'locked' | 'used' | 'cancelled'
export type PriceLockCurrency = 'VND' | 'KIP' | 'THB' | 'OTHER'
export type PurchaseMethod = 'cum_daugia' | 'dai_ly' | 'ho_nd' | 'cong_ty'

export const PURCHASE_METHOD_LABELS: Record<PurchaseMethod, string> = {
  cum_daugia: 'Cụm/Đấu giá',
  dai_ly: 'Đại lý',
  ho_nd: 'Hộ ND',
  cong_ty: 'Công ty',
}

export const PRICE_LOCK_STATUS_LABELS: Record<PriceLockStatus, string> = {
  draft: 'Nháp',
  locked: 'Đã chốt',
  used: 'Đã dùng',
  cancelled: 'Đã huỷ',
}

/** State machine: từ trạng thái nào → đi được sang trạng thái nào.
 *  draft → locked/cancelled. locked → used/cancelled. used → cancelled (terminal warning). */
export const VALID_STATUS_TRANSITIONS: Record<PriceLockStatus, PriceLockStatus[]> = {
  draft: ['locked', 'cancelled'],
  locked: ['used', 'cancelled'],
  used: ['cancelled'],
  cancelled: [],
}

/** Checkbox "CÁC PHÍ PHẢI CHI" trên phiếu chốt giá. */
export const FEE_FLAG_LABELS: Record<string, string> = {
  boc_xep: 'Bốc xếp',
  ben_bai: 'Bến bãi',
  thue_xa_ban: 'Thuế Xã/Bản',
  giay_to_di_duong: 'Giấy tờ đi đường',
  hoa_hong: 'Hoa hồng',
  bo_hang: 'Bo hàng',
  thue_xe_van_tai: 'Thuê xe vận tải',
  khac: 'Khác',
}

/** Dòng phí mặc định khi tạo phiếu mới (theo mẫu HAQT). */
export const DEFAULT_FEES = (): PriceLockFee[] => [
  { label: 'Hoa hồng', basis: 'ton', amount: 0 },
  { label: 'Bốc xếp', basis: 'ton', amount: 0 },
  { label: 'Thuê xe vận tải', basis: 'ton', amount: 0 },
  { label: 'Bến bãi', basis: 'lot', amount: 0 },
  { label: 'Thuế Xã/Bản', basis: 'lot', amount: 0 },
  { label: 'Giấy tờ đi đường', basis: 'lot', amount: 0 },
]

/** 1 dòng đại lý trống. */
export const EMPTY_DEALER = (): PriceLockDealer => ({
  partner_id: null, dealer_name: '', expected_weight_kg: null,
  expected_drc_percent: null, price_per_ton: null, note: null,
})

/** 1 dòng phí. basis: 'ton' = theo tấn, 'lot' = theo lô. */
export interface PriceLockFee {
  label: string
  basis: 'ton' | 'lot'
  amount: number
}

/** 1 đại lý trong phiếu chốt giá — mỗi đại lý 1 giá áp riêng. */
export interface PriceLockDealer {
  partner_id: string | null
  dealer_name: string
  expected_weight_kg: number | null
  expected_drc_percent: number | null
  price_per_ton: number | null
  note: string | null
}

export interface PriceLockTicket {
  id: string
  code: string | null
  status: PriceLockStatus

  facility_id: string | null
  facility_label: string | null

  /** Danh sách đại lý + giá áp (mỗi dòng 1 đại lý). */
  dealer_lines: PriceLockDealer[]

  currency: PriceLockCurrency
  currency_other: string | null
  rate_thb_kip: number | null
  rate_kip_vnd: number | null
  rate_thb_vnd: number | null

  purchase_method: PurchaseMethod | null

  price_floor_per_ton: number | null
  price_mid_per_ton: number | null
  price_high_per_ton: number | null

  fees: PriceLockFee[]
  fee_flags: Record<string, boolean>

  lock_date: string
  weigh_from: string | null
  weigh_to: string | null

  signer_locker: string | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PriceLockInput = Partial<Omit<PriceLockTicket, 'id' | 'code' | 'created_at' | 'updated_at'>>

export interface PriceLockListParams {
  search?: string          // theo code / customer_name
  status?: PriceLockStatus
  facility_id?: string
  date_from?: string       // theo lock_date (YYYY-MM-DD)
  date_to?: string
  limit?: number
}

function normalize(row: any): PriceLockTicket {
  return {
    ...row,
    dealer_lines: Array.isArray(row?.dealer_lines) ? row.dealer_lines : [],
    fees: Array.isArray(row?.fees) ? row.fees : [],
    fee_flags: row?.fee_flags && typeof row.fee_flags === 'object' ? row.fee_flags : {},
  } as PriceLockTicket
}

export const priceLockService = {
  async list(params: PriceLockListParams = {}): Promise<PriceLockTicket[]> {
    let q = supabase.from(TABLE).select('*')
    if (params.status) q = q.eq('status', params.status)
    if (params.facility_id) q = q.eq('facility_id', params.facility_id)
    if (params.date_from) q = q.gte('lock_date', params.date_from)
    if (params.date_to) q = q.lte('lock_date', params.date_to)
    if (params.search?.trim()) {
      const s = params.search.trim()
      q = q.or(`code.ilike.%${s}%,facility_label.ilike.%${s}%`)
    }
    q = q.order('lock_date', { ascending: false }).order('created_at', { ascending: false })
    if (params.limit) q = q.limit(params.limit)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(normalize)
  },

  async getById(id: string): Promise<PriceLockTicket | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? normalize(data) : null
  },

  async create(input: PriceLockInput): Promise<PriceLockTicket> {
    const { data, error } = await supabase.from(TABLE).insert(input).select('*').single()
    if (error) throw error
    return normalize(data)
  },

  async update(id: string, input: PriceLockInput): Promise<PriceLockTicket> {
    // State machine: nếu đổi status, validate transition hợp lệ.
    if (input.status) {
      const current = await this.getById(id)
      if (current && current.status !== input.status) {
        const allowed = VALID_STATUS_TRANSITIONS[current.status] || []
        if (!allowed.includes(input.status)) {
          throw new Error(
            `Không thể chuyển trạng thái ${PRICE_LOCK_STATUS_LABELS[current.status]} → ${PRICE_LOCK_STATUS_LABELS[input.status]}`
          )
        }
      }
    }
    const { data, error } = await supabase.from(TABLE).update(input).eq('id', id).select('*').single()
    if (error) throw error
    return normalize(data)
  },

  /** Đánh dấu PCG = 'used' sau khi resolver match thành công vào 1 ĐNTT.
   *  Không throw nếu PCG đã 'used' (idempotent). */
  async markUsed(id: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ status: 'used' })
      .eq('id', id)
      .eq('status', 'locked')   // chỉ chuyển nếu hiện đang locked
    if (error) throw error
  },

  /** XÓA HẲN — chỉ phiếu NHÁP (chưa chốt). Phiếu đã chốt/đã dùng → dùng cancel(). */
  async remove(id: string): Promise<void> {
    const cur = await this.getById(id)
    if (cur && cur.status !== 'draft') {
      throw new Error('Chỉ xóa được phiếu NHÁP. Phiếu đã chốt → dùng "Huỷ".')
    }
    const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('status', 'draft')
    if (error) throw new Error(error.message)
  },

  /** HUỶ (mềm) — chuyển 'cancelled', giữ lịch sử. Chặn phiếu ĐÃ DÙNG (đã vào ĐNTT). */
  async cancel(id: string): Promise<void> {
    const cur = await this.getById(id)
    if (!cur || cur.status === 'cancelled') return
    if (cur.status === 'used') {
      throw new Error('Phiếu ĐÃ DÙNG (đã gom vào đề nghị thanh toán) — không thể huỷ. Xử lý ở đề nghị thanh toán trước.')
    }
    const { error } = await supabase
      .from(TABLE)
      .update({ status: 'cancelled' })
      .eq('id', id)
      .in('status', ['draft', 'locked'])
    if (error) throw new Error(error.message)
  },
}

export default priceLockService
