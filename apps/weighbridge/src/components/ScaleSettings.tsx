import { useState } from 'react'
import { Modal, Select, Typography, Space, Tag, Descriptions, Button, InputNumber } from 'antd'
import { SettingOutlined, WifiOutlined, DisconnectOutlined } from '@ant-design/icons'
import type { UseKeliScaleReturn } from '@erp/hooks/useKeliScale'

const { Text } = Typography

// Keli scale models and their typical baud rates
const BAUD_RATES = [
  { value: 1200, label: '1200' },
  { value: 2400, label: '2400' },
  { value: 4800, label: '4800' },
  { value: 9600, label: '9600 (mặc định)' },
  { value: 19200, label: '19200' },
  { value: 38400, label: '38400' },
  { value: 57600, label: '57600' },
  { value: 115200, label: '115200' },
]

const PARITY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'even', label: 'Even' },
  { value: 'odd', label: 'Odd' },
]

const DATA_BITS_OPTIONS = [
  { value: 7, label: '7' },
  { value: 8, label: '8 (mặc định)' },
]

const STOP_BITS_OPTIONS = [
  { value: 1, label: '1 (mặc định)' },
  { value: 2, label: '2' },
]

const KELI_MODELS = [
  // Cân nhỏ (< 5T)
  { label: 'XK3118T (cân nhỏ ≤3T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'XK3118T1-A3 (Huy Anh ≤5T)', baudRate: 2400, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'XK3118K8 (Keli electronic ≤5T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'YH-T7 (cân điện tử ≤5T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  // Cân trung (5-30T)
  { label: 'D2008FA (cân sàn ≤30T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'D2008 (≤30T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'XK3190-A12 (≤30T)', baudRate: 2400, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'XK3190-A12E (≤30T)', baudRate: 4800, dataBits: 8, stopBits: 1, parity: 'none' },
  // Cân xe tải lớn (30-200T) ★
  { label: 'XK3190-A9 (cân xe tải ≤80T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'even' },
  { label: 'XK3190-A9+ (cân xe tải ≤150T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'even' },
  { label: 'XK3190-A9+L (cân xe ≤200T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'even' },
  { label: 'XK3190-DS3 (digital ≤150T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'XK3190-DS6 (digital ≤200T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'D2008FP (cân xe ≤100T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  { label: 'QS-D (truck scale ≤200T)', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'even' },
  // Tùy chỉnh
  { label: 'Tùy chỉnh (nhập tay)', baudRate: 0, dataBits: 8, stopBits: 1, parity: 'none' },
]

interface ScaleSettingsProps {
  scale: UseKeliScaleReturn
}

export default function ScaleSettings({ scale }: ScaleSettingsProps) {
  const [open, setOpen] = useState(false)

  function applyModel(model: typeof KELI_MODELS[0]) {
    if (model.baudRate > 0) {
      scale.setConfig({
        baudRate: model.baudRate,
        dataBits: model.dataBits as 7 | 8,
        stopBits: model.stopBits as 1 | 2,
        parity: model.parity as 'none' | 'even' | 'odd',
      })
    }
  }

  return (
    <>
      <Button
        type="text"
        size="small"
        icon={<SettingOutlined />}
        onClick={() => setOpen(true)}
        style={{ color: 'rgba(255,255,255,0.8)' }}
      />

      <Modal
        open={open}
        title="⚙️ Cài đặt đầu cân"
        onCancel={() => setOpen(false)}
        footer={null}
        width={500}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Connection status */}
          <div style={{ padding: 12, borderRadius: 8, background: scale.connected ? '#F0FDF4' : '#FEF2F2' }}>
            <Space>
              {scale.connected ? (
                <WifiOutlined style={{ color: '#16A34A', fontSize: 18 }} />
              ) : (
                <DisconnectOutlined style={{ color: '#DC2626', fontSize: 18 }} />
              )}
              <div>
                <Text strong>{scale.connected ? 'Đã kết nối' : 'Chưa kết nối'}</Text>
                {scale.connected && scale.liveWeight && (
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    Đang đọc: {scale.liveWeight.weight.toLocaleString()} {scale.liveWeight.unit}
                    {scale.liveWeight.stable ? ' ● Ổn định' : ' ○ Chưa ổn định'}
                  </Text>
                )}
              </div>
            </Space>
          </div>

          {/* Quick select model */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Chọn đời cân</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Chọn model cân..."
              onChange={(idx) => applyModel(KELI_MODELS[idx])}
              options={KELI_MODELS.map((m, i) => ({
                value: i,
                label: m.label + (m.baudRate ? ` — ${m.baudRate} baud` : ''),
              }))}
            />
          </div>

          {/* Manual config */}
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Baud Rate">
              <Select
                value={scale.config.baudRate}
                onChange={(v) => scale.setConfig({ baudRate: v })}
                options={BAUD_RATES}
                style={{ width: '100%' }}
                size="small"
              />
            </Descriptions.Item>
            <Descriptions.Item label="Data Bits">
              <Select
                value={scale.config.dataBits}
                onChange={(v) => scale.setConfig({ dataBits: v })}
                options={DATA_BITS_OPTIONS}
                style={{ width: '100%' }}
                size="small"
              />
            </Descriptions.Item>
            <Descriptions.Item label="Parity">
              <Select
                value={scale.config.parity}
                onChange={(v) => scale.setConfig({ parity: v })}
                options={PARITY_OPTIONS}
                style={{ width: '100%' }}
                size="small"
              />
            </Descriptions.Item>
            <Descriptions.Item label="Stop Bits">
              <Select
                value={scale.config.stopBits}
                onChange={(v) => scale.setConfig({ stopBits: v })}
                options={STOP_BITS_OPTIONS}
                style={{ width: '100%' }}
                size="small"
              />
            </Descriptions.Item>
          </Descriptions>

          {/* Connect / Disconnect button */}
          <div style={{ display: 'flex', gap: 8 }}>
            {scale.connected ? (
              <Button block danger onClick={() => scale.disconnect()}>
                Ngắt kết nối
              </Button>
            ) : (
              <Button
                block type="primary"
                onClick={() => { scale.connect(); setOpen(false) }}
                style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Kết nối cân (chọn cổng COM)
              </Button>
            )}
          </div>

          {/* Supported formats */}
          <div style={{ background: '#FAFAFA', padding: 12, borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <strong>Định dạng hỗ trợ:</strong><br />
              • Keli chuẩn: <Tag style={{ fontSize: 10 }}>ST,GS,+ 12345 kg</Tag><br />
              • Đơn giản: <Tag style={{ fontSize: 10 }}>+ 12345</Tag><br />
              • Số thuần: <Tag style={{ fontSize: 10 }}>12345.5</Tag><br />
              • Đơn vị: kg, t, lb, g<br />
              • Trạng thái: ST (ổn định), US (chưa ổn định), OL (quá tải)
            </Text>
          </div>

          {scale.error && (
            <Text type="danger" style={{ fontSize: 12 }}>{scale.error}</Text>
          )}
        </Space>
      </Modal>
    </>
  )
}
