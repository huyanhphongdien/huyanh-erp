import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Button, Typography, Space, Input, Select, InputNumber, Switch,
  Divider, message, Tag, Row, Col, Alert, Image,
} from 'antd'
import {
  ArrowLeftOutlined, SettingOutlined, WifiOutlined, DisconnectOutlined,
  CameraOutlined, PrinterOutlined, SaveOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, UserOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'

const { Title, Text } = Typography
const PRIMARY = '#1B4D3E'

// ============================================================================
// CONSTANTS
// ============================================================================

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]
const PARITY_OPTIONS = [
  { value: 'none', label: 'Không' },
  { value: 'even', label: 'Even' },
  { value: 'odd', label: 'Odd' },
]
const DATA_BITS = [7, 8]
const STOP_BITS = [1, 2]

const PAPER_OPTIONS = [
  { value: 'a4', label: 'A4 (210mm)' },
  { value: '80mm', label: 'Nhiệt 80mm (K200L)' },
  { value: '58mm', label: 'Nhiệt 58mm (XP-58)' },
]

const KELI_MODELS = [
  { label: 'XK3118T1-A3 (Huy Anh)', baudRate: 2400 },
  { label: 'D2008FA', baudRate: 9600 },
  { label: 'XK3190-A9', baudRate: 9600 },
  { label: 'XK3190-A12', baudRate: 2400 },
  { label: 'Tùy chỉnh', baudRate: 0 },
]

const DEFAULT_CAMERAS = [
  { key: 'front', label: 'Trước xe', ip: '', port: '80', username: 'admin', password: '', channel: 1 },
  { key: 'rear', label: 'Sau xe', ip: '', port: '80', username: 'admin', password: '', channel: 1 },
  { key: 'top', label: 'Trên cao', ip: '', port: '80', username: 'admin', password: '', channel: 1 },
]

const PROXY_PORT = 3456

// ============================================================================
// COMPONENT
// ============================================================================

export default function SettingsPage() {
  const navigate = useNavigate()
  const { operator } = useAuthStore()

  // ── Scale config ──
  const [scaleConfig, setScaleConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('keli_scale_config')
      return saved ? JSON.parse(saved) : { baudRate: 2400, dataBits: 8, stopBits: 1, parity: 'none' }
    } catch { return { baudRate: 2400, dataBits: 8, stopBits: 1, parity: 'none' } }
  })

  // ── Camera config ──
  const [cameras, setCameras] = useState(() => {
    try {
      const saved = localStorage.getItem('wb_camera_config')
      if (saved) {
        const parsed = JSON.parse(saved)
        return DEFAULT_CAMERAS.map(def => {
          const found = parsed.find((p: any) => p.key === def.key)
          const cfg = found?.config || {}
          return {
            key: def.key,
            label: def.label,
            config: {
              ip: cfg.ip || '',
              port: cfg.port || '80',
              username: cfg.username || 'admin',
              password: cfg.password || '',
              channel: cfg.channel || 1,
            }
          }
        })
      }
    } catch {}
    return DEFAULT_CAMERAS.map(c => ({
      key: c.key,
      label: c.label,
      config: { ip: c.ip, port: c.port, username: c.username, password: c.password, channel: c.channel }
    }))
  })

  // ── Print config ──
  const [paperSize, setPaperSize] = useState(() => localStorage.getItem('wb_paper_size') || 'a4')

  // ── Station config ──
  const [stationName, setStationName] = useState(() => localStorage.getItem('wb_station_name') || 'Trạm 1')

  // ── Proxy status ──
  const [proxyOnline, setProxyOnline] = useState<boolean | null>(null)
  const [testImages, setTestImages] = useState<Record<string, string>>({})

  // Check proxy
  useEffect(() => {
    checkProxy()
  }, [])

  async function checkProxy() {
    try {
      const resp = await fetch(`http://localhost:${PROXY_PORT}/health`, { signal: AbortSignal.timeout(3000) })
      setProxyOnline(resp.ok)
    } catch {
      setProxyOnline(false)
    }
  }

  // ── Save handlers ──
  function saveScaleConfig() {
    localStorage.setItem('keli_scale_config', JSON.stringify(scaleConfig))
    message.success('Đã lưu cấu hình cân')
  }

  function saveCameraConfig() {
    const toSave = cameras.map(c => ({ key: c.key, config: c.config }))
    localStorage.setItem('wb_camera_config', JSON.stringify(toSave))
    message.success('Đã lưu cấu hình camera')
  }

  function savePrintConfig() {
    localStorage.setItem('wb_paper_size', paperSize)
    message.success('Đã lưu cấu hình in')
  }

  function saveStationConfig() {
    localStorage.setItem('wb_station_name', stationName)
    message.success('Đã lưu thông tin trạm')
  }

  function updateCamera(index: number, field: string, value: any) {
    setCameras((prev: any[]) => {
      const next = [...prev]
      next[index] = { ...next[index], config: { ...next[index].config, [field]: value } }
      return next
    })
  }

  function selectModel(modelLabel: string) {
    const model = KELI_MODELS.find(m => m.label === modelLabel)
    if (model && model.baudRate > 0) {
      setScaleConfig((prev: any) => ({ ...prev, baudRate: model.baudRate }))
    }
  }

  async function testCamera(cam: any) {
    const c = cam.config || cam
    if (!c.ip) { message.warning('Chưa nhập IP'); return }
    try {
      const params = new URLSearchParams({
        ip: c.ip, port: c.port || '80', channel: String(c.channel || 1),
        user: c.username || 'admin', pass: c.password || '',
      })
      const resp = await fetch(`http://localhost:${PROXY_PORT}/snapshot?${params}`, { signal: AbortSignal.timeout(8000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      setTestImages(prev => ({ ...prev, [cam.key]: url }))
      message.success(`Camera "${cam.label}" OK`)
    } catch (err: any) {
      message.error(`Camera "${cam.label}": ${err.message}`)
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Header */}
      <div style={{ background: PRIMARY, padding: '12px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 900, margin: '0 auto' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }} />
          <div style={{ flex: 1 }}>
            <Title level={5} style={{ color: '#fff', margin: 0 }}>Cài đặt trạm cân</Title>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Cân, camera, máy in</Text>
          </div>
          <SettingOutlined style={{ color: '#fff', fontSize: 20 }} />
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>

          {/* ================================================================ */}
          {/* 1. CÂN ĐIỆN TỬ */}
          {/* ================================================================ */}
          <Card
            title={<Space><WifiOutlined style={{ color: PRIMARY }} /> <Text strong>Cân điện tử (Keli)</Text></Space>}
            extra={<Button type="primary" icon={<SaveOutlined />} onClick={saveScaleConfig} style={{ background: PRIMARY, borderColor: PRIMARY }}>Lưu</Button>}
            style={{ borderRadius: 12 }}
          >
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Chọn đời cân nhanh:</Text>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {KELI_MODELS.map(m => (
                  <Button
                    key={m.label}
                    size="small"
                    type={scaleConfig.baudRate === m.baudRate && m.baudRate > 0 ? 'primary' : 'default'}
                    onClick={() => selectModel(m.label)}
                    style={scaleConfig.baudRate === m.baudRate && m.baudRate > 0 ? { background: PRIMARY, borderColor: PRIMARY } : {}}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Baud Rate</Text>
                <Select
                  value={scaleConfig.baudRate}
                  onChange={v => setScaleConfig((p: any) => ({ ...p, baudRate: v }))}
                  options={BAUD_RATES.map(b => ({ value: b, label: `${b}` }))}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Data Bits</Text>
                <Select
                  value={scaleConfig.dataBits}
                  onChange={v => setScaleConfig((p: any) => ({ ...p, dataBits: v }))}
                  options={DATA_BITS.map(b => ({ value: b, label: `${b}${b === 8 ? ' (mặc định)' : ''}` }))}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Parity</Text>
                <Select
                  value={scaleConfig.parity}
                  onChange={v => setScaleConfig((p: any) => ({ ...p, parity: v }))}
                  options={PARITY_OPTIONS}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Stop Bits</Text>
                <Select
                  value={scaleConfig.stopBits}
                  onChange={v => setScaleConfig((p: any) => ({ ...p, stopBits: v }))}
                  options={STOP_BITS.map(b => ({ value: b, label: `${b}${b === 1 ? ' (mặc định)' : ''}` }))}
                  style={{ width: '100%' }}
                />
              </Col>
            </Row>

            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16, borderRadius: 8 }}
              message="Hướng dẫn kết nối"
              description={
                <div style={{ fontSize: 12 }}>
                  <div>1. Cắm cáp USB-to-RS232 từ đầu cân vào máy tính</div>
                  <div>2. Trên trang cân, nhấn <strong>"Kết nối cân"</strong> → chọn cổng COM</div>
                  <div>3. Nếu không đọc được → thử đổi Baud Rate (2400 hoặc 9600)</div>
                  <div>4. Dùng Chrome hoặc Edge (Web Serial API)</div>
                </div>
              }
            />
          </Card>

          {/* ================================================================ */}
          {/* 2. CAMERA IP (DAHUA) */}
          {/* ================================================================ */}
          <Card
            title={<Space><CameraOutlined style={{ color: PRIMARY }} /> <Text strong>Camera IP (Dahua)</Text></Space>}
            extra={
              <Space>
                <Tag color={proxyOnline ? 'success' : 'error'} icon={proxyOnline ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                  Proxy {proxyOnline ? 'online' : 'offline'}
                </Tag>
                <Button size="small" icon={<ReloadOutlined />} onClick={checkProxy}>Kiểm tra</Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={saveCameraConfig} style={{ background: PRIMARY, borderColor: PRIMARY }}>Lưu</Button>
              </Space>
            }
            style={{ borderRadius: 12 }}
          >
            {proxyOnline === false && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
                message="Camera Proxy chưa chạy"
                description={
                  <div style={{ fontSize: 12 }}>
                    <div>Chạy file <strong>camera-proxy.exe</strong> trên máy trạm cân.</div>
                    <div>Hoặc: <code>cd apps/weighbridge && node camera-proxy.cjs</code></div>
                    <div>Proxy cần chạy để chụp ảnh từ camera Dahua.</div>
                  </div>
                }
              />
            )}

            {cameras.map((cam: any, idx: number) => {
              const c = cam.config || cam
              return (
                <div key={cam.key} style={{ marginBottom: idx < cameras.length - 1 ? 16 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CameraOutlined />
                    <Text strong>{cam.label}</Text>
                    {testImages[cam.key] && <Tag color="success">Đã test OK</Tag>}
                  </div>
                  <Row gutter={[8, 8]}>
                    <Col xs={10}>
                      <Input
                        value={c.ip}
                        onChange={e => updateCamera(idx, 'ip', e.target.value)}
                        placeholder="192.168.1.176"
                        addonBefore="IP"
                        size="small"
                      />
                    </Col>
                    <Col xs={4}>
                      <Input
                        value={c.port}
                        onChange={e => updateCamera(idx, 'port', e.target.value)}
                        placeholder="80"
                        addonBefore="Port"
                        size="small"
                      />
                    </Col>
                    <Col xs={5}>
                      <Input
                        value={c.username}
                        onChange={e => updateCamera(idx, 'username', e.target.value)}
                        placeholder="admin"
                        addonBefore="User"
                        size="small"
                      />
                    </Col>
                    <Col xs={5}>
                      <Input.Password
                        value={c.password}
                        onChange={e => updateCamera(idx, 'password', e.target.value)}
                        placeholder="Mật khẩu"
                        size="small"
                      />
                    </Col>
                  </Row>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Button size="small" icon={<CameraOutlined />} onClick={() => testCamera(cam)} disabled={!c.ip || !proxyOnline}>
                      Test chụp
                    </Button>
                    {testImages[cam.key] && (
                      <Image src={testImages[cam.key]} height={60} style={{ borderRadius: 4, border: '1px solid #d9d9d9' }} />
                    )}
                  </div>
                  {idx < cameras.length - 1 && <Divider style={{ margin: '12px 0' }} />}
                </div>
              )
            })}
          </Card>

          {/* ================================================================ */}
          {/* 3. MÁY IN */}
          {/* ================================================================ */}
          <Card
            title={<Space><PrinterOutlined style={{ color: PRIMARY }} /> <Text strong>Máy in</Text></Space>}
            extra={<Button type="primary" icon={<SaveOutlined />} onClick={savePrintConfig} style={{ background: PRIMARY, borderColor: PRIMARY }}>Lưu</Button>}
            style={{ borderRadius: 12 }}
          >
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Khổ giấy mặc định khi in phiếu cân:</Text>
            <Select
              value={paperSize}
              onChange={setPaperSize}
              options={PAPER_OPTIONS}
              style={{ width: 250 }}
            />
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16, borderRadius: 8 }}
              message="Hướng dẫn in nhiệt"
              description={
                <div style={{ fontSize: 12 }}>
                  <div>1. Trong hộp thoại In → <strong>Lề: Không</strong></div>
                  <div>2. Bỏ tick <strong>"Đầu trang và chân trang"</strong></div>
                  <div>3. Máy XP K200L: chọn driver <strong>XP-80C</strong></div>
                  <div>4. Code page: <strong>27:(Vietnam)</strong></div>
                </div>
              }
            />
          </Card>

          {/* ================================================================ */}
          {/* 4. THÔNG TIN TRẠM */}
          {/* ================================================================ */}
          <Card
            title={<Space><UserOutlined style={{ color: PRIMARY }} /> <Text strong>Thông tin trạm cân</Text></Space>}
            extra={<Button type="primary" icon={<SaveOutlined />} onClick={saveStationConfig} style={{ background: PRIMARY, borderColor: PRIMARY }}>Lưu</Button>}
            style={{ borderRadius: 12 }}
          >
            <Row gutter={16}>
              <Col xs={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Tên trạm</Text>
                <Input value={stationName} onChange={e => setStationName(e.target.value)} placeholder="Trạm 1" />
              </Col>
              <Col xs={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Nhân viên cân hiện tại</Text>
                <Input value={operator?.name || '—'} disabled />
              </Col>
            </Row>
          </Card>

          {/* Bottom padding */}
          <div style={{ height: 24 }} />
        </Space>
      </div>
    </div>
  )
}
