// ============================================================================
// PRODUCTION STEP SERVICE — 10 công đoạn SVR
// File: src/services/production/productionStepService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// 10 BƯỚC CHUẨN SVR
// ============================================================================

export interface StepTemplate {
  step_number: number
  step_name: string
  param_fields: { key: string; label: string; type: 'number' | 'text' | 'select'; unit?: string; options?: string[] }[]
  estimated_minutes: number
}

export const SVR_STEP_TEMPLATES: StepTemplate[] = [
  {
    step_number: 1, step_name: 'Tiếp nhận NL', estimated_minutes: 60,
    param_fields: [
      { key: 'gross_weight_kg', label: 'TL Gross', type: 'number', unit: 'kg' },
      { key: 'tare_weight_kg', label: 'TL Tare', type: 'number', unit: 'kg' },
      { key: 'drc_sample', label: 'DRC mẫu', type: 'number', unit: '%' },
      { key: 'vehicle_plate', label: 'Biển số xe', type: 'text' },
      { key: 'supplier', label: 'NCC / Đại lý', type: 'text' },
    ],
  },
  {
    step_number: 2, step_name: 'Xử lý / Ủ mủ', estimated_minutes: 60,
    param_fields: [
      { key: 'lot_count', label: 'Số lô', type: 'number' },
      { key: 'soak_days', label: 'Số ngày ủ', type: 'number', unit: 'ngày' },
      { key: 'mesh_size', label: 'Rây (mesh)', type: 'number' },
    ],
  },
  {
    step_number: 3, step_name: 'Pha trộn', estimated_minutes: 60,
    param_fields: [
      { key: 'drc_before', label: 'DRC trước', type: 'number', unit: '%' },
      { key: 'drc_target', label: 'DRC mục tiêu', type: 'number', unit: '%' },
      { key: 'na2s2o5_kg', label: 'Na₂S₂O₅', type: 'number', unit: 'kg' },
      { key: 'water_liters', label: 'Nước thêm', type: 'number', unit: 'lít' },
      { key: 'mix_duration_min', label: 'Thời gian khuấy', type: 'number', unit: 'phút' },
    ],
  },
  {
    step_number: 4, step_name: 'Đánh đông', estimated_minutes: 720,
    param_fields: [
      { key: 'acid_type', label: 'Loại acid', type: 'select', options: ['formic', 'acetic'] },
      { key: 'acid_concentration', label: 'Nồng độ', type: 'number', unit: '%' },
      { key: 'acid_volume_liters', label: 'Lượng acid', type: 'number', unit: 'lít' },
      { key: 'ph_value', label: 'pH', type: 'number' },
      { key: 'coagulation_hours', label: 'Thời gian đông', type: 'number', unit: 'giờ' },
    ],
  },
  {
    step_number: 5, step_name: 'Cán kéo', estimated_minutes: 180,
    param_fields: [
      { key: 'pass_count', label: 'Số lần cán', type: 'number' },
      { key: 'final_thickness_mm', label: 'Độ dày cuối', type: 'number', unit: 'mm' },
      { key: 'machine_id', label: 'Máy cán', type: 'text' },
    ],
  },
  {
    step_number: 6, step_name: 'Băm cốm', estimated_minutes: 120,
    param_fields: [
      { key: 'crumb_size', label: 'Kích thước cốm', type: 'text' },
      { key: 'wash_count', label: 'Số lần rửa', type: 'number' },
      { key: 'vibration_ok', label: 'Sàng rung OK', type: 'select', options: ['yes', 'no'] },
    ],
  },
  {
    step_number: 7, step_name: 'Sấy', estimated_minutes: 210,
    param_fields: [
      { key: 'temperature_c', label: 'Nhiệt độ', type: 'number', unit: '°C' },
      { key: 'duration_hours', label: 'Thời gian', type: 'number', unit: 'giờ' },
      { key: 'dryer_zone', label: 'Ngăn sấy', type: 'select', options: ['1', '2'] },
      { key: 'moisture_check', label: 'Kiểm ẩm OK', type: 'select', options: ['yes', 'no'] },
    ],
  },
  {
    step_number: 8, step_name: 'Ép bành', estimated_minutes: 30,
    param_fields: [
      { key: 'bale_weight_kg', label: 'KL mỗi bành', type: 'number', unit: 'kg' },
      { key: 'bale_count', label: 'Số bành', type: 'number' },
      { key: 'cooling_ok', label: 'Làm nguội OK', type: 'select', options: ['yes', 'no'] },
    ],
  },
  {
    step_number: 9, step_name: 'QC kiểm nghiệm', estimated_minutes: 480,
    param_fields: [
      { key: 'drc_percent', label: 'DRC', type: 'number', unit: '%' },
      { key: 'pri', label: 'PRI', type: 'number' },
      { key: 'mooney_ml', label: 'Mooney ML(1+4)', type: 'number' },
      { key: 'ash_percent', label: 'Tro', type: 'number', unit: '%' },
      { key: 'volatile_percent', label: 'Bay hơi', type: 'number', unit: '%' },
      { key: 'nitrogen_percent', label: 'Nitơ', type: 'number', unit: '%' },
      { key: 'dirt_percent', label: 'Tạp chất (Po)', type: 'number', unit: '%' },
      { key: 'lovibond', label: 'Lovibond (3L)', type: 'number' },
      { key: 'qc_result', label: 'Kết quả', type: 'select', options: ['passed', 'warning', 'failed'] },
    ],
  },
  {
    step_number: 10, step_name: 'Đóng gói & Nhập kho', estimated_minutes: 120,
    param_fields: [
      { key: 'package_type', label: 'Loại bao', type: 'select', options: ['PE', 'kraft'] },
      { key: 'label_grade', label: 'Nhãn grade', type: 'text' },
      { key: 'pallet_count', label: 'Số pallet', type: 'number' },
      { key: 'total_weight_kg', label: 'Tổng KL', type: 'number', unit: 'kg' },
    ],
  },
]

// ============================================================================
// TYPES
// ============================================================================

export interface ProductionStepLog {
  id: string
  production_order_id: string
  step_number: number
  step_name: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  operator_id: string | null
  started_at: string | null
  completed_at: string | null
  duration_minutes: number | null
  parameters: Record<string, any>
  notes: string | null
  created_at: string
}

// ============================================================================
// SERVICE
// ============================================================================

export const productionStepService = {

  /** Tạo 10 step logs cho 1 LSX mới */
  async initSteps(productionOrderId: string): Promise<void> {
    const rows = SVR_STEP_TEMPLATES.map(t => ({
      production_order_id: productionOrderId,
      step_number: t.step_number,
      step_name: t.step_name,
      status: 'pending',
      parameters: {},
    }))
    const { error } = await supabase.from('production_step_logs').insert(rows)
    if (error) throw error
  },

  /** Lấy DS steps theo LSX */
  async getByOrder(orderId: string): Promise<ProductionStepLog[]> {
    const { data, error } = await supabase
      .from('production_step_logs')
      .select('*')
      .eq('production_order_id', orderId)
      .order('step_number')
    if (error) throw error
    return data || []
  },

  /** Bắt đầu 1 bước */
  async startStep(orderId: string, stepNumber: number, operatorId: string): Promise<void> {
    const { error } = await supabase
      .from('production_step_logs')
      .update({
        status: 'in_progress',
        operator_id: operatorId,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('production_order_id', orderId)
      .eq('step_number', stepNumber)
    if (error) throw error
  },

  /** Hoàn tất 1 bước + ghi thông số */
  async completeStep(orderId: string, stepNumber: number, params: Record<string, any>, notes?: string): Promise<void> {
    const now = new Date().toISOString()

    // Get started_at to calculate duration
    const { data: step } = await supabase
      .from('production_step_logs')
      .select('started_at')
      .eq('production_order_id', orderId)
      .eq('step_number', stepNumber)
      .single()

    let duration: number | null = null
    if (step?.started_at) {
      duration = Math.round((Date.now() - new Date(step.started_at).getTime()) / 60000)
    }

    const { error } = await supabase
      .from('production_step_logs')
      .update({
        status: 'completed',
        completed_at: now,
        duration_minutes: duration,
        parameters: params,
        notes: notes || null,
        updated_at: now,
      })
      .eq('production_order_id', orderId)
      .eq('step_number', stepNumber)
    if (error) throw error
  },

  /** Bỏ qua 1 bước */
  async skipStep(orderId: string, stepNumber: number, reason: string): Promise<void> {
    const { error } = await supabase
      .from('production_step_logs')
      .update({
        status: 'skipped',
        notes: `Bỏ qua: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('production_order_id', orderId)
      .eq('step_number', stepNumber)
    if (error) throw error
  },

  /** Lấy template 10 bước */
  getStepTemplates(): StepTemplate[] {
    return SVR_STEP_TEMPLATES
  },
}

export default productionStepService
