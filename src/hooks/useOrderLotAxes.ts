// ============================================================================
// HAI TRỤC TIẾN ĐỘ THEO LÔ của MỘT đơn — giao (container thật) và tiền (payment)
// File: src/hooks/useOrderLotAxes.ts
//
// VÌ SAO LÀ HOOK CHỨ KHÔNG PHẢI PROP:
// Bản đầu của bảng "Tiến độ từng lô" nhận hai trục qua prop. Panel chi tiết truyền,
// nhưng route /sales/orders/:orderId thì quên — mà đó lại chính là chỗ thẻ Kanban và
// nút Copy link dẫn tới. Hai prop khai optional nên tsc im lặng, bảng nhận undefined,
// rơi vào nhánh rỗng và khẳng định "Đơn này chưa chia lô" cho 9 đơn đang có 20 lô thật.
// Sai kiểu đó không có ai báo: không lỗi biên dịch, không lỗi runtime, chỉ có một câu
// tiếng Việt rất tự tin và sai.
//
// Dữ liệu đi liền với chỗ dùng thì không ai quên truyền được nữa.
//
// LÀM MỚI KHI: đổi đơn, hoặc `refreshToken` đổi (truyền order.updated_at — đơn được lưu
// hay realtime bắn về là token đổi theo, bảng tự nạp lại, không cần ai gọi tay).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { dispatchService, type LotProgress } from '../services/logistics/dispatchService'
import { salesOrderPaymentService, type OrderLotMoney } from '../services/sales/salesOrderPaymentService'

export interface OrderLotAxes {
  lotProgress?: LotProgress
  lotPay?: OrderLotMoney
  /** Chưa có KẾT QUẢ nào — chưa được phép kết luận gì về lô. */
  loading: boolean
  /** Trục giao hỏng. Trục tiền hỏng riêng thì xem payFailed. */
  deliveryFailed: boolean
  payFailed: boolean
  reload: () => void
}

export function useOrderLotAxes(orderId: string | null | undefined, refreshToken?: string | null): OrderLotAxes {
  const [state, setState] = useState<Omit<OrderLotAxes, 'reload'>>({
    lotProgress: undefined, lotPay: undefined,
    loading: !!orderId, deliveryFailed: false, payFailed: false,
  })
  const [nonce, setNonce] = useState(0)
  // Bộ đếm đơn điệu: hai lượt nạp CÙNG một đơn (lưu xong + realtime bắn) vẫn chồng nhau
  // được, và lượt cũ về sau sẽ ghi đè lượt mới nếu chỉ so orderId.
  const seq = useRef(0)

  useEffect(() => {
    if (!orderId) {
      setState({ lotProgress: undefined, lotPay: undefined, loading: false, deliveryFailed: false, payFailed: false })
      return
    }
    const my = ++seq.current
    setState((s) => ({ ...s, loading: true, deliveryFailed: false, payFailed: false }))

    // allSettled chứ không all: trục giao (2 view, rẻ và chắc) không việc gì phải chết
    // theo trục tiền (4 bảng). Mất một nửa còn hơn mất cả hai.
    Promise.allSettled([
      dispatchService.getLotProgressForOrders([orderId]),
      salesOrderPaymentService.getLotPaymentForOrders([orderId]),
    ]).then(([prog, pay]) => {
      if (my !== seq.current) return   // đã sang đơn khác / đã có lượt mới hơn
      if (prog.status === 'rejected') console.error('[sales] Không tải được tiến độ giao theo lô:', prog.reason)
      if (pay.status === 'rejected') console.error('[sales] Không tải được tiền theo lô:', pay.reason)
      setState({
        lotProgress: prog.status === 'fulfilled' ? prog.value[orderId] : undefined,
        lotPay: pay.status === 'fulfilled' ? pay.value[orderId] : undefined,
        loading: false,
        deliveryFailed: prog.status === 'rejected',
        payFailed: pay.status === 'rejected',
      })
    })
  }, [orderId, refreshToken, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}
