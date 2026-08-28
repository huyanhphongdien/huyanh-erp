// ============================================================================
// SỔ QC — HÀNG KHÔNG ĐẠT
// File: src/pages/wms/production/QCRejectPage.tsx
// Route: /wms/production/qc-reject
//
// Số hoá cuốn sổ in sẵn QC đang giữ. Tám cột, đúng thứ tự trên giấy:
//   Ngày SX · Ca làm việc · Số lô · Tình trạng · Lý do · Mã ng.liệu · Ghi chú ·
//   Tình trạng xử lý
//
// ⚠ Màn hình này KHÔNG đặt ở /wms/qc. Trang đó nằm trong nhóm menu "KHO (WMS)" có cờ
//   `executiveOnly` ⇒ 12 người Phòng QC — chính những người giữ cuốn sổ — không vào
//   được. Đặt sổ vào đấy là lặp lại đúng lỗi đã mắc một lần với Sổ ca ép bành.
//
// ⚠ Cột "Ca làm việc" của sổ QC ghi TÊN TỔ MÀU ('Vàng','Đen'), không phải số ca. Ô nhập
//   ở đây vì thế là chữ tự do — đừng biến nó thành danh sách chọn ca.
//
// ⚠ "Tình trạng xử lý" KHÔNG bắt buộc: trên tờ đọc được nó trống 13/13 dòng. Bắt nhập
//   một cột thực tế không ai điền là cách nhanh nhất để cả cuốn sổ bị bỏ.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Card, Table, Button, Space, Typography, Tag, Select, Row, Col, Empty, Spin,
  Modal, Form, Input, InputNumber, DatePicker, Segmented, AutoComplete, Popconfirm, message,
} from 'antd'
import { PlusOutlined, ReloadOutlined, WarningOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import {
  qcRejectService, TINH_TRANG_LABEL, TINH_TRANG_COLOR,
  type QCReject, type QCTinhTrang, type QCTheoLo,
} from '../../../services/wms/qcRejectService'
import { facilityService, type Facility } from '../../../services/wms/facilityService'
import { useAuthStore } from '../../../stores/authStore'

const { Title, Text } = Typography

/** '25.0 – 29.5' hoặc '30' hoặc '' — hiện đúng cái sổ ghi, không bịa thêm số. */
const dai = (min: number | null, max: number | null): string => {
  if (min === null && max === null) return ''
  if (min !== null && max !== null) return min === max ? String(min) : `${min} – ${max}`
  return String(min ?? max)
}

export default function QCRejectPage() {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [facilityId, setFacilityId] = useState<string | undefined>()
  const [rows, setRows] = useState<QCReject[]>([])
  const [theoLo, setTheoLo] = useState<QCTheoLo[]>([])
  const [goiYMa, setGoiYMa] = useState<string[]>([])

  const [moForm, setMoForm] = useState(false)
  const [dangSua, setDangSua] = useState<QCReject | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    facilityService.getAllActive()
      .then((fs) => { setFacilities(fs); setFacilityId((c) => c ?? fs[0]?.id) })
      .catch((e) => message.error('Không đọc được danh sách nhà máy: ' + (e as Error).message))
  }, [])

  const nap = async () => {
    if (!facilityId) return
    setLoading(true)
    try {
      const [rs, tl, gy] = await Promise.all([
        qcRejectService.list({ facilityId, limit: 300 }),
        qcRejectService.getTheoLo(facilityId),
        qcRejectService.goiYMaNguyenLieu().catch(() => []),
      ])
      setRows(rs)
      setTheoLo(tl)
      setGoiYMa(gy)
    } catch (e) {
      message.error('Không đọc được sổ: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void nap() }, [facilityId])

  // Kế thừa dấu nháy lặp do VIEW làm (`v_qc_reject_log`), không tính lại ở đây —
  // xem chú thích trong qcRejectService. Trang chỉ hiển thị.
  const hienThi = rows

  const soLoai = useMemo(() => rows.filter((r) => r.tinhTrang === 'LOAI').length, [rows])
  const soCXL = useMemo(() => rows.filter((r) => r.tinhTrang === 'CXL').length, [rows])

  const mo = (r?: QCReject) => {
    setDangSua(r ?? null)
    form.setFieldsValue(r
      ? { ...r, ngaySx: dayjs(r.ngaySx) }
      : {
          // Ngày mặc định hôm nay; tổ và mã nguyên liệu kế thừa dòng gần nhất — người
          // ghi sổ thường nhập nhiều dòng liền cho cùng một ca.
          ngaySx: dayjs(),
          tinhTrang: 'CXL' as QCTinhTrang,
          toSx: rows[0]?.toSx ?? undefined,
          maNguyenLieu: hienThi[0]?.maNguyenLieu ?? undefined,
        })
    setMoForm(true)
  }

  const luu = async () => {
    try {
      const v = await form.validateFields()
      const payload = {
        facilityId: facilityId ?? null,
        ngaySx: (v.ngaySx as Dayjs).format('YYYY-MM-DD'),
        toSx: v.toSx ?? null,
        soLo: v.soLo ?? null,
        tinhTrang: v.tinhTrang as QCTinhTrang,
        lyDo: v.lyDo ?? null,
        poMin: v.poMin ?? null,
        poMax: v.poMax ?? null,
        mvMin: v.mvMin ?? null,
        mvMax: v.mvMax ?? null,
        maNguyenLieu: v.maNguyenLieu ?? null,
        ghiChu: v.ghiChu ?? null,
        tinhTrangXuLy: v.tinhTrangXuLy ?? null,
      }
      if (dangSua) await qcRejectService.update(dangSua.id, payload)
      else await qcRejectService.create(payload, user?.employee_id ?? null)
      message.success(dangSua ? 'Đã sửa' : 'Đã ghi')
      setMoForm(false)
      await nap()
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return   // lỗi validate, form tự hiện
      message.error('Không lưu được: ' + (e as Error).message)
    }
  }

  const cols = [
    {
      title: 'Ngày SX', dataIndex: 'ngaySx', width: 105,
      render: (v: string) => <Text strong>{dayjs(v).format('DD/MM/YYYY')}</Text>,
    },
    {
      title: 'Ca làm việc', dataIndex: 'toSx', width: 100,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Số lô', dataIndex: 'soLo', width: 120,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Tình trạng', dataIndex: 'tinhTrang', width: 105,
      render: (v: QCTinhTrang) => <Tag color={TINH_TRANG_COLOR[v]}>{TINH_TRANG_LABEL[v]}</Tag>,
    },
    {
      title: 'Lý do', dataIndex: 'lyDo',
      render: (v: string | null, r: QCReject) => (
        <Space direction="vertical" size={0}>
          {v && <Text>{v}</Text>}
          <Space size={10}>
            {dai(r.poMin, r.poMax) && (
              <Text type="secondary" style={{ fontSize: 12 }}>Po {dai(r.poMin, r.poMax)}</Text>
            )}
            {dai(r.mvMin, r.mvMax) && (
              <Text type="secondary" style={{ fontSize: 12 }}>MV {dai(r.mvMin, r.mvMax)}</Text>
            )}
          </Space>
        </Space>
      ),
    },
    {
      // Mã suy từ dòng trên hiện MỜ — để người đọc phân biệt được số QC viết và số máy suy.
      title: 'Mã ng.liệu', dataIndex: 'maNguyenLieuHieuLuc', width: 130,
      render: (v: string | null, r: QCReject) => !v
        ? <Text type="secondary">—</Text>
        : r.maNguyenLieu
          ? <Text>{v}</Text>
          : <Text type="secondary" italic>{v}</Text>,
    },
    { title: 'Ghi chú', dataIndex: 'ghiChu', width: 150 },
    {
      title: 'Tình trạng xử lý', dataIndex: 'tinhTrangXuLy', width: 130,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '', width: 80, align: 'right' as const,
      render: (_: unknown, r: QCReject) => (
        <Space size={0}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => mo(r)} />
          <Popconfirm
            title="Xoá dòng này?" okText="Xoá" cancelText="Thôi" okButtonProps={{ danger: true }}
            onConfirm={async () => {
              try { await qcRejectService.remove(r.id); message.success('Đã xoá'); await nap() }
              catch (e) { message.error((e as Error).message) }
            }}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 16, maxWidth: 1280, margin: '0 auto' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }} gutter={[8, 8]}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Sổ hàng không đạt</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            QC ghi lô không đạt, lý do, và lô nguyên liệu đã làm ra nó
          </Text>
        </Col>
        <Col>
          <Space wrap>
            <Select
              value={facilityId} onChange={setFacilityId} style={{ minWidth: 180 }}
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void nap()} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => mo()}>Ghi dòng mới</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>CHỜ KẾT QUẢ LAB</Text>
            <div><Text strong style={{ fontSize: 24, color: soCXL > 0 ? '#d48806' : undefined }}>{soCXL}</Text> <Text type="secondary">lô</Text></div>
            <Text type="secondary" style={{ fontSize: 12 }}>chưa phân loại được</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>ĐÃ LOẠI</Text>
            <div><Text strong style={{ fontSize: 24, color: soLoai > 0 ? '#cf1322' : undefined }}>{soLoai}</Text> <Text type="secondary">lô</Text></div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>LÔ NGUYÊN LIỆU BỊ NHẮC TÊN NHIỀU NHẤT</Text>
            {theoLo.length === 0
              ? <div><Text type="secondary">chưa có</Text></div>
              : (
                <div>
                  <Text strong style={{ fontSize: 18 }}>{theoLo[0].maNguyenLieu}</Text>
                  <Text type="secondary"> · {theoLo[0].soLan} lần</Text>
                  {theoLo[0].poThapNhat !== null && (
                    <Text type="secondary"> · Po thấp nhất {theoLo[0].poThapNhat}</Text>
                  )}
                </div>
              )}
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
        ) : hienThi.length === 0 ? (
          <Empty description="Sổ chưa có dòng nào — bấm “Ghi dòng mới” để bắt đầu" />
        ) : (
          <Table<QCReject>
            rowKey="id" dataSource={hienThi} columns={cols}
            size="small" pagination={{ pageSize: 25, showSizeChanger: false }}
            scroll={{ x: 1100 }}
          />
        )}
      </Card>

      {theoLo.length > 0 && (
        <Card
          size="small"
          title={<Space><WarningOutlined /><span>Theo lô nguyên liệu</span></Space>}
          extra={<Text type="secondary" style={{ fontSize: 12 }}>lô nào hay sinh hàng không đạt</Text>}
        >
          <Table<QCTheoLo>
            rowKey="maNguyenLieu" dataSource={theoLo} size="small" pagination={false}
            scroll={{ x: 700 }}
            columns={[
              { title: 'Mã lô nguyên liệu', dataIndex: 'maNguyenLieu', width: 160, render: (v: string) => <Text strong>{v}</Text> },
              {
                title: 'Số lần', dataIndex: 'soLan', width: 130, align: 'right' as const,
                render: (v: number, r: QCTheoLo) => (
                  <Space size={4}>
                    <Text strong>{v}</Text>
                    {r.soLanKeThua > 0 && (
                      <Text type="secondary" style={{ fontSize: 11 }}>({r.soLanKeThua} suy)</Text>
                    )}
                  </Space>
                ),
              },
              { title: 'Đã loại', dataIndex: 'soLanLoai', width: 90, align: 'right' as const },
              { title: 'Chờ lab', dataIndex: 'soLanChoXuLy', width: 90, align: 'right' as const },
              {
                title: 'Po', width: 120, align: 'right' as const,
                render: (_: unknown, r: QCTheoLo) => dai(r.poThapNhat, r.poCaoNhat) || <Text type="secondary">—</Text>,
              },
              {
                title: 'Gần nhất', dataIndex: 'lanGanNhat', width: 110,
                render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '—',
              },
            ]}
          />
        </Card>
      )}

      {/* ── Ô nhập: đúng tám cột của tờ giấy, không thêm ô nào ─────────────── */}
      <Modal
        open={moForm} onCancel={() => setMoForm(false)} onOk={luu}
        title={dangSua ? 'Sửa dòng sổ' : 'Ghi dòng mới'}
        okText="Lưu" cancelText="Thôi" width={620}
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="ngaySx" label="Ngày SX" rules={[{ required: true, message: 'Chọn ngày' }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              {/* CHỮ TỰ DO — sổ QC ghi tên tổ màu, không ghi số ca. Xem chú thích đầu file. */}
              <Form.Item name="toSx" label="Ca làm việc" tooltip="Sổ QC ghi tên tổ (Vàng, Đen…)">
                <Input placeholder="Vàng / Đen" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="soLo" label="Số lô">
                <Input placeholder="S2325AB" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="tinhTrang" label="Tình trạng" rules={[{ required: true }]}>
            <Segmented
              options={[
                { label: TINH_TRANG_LABEL.CXL, value: 'CXL' },
                { label: TINH_TRANG_LABEL.LOAI, value: 'LOAI' },
              ]}
            />
          </Form.Item>

          <Form.Item name="lyDo" label="Lý do">
            <Input placeholder="Po thấp / MV thấp / …" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Po (đo được)" tooltip="Sổ thường ghi dải, ví dụ 25,0 – 29,5. Ghi một số thì để trống ô sau.">
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="poMin" noStyle><InputNumber placeholder="từ" step={0.5} style={{ width: '50%' }} /></Form.Item>
                  <Form.Item name="poMax" noStyle><InputNumber placeholder="đến" step={0.5} style={{ width: '50%' }} /></Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Mooney (MV)">
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="mvMin" noStyle><InputNumber placeholder="từ" step={0.5} style={{ width: '50%' }} /></Form.Item>
                  <Form.Item name="mvMax" noStyle><InputNumber placeholder="đến" step={0.5} style={{ width: '50%' }} /></Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              {/* Gợi ý từ mã đã gõ — để lô TMHG-26 không thành ba cách viết khác nhau. */}
              <Form.Item name="maNguyenLieu" label="Mã ng.liệu" tooltip="Mã lô bãi — sợi dây truy ngược về nguyên liệu">
                <AutoComplete
                  options={goiYMa.map((m) => ({ value: m }))}
                  placeholder="TMHG-26"
                  filterOption={(nhap, opt) => String(opt?.value ?? '').toLowerCase().includes(nhap.toLowerCase())}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ghiChu" label="Ghi chú">
                <Input placeholder="xuất chèn 22/8…" />
              </Form.Item>
            </Col>
          </Row>

          {/* KHÔNG bắt buộc — trên giấy trống 13/13 dòng. */}
          <Form.Item name="tinhTrangXuLy" label="Tình trạng xử lý" tooltip="Để trống nếu chưa xử lý">
            <Input placeholder="(để trống nếu chưa xử lý)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
