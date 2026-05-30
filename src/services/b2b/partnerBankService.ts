// ============================================================================
// FILE: src/services/b2b/partnerBankService.ts
// MODULE: TK ngân hàng đại lý B2B (multi-account/partner)
// ============================================================================
// 1 đại lý có thể có nhiều TK. 1 default in ra ĐNTT/Liên 2 mặc định.
// Resolver getEffectiveBank: nếu partner có payment_proxy → lấy bank proxy.
// ============================================================================

import { supabase } from '../../lib/supabase'

const TABLE = 'b2b_partner_banks'

export interface PartnerBank {
  id: string
  partner_id: string
  bank_account: string
  bank_name: string
  bank_holder: string | null
  is_default: boolean
  note: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PartnerBankInput = Partial<Omit<PartnerBank, 'id' | 'created_at' | 'updated_at'>>

/** Bank "hiệu lực" cho thanh toán: tự (self) hoặc qua proxy. */
export interface EffectiveBank {
  bank: PartnerBank
  via: 'self' | 'proxy'
  proxy_partner_id?: string
  proxy_partner_name?: string
}

export const partnerBankService = {
  async listForPartner(partnerId: string): Promise<PartnerBank[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('partner_id', partnerId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []) as PartnerBank[]
  },

  /** Lấy bank default trực tiếp của partner (không follow proxy). */
  async getDefaultDirect(partnerId: string): Promise<PartnerBank | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('partner_id', partnerId)
      .eq('is_active', true)
      .eq('is_default', true)
      .maybeSingle()
    if (error) throw error
    return data as PartnerBank | null
  },

  /**
   * Lấy bank hiệu lực để chi tiền cho partner.
   * Quy tắc: nếu partner có payment_proxy_partner_id → bank của proxy (theo Excel
   * thực tế: tiền chuyển qua TK đầu mối). Else → bank của chính partner.
   */
  async getEffectiveBank(partnerId: string): Promise<EffectiveBank | null> {
    // Step 1: load partner để biết có proxy không
    const { data: partner, error: pErr } = await supabase
      .from('b2b_partners')
      .select('id, name, payment_proxy_partner_id')
      .eq('id', partnerId)
      .maybeSingle()
    if (pErr) throw pErr
    if (!partner) return null

    const proxyId = (partner as any).payment_proxy_partner_id as string | null

    // Step 2: nếu có proxy, lấy bank của proxy
    if (proxyId) {
      const proxyBank = await this.getDefaultDirect(proxyId)
      if (proxyBank) {
        const { data: proxy } = await supabase
          .from('b2b_partners')
          .select('id, name')
          .eq('id', proxyId)
          .maybeSingle()
        return {
          bank: proxyBank,
          via: 'proxy',
          proxy_partner_id: proxyId,
          proxy_partner_name: (proxy as any)?.name || undefined,
        }
      }
    }

    // Step 3: bank của chính partner
    const selfBank = await this.getDefaultDirect(partnerId)
    if (selfBank) return { bank: selfBank, via: 'self' }
    return null
  },

  /** Batch: lấy effective bank cho nhiều partner cùng lúc (cho ĐNTT). */
  async getEffectiveBanksBatch(partnerIds: string[]): Promise<Map<string, EffectiveBank>> {
    const result = new Map<string, EffectiveBank>()
    const unique = [...new Set(partnerIds.filter(Boolean))]
    if (unique.length === 0) return result

    // Load partners + proxy mappings
    const { data: partners } = await supabase
      .from('b2b_partners')
      .select('id, name, payment_proxy_partner_id')
      .in('id', unique)
    if (!partners) return result

    // Resolve target partner_id per source (qua proxy nếu có)
    const targetIds = new Set<string>()
    const sourceToTarget = new Map<string, string>()  // sourceId → targetId
    for (const p of partners as any[]) {
      const target = p.payment_proxy_partner_id || p.id
      sourceToTarget.set(p.id, target)
      targetIds.add(target)
    }

    // Batch fetch default banks cho all targets
    const { data: banks } = await supabase
      .from(TABLE)
      .select('*')
      .in('partner_id', [...targetIds])
      .eq('is_active', true)
      .eq('is_default', true)
    const bankByPartner = new Map<string, PartnerBank>()
    for (const b of (banks || []) as PartnerBank[]) {
      bankByPartner.set(b.partner_id, b)
    }

    // Load proxy partner names (chỉ những target khác source)
    const proxyIds = [...new Set(
      [...sourceToTarget.entries()]
        .filter(([s, t]) => s !== t)
        .map(([_, t]) => t)
    )]
    const proxyNames = new Map<string, string>()
    if (proxyIds.length > 0) {
      const { data: proxies } = await supabase
        .from('b2b_partners')
        .select('id, name')
        .in('id', proxyIds)
      for (const p of (proxies || []) as any[]) proxyNames.set(p.id, p.name)
    }

    // Build result
    for (const [sourceId, targetId] of sourceToTarget.entries()) {
      const bank = bankByPartner.get(targetId)
      if (!bank) continue
      result.set(sourceId, {
        bank,
        via: sourceId === targetId ? 'self' : 'proxy',
        proxy_partner_id: sourceId === targetId ? undefined : targetId,
        proxy_partner_name: sourceId === targetId ? undefined : proxyNames.get(targetId),
      })
    }
    return result
  },

  async create(input: PartnerBankInput): Promise<PartnerBank> {
    const { data, error } = await supabase.from(TABLE).insert(input).select('*').single()
    if (error) throw error
    return data as PartnerBank
  },

  async update(id: string, input: PartnerBankInput): Promise<PartnerBank> {
    const { data, error } = await supabase.from(TABLE).update(input).eq('id', id).select('*').single()
    if (error) throw error
    return data as PartnerBank
  },

  /** Soft delete (set is_active=false). */
  async deactivate(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).update({ is_active: false, is_default: false }).eq('id', id)
    if (error) throw error
  },

  /** Set TK này làm default (trigger DB tự unset row cũ). */
  async setDefault(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).update({ is_default: true }).eq('id', id)
    if (error) throw error
  },

  /** Helper format hiển thị: "STK: 1234... — Tên — Bank". */
  formatBankLine(bank: PartnerBank | EffectiveBank): string {
    const b = 'bank' in bank ? bank.bank : bank
    const parts: string[] = []
    if (b.bank_account) parts.push(`STK: ${b.bank_account}`)
    if (b.bank_holder) parts.push(b.bank_holder)
    if (b.bank_name) parts.push(b.bank_name)
    return parts.join(' — ')
  },
}

export default partnerBankService
