// ============================================================================
// CÀI ĐẶT — đầu cân + khổ giấy
// File: apps/retail-scale/src/pages/SettingsPage.tsx
//
// KHÁC app cân xe ở 1 điểm quan trọng: SettingsPage của app cân xe ghi THẲNG vào
// localStorage 'keli_scale_config' với mặc định 2400 baud, không đi qua scale.setConfig()
// — trong khi PĐ/TL thực tế là 9600. Ai bấm "Lưu" ở đó là ghim sai baud cho lần sau.
// Ở đây LUÔN đi qua scale.setConfig() để hook và localStorage không bao giờ lệch nhau.
// ============================================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Button, Card, Col, Descriptions, InputNumber, Row, Segmented, Select, Space,
  Typography, message,
} from 'antd'
import { ApiOutlined, ArrowLeftOutlined, DisconnectOutlined, ReloadOutlined } from '@ant-design/icons'
import { useScale, SCALE_NAMESPACE } from '@/scale/ScaleProvider'
import { useCurrentFacility, getFacilityCode } from '@/stores/facilityStore'
import { fmtKg } from '@/lib/retail'

const { Text, Title } = Typography
const PRIMARY = '#1B4D3E'
const PAPER_KEY = 'rs_paper_size'

/** Cấu hình hay gặp ở cân bàn/cân sàn. Không ép sẵn cái nào — bấm "Kết nối" sẽ tự dò. */
const PRESETS = [
  { label: '9600 / 8 / None / 1', baudRate: 9600, dataBits: 8, parity: 'none' as const, stopBits: 1 },
  { label: '9600 / 8 / Even / 1', baudRate: 9600, dataBits: 8, parity: 'even' as const, stopBits: 1 },
  { label: '2400 / 8 / None / 1', baudRate: 2400, dataBits: 8, parity: 'none' as const, stopBits: 1 },
  { label: '4800 / 8 / None / 1', baudRate: 4800, dataBits: 8, parity: 'none' as const, stopBits: 1 },
  { label: '19200 / 8 / None / 1', baudRate: 19200, dataBits: 8, parity: 'none' as const, stopBits: 1 },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const scale = useScale()
  const { facility } = useCurrentFacility()
  const [paper, setPaper] = useState<string>(localStorage.getItem(PAPER_KEY) === 'a5' ? 'a5' : '80mm')

  function applyPreset(idx: number) {
    const p = PRESETS[idx]
    if (!p) return
    scale.setConfig({
      baudRate: p.baudRate,
      dataBits: p.dataBits,
      parity: p.parity,
      stopBits: p.stopBits,
      flowControl: 'none',
    })
    message.success(`Đã đặt ${p.label} — bấm "Kết nối cổng COM" để áp dụng`)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{ background: PRIMARY, padding: '10px 20px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }}>
            Về danh sách
          </Button>
          <Title level={5} style={{ color: '#fff', margin: 0 }}>Cài đặt</Title>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: 16 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {!scale.supported && (
            <Alert
              type="error" showIcon
              message="Trình duyệt không hỗ trợ Web Serial API"
              description="Đầu cân đọc trực tiếp qua cổng COM nên bắt buộc dùng Chrome hoặc Edge (bản 89 trở lên) trên máy tính Windows."
            />
          )}

          <Card size="small" title="Đầu cân (cân bàn / cân sàn)" style={{ borderRadius: 12 }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Trạng thái">
                <Text strong style={{ color: scale.connected ? '#15803D' : '#DC2626' }}>
                  {scale.connected ? '● Đã kết nối' : '○ Chưa kết nối'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Số hiện tại">
                <Text style={{ fontFamily: 'Consolas, monospace' }}>
                  {scale.liveWeight ? `${fmtKg(scale.liveWeight.weight)} kg` : '—'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Baud">{scale.config.baudRate}</Descriptions.Item>
              <Descriptions.Item label="Data/Parity/Stop">
                {scale.config.dataBits} / {scale.config.parity} / {scale.config.stopBits}
              </Descriptions.Item>
              <Descriptions.Item label="Nhà máy">
                {facility ? `${facility.name} (${facility.code})` : getFacilityCode()}
              </Descriptions.Item>
              <Descriptions.Item label="Khoá cấu hình">
                <Text type="secondary">
                  localStorage “{SCALE_NAMESPACE}_config” — riêng của app cân mủ lẻ
                </Text>
              </Descriptions.Item>
            </Descriptions>

            {scale.error && <Alert type="warning" showIcon message={scale.error} style={{ marginTop: 12 }} />}

            <Space wrap style={{ marginTop: 12 }}>
              <Button type="primary" icon={<ApiOutlined />} onClick={() => scale.connect()} style={{ background: PRIMARY, borderColor: PRIMARY }}>
                Kết nối cổng COM
              </Button>
              <Button icon={<DisconnectOutlined />} onClick={() => scale.disconnect()} disabled={!scale.connected}>
                Ngắt kết nối
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={async () => {
                  await scale.forgetSavedPort()
                  message.info('Đã quên cổng đã lưu — bấm "Kết nối cổng COM" để chọn lại')
                }}
              >
                Quên cổng đã lưu
              </Button>
            </Space>

            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                Bấm “Kết nối” là app TỰ DÒ thông số. Chỉ dùng danh sách dưới đây khi biết chắc
                thông số của đầu cân và muốn ép sẵn cho nhanh.
              </Text>
              <Row gutter={8}>
                <Col xs={24} sm={14}>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="Chọn thông số có sẵn..."
                    options={PRESETS.map((p, i) => ({ value: i, label: p.label }))}
                    onChange={applyPreset}
                  />
                </Col>
                <Col xs={12} sm={5}>
                  <InputNumber
                    style={{ width: '100%' }}
                    addonBefore="Baud"
                    value={scale.config.baudRate}
                    onChange={v => v && scale.setConfig({ baudRate: Number(v) })}
                  />
                </Col>
              </Row>
            </div>
          </Card>

          <Card size="small" title="Khổ phiếu in" style={{ borderRadius: 12 }}>
            <Segmented
              value={paper}
              onChange={v => {
                const val = String(v)
                setPaper(val)
                localStorage.setItem(PAPER_KEY, val)
                message.success('Đã lưu khổ giấy mặc định')
              }}
              options={[
                { label: 'Máy in nhiệt 80mm', value: '80mm' },
                { label: 'A5 (máy in thường)', value: 'a5' },
              ]}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              Khổ 80mm in vừa 1 dải giấy, chiều dài tự co theo số bao.
            </Text>
          </Card>

          <Card size="small" title="Quy trình chi tiền" style={{ borderRadius: 12 }}>
            <Text style={{ fontSize: 13 }}>
              App này CHỈ lập phiếu cân. Tiền được chi qua <b>Đề nghị thanh toán</b> trên ERP:
              kế toán vào <Text code>Mủ / Đề nghị thanh toán / Tạo mới</Text>, chọn đúng nhà máy,
              phiếu mủ lẻ sẽ hiện với nhãn <Text code>Mủ lẻ</Text> và đơn giá đã chốt tại cân
              (nhãn <Text code>Giá tại cân</Text>) — không phải gõ lại giá.
            </Text>
          </Card>
        </Space>
      </div>
    </div>
  )
}
