// ============================================================================
// HÀNG CHÈN — Chi tiết phiếu chèn: ảnh lấy / trả, ghi trả cuối ca, ký 3 bước (GĐ4)
// File: src/pages/wms/raw/MixIssueDetailPage.tsx · Route: /wms/chen/phieu/:id
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Checkbox, Col, Descriptions, Input, InputNumber, Modal, Row, Space, Steps, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import RawPhotoTiles from '../../../components/wms/RawPhotoTiles'
import { mixService, MIX_ISSUE_STATUS_COLORS, MIX_ISSUE_STATUS_LABELS, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, type MixIssue } from '../../../services/wms/mixService'
import { rawPhotoService, type RawPhoto } from '../../../services/wms/rawPhotoService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtDt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—')
const STEP_IDX: Record<MixIssue['status'], number> = { issued: 0, returned: 1, submitted: 2, qc_confirmed: 3, received: 4, cancelled: 0 }

export default function MixIssueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [issue, setIssue] = useState<MixIssue | null>(null)
  const [photosOut, setPhotosOut] = useState<RawPhoto[]>([])
  const [photosRet, setPhotosRet] = useState<RawPhoto[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kgReturn, setKgReturn] = useState<number | null>(null)
  const [handover, setHandover] = useState(false)
  const [retNote, setRetNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const rawRole = useRawRole(issue?.facility_id ?? null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const i = await mixService.getIssue(id)
      if (!i) { setError('Không tìm thấy phiếu chèn'); return }
      const [po, pr, s] = await Promise.all([rawPhotoService.list('mix_issue_out', i.id), rawPhotoService.list('mix_issue_return', i.id), rawSettingsService.getForFacility(i.facility_id)])
      setIssue(i); setPhotosOut(po); setPhotosRet(pr); setSettings(s)
      if (i.kg_return === null && kgReturn === null) setKgReturn(null)
    } catch (e: any) { setError(e?.message || 'Không tải được phiếu') }
    finally { setLoading(false) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const required = settings.anh_bat_buoc?.length ? settings.anh_bat_buoc : ['toan_canh', 'man_hinh_can']
  const canEditPhotos = !!issue && ['issued', 'returned'].includes(issue.status)
  const missOut = rawPhotoService.missing(photosOut, required)
  const missRet = rawPhotoService.missing(photosRet, required)

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try { const r: any = await fn(); message.success(ok); await load(); return r }
    catch (e: any) { message.error(e?.message || 'Thao tác thất bại') }
    finally { setBusy(null) }
  }

  const ghiTra = async () => {
    if (!issue || kgReturn === null) { message.warning('Nhập kg trả cuối ca (0 nếu dùng hết)'); return }
    await run('tra', () => mixService.tra(issue.id, kgReturn, handover, retNote.trim() || null), `Đã ghi trả ${fmtKg(kgReturn)} kg · tiêu hao ${fmtKg(issue.kg_out - kgReturn)} kg`)
  }

  const ky = async (buoc: 'submit' | 'qc_confirm' | 'receive') => {
    if (!issue) return
    const r = await run(buoc, () => mixService.ky(issue.id, buoc), buoc === 'receive' ? 'Thủ kho đã nhận — kho chèn và dòng CHÈN sổ ca đã cập nhật' : 'Đã ký')
    if (buoc === 'receive' && r?.next_issue_id) {
      Modal.info({ title: 'Đã tạo phiếu bàn giao cho ca sau', content: `Phần còn lại ${fmtKg(issue.kg_return)} kg vẫn ở dây chuyền, đã mở phiếu lấy mới cho ca kế.`, okText: 'Mở phiếu mới', onOk: () => navigate(`/wms/chen/phieu/${r.next_issue_id}`) })
    }
  }

  const huy = async () => {
    if (!issue) return
    setCancelOpen(false)
    await run('cancel', () => mixService.ky(issue.id, 'cancel', cancelReason.trim() || null), 'Đã hủy phiếu, kg lấy trả về tồn kho chèn')
  }

  if (error) return <div style={{ padding: 16 }}><Alert type="error" showIcon message={error} action={<Button onClick={() => navigate('/wms/chen')}>Về danh sách</Button>} /></div>
  if (!issue) return <div style={{ padding: 16 }}><Text type="secondary">Đang tải…</Text></div>

  const st = issue.status
  const isReceivedOrCancelled = st === 'received' || st === 'cancelled'
  const canSubmit = st === 'returned' && (rawRole.perms.submit || rawRole.isBGD)
  const canQc = st === 'submitted' && (rawRole.isQC || rawRole.isBGD)
  const canReceive = st === 'qc_confirmed' && (rawRole.isKeeper || rawRole.isBGD)

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/chen')} />
              <div>
                <Title level={3} style={{ margin: 0 }}><Text code style={{ fontSize: 20 }}>{issue.code}</Text> <Tag color={MIX_ISSUE_STATUS_COLORS[st]}>{MIX_ISSUE_STATUS_LABELS[st]}</Tag>{issue.handover_to_next && <Tag color="purple">bàn giao ca sau</Tag>}</Title>
                <Text type="secondary">Lô {issue.lot_code} · {MIX_SOURCE_LABELS[issue.source_type]}{issue.lot_grade ? ` · ${issue.lot_grade}` : ''} · {issue.source_desc || ''}</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              {!isReceivedOrCancelled && <Button danger icon={<CloseOutlined />} onClick={() => setCancelOpen(true)} loading={busy === 'cancel'}>Hủy phiếu</Button>}
            </Space>
          </Col>
        </Row>

        <Card size="small">
          <Steps size="small" current={STEP_IDX[st]} status={st === 'cancelled' ? 'error' : st === 'received' ? 'finish' : 'process'} items={[
            { title: 'Lấy đầu ca', description: `${fmtKg(issue.kg_out)} kg · ${fmtDt(issue.out_at)} · ${issue.out_name || ''}` },
            { title: 'Trả cuối ca', description: issue.kg_return === null ? 'chưa trả' : `${fmtKg(issue.kg_return)} kg · ${fmtDt(issue.return_at)} · ${issue.return_name || ''}` },
            { title: 'Bên giao ký', description: issue.submitted_at ? `${issue.submitted_name || ''} · ${fmtDt(issue.submitted_at)}` : '' },
            { title: 'QS xác nhận', description: issue.qc_confirmed_at ? `${issue.qc_confirmed_name || ''} · ${fmtDt(issue.qc_confirmed_at)}` : '' },
            { title: 'Thủ kho nhận', description: issue.received_at ? `${issue.received_name || ''} · ${fmtDt(issue.received_at)}` : '' },
          ]} />
        </Card>

        <Row gutter={[12, 12]}>
          <Col xs={24} lg={10}>
            <Card size="small" title="Thông tin ca">
              <Descriptions size="small" column={1} colon={false} labelStyle={{ color: '#6B7280', width: 130 }}>
                <Descriptions.Item label="Ngày · ca">{new Date(issue.shift_date).toLocaleDateString('vi-VN')}{issue.shift_name ? ` · ${issue.shift_name}` : ' · (chưa gắn ca)'}</Descriptions.Item>
                <Descriptions.Item label="Tổ">{issue.team || '—'}</Descriptions.Item>
                <Descriptions.Item label="Mục đích">{MIX_PURPOSE_LABELS[issue.purpose]}{issue.target_index ? ` · ${issue.target_index} → ${issue.target_value ?? ''}` : ''}</Descriptions.Item>
                <Descriptions.Item label="Lệnh SX">{issue.production_code || '—'}</Descriptions.Item>
                <Descriptions.Item label="Chỉ số lô">Po {issue.po ?? '—'} · Mooney {issue.mooney ?? '—'} · PRI {issue.pri ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Tiêu hao">
                  <Text strong style={{ fontSize: 18 }}>{fmtKg(issue.kg_used)} kg</Text>
                  {issue.kg_used !== null && <Text type="secondary"> = lấy {fmtKg(issue.kg_out)} − trả {fmtKg(issue.kg_return)}</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Ghi chú">{issue.note || '—'}</Descriptions.Item>
                {issue.cancel_reason && <Descriptions.Item label="Lý do hủy"><Text type="danger">{issue.cancel_reason}</Text></Descriptions.Item>}
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} lg={14}>
            <Card size="small" title={<Space>1 · Ảnh lúc lấy đầu ca{missOut.length ? <Tag color="red">thiếu {missOut.length} ảnh bắt buộc</Tag> : <Tag color="green">đủ</Tag>}</Space>}>
              <RawPhotoTiles refType="mix_issue_out" refId={issue.id} photos={photosOut} required={required} facilityCode={issue.facility_code || undefined} disabled={!canEditPhotos} onChange={load} size={120} />
            </Card>
            <Card size="small" style={{ marginTop: 12 }} title={<Space>2 · Trả cuối ca{issue.kg_return !== null && (missRet.length ? <Tag color="red">thiếu {missRet.length} ảnh bắt buộc</Tag> : <Tag color="green">đủ ảnh</Tag>)}</Space>}>
              {st === 'issued' ? (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Alert type="info" showIcon message="Cuối ca: cân phần còn lại, nhập kg trả (0 nếu dùng hết), chụp 2 ảnh rồi mới ký." />
                  <Row gutter={12}>
                    <Col span={10}><Text>Kg trả về kho *</Text><InputNumber style={{ width: '100%' }} min={0} max={issue.kg_out} step={10} value={kgReturn} onChange={(v) => setKgReturn(v === null || v === undefined ? null : Number(v))} onPressEnter={ghiTra} /></Col>
                    <Col span={14}><Text>Ghi chú</Text><Input value={retNote} onChange={(e) => setRetNote(e.target.value)} /></Col>
                  </Row>
                  {kgReturn !== null && <Text>Tiêu hao sẽ ghi: <Text strong>{fmtKg(issue.kg_out - kgReturn)} kg</Text></Text>}
                  {settings.chen_ban_giao_ca && <Checkbox checked={handover} onChange={(e) => setHandover(e.target.checked)}>Phần trả vẫn để ở dây chuyền, bàn giao cho ca sau (tự mở phiếu lấy mới khi thủ kho nhận)</Checkbox>}
                  <Button type="primary" icon={<CheckOutlined />} onClick={ghiTra} loading={busy === 'tra'} disabled={kgReturn === null}>Ghi trả cuối ca</Button>
                </Space>
              ) : (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Text>Trả <Text strong>{fmtKg(issue.kg_return)} kg</Text> lúc {fmtDt(issue.return_at)} · {issue.return_name || ''}{issue.handover_to_next ? ' · bàn giao ca sau' : ''}</Text>
                  {st === 'returned' && <Button size="small" onClick={() => run('sua', () => mixService.tra(issue.id, kgReturn ?? issue.kg_return ?? 0, handover || issue.handover_to_next, retNote.trim() || null), 'Đã cập nhật kg trả')} loading={busy === 'sua'} disabled={kgReturn === null}>Sửa kg trả (nhập ô dưới rồi bấm)</Button>}
                  {st === 'returned' && <InputNumber style={{ width: 200 }} min={0} max={issue.kg_out} step={10} value={kgReturn} placeholder={String(issue.kg_return ?? '')} onChange={(v) => setKgReturn(v === null || v === undefined ? null : Number(v))} />}
                  <RawPhotoTiles refType="mix_issue_return" refId={issue.id} photos={photosRet} required={required} facilityCode={issue.facility_code || undefined} disabled={!canEditPhotos} onChange={load} size={120} />
                </Space>
              )}
            </Card>
          </Col>
        </Row>

        {!isReceivedOrCancelled && (
          <Card size="small" title="3 · Ký phiếu">
            {issue.thieu_anh && st === 'returned' && <Alert type="error" showIcon style={{ marginBottom: 10 }} message={`Chưa ký được: thiếu ảnh ${issue.thieu_anh.replace('mix_issue_out:', 'lúc lấy · ').replace('mix_issue_return:', 'lúc trả · ').replace('toan_canh', 'toàn cảnh').replace('man_hinh_can', 'màn hình cân')}`} />}
            <Space wrap>
              <Button type="primary" disabled={!canSubmit || !!issue.thieu_anh} loading={busy === 'submit'} onClick={() => ky('submit')}>Bên giao ký (tổ / thủ kho)</Button>
              <Button type="primary" disabled={!canQc} loading={busy === 'qc_confirm'} onClick={() => ky('qc_confirm')}>QS xác nhận</Button>
              <Button type="primary" disabled={!canReceive} loading={busy === 'receive'} onClick={() => ky('receive')}>Thủ kho nhận · trừ kho chèn</Button>
            </Space>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                {st === 'issued' && 'Ghi trả cuối ca trước đã.'}
                {st === 'returned' && 'Bên giao (tổ sản xuất hoặc thủ kho) ký trước.'}
                {st === 'submitted' && (canQc ? 'Đến lượt QS.' : 'Chờ QS xác nhận (phòng HAP-QC hoặc người được chỉ định).')}
                {st === 'qc_confirmed' && (canReceive ? 'Đến lượt thủ kho nhận.' : 'Chờ thủ kho NVL nhận.')}
              </Text>
            </div>
          </Card>
        )}

        <Modal open={cancelOpen} title={`Hủy phiếu ${issue.code}`} onCancel={() => setCancelOpen(false)} onOk={huy} okText="Hủy phiếu" okButtonProps={{ danger: true }} cancelText="Không">
          <Text>Kg đã lấy sẽ trả lại tồn kho chèn. Ghi lý do:</Text>
          <Input.TextArea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ marginTop: 8 }} />
        </Modal>
      </Space>
    </div>
  )
}
