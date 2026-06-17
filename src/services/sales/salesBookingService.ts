// ============================================================================
// SALES BOOKING SERVICE — Nhiều booking/lô cho 1 đơn hàng bán (Mức 2)
// File: src/services/sales/salesBookingService.ts
// Bảng: sales_order_bookings (migration sales_order_bookings.sql)
// ============================================================================
import { supabase } from '../../lib/supabase'

export interface SalesBooking {
  id: string
  sales_order_id: string
  lot_label: string | null
  booking_no: string | null
  shipping_line: string | null
  vessel_name: string | null
  voyage_no: string | null
  etd: string | null
  eta: string | null
  cutoff: string | null
  container_count: number | null
  port_of_loading: string | null
  port_of_destination: string | null
  bl_number: string | null
  file_url: string | null
  file_name: string | null
  notes: string | null
  sort_order: number | null
  created_at: string
}

export type SalesBookingInput = Partial<Omit<SalesBooking, 'id' | 'sales_order_id' | 'created_at'>>

export const salesBookingService = {
  async list(salesOrderId: string): Promise<SalesBooking[]> {
    const { data, error } = await supabase
      .from('sales_order_bookings')
      .select('*')
      .eq('sales_order_id', salesOrderId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as SalesBooking[]) || []
  },

  async create(salesOrderId: string, input: SalesBookingInput): Promise<SalesBooking> {
    const { data, error } = await supabase
      .from('sales_order_bookings')
      .insert({ sales_order_id: salesOrderId, ...input })
      .select('*')
      .single()
    if (error) throw error
    return data as SalesBooking
  },

  async update(id: string, input: SalesBookingInput): Promise<SalesBooking> {
    const { data, error } = await supabase
      .from('sales_order_bookings')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as SalesBooking
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('sales_order_bookings').delete().eq('id', id)
    if (error) throw error
  },

  /** Upload 1 file booking/B/L → trả { file_url, file_name } để gắn vào booking. */
  async uploadFile(salesOrderId: string, file: File): Promise<{ file_url: string; file_name: string }> {
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const rand = Math.random().toString(36).slice(2, 7)
    const path = `orders/${salesOrderId}/booking_${Date.now()}_${rand}.${ext}`
    const { error: upErr } = await supabase.storage.from('sales-documents').upload(path, file, { upsert: false })
    if (upErr) throw upErr
    const { data: { publicUrl } } = supabase.storage.from('sales-documents').getPublicUrl(path)
    return { file_url: publicUrl, file_name: file.name }
  },
}
