// ============================================================================
// FILE: src/components/wms/CameraFeed.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Camera IP live stream + snapshot
// ============================================================================
// Hiển thị live MJPEG stream từ camera IP
// Hỗ trợ: MJPEG stream (hầu hết camera IP), snapshot URL
// Cấu hình IP camera từ localStorage hoặc props
// ============================================================================

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  Camera,
  CameraOff,
  Settings,
  RefreshCw,
  Loader2,
  Check,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export interface CameraConfig {
  id: 'front' | 'rear' | 'top'
  label: string
  ip: string
  /** MJPEG stream path — mặc định cho hầu hết camera IP */
  streamPath: string
  /** Snapshot URL path — chụp 1 ảnh JPEG */
  snapshotPath: string
  /** Cổng HTTP camera */
  port: number
  /** Username (nếu camera có auth) */
  username?: string
  /** Password (nếu camera có auth) */
  password?: string
}

export interface CameraFeedProps {
  config: CameraConfig
  /** Chiều cao khung hình */
  height?: string
  /** Callback khi chụp snapshot thành công — trả về blob */
  onSnapshot?: (blob: Blob, cameraId: string) => void
  /** Hiện nút settings */
  showSettings?: boolean
  /** Callback khi thay đổi IP */
  onConfigChange?: (config: CameraConfig) => void
}

// ============================================================================
// DEFAULT CAMERA CONFIGS
// ============================================================================

/** 
 * Cấu hình mặc định 3 camera Huy Anh
 * Stream path phổ biến cho các hãng camera:
 *   - Hikvision: /ISAPI/Streaming/channels/101/httpPreview
 *   - Dahua:     /cgi-bin/mjpg/video.cgi?channel=1
 *   - Generic:   /mjpeg/1 hoặc /video.mjpg hoặc /stream
 *   - Reolink:   /cgi-bin/api.cgi?cmd=Snap (snapshot only)
 */
export const DEFAULT_CAMERAS: CameraConfig[] = [
  {
    id: 'front',
    label: 'Mặt trước',
    ip: '192.168.4.1',
    port: 80,
    streamPath: '/mjpeg/1',
    snapshotPath: '/snap.jpg',
  },
  {
    id: 'rear',
    label: 'Mặt sau',
    ip: '192.168.4.2',
    port: 80,
    streamPath: '/mjpeg/1',
    snapshotPath: '/snap.jpg',
  },
  {
    id: 'top',
    label: 'Trên cao',
    ip: '192.168.4.3',
    port: 80,
    streamPath: '/mjpeg/1',
    snapshotPath: '/snap.jpg',
  },
]

// Storage key for persisting camera configs
const STORAGE_KEY = 'weighbridge_camera_configs'

/**
 * Load camera configs từ localStorage, merge với defaults
 */
export function loadCameraConfigs(): CameraConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as CameraConfig[]
      // Merge: giữ stored IP/paths, fallback defaults cho fields mới
      return DEFAULT_CAMERAS.map(def => {
        const saved = parsed.find(c => c.id === def.id)
        return saved ? { ...def, ...saved } : def
      })
    }
  } catch { /* ignore */ }
  return [...DEFAULT_CAMERAS]
}

/**
 * Lưu camera configs vào localStorage
 */
export function saveCameraConfigs(configs: CameraConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
  } catch { /* ignore */ }
}

// ============================================================================
// HELPER: Build camera URLs
// ============================================================================

function buildStreamUrl(config: CameraConfig): string {
  const auth = config.username
    ? `${config.username}:${config.password || ''}@`
    : ''
  return `http://${auth}${config.ip}:${config.port}${config.streamPath}`
}

function buildSnapshotUrl(config: CameraConfig): string {
  const auth = config.username
    ? `${config.username}:${config.password || ''}@`
    : ''
  return `http://${auth}${config.ip}:${config.port}${config.snapshotPath}`
}

// ============================================================================
// SINGLE CAMERA FEED COMPONENT
// ============================================================================

export function CameraFeed({
  config,
  height = 'h-36',
  onSnapshot,
  showSettings = false,
  onConfigChange,
}: CameraFeedProps) {
  const [status, setStatus] = useState<'loading' | 'online' | 'offline'>('loading')
  const [showConfig, setShowConfig] = useState(false)
  const [editIp, setEditIp] = useState(config.ip)
  const [editPort, setEditPort] = useState(String(config.port))
  const [editStreamPath, setEditStreamPath] = useState(config.streamPath)
  const [editSnapshotPath, setEditSnapshotPath] = useState(config.snapshotPath)
  const imgRef = useRef<HTMLImageElement>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>()

  const streamUrl = buildStreamUrl(config)

  // Update edit fields when config changes
  useEffect(() => {
    setEditIp(config.ip)
    setEditPort(String(config.port))
    setEditStreamPath(config.streamPath)
    setEditSnapshotPath(config.snapshotPath)
  }, [config.ip, config.port, config.streamPath, config.snapshotPath])

  // Auto-retry on offline
  useEffect(() => {
    if (status === 'offline') {
      retryTimer.current = setTimeout(() => {
        setStatus('loading')
      }, 10000) // Retry every 10s
    }
    return () => clearTimeout(retryTimer.current)
  }, [status])

  function handleLoad() {
    setStatus('online')
  }

  function handleError() {
    setStatus('offline')
  }

  function handleRetry() {
    setStatus('loading')
    // Force reload bằng cách thêm timestamp
    if (imgRef.current) {
      const sep = streamUrl.includes('?') ? '&' : '?'
      imgRef.current.src = `${streamUrl}${sep}_t=${Date.now()}`
    }
  }

  function handleSaveConfig() {
    const newConfig: CameraConfig = {
      ...config,
      ip: editIp.trim(),
      port: parseInt(editPort) || 80,
      streamPath: editStreamPath.trim() || '/mjpeg/1',
      snapshotPath: editSnapshotPath.trim() || '/snap.jpg',
    }
    onConfigChange?.(newConfig)
    setShowConfig(false)
    setStatus('loading')
  }

  // ===== RENDER =====
  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-300 bg-gray-900">
      {/* Label overlay */}
      <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1">
        <span className="bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          {config.label}
        </span>
        <span className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-400 animate-pulse' : status === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`} />
      </div>

      {/* Settings button */}
      {showSettings && (
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="absolute top-1.5 right-1.5 z-10 w-6 h-6 bg-black/50 text-white rounded flex items-center justify-center hover:bg-black/70"
        >
          <Settings size={12} />
        </button>
      )}

      {/* Stream image (MJPEG) */}
      {status !== 'offline' && (
        <img
          ref={imgRef}
          src={streamUrl}
          alt={config.label}
          className={`w-full ${height} object-cover`}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Loading state */}
      {status === 'loading' && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gray-800 ${height}`}>
          <Loader2 size={20} className="text-gray-400 animate-spin mb-1" />
          <p className="text-[10px] text-gray-500">Đang kết nối {config.ip}...</p>
        </div>
      )}

      {/* Offline state */}
      {status === 'offline' && (
        <div className={`flex flex-col items-center justify-center bg-gray-800 ${height}`}>
          <CameraOff size={24} className="text-gray-500 mb-1" />
          <p className="text-[10px] text-gray-500 mb-2">{config.ip} — Mất kết nối</p>
          <button
            onClick={handleRetry}
            className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-[10px] flex items-center gap-1 hover:bg-gray-600"
          >
            <RefreshCw size={10} /> Thử lại
          </button>
        </div>
      )}

      {/* Settings panel */}
      {showConfig && (
        <div className="absolute inset-0 z-20 bg-black/90 p-3 flex flex-col gap-2">
          <p className="text-white text-xs font-bold">{config.label} — Cấu hình</p>
          <div className="flex gap-1">
            <input
              value={editIp}
              onChange={(e) => setEditIp(e.target.value)}
              placeholder="IP: 192.168.4.1"
              className="flex-1 h-7 px-2 text-xs bg-gray-800 text-white border border-gray-600 rounded"
            />
            <input
              value={editPort}
              onChange={(e) => setEditPort(e.target.value)}
              placeholder="Port"
              className="w-14 h-7 px-2 text-xs bg-gray-800 text-white border border-gray-600 rounded"
            />
          </div>
          <input
            value={editStreamPath}
            onChange={(e) => setEditStreamPath(e.target.value)}
            placeholder="Stream: /mjpeg/1"
            className="h-7 px-2 text-xs bg-gray-800 text-white border border-gray-600 rounded"
          />
          <input
            value={editSnapshotPath}
            onChange={(e) => setEditSnapshotPath(e.target.value)}
            placeholder="Snapshot: /snap.jpg"
            className="h-7 px-2 text-xs bg-gray-800 text-white border border-gray-600 rounded"
          />
          <div className="flex gap-1 mt-auto">
            <button onClick={() => setShowConfig(false)} className="flex-1 h-7 bg-gray-700 text-white rounded text-xs flex items-center justify-center gap-1">
              <X size={10} /> Hủy
            </button>
            <button onClick={handleSaveConfig} className="flex-1 h-7 bg-green-600 text-white rounded text-xs flex items-center justify-center gap-1">
              <Check size={10} /> Lưu
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CAMERA GRID — 3 cameras + snapshot all + settings
// ============================================================================

export interface CameraGridProps {
  /** Callback khi snapshot thành công — trả về array blobs */
  onSnapshotAll?: (snapshots: { cameraId: string; blob: Blob }[]) => void
  /** Callback snapshot đơn lẻ */
  onSnapshotSingle?: (blob: Blob, cameraId: string) => void
  /** Đang chụp */
  capturing?: boolean
}

export function CameraGrid({ onSnapshotAll, onSnapshotSingle, capturing }: CameraGridProps) {
  const [cameras, setCameras] = useState<CameraConfig[]>(loadCameraConfigs)
  const [showGlobalSettings, setShowGlobalSettings] = useState(false)
  const [snapping, setSnapping] = useState(false)

  function handleConfigChange(updated: CameraConfig) {
    const newConfigs = cameras.map(c => c.id === updated.id ? updated : c)
    setCameras(newConfigs)
    saveCameraConfigs(newConfigs)
  }

  /**
   * Chụp snapshot TẤT CẢ 3 camera cùng lúc
   * Dùng snapshot URL (JPEG đơn) thay vì stream
   */
  async function handleSnapshotAll() {
    setSnapping(true)
    const results: { cameraId: string; blob: Blob }[] = []

    await Promise.allSettled(
      cameras.map(async (cam) => {
        try {
          const url = buildSnapshotUrl(cam)
          const res = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            mode: 'cors',
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          results.push({ cameraId: cam.id, blob })
        } catch (err) {
          console.warn(`[Camera ${cam.id}] Snapshot failed:`, err)
          // Fallback: try canvas capture từ MJPEG stream
          try {
            const blob = await captureFromStream(cam)
            if (blob) results.push({ cameraId: cam.id, blob })
          } catch { /* skip this camera */ }
        }
      })
    )

    setSnapping(false)
    if (results.length > 0) {
      onSnapshotAll?.(results)
    }
  }

  return (
    <div className="space-y-2">
      {/* Camera grid — 3 camera */}
      <div className="grid grid-cols-3 gap-2">
        {cameras.map(cam => (
          <CameraFeed
            key={cam.id}
            config={cam}
            height="h-28 md:h-36"
            showSettings={showGlobalSettings}
            onConfigChange={handleConfigChange}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* Chụp cả 3 */}
        <button
          onClick={handleSnapshotAll}
          disabled={snapping || capturing}
          className="flex-1 h-12 bg-blue-600 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-50"
        >
          {snapping ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          {snapping ? 'Đang chụp...' : 'Chụp 3 camera'}
        </button>

        {/* Settings toggle */}
        <button
          onClick={() => setShowGlobalSettings(!showGlobalSettings)}
          className={`h-12 px-4 rounded-xl border text-sm font-medium flex items-center gap-1.5 ${
            showGlobalSettings
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-white text-gray-600 border-gray-300 active:bg-gray-50'
          }`}
        >
          <Settings size={14} />
          IP
        </button>
      </div>

      {/* Quick IP reference khi settings mở */}
      {showGlobalSettings && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase">Camera IPs — Bấm ⚙️ trên mỗi camera để sửa</p>
          {cameras.map(cam => (
            <div key={cam.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{cam.label}:</span>
              <span className="font-mono text-gray-900">{cam.ip}:{cam.port}{cam.streamPath}</span>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 mt-1">
            Stream phổ biến: Hikvision /ISAPI/Streaming/channels/101/httpPreview • 
            Dahua /cgi-bin/mjpg/video.cgi • Generic /mjpeg/1
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// HELPER: Capture frame từ MJPEG stream qua canvas (fallback)
// ============================================================================

async function captureFromStream(config: CameraConfig): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || 640
        canvas.height = img.naturalHeight || 480
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0)
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    // Dùng snapshot URL
    img.src = buildSnapshotUrl(config) + (config.snapshotPath.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    // Timeout 5s
    setTimeout(() => resolve(null), 5000)
  })
}

export default CameraFeed