// ============================================================================
// DEAL LIFECYCLE SERVICE — 3 UI hooks cho flow "Chạy đầu ra"
// File: src/services/b2b/dealLifecycleService.ts
//
// 3 actions Factory bấm tuần tự để advance deal qua các giai đoạn SX:
//   1. setSampleDrc(dealId, sampleDrc) — QC sample sau nhập kho (step 3/10)
//   2. startProduction(dealId) — Bắt đầu sản xuất (step 6/10)
//   3. finishProduction(dealId, finishedKg) — Ra TP + auto-compute actual_drc
//      (delegates sang onProductionFinish ở intakeProductionService — có
//       sẵn logic compute giá cuối)
//
// 3 hooks chỉ dùng cho deal `purchase_type='drc_after_production'`.
// Khác với `dealProductionService.ts` (link sang WMS production_orders).
// ============================================================================

import { supabase } from '../../lib/supabase'
import { onProductionFinish } from './intakeProductionService'
import { b2bNotificationService } from './b2bNotificationService'

// Helper — lookup partner_id from deal for notification routing
async function _getPartnerId(dealId: string): Promise<string | null> {
  const { data } = await supabase
    .from('b2b_deals')
    .select('partner_id, deal_number')
    .eq('id', dealId)
    .maybeSingle()
  return (data as { partner_id?: string })?.partner_id || null
}

// ============================================================================
// 1. Set sample DRC (QC sample sau nhập kho)
// ============================================================================

export interface SetSampleDrcInput {
  deal_id: string
  sample_drc: number  // %
}

export async function setSampleDrc(input: SetSampleDrcInput): Promise<void> {
  if (input.sample_drc <= 0 || input.sample_drc > 100) {
    throw new Error(`sample_drc=${input.sample_drc}% phải ∈ (0, 100]`)
  }

  // Verify deal eligibility
  const { data: deal, error: fetchErr } = await supabase
    .from('b2b_deals')
    .select('id, status, purchase_type, sample_drc, stock_in_count')
    .eq('id', input.deal_id)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!deal) throw new Error(`Deal ${input.deal_id} không tồn tại`)
  if (deal.purchase_type !== 'drc_after_production') {
    throw new Error(`Sample DRC chỉ áp dụng cho Chạy đầu ra (deal này: ${deal.purchase_type})`)
  }
  if (deal.status !== 'processing') {
    throw new Error(`Deal phải ở status=processing (sau nhập kho, trước BGĐ duyệt) — hiện tại: ${deal.status}`)
  }
  if ((deal.stock_in_count ?? 0) === 0) {
    throw new Error('Phải nhập kho ít nhất 1 batch trước khi nhập sample DRC')
  }

  const { error } = await supabase
    .from('b2b_deals')
    .update({ sample_drc: Number(input.sample_drc.toFixed(2)) })
    .eq('id', input.deal_id)

  if (error) throw new Error(`Update sample_drc thất bại: ${error.message}`)

  // Notify Partner (fire-and-forget, không block flow)
  const partnerId = await _getPartnerId(input.deal_id)
  void b2bNotificationService.notify({
    type: 'sample_drc_recorded',
    audience: 'partner',
    partner_id: partnerId,
    deal_id: input.deal_id,
    title: '🧪 Đã ghi nhận Sample DRC',
    message: `Nhà máy đã đo sample DRC = ${input.sample_drc.toFixed(2)}% trên lô hàng nhập kho. Đợi BGĐ duyệt Deal.`,
    link_url: `/portal/deals/${input.deal_id}`,
  })
}

// ============================================================================
// 2. Start production (Factory bấm sau khi advance paid)
// ============================================================================

export async function startProduction(dealId: string): Promise<void> {
  const { data: deal, error: fetchErr } = await supabase
    .from('b2b_deals')
    .select('id, status, purchase_type, production_started_at')
    .eq('id', dealId)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!deal) throw new Error(`Deal ${dealId} không tồn tại`)
  if (deal.purchase_type !== 'drc_after_production') {
    throw new Error(`Start production chỉ áp dụng cho Chạy đầu ra (deal này: ${deal.purchase_type})`)
  }
  if (deal.status !== 'accepted') {
    throw new Error(`Deal phải ở status=accepted mới start production (hiện tại: ${deal.status})`)
  }
  if (deal.production_started_at) {
    throw new Error('Đã bắt đầu sản xuất từ trước. Không start lại.')
  }

  // Check advance acknowledged (đại lý đã nhận) trước khi start
  const { data: advances } = await supabase
    .from('b2b_advances')
    .select('id, status')
    .eq('deal_id', dealId)
  const hasAdvanceConfirmed = (advances || []).some(
    (a: { status: string }) => ['acknowledged', 'paid'].includes(a.status),
  )
  if (!hasAdvanceConfirmed) {
    throw new Error('Chưa có tạm ứng nào đã xác nhận. Đại lý cần ack advance trước khi start SX.')
  }

  const { error } = await supabase
    .from('b2b_deals')
    .update({ production_started_at: new Date().toISOString() })
    .eq('id', dealId)

  if (error) throw new Error(`Start production thất bại: ${error.message}`)

  // Notify Partner — nhà máy bắt đầu SX, đại lý biết để theo dõi
  const partnerId = await _getPartnerId(dealId)
  void b2bNotificationService.notify({
    type: 'production_started',
    audience: 'partner',
    partner_id: partnerId,
    deal_id: dealId,
    title: '🏭 Nhà máy đã bắt đầu sản xuất',
    message: 'Lô hàng của bạn đang được sản xuất. Khi hoàn thành QC final, ERP sẽ ghi giá cuối theo DRC thực tế.',
    link_url: `/portal/deals/${dealId}`,
  })
}

// ============================================================================
// 3. Finish production — delegate sang onProductionFinish ở intakeProductionService
// ============================================================================

export interface FinishProductionInput {
  deal_id: string
  finished_product_kg: number
  actual_drc_override?: number
}

export async function finishProduction(input: FinishProductionInput) {
  // Pre-check production_started_at (onProductionFinish không check)
  const { data: deal } = await supabase
    .from('b2b_deals')
    .select('id, production_started_at, finished_product_kg')
    .eq('id', input.deal_id)
    .maybeSingle()
  if (!deal) throw new Error(`Deal ${input.deal_id} không tồn tại`)
  if (!deal.production_started_at) {
    throw new Error('Chưa start production. Phải bấm "Bắt đầu sản xuất" trước.')
  }
  if (deal.finished_product_kg && deal.finished_product_kg > 0) {
    throw new Error(`Đã có finished_product_kg=${deal.finished_product_kg} kg. Không finish lại.`)
  }

  const result = await onProductionFinish({
    deal_id: input.deal_id,
    finished_product_kg: input.finished_product_kg,
    actual_drc_override: input.actual_drc_override,
  })

  // Notify Partner — bước quan trọng nhất, có giá cuối
  if (result.success) {
    const partnerId = await _getPartnerId(input.deal_id)
    const drcStr = result.actual_drc.toFixed(2)
    const grossStr = result.final_gross_vnd.toLocaleString('vi-VN')

    void b2bNotificationService.notify({
      type: 'production_finished',
      audience: 'partner',
      partner_id: partnerId,
      deal_id: input.deal_id,
      title: '✅ Sản xuất xong — giá cuối chốt',
      message: `Actual DRC = ${drcStr}%. Giá cuối = ${grossStr}đ. Đợi nhà máy quyết toán + thanh toán.`,
      link_url: `/portal/deals/${input.deal_id}`,
    })
  }

  return result
}

export default { setSampleDrc, startProduction, finishProduction }
