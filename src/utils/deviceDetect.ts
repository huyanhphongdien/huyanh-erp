// ============================================================
// DEVICE DETECTION UTILITY
// File: src/utils/deviceDetect.ts
// Huy Anh ERP System
// ============================================================
// Phát hiện thiết bị: điện thoại / tablet / máy tính.
// Dùng cho luật chấm công (owner chốt 16/09/2026):
//   - Điện thoại & tablet: BẮT BUỘC GPS, phải trong bán kính nhà máy.
//   - Máy tính (PC/laptop): bỏ qua GPS.
// Kết luận ở đây được gửi lên service (deviceType) và ghi vào
// attendance.check_in_device — DB trigger chỉ ép GPS khi giá trị là mobile/tablet.
// ============================================================

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

/**
 * Loại thiết bị. Thứ tự ưu tiên:
 *  1. App Capacitor (Huy Anh Ops) → luôn là điện thoại.
 *  2. Client Hints `userAgentData.mobile` (Chrome/Edge mới, không giả được bằng "Desktop site").
 *  3. UA điện thoại / tablet, kể cả iPad giả Macintosh (iPadOS 13+ có maxTouchPoints > 1).
 *  4. UA Windows / ChromeOS → máy tính (laptop cảm ứng vẫn là máy tính).
 *  5. Android bật "Desktop site" → UA "Linux x86_64" nhưng màn hình cảm ứng nhiều điểm → điện thoại/tablet.
 *  6. Còn lại: có cảm ứng + màn nhỏ → di động; không thì máy tính.
 */
export function getDeviceType(): DeviceType {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  const touch = navigator.maxTouchPoints || 0
  const uaData = (navigator as any).userAgentData
  const native = !!(window as any).Capacitor?.isNativePlatform?.()

  if (native) return 'mobile'
  if (uaData?.mobile === true) return 'mobile'
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return 'tablet'
  if (/Android(?!.*Mobile)/i.test(ua)) return 'tablet'
  if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) return 'mobile'
  if (/Windows NT|CrOS/i.test(ua)) return 'desktop'
  if (/Linux/i.test(ua) && touch > 1) return window.innerWidth < 1024 ? 'mobile' : 'tablet'
  if (touch > 0 && window.innerWidth < 768) return 'mobile'
  if (touch > 0 && window.innerWidth < 1024) return 'tablet'
  return 'desktop'
}

/** Điện thoại hoặc tablet — nhóm phải có GPS khi chấm công. */
export function isMobileDevice(): boolean {
  return getDeviceType() !== 'desktop'
}

/**
 * Kiểm tra thiết bị có khả năng GPS chính xác không
 * Mobile: có GPS chip → chính xác
 * Desktop: dùng IP/WiFi → không chính xác
 */
export function hasReliableGPS(): boolean {
  return isMobileDevice()
}

/** Chuỗi truy vết ghi vào attendance.check_in_device: "<loại>|<userAgent rút gọn>". */
export function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return ''
  return (navigator.userAgent || '').slice(0, 200)
}
