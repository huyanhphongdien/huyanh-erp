// ============================================================================
// LOT TRACKING — phân giai đoạn container + gom theo lô (dùng chung)
// File: src/services/sales/lotTracking.ts
// Dùng ở: ContainerPackingPage (Quản lý đóng gói) + SalesOrderDetailPage (tab Đóng gói)
// ============================================================================

import type { SalesOrderContainer } from './salesTypes'
import { DELIVERED_CONTAINER_STATUSES } from '../logistics/dispatchService'
import type { DeliveryState } from '../logistics/dispatchService'

// 5 giai đoạn của 1 container, theo thứ tự tiến triển.
export type LotStageKey = 'producing' | 'packing' | 'ready' | 'dispatching' | 'delivered'

export const LOT_STAGES: Array<{ key: LotStageKey; label: string; short: string; icon: string; color: string }> = [
  { key: 'producing',   label: 'Đang sản xuất',  short: 'SX',        icon: '🏭', color: 'default' },
  { key: 'packing',     label: 'Đang đóng gói',  short: 'Đóng gói',  icon: '📦', color: 'gold' },
  { key: 'ready',       label: 'Sẵn sàng giao',  short: 'Sẵn sàng',  icon: '✅', color: 'cyan' },
  { key: 'dispatching', label: 'Đang điều động', short: 'Điều động', icon: '🚚', color: 'orange' },
  { key: 'delivered',   label: 'Đã giao',        short: 'Đã giao',   icon: '🟢', color: 'green' },
]

/**
 * Giai đoạn 1 container:
 *  - đã giao (delivery=delivered)      → đã giao
 *  - trong lệnh chưa cân (dispatching) → điều động
 *  - đã seal                           → sẵn sàng giao
 *  - có bành gán vào / status packing  → đang đóng gói
 *  - còn lại (planning, chưa bành)     → đang sản xuất / chờ hàng
 *
 * ⚠ MỘT ĐỊNH NGHĨA "ĐÃ GIAO" DUY NHẤT, và từ 27/08/2026 nó là view
 * `v_sales_order_container_delivery` — dispatchService.getDeliveryStatus chỉ đọc lại
 * view đó. Đừng gõ lại luật "đã giao" ở đây nữa.
 *
 * Trước 26/08/2026 hàm này coi `shipped` là 'ready' trong khi getLotProgressForOrders coi
 * là ĐÃ GIAO — badge Kanban và bảng lô tab Đóng gói ăn hai tập khác nhau. Chúng khớp nhau
 * tới hôm đó KHÔNG phải do may mắn: dispatchService.markWeighed ghi status 'shipped' ngay
 * sau khi ghi actual_weight_kg, nên với đường đó shipped ⊆ đã-cân là quan hệ nhân quả.
 * Ngòi nổ thật là stockOutService.processContainerShipment — set status mà không sinh dòng
 * lệnh, gọi từ app cân xe với guard khác hàm ghi cân.
 *
 * Nhánh dùng hằng bên dưới là DỰ PHÒNG cho khi deliveryMap rỗng (truy vấn hỏng, hoặc gọi
 * hàm mà không truyền map) — khi đó status đã nói hàng ra khỏi kho thì tin status.
 */
export function stageOfContainer(c: SalesOrderContainer, delivery: DeliveryState | undefined): LotStageKey {
  if (delivery === 'delivered') return 'delivered'
  if (delivery === 'dispatching') return 'dispatching'
  // Dự phòng khi deliveryMap rỗng: status đã nói hàng ra khỏi kho thì đừng tụt về 'ready'.
  if (c.status && (DELIVERED_CONTAINER_STATUSES as readonly string[]).includes(c.status)) return 'delivered'
  if (c.status === 'sealed' || c.status === 'loaded') return 'ready'
  if ((c.items?.length || 0) > 0 || c.status === 'packing') return 'packing'
  return 'producing'
}

export interface LotTrackRow {
  key: string
  lotNo: number | null
  deadline: string | null
  total: number
  counts: Record<LotStageKey, number>
}

/** Gom container theo lô + đếm số cont mỗi giai đoạn. Sắp theo số lô (Chưa gán lô cuối). */
export function buildLotTrackRows(
  containers: SalesOrderContainer[],
  deliveryMap: Record<string, DeliveryState>,
): LotTrackRow[] {
  const m = new Map<string, LotTrackRow>()
  for (const c of containers) {
    const key = c.lot_no != null ? String(c.lot_no) : '__none__'
    if (!m.has(key)) {
      m.set(key, {
        key, lotNo: c.lot_no ?? null, deadline: null, total: 0,
        counts: { producing: 0, packing: 0, ready: 0, dispatching: 0, delivered: 0 },
      })
    }
    const r = m.get(key)!
    r.total++
    if (c.lot_deadline && !r.deadline) r.deadline = c.lot_deadline
    r.counts[stageOfContainer(c, deliveryMap[c.id])]++
  }
  return [...m.values()].sort((a, b) => (a.lotNo ?? 99999) - (b.lotNo ?? 99999))
}

/** Trạng thái cả lô = giai đoạn THẤP NHẤT (mắt xích yếu nhất); all delivered → đã giao xong. */
export function lotOverallStage(row: LotTrackRow): { allDelivered: boolean; stage: typeof LOT_STAGES[number] | undefined } {
  const allDelivered = row.total > 0 && row.counts.delivered === row.total
  const stage = LOT_STAGES.find((s) => row.counts[s.key] > 0)
  return { allDelivered, stage }
}

/** 1 lô "đã giao" khi MỌI container của lô đã giao. Đếm số lô đã giao / tổng số lô (đã gán). */
export function lotDeliveryStats(rows: LotTrackRow[]): { lotsTotal: number; lotsDelivered: number } {
  const real = rows.filter((r) => r.lotNo != null)
  return {
    lotsTotal: real.length,
    lotsDelivered: real.filter((r) => r.total > 0 && r.counts.delivered === r.total).length,
  }
}
