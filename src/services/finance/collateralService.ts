// ============================================================================
// FINANCE — Tài sản đảm bảo (HĐBĐ) — Đợt 3c
// File: src/services/finance/collateralService.ts
// ============================================================================
import { supabase } from '../../lib/supabase'

export type CollateralStatus = 'active' | 'released'

export interface FinCollateral {
  id: string
  credit_line_id: string | null
  bank: string | null
  contract_ref: string | null
  asset_name: string
  asset_type: string | null
  appraisal_date: string | null
  appraisal_value: number | null
  secured_value: number | null
  status: CollateralStatus
  note: string | null
  created_at: string
  updated_at: string
  // join
  credit_line?: { bank: string; contract_no: string | null } | null
}

export type FinCollateralInput = Partial<Omit<FinCollateral, 'id' | 'created_at' | 'updated_at' | 'credit_line'>> & {
  asset_name: string; created_by?: string | null
}

export const ASSET_TYPE_LABEL: Record<string, string> = {
  tscd: 'Tài sản cố định', bds: 'Bất động sản', xe: 'Phương tiện/Xe',
  may_moc: 'Máy móc thiết bị', hang_ton: 'Hàng tồn kho',
  quyen_doi_no: 'Quyền đòi nợ (khoản phải thu)', khac: 'Khác',
}
export const COLLATERAL_STATUS_LABEL: Record<CollateralStatus, string> = {
  active: 'Đang thế chấp', released: 'Đã giải chấp',
}

export const collateralService = {
  async list(): Promise<FinCollateral[]> {
    const { data, error } = await supabase.from('fin_collaterals')
      .select('*, credit_line:fin_credit_lines(bank, contract_no)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as FinCollateral[]) || []
  },

  async create(input: FinCollateralInput): Promise<FinCollateral> {
    const { data, error } = await supabase.from('fin_collaterals').insert({
      credit_line_id: input.credit_line_id || null, bank: input.bank || null,
      contract_ref: input.contract_ref || null, asset_name: input.asset_name,
      asset_type: input.asset_type || null, appraisal_date: input.appraisal_date || null,
      appraisal_value: input.appraisal_value ?? null, secured_value: input.secured_value ?? null,
      status: input.status || 'active', note: input.note || null, created_by: input.created_by || null,
    }).select('*').single()
    if (error) throw error
    return data as FinCollateral
  },

  async update(id: string, patch: Partial<FinCollateralInput>): Promise<void> {
    const { error } = await supabase.from('fin_collaterals')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fin_collaterals').delete().eq('id', id)
    if (error) throw error
  },
}
