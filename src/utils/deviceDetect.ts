// ============================================================
// DEVICE DETECTION UTILITY
// File: src/utils/deviceDetect.ts
// Huy Anh ERP System
// ============================================================
// Phát hiện thiết bị mobile vs desktop
// Dùng cho logic GPS: mobile bắt buộc GPS, desktop bỏ qua
// ============================================================

/**
 * Kiểm tra thiết bị hiện tại có phải mobile không
 * Kết hợp: userAgent + touchPoints + screen width
 */
export function isMobileDevice(): boolean {
  // 1. Check userAgent patterns
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || ''
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i
  const isMobileUA = mobileRegex.test(userAgent)

  // 2. Check touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // 3. Check screen width (mobile typically < 1024px)
  const isSmallScreen = window.innerWidth < 1024

  // Kết luận: mobile nếu userAgent match HOẶC (có touch VÀ màn hình nhỏ)
  // Lý do: tablet có touch nhưng màn hình lớn → vẫn coi là mobile (có GPS)
  // Desktop có touch screen → màn hình lớn + không match UA → coi là desktop
  return isMobileUA || (hasTouch && isSmallScreen)
}

/**
 * Kiểm tra thiết bị có khả năng GPS chính xác không
 * Mobile: có GPS chip → chính xác
 * Desktop: dùng IP/WiFi → không chính xác
 */
export function hasReliableGPS(): boolean {
  return isMobileDevice()
}

/**
 * Lấy tên loại thiết bị để hiển thị
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const userAgent = navigator.userAgent || ''
  
  if (/iPad|Android(?!.*Mobile)/i.test(userAgent)) return 'tablet'
  if (/iPhone|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) return 'mobile'
  
  // Fallback: touch + small screen → tablet/mobile
  if (navigator.maxTouchPoints > 0 && window.innerWidth < 768) return 'mobile'
  if (navigator.maxTouchPoints > 0 && window.innerWidth < 1024) return 'tablet'
  
  return 'desktop'
}