import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Button, Typography, Space, Input, InputNumber, Table, Popconfirm,
  message, Tag, Row, Col, Alert, Modal,
} from 'antd'
import {
  ArrowLeftOutlined, ExperimentOutlined, PlusOutlined, DeleteOutlined,
  EditOutlined, SaveOutlined, CloseOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import drcLookupService, { type DrcLookupRow } from '@erp/services/wms/drcLookupService'

const { Title, Text } = Typography
const PRIMARY = '#1B4D3E'

export default function DrcLookupAdminPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<DrcLookupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<number | null>(null)
  const [editDrc, setEditDrc] = useState<number | null>(null)
  const [editNotes, setEditNotes] = useState<string>('')
  const [filter, setFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newMetro, setNewMetro] = useState<number | null>(null)
  const [newDrc, setNewDrc] = useState<number | null>(null)
  const [testMetro, setTestMetro] = useState<number | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      drcLookupService.invalidateCache()
      const data = await drcLookupService.getAll(true)
      setRows(data)
    } catch (e: any) {
      message.error('Không tải được bảng: ' + (e.message || e))
    }
    setLoading(false)
  }

  function startEdit(row: DrcLookupRow) {
    setEditingKey(row.metrolac_reading)
    setEditDrc(row.drc_pct)
    setEditNotes(row.notes || '')
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditDrc(null)
    setEditNotes('')
  }

  async function saveEdit(row: DrcLookupRow) {
    if (editDrc == null || editDrc < 0 || editDrc > 100) {
      message.warning('DRC phải trong khoảng 0–100%')
      return
    }
    try {
      await drcLookupService.upsert({
        metrolac_reading: row.metrolac_reading,
        drc_pct: editDrc,
        notes: editNotes || null,
      })
      message.success(`Đã lưu Metrolac ${row.metrolac_reading} → ${editDrc}%`)
      cancelEdit()
      await load()
    } catch (e: any) {
      message.error('Lỗi lưu: ' + (e.message || e))
    }
  }

  async function handleDelete(metrolac: number) {
    try {
      await drcLookupService.remove(metrolac)
      message.success(`Đã xoá dòng Metrolac ${metrolac}`)
      await load()
    } catch (e: any) {
      message.error('Lỗi xoá: ' + (e.message || e))
    }
  }

  async function handleAdd() {
    if (newMetro == null || newDrc == null) {
      message.warning('Nhập đủ Metrolac + DRC')
      return
    }
    if (newMetro < 100 || newMetro > 400) {
      message.warning('Metrolac phải trong 100–400')
      return
    }
    if (newDrc < 0 || newDrc > 100) {
      message.warning('DRC phải trong 0–100')
      return
    }
    try {
      await drcLookupService.upsert({ metrolac_reading: newMetro, drc_pct: newDrc })
      message.success(`Đã thêm Metrolac ${newMetro} → ${newDrc}%`)
      setAddOpen(false)
      setNewMetro(null)
      setNewDrc(null)
      await load()
    } catch (e: any) {
      message.error('Lỗi thêm: ' + (e.message || e))
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim()
    if (!q) return rows
    const n = Number(q)
    if (!Number.isNaN(n)) {
      return rows.filter(r => r.metrolac_reading.toString().includes(q))
    }
    return rows.filter(r =>
      (r.notes || '').toLowerCase().includes(q.toLowerCase()) ||
      (r.source || '').toLowerCase().includes(q.toLowerCase())
    )
  }, [rows, filter])

  const testResult = useMemo(() => {
    if (testMetro == null) return null
    return drcLookupService.lookupSync(rows, testMetro)
  }, [testMetro, rows])

  // Detect outliers (slope chênh > 0.5% so với neighbor) để cảnh báo
  const outlierKeys = useMemo(() => {
    const out = new Set<number>()
    for (let i = 1; i < rows.length - 1; i++) {
      const prev = rows[i - 1]
      const cur = rows[i]
      const next = rows[i + 1]
      const expectedSlope = (next.drc_pct - prev.drc_pct) / Math.max(1, next.metrolac_reading - prev.metrolac_reading)
      const expectedDrc = prev.drc_pct + expectedSlope * (cur.metrolac_reading - prev.metrolac_reading)
      if (Math.abs(cur.drc_pct - expectedDrc) > 0.5) {
        out.add(cur.metrolac_reading)
      }
    }
    return out
  }, [rows])

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Header */}
      <div style={{ background: PRIMARY, padding: '12px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1000, margin: '0 auto' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/settings')} style={{ color: '#fff' }} />
          <div style={{ flex: 1 }}>
            <Title level={5} style={{ color: '#fff', margin: 0 }}>Bảng quy đổi DRC từ Metrolac (ĐỐT)</Title>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>QC có thể sửa trực tiếp — áp dụng ngay cho cân mới</Text>
          </div>
          <ExperimentOutlined style={{ color: '#fff', fontSize: 20 }} />
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>

          {/* Quick lookup test */}
          <Card
            title={<Space><SearchOutlined style={{ color: PRIMARY }} /> <Text strong>Tra cứu thử</Text></Space>}
            style={{ borderRadius: 12 }}
            size="small"
          >
            <Row gutter={12} align="middle">
              <Col xs={24} sm={10}>
                <Text type="secondary" style={{ fontSize: 12 }}>Nhập Metrolac (có thể số lẻ):</Text>
                <InputNumber
                  value={testMetro}
                  onChange={(v) => setTestMetro(typeof v === 'number' ? v : null)}
                  style={{ width: '100%' }}
                  placeholder="vd 230 hoặc 225.5"
                  min={100}
                  max={400}
                  step={0.5}
                />
              </Col>
              <Col xs={24} sm={14}>
                {testResult != null ? (
                  <div style={{
                    background: '#F0F9F4', border: '1px solid #b7eb8f',
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <Text style={{ fontSize: 13 }}>
                      Metrolac <strong>{testMetro}</strong> → DRC{' '}
                      <Text strong style={{ color: PRIMARY, fontSize: 18 }}>{testResult}%</Text>
                      {!Number.isInteger(testMetro ?? 0) && (
                        <Tag color="blue" style={{ marginLeft: 8 }}>nội suy linear</Tag>
                      )}
                    </Text>
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>Nhập số để xem kết quả</Text>
                )}
              </Col>
            </Row>
          </Card>

          {/* Outlier warning */}
          {outlierKeys.size > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`Phát hiện ${outlierKeys.size} dòng lệch trend (${[...outlierKeys].join(', ')})`}
              description="Các giá trị bôi vàng dưới đây lệch >0.5% so với xu hướng linear của neighbors. Hãy xác minh với QC/Quảng Trị — có thể là typo từ bảng gốc."
              style={{ borderRadius: 8 }}
            />
          )}

          {/* Main table */}
          <Card
            title={<Space><Text strong>{rows.length} dòng</Text></Space>}
            extra={
              <Space>
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="Lọc..."
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  style={{ width: 160 }}
                  allowClear
                  size="small"
                />
                <Button size="small" icon={<ReloadOutlined />} onClick={load}>Tải lại</Button>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}
                  style={{ background: PRIMARY, borderColor: PRIMARY }}>Thêm</Button>
              </Space>
            }
            style={{ borderRadius: 12 }}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={filtered}
              loading={loading}
              rowKey="metrolac_reading"
              size="small"
              pagination={{ pageSize: 30, showSizeChanger: false }}
              rowClassName={(r) => outlierKeys.has(r.metrolac_reading) ? 'drc-row-outlier' : ''}
              columns={[
                {
                  title: 'Metrolac (ĐỐT)',
                  dataIndex: 'metrolac_reading',
                  width: 140,
                  align: 'center',
                  render: (v) => <strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{v}</strong>,
                },
                {
                  title: 'DRC (%)',
                  dataIndex: 'drc_pct',
                  width: 160,
                  align: 'center',
                  render: (v, r) => {
                    if (editingKey === r.metrolac_reading) {
                      return (
                        <InputNumber
                          value={editDrc}
                          onChange={(n) => setEditDrc(typeof n === 'number' ? n : null)}
                          min={0}
                          max={100}
                          step={0.1}
                          size="small"
                          style={{ width: 100 }}
                          autoFocus
                        />
                      )
                    }
                    return (
                      <strong style={{ fontFamily: 'monospace', fontSize: 14, color: PRIMARY }}>
                        {Number(v).toFixed(2)}
                      </strong>
                    )
                  },
                },
                {
                  title: 'Ghi chú',
                  dataIndex: 'notes',
                  render: (v, r) => {
                    if (editingKey === r.metrolac_reading) {
                      return (
                        <Input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          size="small"
                          placeholder="Tùy chọn"
                        />
                      )
                    }
                    return v ? <Text type="warning" style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                  },
                },
                {
                  title: 'Hành động',
                  width: 140,
                  align: 'center',
                  render: (_, r) => {
                    if (editingKey === r.metrolac_reading) {
                      return (
                        <Space size={4}>
                          <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => saveEdit(r)}
                            style={{ background: PRIMARY, borderColor: PRIMARY }}>Lưu</Button>
                          <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit} />
                        </Space>
                      )
                    }
                    return (
                      <Space size={4}>
                        <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(r)}>Sửa</Button>
                        <Popconfirm
                          title={`Xoá dòng Metrolac ${r.metrolac_reading}?`}
                          onConfirm={() => handleDelete(r.metrolac_reading)}
                          okText="Xoá" cancelText="Không"
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    )
                  },
                },
              ]}
            />
          </Card>

          <div style={{ height: 24 }} />
        </Space>
      </div>

      {/* Add modal */}
      <Modal
        title="Thêm dòng mới"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAdd}
        okText="Lưu"
        cancelText="Hủy"
        okButtonProps={{ style: { background: PRIMARY, borderColor: PRIMARY } }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Metrolac (ĐỐT) — số nguyên 100–400</Text>
            <InputNumber value={newMetro} onChange={(v) => setNewMetro(typeof v === 'number' ? v : null)}
              style={{ width: '100%' }} min={100} max={400} placeholder="vd 275" />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>DRC (%) — 0–100, step 0.1</Text>
            <InputNumber value={newDrc} onChange={(v) => setNewDrc(typeof v === 'number' ? v : null)}
              style={{ width: '100%' }} min={0} max={100} step={0.1} placeholder="vd 50.7" />
          </div>
          {newMetro != null && rows.some(r => r.metrolac_reading === newMetro) && (
            <Alert type="warning" message={`Metrolac ${newMetro} đã có sẵn — sẽ GHI ĐÈ dòng cũ`} showIcon />
          )}
        </Space>
      </Modal>

      <style>{`
        .drc-row-outlier td { background: #FEF3C7 !important; }
        .drc-row-outlier:hover td { background: #FDE68A !important; }
      `}</style>
    </div>
  )
}
