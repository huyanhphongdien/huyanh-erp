import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Button, Typography, Space, Row, Col, Input, Modal, Image, Badge, Tooltip, message } from 'antd'
import {
  CameraOutlined, SettingOutlined, ReloadOutlined, SaveOutlined,
  DeleteOutlined, ExpandOutlined, EyeOutlined,
} from '@ant-design/icons'
import weighbridgeImageService from '@erp/services/wms/weighbridgeImageService'
import type { CaptureType } from '@erp/services/wms/weighbridgeImageService'

const { Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface CameraConfig {
  ip: string
  port: string
  username: string
  password: string
  channel: number
}

interface CameraSlot {
  key: CaptureType
  label: string
  config: CameraConfig
}

interface CameraPanelProps {
  ticketId: string | null
  disabled?: boolean
  onImageCountChange?: (count: number) => void
  captureRef?: React.MutableRefObject<((weighLabel?: string) => Promise<void>) | null>
  weighLabel?: string  // 'L1' or 'L2' — dùng để tag ảnh theo lần cân
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'wb_camera_config'

const DEFAULT_CAMERAS: CameraSlot[] = [
  {
    key: 'front',
    label: 'Trước xe',
    config: { ip: '', port: '80', username: 'admin', password: '', channel: 1 },
  },
  {
    key: 'rear',
    label: 'Sau xe',
    config: { ip: '', port: '80', username: 'admin', password: '', channel: 1 },
  },
  {
    key: 'top',
    label: 'Trên cao',
    config: { ip: '', port: '80', username: 'admin', password: '', channel: 1 },
  },
]

function loadCameraConfig(): CameraSlot[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as CameraSlot[]
      // Merge with defaults in case new cameras added
      return DEFAULT_CAMERAS.map((def) => {
        const found = parsed.find((p) => p.key === def.key)
        return found ? { ...def, config: { ...def.config, ...found.config } } : def
      })
    }
  } catch { /* ignore */ }
  return DEFAULT_CAMERAS
}

function saveCameraConfig(cameras: CameraSlot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cameras))
}

const PROXY_PORT = 3456

/** Snapshot URL qua proxy (tránh CORS + Digest Auth) */
function getDahuaSnapshotUrl(config: CameraConfig): string {
  if (!config.ip) return ''
  const params = new URLSearchParams({
    ip: config.ip,
    port: config.port || '80',
    channel: String(config.channel || 1),
    user: config.username || 'admin',
    pass: config.password || '',
  })
  return `http://localhost:${PROXY_PORT}/snapshot?${params.toString()}`
}

/** Direct URL (chỉ dùng hiển thị trong Settings) */
function getDahuaDirectUrl(config: CameraConfig): string {
  if (!config.ip) return ''
  return `http://${config.ip}:${config.port}/cgi-bin/snapshot.cgi?channel=${config.channel}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function CameraPanel({ ticketId, disabled, onImageCountChange, captureRef, weighLabel }: CameraPanelProps) {
  const [cameras, setCameras] = useState<CameraSlot[]>(loadCameraConfig)
  const [snapshots, setSnapshots] = useState<Record<string, string>>({}) // key -> blob URL
  const [savedImages, setSavedImages] = useState<Record<string, string>>({}) // key -> supabase URL
  const [capturing, setCapturing] = useState<Record<string, boolean>>({})
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTemp, setSettingsTemp] = useState<CameraSlot[]>([])
  const imgRefs = useRef<Record<string, HTMLImageElement | null>>({})

  // Live preview: no auto-refresh (use Chụp button instead to avoid spamming proxy)
  const liveUrls: Record<string, string> = {}

  // Load saved images for ticket
  useEffect(() => {
    if (!ticketId) return
    weighbridgeImageService.getByTicket(ticketId).then((images) => {
      const map: Record<string, string> = {}
      for (const img of images) {
        map[img.capture_type] = img.image_url
      }
      setSavedImages(map)
      onImageCountChange?.(images.length)
    }).catch(() => {})
  }, [ticketId])

  // ============================================================================
  // CAPTURE
  // ============================================================================

  /**
   * Chụp ảnh qua proxy server (localhost:3456).
   * Proxy xử lý Digest Auth + CORS, trả về JPEG blob.
   */
  const captureSnapshot = useCallback(async (cam: CameraSlot) => {
    if (!cam.config.ip) {
      message.warning(`Chưa cấu hình IP cho camera "${cam.label}"`)
      return
    }

    setCapturing((prev) => ({ ...prev, [cam.key]: true }))
    const url = getDahuaSnapshotUrl(cam.config)

    try {
      const resp = await fetch(url, { cache: 'no-store' })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || `HTTP ${resp.status}`)
      }
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      setSnapshots((prev) => ({ ...prev, [cam.key]: blobUrl }))
    } catch (err: any) {
      console.error(`Camera ${cam.label} error:`, err)
      if (err.message?.includes('Failed to fetch')) {
        message.error(`Camera proxy chưa chạy. Chạy: node camera-proxy.js`)
      } else {
        message.warning(`Camera "${cam.label}": ${err.message}`)
      }
    } finally {
      setCapturing((prev) => ({ ...prev, [cam.key]: false }))
    }
  }, [])

  async function captureAll() {
    const configured = cameras.filter((c) => c.config.ip)
    if (configured.length === 0) {
      message.warning('Chưa cấu hình camera nào. Nhấn ⚙️ để cài đặt.')
      return
    }
    await Promise.all(configured.map(captureSnapshot))
  }

  // ============================================================================
  // SAVE TO SUPABASE
  // ============================================================================

  async function saveSnapshot(cam: CameraSlot) {
    if (!ticketId) {
      message.warning('Tạo phiếu cân trước khi lưu ảnh')
      return
    }

    const snapshotUrl = snapshots[cam.key]
    if (!snapshotUrl) {
      message.warning('Chưa chụp ảnh')
      return
    }

    try {
      // If it's a blob URL, fetch and upload
      if (snapshotUrl.startsWith('blob:')) {
        const resp = await fetch(snapshotUrl)
        const blob = await resp.blob()
        const file = new File([blob], `${cam.key}_${Date.now()}.jpg`, { type: 'image/jpeg' })
        const img = await weighbridgeImageService.uploadImage(ticketId, file, cam.key)
        setSavedImages((prev) => ({ ...prev, [cam.key]: img.image_url }))
      } else {
        // Save external URL directly
        const img = await weighbridgeImageService.saveExternalUrl(ticketId, snapshotUrl, cam.key)
        setSavedImages((prev) => ({ ...prev, [cam.key]: img.image_url }))
      }

      const count = Object.keys(savedImages).length + 1
      onImageCountChange?.(count)
      message.success(`Đã lưu ảnh ${cam.label}`)
    } catch (err: any) {
      message.error(err?.message || 'Không thể lưu ảnh')
    }
  }

  /** Chụp tất cả + lưu tất cả vào Supabase (gọi từ bên ngoài qua ref) */
  async function captureAndSaveAll(label?: string) {
    const configured = cameras.filter((c) => c.config.ip)
    if (configured.length === 0 || !ticketId) return

    const tag = label || weighLabel || ''
    console.log(`📷 Auto capture & save ${configured.length} cameras [${tag}] for ticket ${ticketId}`)
    let savedCount = 0

    for (const cam of configured) {
      try {
        const url = getDahuaSnapshotUrl(cam.config)
        const resp = await fetch(url, { cache: 'no-store' })
        if (!resp.ok) {
          console.error(`📷 ${cam.label} HTTP ${resp.status}`)
          continue
        }
        const blob = await resp.blob()

        // Hiển thị preview
        const blobUrl = URL.createObjectURL(blob)
        setSnapshots((prev) => ({ ...prev, [cam.key]: blobUrl }))

        // Upload to Supabase — filename includes L1/L2 tag
        const fileName = tag
          ? `${cam.key}_${tag}_${Date.now()}.jpg`
          : `${cam.key}_${Date.now()}.jpg`
        const file = new File([blob], fileName, { type: 'image/jpeg' })

        // capture_type includes tag: e.g. "front" for manual, store tag in filename
        const img = await weighbridgeImageService.uploadImage(ticketId, file, cam.key as CaptureType)
        setSavedImages((prev) => ({ ...prev, [`${cam.key}_${tag}`]: img.image_url }))
        savedCount++
        console.log(`✅ ${cam.label} [${tag}] saved`)
      } catch (err) {
        console.error(`❌ ${cam.label} error:`, err)
      }
    }

    // Reload saved images
    if (savedCount > 0) {
      const imgs = await weighbridgeImageService.getByTicket(ticketId)
      const map: Record<string, string> = {}
      for (const img of imgs) map[`${img.capture_type}_${img.id}`] = img.image_url
      setSavedImages(map)
      onImageCountChange?.(imgs.length)
      message.success(`Đã lưu ${savedCount} ảnh [${tag || 'camera'}]`)
    }
  }

  // Expose captureAndSaveAll via ref
  useEffect(() => {
    if (captureRef) {
      captureRef.current = captureAndSaveAll
    }
  }, [captureRef, cameras, ticketId])

  async function saveAll() {
    const toSave = cameras.filter((c) => snapshots[c.key] && !savedImages[c.key])
    if (toSave.length === 0) {
      message.info('Không có ảnh mới để lưu')
      return
    }
    for (const cam of toSave) {
      await saveSnapshot(cam)
    }
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================

  function openSettings() {
    setSettingsTemp(cameras.map((c) => ({ ...c, config: { ...c.config } })))
    setShowSettings(true)
  }

  function saveSettings() {
    setCameras(settingsTemp)
    saveCameraConfig(settingsTemp)
    setShowSettings(false)
    message.success('Đã lưu cấu hình camera')
  }

  function updateSettingsTemp(index: number, field: keyof CameraConfig, value: string | number) {
    setSettingsTemp((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], config: { ...next[index].config, [field]: value } }
      return next
    })
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  const configuredCount = cameras.filter((c) => c.config.ip).length
  const savedCount = Object.keys(savedImages).length
  const snapshotCount = Object.keys(snapshots).length

  return (
    <Card
      size="small"
      title={
        <Space>
          <CameraOutlined />
          <Text strong>Camera ({savedCount}/{cameras.length} ảnh)</Text>
        </Space>
      }
      extra={
        <Space size={4}>
          <Tooltip title="Cài đặt camera">
            <Button type="text" size="small" icon={<SettingOutlined />} onClick={openSettings} />
          </Tooltip>
          <Tooltip title="Chụp tất cả">
            <Button
              type="text" size="small" icon={<CameraOutlined />}
              onClick={captureAll}
              disabled={disabled || configuredCount === 0}
            />
          </Tooltip>
          {snapshotCount > 0 && ticketId && (
            <Tooltip title="Lưu tất cả">
              <Button
                type="text" size="small" icon={<SaveOutlined />}
                onClick={saveAll}
                disabled={disabled}
              />
            </Tooltip>
          )}
        </Space>
      }
      style={{ borderRadius: 12 }}
    >
      {configuredCount === 0 ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <CameraOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
          <br />
          <Text type="secondary">Chưa cấu hình camera</Text>
          <br />
          <Button type="link" onClick={openSettings}>⚙️ Cài đặt IP camera</Button>
        </div>
      ) : (
        <Row gutter={[8, 8]}>
          {cameras.map((cam) => {
            const imgSrc = savedImages[cam.key] || snapshots[cam.key] || liveUrls[cam.key]
            const isSaved = !!savedImages[cam.key]
            const isCapturing = capturing[cam.key]

            return (
              <Col span={8} key={cam.key}>
                <div style={{ position: 'relative' }}>
                  {/* Camera label */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 4,
                  }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>{cam.label}</Text>
                    {isSaved && <Badge status="success" text={<Text type="secondary" style={{ fontSize: 10 }}>Đã lưu</Text>} />}
                  </div>

                  {/* Image display */}
                  <div style={{
                    width: '100%', height: 120, borderRadius: 8,
                    border: '1px solid #d9d9d9', overflow: 'hidden',
                    background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {imgSrc ? (
                      <Image
                        src={imgSrc}
                        alt={cam.label}
                        style={{ width: '100%', height: 120, objectFit: 'cover' }}
                        preview={{ mask: <EyeOutlined /> }}
                        fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiNjY2MiIGZvbnQtc2l6ZT0iMTIiPk5vIGltYWdlPC90ZXh0Pjwvc3ZnPg=="
                      />
                    ) : (
                      <CameraOutlined style={{ fontSize: 24, color: '#d9d9d9' }} />
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <Button
                      size="small" block
                      icon={<CameraOutlined />}
                      loading={isCapturing}
                      onClick={() => captureSnapshot(cam)}
                      disabled={disabled || !cam.config.ip}
                    >
                      Chụp
                    </Button>
                    {snapshots[cam.key] && ticketId && !isSaved && (
                      <Button
                        size="small"
                        icon={<SaveOutlined />}
                        onClick={() => saveSnapshot(cam)}
                        disabled={disabled}
                        type="primary"
                        style={{ background: '#16A34A', borderColor: '#16A34A' }}
                      >
                        Lưu
                      </Button>
                    )}
                  </div>
                </div>
              </Col>
            )
          })}
        </Row>
      )}

      {/* Chụp tất cả + Lưu tất cả */}
      {configuredCount > 0 && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <Button
            block icon={<CameraOutlined />}
            onClick={captureAll}
            disabled={disabled || configuredCount === 0}
          >
            Chụp tất cả
          </Button>
          {snapshotCount > 0 && ticketId && (
            <Button
              block icon={<SaveOutlined />}
              onClick={saveAll}
              disabled={disabled}
              type="primary"
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Lưu tất cả
            </Button>
          )}
        </div>
      )}

      {/* Settings Modal */}
      <Modal
        open={showSettings}
        title="⚙️ Cài đặt Camera Dahua"
        onCancel={() => setShowSettings(false)}
        onOk={saveSettings}
        okText="Lưu"
        cancelText="Hủy"
        width={600}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Nhập IP camera Dahua. URL snapshot: http://admin:pass@IP:port/cgi-bin/snapshot.cgi
          </Text>

          {settingsTemp.map((cam, idx) => (
            <Card key={cam.key} size="small" title={`📷 ${cam.label}`} style={{ borderRadius: 8 }}>
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>IP</Text>
                  <Input
                    value={cam.config.ip}
                    onChange={(e) => updateSettingsTemp(idx, 'ip', e.target.value)}
                    placeholder="192.168.1.64"
                  />
                </Col>
                <Col span={6}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Port</Text>
                  <Input
                    value={cam.config.port}
                    onChange={(e) => updateSettingsTemp(idx, 'port', e.target.value)}
                    placeholder="80"
                  />
                </Col>
                <Col span={6}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Channel</Text>
                  <Input
                    value={cam.config.channel}
                    onChange={(e) => updateSettingsTemp(idx, 'channel', parseInt(e.target.value) || 1)}
                    placeholder="1"
                  />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Username</Text>
                  <Input
                    value={cam.config.username}
                    onChange={(e) => updateSettingsTemp(idx, 'username', e.target.value)}
                    placeholder="admin"
                  />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Password</Text>
                  <Input.Password
                    value={cam.config.password}
                    onChange={(e) => updateSettingsTemp(idx, 'password', e.target.value)}
                    placeholder="Mật khẩu camera"
                  />
                </Col>
                {cam.config.ip && (
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 10, wordBreak: 'break-all' }}>
                      Camera: {getDahuaDirectUrl(cam.config)}
                    </Text>
                  </Col>
                )}
              </Row>
            </Card>
          ))}
        </Space>
      </Modal>
    </Card>
  )
}
