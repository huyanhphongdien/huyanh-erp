// ============================================================================
// ScaleProvider — MỘT instance đầu cân duy nhất cho cả app
// File: apps/retail-scale/src/scale/ScaleProvider.tsx
//
// App cân XE gọi useKeliScale() ở 3 trang (Home, Weighing, Settings) → 3 instance, mỗi
// cái có watchdog + auto-reconnect riêng, tranh nhau cổng COM. Chính nó sinh ra lỗi
// "already in progress" mà hook phải xử lý riêng. Đừng lặp lại: đặt hook ở ĐÚNG một chỗ
// (đây) rồi cả app dùng chung qua context.
//
// Hai tham số truyền vào hook đều quan trọng:
//   storageNamespace 'rs_scale' → cân bàn và cân xe nhớ cấu hình RIÊNG. Nếu để chung key
//     'keli_scale', mở app cân lẻ trên máy trạm cân xe sẽ ghi đè baud của cân xe.
//   useFacilityDefaults: false  → KHÔNG áp thông số cố định 9600/8/None/1 của đầu cân XE
//     tại PĐ/TL (và không dính LOCKED_FACILITIES=['TL']). Cân bàn là đầu cân khác, phải
//     tự dò lần đầu rồi nhớ lại.
// ============================================================================

import { createContext, useContext, type ReactNode } from 'react'
import { useKeliScale, type UseKeliScaleReturn } from '@erp/hooks/useKeliScale'

export const SCALE_NAMESPACE = 'rs_scale'

const ScaleContext = createContext<UseKeliScaleReturn | null>(null)

export function ScaleProvider({ children }: { children: ReactNode }) {
  const scale = useKeliScale({
    storageNamespace: SCALE_NAMESPACE,
    useFacilityDefaults: false,
  })
  return <ScaleContext.Provider value={scale}>{children}</ScaleContext.Provider>
}

export function useScale(): UseKeliScaleReturn {
  const ctx = useContext(ScaleContext)
  if (!ctx) throw new Error('useScale phải nằm trong <ScaleProvider>')
  return ctx
}
