// ============================================================================
// HÀNG CHÈN — Phân công quy trình ký (30/10/2026, chủ DN):
//   Bước 1 KHAI BÁO = QS (nhập lô chèn, lấy, trả, ký) · Bước 2 DUYỆT QC · Bước 3 THỦ KHO NHẬN (tạm thời chủ DN)
// BGĐ (level ≤ 3) thêm / thu người; luật nằm ở DB (mix_signers, fn_mix_duoc_ky).
// File: src/pages/wms/raw/MixSignersPage.tsx · Route: /wms/chen/phan-cong
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Popconfirm, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { mixService, MIX_BUOC_LABELS, MIX_BUOC_MO_TA, type MixBuoc, type MixSigner, type NhanVienLite } from '../../../services/wms/mixService'
import { useMixRole } from '../../../hooks/useMixRole'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography
const BUOC: MixBuoc[] = ['khai_bao', 'duyet_qc', 'nhan_kho']

export default function MixSignersPage() {
  const role = useMixRole(null)
  const { data: facilities } = useActiveFacilities()
  const [rows, setRows] = useState<MixSigner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<Record<MixBuoc, string | undefined>>({ khai_bao: undefined, duyet_qc: undefined, nhan_kho: undefined })
  const [facPick, setFacPick] = useState<Record<MixBuoc, string | undefined>>({ khai_bao: undefined, duyet_qc: undefined, nhan_kho: undefined })
  const [opts, setOpts] = useState<NhanVienLite[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await mixService.listSigners()) }
    catch (e: any) { setError(e?.message || 'Không tải được phân công') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const search = async (q: string) => {
    try { setOpts(await mixService.timNhanVien(q)) } catch { setOpts([]) }
  }
  useEffect(() => { search('') }, [])

  const them = async (buoc: MixBuoc) => {
    const emp = pick[buoc]
    if (!emp) { message.warning('Chọn nhân viên'); return }
    setBusy(buoc)
    try {
      await mixService.grantSigner(emp, buoc, facPick[buoc] ?? null, 'Phân công trên màn Phân công')
      message.success(`Đã thêm vào bước ${MIX_BUOC_LABELS[buoc]}`)
      setPick((p) => ({ ...p, [buoc]: undefined })); await load(); role.refresh()
    } catch (e: any) { message.error(e?.message || 'Không thêm được (chỉ BGĐ thêm được)') }
    finally { setBusy(null) }
  }
  const thu = async (r: MixSigner) => {
    setBusy(r.id)
    try { await mixService.revokeSigner(r.id); message.success(`Đã thu quyền ${r.full_name}`); await load(); role.refresh() }
    catch (e: any) { message.error(e?.message || 'Không thu được') }
    finally { setBusy(null) }
  }

  const columns: ColumnsType<MixSigner> = [
    { title: 'Người', dataIndex: 'full_name', key: 'full_name', render: (v, r) => <span><Text strong>{v}</Text>{r.email ? <Text type="secondary"> · {r.email}</Text> : null}</span> },
    { title: 'Nhà máy', dataIndex: 'facility_code', key: 'facility_code', render: (v) => v || <Text type="secondary">mọi nhà máy</Text> },
    { title: 'Từ', dataIndex: 'granted_at', key: 'granted_at', render: (v) => new Date(v).toLocaleDateString('vi-VN') },
    { title: '', key: 'x', render: (_, r) => role.laBgd ? <Popconfirm title={`Thu quyền ${r.full_name}?`} okText="Thu" cancelText="Thôi" onConfirm={() => thu(r)}><Button size="small" danger loading={busy === r.id}>Thu</Button></Popconfirm> : null },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>Phân công quy trình hàng chèn</Title>
            <Text type="secondary">Bước 1 QS khai báo (nhập lô chèn, lấy đầu ca, trả cuối ca, ký) → Bước 2 QC duyệt → Bước 3 thủ kho nhận (trừ kho chèn, điền sổ ca). BGĐ cấp cao (level ≤ 3) làm được mọi bước mà không cần thêm tên.</Text>
          </Col>
          <Col><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button></Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} />}
        {!role.laBgd && !role.loading && <Alert type="warning" showIcon message="Chỉ Ban giám đốc mới thêm / thu người. Bạn đang xem." />}

        <Row gutter={[12, 12]}>
          {BUOC.map((b) => {
            const list = rows.filter((r) => r.buoc === b && r.is_active)
            return (
              <Col xs={24} lg={8} key={b}>
                <Card size="small" title={<Space>{MIX_BUOC_LABELS[b]}<Tag color={list.length ? 'green' : 'orange'}>{list.length ? `${list.length} người` : 'chưa phân công · dùng luật cũ'}</Tag></Space>}>
                  <Text type="secondary">{MIX_BUOC_MO_TA[b]}</Text>
                  <Table<MixSigner> rowKey="id" size="small" columns={columns} dataSource={list} pagination={false} style={{ marginTop: 10 }} locale={{ emptyText: 'Chưa có ai' }} />
                  {role.laBgd && (
                    <Space direction="vertical" style={{ width: '100%', marginTop: 10 }} size={6}>
                      <Select showSearch style={{ width: '100%' }} placeholder="Gõ tên nhân viên…" filterOption={false} onSearch={search} value={pick[b]} onChange={(v) => setPick((p) => ({ ...p, [b]: v }))}
                        options={opts.map((e) => ({ value: e.id, label: `${e.full_name}${e.email ? ' · ' + e.email : ''}` }))} />
                      <Space.Compact style={{ width: '100%' }}>
                        <Select style={{ flex: 1 }} allowClear placeholder="Mọi nhà máy" value={facPick[b]} onChange={(v) => setFacPick((p) => ({ ...p, [b]: v }))} options={(facilities ?? []).map((f) => ({ value: f.id, label: f.name || f.code }))} />
                        <Button type="primary" icon={<PlusOutlined />} loading={busy === b} onClick={() => them(b)}>Thêm</Button>
                      </Space.Compact>
                    </Space>
                  )}
                </Card>
              </Col>
            )
          })}
        </Row>
        <Alert type="info" showIcon message="Khi một bước chưa có ai được phân công, máy dùng luật cũ cho bước đó (khai báo: thủ kho / QC; duyệt QC: phòng HAP-QC hoặc người ký QC kho NVL; nhận: thủ kho NVL trong raw_store_keepers). Đã phân công thì chỉ người trong danh sách (và BGĐ) làm được." />
      </Space>
    </div>
  )
}
