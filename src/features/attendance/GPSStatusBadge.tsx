// ============================================================
// GPS STATUS BADGE
// File: src/features/attendance/GPSStatusBadge.tsx
// Huy Anh ERP System - Chấm công V2
// ============================================================
// Badge nhỏ hiển thị trạng thái GPS trong bảng chấm công
// ============================================================

import { MapPin, MapPinOff, Zap } from 'lucide-react'

interface GPSStatusBadgeProps {
  /** GPS đã được xác minh */
  isVerified: boolean
  /** Có phải auto-checkout không */
  isAutoCheckout?: boolean
  /** Khoảng cách khi check-in (nếu có) */
  checkInLat?: number | null
  checkInLng?: number | null
  /** Khoảng cách khi check-out (nếu có) */
  checkOutLat?: number | null
  checkOutLng?: number | null
  /** Hiển thị dạng compact (chỉ icon) */
  compact?: boolean
}

export function GPSStatusBadge({
  isVerified,
  isAutoCheckout = false,
  checkInLat,
  checkInLng,
  checkOutLat,
  checkOutLng,
  compact = false,
}: GPSStatusBadgeProps) {
  // Auto-checkout badge
  if (isAutoCheckout) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded"
        title="Tự động checkout"
      >
        <Zap size={10} />
        {!compact && 'Auto'}
      </span>
    )
  }

  // Có GPS coordinates → verified
  const hasCheckInGPS = checkInLat !== null && checkInLat !== undefined && checkInLng !== null && checkInLng !== undefined
  const hasCheckOutGPS = checkOutLat !== null && checkOutLat !== undefined && checkOutLng !== null && checkOutLng !== undefined
  
  if (isVerified || hasCheckInGPS) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded"
        title={`GPS xác minh${hasCheckInGPS ? ` | Check-in: ${checkInLat?.toFixed(4)}, ${checkInLng?.toFixed(4)}` : ''}${hasCheckOutGPS ? ` | Check-out: ${checkOutLat?.toFixed(4)}, ${checkOutLng?.toFixed(4)}` : ''}`}
      >
        <MapPin size={10} />
        {!compact && 'GPS ✓'}
      </span>
    )
  }

  // Không có GPS
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded"
      title="Không có GPS"
    >
      <MapPinOff size={10} />
      {!compact && 'N/A'}
    </span>
  )
}

export default GPSStatusBadge