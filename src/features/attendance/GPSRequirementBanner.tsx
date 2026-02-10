// ============================================================
// GPS REQUIREMENT BANNER V2
// File: src/features/attendance/GPSRequirementBanner.tsx
// Huy Anh ERP System - Chấm công V2
// ============================================================
// LOGIC:
// - Mobile: BẮT BUỘC GPS → kiểm tra vị trí trong phạm vi công ty
// - Desktop: BỎ QUA GPS → cho phép check-in tự do
// - Hiển thị banner thông tin phù hợp từng loại thiết bị
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  MapPin,
  MapPinOff,
  Navigation,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Monitor,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { isMobileDevice, getDeviceType } from '../../utils/deviceDetect'

// ============================================================
// TYPES
// ============================================================

export type GPSStatus = 
  | 'checking'       // Đang kiểm tra
  | 'requesting'     // Đang yêu cầu quyền
  | 'granted'        // Đã cấp quyền, đang lấy tọa độ
  | 'available'      // GPS sẵn sàng, có tọa độ
  | 'denied'         // Người dùng từ chối
  | 'unavailable'    // Trình duyệt không hỗ trợ
  | 'error'          // Lỗi khác (timeout, position unavailable)
  | 'out_of_range'   // Có GPS nhưng ngoài phạm vi
  | 'desktop_bypass' // Desktop → bỏ qua GPS

export interface GPSPosition {
  latitude: number
  longitude: number
  accuracy: number  // Độ chính xác (mét)
}

export interface GPSValidationResult {
  valid: boolean
  distance: number
  location_name: string
}

interface GPSRequirementBannerProps {
  /** Callback khi GPS sẵn sàng với tọa độ (hoặc desktop bypass) */
  onGPSReady?: (position: GPSPosition | null) => void
  /** Callback khi GPS status thay đổi */
  onStatusChange?: (status: GPSStatus) => void
  /** GPS config từ attendance_settings */
  gpsConfig?: {
    enabled: boolean
    locations: {
      name: string
      latitude: number
      longitude: number
      radius_meters: number
    }[]
  } | null
  /** Ẩn banner khi GPS đã sẵn sàng (compact mode) */
  autoHideOnReady?: boolean
  /** Hiển thị compact (chỉ status bar) */
  compact?: boolean
}

// ============================================================
// GPS UTILS
// ============================================================

function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function GPSRequirementBanner({
  onGPSReady,
  onStatusChange,
  gpsConfig,
  autoHideOnReady = false,
  compact = false,
}: GPSRequirementBannerProps) {
  const [status, setStatus] = useState<GPSStatus>('checking')
  const [position, setPosition] = useState<GPSPosition | null>(null)
  const [validation, setValidation] = useState<GPSValidationResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [showGuide, setShowGuide] = useState(false)
  const [watchId, setWatchId] = useState<number | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet' | 'desktop'>('desktop')

  // Update status and notify parent
  const updateStatus = useCallback((newStatus: GPSStatus) => {
    setStatus(newStatus)
    onStatusChange?.(newStatus)
  }, [onStatusChange])

  // Validate position against company locations
  const validatePosition = useCallback((pos: GPSPosition) => {
    if (!gpsConfig?.enabled || !gpsConfig.locations.length) {
      return { valid: true, distance: 0, location_name: 'N/A' }
    }

    for (const loc of gpsConfig.locations) {
      const distance = calculateDistance(pos.latitude, pos.longitude, loc.latitude, loc.longitude)
      if (distance <= loc.radius_meters) {
        return { valid: true, distance: Math.round(distance), location_name: loc.name }
      }
    }

    const nearest = gpsConfig.locations.reduce((min, loc) => {
      const d = calculateDistance(pos.latitude, pos.longitude, loc.latitude, loc.longitude)
      return d < min.distance ? { distance: d, name: loc.name } : min
    }, { distance: Infinity, name: '' })

    return {
      valid: false,
      distance: Math.round(nearest.distance),
      location_name: nearest.name,
    }
  }, [gpsConfig])

  // Handle successful GPS position
  const handlePosition = useCallback((geoPosition: GeolocationPosition) => {
    const pos: GPSPosition = {
      latitude: geoPosition.coords.latitude,
      longitude: geoPosition.coords.longitude,
      accuracy: geoPosition.coords.accuracy,
    }
    setPosition(pos)

    const result = validatePosition(pos)
    setValidation(result)

    if (result.valid) {
      updateStatus('available')
      onGPSReady?.(pos)
    } else {
      updateStatus('out_of_range')
    }
  }, [validatePosition, updateStatus, onGPSReady])

  // Handle GPS error
  const handleError = useCallback((error: GeolocationPositionError) => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        updateStatus('denied')
        setErrorMessage('Bạn đã từ chối quyền truy cập vị trí. Vui lòng bật lại trong cài đặt trình duyệt.')
        break
      case error.POSITION_UNAVAILABLE:
        updateStatus('error')
        setErrorMessage('Không thể xác định vị trí. Vui lòng kiểm tra GPS thiết bị.')
        break
      case error.TIMEOUT:
        updateStatus('error')
        setErrorMessage('Hết thời gian chờ GPS. Vui lòng thử lại.')
        break
      default:
        updateStatus('error')
        setErrorMessage('Lỗi GPS không xác định. Vui lòng thử lại.')
    }
  }, [updateStatus])

  // Request GPS permission and start watching
  const requestGPS = useCallback(() => {
    if (!navigator.geolocation) {
      updateStatus('unavailable')
      setErrorMessage('Trình duyệt không hỗ trợ GPS. Vui lòng sử dụng Chrome hoặc Safari.')
      return
    }

    updateStatus('requesting')

    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    )

    const id = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 10000,
      }
    )
    setWatchId(id)
  }, [handlePosition, handleError, updateStatus])

  // ============================================================
  // DETECT DEVICE + INIT GPS ON MOUNT
  // ============================================================

  useEffect(() => {
    const isMobile = isMobileDevice()
    const type = getDeviceType()
    setIsDesktop(!isMobile)
    setDeviceType(type)

    // ── DESKTOP: bypass GPS hoàn toàn ──
    if (!isMobile) {
      updateStatus('desktop_bypass')
      onGPSReady?.(null) // Signal parent: sẵn sàng check-in, không có tọa độ
      return
    }

    // ── MOBILE: bắt buộc GPS ──
    if (!navigator.geolocation) {
      updateStatus('unavailable')
      setErrorMessage('Trình duyệt không hỗ trợ định vị GPS.')
      return
    }

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') {
          requestGPS()
        } else if (result.state === 'denied') {
          updateStatus('denied')
          setErrorMessage('Quyền GPS đã bị từ chối. Vui lòng bật lại trong cài đặt trình duyệt.')
        } else {
          updateStatus('checking')
        }

        result.onchange = () => {
          if (result.state === 'granted') {
            requestGPS()
          } else if (result.state === 'denied') {
            updateStatus('denied')
          }
        }
      }).catch(() => {
        updateStatus('checking')
      })
    } else {
      updateStatus('checking')
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-hide when ready
  if (autoHideOnReady && (status === 'available' || status === 'desktop_bypass')) {
    return null
  }

  // ============================================================
  // DESKTOP BYPASS BANNER
  // ============================================================

  if (status === 'desktop_bypass') {
    if (compact) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-slate-50 text-slate-600">
          <Monitor size={14} />
          <span className="font-medium">Máy tính — GPS không bắt buộc</span>
        </div>
      )
    }

    return (
      <div className="rounded-xl border-2 bg-slate-50 border-slate-200 overflow-hidden">
        <div className="px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Monitor className="text-slate-500" size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-700">
                  Đang dùng máy tính
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  <CheckCircle2 size={10} />
                  Sẵn sàng
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                GPS không bắt buộc trên máy tính bàn. Bạn có thể check-in ngay.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                💡 Nếu sử dụng điện thoại, hệ thống sẽ yêu cầu bật GPS để xác minh vị trí.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // COMPACT MODE (MOBILE)
  // ============================================================

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
        status === 'available' ? 'bg-green-50 text-green-700' :
        status === 'out_of_range' ? 'bg-red-50 text-red-700' :
        status === 'denied' || status === 'unavailable' ? 'bg-red-50 text-red-700' :
        status === 'checking' || status === 'requesting' ? 'bg-blue-50 text-blue-700' :
        'bg-yellow-50 text-yellow-700'
      }`}>
        {status === 'available' && <CheckCircle2 size={14} />}
        {status === 'out_of_range' && <MapPinOff size={14} />}
        {(status === 'denied' || status === 'unavailable') && <XCircle size={14} />}
        {(status === 'checking' || status === 'requesting') && <Loader2 size={14} className="animate-spin" />}
        {status === 'error' && <AlertTriangle size={14} />}

        <span className="font-medium">
          {status === 'available' && `✓ GPS: ${validation?.location_name} (${validation?.distance}m)`}
          {status === 'out_of_range' && `✗ Ngoài phạm vi (${validation?.distance}m)`}
          {status === 'denied' && 'GPS bị từ chối'}
          {status === 'unavailable' && 'GPS không khả dụng'}
          {status === 'checking' && 'Đang kiểm tra GPS...'}
          {status === 'requesting' && 'Đang lấy vị trí...'}
          {status === 'error' && 'Lỗi GPS'}
        </span>

        {(status === 'denied' || status === 'error') && (
          <button
            onClick={requestGPS}
            className="ml-auto p-1 hover:bg-white/50 rounded"
            title="Thử lại"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    )
  }

  // ============================================================
  // FULL BANNER MODE (MOBILE)
  // ============================================================

  const getBannerStyle = () => {
    switch (status) {
      case 'available':
        return {
          bg: 'bg-green-50 border-green-200',
          icon: <CheckCircle2 className="text-green-600" size={24} />,
          title: 'GPS đã sẵn sàng',
          titleColor: 'text-green-800',
        }
      case 'out_of_range':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: <MapPinOff className="text-red-600" size={24} />,
          title: 'Ngoài khu vực công ty',
          titleColor: 'text-red-800',
        }
      case 'denied':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: <XCircle className="text-red-600" size={24} />,
          title: 'GPS bị từ chối — Không thể điểm danh',
          titleColor: 'text-red-800',
        }
      case 'unavailable':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: <XCircle className="text-red-600" size={24} />,
          title: 'GPS không khả dụng',
          titleColor: 'text-red-800',
        }
      case 'error':
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          icon: <AlertTriangle className="text-yellow-600" size={24} />,
          title: 'Lỗi GPS',
          titleColor: 'text-yellow-800',
        }
      default:
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: <Navigation className="text-blue-600 animate-pulse" size={24} />,
          title: status === 'requesting' ? 'Đang lấy vị trí...' : 'Đang kiểm tra GPS...',
          titleColor: 'text-blue-800',
        }
    }
  }

  const style = getBannerStyle()

  return (
    <div className={`rounded-xl border-2 ${style.bg} overflow-hidden`}>
      {/* Main Banner */}
      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {status === 'checking' || status === 'requesting' ? (
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Loader2 className="text-blue-600 animate-spin" size={20} />
              </div>
            ) : (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                status === 'available' ? 'bg-green-100' :
                status === 'out_of_range' || status === 'denied' || status === 'unavailable' ? 'bg-red-100' :
                'bg-yellow-100'
              }`}>
                {style.icon}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-semibold ${style.titleColor}`}>
                {style.title}
              </h3>
              {status === 'available' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  <Shield size={10} />
                  Xác minh
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                <Smartphone size={10} />
                {deviceType === 'tablet' ? 'Tablet' : 'Di động'}
              </span>
            </div>

            {/* Description */}
            <div className="mt-1 text-sm">
              {status === 'available' && validation && (
                <p className="text-green-700">
                  Khu vực: <strong>{validation.location_name}</strong> —
                  Khoảng cách: <strong>{validation.distance}m</strong>
                  {position?.accuracy && (
                    <span className="text-green-600 ml-2">
                      (±{Math.round(position.accuracy)}m)
                    </span>
                  )}
                </p>
              )}

              {status === 'out_of_range' && validation && (
                <div>
                  <p className="text-red-700">
                    Khoảng cách đến <strong>{validation.location_name}</strong>: <strong>{validation.distance}m</strong>
                  </p>
                  <p className="text-red-600 mt-1">
                    Cần ở trong phạm vi <strong>{gpsConfig?.locations?.[0]?.radius_meters || 200}m</strong> để check-in.
                  </p>
                </div>
              )}

              {(status === 'checking' || status === 'requesting') && (
                <p className="text-blue-700">
                  {status === 'checking'
                    ? 'Đang kiểm tra quyền GPS trên thiết bị di động...'
                    : 'Đang xác định vị trí. Vui lòng chờ...'}
                </p>
              )}

              {status === 'denied' && <p className="text-red-700">{errorMessage}</p>}
              {status === 'unavailable' && <p className="text-red-700">{errorMessage}</p>}
              {status === 'error' && <p className="text-yellow-700">{errorMessage}</p>}
            </div>

            {/* Action buttons */}
            <div className="mt-3 flex flex-wrap gap-2">
              {status === 'checking' && (
                <button
                  onClick={requestGPS}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <MapPin size={16} />
                  Cho phép truy cập GPS
                </button>
              )}

              {(status === 'error' || status === 'out_of_range') && (
                <button
                  onClick={requestGPS}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                    status === 'error'
                      ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  <RefreshCw size={16} />
                  Thử lại
                </button>
              )}

              {(status === 'denied' || status === 'unavailable' || status === 'error' || status === 'checking') && (
                <button
                  onClick={() => setShowGuide(!showGuide)}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-white/60 rounded-lg transition-colors"
                >
                  {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Hướng dẫn bật GPS
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GPS Guide (expandable) */}
      {showGuide && (
        <div className="border-t border-gray-200 bg-white/60 px-4 py-4 sm:px-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-medium text-gray-800">
              <Smartphone size={16} />
              Hướng dẫn bật GPS trên điện thoại
            </div>
            <ol className="text-sm text-gray-600 space-y-1.5 ml-6 list-decimal">
              <li>Mở <strong>Cài đặt</strong> điện thoại</li>
              <li>Vào <strong>Quyền riêng tư</strong> → <strong>Vị trí / Location</strong></li>
              <li>Bật <strong>Dịch vụ vị trí</strong> (Location Services)</li>
              <li>Quay lại trình duyệt và <strong>tải lại trang</strong></li>
              <li>Nhấn <strong>"Cho phép"</strong> khi trình duyệt hỏi</li>
            </ol>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>⚠️ Lưu ý:</strong> GPS bắt buộc trên điện thoại/tablet để xác minh vị trí.
              Nếu dùng <strong>máy tính bàn</strong>, hệ thống sẽ tự động bỏ qua bước này.
            </p>
          </div>
        </div>
      )}

      {/* GPS Required Warning Bar (mobile only) */}
      {(status !== 'available' && status !== 'checking' && status !== 'requesting') && (
        <div className="px-4 py-2 bg-gray-800 text-white text-center text-sm">
          <span className="inline-flex items-center gap-2">
            <Smartphone size={14} className="text-yellow-400" />
            <strong>Thiết bị di động:</strong> Bắt buộc bật GPS và ở trong khu vực công ty mới được điểm danh
          </span>
        </div>
      )}
    </div>
  )
}

export default GPSRequirementBanner