// ============================================================================
// PARTNER MATCHING SERVICE — Gợi ý đại lý phù hợp cho nhu cầu mua
// File: src/services/b2b/partnerMatchingService.ts
// Score = weighted sum of: product match, DRC, region, tier, volume
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface MatchCriteria {
  product_type?: string      // 'mu_tap', 'mu_nuoc', ...
  min_drc?: number           // 60
  quantity_tons?: number     // 50
  region?: string            // 'Phong Điền', 'A Lưới'
  province?: string
}

export interface PartnerMatch {
  partner_id: string
  name: string
  code: string
  tier: string
  country: string
  region_code: string | null
  score: number              // 0-100
  reasons: string[]          // ["Đã giao 120T mủ tạp", "DRC avg 62%"]
  stats: {
    totalDeals: number
    totalVolumeTons: number
    avgDrc: number | null
    avgPaymentDays: number | null
    productMatch: boolean
  }
}

const WEIGHTS = {
  product: 0.30,
  drc: 0.25,
  region: 0.20,
  tier: 0.15,
  volume: 0.10,
}

const TIER_SCORE: Record<string, number> = {
  platinum: 100, gold: 80, silver: 60, bronze: 40, new: 20,
}

export const partnerMatchingService = {

  async findMatches(criteria: MatchCriteria, limit = 10): Promise<PartnerMatch[]> {
    // 1. Get all active partners
    const { data: partners } = await supabase
      .from('b2b_partners')
      .select('id, name, code, tier, country, region_code, province')
      .eq('is_active', true)
      .eq('status', 'active')

    if (!partners || partners.length === 0) return []

    // 2. Get deal history for scoring
    const partnerIds = partners.map(p => p.id)
    const { data: deals } = await supabase
      .from('b2b_deals')
      .select('partner_id, product_code, quantity_kg, actual_drc, created_at, status')
      .in('partner_id', partnerIds)
      .not('status', 'eq', 'cancelled')

    // 3. Aggregate per partner
    const statsMap: Record<string, {
      totalDeals: number; totalKg: number; drcSum: number; drcCount: number;
      productCounts: Record<string, number>
    }> = {}

    for (const d of (deals || [])) {
      if (!statsMap[d.partner_id]) {
        statsMap[d.partner_id] = { totalDeals: 0, totalKg: 0, drcSum: 0, drcCount: 0, productCounts: {} }
      }
      const s = statsMap[d.partner_id]
      s.totalDeals++
      s.totalKg += d.quantity_kg || 0
      if (d.actual_drc) { s.drcSum += d.actual_drc; s.drcCount++ }
      if (d.product_code) { s.productCounts[d.product_code] = (s.productCounts[d.product_code] || 0) + 1 }
    }

    // 4. Score each partner
    const results: PartnerMatch[] = partners.map(p => {
      const s = statsMap[p.id] || { totalDeals: 0, totalKg: 0, drcSum: 0, drcCount: 0, productCounts: {} }
      const avgDrc = s.drcCount > 0 ? Math.round(s.drcSum / s.drcCount * 10) / 10 : null
      const totalTons = Math.round(s.totalKg / 100) / 10
      const reasons: string[] = []

      // Product match score (0-100)
      let productScore = 0
      const productMatch = criteria.product_type ? (s.productCounts[criteria.product_type] || 0) > 0 : false
      if (productMatch) {
        const count = s.productCounts[criteria.product_type!] || 0
        productScore = Math.min(100, count * 20)
        reasons.push(`Đã giao ${count} deal ${criteria.product_type}`)
      } else if (s.totalDeals > 0) {
        productScore = 30 // Has deals but different product
      }

      // DRC score (0-100)
      let drcScore = 50 // default
      if (avgDrc != null && criteria.min_drc) {
        if (avgDrc >= criteria.min_drc) {
          drcScore = 100
          reasons.push(`DRC avg: ${avgDrc}% ≥ ${criteria.min_drc}%`)
        } else {
          drcScore = Math.max(0, 100 - (criteria.min_drc - avgDrc) * 10)
          reasons.push(`DRC avg: ${avgDrc}% (yêu cầu ${criteria.min_drc}%)`)
        }
      }

      // Region score (0-100)
      let regionScore = 50
      if (criteria.region && p.region_code) {
        if (p.region_code.toLowerCase().includes(criteria.region.toLowerCase()) ||
            (p.province && p.province.toLowerCase().includes(criteria.region.toLowerCase()))) {
          regionScore = 100
          reasons.push(`Khu vực: ${p.region_code || p.province}`)
        }
      }

      // Tier score
      const tierScore = TIER_SCORE[p.tier || 'new'] || 20
      if (p.tier && p.tier !== 'new') reasons.push(`Hạng: ${p.tier}`)

      // Volume score (0-100)
      let volumeScore = 0
      if (totalTons > 0) {
        volumeScore = Math.min(100, totalTons / (criteria.quantity_tons || 50) * 100)
        reasons.push(`${totalTons} tấn (${s.totalDeals} deals)`)
      }

      // Weighted total
      const score = Math.round(
        productScore * WEIGHTS.product +
        drcScore * WEIGHTS.drc +
        regionScore * WEIGHTS.region +
        tierScore * WEIGHTS.tier +
        volumeScore * WEIGHTS.volume
      )

      return {
        partner_id: p.id,
        name: p.name,
        code: p.code,
        tier: p.tier || 'new',
        country: p.country || 'VN',
        region_code: p.region_code,
        score,
        reasons,
        stats: {
          totalDeals: s.totalDeals,
          totalVolumeTons: totalTons,
          avgDrc,
          avgPaymentDays: null,
          productMatch,
        },
      }
    })

    // 5. Sort by score desc, return top N
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  },
}
