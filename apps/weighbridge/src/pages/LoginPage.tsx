import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Select, Input, Typography, Space, Alert, Spin } from 'antd'
import { LoginOutlined, LoadingOutlined } from '@ant-design/icons'
import { useAuthStore, type ScaleOperator } from '@/stores/authStore'

const { Title, Text } = Typography
const PRIMARY = '#1B4D3E'

export default function LoginPage() {
  const navigate = useNavigate()
  const { operator, login, getOperators, loading } = useAuthStore()

  const [operators, setOperators] = useState<ScaleOperator[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loadingOps, setLoadingOps] = useState(true)

  useEffect(() => {
    if (operator) {
      navigate('/', { replace: true })
      return
    }
    getOperators().then((ops) => {
      setOperators(ops)
      setLoadingOps(false)
    })
  }, [operator])

  async function handleLogin() {
    if (!selectedId) {
      setError('Chọn nhân viên cân')
      return
    }
    if (pin.length !== 4) {
      setError('Nhập mã PIN 4 số')
      return
    }
    setError('')
    const ok = await login(selectedId, pin)
    if (ok) {
      navigate('/', { replace: true })
    } else {
      setError('Mã PIN không đúng')
      setPin('')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${PRIMARY} 0%, #0D2B1F 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Card
        style={{ width: 400, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
        styles={{ body: { padding: 32 } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: PRIMARY,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <span style={{ fontSize: 28 }}>⚖️</span>
          </div>
          <Title level={3} style={{ margin: 0, color: PRIMARY }}>
            TRẠM CÂN
          </Title>
          <Text type="secondary">Cao su Huy Anh Phước</Text>
        </div>

        {loadingOps ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin indicator={<LoadingOutlined />} />
            <br />
            <Text type="secondary">Đang tải...</Text>
          </div>
        ) : operators.length === 0 ? (
          <Alert
            type="warning"
            message="Chưa có nhân viên cân"
            description="Liên hệ quản trị để tạo tài khoản nhân viên cân trong bảng scale_operators."
            showIcon
          />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Nhân viên cân
              </Text>
              <Select
                value={selectedId || undefined}
                onChange={(v) => { setSelectedId(v); setError('') }}
                placeholder="Chọn nhân viên..."
                size="large"
                style={{ width: '100%' }}
                options={operators.map((o) => ({
                  value: o.id,
                  label: `${o.name}${o.station ? ` (${o.station})` : ''}`,
                }))}
              />
            </div>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Mã PIN
              </Text>
              <Input.Password
                value={pin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                  setPin(v)
                  setError('')
                }}
                onPressEnter={handleLogin}
                placeholder="Nhập 4 số..."
                size="large"
                maxLength={4}
                style={{ letterSpacing: 12, textAlign: 'center', fontSize: 20 }}
              />
            </div>

            {error && <Alert type="error" message={error} showIcon />}

            <Button
              type="primary"
              size="large"
              block
              icon={<LoginOutlined />}
              loading={loading}
              onClick={handleLogin}
              disabled={!selectedId || pin.length !== 4}
              style={{ height: 48, background: PRIMARY, borderColor: PRIMARY }}
            >
              Đăng nhập
            </Button>
          </Space>
        )}
      </Card>
    </div>
  )
}
