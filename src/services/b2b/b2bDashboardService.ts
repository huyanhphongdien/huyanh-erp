// ============================================================================
// B2B DASHBOARD SERVICE — Service lấy KPIs và dữ liệu dashboard
// File: src/services/b2b/b2bDashboardService.ts
// Phase: E3.1.3 - E3.1.9, E3.2.2
// ============================================================================

import { supabase } from '../../lib/supabase'
import { BookingMetadata } from './chatMessageService'

// ============================================
// TYPES
// ============================================

export interface DashboardKPIs {
  totalActivePartners: number
  dealsProcessing: number
  pendingBookings: number
  unreadMessages: number
  monthlyProduction: number // tấn
  monthlyRevenue: number // VNĐ
  // Trends (so với tháng trước)
  partnersTrend?: number
  dealsTrend?: number
  productionTrend?: number
  revenueTrend?: number
}

export interface MonthlyData {
  month: string // 'T1', 'T2'...
  monthFull: string // '01/2026'
  production: number // tấn
  revenue: number // triệu VNĐ
  deals: number
}

export interface ProductMixData {
  name: string
  value: number
  percent: number
  color: string
}

export interface TopDealer {
  id: string
  code: string
  name: string
  tier: string
  totalQuantity: number // tấn
  totalValue: number // VNĐ
  dealCount: number
}

export interface PendingBooking {
  messageId: string
  roomId: string
  partnerId: string
  partnerName: string
  partnerCode: string
  booking: BookingMetadata
  sentAt: string
}

export interface RecentMessage {
  id: string
  roomId: string
  partnerId: string
  partnerName: string
  partnerCode: string
  content: string
  messageType: string
  sentAt: string
}

export interface ActivityItem {
  id: string
  type: 'deal' | 'booking' | 'message' | 'partner'
  title: string
  description: string
  time: string
  icon?: string
}

// ============================================
// CONSTANTS
// ============================================

const PRODUCT_COLORS: Record<string, string> = {
  'SVR 10': '#1B4D3E',
  'SVR 20': '#2D8B6E',
  'SVR CV50': '#E8A838',
  'SVR CV60': '#D4763D',
  'SVR 3L': '#8B5CF6',
  'Khác': '#94A3B8',
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const getMonthRange = (monthsAgo: number = 0) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

const formatMonth = (date: Date): string => {
  return `T${date.getMonth() + 1}`
}

const formatMonthFull = (date: Date): string => {
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`
}

// ============================================
// SERVICE
// ============================================

export const b2bDashboardService = {
  // ============================================
  // KPIs (E3.1.3 - E3.1.9)
  // ============================================

  /**
   * Lấy tất cả KPIs cho dashboard
   */
  async getKPIs(): Promise<DashboardKPIs> {
    const currentMonth = getMonthRange(0)
    const lastMonth = getMonthRange(1)

    // Parallel queries
    const [
      activePartners,
      dealsProcessing,
      pendingBookings,
      unreadMessages,
      currentProduction,
      currentRevenue,
      lastMonthProduction,
      lastMonthRevenue,
    ] = await Promise.all([
      this.getActivePartnersCount(),
      this.getDealsProcessingCount(),
      this.getPendingBookingsCount(),
      this.getUnreadMessagesCount(),
      this.getMonthlyProductionTotal(currentMonth.start, currentMonth.end),
      this.getMonthlyRevenueTotal(currentMonth.start, currentMonth.end),
      this.getMonthlyProductionTotal(lastMonth.start, lastMonth.end),
      this.getMonthlyRevenueTotal(lastMonth.start, lastMonth.end),
    ])

    // Calculate trends
    const productionTrend = lastMonthProduction > 0
      ? ((currentProduction - lastMonthProduction) / lastMonthProduction) * 100
      : 0

    const revenueTrend = lastMonthRevenue > 0
      ? ((currentRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0

    return {
      totalActivePartners: activePartners,
      dealsProcessing,
      pendingBookings,
      unreadMessages,
      monthlyProduction: currentProduction,
      monthlyRevenue: currentRevenue,
      productionTrend: Math.round(productionTrend * 10) / 10,
      revenueTrend: Math.round(revenueTrend * 10) / 10,
    }
  },

  /**
   * E3.1.4: Tổng đại lý active
   */
  async getActivePartnersCount(): Promise<number> {
    const { count, error } = await supabase
      .from('b2b_partners')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'verified')
      .eq('is_active', true)

    if (error) {
      console.error('Error counting partners:', error)
      return 0
    }
    return count || 0
  },

  /**
   * E3.1.5: Deals đang xử lý
   */
  async getDealsProcessingCount(): Promise<number> {
    const { count, error } = await supabase
      .from('b2b_deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing')

    if (error) {
      console.error('Error counting deals:', error)
      return 0
    }
    return count || 0
  },

  /**
   * E3.1.6: Phiếu chốt chờ xác nhận
   */
  async getPendingBookingsCount(): Promise<number> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .select('id, metadata')
      .eq('message_type', 'booking')
      .is('deleted_at', null)

    if (error) {
      console.error('Error counting bookings:', error)
      return 0
    }

    // Filter by metadata.booking.status = 'pending'
    const pendingCount = (data || []).filter(msg => {
      const booking = (msg.metadata as { booking?: BookingMetadata })?.booking
      return booking?.status === 'pending'
    }).length

    return pendingCount
  },

  /**
   * E3.1.7: Tin nhắn chưa đọc
   */
  async getUnreadMessagesCount(): Promise<number> {
    const { count, error } = await supabase
      .from('b2b_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'partner')
      .is('read_at', null)
      .is('deleted_at', null)

    if (error) {
      console.error('Error counting unread:', error)
      return 0
    }
    return count || 0
  },

  /**
   * E3.1.8: Sản lượng tháng (tấn)
   */
  async getMonthlyProductionTotal(startDate: string, endDate: string): Promise<number> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .select('quantity_kg')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .in('status', ['accepted', 'settled'])

    if (error) {
      console.error('Error getting production:', error)
      return 0
    }

    const totalKg = (data || []).reduce((sum, d) => sum + (d.quantity_kg || 0), 0)
    return Math.round(totalKg / 1000 * 10) / 10 // Convert to tấn, 1 decimal
  },

  /**
   * E3.1.9: Doanh thu tháng (VNĐ)
   */
  async getMonthlyRevenueTotal(startDate: string, endDate: string): Promise<number> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .select('total_value_vnd')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .in('status', ['accepted', 'settled'])

    if (error) {
      console.error('Error getting revenue:', error)
      return 0
    }

    return (data || []).reduce((sum, d) => sum + (d.total_value_vnd || 0), 0)
  },

  // ============================================
  // CHARTS DATA (E3.2)
  // ============================================

  /**
   * E3.2.2: Dữ liệu sản lượng 6 tháng gần nhất
   */
  async getMonthlyProduction(months: number = 6): Promise<MonthlyData[]> {
    const result: MonthlyData[] = []

    for (let i = months - 1; i >= 0; i--) {
      const { start, end } = getMonthRange(i)
      const date = new Date()
      date.setMonth(date.getMonth() - i)

      const { data, error } = await supabase
        .from('b2b_deals')
        .select('quantity_kg, total_value_vnd')
        .gte('created_at', start)
        .lte('created_at', end)
        .in('status', ['accepted', 'settled'])

      if (error) {
        console.error('Error getting monthly data:', error)
        continue
      }

      const production = (data || []).reduce((sum, d) => sum + (d.quantity_kg || 0), 0) / 1000
      const revenue = (data || []).reduce((sum, d) => sum + (d.total_value_vnd || 0), 0) / 1000000

      result.push({
        month: formatMonth(date),
        monthFull: formatMonthFull(date),
        production: Math.round(production * 10) / 10,
        revenue: Math.round(revenue * 10) / 10,
        deals: data?.length || 0,
      })
    }

    return result
  },

  /**
   * E3.2.4: Cơ cấu sản phẩm
   */
  async getProductMix(): Promise<ProductMixData[]> {
    const { start, end } = getMonthRange(0)

    const { data, error } = await supabase
      .from('b2b_deals')
      .select('product_name, quantity_kg')
      .gte('created_at', start)
      .lte('created_at', end)
      .in('status', ['accepted', 'settled'])

    if (error) {
      console.error('Error getting product mix:', error)
      return []
    }

    // Group by product
    const grouped = (data || []).reduce((acc, d) => {
      const name = d.product_name || 'Khác'
      acc[name] = (acc[name] || 0) + (d.quantity_kg || 0)
      return acc
    }, {} as Record<string, number>)

    const total = Object.values(grouped).reduce((sum, v) => sum + v, 0)

    return Object.entries(grouped)
      .map(([name, value]) => ({
        name,
        value: Math.round(value / 1000 * 10) / 10, // tấn
        percent: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
        color: PRODUCT_COLORS[name] || PRODUCT_COLORS['Khác'],
      }))
      .sort((a, b) => b.value - a.value)
  },

  // ============================================
  // LISTS DATA (E3.3)
  // ============================================

  /**
   * E3.3.1: Danh sách phiếu chốt pending
   */
  async getPendingBookings(limit: number = 5): Promise<PendingBooking[]> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .select(`
        id,
        room_id,
        metadata,
        sent_at,
        room:b2b_chat_rooms!room_id (
          partner_id,
          partner:b2b_partners!partner_id (
            id, code, name
          )
        )
      `)
      .eq('message_type', 'booking')
      .is('deleted_at', null)
      .order('sent_at', { ascending: false })
      .limit(20) // Get more to filter

    if (error) {
      console.error('Error getting pending bookings:', error)
      return []
    }

    // Filter pending and map
    const pending = (data || [])
      .filter(msg => {
        const booking = (msg.metadata as { booking?: BookingMetadata })?.booking
        return booking?.status === 'pending'
      })
      .slice(0, limit)
      .map(msg => {
        const room = Array.isArray(msg.room) ? msg.room[0] : msg.room
        const partner = Array.isArray(room?.partner) ? room?.partner[0] : room?.partner

        return {
          messageId: msg.id,
          roomId: msg.room_id,
          partnerId: partner?.id || '',
          partnerName: partner?.name || 'N/A',
          partnerCode: partner?.code || '',
          booking: (msg.metadata as { booking: BookingMetadata }).booking,
          sentAt: msg.sent_at,
        }
      })

    return pending
  },

  /**
   * E3.3.3: Tin nhắn chưa đọc gần đây
   */
  async getRecentUnreadMessages(limit: number = 5): Promise<RecentMessage[]> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .select(`
        id,
        room_id,
        content,
        message_type,
        sent_at,
        room:b2b_chat_rooms!room_id (
          partner_id,
          partner:b2b_partners!partner_id (
            id, code, name
          )
        )
      `)
      .eq('sender_type', 'partner')
      .is('read_at', null)
      .is('deleted_at', null)
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error getting recent messages:', error)
      return []
    }

    return (data || []).map(msg => {
      const room = Array.isArray(msg.room) ? msg.room[0] : msg.room
      const partner = Array.isArray(room?.partner) ? room?.partner[0] : room?.partner

      return {
        id: msg.id,
        roomId: msg.room_id,
        partnerId: partner?.id || '',
        partnerName: partner?.name || 'N/A',
        partnerCode: partner?.code || '',
        content: msg.content,
        messageType: msg.message_type,
        sentAt: msg.sent_at,
      }
    })
  },

  /**
   * E3.3.4: Top dealers theo sản lượng
   */
  async getTopDealers(limit: number = 5): Promise<TopDealer[]> {
    const { start, end } = getMonthRange(0)

    const { data, error } = await supabase
      .from('b2b_deals')
      .select(`
        partner_id,
        quantity_kg,
        total_value_vnd,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .gte('created_at', start)
      .lte('created_at', end)
      .in('status', ['accepted', 'settled'])

    if (error) {
      console.error('Error getting top dealers:', error)
      return []
    }

    // Group by partner
    const grouped = (data || []).reduce((acc, d) => {
      const partner = Array.isArray(d.partner) ? d.partner[0] : d.partner
      if (!partner) return acc

      if (!acc[partner.id]) {
        acc[partner.id] = {
          id: partner.id,
          code: partner.code,
          name: partner.name,
          tier: partner.tier,
          totalQuantity: 0,
          totalValue: 0,
          dealCount: 0,
        }
      }
      acc[partner.id].totalQuantity += (d.quantity_kg || 0) / 1000
      acc[partner.id].totalValue += d.total_value_vnd || 0
      acc[partner.id].dealCount += 1
      return acc
    }, {} as Record<string, TopDealer>)

    return Object.values(grouped)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, limit)
      .map(d => ({
        ...d,
        totalQuantity: Math.round(d.totalQuantity * 10) / 10,
      }))
  },

  /**
   * E3.3.5: Activity timeline
   */
  async getRecentActivity(limit: number = 10): Promise<ActivityItem[]> {
    const activities: ActivityItem[] = []

    // Get recent deals
    const { data: deals } = await supabase
      .from('b2b_deals')
      .select('id, deal_number, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    deals?.forEach(d => {
      activities.push({
        id: `deal-${d.id}`,
        type: 'deal',
        title: `Deal ${d.deal_number}`,
        description: `Trạng thái: ${d.status}`,
        time: d.created_at,
        icon: '📦',
      })
    })

    // Get recent messages
    const { data: messages } = await supabase
      .from('b2b_chat_messages')
      .select(`
        id, sent_at, message_type,
        room:b2b_chat_rooms!room_id (
          partner:b2b_partners!partner_id (name)
        )
      `)
      .eq('sender_type', 'partner')
      .is('deleted_at', null)
      .order('sent_at', { ascending: false })
      .limit(5)

    messages?.forEach(m => {
      const room = Array.isArray(m.room) ? m.room[0] : m.room
      const partner = Array.isArray(room?.partner) ? room?.partner[0] : room?.partner

      activities.push({
        id: `msg-${m.id}`,
        type: 'message',
        title: `Tin nhắn từ ${partner?.name || 'Đại lý'}`,
        description: m.message_type === 'booking' ? 'Phiếu chốt mủ mới' : 'Tin nhắn mới',
        time: m.sent_at,
        icon: m.message_type === 'booking' ? '📋' : '💬',
      })
    })

    // Sort by time and limit
    return activities
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, limit)
  },
}

export default b2bDashboardService