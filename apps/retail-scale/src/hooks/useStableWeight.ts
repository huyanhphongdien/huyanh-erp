// ============================================================================
// useStableWeight — CHỐT SỐ trước khi cho phép ghi cân
// File: apps/retail-scale/src/hooks/useStableWeight.ts
//
// VÌ SAO PHẢI TỰ LÀM:
//   Cờ `stable` do useKeliScale trả về gần như VÔ NGHĨA với đầu cân đang dùng: parser
//   frame nhị phân (PĐ/TL) hardcode `stable = true`, format text rút gọn cũng vậy. Chỉ
//   format đầy đủ 'ST,GS,+ 12345 kg' mới phân biệt ST/US thật.
//   ⇒ Viết `if (!reading.stable) return` là bảo vệ GIẢ — luôn pass.
//
//   App cân XE không chốt số (bấm "GHI CÂN" là lấy thẳng liveWeight tại thời điểm click),
//   chấp nhận được vì xe tải đứng yên hàng chục giây. Cân mủ lẻ thì ngược lại: bao 20-60kg,
//   đặt lên nhấc xuống liên tục, số nhảy — bấm trúng lúc số đang dao động là sai tiền thật.
//
// CÁCH LÀM: số chỉ được coi là ĐỨNG khi dao động ≤ toleranceKg liên tục ≥ holdMs.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import type { ScaleReading } from '@erp/hooks/useKeliScale'

export interface StableWeightState {
  /** Số hiện tại (kg) — vẫn cập nhật liên tục để hiển thị. */
  value: number
  /** true = số đã đứng đủ lâu, cho phép bấm "Lấy số". */
  stable: boolean
  /** Số đã đứng được bao nhiêu ms (0 nếu đang dao động) — để vẽ thanh tiến trình. */
  heldMs: number
}

export interface StableWeightOptions {
  /** Biên độ dao động cho phép (kg). Cân bàn 300kg vạch 0.1kg → 0.2 là hợp lý. */
  toleranceKg?: number
  /** Phải đứng yên bao lâu mới coi là chốt được (ms). */
  holdMs?: number
  /** Dưới ngưỡng này coi như CHƯA đặt hàng lên cân (không phải số hợp lệ). */
  minKg?: number
}

export function useStableWeight(
  reading: ScaleReading | null,
  options: StableWeightOptions = {},
): StableWeightState {
  const toleranceKg = options.toleranceKg ?? 0.2
  const holdMs = options.holdMs ?? 800
  const minKg = options.minKg ?? 0.5

  const [state, setState] = useState<StableWeightState>({ value: 0, stable: false, heldMs: 0 })

  // Mốc bắt đầu "đứng số" + giá trị neo. Dùng ref để không re-render mỗi frame cân.
  const anchorRef = useRef<{ value: number; since: number } | null>(null)
  // Mốc frame cuối — watchdog đọc qua ref để KHÔNG phải dựng lại interval mỗi frame
  // (đầu cân bắn ~10 frame/giây; đặt `reading` vào deps của interval là tạo/huỷ timer 10 lần/giây).
  const lastTsRef = useRef<number>(0)

  useEffect(() => {
    const w = reading?.weight
    if (reading?.timestamp) lastTsRef.current = reading.timestamp
    if (w == null || !Number.isFinite(w)) {
      anchorRef.current = null
      setState({ value: 0, stable: false, heldMs: 0 })
      return
    }

    const now = Date.now()
    const anchor = anchorRef.current
    if (!anchor || Math.abs(w - anchor.value) > toleranceKg) {
      // Nhảy quá biên → bắt đầu đếm lại từ đầu.
      anchorRef.current = { value: w, since: now }
      setState({ value: w, stable: false, heldMs: 0 })
      return
    }

    const heldMs = now - anchor.since
    setState({ value: w, stable: heldMs >= holdMs && w >= minKg, heldMs })
  }, [reading, toleranceKg, holdMs, minKg])

  // Đầu cân ngưng gửi frame (nhấc hàng xuống, cáp lỏng...) → sau 1.5s coi như không còn
  // số đứng, tránh tình trạng nút "Lấy số" vẫn sáng xanh với số cũ đã lỗi thời.
  useEffect(() => {
    const iv = setInterval(() => {
      const ts = lastTsRef.current
      if (!ts) return
      if (Date.now() - ts > 1500) {
        anchorRef.current = null
        setState(s => (s.stable || s.heldMs ? { value: s.value, stable: false, heldMs: 0 } : s))
      }
    }, 500)
    return () => clearInterval(iv)
  }, [])

  return state
}

export default useStableWeight
