// ============================================================================
// ĐỐI CHIẾU XUẤT KHO — lệnh điều xe ↔ sổ ca
// File: src/pages/wms/production/XuatKhoDoiChieuPage.tsx
// Route: /wms/production/xuat-kho
//
// Màn hình CHỈ ĐỌC. Nó không trừ kho, không ghi gì vào sổ ca.
//
// Việc nó làm: đặt hai con số cạnh nhau theo NGÀY — bao nhiêu bành rời nhà máy theo lệnh
// điều xe đã phát hành, và sổ ca ghi xuất bao nhiêu — rồi để chênh lệch tự lộ ra.
//
// ⚠ KHÔNG khoá theo ca, theo mã hàng, hay theo nhà máy. Lệnh điều xe không có ba chiều đó:
//   `dispatch_date` là kiểu DATE không giờ; không bảng nào trong chuỗi bán có `material_id`;
//   không có `facility_id` ở đâu cả. Gộp theo ngày là mức chi tiết CAO NHẤT mà dữ liệu
//   chịu được — chi tiết hơn là bịa. Xem `wms_m4_p1_doi_chieu_xuat_kho.sql`.
//
// ⚠ Cột "theo lệnh" dùng kg ĐỊNH MỨC (số bành × cỡ bành), không dùng cân thật. Tờ báo cáo
//   ca 27/8 ghi 45.360 kg = 1.296 × 35 trong khi cân thật là 45.180 — người ghi sổ chép
//   định mức, nên đối chiếu cũng phải dùng định mức.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Card, Table, Button, Space, Typography, Tag, Row, Col, Empty, Spin, Alert, Tooltip, message,
} from 'antd'
import { ReloadOutlined, WarningOutlined, TruckOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  xuatKhoDoiChieuService, type DoiChieuNgay, type XuatTheoLoai,
} from '../../../services/wms/xuatKhoDoiChieuService'

const { Title, Text } = Typography

const fmt = (n: number, d = 0) =>
  n.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function XuatKhoDoiChieuPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DoiChieuNgay[]>([])
  const [chiTiet, setChiTiet] = useState<Record<string, XuatTheoLoai[]>>({})

  const nap = async () => {
    setLoading(true)
    try {
      setRows(await xuatKhoDoiChieuService.getDoiChieu({ limit: 120 }))
    } catch (e) {
      message.error('Không đọc được số liệu: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void nap() }, [])

  const tong = useMemo(() => rows.reduce((a, r) => ({
    banhLenh: a.banhLenh + r.banhTheoLenh,
    kgLenh: a.kgLenh + r.kgTheoLenh,
    banhSoCa: a.banhSoCa + r.banhTheoSoCa,
    cont: a.cont + r.soContainer,
    canSua: a.canSua + r.coKgBatThuong + r.coLechSoBanh,
    chuaChot: a.chuaChot + r.coChuaChotGiao,
  }), { banhLenh: 0, kgLenh: 0, banhSoCa: 0, cont: 0, canSua: 0, chuaChot: 0 }), [rows])

  const chuaGhi = tong.banhLenh - tong.banhSoCa

  const moChiTiet = async (ngay: string) => {
    if (chiTiet[ngay]) return
    try {
      // Đợi xong RỒI mới cập nhật state — không await bên trong hàm cập nhật.
      const ct = await xuatKhoDoiChieuService.getChiTietNgay(ngay)
      setChiTiet((c) => ({ ...c, [ngay]: ct }))
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const cols = [
    {
      title: 'Ngày', dataIndex: 'ngay', width: 110,
      render: (v: string) => <Text strong>{dayjs(v).format('DD/MM/YYYY')}</Text>,
    },
    {
      title: 'Container', dataIndex: 'soContainer', width: 95, align: 'right' as const,
      render: (v: number) => v || <Text type="secondary">—</Text>,
    },
    {
      title: <Tooltip title="Số bành rời nhà máy theo lệnh điều xe đã phát hành (không tính lệnh nháp)">Theo lệnh xe</Tooltip>,
      dataIndex: 'banhTheoLenh', width: 130, align: 'right' as const,
      render: (v: number, r: DoiChieuNgay) => (
        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <Text strong>{fmt(v)} bành</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{fmt(r.kgTheoLenh, 2)} kg</Text>
        </Space>
      ),
    },
    {
      title: <Tooltip title="Số bành sổ ca ghi ở cột XUẤT, cộng mọi ca và mọi nhà máy trong ngày">Theo sổ ca</Tooltip>,
      dataIndex: 'banhTheoSoCa', width: 130, align: 'right' as const,
      render: (v: number, r: DoiChieuNgay) => r.soPhieuCa === 0
        ? <Text type="secondary">chưa có phiếu</Text>
        : (
          <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
            <Text strong>{fmt(v)} bành</Text>
            {/* kg của sổ ca: trước đây nạp lên rồi không bao giờ hiện. */}
            <Text type="secondary" style={{ fontSize: 12 }}>{fmt(r.kgTheoSoCa, 2)} kg</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.soPhieuCa} phiếu{r.soPhieuDaNhan < r.soPhieuCa ? ` · ${r.soPhieuDaNhan} đã nhận` : ''}
            </Text>
          </Space>
        ),
    },
    {
      title: 'Lệch', dataIndex: 'lechBanh', width: 110, align: 'right' as const,
      render: (v: number, r: DoiChieuNgay) => {
        if (r.soPhieuCa === 0) return <Text type="secondary">—</Text>
        if (v === 0) return <Tag color="green">khớp</Tag>
        return <Tag color={Math.abs(v) > 0 ? 'red' : 'default'}>{v > 0 ? '+' : ''}{fmt(v)} bành</Tag>
      },
    },
    {
      title: 'Cần xem lại', width: 220,
      render: (_: unknown, r: DoiChieuNgay) => {
        const c: React.ReactNode[] = []
        if (r.coKgBatThuong > 0) c.push(
          <Tooltip key="kg" title="Có dòng lệnh mà kg chia số bành không ra cỡ bành nào — dữ liệu sai">
            <Tag color="red">{r.coKgBatThuong} dòng kg lạ</Tag>
          </Tooltip>)
        if (r.coLechSoBanh > 0) c.push(
          <Tooltip key="banh" title="Số bành trên lệnh khác số bành ghi trên container">
            <Tag color="orange">{r.coLechSoBanh} lệch bành</Tag>
          </Tooltip>)
        if (r.coChuaChotGiao > 0) c.push(
          <Tooltip key="giao" title="Đã phát lệnh nhưng chưa chốt đã giao — thường do bỏ trống cân thật">
            <Tag color="gold">{r.coChuaChotGiao} chưa chốt giao</Tag>
          </Tooltip>)
        return c.length ? <Space size={4} wrap>{c}</Space> : <Text type="secondary">—</Text>
      },
    },
  ]

  return (
    <div style={{ padding: 16, maxWidth: 1280, margin: '0 auto' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }} gutter={[8, 8]}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Đối chiếu xuất kho</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Hàng rời nhà máy theo lệnh điều xe, đặt cạnh số sổ ca ghi xuất
          </Text>
        </Col>
        <Col><Button icon={<ReloadOutlined />} onClick={() => void nap()} /></Col>
      </Row>

      {chuaGhi > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message={`${fmt(chuaGhi)} bành đã rời nhà máy nhưng chưa được ghi xuất ở sổ ca`}
          description={
            'Sổ ca chỉ cộng hàng vào kho; chừng nào cột XUẤT chưa được ghi thì tồn kho chỉ '
            + 'tăng, không bao giờ giảm. Con số bên trái lấy từ lệnh điều xe đã phát hành — '
            + 'dùng để đối chiếu, phần mềm KHÔNG tự trừ kho.'
          }
        />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>ĐÃ RỜI NHÀ MÁY</Text>
            <div><Text strong style={{ fontSize: 22 }}>{fmt(tong.banhLenh)}</Text> <Text type="secondary">bành</Text></div>
            <Text type="secondary">{fmt(tong.kgLenh / 1000, 1)} tấn · {tong.cont} container</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>SỔ CA GHI XUẤT</Text>
            <div><Text strong style={{ fontSize: 22 }}>{fmt(tong.banhSoCa)}</Text> <Text type="secondary">bành</Text></div>
            <Text type="secondary">{tong.banhSoCa === 0 ? 'sổ ca chưa có dữ liệu' : 'cộng mọi ca, mọi nhà máy'}</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>DỮ LIỆU CẦN SỬA</Text>
            <div>
              <Text strong style={{ fontSize: 22, color: tong.canSua > 0 ? '#cf1322' : undefined }}>{tong.canSua}</Text>
              <Text type="secondary"> dòng lệnh</Text>
            </div>
            <Text type="secondary">kg lạ hoặc lệch số bành</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>CHƯA CHỐT ĐÃ GIAO</Text>
            <div>
              <Text strong style={{ fontSize: 22, color: tong.chuaChot > 0 ? '#d48806' : undefined }}>{tong.chuaChot}</Text>
              <Text type="secondary"> container</Text>
            </div>
            <Text type="secondary">đã phát lệnh, thiếu số cân thật</Text>
          </Card>
        </Col>
      </Row>

      <Card size="small">
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
        ) : rows.length === 0 ? (
          <Empty description="Chưa có lệnh điều xe nào" />
        ) : (
          <Table<DoiChieuNgay>
            rowKey="ngay" dataSource={rows} columns={cols}
            size="small" pagination={{ pageSize: 30, showSizeChanger: false }}
            scroll={{ x: 900 }}
            expandable={{
              onExpand: (mo, r) => { if (mo) void moChiTiet(r.ngay) },
              expandedRowRender: (r) => {
                const ct = chiTiet[r.ngay]
                if (!ct) return <Spin size="small" />
                return (
                  <Table<XuatTheoLoai>
                    rowKey="loaiHang" dataSource={ct} size="small" pagination={false}
                    columns={[
                      {
                        // ⚠ Đây là chữ ghi trên lệnh điều xe, KHÔNG phải mã hàng của danh mục.
                        //   Hệ thống chưa nối được hai bên — xem chú thích đầu file.
                        title: <Space><TruckOutlined /><span>Loại ghi trên lệnh</span></Space>,
                        dataIndex: 'loaiHang',
                        render: (v: string) => <Text code>{v}</Text>,
                      },
                      { title: 'Container', dataIndex: 'soContainer', width: 95, align: 'right' as const },
                      { title: 'Bành', dataIndex: 'soBanh', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
                      { title: 'Kg định mức', dataIndex: 'kgDinhMuc', width: 120, align: 'right' as const, render: (v: number) => fmt(v, 2) },
                      {
                        // Số cân thật: trước đây nạp lên rồi không hiện. Nó KHÁC định mức
                        // (27/8: định mức 45.360, cân thật 45.180) nên đáng để nhìn.
                        title: 'Kg cân thật', dataIndex: 'kgCanThat', width: 120, align: 'right' as const,
                        render: (v: number | null) => v === null || v === 0
                          ? <Text type="secondary">—</Text>
                          : <Text>{fmt(v, 2)}</Text>,
                      },
                      {
                        title: 'Kg/bành', dataIndex: 'kgMoiBanh', width: 110, align: 'right' as const,
                        render: (v: number | null, x: XuatTheoLoai) => v === null
                          ? <Text type="secondary">—</Text>
                          : x.soDongKgBatThuong > 0
                            ? <Tag color="red" icon={<WarningOutlined />}>{v}</Tag>
                            : <Text>{v}</Text>,
                      },
                    ]}
                  />
                )
              },
            }}
          />
        )}
      </Card>

      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
        Cột “theo lệnh xe” dùng khối lượng định mức (số bành × cỡ bành), không dùng số cân
        thật — đúng như cách người ghi sổ ca đang chép.
      </Text>
    </div>
  )
}
