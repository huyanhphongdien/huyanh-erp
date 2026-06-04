// ============================================================================
// LIVE CAMERA GRID — Xem 3 camera Dahua LIVE (MJPEG) liên tục trên app cân
// File: apps/weighbridge/src/components/LiveCameraGrid.tsx
//
// • Stream MJPEG qua camera-proxy (localhost:3456 /mjpg) — proxy lo Digest Auth.
// • Dùng CHUNG config với CameraPanel (localStorage key 'wb_camera_config'):
//   sửa IP/user/pass ở đâu cũng áp cho cả chụp ảnh phiếu lẫn xem live.
// • 3 cam: Trước / Sau / Trên (layout: 1 cam lớn + 2 cam nhỏ).
// ============================================================================
import { useState } from 'react'
import { Card, Button, Modal, Input, InputNumber, Typography, Row, Col, Tooltip, message } from 'antd'
import { SettingOutlined, ReloadOutlined, VideoCameraOutlined } from '@ant-design/icons'

const { Text } = Typography
const PROXY_PORT = 3456
const STORAGE_KEY = 'wb_camera_config'

interface CamConfig {
  ip: string
  port: string
  username: string
  password: string
  channel: number
}
interface CamSlot {
  key: 'front' | 'rear' | 'top'
  label: string
  config: CamConfig
}

const DEFAULT_CAMS: CamSlot[] = [
  { key: 'front', label: 'Trước', config: { ip: '', port: '80', username: 'admin', password: '', channel: 1 } },
  { key: 'rear', label: 'Sau', config: { ip: '', port: '80', username: 'admin', password: '', channel: 1 } },
  { key: 'top', label: 'Trên', config: { ip: '', port: '80', username: 'admin', password: '', channel: 1 } },
]

function loadCams(): CamSlot[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return DEFAULT_CAMS.map((def) => {
        const found = (parsed as any[]).find((p: any) => p.key === def.key)
        if (!found) return def
        const cfg = found.config || found
        return {
          ...def,
          config: {
            ip: cfg.ip || '',
            port: cfg.port || '80',
            username: cfg.username || 'admin',
            password: cfg.password || '',
            channel: cfg.channel || 1,
          },
        }
      })
    }
  } catch { /* ignore */ }
  return DEFAULT_CAMS
}

/** URL MJPEG live qua proxy (subtype=1 = sub-stream, nhẹ băng thông) */
function mjpgUrl(cfg: CamConfig, nonce: number): string {
  if (!cfg.ip) return ''
  const params = new URLSearchParams({
    ip: cfg.ip,
    port: cfg.port || '80',
    channel: String(cfg.channel || 1),
    user: cfg.username || 'admin',
    pass: cfg.password || '',
    subtype: '1',
    _: String(nonce),
  })
  return `http://localhost:${PROXY_PORT}/mjpg?${params.toString()}`
}

// ── 1 ô camera ──────────────────────────────────────────────────────────────
function CamCell({ cam, nonce, big, onZoom, heightPx }: { cam: CamSlot; nonce: number; big?: boolean; onZoom?: () => void; heightPx?: number }) {
  const [errored, setErrored] = useState(false)
  const url = mjpgUrl(cam.config, nonce)
  const configured = !!cam.config.ip

  return (
    <div
      onClick={configured && !errored && onZoom ? onZoom : undefined}
      style={{
        position: 'relative',
        width: '100%',
        ...(heightPx ? { height: heightPx } : { aspectRatio: '16 / 9' }),
        background: '#0a0a0a',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #1f2937',
        cursor: configured && !errored && onZoom ? 'zoom-in' : 'default',
      }}
    >
      {configured && !errored ? (
        <img
          key={url}
          src={url}
          alt={cam.label}
          onError={() => setErrored(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            color: '#6b7280', textAlign: 'center', padding: 8,
          }}
        >
          <VideoCameraOutlined style={{ fontSize: big ? 30 : 20 }} />
          <span style={{ fontSize: 11 }}>
            {configured ? '⚠ Mất kết nối / proxy chưa chạy' : 'Chưa cấu hình IP — bấm ⚙️'}
          </span>
        </div>
      )}

      {/* LIVE badge */}
      {configured && !errored && (
        <div
          style={{
            position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(0,0,0,.55)', padding: '1px 7px', borderRadius: 10,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>LIVE</span>
        </div>
      )}

      {/* Nhãn cam */}
      <div
        style={{
          position: 'absolute', bottom: 6, left: 6,
          background: 'rgba(0,0,0,.55)', color: '#fff',
          padding: '1px 8px', borderRadius: 6, fontSize: big ? 13 : 11, fontWeight: 600,
        }}
      >
        {cam.label}
      </div>
    </div>
  )
}

// ── Lưới 3 cam + settings ─────────────────────────────────────────────────────
export default function LiveCameraGrid({ facilityCode }: { facilityCode?: string }) {
  const [cams, setCams] = useState<CamSlot[]>(loadCams)
  const [nonce, setNonce] = useState(1)
  const [showSettings, setShowSettings] = useState(false)
  const [temp, setTemp] = useState<CamSlot[]>(cams)
  const [zoomKey, setZoomKey] = useState<CamSlot['key'] | null>(null)

  const openSettings = () => { setTemp(loadCams()); setShowSettings(true) }

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(temp))
    setCams(temp)
    setNonce((n) => n + 1)   // reconnect streams
    setShowSettings(false)
    message.success('Đã lưu cấu hình camera')
  }

  const updateTemp = (idx: number, patch: Partial<CamConfig>) => {
    setTemp((prev) => prev.map((c, i) => (i === idx ? { ...c, config: { ...c.config, ...patch } } : c)))
  }

  const [front, rear, top] = cams

  return (
    <Card
      size="small"
      title={<span style={{ fontSize: 13 }}>🎥 Camera trực tiếp{facilityCode ? ` · ${facilityCode}` : ''}</span>}
      style={{ borderRadius: 12 }}
      styles={{ body: { padding: 10 } }}
      extra={
        <span>
          <Tooltip title="Kết nối lại">
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => setNonce((n) => n + 1)} />
          </Tooltip>
          <Tooltip title="Cấu hình IP camera">
            <Button type="text" size="small" icon={<SettingOutlined />} onClick={openSettings} />
          </Tooltip>
        </span>
      }
    >
      {/* Cam Trước lớn */}
      <CamCell cam={front} nonce={nonce} big heightPx={172} onZoom={() => setZoomKey('front')} />
      {/* Cam Sau + Trên nhỏ */}
      <Row gutter={8} style={{ marginTop: 8 }}>
        <Col span={12}><CamCell cam={rear} nonce={nonce} heightPx={86} onZoom={() => setZoomKey('rear')} /></Col>
        <Col span={12}><CamCell cam={top} nonce={nonce} heightPx={86} onZoom={() => setZoomKey('top')} /></Col>
      </Row>

      <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 6 }}>
        Bấm 1 cam để phóng to. Cần <code>camera-proxy</code> chạy (localhost:{PROXY_PORT}), máy cân cùng LAN.
      </Text>

      {/* Phóng to 1 cam */}
      <Modal
        open={!!zoomKey}
        onCancel={() => setZoomKey(null)}
        footer={null}
        width={900}
        title={zoomKey ? `Camera ${cams.find((c) => c.key === zoomKey)?.label ?? ''}` : ''}
        destroyOnClose
      >
        {zoomKey && <CamCell cam={cams.find((c) => c.key === zoomKey)!} nonce={nonce} big />}
      </Modal>

      <Modal
        open={showSettings}
        title="Cấu hình 3 camera (Dahua)"
        onCancel={() => setShowSettings(false)}
        onOk={saveSettings}
        okText="Lưu"
        cancelText="Hủy"
        width={560}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          Nhập IP nội bộ + tài khoản của từng camera. Dùng chung cho cả xem live (MJPEG) lẫn chụp ảnh phiếu cân.
        </Text>
        {temp.map((c, idx) => (
          <div key={c.key} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: idx < 2 ? '1px solid #f0f0f0' : 'none' }}>
            <Text strong style={{ fontSize: 13 }}>Camera {c.label}</Text>
            <Row gutter={8} style={{ marginTop: 6 }}>
              <Col span={10}>
                <Text type="secondary" style={{ fontSize: 11 }}>IP</Text>
                <Input value={c.config.ip} placeholder="192.168.1.176"
                  onChange={(e) => updateTemp(idx, { ip: e.target.value.trim() })} />
              </Col>
              <Col span={6}>
                <Text type="secondary" style={{ fontSize: 11 }}>Port</Text>
                <Input value={c.config.port} placeholder="80"
                  onChange={(e) => updateTemp(idx, { port: e.target.value.trim() })} />
              </Col>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Kênh</Text>
                <InputNumber value={c.config.channel} min={1} max={32} style={{ width: '100%' }}
                  onChange={(v) => updateTemp(idx, { channel: typeof v === 'number' ? v : 1 })} />
              </Col>
            </Row>
            <Row gutter={8} style={{ marginTop: 6 }}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 11 }}>User</Text>
                <Input value={c.config.username} placeholder="admin"
                  onChange={(e) => updateTemp(idx, { username: e.target.value.trim() })} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 11 }}>Mật khẩu</Text>
                <Input.Password value={c.config.password} placeholder="••••••"
                  onChange={(e) => updateTemp(idx, { password: e.target.value })} />
              </Col>
            </Row>
          </div>
        ))}
      </Modal>
    </Card>
  )
}
