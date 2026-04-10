// ============================================================================
// QR CHECK-IN PAGE
// File: src/features/attendance/QRCheckInPage.tsx
// NV quét QR ở cổng nhà máy → check-in/out 1 chạm
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, Camera, Loader2, Clock, LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'

// ============================================================================
// CONSTANTS
// ============================================================================

const BRAND = { primary: '#1B4D3E', secondary: '#2D8B6E' }

// QR payload format: HUYANH_CHECKIN:{location_id}:{daily_secret}
// For now, any QR starting with HUYANH_CHECKIN is valid (MVP)
const QR_PREFIX = 'HUYANH_CHECKIN'

// ============================================================================
// COMPONENT
// ============================================================================

export default function QRCheckInPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(false)
  const processingRef = useRef(false)

  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error' | 'already'>('idle')
  const [message, setMessage] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [todayRecord, setTodayRecord] = useState<{ checkIn: string | null; checkOut: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

  // ── Load today's attendance ──
  useEffect(() => {
    const load = async () => {
      if (!user?.employee_id) return
      try {
        const { data } = await supabase
          .from('attendance')
          .select('check_in_time, check_out_time')
          .eq('employee_id', user.employee_id)
          .eq('date', todayStr)
          .order('check_in_time', { ascending: true })
          .limit(1)
        if (data && data.length > 0) {
          setTodayRecord({ checkIn: data[0].check_in_time, checkOut: data[0].check_out_time })
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [user?.employee_id, todayStr])

  // ── Start camera ──
  const startCamera = useCallback(async () => {
    try {
      setCameraError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setStatus('scanning')
      scanningRef.current = true
      scanFrame()
    } catch (err: any) {
      setCameraError(err.name === 'NotAllowedError'
        ? 'Vui lòng cho phép truy cập camera để quét QR'
        : 'Không thể mở camera: ' + err.message)
    }
  }, [])

  // ── Stop camera ──
  const stopCamera = useCallback(() => {
    scanningRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // ── Scan frame using BarcodeDetector API (native) ──
  const scanFrame = useCallback(async () => {
    if (!scanningRef.current || !videoRef.current || processingRef.current) return

    try {
      // Use BarcodeDetector if available (Chrome 83+, Edge, Android WebView)
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          const qrValue = barcodes[0].rawValue
          if (qrValue.startsWith(QR_PREFIX)) {
            processingRef.current = true
            await handleQRScanned(qrValue)
            return
          }
        }
      } else {
        // Fallback: capture frame to canvas and use html5-qrcode
        if (canvasRef.current && videoRef.current.readyState === 4) {
          const canvas = canvasRef.current
          canvas.width = videoRef.current.videoWidth
          canvas.height = videoRef.current.videoHeight
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0)
            // Use dynamic import for html5-qrcode (only if BarcodeDetector unavailable)
            try {
              const { Html5Qrcode } = await import('html5-qrcode')
              const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'))
              const file = new File([blob], 'frame.png', { type: 'image/png' })
              const result = await Html5Qrcode.scanFile(file, false)
              if (result.startsWith(QR_PREFIX)) {
                processingRef.current = true
                await handleQRScanned(result)
                return
              }
            } catch {}
          }
        }
      }
    } catch {}

    // Continue scanning
    if (scanningRef.current) {
      requestAnimationFrame(() => setTimeout(scanFrame, 200))
    }
  }, [])

  // ── Handle QR scanned ──
  const handleQRScanned = async (qrValue: string) => {
    stopCamera()

    if (!user?.employee_id) {
      setStatus('error')
      setMessage('Không tìm thấy thông tin nhân viên')
      return
    }

    try {
      const now = new Date()
      const nowISO = now.toISOString()
      const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })

      // Check if already checked in today
      const { data: existing } = await supabase
        .from('attendance')
        .select('id, check_in_time, check_out_time')
        .eq('employee_id', user.employee_id)
        .eq('date', todayStr)

      if (existing && existing.length > 0) {
        const lastRecord = existing[existing.length - 1]
        if (lastRecord.check_out_time) {
          // Already checked out → show message
          setStatus('already')
          setMessage(`Bạn đã chấm công hôm nay (vào ${fmtTime(lastRecord.check_in_time)} — ra ${fmtTime(lastRecord.check_out_time)})`)
          setTodayRecord({ checkIn: lastRecord.check_in_time, checkOut: lastRecord.check_out_time })
          return
        }
        // Check-in exists but no check-out → do check-out
        await supabase
          .from('attendance')
          .update({ check_out_time: nowISO })
          .eq('id', lastRecord.id)

        setStatus('success')
        setMessage(`Check-out thành công lúc ${timeStr}`)
        setTodayRecord({ checkIn: lastRecord.check_in_time, checkOut: nowISO })
        return
      }

      // No record today → create check-in
      // Find active shift for this employee (if any assigned)
      let shiftId: string | null = null
      try {
        const { data: assignment } = await supabase
          .from('shift_assignments')
          .select('shift_id')
          .eq('employee_id', user.employee_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
        shiftId = assignment?.shift_id || null
      } catch {}

      // If no assignment, try to find default shift (ADMIN_PROD)
      if (!shiftId) {
        const { data: defaultShift } = await supabase
          .from('shifts')
          .select('id')
          .eq('code', 'ADMIN_PROD')
          .limit(1)
          .maybeSingle()
        shiftId = defaultShift?.id || null
      }

      const { error: insertErr } = await supabase
        .from('attendance')
        .insert({
          employee_id: user.employee_id,
          date: todayStr,
          shift_date: todayStr,
          check_in_time: nowISO,
          shift_id: shiftId,
          status: 'present',
          auto_checkout: false,
          is_gps_verified: false,
          working_minutes: 0,
          overtime_minutes: 0,
          late_minutes: 0,
          early_leave_minutes: 0,
        })

      if (insertErr) throw insertErr

      setStatus('success')
      setMessage(`Check-in thành công lúc ${timeStr}`)
      setTodayRecord({ checkIn: nowISO, checkOut: null })
    } catch (err: any) {
      setStatus('error')
      setMessage('Lỗi: ' + (err.message || 'Không thể chấm công'))
    }
  }

  const fmtTime = (iso: string | null) => {
    if (!iso) return '...'
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
  }

  const reset = () => {
    setStatus('idle')
    setMessage('')
    processingRef.current = false
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0EDE8' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND.primary }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#F0EDE8' }}>
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-md border-b border-black/5 sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-black/5">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="text-[16px] font-bold" style={{ color: BRAND.primary }}>Chấm công QR</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Today's status */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm p-4">
          <p className="text-[13px] font-semibold text-gray-700 mb-2">
            <Clock size={14} className="inline mr-1" />
            Hôm nay ({new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })})
          </p>
          {todayRecord?.checkIn ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[13px] text-gray-600">
                Vào: <strong>{fmtTime(todayRecord.checkIn)}</strong>
                {todayRecord.checkOut
                  ? <> — Ra: <strong>{fmtTime(todayRecord.checkOut)}</strong></>
                  : <span className="text-amber-600 ml-2">• Chưa check-out</span>}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[13px] text-amber-700 font-medium">Chưa chấm công hôm nay</span>
            </div>
          )}
        </div>

        {/* Scanner area */}
        {status === 'idle' && (
          <div className="text-center space-y-4">
            <button
              onClick={startCamera}
              className="w-full py-5 rounded-2xl text-white text-[16px] font-bold shadow-lg active:scale-[0.98] transition-transform"
              style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})` }}
            >
              <Camera size={24} className="inline mr-2" />
              {todayRecord?.checkIn && !todayRecord.checkOut ? 'Quét QR để Check-out' : 'Quét QR để Check-in'}
            </button>
            {cameraError && (
              <p className="text-red-500 text-[13px] bg-red-50 rounded-xl px-4 py-3">{cameraError}</p>
            )}
            <p className="text-[12px] text-gray-400">Hướng camera vào mã QR ở cổng nhà máy</p>
          </div>
        )}

        {status === 'scanning' && (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black shadow-lg" style={{ aspectRatio: '4/3' }}>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {/* Scan overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-white/60 rounded-2xl"
                  style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="bg-black/60 text-white px-3 py-1.5 rounded-full text-[12px] font-medium">
                  <Loader2 size={12} className="inline animate-spin mr-1" /> Đang quét...
                </span>
              </div>
            </div>
            <button onClick={() => { stopCamera(); reset() }}
              className="w-full py-3 rounded-xl border border-gray-300 text-gray-600 text-[14px] font-medium">
              Hủy
            </button>
          </div>
        )}

        {(status === 'success' || status === 'already') && (
          <div className="text-center space-y-4">
            <div className={`inline-flex p-4 rounded-full ${status === 'success' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
              <CheckCircle2 size={48} className={status === 'success' ? 'text-emerald-500' : 'text-blue-500'} />
            </div>
            <p className={`text-[16px] font-bold ${status === 'success' ? 'text-emerald-700' : 'text-blue-700'}`}>
              {message}
            </p>
            <div className="flex gap-2">
              <button onClick={() => navigate('/')}
                className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold"
                style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})` }}>
                Về trang chủ
              </button>
              {todayRecord?.checkIn && !todayRecord.checkOut && (
                <button onClick={reset}
                  className="flex-1 py-3 rounded-xl border-2 text-[14px] font-semibold"
                  style={{ borderColor: BRAND.primary, color: BRAND.primary }}>
                  <LogOut size={14} className="inline mr-1" /> Check-out
                </button>
              )}
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-4">
            <div className="inline-flex p-4 rounded-full bg-red-50">
              <XCircle size={48} className="text-red-500" />
            </div>
            <p className="text-[16px] font-bold text-red-700">{message}</p>
            <button onClick={reset}
              className="w-full py-3 rounded-xl text-white text-[14px] font-semibold bg-red-500 active:bg-red-600">
              Thử lại
            </button>
          </div>
        )}

        {/* Hidden canvas for QR decoding fallback */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}
