import { supabase } from '../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export interface VariantAttribute {
  id: string
  code: string
  name: string
  description?: string
  unit?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VariantAttributeValue {
  id: string
  attribute_id: string
  value: string
  display_value?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MaterialVariant {
  id: string
  material_id: string
  sku?: string
  barcode?: string
  variant_name: string
  reference_price?: number
  last_purchase_price?: number
  last_purchase_date?: string
  stock_quantity: number
  min_stock: number
  max_stock?: number
  weight?: number
  dimensions?: string
  image_url?: string
  notes?: string
  sort_order: number
  status: 'active' | 'inactive' | 'discontinued'
  created_at: string
  updated_at: string
  material_code?: string
  material_name?: string
  category_id?: string
  type_id?: string
  unit_id?: string
  category_name?: string
  type_name?: string
  unit_name?: string
  unit_symbol?: string
  attributes?: VariantAttributeDetail[]
}

export interface VariantAttributeDetail {
  attribute_id: string
  attribute_code: string
  attribute_name: string
  attribute_unit?: string
  value_id: string
  value: string
  display_value?: string
}

export interface VariantAttributeFormData {
  code: string
  name: string
  description?: string
  unit?: string
  sort_order?: number
  is_active?: boolean
}

export interface VariantAttributeValueFormData {
  attribute_id: string
  value: string
  display_value?: string
  sort_order?: number
  is_active?: boolean
}

export interface MaterialVariantFormData {
  material_id: string
  sku?: string
  barcode?: string
  variant_name: string
  reference_price?: number
  stock_quantity?: number
  min_stock?: number
  max_stock?: number
  weight?: number
  dimensions?: string
  image_url?: string
  notes?: string
  sort_order?: number
  status?: 'active' | 'inactive' | 'discontinued'
  attributes?: { attribute_id: string; value_id: string }[]
}

// ============================================
// VARIANT ATTRIBUTES SERVICE
// ============================================

export const variantAttributeService = {
  async getAll(activeOnly = false): Promise<VariantAttribute[]> {
    let query = supabase.from('variant_attributes').select('*').order('sort_order', { ascending: true })
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async getById(id: string): Promise<VariantAttribute | null> {
    const { data, error } = await supabase.from('variant_attributes').select('*').eq('id', id).single()
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  async create(formData: VariantAttributeFormData): Promise<VariantAttribute> {
    const { data, error } = await supabase.from('variant_attributes').insert(formData).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, formData: Partial<VariantAttributeFormData>): Promise<VariantAttribute> {
    const { data, error } = await supabase.from('variant_attributes')
      .update({ ...formData, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('variant_attributes').delete().eq('id', id)
    if (error) throw error
  },

  async getWithValues(activeOnly = false): Promise<(VariantAttribute & { values: VariantAttributeValue[] })[]> {
    let query = supabase.from('variant_attributes').select('*, values:variant_attribute_values(*)').order('sort_order', { ascending: true })
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query
    if (error) throw error
    return data || []
  }
}

// ============================================
// VARIANT ATTRIBUTE VALUES SERVICE
// ============================================

export const variantAttributeValueService = {
  async getByAttribute(attributeId: string, activeOnly = false): Promise<VariantAttributeValue[]> {
    let query = supabase.from('variant_attribute_values').select('*').eq('attribute_id', attributeId).order('sort_order', { ascending: true })
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async create(formData: VariantAttributeValueFormData): Promise<VariantAttributeValue> {
    const { data, error } = await supabase.from('variant_attribute_values').insert(formData).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, formData: Partial<VariantAttributeValueFormData>): Promise<VariantAttributeValue> {
    const { data, error } = await supabase.from('variant_attribute_values')
      .update({ ...formData, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('variant_attribute_values').delete().eq('id', id)
    if (error) throw error
  },

  async createBulk(values: VariantAttributeValueFormData[]): Promise<VariantAttributeValue[]> {
    const { data, error } = await supabase.from('variant_attribute_values').insert(values).select()
    if (error) throw error
    return data || []
  }
}

// ============================================
// MATERIAL VARIANTS SERVICE
// ============================================

export const materialVariantService = {
  async getByMaterial(materialId: string): Promise<MaterialVariant[]> {
    const { data, error } = await supabase.from('v_material_variants_detail').select('*').eq('material_id', materialId).order('sort_order', { ascending: true })
    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabase.from('material_variants').select('*').eq('material_id', materialId).order('sort_order', { ascending: true })
      if (fallbackError) throw fallbackError
      return fallbackData || []
    }
    return data || []
  },

  async getById(id: string): Promise<MaterialVariant | null> {
    const { data, error } = await supabase.from('v_material_variants_detail').select('*').eq('id', id).single()
    if (error) {
      if (error.code === 'PGRST116') return null
      const { data: fallbackData, error: fallbackError } = await supabase.from('material_variants').select('*').eq('id', id).single()
      if (fallbackError) {
        if (fallbackError.code === 'PGRST116') return null
        throw fallbackError
      }
      return fallbackData
    }
    return data
  },

  async create(formData: MaterialVariantFormData): Promise<MaterialVariant> {
    const { attributes, ...variantData } = formData
    const { data: variant, error: variantError } = await supabase.from('material_variants').insert(variantData).select().single()
    if (variantError) throw variantError

    if (attributes && attributes.length > 0) {
      const variantAttrs = attributes.map(attr => ({ variant_id: variant.id, attribute_id: attr.attribute_id, attribute_value_id: attr.value_id }))
      const { error: attrError } = await supabase.from('material_variant_attributes').insert(variantAttrs)
      if (attrError) throw attrError
    }

    await supabase.from('materials').update({ has_variants: true }).eq('id', formData.material_id)
    return variant
  },

  async update(id: string, formData: Partial<MaterialVariantFormData>): Promise<MaterialVariant> {
    const { attributes, ...variantData } = formData
    const { data: variant, error: variantError } = await supabase.from('material_variants')
      .update({ ...variantData, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (variantError) throw variantError

    if (attributes !== undefined) {
      await supabase.from('material_variant_attributes').delete().eq('variant_id', id)
      if (attributes.length > 0) {
        const variantAttrs = attributes.map(attr => ({ variant_id: id, attribute_id: attr.attribute_id, attribute_value_id: attr.value_id }))
        const { error: attrError } = await supabase.from('material_variant_attributes').insert(variantAttrs)
        if (attrError) throw attrError
      }
    }
    return variant
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('material_variants').update({ status: 'discontinued', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async hardDelete(id: string): Promise<void> {
    const { error } = await supabase.from('material_variants').delete().eq('id', id)
    if (error) throw error
  },

  async updateStock(id: string, quantity: number): Promise<void> {
    const { error } = await supabase.from('material_variants').update({ stock_quantity: quantity, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async updatePurchasePrice(id: string, price: number): Promise<void> {
    const { error } = await supabase.from('material_variants').update({ 
      last_purchase_price: price, last_purchase_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() 
    }).eq('id', id)
    if (error) throw error
  },

  async getLowStock(limit = 20): Promise<MaterialVariant[]> {
    const { data, error } = await supabase.from('material_variants').select('*, material:materials(id, code, name)')
      .eq('status', 'active').order('stock_quantity', { ascending: true }).limit(100)
    if (error) throw error
    const filtered = (data || []).filter(v => v.stock_quantity <= v.min_stock)
    return filtered.slice(0, limit)
  },

  async search(params: { materialId?: string; search?: string; status?: string; lowStock?: boolean; limit?: number }): Promise<MaterialVariant[]> {
    let query = supabase.from('material_variants').select('*, material:materials(id, code, name, category_id, type_id, unit_id)')
    if (params.materialId) query = query.eq('material_id', params.materialId)
    if (params.search) query = query.or(`variant_name.ilike.%${params.search}%,sku.ilike.%${params.search}%`)
    if (params.status) query = query.eq('status', params.status)
    query = query.order('material_id').order('sort_order', { ascending: true }).limit(params.limit || 50)
    const { data, error } = await query
    if (error) throw error
    let results = data || []
    if (params.lowStock) results = results.filter(v => v.stock_quantity <= v.min_stock)
    return results
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function formatVariantName(attributes: VariantAttributeDetail[]): string {
  return attributes.sort((a, b) => a.attribute_code.localeCompare(b.attribute_code)).map(attr => attr.display_value || attr.value).join(' - ')
}

export function isLowStock(variant: MaterialVariant): boolean {
  return variant.stock_quantity <= variant.min_stock
}

export default { attributes: variantAttributeService, values: variantAttributeValueService, variants: materialVariantService }