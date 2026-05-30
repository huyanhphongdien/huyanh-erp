// ============================================================================
// PHIẾU CHỐT THÀNH PHẨM — Section phía NHÀ MÁY (ERP)
// File: src/components/b2b/CompletionCertSection.tsx
// Hiển thị trong tab Sản xuất của deal "Chạy đầu ra".
// Nhà máy: lập phiếu nháp → upload file → ký nhà máy → chờ đại lý ký trên Portal.
// ============================================================================
import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import {
  Card, Button, Modal, Descriptions, Tag, Space, Typography, message, Alert, Spin, Upload,
} from 'antd'
import { UploadOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { completionCertService, type CompletionCert } from '../../services/b2b/completionCertService'

const { Text } = Typography

interface Supervisor {
  id: string
  supervisor_name: string
  supervisor_phone: string | null
  status: string
  checked_in_at: string | null
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Nháp' },
  pending_partner: { color: 'processing', label: 'Chờ đại lý ký' },
  fully_signed: { color: 'success', label: 'Đã ký đủ 2 bên' },
}

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('vi-VN'))

export default function CompletionCertSection({ dealId }: { dealId: string }) {
  const employeeName = useAuthStore((s) => s.user?.full_name || 'Nhà máy')
  const [cert, setCert] = useState<CompletionCert | null>(null)
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [finishedKg, setFinishedKg] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [signOpen, setSignOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [c, sup, deal] = await Promise.all([
      completionCertService.getByDeal(dealId),
      supabase.schema('b2b').from('deal_supervisors')
        .select('id, supervisor_name, supervisor_phone, status, checked_in_at')
        .eq('deal_id', dealId).order('assigned_at', { ascending: false }),
      supabase.from('b2b_deals').select('finished_product_kg').eq('id', dealId).maybeSingle(),
    ])
    setCert(c)
    setSupervisors((sup.data as Supervisor[]) || [])
    setFinishedKg((deal.data as { finished_product_kg: number | null } | null)?.finished_product_kg ?? null)
    setLoading(false)
  }, [dealId])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    try {
      setBusy(true)
      await completionCertService.createDraft(dealId)
      message.success('Đã lập phiếu chốt thành phẩm (nháp)')
      load()
    } catch (e: any) {
      message.error(e.message || 'Lỗi lập phiếu')
    } finally { setBusy(false) }
  }

  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: '.pdf,.png,.jpg,.jpeg',
    customRequest: async (opt) => {
      if (!cert) return
      try {
        setBusy(true)
        const file = opt.file as File
        const { url, name } = await completionCertService.uploadFactoryFile(dealId, file)
        await completionCertService.attachFactoryFile(cert.id, url, name)
        message.success('Đã upload file phiếu')
        opt.onSuccess?.({} as any)
        load()
      } catch (e: any) {
        message.error(e.message || 'Lỗi upload')
        opt.onError?.(e)
      } finally { setBusy(false) }
    },
  }

  const handleFactorySign = async (dataUrl: string) => {
    if (!cert) return
    try {
      setBusy(true)
      const sigUrl = await completionCertService.uploadSignature(
        dataUrl, `factory_cert_${cert.id}_${Date.now()}.png`,
      )
      await completionCertService.factorySign(cert, employeeName, sigUrl)
      message.success('Đã ký nhà máy — đã gửi đại lý ký xác nhận')
      setSignOpen(false)
      load()
    } catch (e: any) {
      message.error(e.message || 'Lỗi ký')
    } finally { setBusy(false) }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>

  // Chưa có phiếu
  if (!cert) {
    const canCreate = !!finishedKg && finishedKg > 0
    return (
      <Card size="small" title={<><FileTextOutlined /> Phiếu chốt thành phẩm</>}>
        {canCreate ? (
          <Space direction="vertical">
            <Text type="secondary">Chưa lập phiếu chốt thành phẩm cho deal này.</Text>
            <Button type="primary" loading={busy} onClick={handleCreate}>Lập phiếu chốt thành phẩm</Button>
          </Space>
        ) : (
          <Alert type="info" showIcon message="Hoàn tất sản xuất (nhập KL thành phẩm) trước khi lập phiếu chốt." />
        )}
      </Card>
    )
  }

  const meta = STATUS_META[cert.status] || STATUS_META.draft

  return (
    <Card
      size="small"
      title={<><FileTextOutlined /> Phiếu chốt thành phẩm · {cert.cert_number}</>}
      extra={<Tag color={meta.color}>{meta.label}</Tag>}
    >
      <Descriptions bordered column={2} size="small" style={{ marginBottom: 12 }}>
        <Descriptions.Item label="KL nguyên liệu">{fmt(cert.quantity_kg)} kg</Descriptions.Item>
        <Descriptions.Item label="KL thành phẩm">{fmt(cert.finished_product_kg)} kg</Descriptions.Item>
        <Descriptions.Item label="Sample DRC">{cert.sample_drc ?? '—'}%</Descriptions.Item>
        <Descriptions.Item label="Actual DRC">{cert.actual_drc ?? '—'}%</Descriptions.Item>
        <Descriptions.Item label="Đơn giá">{fmt(cert.unit_price)} đ/kg</Descriptions.Item>
        <Descriptions.Item label="Giá trị cuối"><Text strong>{fmt(cert.final_value)} đ</Text></Descriptions.Item>
      </Descriptions>

      {/* Người giám sát đại lý */}
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary">Người giám sát đại lý: </Text>
        {supervisors.length === 0
          ? <Text type="secondary">Chưa cử</Text>
          : supervisors.map((s) => (
              <Tag key={s.id} color={s.checked_in_at ? 'green' : 'default'}>
                {s.supervisor_name}{s.supervisor_phone ? ` · ${s.supervisor_phone}` : ''}
                {s.checked_in_at ? ' ✓ có mặt' : ''}
              </Tag>
            ))}
      </div>

      {/* File phiếu */}
      <div style={{ marginBottom: 12 }}>
        {cert.factory_file_url ? (
          <Space>
            <a href={cert.factory_file_url} target="_blank" rel="noreferrer">
              <FileTextOutlined /> {cert.factory_file_name || 'Xem file phiếu'}
            </a>
            {cert.status === 'draft' && (
              <Upload {...uploadProps}><Button size="small" icon={<UploadOutlined />}>Thay file</Button></Upload>
            )}
          </Space>
        ) : (
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} loading={busy}>Upload file phiếu (PDF/ảnh)</Button>
          </Upload>
        )}
      </div>

      {/* Chữ ký 2 bên */}
      <SignatureRow cert={cert} />

      {/* Hành động ký nhà máy */}
      {cert.status === 'draft' && (
        <Button
          type="primary" icon={<EditOutlined />} style={{ marginTop: 12 }}
          disabled={!cert.factory_file_url}
          onClick={() => setSignOpen(true)}
        >
          Ký nhà máy & gửi đại lý
        </Button>
      )}
      {!cert.factory_file_url && cert.status === 'draft' && (
        <div style={{ marginTop: 8 }}><Text type="warning">Cần upload file phiếu trước khi ký.</Text></div>
      )}

      <SignatureModal
        open={signOpen}
        title="Ký xác nhận (Nhà máy)"
        onCancel={() => setSignOpen(false)}
        onConfirm={handleFactorySign}
        confirming={busy}
      />
    </Card>
  )
}

// ----------------------------------------------------------------------------
function SignatureRow({ cert }: { cert: CompletionCert }) {
  const box: CSSProperties = {
    flex: 1, border: '1px solid #f0f0f0', borderRadius: 6, padding: 8, minHeight: 90, textAlign: 'center',
  }
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={box}>
        <Text strong>Nhà máy</Text>
        {cert.factory_signature_url ? (
          <>
            <div><img src={cert.factory_signature_url} alt="ký nhà máy" style={{ maxHeight: 50 }} /></div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {cert.factory_signer_name} · {cert.factory_signed_at ? new Date(cert.factory_signed_at).toLocaleString('vi-VN') : ''}
            </Text>
          </>
        ) : <div><Text type="secondary">Chưa ký</Text></div>}
      </div>
      <div style={box}>
        <Text strong>Đại lý / Giám sát</Text>
        {cert.partner_signature_url ? (
          <>
            <div><img src={cert.partner_signature_url} alt="ký đại lý" style={{ maxHeight: 50 }} /></div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {cert.partner_signer_name} · {cert.partner_signed_at ? new Date(cert.partner_signed_at).toLocaleString('vi-VN') : ''}
            </Text>
          </>
        ) : <div><Text type="secondary">Chưa ký</Text></div>}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Modal canvas ký tay (mouse + touch)
export function SignatureModal({
  open, title, onCancel, onConfirm, confirming,
}: {
  open: boolean
  title: string
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
  confirming?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)

  const pos = (e: any) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    const p = 'touches' in e ? e.touches[0] : e
    return { x: p.clientX - r.left, y: p.clientY - r.top }
  }
  const start = (e: any) => { drawing.current = true; const ctx = canvasRef.current!.getContext('2d')!; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y) }
  const move = (e: any) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'
    ctx.lineTo(x, y); ctx.stroke(); hasInk.current = true
  }
  const end = () => { drawing.current = false }
  const clear = () => {
    const c = canvasRef.current; if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height); hasInk.current = false
  }

  return (
    <Modal
      open={open} title={title} onCancel={onCancel} okText="Xác nhận ký" confirmLoading={confirming}
      onOk={() => {
        if (!hasInk.current) { message.warning('Vui lòng ký vào ô bên dưới'); return }
        onConfirm(canvasRef.current!.toDataURL('image/png'))
      }}
      afterOpenChange={(o) => { if (o) clear() }}
    >
      <Text type="secondary">Ký bằng chuột hoặc cảm ứng:</Text>
      <canvas
        ref={canvasRef} width={448} height={160}
        style={{ border: '1px dashed #aaa', borderRadius: 6, width: '100%', touchAction: 'none', marginTop: 8 }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div style={{ marginTop: 8 }}><Button size="small" onClick={clear}>Xóa</Button></div>
    </Modal>
  )
}
