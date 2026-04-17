// ============================================================================
// CONTAINER SERVICE — Quản lý Container đóng gói cho Đơn hàng bán
// File: src/services/sales/containerService.ts
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  SalesOrderContainer,
  SalesOrderContainerItem,
  ContainerStatus,
  ContainerType,
} from './salesTypes'

// ============================================================================
// TYPES
// ============================================================================

export interface ContainerSummary {
  total_containers: number
  packed: number
  sealed: number
  total_bales: number
  total_weight_kg: number
}

export interface AddContainerItemInput {
  batch_id: string
  batch_no: string
  bale_from: number
  bale_to: number
  bale_count: number
  weight_kg: number
  grade: string
  drc: number
}

// ============================================================================
// CONSTANTS — Sức chứa container
// ============================================================================

// Sức chứa theo quy cách bành:
// - 35 kg/bành: 20ft = 600 bành (21T), 40ft = 1200 bành
// - 33.33 kg/bành: 20ft = 630 bành (21T), 40ft = 1260 bành
const CONTAINER_CAPACITY: Record<ContainerType, { max_tons: number; max_bales_35: number; max_bales_33: number }> = {
  '20ft': { max_tons: 21, max_bales_35: 600, max_bales_33: 630 },
  '40ft': { max_tons: 42, max_bales_35: 1200, max_bales_33: 1260 },
}

// ============================================================================
// SERVICE
// ============================================================================

export const containerService = {
  // ==========================================================================
  // GET CONTAINERS — Lấy danh sách container kèm items
  // ==========================================================================

  async getContainers(orderId: string): Promise<SalesOrderContainer[]> {
    const { data, error } = await supabase
      .from('sales_order_containers')
      .select('*, items:sales_order_container_items(*)')
      .eq('sales_order_id', orderId)
      .order('created_at')

    if (error) {
      throw new Error(`Không thể tải danh sách container: ${error.message}`)
    }

    return (data || []) as SalesOrderContainer[]
  },

  // ==========================================================================
  // AUTO-CREATE CONTAINERS — Tự động tạo container theo số lượng đơn hàng
  // 20ft ~ 20 tấn ~ 600 bành, 40ft ~ 25 tấn ~ 750 bành
  // ==========================================================================

  async autoCreateContainers(orderId: string): Promise<SalesOrderContainer[]> {
    // Lấy thông tin đơn hàng
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('id, code, quantity_tons, quantity_kg, container_type, container_count, total_bales, bale_weight_kg, bales_per_container')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      throw new Error('Không thể tải thông tin đơn hàng')
    }

    // Kiểm tra đã có container chưa
    const { count: existingCount } = await supabase
      .from('sales_order_containers')
      .select('id', { count: 'exact', head: true })
      .eq('sales_order_id', orderId)

    if (existingCount && existingCount > 0) {
      throw new Error('Đơn hàng đã có container. Vui lòng xóa container hiện tại trước khi tạo tự động.')
    }

    const containerType: ContainerType = order.container_type || '20ft'
    const capacity = CONTAINER_CAPACITY[containerType]
    const containerCount = order.container_count || Math.ceil(order.quantity_tons / capacity.max_tons)
    const soCode = order.code || orderId.slice(0, 8)

    // Tính số bành mỗi container
    const totalBales = order.total_bales || 0
    const balesPerContainer = order.bales_per_container || (totalBales > 0 ? Math.ceil(totalBales / containerCount) : 0)
    const baleWeightKg = order.bale_weight_kg || (order.quantity_kg && totalBales ? order.quantity_kg / totalBales : 35)

    // Tạo container records — auto-fill container_no + bale_count + net_weight_kg
    const containersToInsert = Array.from({ length: containerCount }, (_, i) => {
      const isLast = i === containerCount - 1
      const bales = isLast && totalBales > 0
        ? totalBales - balesPerContainer * (containerCount - 1)
        : balesPerContainer
      const netKg = Math.round(bales * baleWeightKg * 100) / 100
      return {
        sales_order_id: orderId,
        container_no: `CONT-${soCode}-${String(i + 1).padStart(2, '0')}`,
        seal_no: null,
        container_type: containerType,
        gross_weight_kg: null,
        tare_weight_kg: null,
        net_weight_kg: netKg > 0 ? netKg : null,
        bale_count: bales > 0 ? bales : null,
        status: 'planning' as ContainerStatus,
        notes: `Container ${i + 1}/${containerCount} — Tạo tự động`,
      }
    })

    const { data, error } = await supabase
      .from('sales_order_containers')
      .insert(containersToInsert)
      .select('*, items:sales_order_container_items(*)')

    if (error) {
      throw new Error(`Không thể tạo container tự động: ${error.message}`)
    }

    return (data || []) as SalesOrderContainer[]
  },

  // ==========================================================================
  // ADD CONTAINER — Thêm container thủ công
  // ==========================================================================

  async addContainer(
    orderId: string,
    containerData: Partial<SalesOrderContainer>,
  ): Promise<SalesOrderContainer> {
    const { data, error } = await supabase
      .from('sales_order_containers')
      .insert({
        sales_order_id: orderId,
        container_no: containerData.container_no || null,
        seal_no: containerData.seal_no || null,
        container_type: containerData.container_type || '20ft',
        gross_weight_kg: containerData.gross_weight_kg || null,
        tare_weight_kg: containerData.tare_weight_kg || null,
        net_weight_kg: containerData.net_weight_kg || null,
        bale_count: containerData.bale_count || null,
        status: 'planning' as ContainerStatus,
        notes: containerData.notes || null,
      })
      .select('*, items:sales_order_container_items(*)')
      .single()

    if (error) {
      throw new Error(`Không thể thêm container: ${error.message}`)
    }

    return data as SalesOrderContainer
  },

  // ==========================================================================
  // UPDATE CONTAINER — Cập nhật thông tin container
  // ==========================================================================

  async updateContainer(id: string, data: Partial<SalesOrderContainer>): Promise<void> {
    const updateData: Record<string, unknown> = {}

    if (data.container_no !== undefined) updateData.container_no = data.container_no
    if (data.seal_no !== undefined) updateData.seal_no = data.seal_no
    if (data.gross_weight_kg !== undefined) updateData.gross_weight_kg = data.gross_weight_kg
    if (data.tare_weight_kg !== undefined) updateData.tare_weight_kg = data.tare_weight_kg
    if (data.net_weight_kg !== undefined) updateData.net_weight_kg = data.net_weight_kg
    if (data.bale_count !== undefined) updateData.bale_count = data.bale_count
    if (data.notes !== undefined) updateData.notes = data.notes

    const { error } = await supabase
      .from('sales_order_containers')
      .update(updateData)
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể cập nhật container: ${error.message}`)
    }
  },

  // ==========================================================================
  // DELETE CONTAINER — Xóa container (chỉ khi planning)
  // ==========================================================================

  async deleteContainer(id: string): Promise<void> {
    // Kiểm tra trạng thái
    const { data: container } = await supabase
      .from('sales_order_containers')
      .select('status')
      .eq('id', id)
      .single()

    if (container && container.status !== 'planning') {
      throw new Error('Chỉ có thể xóa container ở trạng thái "Đang lên kế hoạch"')
    }

    // Xóa items trước
    await supabase
      .from('sales_order_container_items')
      .delete()
      .eq('container_id', id)

    // Xóa container
    const { error } = await supabase
      .from('sales_order_containers')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể xóa container: ${error.message}`)
    }
  },

  // ==========================================================================
  // ADD CONTAINER ITEMS — Thêm bành vào container
  // ==========================================================================

  async addContainerItems(containerId: string, items: AddContainerItemInput[]): Promise<void> {
    if (items.length === 0) return

    const records = items.map((item) => ({
      container_id: containerId,
      batch_id: item.batch_id,
      batch_no: item.batch_no,
      bale_from: item.bale_from,
      bale_to: item.bale_to,
      bale_count: item.bale_count,
      weight_kg: item.weight_kg,
      grade: item.grade,
      drc: item.drc,
    }))

    const { error } = await supabase
      .from('sales_order_container_items')
      .insert(records)

    if (error) {
      throw new Error(`Không thể thêm bành vào container: ${error.message}`)
    }

    // Cập nhật tổng bale_count và net_weight_kg của container
    await containerService._recalcContainerTotals(containerId)
  },

  // ==========================================================================
  // GET CONTAINER ITEMS — Lấy danh sách bành trong container
  // ==========================================================================

  async getContainerItems(containerId: string): Promise<SalesOrderContainerItem[]> {
    const { data, error } = await supabase
      .from('sales_order_container_items')
      .select('*')
      .eq('container_id', containerId)
      .order('created_at')

    if (error) {
      throw new Error(`Không thể tải danh sách bành: ${error.message}`)
    }

    return (data || []) as SalesOrderContainerItem[]
  },

  // ==========================================================================
  // REMOVE CONTAINER ITEM — Xóa bành khỏi container
  // ==========================================================================

  async removeContainerItem(itemId: string): Promise<void> {
    // Lấy container_id trước khi xóa
    const { data: item } = await supabase
      .from('sales_order_container_items')
      .select('container_id')
      .eq('id', itemId)
      .single()

    const { error } = await supabase
      .from('sales_order_container_items')
      .delete()
      .eq('id', itemId)

    if (error) {
      throw new Error(`Không thể xóa bành: ${error.message}`)
    }

    // Recalc container totals
    if (item?.container_id) {
      await containerService._recalcContainerTotals(item.container_id)
    }
  },

  // ==========================================================================
  // AUTO-ASSIGN BALES — Phân bổ bành tự động vào các container
  // Lấy output batches từ lệnh sản xuất, chia đều vào container
  // ==========================================================================

  async autoAssignBales(orderId: string): Promise<void> {
    // Lấy đơn hàng để biết production_order_id
    const { data: order } = await supabase
      .from('sales_orders')
      .select('id, production_order_id, grade, bale_weight_kg')
      .eq('id', orderId)
      .single()

    if (!order) {
      throw new Error('Không tìm thấy đơn hàng')
    }

    // Lấy tất cả containers
    const containers = await containerService.getContainers(orderId)
    if (containers.length === 0) {
      throw new Error('Chưa có container nào. Vui lòng tạo container trước.')
    }

    // Lấy output batches từ production — stock_batches có liên kết production
    let batchQuery = supabase
      .from('stock_batches')
      .select('id, batch_no, grade, drc, current_weight_kg, bale_count')
      .eq('status', 'in_stock')
      .order('created_at')

    if (order.production_order_id) {
      batchQuery = batchQuery.eq('production_order_id', order.production_order_id)
    } else {
      // Fallback: lấy theo grade
      batchQuery = batchQuery.eq('grade', order.grade)
    }

    const { data: batches, error: batchErr } = await batchQuery

    if (batchErr) {
      throw new Error(`Không thể tải danh sách lô hàng: ${batchErr.message}`)
    }

    if (!batches || batches.length === 0) {
      throw new Error('Không tìm thấy lô hàng nào khả dụng để phân bổ.')
    }

    // Xóa tất cả items hiện tại
    for (const c of containers) {
      await supabase
        .from('sales_order_container_items')
        .delete()
        .eq('container_id', c.id)
    }

    // Phân bổ lô hàng vào container theo round-robin
    const baleWeight = order.bale_weight_kg || 35
    let containerIdx = 0

    for (const batch of batches) {
      const totalBales = batch.bale_count || Math.ceil((batch.current_weight_kg || 0) / baleWeight)
      if (totalBales <= 0) continue

      const container = containers[containerIdx % containers.length]
      const weightPerBale = (batch.current_weight_kg || 0) / totalBales

      await supabase
        .from('sales_order_container_items')
        .insert({
          container_id: container.id,
          batch_id: batch.id,
          batch_no: batch.batch_no,
          bale_from: 1,
          bale_to: totalBales,
          bale_count: totalBales,
          weight_kg: Math.round(totalBales * weightPerBale),
          grade: batch.grade,
          drc: batch.drc,
        })

      containerIdx++
    }

    // Recalc totals cho tất cả container
    for (const c of containers) {
      await containerService._recalcContainerTotals(c.id)
    }
  },

  // ==========================================================================
  // UPDATE STATUS — Cập nhật trạng thái container
  // ==========================================================================

  async updateStatus(id: string, status: ContainerStatus): Promise<void> {
    const updateData: Record<string, unknown> = { status }

    if (status === 'packing') {
      updateData.packed_at = new Date().toISOString()
    }
    if (status === 'sealed') {
      updateData.sealed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('sales_order_containers')
      .update(updateData)
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể cập nhật trạng thái container: ${error.message}`)
    }
  },

  // ==========================================================================
  // SEAL CONTAINER — Niêm phong container (set seal_no, sealed_at, status)
  // ==========================================================================

  async sealContainer(id: string, sealNo: string): Promise<void> {
    if (!sealNo || sealNo.trim().length === 0) {
      throw new Error('Vui lòng nhập số seal')
    }

    const { error } = await supabase
      .from('sales_order_containers')
      .update({
        seal_no: sealNo.trim(),
        sealed_at: new Date().toISOString(),
        status: 'sealed' as ContainerStatus,
      })
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể niêm phong container: ${error.message}`)
    }
  },

  // ==========================================================================
  // GET CONTAINER SUMMARY — Thống kê tổng hợp container cho đơn hàng
  // ==========================================================================

  async getContainerSummary(orderId: string): Promise<ContainerSummary> {
    const containers = await containerService.getContainers(orderId)

    let packed = 0
    let sealed = 0
    let totalBales = 0
    let totalWeight = 0

    for (const c of containers) {
      if (c.status === 'packing' || c.status === 'sealed' || c.status === 'shipped') {
        packed++
      }
      if (c.status === 'sealed' || c.status === 'shipped') {
        sealed++
      }

      // Tính từ items nếu có
      if (c.items && c.items.length > 0) {
        for (const item of c.items) {
          totalBales += item.bale_count || 0
          totalWeight += item.weight_kg || 0
        }
      } else {
        totalBales += c.bale_count || 0
        totalWeight += c.net_weight_kg || 0
      }
    }

    return {
      total_containers: containers.length,
      packed,
      sealed,
      total_bales: totalBales,
      total_weight_kg: totalWeight,
    }
  },

  // ==========================================================================
  // GET AVAILABLE BATCHES — Lấy lô hàng khả dụng cho đơn hàng
  // ==========================================================================

  async getAvailableBatches(orderId: string): Promise<Array<{
    id: string
    batch_no: string
    grade: string
    drc: number
    total_bales: number
    total_weight_kg: number
    assigned_bales: number
    remaining_bales: number
  }>> {
    // Lấy đơn hàng
    const { data: order } = await supabase
      .from('sales_orders')
      .select('id, production_order_id, grade, bale_weight_kg')
      .eq('id', orderId)
      .single()

    if (!order) throw new Error('Không tìm thấy đơn hàng')

    // Lấy stock batches
    let batchQuery = supabase
      .from('stock_batches')
      .select('id, batch_no, grade, drc, current_weight_kg, bale_count')
      .eq('status', 'in_stock')
      .order('created_at')

    if (order.production_order_id) {
      batchQuery = batchQuery.eq('production_order_id', order.production_order_id)
    } else {
      batchQuery = batchQuery.eq('grade', order.grade)
    }

    const { data: batches } = await batchQuery

    if (!batches) return []

    // Lấy tất cả items đã assign
    const { data: assignedItems } = await supabase
      .from('sales_order_container_items')
      .select('batch_id, bale_count')
      .in('container_id',
        (await supabase
          .from('sales_order_containers')
          .select('id')
          .eq('sales_order_id', orderId)
        ).data?.map(c => c.id) || []
      )

    // Tính assigned bales per batch
    const assignedMap: Record<string, number> = {}
    if (assignedItems) {
      for (const item of assignedItems) {
        if (item.batch_id) {
          assignedMap[item.batch_id] = (assignedMap[item.batch_id] || 0) + (item.bale_count || 0)
        }
      }
    }

    const baleWeight = order.bale_weight_kg || 35

    return batches.map((b) => {
      const totalBales = b.bale_count || Math.ceil((b.current_weight_kg || 0) / baleWeight)
      const assigned = assignedMap[b.id] || 0
      return {
        id: b.id,
        batch_no: b.batch_no,
        grade: b.grade,
        drc: b.drc ?? 0,
        total_bales: totalBales,
        total_weight_kg: b.current_weight_kg || 0,
        assigned_bales: assigned,
        remaining_bales: Math.max(0, totalBales - assigned),
      }
    })
  },

  // ==========================================================================
  // INTERNAL — Recalc container totals
  // ==========================================================================

  async _recalcContainerTotals(containerId: string): Promise<void> {
    const { data: items } = await supabase
      .from('sales_order_container_items')
      .select('bale_count, weight_kg')
      .eq('container_id', containerId)

    if (!items) return

    const totalBales = items.reduce((sum, i) => sum + (i.bale_count || 0), 0)
    const totalWeight = items.reduce((sum, i) => sum + (i.weight_kg || 0), 0)

    await supabase
      .from('sales_order_containers')
      .update({
        bale_count: totalBales,
        net_weight_kg: totalWeight,
      })
      .eq('id', containerId)
  },
}

export default containerService
