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
import { useKeliScale, type UseKeliScaleReturn, type KeliScaleConfig } from '@erp/hooks/useKeliScale'

export const SCALE_NAMESPACE = 'rs_scale'

// Đầu cân BÀN của Cân mủ lẻ = KELI XK3118T1: 9600 / 7 data bits / None / 1 stop — XÁC NHẬN
// 2026-09-09 qua Terminal máy thật (số thực 2.2kg = chuỗi "=02.2000"). KHÁC hẳn cân XE (8 data
// bits). Truyền làm defaultConfig → nối THẲNG thông số này, khỏi dò; nếu sai (đổi đầu cân khác)
// thì hook tự dò lại và lưu. Hằng số MODULE-LEVEL để identity ổn định (không churn deps).
const BENCH_SCALE_CONFIG: KeliScaleConfig = {
  baudRate: 9600, dataBits: 7, stopBits: 1, parity: 'none', flowControl: 'none',
}

const ScaleContext = createContext<UseKeliScaleReturn | null>(null)

export function ScaleProvider({ children }: { children: ReactNode }) {
  const scale = useKeliScale({
    storageNamespace: SCALE_NAMESPACE,
    useFacilityDefaults: false,
    defaultConfig: BENCH_SCALE_CONFIG,
    // KHÔNG cần weightScale: đầu cân XK3118T1 này gửi số cân ĐẢO NGƯỢC (LSB-first) — parser
    // đã tự đảo chuỗi rồi đọc ("=0.02000"→"00020.0"=20; "=0.58000"→"00085.0"=85). Xem
    // parseKeliOutput format 2. (Trước đây tưởng "theo tấn ×1000" — chỉ trùng ở 20 kg.)
    // Độ chia đầu cân = 0,5 kg (5 lạng) → làm tròn hiển thị về bội 0,5, khỏi ra số lẻ vô nghĩa.
    snapKg: 0.5,
  })
  return <ScaleContext.Provider value={scale}>{children}</ScaleContext.Provider>
}

export function useScale(): UseKeliScaleReturn {
  const ctx = useContext(ScaleContext)
  if (!ctx) throw new Error('useScale phải nằm trong <ScaleProvider>')
  return ctx
}
